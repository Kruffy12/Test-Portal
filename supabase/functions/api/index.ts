// deno-lint-ignore-file no-explicit-any
/**
 * ServiCell Staff Portal — secure API (Supabase Edge Function "api").
 *
 * Every portal action goes through here. The browser only holds a session token; this function
 * resolves it to a staff account, checks the role, and fills in "who did it" itself — names sent
 * by the browser are ignored. It talks to the database with the service role, which the browser
 * never sees.
 *
 * Request body (sent as text/plain so the browser skips the CORS preflight):
 *   { session, action, id, data }            → one result
 *   { session, calls: [{ action, id, data }] } → { results: [...] }   (calls made at the same moment)
 *
 * Deploy with JWT verification off (the function checks its own sessions):
 *   supabase functions deploy api --no-verify-jwt
 */

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PUSH_WORKER_URL = Deno.env.get('SC_PUSH_WORKER_URL') ?? 'https://servicell-push.ericsonchee33.workers.dev';
const ALLOWED_ORIGINS = (Deno.env.get('SC_ALLOWED_ORIGINS') ??
  'https://servicellbze.github.io,https://kruffy12.github.io,http://127.0.0.1:5510,http://localhost:5510')
  .split(',').map((s) => s.trim()).filter(Boolean);
const MAINTENANCE = Deno.env.get('SC_MAINTENANCE') === '1';

const PHOTO_BUCKET = 'repair-photos';
const PHOTO_URL_PREFIX = `${SB_URL}/storage/v1/object/public/${PHOTO_BUCKET}/`;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_CALLS_PER_REQUEST = 25;

type Role = 'manager' | 'cashier' | 'technician';
interface Me { username: string; role: Role; displayName: string; tokenHash: string }
interface Ctx { me: Me | null; token: string; req: Request }

class Forbidden extends Error {}
function deny(message = 'Not allowed for your role'): never {
  throw new Forbidden(message);
}

// ─── Database (service role) ──────────────────────────────────────────────────────────────────

async function sbFetch(path: string, opts: { method?: string; body?: unknown; prefer?: string } = {}): Promise<any> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.prefer ? { Prefer: opts.prefer } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(`Database ${res.status}: ${err.message || err.hint || res.statusText}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const sbGet = (table: string, query = ''): Promise<any[]> => sbFetch(`${table}?${query}`);
const sbPost = (table: string, body: unknown, prefer = 'return=minimal') => sbFetch(table, { method: 'POST', body, prefer });
const sbPatch = (table: string, query: string, body: unknown) =>
  sbFetch(`${table}?${query}`, { method: 'PATCH', body, prefer: 'return=minimal' });
const sbDelete = (table: string, query: string) => sbFetch(`${table}?${query}`, { method: 'DELETE', prefer: 'return=minimal' });
const rpc = (fn: string, args: Record<string, unknown>) => sbFetch(`rpc/${fn}`, { method: 'POST', body: args });

function later(p: Promise<unknown>) {
  const safe = p.catch((e) => console.warn('[background]', e?.message || e));
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(safe);
}

// ─── Input helpers ────────────────────────────────────────────────────────────────────────────

const enc = encodeURIComponent;
function str(v: unknown, max = 5000): string {
  return v == null ? '' : String(v).slice(0, max);
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function toJobId(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error('Valid job ID is required');
  return n;
}
function flag(v: unknown): boolean {
  return v === true || v === '1' || v === 'true';
}
function parseJson(v: unknown, what: string): any {
  if (v && typeof v === 'object') return v;
  try {
    return JSON.parse(String(v));
  } catch {
    throw new Error(`Invalid ${what}`);
  }
}

const audit = (event: string, actor: string) =>
  sbPost('audit_log', { event, actor: actor.slice(0, 1000) }).catch((e) => console.warn('[Audit]', e.message));

// ─── Notifications + Web Push ─────────────────────────────────────────────────────────────────

const ROLE_TYPES: Record<Role, string[]> = {
  manager: ['received', 'ready', 'abandoned', 'jobstatus', 'specialorder', 'update', 'manageronly'],
  cashier: ['received', 'ready', 'abandoned', 'jobstatus', 'specialorder', 'update'],
  technician: ['received', 'ready', 'abandoned', 'jobstatus', 'specialorder', 'update'],
};

async function pushToSubscribers(type: string, title: string, body: string) {
  let subs = await sbGet('push_subscriptions', 'select=endpoint,p256dh,auth,username');
  if (type === 'manageronly') {
    const managers = new Set((await sbGet('users', 'role=eq.manager&select=username')).map((u) => u.username));
    subs = subs.filter((s) => managers.has(s.username));
  }
  await Promise.allSettled(subs.map((s) =>
    fetch(PUSH_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, title, body, type }),
    })
  ));
}

function notify(type: string, title: string, body: string) {
  later(sbPost('notifications', { type, title, body }).then(() => pushToSubscribers(type, title, body)));
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────────────────────

function normalizeImageUrl(item: unknown): string | null {
  const trimmed = String(item).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http')) return trimmed;
  return PHOTO_URL_PREFIX + enc(trimmed);
}

function mapJob(j: any) {
  return {
    id: j.id,
    customerName: j.customer_name,
    device: j.device,
    status: j.status,
    dateReceived: j.date_received,
    dateCompleted: j.date_completed,
    customerPhone: j.customer_phone,
    notes: j.notes,
    issue: j.issue,
    jobType: j.job_type,
    priority: j.priority,
    invoiceItems: j.invoice_items,
    payment: j.payment,
    payStatus: j.payment,
    technician: j.technician,
    estimatedCompletion: j.estimated_completion,
    inspection: j.inspection,
    inspectionImages: String(j.inspection_images || '').split(',').map(normalizeImageUrl).filter(Boolean),
    claimedBy: j.claimed_by,
    claimedAt: j.claimed_at,
    calledStatus: j.called_status,
    calledDate: j.called_date,
    calledBy: j.called_by,
    callNotes: j.call_notes,
    archived: j.archived,
    createdBy: j.created_by || '',
  };
}

async function mergeInspectionImages(jobs: any[]) {
  if (!jobs.length) return jobs;
  try {
    const imgRows = await sbGet('job_inspection_images', 'select=job_id,image_url');
    const byJob: Record<string, string[]> = {};
    for (const row of imgRows) {
      const url = normalizeImageUrl(row.image_url);
      if (!url) continue;
      (byJob[row.job_id] ||= []).includes(url) || byJob[row.job_id].push(url);
    }
    for (const job of jobs) {
      for (const url of byJob[job.id] || []) {
        if (!job.inspectionImages.includes(url)) job.inspectionImages.push(url);
      }
    }
  } catch (e: any) {
    console.warn('[Jobs] Could not merge job_inspection_images:', e.message);
  }
  return jobs;
}

/** Technicians can't change a job someone else has claimed; cashiers and managers can. */
async function loadJobForChange(me: Me, id: number, select = 'id,claimed_by') {
  const rows = await sbGet('jobs', `id=eq.${id}&select=${select}`);
  if (!rows.length) throw new Error('Job not found');
  const claimedBy = String(rows[0].claimed_by || '').trim();
  if (me.role === 'technician' && claimedBy && claimedBy !== me.username) {
    deny(`Claimed by ${claimedBy} — only they or a manager can change this job.`);
  }
  return rows[0];
}

const Jobs = {
  async list() {
    const rows = await sbGet('jobs', 'archived=eq.false&order=id.desc');
    return { jobs: await mergeInspectionImages(rows.map(mapJob)) };
  },

  async listArchived() {
    const rows = await sbGet('jobs', 'archived=eq.true&order=id.desc');
    return { jobs: await mergeInspectionImages(rows.map((j) => ({ ...mapJob(j), archived: true }))) };
  },

  async lastId() {
    const rows = await sbGet('jobs', 'select=id&order=id.desc&limit=1');
    return { lastId: rows.length ? rows[0].id : 100 };
  },

  async create(me: Me, data: any) {
    const id = toJobId(data.repairId || data.id);
    const taken = `Job #${id} already exists — refresh the page for the next available ID`;
    const existing = await sbGet('jobs', `id=eq.${id}&select=id&limit=1`);
    if (existing.length) return { success: false, error: taken };

    const customerName = str(data.customerName, 200);
    const device = str(data.device, 200);
    if (!customerName || !device) return { success: false, error: 'Customer name and device are required' };

    // The ticket's technician is whoever will do the repair, not whoever logged it at the desk.
    const technician = me.role === 'technician' || me.role === 'manager' ? me.username : 'Unassigned';
    const dateReceived = str(data.dateReceived, 40) ||
      new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });

    try {
      await sbPost('jobs', {
        id,
        customer_name: customerName,
        device,
        status: str(data.status, 40) || 'received',
        customer_phone: str(data.customerPhone, 60),
        notes: str(data.notes),
        issue: str(data.issue),
        job_type: str(data.jobType, 80),
        priority: str(data.priority, 20) || 'low',
        technician,
        estimated_completion: data.estimatedCompletion || null,
        inspection: str(data.inspection) || 'No damage noted',
        date_received: dateReceived,
        payment: str(data.payment, 40) || 'unpaid',
        created_by: me.username,
      });
    } catch (err: any) {
      const msg = err.message || 'Could not create job';
      if (/duplicate|23505|already exists/i.test(msg)) return { success: false, error: taken };
      return { success: false, error: msg.replace(/^Database \d+: /, '') };
    }

    later(Customers.save(customerName, str(data.customerPhone, 60)));
    later(audit('JOB_CREATE', `${me.username} | Job #${id} | ${device} | ${customerName}`));
    notify('received', '📦 New Job Received', `Job #${id} — ${device} for ${customerName}`);
    return { success: true };
  },

  async update(me: Me, idRaw: unknown, updates: any) {
    const id = toJobId(idRaw);
    await loadJobForChange(me, id);
    const map: Record<string, string> = {
      status: 'status',
      notes: 'notes',
      dateCompleted: 'date_completed',
      priority: 'priority',
      invoiceItems: 'invoice_items',
      payment: 'payment',
      payStatus: 'payment',
      estimatedCompletion: 'estimated_completion',
    };
    const patch: Record<string, unknown> = {};
    for (const [key, col] of Object.entries(map)) {
      if (updates[key] !== undefined) patch[col] = updates[key] || null;
    }
    if (!Object.keys(patch).length) return { success: true };
    patch.updated_at = new Date().toISOString();
    await sbPatch('jobs', `id=eq.${id}`, patch);

    if (updates.status !== undefined) later(audit('JOB_STATUS', `${me.username} | Job #${id} | ${str(updates.status, 40)}`));
    if (patch.payment !== undefined) later(audit('JOB_PAYMENT', `${me.username} | Job #${id} | ${str(patch.payment, 40)}`));

    if (updates.status === 'ready') {
      notify('ready', '✅ Device Ready for Pickup', `Job #${id} is ready for pickup.`);
    } else if (updates.status === 'abandoned') {
      notify('abandoned', '⚠️ Abandoned Device', `Job #${id} has been marked abandoned.`);
    } else if (updates.status) {
      notify('jobstatus', '🔧 Job Status Updated', `Job #${id} is now: ${str(updates.status, 40)}.`);
    }
    return { success: true };
  },

  /** Only whoever created or claimed the job, or a manager, can delete it. Every delete is logged. */
  async delete(me: Me, idRaw: unknown) {
    const id = toJobId(idRaw);
    const rows = await sbGet('jobs', `id=eq.${id}&select=id,created_by,claimed_by,customer_name,device,status`);
    if (!rows.length) return { success: false, error: 'Job not found' };
    const j = rows[0];
    const mine = (j.created_by && j.created_by === me.username) || (j.claimed_by && String(j.claimed_by).trim() === me.username);
    if (me.role !== 'manager' && !mine) {
      deny('Only the person who created or claimed this job, or a manager, can delete it.');
    }
    await sbDelete('jobs', `id=eq.${id}`);
    await audit('JOB_DELETE', `${me.username} | Job #${id} | ${j.customer_name} | ${j.device} | was ${j.status}`);
    return { success: true };
  },

  async archiveOld() {
    const resolvedCutoff = new Date(Date.now() - 60 * 86400000).toISOString();
    const abandonedCutoff = new Date(Date.now() - 180 * 86400000).toISOString();
    await sbPatch('jobs', `status=eq.resolved&date_completed=lt.${resolvedCutoff}&archived=eq.false`, { archived: true });
    await sbPatch('jobs', `status=eq.abandoned&date_completed=lt.${abandonedCutoff}&archived=eq.false`, { archived: true });
    return { success: true };
  },

  async claim(me: Me, idRaw: unknown) {
    const id = toJobId(idRaw);
    if (me.role !== 'manager' && me.role !== 'technician') {
      return { success: false, error: 'Only managers and technicians can claim jobs' };
    }
    const rows = await sbGet('jobs', `id=eq.${id}&select=claimed_by,status`);
    if (!rows.length) return { success: false, error: 'Job not found' };
    const job = rows[0];
    if (job.claimed_by && me.role !== 'manager') return { success: false, error: `Job already claimed by ${job.claimed_by}` };

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { claimed_by: me.username, claimed_at: now };
    if (job.status === 'received') patch.status = 'fixing';
    await sbPatch('jobs', `id=eq.${id}`, patch);
    await audit('JOB_CLAIM', `${me.username} | Job #${id}`);
    return { success: true, claimedBy: me.username, claimedAt: now };
  },

  async unclaim(me: Me, idRaw: unknown) {
    const id = toJobId(idRaw);
    const rows = await sbGet('jobs', `id=eq.${id}&select=claimed_by`);
    if (!rows.length) return { success: false, error: 'Job not found' };
    const claimedBy = String(rows[0].claimed_by || '').trim();
    if (me.role !== 'manager' && claimedBy && claimedBy !== me.username) {
      deny(`Claimed by ${claimedBy} — only they or a manager can release it.`);
    }
    await sbPatch('jobs', `id=eq.${id}`, { claimed_by: null, claimed_at: null });
    await audit('JOB_UNCLAIM', `${me.username} | Job #${id}`);
    return { success: true };
  },

  async markCalled(me: Me, idRaw: unknown, callNotes: unknown) {
    const id = toJobId(idRaw);
    const rows = await sbGet('jobs', `id=eq.${id}&select=status`);
    if (!rows.length) return { success: false, error: 'Job not found' };
    if (rows[0].status !== 'ready') return { success: false, error: 'Can only mark ready jobs as called' };
    const now = new Date().toISOString();
    await sbPatch('jobs', `id=eq.${id}`, {
      called_status: 'called',
      called_date: now,
      called_by: me.username,
      call_notes: str(callNotes, 1000),
    });
    await audit('CUSTOMER_CALLED', `${me.username} | Job #${id}`);
    return { success: true, calledStatus: 'called', calledDate: now, calledBy: me.username };
  },

  /** Only links to photos in the portal's own bucket can be attached. */
  async addImage(me: Me, idRaw: unknown, urlRaw: unknown) {
    const id = toJobId(idRaw);
    const url = str(urlRaw, 1000).trim();
    if (!url.startsWith(PHOTO_URL_PREFIX)) return { success: false, error: 'Photo must be uploaded through the portal' };
    await loadJobForChange(me, id);
    await rpc('sc_append_job_image', { p_job_id: id, p_url: url });
    return { success: true, url };
  },

  async removeImage(me: Me, idRaw: unknown, urlRaw: unknown) {
    const id = toJobId(idRaw);
    const url = str(urlRaw, 1000).trim();
    if (!url) return { success: false, error: 'imageUrl required' };
    await loadJobForChange(me, id);
    await rpc('sc_remove_job_image', { p_job_id: id, p_url: url });
    await audit('PHOTO_REMOVE', `${me.username} | Job #${id} | ${url.split('/').pop()}`);
    return { success: true };
  },

  async uploadPhoto(me: Me, data: any) {
    const id = toJobId(data.repairId || data.id);
    await loadJobForChange(me, id);

    const b64 = str(data.image, 8 * 1024 * 1024).replace(/^data:image\/\w+;base64,/, '');
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    } catch {
      return { success: false, error: 'Invalid image data' };
    }
    if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) return { success: false, error: 'Photo is too large' };
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return { success: false, error: 'Photo must be a JPEG' };

    const stage = /^[a-z0-9-]{1,30}$/.test(str(data.stage, 40)) ? str(data.stage, 40) : 'photo';
    const fileName = `job-${id}-${stage}-${Date.now()}.jpg`;
    const res = await fetch(`${SB_URL}/storage/v1/object/${PHOTO_BUCKET}/${fileName}`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'false' },
      body: bytes,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.message || err.error || `Storage upload failed (${res.status})` };
    }
    const url = PHOTO_URL_PREFIX + fileName;
    await rpc('sc_append_job_image', { p_job_id: id, p_url: url });
    await audit('PHOTO_UPLOAD', `${me.username} | Job #${id} | ${fileName}`);
    return { success: true, url };
  },
};

// ─── Special orders ───────────────────────────────────────────────────────────────────────────

const SpecialOrders = {
  async list() {
    const rows = await sbGet('special_orders', 'order=date_requested.desc');
    return {
      orders: rows.map((o) => ({
        orderNumber: o.order_number,
        customer: o.customer,
        dateRequested: o.date_requested,
        item: o.item,
        quantity: o.quantity,
        status: o.status,
        notes: o.notes,
        updatedBy: o.updated_by,
        dateUpdated: o.date_updated,
        phone: o.phone,
        requestedBy: o.requested_by,
      })),
    };
  },

  async create(me: Me, data: any) {
    const item = str(data.item, 300);
    if (!item) return { success: false, error: 'Item is required' };
    const orderNumber = await rpc('sc_create_special_order', {
      p_customer: str(data.customer, 200),
      p_item: item,
      p_quantity: Math.max(1, Math.floor(num(data.quantity)) || 1),
      p_notes: str(data.notes),
      p_phone: str(data.phone, 60),
      p_requested_by: me.username,
    });
    notify('specialorder', '🛒 New Special Order', `${me.username} requested: ${item}`);
    return { success: true, orderNumber, status: 'Pending', dateRequested: new Date().toISOString() };
  },

  async update(me: Me, id: unknown, data: any) {
    const orderNumber = str(id, 40);
    if (!orderNumber) return { success: false, error: 'Order number required' };
    const patch: Record<string, unknown> = { updated_by: me.username, date_updated: new Date().toISOString() };
    if (data.customer !== undefined) patch.customer = str(data.customer, 200);
    if (data.item !== undefined) patch.item = str(data.item, 300);
    if (data.quantity !== undefined) patch.quantity = Math.max(1, Math.floor(num(data.quantity)) || 1);
    if (data.status !== undefined) patch.status = str(data.status, 40);
    if (data.notes !== undefined) patch.notes = str(data.notes);
    if (data.phone !== undefined) patch.phone = str(data.phone, 60);
    await sbPatch('special_orders', `order_number=eq.${enc(orderNumber)}`, patch);
    if (data.status !== undefined) later(audit('ORDER_STATUS', `${me.username} | ${orderNumber} | ${str(data.status, 40)}`));
    return { success: true, orderNumber, status: data.status, dateUpdated: patch.date_updated };
  },

  async delete(me: Me, id: unknown) {
    const orderNumber = str(id, 40);
    await sbDelete('special_orders', `order_number=eq.${enc(orderNumber)}`);
    await audit('ORDER_DELETE', `${me.username} | ${orderNumber}`);
    return { success: true };
  },
};

// ─── Inventory ────────────────────────────────────────────────────────────────────────────────

function mapItem(i: any) {
  return {
    sku: i.sku,
    name: i.name,
    category: i.category,
    qty: i.qty,
    minQty: i.min_qty,
    costPrice: i.cost_price,
    salePrice: i.sale_price,
    supplier: i.supplier,
    location: i.location,
    compat: i.compat,
    notes: i.notes,
    lastUpdated: i.last_updated,
    updatedBy: i.updated_by,
  };
}

const Inventory = {
  async list() {
    const rows = await sbGet('inventory', 'order=name');
    return { items: rows.map(mapItem) };
  },

  async lowStock() {
    const { items } = await Inventory.list();
    return { items: items.filter((i) => i.qty <= i.minQty) };
  },

  /** Cost prices are manager-only; a cashier's edit never touches them. */
  async create(me: Me, data: any) {
    const sku = str(data.sku, 100);
    const name = str(data.name, 300);
    if (!sku || !name) return { success: false, error: 'SKU and Name are required' };
    const qty = Math.floor(num(data.qty));
    await sbPost('inventory', {
      sku,
      name,
      category: str(data.category, 80) || 'Other',
      qty,
      min_qty: Math.floor(num(data.minQty)) || 1,
      cost_price: me.role === 'manager' ? num(data.costPrice) : 0,
      sale_price: num(data.salePrice),
      supplier: str(data.supplier, 200),
      location: str(data.location, 200),
      compat: str(data.compat, 1000),
      notes: str(data.notes),
      updated_by: me.username,
    });
    if (qty > 0) {
      await sbPost('stock_movements', {
        sku, item_name: name, type: 'add', qty, qty_before: 0, qty_after: qty,
        job_id: '', reason: 'Initial stock', updated_by: me.username,
      });
    }
    return { success: true, sku };
  },

  async update(me: Me, data: any) {
    const sku = str(data.sku, 100);
    if (!sku) return { success: false, error: 'SKU required' };
    const patch: Record<string, unknown> = { last_updated: new Date().toISOString(), updated_by: me.username };
    if (data.name !== undefined) patch.name = str(data.name, 300);
    if (data.category !== undefined) patch.category = str(data.category, 80);
    if (data.minQty !== undefined) patch.min_qty = Math.floor(num(data.minQty));
    if (data.costPrice !== undefined && me.role === 'manager') patch.cost_price = num(data.costPrice);
    if (data.salePrice !== undefined) patch.sale_price = num(data.salePrice);
    if (data.supplier !== undefined) patch.supplier = str(data.supplier, 200);
    if (data.location !== undefined) patch.location = str(data.location, 200);
    if (data.compat !== undefined) patch.compat = str(data.compat, 1000);
    if (data.notes !== undefined) patch.notes = str(data.notes);
    await sbPatch('inventory', `sku=eq.${enc(sku)}`, patch);
    return { success: true };
  },

  async delete(me: Me, skuRaw: unknown) {
    const sku = str(skuRaw, 100);
    if (!sku) return { success: false, error: 'SKU required' };
    await sbDelete('inventory', `sku=eq.${enc(sku)}`);
    await audit('ITEM_DELETE', `${me.username} | ${sku}`);
    return { success: true };
  },

  async adjustStock(me: Me, data: any) {
    const sku = str(data.sku, 100);
    const type = ['add', 'remove', 'set'].includes(data.type) ? data.type : 'add';
    const res = await rpc('sc_adjust_stock', {
      p_sku: sku,
      p_type: type,
      p_qty: Math.floor(num(data.qty)),
      p_job_id: str(data.jobId, 60),
      p_reason: str(data.reason, 500),
      p_by: me.username,
    });
    if (!res?.success) return res || { success: false, error: 'Stock adjustment failed' };
    if (res.newQty <= 0) {
      notify('manageronly', `🔴 Out of Stock: ${res.name}`, `${res.name} is now out of stock.`);
    } else if (res.newQty <= res.minQty) {
      notify('manageronly', `🟡 Low Stock: ${res.name}`, `${res.name} has only ${res.newQty} units left (min: ${res.minQty}).`);
    }
    return { success: true, sku, newQty: res.newQty, qtyBefore: res.qtyBefore };
  },

  async upsert(me: Me, data: any) {
    const sku = str(data.sku, 100);
    const name = str(data.name, 300);
    if (!sku || !name) return { success: false, error: 'SKU and Name required' };
    const row: Record<string, unknown> = {
      sku,
      name,
      category: str(data.category, 80) || 'Other',
      qty: Math.floor(num(data.qty)),
      min_qty: Math.floor(num(data.minQty)) || 2,
      sale_price: num(data.salePrice),
      supplier: str(data.supplier, 200),
      updated_by: me.username,
    };
    if (me.role === 'manager') row.cost_price = num(data.costPrice);
    await sbFetch('inventory', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=minimal' });
    return { success: true };
  },

  async listMovements(data: any) {
    const limit = Math.min(Math.max(Math.floor(num(data.limit)) || 500, 1), 2000);
    let query = `order=timestamp.desc&limit=${limit}`;
    if (data.sku) query += `&sku=eq.${enc(str(data.sku, 100))}`;
    const rows = await sbGet('stock_movements', query);
    return {
      movements: rows.map((m) => ({
        timestamp: m.timestamp,
        sku: m.sku,
        itemName: m.item_name,
        type: m.type,
        qty: m.qty,
        qtyBefore: m.qty_before,
        qtyAfter: m.qty_after,
        jobId: m.job_id,
        reason: m.reason,
        updatedBy: m.updated_by,
      })),
    };
  },
};

// ─── Sales, payouts, bills, day closes ────────────────────────────────────────────────────────

function dateRange(data: any, column: string) {
  if (data.date) return `&${column}=eq.${enc(str(data.date, 20))}`;
  if (data.from && data.to) return `&${column}=gte.${enc(str(data.from, 20))}&${column}=lte.${enc(str(data.to, 20))}`;
  return '';
}

const Sales = {
  async list(me: Me, data: any) {
    // Anyone may see the sales tied to one job (its balance); the full sales list is POS-only.
    if (!data.jobId && me.role === 'technician') deny();
    let query = 'order=timestamp.desc' + dateRange(data, 'shift_date');
    if (data.jobId) query += `&job_id=eq.${enc(str(data.jobId, 60))}`;
    if (!flag(data.includeReversed)) query += '&status=neq.reversed';
    const rows = await sbGet('sales', query);
    return {
      sales: rows.map((s) => ({
        saleId: s.sale_id,
        timestamp: s.timestamp,
        shiftDate: s.shift_date,
        shift: s.shift,
        cashier: s.cashier,
        customer: s.customer,
        items: typeof s.items === 'string' ? s.items : JSON.stringify(s.items),
        total: s.total,
        method: s.method,
        amountPaid: s.amount_paid,
        jobId: s.job_id,
        status: s.status,
      })),
    };
  },

  async create(me: Me, data: any) {
    if (!data.items) return { success: false, error: 'Items required' };
    let items: any[];
    try {
      items = parseJson(data.items, 'items data');
    } catch {
      return { success: false, error: 'Invalid items data' };
    }
    if (!Array.isArray(items) || !items.length) return { success: false, error: 'At least one item required' };

    const saleId = `S-${Date.now()}`;
    const method = str(data.method, 30) || 'cash';
    const total = num(data.total);
    await sbPost('sales', {
      sale_id: saleId,
      shift_date: data.shiftDate || null,
      shift: str(data.shift, 60),
      cashier: me.username,
      customer: str(data.customer, 200),
      items,
      total,
      method,
      amount_paid: num(data.amountPaid) || total,
      job_id: str(data.jobId, 60),
    });

    for (const item of items) {
      if (!item?.sku) continue;
      await Inventory.adjustStock(me, {
        sku: item.sku, qty: Math.abs(num(item.qty) || 1), type: 'remove', reason: `Sale ${saleId}`,
      }).catch((e) => console.warn(`Inventory deduct error for ${item.sku}:`, e.message));
    }
    const collected = method === 'partial' ? num(data.amountPaid) : total;
    await audit('SALE_CREATE', `${me.username} | ${saleId} | BZ$${collected.toFixed(2)} collected`);
    return { success: true, saleId };
  },

  async reverse(me: Me, data: any) {
    const saleId = str(data.saleId, 60);
    if (!saleId) return { success: false, error: 'SaleID required' };
    await sbPatch('sales', `sale_id=eq.${enc(saleId)}`, { status: 'reversed' });
    await audit('SALE_REVERSE', `${me.username} | ${saleId} | ${str(data.reason, 500)}`);
    return { success: true };
  },

  async settle(me: Me, data: any) {
    const saleId = str(data.saleId, 60);
    if (!saleId) return { success: false, error: 'SaleID required' };
    await sbPatch('sales', `sale_id=eq.${enc(saleId)}`, { status: 'settled' });
    await audit('SALE_SETTLE', `${me.username} | ${saleId} | balance marked fulfilled`);
    return { success: true };
  },

  /** Edits are logged with the before/after totals. */
  async update(me: Me, data: any) {
    const saleId = str(data.saleId, 60);
    if (!saleId) return { success: false, error: 'SaleID required' };
    const before = (await sbGet('sales', `sale_id=eq.${enc(saleId)}&select=total,amount_paid,customer`))[0];
    if (!before) return { success: false, error: 'Sale not found' };
    const patch: Record<string, unknown> = {};
    if (data.customer !== undefined) patch.customer = str(data.customer, 200);
    if (data.items !== undefined) patch.items = parseJson(data.items, 'items data');
    if (data.total !== undefined) patch.total = num(data.total);
    if (data.amountPaid !== undefined) patch.amount_paid = num(data.amountPaid);
    if (!Object.keys(patch).length) return { success: true };
    await sbPatch('sales', `sale_id=eq.${enc(saleId)}`, patch);
    const t0 = num(before.total).toFixed(2);
    const t1 = patch.total !== undefined ? num(patch.total).toFixed(2) : t0;
    await audit('SALE_EDIT', `${me.username} | ${saleId} | total BZ$${t0} → BZ$${t1}`);
    return { success: true };
  },
};

const Payouts = {
  async list(data: any) {
    const rows = await sbGet('payouts', 'order=timestamp.desc' + dateRange(data, 'shift_date'));
    return {
      payouts: rows.map((p) => ({
        payoutId: p.payout_id,
        timestamp: p.timestamp,
        shiftDate: p.shift_date,
        shift: p.shift,
        loggedBy: p.logged_by,
        takenBy: p.taken_by,
        amount: p.amount,
        reason: p.reason,
      })),
    };
  },

  async create(me: Me, data: any) {
    const amount = num(data.amount);
    const reason = str(data.reason, 500);
    if (!amount || !reason) return { success: false, error: 'Amount and reason required' };
    const payoutId = `P-${String(Date.now()).slice(-6)}`;
    await sbPost('payouts', {
      payout_id: payoutId,
      shift_date: data.shiftDate || null,
      shift: str(data.shift, 60),
      logged_by: me.username,
      taken_by: str(data.takenBy, 100),
      amount,
      reason,
    });
    await audit('PAYOUT_CREATE', `${me.username} | ${payoutId} | BZ$${amount.toFixed(2)}`);
    notify('manageronly', '💸 Payout Logged', `${me.username} logged a BZ$${amount.toFixed(2)} payout: ${reason}`);
    return { success: true, payoutId };
  },
};

const Bills = {
  async list() {
    const rows = await sbGet('bills', 'order=created_at.desc');
    return {
      bills: rows.map((b) => ({
        billId: b.bill_id,
        createdAt: b.created_at,
        shiftDate: b.shift_date,
        personName: b.person_name,
        items: typeof b.items === 'string' ? b.items : JSON.stringify(b.items),
        totalOwed: b.total_owed,
        totalPaid: b.total_paid,
        status: b.status,
        cashier: b.cashier,
      })),
    };
  },

  async create(me: Me, data: any) {
    const personName = str(data.personName, 200);
    if (!personName || !data.items) return { success: false, error: 'Person name and items required' };
    const billId = `B-${Date.now()}`;
    await sbPost('bills', {
      bill_id: billId,
      shift_date: data.shiftDate || null,
      person_name: personName,
      items: parseJson(data.items, 'items data'),
      total_owed: num(data.totalOwed),
      total_paid: 0,
      status: 'open',
      cashier: me.username,
    });
    await audit('BILL_CREATE', `${me.username} | ${billId} | ${personName} | BZ$${num(data.totalOwed).toFixed(2)}`);
    return { success: true, billId };
  },

  async settle(me: Me, data: any) {
    const billId = str(data.billId, 60);
    const amount = num(data.amount);
    if (!billId || !amount) return { success: false, error: 'BillID and amount required' };
    const rows = await sbGet('bills', `bill_id=eq.${enc(billId)}&select=*`);
    if (!rows.length) return { success: false, error: 'Bill not found' };
    const bill = rows[0];
    const prevPaid = num(bill.total_paid);
    const owed = num(bill.total_owed);
    const newPaid = prevPaid + amount;
    const settled = newPaid >= owed - 0.01;
    await sbPatch('bills', `bill_id=eq.${enc(billId)}`, { total_paid: newPaid, status: settled ? 'settled' : 'open' });

    const sale = await Sales.create(me, {
      customer: bill.person_name,
      items: [{ name: `Bill settlement — ${bill.person_name}`, qty: 1, price: amount, total: amount }],
      total: amount,
      method: str(data.payMethod, 30) || 'cash',
      amountPaid: amount,
      shiftDate: data.shiftDate || bill.shift_date || null,
      shift: data.shift,
    });
    if (sale.success === false) {
      await sbPatch('bills', `bill_id=eq.${enc(billId)}`, {
        total_paid: prevPaid,
        status: prevPaid >= owed - 0.01 ? 'settled' : 'open',
      });
      return sale;
    }
    return { success: true, fullySettled: settled, saleId: (sale as any).saleId };
  },

  async update(me: Me, data: any) {
    const billId = str(data.billId, 60);
    if (!billId) return { success: false, error: 'BillID required' };
    const rows = await sbGet('bills', `bill_id=eq.${enc(billId)}&select=total_paid,total_owed`);
    const patch: Record<string, unknown> = {};
    if (data.personName !== undefined) patch.person_name = str(data.personName, 200);
    if (data.items !== undefined) patch.items = parseJson(data.items, 'items data');
    if (data.totalOwed !== undefined) {
      patch.total_owed = num(data.totalOwed);
      if (rows.length) patch.status = num(rows[0].total_paid) >= num(patch.total_owed) - 0.01 ? 'settled' : 'open';
    }
    if (!Object.keys(patch).length) return { success: true };
    await sbPatch('bills', `bill_id=eq.${enc(billId)}`, patch);
    if (patch.total_owed !== undefined && rows.length) {
      await audit('BILL_EDIT', `${me.username} | ${billId} | owed BZ$${num(rows[0].total_owed).toFixed(2)} → BZ$${num(patch.total_owed).toFixed(2)}`);
    }
    return { success: true };
  },
};

const DayCloses = {
  async list(data: any) {
    let query = 'order=timestamp.desc' + dateRange(data, 'shift_date');
    if (data.limit) query += `&limit=${Math.min(Math.max(Math.floor(num(data.limit)), 1), 500)}`;
    const rows = await sbGet('day_closes', query);
    return {
      closes: rows.map((c) => ({
        closeId: c.close_id,
        timestamp: c.timestamp,
        shiftDate: c.shift_date,
        shift: c.shift,
        closedBy: c.closed_by,
        grossSales: c.gross_sales,
        totalPayouts: c.total_payouts,
        netExpected: c.net_expected,
        actualDrawer: c.actual_drawer,
        variance: c.variance,
        float: c.float,
      })),
    };
  },

  async submit(me: Me, data: any) {
    const closeId = `DC-${Date.now()}`;
    const variance = num(data.variance);
    await sbPost('day_closes', {
      close_id: closeId,
      shift_date: data.shiftDate || null,
      shift: str(data.shift, 60),
      closed_by: me.username,
      gross_sales: num(data.grossSales),
      total_payouts: num(data.totalPayouts),
      net_expected: num(data.netExpected),
      actual_drawer: num(data.actualDrawer),
      variance,
      float: num(data.float),
    });
    await audit('DAY_CLOSE', `${me.username} | ${closeId} | drawer BZ$${num(data.actualDrawer).toFixed(2)} | variance BZ$${variance.toFixed(2)}`);
    if (variance < -0.01) {
      notify('manageronly', '⚠️ Cashier Short',
        `${me.username} is short BZ$${Math.abs(variance).toFixed(2)} on ${str(data.shiftDate, 20) || 'today'}.`);
    }
    return { success: true, closeId };
  },
};

// ─── Customers ────────────────────────────────────────────────────────────────────────────────

const Customers = {
  async list() {
    const rows = await sbGet('customers', 'order=name');
    return { customers: rows.map((c) => ({ name: c.name, phone: c.phone, lastSeen: c.last_seen })) };
  },

  async save(name: string, phone: string) {
    if (!name) return;
    await sbFetch('customers', {
      method: 'POST',
      body: { name, phone: phone || '', last_seen: new Date().toISOString() },
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
  },
};

// ─── Staff broadcasts ─────────────────────────────────────────────────────────────────────────

function mapBroadcast(b: any) {
  return {
    id: b.id,
    title: b.title,
    message: b.message || '',
    variant: b.variant || 'info',
    isActive: b.is_active,
    createdBy: b.created_by,
    createdAt: b.created_at,
  };
}

const Broadcasts = {
  async getActive() {
    const rows = await sbGet('portal_broadcasts', 'is_active=eq.true&order=created_at.desc&limit=1');
    return { broadcast: rows.length ? mapBroadcast(rows[0]) : null };
  },

  async publish(me: Me, data: any) {
    const title = str(data.title, 200).trim();
    if (!title) return { success: false, error: 'Title is required' };
    const variant = ['info', 'warning', 'urgent'].includes(data.variant) ? data.variant : 'info';
    await sbPatch('portal_broadcasts', 'is_active=eq.true', { is_active: false }).catch(() => {});
    const rows = await sbPost('portal_broadcasts', {
      title,
      message: str(data.message, 2000).trim(),
      variant,
      is_active: true,
      created_by: me.username,
    }, 'return=representation');
    await audit('BROADCAST_LIVE', `${me.username} | ${title}`);
    return { success: true, broadcast: mapBroadcast(Array.isArray(rows) ? rows[0] : rows) };
  },

  async deactivate(me: Me, id: unknown) {
    const bid = str(id, 60);
    if (bid) await sbPatch('portal_broadcasts', `id=eq.${enc(bid)}`, { is_active: false });
    else await sbPatch('portal_broadcasts', 'is_active=eq.true', { is_active: false });
    await audit('BROADCAST_OFF', `${me.username} | ${bid || 'all'}`);
    return { success: true };
  },

  async list() {
    const rows = await sbGet('portal_broadcasts', 'order=created_at.desc&limit=25');
    return { broadcasts: rows.map(mapBroadcast) };
  },
};

// ─── Accounts ─────────────────────────────────────────────────────────────────────────────────

const Accounts = {
  async login(ctx: Ctx, data: any) {
    const res = await rpc('sc_login', {
      p_username: str(data.username, 100),
      p_password: str(data.password, 200),
      p_remember: flag(data.remember),
      p_user_agent: ctx.req.headers.get('user-agent') || '',
    });
    if (res?.success) later(audit('LOGIN', `${res.username} | ${flag(data.remember) ? 'remembered device' : 'this session'}`));
    return res;
  },

  async logout(ctx: Ctx) {
    await rpc('sc_logout', { p_token: ctx.token });
    return { success: true };
  },

  async changePassword(ctx: Ctx, data: any) {
    const me = ctx.me!;
    const res = await rpc('sc_change_password', {
      p_username: me.username,
      p_current: str(data.currentPassword ?? data.currentpassword, 200),
      p_new: str(data.newPassword ?? data.newpassword, 200),
      p_keep_hash: me.tokenHash,
    });
    if (res?.success) await audit('PW_CHANGE', me.username);
    return res;
  },

  async setRevoked(me: Me, username: unknown, revoked: boolean) {
    const target = str(username, 100);
    if (!target) return { success: false, error: 'Username required' };
    if (target === me.username) return { success: false, error: "You can't suspend your own account" };
    const ok = await rpc('sc_set_revoked', { p_username: target, p_revoked: revoked });
    if (!ok) return { success: false, error: 'User not found' };
    await audit(revoked ? 'USER_REVOKE' : 'USER_RESTORE', `${me.username} | ${target}`);
    return { success: true };
  },

  async listUsers() {
    const rows = await sbGet('users', 'select=username,role,display_name,revoked&order=username');
    return { users: rows.map((u) => ({ username: u.username, role: u.role, displayName: u.display_name, revoked: u.revoked })) };
  },
};

// ─── Router ───────────────────────────────────────────────────────────────────────────────────

const ALL: Role[] = ['manager', 'cashier', 'technician'];
const POS: Role[] = ['manager', 'cashier'];
const MGR: Role[] = ['manager'];
const PUBLIC_ACTIONS = new Set(['login', 'ping']);

const ACCESS: Record<string, Role[]> = {
  logout: ALL, checkrole: ALL, changepassword: ALL,
  revokeuser: MGR, restoreuser: MGR, listusers: MGR,

  list: ALL, listarchived: ALL, lastid: ALL, create: ALL, update: ALL, delete: ALL, archive: MGR,
  claimjob: ALL, unclaim: ALL, markcalled: ALL, addimage: ALL, removeimage: ALL, uploadphoto: ALL,

  listorders: ALL, createorder: ALL, updateorder: MGR, deleteorder: MGR,

  listinventory: ALL, lowstock: ALL, listmovements: ALL, adjuststock: ALL,
  createitem: POS, updateitem: POS, deleteitem: POS, upsertitem: POS,

  listsales: ALL, createsale: POS, reversesale: POS, settlesale: POS, updatesale: POS,
  listpayouts: POS, createpayout: POS,
  listbills: POS, createbill: POS, settlebill: POS, updatebill: POS,
  listdaycloses: POS, submitdayclose: POS,
  listcustomers: POS,

  getpending: ALL, markdelivered: ALL, subscribe: ALL, unsubscribe: ALL,

  getbroadcast: ALL, publishbroadcast: MGR, deactivatebroadcast: MGR, listbroadcasts: MGR,
};

async function dispatch(ctx: Ctx, action: string, id: unknown, data: any): Promise<any> {
  if (action === 'ping') return { success: true, api: 2, maintenance: MAINTENANCE };
  if (action === 'login') return Accounts.login(ctx, data);

  const me = ctx.me!;
  const allowed = ACCESS[action];
  if (!allowed) return { success: false, error: `Unknown action: ${action}` };
  if (!allowed.includes(me.role)) deny();

  switch (action) {
    case 'logout':         return Accounts.logout(ctx);
    case 'checkrole':      return { success: true, role: me.role, username: me.username, displayName: me.displayName, revoked: false };
    case 'changepassword': return Accounts.changePassword(ctx, data);
    case 'revokeuser':     return Accounts.setRevoked(me, data.username, true);
    case 'restoreuser':    return Accounts.setRevoked(me, data.username, false);
    case 'listusers':      return Accounts.listUsers();

    case 'list':           return Jobs.list();
    case 'listarchived':   return Jobs.listArchived();
    case 'lastid':         return Jobs.lastId();
    case 'create':         return Jobs.create(me, data);
    case 'update':         return Jobs.update(me, id, data);
    case 'delete':         return Jobs.delete(me, id);
    case 'archive':        return Jobs.archiveOld();
    case 'claimjob':       return Jobs.claim(me, id);
    case 'unclaim':        return Jobs.unclaim(me, id);
    case 'markcalled':     return Jobs.markCalled(me, id, data.callNotes);
    case 'addimage':       return Jobs.addImage(me, data.repairId || id, data.url || data.imageUrl);
    case 'removeimage':    return Jobs.removeImage(me, data.repairId || id, data.imageUrl);
    case 'uploadphoto':    return Jobs.uploadPhoto(me, data);

    case 'listorders':     return SpecialOrders.list();
    case 'createorder':    return SpecialOrders.create(me, data);
    case 'updateorder':    return SpecialOrders.update(me, id, data);
    case 'deleteorder':    return SpecialOrders.delete(me, id);

    case 'listinventory':  return Inventory.list();
    case 'lowstock':       return Inventory.lowStock();
    case 'createitem':     return Inventory.create(me, data);
    case 'updateitem':     return Inventory.update(me, data);
    case 'deleteitem':     return Inventory.delete(me, data.sku);
    case 'adjuststock':    return Inventory.adjustStock(me, data);
    case 'upsertitem':     return Inventory.upsert(me, data);
    case 'listmovements':  return Inventory.listMovements(data);

    case 'listsales':      return Sales.list(me, data);
    case 'createsale':     return Sales.create(me, data);
    case 'reversesale':    return Sales.reverse(me, data);
    case 'settlesale':     return Sales.settle(me, data);
    case 'updatesale':     return Sales.update(me, data);

    case 'listpayouts':    return Payouts.list(data);
    case 'createpayout':   return Payouts.create(me, data);

    case 'listbills':      return Bills.list();
    case 'createbill':     return Bills.create(me, data);
    case 'settlebill':     return Bills.settle(me, data);
    case 'updatebill':     return Bills.update(me, data);

    case 'listdaycloses':  return DayCloses.list(data);
    case 'submitdayclose': return DayCloses.submit(me, data);

    case 'listcustomers':  return Customers.list();

    case 'getpending': {
      const allowedTypes = ROLE_TYPES[me.role] || ROLE_TYPES.technician;
      const rows = await sbGet('notifications',
        `type=in.(${allowedTypes.join(',')})&delivered_to=not.cs.${enc(`{"${me.username}"}`)}&order=timestamp.desc&limit=50`);
      return { notifications: rows.map((r) => ({ id: r.id, type: r.type, title: r.title, body: r.body, timestamp: r.timestamp })) };
    }
    case 'markdelivered': {
      const ids = (Array.isArray(data.ids) ? data.ids : str(data.ids, 10000).split(','))
        .map((s: unknown) => String(s).trim())
        .filter((s: string) => /^[0-9a-f-]{36}$/i.test(s));
      if (ids.length) await rpc('sc_mark_delivered', { p_ids: ids, p_username: me.username });
      return { success: true };
    }
    case 'subscribe': {
      const endpoint = str(data.endpoint, 1000);
      if (!endpoint.startsWith('https://')) return { success: false, error: 'Invalid subscription' };
      await sbFetch('push_subscriptions', {
        method: 'POST',
        body: { endpoint, username: me.username, p256dh: str(data.p256dh, 500), auth: str(data.auth, 500) },
        prefer: 'resolution=merge-duplicates,return=minimal',
      });
      return { success: true };
    }
    case 'unsubscribe':
      await sbDelete('push_subscriptions', `endpoint=eq.${enc(str(data.endpoint, 1000))}&username=eq.${enc(me.username)}`);
      return { success: true };

    case 'getbroadcast':        return Broadcasts.getActive();
    case 'publishbroadcast':    return Broadcasts.publish(me, data);
    case 'deactivatebroadcast': return Broadcasts.deactivate(me, id);
    case 'listbroadcasts':      return Broadcasts.list();
  }
  return { success: false, error: `Unknown action: ${action}` };
}

async function runCall(ctx: Ctx, call: any) {
  const action = str(call?.action, 40).toLowerCase().trim();
  const data = call?.data && typeof call.data === 'object' ? call.data : {};
  try {
    return await dispatch(ctx, action, call?.id, data);
  } catch (e: any) {
    if (e instanceof Forbidden) return { success: false, error: e.message, forbidden: true };
    console.error(`[api] ${action} failed:`, e?.message || e);
    return { success: false, error: String(e?.message || 'Request failed').replace(/^Database \d+: /, '') };
  }
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────────────────────

function corsHeaders(origin: string): Record<string, string> {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
    'Access-Control-Max-Age': '7200',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') || '';
  const cors = corsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ error: 'Origin not allowed' }, 403, cors);

  let payload: any;
  try {
    payload = JSON.parse(await req.text());
  } catch {
    return json({ error: 'Bad request' }, 400, cors);
  }
  if (!payload || typeof payload !== 'object') return json({ error: 'Bad request' }, 400, cors);

  const batched = Array.isArray(payload.calls);
  const calls: any[] = batched
    ? payload.calls.slice(0, MAX_CALLS_PER_REQUEST)
    : [{ action: payload.action, id: payload.id, data: payload.data }];

  if (MAINTENANCE && !calls.every((c) => str(c?.action, 40).toLowerCase() === 'ping')) {
    return json({ maintenance: true }, 503, cors);
  }

  const token = str(payload.session, 200);
  const ctx: Ctx = { me: null, token, req };
  if (calls.some((c) => !PUBLIC_ACTIONS.has(str(c?.action, 40).toLowerCase().trim()))) {
    let s: any;
    try {
      s = await rpc('sc_session', { p_token: token });
    } catch (e: any) {
      console.error('[api] session lookup failed:', e?.message || e);
      return json({ error: 'Server unavailable' }, 503, cors);
    }
    if (!s?.valid) return json({ error: 'SESSION_INVALID', reason: s?.reason || 'invalid' }, 401, cors);
    ctx.me = { username: s.username, role: s.role, displayName: s.displayName, tokenHash: s.tokenHash };
  }

  const results = await Promise.all(calls.map((c) => runCall(ctx, c)));
  return json(batched ? { results } : results[0], 200, cors);
});
