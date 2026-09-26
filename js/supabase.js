/**
 * ServiCell — Supabase API Layer
 * Replaces Google Apps Script (code.gs) entirely.
 *
 * Setup:
 *   1. Replace the two constants below with your project values
 *      (Supabase Dashboard → Settings → API)
 *   2. Replace SCRIPT_URL in api.js with the helper at the bottom of this file
 */

const SUPABASE_URL    = 'https://lakusziubvqhqhrlkdhd.supabase.co';
const SUPABASE_ANON   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxha3Vzeml1YnZxaHFocmxrZGhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExODMxMjMsImV4cCI6MjA5Njc1OTEyM30.gPlBwVd3sLmgRT7Dq7MB4vVRyvdaG4-e77wsdGm02pc';       // long JWT from Settings → API

// ── Real Supabase client (needed for Storage uploads — the sbFetch/sbGet helpers
//    below only cover database tables, not file storage) ─────────────────────
//    Requires the CDN script tag to be loaded BEFORE this file:
//    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//    That tag creates window.supabase as the LIBRARY namespace ({ createClient }).
//    We immediately overwrite window.supabase with the actual CLIENT INSTANCE,
//    since the rest of the app (new-job.html, current-jobs.html) calls
//    supabase.storage.from(...) expecting `supabase` to BE the client.
if (typeof supabase !== 'undefined' && supabase.createClient) {
  window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
} else {
  console.error('[Supabase] SDK not loaded — add the CDN <script> tag before js/supabase.js');
}

// ── Low-level fetch wrapper ───────────────────────────────────────────────────
async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey':        SUPABASE_ANON,
      'Authorization': `Bearer ${SUPABASE_ANON}`,
      'Content-Type':  'application/json',
      'Prefer':        opts.prefer || '',
      ...(opts.headers || {})
    }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(`Supabase ${res.status}: ${err.message || err.hint || res.statusText}`);
  }
  // 204 No Content, or 201/200 with return=minimal (empty body)
  if (res.status === 204 || res.status === 201) return { success: true };
  const text = await res.text();
  if (!text) return { success: true };
  return JSON.parse(text);
}

function sbGet(table, query = '')    { return sbFetch(`${table}?${query}`); }
function sbPost(table, body, prefer) { return sbFetch(table, { method: 'POST', body: JSON.stringify(body), prefer: prefer || 'return=representation' }); }
function sbPatch(table, query, body) { return sbFetch(`${table}?${query}`, { method: 'PATCH', body: JSON.stringify(body), prefer: 'return=representation' }); }
function sbDelete(table, query)      { return sbFetch(`${table}?${query}`, { method: 'DELETE' }); }

// ── AUTH ──────────────────────────────────────────────────────────────────────
const Auth = {
  async login(username, password) {
    const rows = await sbGet('users', `username=eq.${encodeURIComponent(username)}&select=*`);
    if (!rows.length) return { success: false };
    const user = rows[0];
    if (user.password !== password) return { success: false };
    if (user.revoked) return { success: false, revoked: true, error: 'Account suspended. Contact your manager.' };
    return { success: true, role: user.role, username: user.username, displayName: user.display_name || '' };
  },

  async checkRole(username) {
    const rows = await sbGet('users', `username=eq.${encodeURIComponent(username)}&select=username,role,revoked`);
    if (!rows.length) return { success: false, error: 'User not found' };
    const u = rows[0];
    return { success: true, role: u.role, username: u.username, revoked: u.revoked };
  },

  async changePassword(username, currentPassword, newPassword) {
    const rows = await sbGet('users', `username=eq.${encodeURIComponent(username)}&select=password`);
    if (!rows.length) return { success: false, message: 'User not found' };
    if (rows[0].password !== currentPassword) return { success: false, message: 'Current password incorrect' };
    await sbPatch('users', `username=eq.${encodeURIComponent(username)}`, { password: newPassword });
    await Audit.log('PW_CHANGE', username);
    return { success: true, message: 'Password updated' };
  },

  async setRevoked(username, revoked, by) {
    await sbPatch('users', `username=eq.${encodeURIComponent(username)}`, { revoked });
    await Audit.log(revoked ? 'USER_REVOKE' : 'USER_RESTORE', `${by} | ${username}`);
    return { success: true };
  },

  async listUsers() {
    const rows = await sbGet('users', 'select=username,role,display_name,revoked&order=username');
    return { users: rows.map(u => ({ username: u.username, role: u.role, displayName: u.display_name, revoked: u.revoked })) };
  }
};

// ── JOBS ──────────────────────────────────────────────────────────────────────
const Jobs = {
  _normalizeImageUrl(item) {
    const trimmed = String(item).trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('http')) return trimmed;
    return `${SUPABASE_URL}/storage/v1/object/public/repair-photos/${encodeURIComponent(trimmed)}`;
  },

  _parseInspectionImages(raw) {
    if (!raw) return [];
    return String(raw).split(',').map(s => Jobs._normalizeImageUrl(s)).filter(Boolean);
  },

  /** Merge job_inspection_images rows (legacy new-job uploads) into job objects */
  async _mergeInspectionImages(jobs) {
    if (!jobs.length) return jobs;
    try {
      const imgRows = await sbGet('job_inspection_images', 'select=job_id,image_url');
      const byJob = {};
      for (const row of imgRows) {
        const url = Jobs._normalizeImageUrl(row.image_url);
        if (!url) continue;
        if (!byJob[row.job_id]) byJob[row.job_id] = [];
        if (!byJob[row.job_id].includes(url)) byJob[row.job_id].push(url);
      }
      for (const job of jobs) {
        const extra = byJob[job.id] || [];
        if (!extra.length) continue;
        const merged = [...job.inspectionImages];
        for (const url of extra) {
          if (!merged.includes(url)) merged.push(url);
        }
        job.inspectionImages = merged;
      }
    } catch (e) {
      console.warn('[Jobs] Could not merge job_inspection_images:', e.message);
    }
    return jobs;
  },

  _map(j) {
    return {
      id:                  j.id,
      customerName:        j.customer_name,
      device:              j.device,
      status:              j.status,
      dateReceived:        j.date_received,
      dateCompleted:       j.date_completed,
      customerPhone:       j.customer_phone,
      notes:               j.notes,
      issue:               j.issue,
      jobType:             j.job_type,
      priority:            j.priority,
      invoiceItems:        j.invoice_items,
      payment:             j.payment,
      payStatus:           j.payment,
      technician:          j.technician,
      estimatedCompletion: j.estimated_completion,
      inspection:          j.inspection,
      inspectionImages:    Jobs._parseInspectionImages(j.inspection_images),
      claimedBy:           j.claimed_by,
      claimedAt:           j.claimed_at,
      calledStatus:        j.called_status,
      calledDate:          j.called_date,
      calledBy:            j.called_by,
      callNotes:           j.call_notes,
      archived:            j.archived
    };
  },

  async list() {
    const rows = await sbGet('jobs', 'archived=eq.false&order=id.desc');
    const jobs = rows.map(Jobs._map);
    await Jobs._mergeInspectionImages(jobs);
    return { jobs };
  },

  async listArchived() {
    const rows = await sbGet('jobs', 'archived=eq.true&order=id.desc');
    const jobs = rows.map(j => ({ ...Jobs._map(j), archived: true }));
    await Jobs._mergeInspectionImages(jobs);
    return { jobs };
  },

  async lastId() {
    const rows = await sbGet('jobs', 'select=id&order=id.desc&limit=1');
    return { lastId: rows.length ? rows[0].id : 100 };
  },

  async create(data) {
    const id = Number(data.repairId || data.id);
    if (!id || Number.isNaN(id)) {
      return { success: false, error: 'Valid job ID is required' };
    }

    const existing = await sbGet('jobs', `id=eq.${id}&select=id&limit=1`);
    if (existing.length) {
      return { success: false, error: `Job #${id} already exists — refresh the page for the next available ID` };
    }

    const dateReceived = data.dateReceived || new Date().toLocaleDateString('en-US', {
      month: 'numeric', day: 'numeric', year: 'numeric'
    });

    try {
      await sbPost('jobs', {
        id,
        customer_name:        data.customerName,
        device:               data.device,
        status:               data.status || 'received',
        customer_phone:       data.customerPhone || '',
        notes:                data.notes || '',
        issue:                data.issue || '',
        job_type:             data.jobType || '',
        priority:             data.priority || 'low',
        technician:           data.technician || data.username || 'Unknown',
        estimated_completion: data.estimatedCompletion || null,
        inspection:           data.inspection || 'No damage noted',
        date_received:        dateReceived,
        payment:              data.payment || 'unpaid'
      }, 'return=minimal');
    } catch (err) {
      const msg = err.message || 'Could not create job';
      if (/duplicate|23505|already exists/i.test(msg)) {
        return { success: false, error: `Job #${id} already exists — refresh the page for the next available ID` };
      }
      return { success: false, error: msg.replace(/^Supabase \d+: /, '') };
    }

    await Customers.save(data.customerName, data.customerPhone).catch(e => console.warn('[Customers]', e));
    Notifications.push('received', '📦 New Job Received',
      `Job #${id} — ${data.device} for ${data.customerName}`).catch(e => console.warn('[Notify]', e));
    return { success: true };
  },

  async update(id, updates) {
    // Build only the fields that were provided
    const patch = {};
    const map = {
      status:              'status',
      notes:               'notes',
      dateCompleted:       'date_completed',
      priority:            'priority',
      invoiceItems:        'invoice_items',
      payment:             'payment',
      payStatus:           'payment',
      estimatedCompletion: 'estimated_completion'
    };
    for (const [key, col] of Object.entries(map)) {
      if (updates[key] !== undefined) patch[col] = updates[key] || null;
    }
    if (!Object.keys(patch).length) return { success: true };
    patch.updated_at = new Date().toISOString();
    await sbPatch('jobs', `id=eq.${id}`, patch);

    if (updates.status === 'ready') {
      Notifications.push('ready', '✅ Device Ready for Pickup', `Job #${id} is ready for pickup.`).catch(e => console.warn('[Notify]', e));
    } else if (updates.status === 'abandoned') {
      Notifications.push('abandoned', '⚠️ Abandoned Device', `Job #${id} has been marked abandoned.`).catch(e => console.warn('[Notify]', e));
    } else if (updates.status) {
      Notifications.push('jobstatus', '🔧 Job Status Updated', `Job #${id} is now: ${updates.status}.`).catch(e => console.warn('[Notify]', e));
    }
    return { success: true };
  },

  async delete(id) {
    await sbDelete('jobs', `id=eq.${id}`);
    return { success: true };
  },

  async addImage(repairId, url) {
    if (!repairId || !url) return { success: false, error: 'repairId and url required' };
    const rows = await sbGet('jobs', `id=eq.${repairId}&select=inspection_images`);
    if (!rows.length) return { success: false, error: 'Job not found' };
    const current = rows[0].inspection_images || '';
    const updated = current ? current + ',' + url : url;
    await sbPatch('jobs', `id=eq.${repairId}`, { inspection_images: updated, updated_at: new Date().toISOString() });
    return { success: true, url };
  },

  async removeImage(repairId, imageUrl) {
    if (!repairId || !imageUrl) return { success: false, error: 'repairId and imageUrl required' };
    const rows = await sbGet('jobs', `id=eq.${repairId}&select=inspection_images`);
    if (!rows.length) return { success: false, error: 'Job not found' };
    const current = rows[0].inspection_images || '';
    const updated = current.split(',').map(s => s.trim()).filter(u => u && u !== imageUrl.trim()).join(',');
    await sbPatch('jobs', `id=eq.${repairId}`, { inspection_images: updated, updated_at: new Date().toISOString() });
    return { success: true };
  },

  async claim(id, username, role) {
    const allowed = ['manager', 'technician'];
    if (!allowed.includes(role)) return { success: false, error: 'Only managers and technicians can claim jobs' };

    const rows = await sbGet('jobs', `id=eq.${id}&select=claimed_by,status`);
    if (!rows.length) return { success: false, error: 'Job not found' };
    const job = rows[0];
    if (job.claimed_by && role !== 'manager') return { success: false, error: `Job already claimed by ${job.claimed_by}` };

    const now = new Date().toISOString();
    const patch = { claimed_by: username, claimed_at: now };
    if (job.status === 'received') patch.status = 'fixing';
    await sbPatch('jobs', `id=eq.${id}`, patch);
    await Audit.log('JOB_CLAIM', `${username} | Job #${id}`);
    return { success: true, claimedBy: username, claimedAt: now };
  },

  async unclaim(id, username) {
    await sbPatch('jobs', `id=eq.${id}`, { claimed_by: null, claimed_at: null });
    await Audit.log('JOB_UNCLAIM', `${username} | Job #${id}`);
    return { success: true };
  },

  async markCalled(id, username, callNotes) {
    const rows = await sbGet('jobs', `id=eq.${id}&select=status,customer_name,device`);
    if (!rows.length) return { success: false, error: 'Job not found' };
    if (rows[0].status !== 'ready') return { success: false, error: 'Can only mark ready jobs as called' };
    const now = new Date().toISOString();
    await sbPatch('jobs', `id=eq.${id}`, {
      called_status: 'called',
      called_date:   now,
      called_by:     username,
      call_notes:    callNotes || ''
    });
    await Audit.log('CUSTOMER_CALLED', `${username} | Job #${id}`);
    return { success: true, calledStatus: 'called', calledDate: now, calledBy: username };
  },

  /** Archive jobs older than the configured thresholds */
  async archiveOld() {
    const resolved_cutoff  = new Date(Date.now() - 60  * 86400000).toISOString();
    const abandoned_cutoff = new Date(Date.now() - 180 * 86400000).toISOString();
    await sbPatch('jobs',
      `status=eq.resolved&date_completed=lt.${resolved_cutoff}&archived=eq.false`,
      { archived: true }
    );
    await sbPatch('jobs',
      `status=eq.abandoned&date_completed=lt.${abandoned_cutoff}&archived=eq.false`,
      { archived: true }
    );
    return { success: true };
  }
};

// ── SPECIAL ORDERS ────────────────────────────────────────────────────────────
const SpecialOrders = {
  async list() {
    const rows = await sbGet('special_orders', 'order=date_requested.desc');
    return { orders: rows.map(o => ({
      orderNumber:   o.order_number,
      customer:      o.customer,
      dateRequested: o.date_requested,
      item:          o.item,
      quantity:      o.quantity,
      status:        o.status,
      notes:         o.notes,
      updatedBy:     o.updated_by,
      dateUpdated:   o.date_updated,
      phone:         o.phone,
      requestedBy:   o.requested_by
    })) };
  },

  async create(data) {
    const rows = await sbGet('special_orders', 'select=order_number&order=order_number.desc&limit=1');
    const last = rows.length ? parseInt(rows[0].order_number.replace('SO-', '')) : 99;
    const orderNumber = `SO-${last + 1}`;
    const now = new Date().toISOString();
    await sbPost('special_orders', {
      order_number:   orderNumber,
      customer:       data.customer || '',
      item:           data.item || '',
      quantity:       Number(data.quantity) || 1,
      notes:          data.notes || '',
      phone:          data.phone || '',
      requested_by:   data.requestedBy || 'Unknown'
    }, 'return=minimal');
    Notifications.push('specialorder', '🛒 New Special Order', `${data.requestedBy} requested: ${data.item}`).catch(e => console.warn('[Notify]', e));
    return { success: true, orderNumber, status: 'Pending', dateRequested: now };
  },

  async update(id, data) {
    const patch = {};
    if (data.customer  !== undefined) patch.customer   = data.customer;
    if (data.item      !== undefined) patch.item        = data.item;
    if (data.quantity  !== undefined) patch.quantity    = Number(data.quantity);
    if (data.status    !== undefined) patch.status      = data.status;
    if (data.notes     !== undefined) patch.notes       = data.notes;
    if (data.updatedBy !== undefined) patch.updated_by  = data.updatedBy;
    if (data.phone     !== undefined) patch.phone       = data.phone;
    patch.date_updated = new Date().toISOString();
    await sbPatch('special_orders', `order_number=eq.${encodeURIComponent(id)}`, patch);
    return { success: true, orderNumber: id, status: data.status, dateUpdated: patch.date_updated };
  },

  async delete(id) {
    await sbDelete('special_orders', `order_number=eq.${encodeURIComponent(id)}`);
    return { success: true };
  }
};

// ── INVENTORY ─────────────────────────────────────────────────────────────────
const Inventory = {
  async list() {
    const rows = await sbGet('inventory', 'order=name');
    return { items: rows.map(Inventory._map) };
  },

  _map(i) {
    return {
      sku:         i.sku,
      name:        i.name,
      category:    i.category,
      qty:         i.qty,
      minQty:      i.min_qty,
      costPrice:   i.cost_price,
      salePrice:   i.sale_price,
      supplier:    i.supplier,
      location:    i.location,
      compat:      i.compat,
      notes:       i.notes,
      lastUpdated: i.last_updated,
      updatedBy:   i.updated_by
    };
  },

  async lowStock() {
    const { items } = await Inventory.list();
    return { items: items.filter(i => i.qty <= i.minQty) };
  },

  async create(data) {
    if (!data.sku || !data.name) return { success: false, error: 'SKU and Name are required' };
    await sbPost('inventory', {
      sku:        data.sku,
      name:       data.name,
      category:   data.category || 'Other',
      qty:        Number(data.qty) || 0,
      min_qty:    Number(data.minQty) || 1,
      cost_price: Number(data.costPrice) || 0,
      sale_price: Number(data.salePrice) || 0,
      supplier:   data.supplier || '',
      location:   data.location || '',
      compat:     data.compat || '',
      notes:      data.notes || '',
      updated_by: data.updatedBy || 'Unknown'
    }, 'return=minimal');
    if (Number(data.qty) > 0) {
      await Inventory._logMovement(data.sku, data.name, 'add', Number(data.qty), 0, Number(data.qty), '', 'Initial stock', data.updatedBy);
    }
    return { success: true, sku: data.sku };
  },

  async update(data) {
    if (!data.sku) return { success: false, error: 'SKU required' };
    const patch = { last_updated: new Date().toISOString(), updated_by: data.updatedBy || 'Unknown' };
    if (data.name      !== undefined) patch.name       = data.name;
    if (data.category  !== undefined) patch.category   = data.category;
    if (data.minQty    !== undefined) patch.min_qty    = Number(data.minQty);
    if (data.costPrice !== undefined) patch.cost_price = Number(data.costPrice);
    if (data.salePrice !== undefined) patch.sale_price = Number(data.salePrice);
    if (data.supplier  !== undefined) patch.supplier   = data.supplier;
    if (data.location  !== undefined) patch.location   = data.location;
    if (data.compat    !== undefined) patch.compat     = data.compat;
    if (data.notes     !== undefined) patch.notes      = data.notes;
    await sbPatch('inventory', `sku=eq.${encodeURIComponent(data.sku)}`, patch);
    return { success: true };
  },

  async delete(sku) {
    await sbDelete('inventory', `sku=eq.${encodeURIComponent(sku)}`);
    return { success: true };
  },

  async adjustStock(data) {
    const rows = await sbGet('inventory', `sku=eq.${encodeURIComponent(data.sku)}&select=qty,min_qty,name`);
    if (!rows.length) return { success: false, error: 'Item not found' };
    const item = rows[0];
    const adj  = Number(data.qty) || 0;
    const type = data.type || 'add';
    let newQty;
    if (type === 'set')         newQty = adj;
    else if (type === 'remove') newQty = Math.max(0, item.qty - adj);
    else                        newQty = item.qty + adj;

    await sbPatch('inventory', `sku=eq.${encodeURIComponent(data.sku)}`, {
      qty:          newQty,
      last_updated: new Date().toISOString(),
      updated_by:   data.updatedBy || 'Unknown'
    });
    await Inventory._logMovement(data.sku, item.name, type, adj, item.qty, newQty, data.jobId || '', data.reason || '', data.updatedBy || 'Unknown');

    if (newQty <= 0) {
      Notifications.push('manageronly', `🔴 Out of Stock: ${item.name}`, `${item.name} is now out of stock.`).catch(e => console.warn('[Notify]', e));
    } else if (newQty <= item.min_qty) {
      Notifications.push('manageronly', `🟡 Low Stock: ${item.name}`, `${item.name} has only ${newQty} units left (min: ${item.min_qty}).`).catch(e => console.warn('[Notify]', e));
    }
    return { success: true, sku: data.sku, newQty, qtyBefore: item.qty };
  },

  async upsert(data) {
    if (!data.sku || !data.name) return { success: false, error: 'SKU and Name required' };
    await sbFetch('inventory', {
      method: 'POST',
      body: JSON.stringify({
        sku:        data.sku,
        name:       data.name,
        category:   data.category || 'Other',
        qty:        Number(data.qty) || 0,
        min_qty:    Number(data.minQty) || 2,
        cost_price: Number(data.costPrice) || 0,
        sale_price: Number(data.salePrice) || 0,
        supplier:   data.supplier || '',
        updated_by: data.updatedBy || 'Import'
      }),
      prefer: 'resolution=merge-duplicates,return=minimal'
    });
    return { success: true };
  },

  async listMovements(data) {
    let query = `order=timestamp.desc&limit=${data.limit || 500}`;
    if (data.sku) query += `&sku=eq.${encodeURIComponent(data.sku)}`;
    const rows = await sbGet('stock_movements', query);
    return { movements: rows.map(m => ({
      timestamp: m.timestamp,
      sku:       m.sku,
      itemName:  m.item_name,
      type:      m.type,
      qty:       m.qty,
      qtyBefore: m.qty_before,
      qtyAfter:  m.qty_after,
      jobId:     m.job_id,
      reason:    m.reason,
      updatedBy: m.updated_by
    })) };
  },

  async _logMovement(sku, itemName, type, qty, qtyBefore, qtyAfter, jobId, reason, updatedBy) {
    await sbPost('stock_movements', {
      sku, item_name: itemName, type, qty,
      qty_before: qtyBefore, qty_after: qtyAfter,
      job_id: jobId || '', reason: reason || '', updated_by: updatedBy || ''
    }, 'return=minimal');
  }
};

// ── SALES ─────────────────────────────────────────────────────────────────────
const Sales = {
  async list(data) {
    let query = 'order=timestamp.desc';
    if (data.date)              query += `&shift_date=eq.${data.date}`;
    else if (data.from && data.to) query += `&shift_date=gte.${data.from}&shift_date=lte.${data.to}`;
    // Look up every sale tied to one job (across all dates) — used to derive a job's balance
    if (data.jobId)             query += `&job_id=eq.${encodeURIComponent(data.jobId)}`;
    const includeReversed = data.includeReversed === '1' || data.includeReversed === true || data.includeReversed === 'true';
    if (!includeReversed) query += '&status=neq.reversed';
    const rows = await sbGet('sales', query);
    return { sales: rows.map(s => ({
      saleId:     s.sale_id,
      timestamp:  s.timestamp,
      shiftDate:  s.shift_date,
      shift:      s.shift,
      cashier:    s.cashier,
      customer:   s.customer,
      items:      typeof s.items === 'string' ? s.items : JSON.stringify(s.items),
      total:      s.total,
      method:     s.method,
      amountPaid: s.amount_paid,
      jobId:      s.job_id,
      status:     s.status
    })) };
  },

  async create(data) {
    if (!data.items || !data.cashier) return { success: false, error: 'Items and cashier required' };
    let items;
    try { items = JSON.parse(data.items); } catch (e) { return { success: false, error: 'Invalid items data' }; }
    if (!Array.isArray(items) || !items.length) return { success: false, error: 'At least one item required' };

    const saleId = `S-${Date.now()}`;
    await sbPost('sales', {
      sale_id:    saleId,
      shift_date: data.shiftDate || null,
      shift:      data.shift || '',
      cashier:    data.cashier,
      customer:   data.customer || '',
      items:      items,
      total:      Number(data.total) || 0,
      method:     data.method || 'cash',
      amount_paid: Number(data.amountPaid) || Number(data.total) || 0,
      job_id:     data.jobId || ''
    }, 'return=minimal');

    // Deduct inventory for items with SKUs
    for (const item of items) {
      if (item.sku) {
        await Inventory.adjustStock({
          sku: item.sku, qty: Math.abs(Number(item.qty) || 1),
          type: 'remove', reason: `Sale ${saleId}`, updatedBy: data.cashier
        }).catch(e => console.warn(`Inventory deduct error for ${item.sku}:`, e));
      }
    }
    const collected = (data.method === 'partial')
      ? Number(data.amountPaid) || 0
      : Number(data.total) || 0;
    await Audit.log('SALE_CREATE', `${data.cashier} | ${saleId} | BZ$${collected.toFixed(2)} collected`);
    return { success: true, saleId };
  },

  async reverse(data) {
    if (!data.saleId) return { success: false, error: 'SaleID required' };
    await sbPatch('sales', `sale_id=eq.${encodeURIComponent(data.saleId)}`, { status: 'reversed' });
    await Audit.log('SALE_REVERSE', `${data.cashier || 'Unknown'} | ${data.saleId} | ${data.reason || ''}`);
    return { success: true };
  },

  // Mark a partial sale's outstanding balance as fulfilled/collected.
  // Non-destructive: the sale stays in the books at its original amounts, it
  // just no longer counts as an outstanding partial balance.
  async settle(data) {
    if (!data.saleId) return { success: false, error: 'SaleID required' };
    await sbPatch('sales', `sale_id=eq.${encodeURIComponent(data.saleId)}`, { status: 'settled' });
    await Audit.log('SALE_SETTLE', `${data.cashier || 'Unknown'} | ${data.saleId} | balance marked fulfilled`);
    return { success: true };
  },

  async update(data) {
    if (!data.saleId) return { success: false, error: 'SaleID required' };
    const patch = {};
    if (data.customer !== undefined) patch.customer = data.customer;
    if (data.items    !== undefined) patch.items    = JSON.parse(data.items);
    if (data.total    !== undefined) patch.total    = Number(data.total);
    if (data.amountPaid !== undefined) patch.amount_paid = Number(data.amountPaid);
    await sbPatch('sales', `sale_id=eq.${encodeURIComponent(data.saleId)}`, patch);
    return { success: true };
  }
};

// ── PAYOUTS ───────────────────────────────────────────────────────────────────
const Payouts = {
  async list(data) {
    let query = 'order=timestamp.desc';
    if (data.date)                 query += `&shift_date=eq.${data.date}`;
    else if (data.from && data.to) query += `&shift_date=gte.${data.from}&shift_date=lte.${data.to}`;
    const rows = await sbGet('payouts', query);
    return { payouts: rows.map(p => ({
      payoutId:  p.payout_id,
      timestamp: p.timestamp,
      shiftDate: p.shift_date,
      shift:     p.shift,
      loggedBy:  p.logged_by,
      takenBy:   p.taken_by,
      amount:    p.amount,
      reason:    p.reason
    })) };
  },

  async create(data) {
    if (!data.amount || !data.reason) return { success: false, error: 'Amount and reason required' };
    const payoutId = `P-${String(Date.now()).slice(-6)}`;
    await sbPost('payouts', {
      payout_id:  payoutId,
      shift_date: data.shiftDate || null,
      shift:      data.shift || '',
      logged_by:  data.loggedBy || 'Unknown',
      taken_by:   data.takenBy || '',
      amount:     Number(data.amount),
      reason:     data.reason
    }, 'return=minimal');
    await Audit.log('PAYOUT_CREATE', `${data.loggedBy} | ${payoutId} | BZ$${Number(data.amount).toFixed(2)}`);
    Notifications.push('manageronly', '💸 Payout Logged',
      `${data.loggedBy} logged a BZ$${Number(data.amount).toFixed(2)} payout: ${data.reason}`).catch(e => console.warn('[Notify]', e));
    return { success: true, payoutId };
  }
};

// ── BILLS ─────────────────────────────────────────────────────────────────────
const Bills = {
  async list() {
    const rows = await sbGet('bills', 'order=created_at.desc');
    return { bills: rows.map(b => ({
      billId:     b.bill_id,
      createdAt:  b.created_at,
      shiftDate:  b.shift_date,
      personName: b.person_name,
      items:      typeof b.items === 'string' ? b.items : JSON.stringify(b.items),
      totalOwed:  b.total_owed,
      totalPaid:  b.total_paid,
      status:     b.status,
      cashier:    b.cashier
    })) };
  },

  async create(data) {
    if (!data.personName || !data.items) return { success: false, error: 'Person name and items required' };
    const billId = `B-${Date.now()}`;
    await sbPost('bills', {
      bill_id:     billId,
      shift_date:  data.shiftDate || null,
      person_name: data.personName,
      items:       JSON.parse(data.items),
      total_owed:  Number(data.totalOwed) || 0,
      total_paid:  0,
      status:      'open',
      cashier:     data.cashier || 'Unknown'
    }, 'return=minimal');
    return { success: true, billId };
  },

  async settle(data) {
    if (!data.billId || !data.amount) return { success: false, error: 'BillID and amount required' };
    const rows = await sbGet('bills', `bill_id=eq.${encodeURIComponent(data.billId)}&select=*`);
    if (!rows.length) return { success: false, error: 'Bill not found' };
    const bill    = rows[0];
    const prevPaid = Number(bill.total_paid) || 0;
    const newPaid = prevPaid + Number(data.amount);
    const owed = Number(bill.total_owed) || 0;
    const settled = newPaid >= owed - 0.01;
    await sbPatch('bills', `bill_id=eq.${encodeURIComponent(data.billId)}`, {
      total_paid: newPaid,
      status:     settled ? 'settled' : 'open'
    });
    const saleResult = await Sales.create({
      cashier:    data.cashier || 'Unknown',
      customer:   bill.person_name,
      items:      JSON.stringify([{ name: `Bill settlement — ${bill.person_name}`, qty: 1, price: Number(data.amount), total: Number(data.amount) }]),
      total:      Number(data.amount),
      method:     data.payMethod || 'cash',
      amountPaid: Number(data.amount),
      shiftDate:  data.shiftDate || bill.shift_date || null,
      shift:      data.shift || ''
    });
    if (saleResult && saleResult.success === false) {
      await sbPatch('bills', `bill_id=eq.${encodeURIComponent(data.billId)}`, {
        total_paid: prevPaid,
        status:     prevPaid >= owed - 0.01 ? 'settled' : 'open'
      });
      return saleResult;
    }
    return { success: true, fullySettled: settled, saleId: saleResult.saleId };
  },

  async update(data) {
    if (!data.billId) return { success: false, error: 'BillID required' };
    const rows = await sbGet('bills', `bill_id=eq.${encodeURIComponent(data.billId)}&select=total_paid,total_owed`);
    const patch = {};
    if (data.personName !== undefined) patch.person_name = data.personName;
    if (data.items      !== undefined) patch.items       = JSON.parse(data.items);
    if (data.totalOwed  !== undefined) {
      patch.total_owed = Number(data.totalOwed);
      if (rows.length) {
        const paid = Number(rows[0].total_paid) || 0;
        if (paid >= patch.total_owed - 0.01) patch.status = 'settled';
        else patch.status = 'open';
      }
    }
    await sbPatch('bills', `bill_id=eq.${encodeURIComponent(data.billId)}`, patch);
    return { success: true };
  }
};

// ── DAY CLOSES ────────────────────────────────────────────────────────────────
const DayCloses = {
  async list(data) {
    let query = 'order=timestamp.desc';
    if (data.date)                 query += `&shift_date=eq.${data.date}`;
    else if (data.from && data.to) query += `&shift_date=gte.${data.from}&shift_date=lte.${data.to}`;
    if (data.limit)                query += `&limit=${data.limit}`;
    const rows = await sbGet('day_closes', query);
    return { closes: rows.map(c => ({
      closeId:      c.close_id,
      timestamp:    c.timestamp,
      shiftDate:    c.shift_date,
      shift:        c.shift,
      closedBy:     c.closed_by,
      grossSales:   c.gross_sales,
      totalPayouts: c.total_payouts,
      netExpected:  c.net_expected,
      actualDrawer: c.actual_drawer,
      variance:     c.variance,
      float:        c.float
    })) };
  },

  async submit(data) {
    const closeId = `DC-${Date.now()}`;
    const variance = Number(data.variance) || 0;
    await sbPost('day_closes', {
      close_id:      closeId,
      shift_date:    data.shiftDate || null,
      shift:         data.shift || '',
      closed_by:     data.closedBy || 'Unknown',
      gross_sales:   Number(data.grossSales) || 0,
      total_payouts: Number(data.totalPayouts) || 0,
      net_expected:  Number(data.netExpected) || 0,
      actual_drawer: Number(data.actualDrawer) || 0,
      variance,
      float:         Number(data.float) || 0
    }, 'return=minimal');
    if (variance < -0.01) {
      Notifications.push('manageronly', '⚠️ Cashier Short',
        `${data.closedBy} is short BZ$${Math.abs(variance).toFixed(2)} on ${data.shiftDate || 'today'}.`).catch(e => console.warn('[Notify]', e));
    }
    return { success: true, closeId };
  }
};

// ── CUSTOMERS ─────────────────────────────────────────────────────────────────
const Customers = {
  async list() {
    const rows = await sbGet('customers', 'order=name');
    return { customers: rows.map(c => ({
      name:     c.name,
      phone:    c.phone,
      lastSeen: c.last_seen
    })) };
  },

  async save(name, phone) {
    if (!name) return;
    // Upsert by lowercased name
    await sbFetch('customers', {
      method: 'POST',
      body: JSON.stringify({ name, phone: phone || '', last_seen: new Date().toISOString() }),
      prefer: 'resolution=merge-duplicates,return=minimal'
    });
  }
};

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
const ROLE_TYPES = {
  manager:    ['received','ready','abandoned','jobstatus','specialorder','update','manageronly'],
  cashier:    ['received','ready','abandoned','jobstatus','specialorder','update'],
  technician: ['received','ready','abandoned','jobstatus','specialorder','update']
};

const Notifications = {
  async getPending(role, username) {
    const allowed = ROLE_TYPES[role] || ROLE_TYPES.technician;
    // Fetch notifications not yet delivered to this user
    // Using PostgREST: delivered_to doesn't contain the username
    const rows = await sbGet('notifications',
      `type=in.(${allowed.join(',')})&delivered_to=not.cs.{${username}}&order=timestamp.desc&limit=50`
    );
    return { notifications: rows.map(r => ({ id: r.id, type: r.type, title: r.title, body: r.body, timestamp: r.timestamp })) };
  },

  async markDelivered(ids, username) {
    if (!ids || !ids.length) return { success: true };
    // Append username to delivered_to array for each notification
    // Uses RPC for array append — define this function in Supabase SQL editor
    for (const id of ids) {
      await sbFetch(`notifications?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({}),
        headers: {
          'Content-Type':  'application/json',
          'Prefer': ''
        }
      }).catch(() => {});
      // Simple approach: fetch current, append, patch back
      const rows = await sbGet('notifications', `id=eq.${id}&select=delivered_to`);
      if (!rows.length) continue;
      const current = rows[0].delivered_to || [];
      if (!current.includes(username)) {
        await sbPatch('notifications', `id=eq.${id}`, { delivered_to: [...current, username] });
      }
    }
    return { success: true };
  },

  async push(type, title, body) {
    await sbPost('notifications', { type, title, body }, 'return=minimal');
    // Web Push delivery still goes through your Cloudflare Worker
    // (unchanged — just call your worker with the same payload)
    PushWorker.sendToAll(type, title, body).catch(e => console.warn('[Push]', e));
  },

  async cleanup() {
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
    await sbDelete('notifications', `timestamp=lt.${cutoff}`);
  }
};

// ── PUSH (Cloudflare Worker — unchanged from GAS) ─────────────────────────────
const WORKER_URL = 'https://servicell-push.ericsonchee33.workers.dev';

const PushWorker = {
  async sendToAll(type, title, body) {
    const subs = await sbGet('push_subscriptions', 'select=endpoint,p256dh,auth');
    for (const sub of subs) {
      await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, title, body, type })
      }).catch(e => console.warn('[Push] Worker error:', e));
    }
  },

  async subscribe(data) {
    await sbFetch('push_subscriptions', {
      method: 'POST',
      body: JSON.stringify({ endpoint: data.endpoint, username: data.username, p256dh: data.p256dh, auth: data.auth }),
      prefer: 'resolution=merge-duplicates,return=minimal'
    });
    return { success: true };
  },

  async unsubscribe(endpoint) {
    await sbDelete('push_subscriptions', `endpoint=eq.${encodeURIComponent(endpoint)}`);
    return { success: true };
  }
};

// ── STAFF BROADCASTS ───────────────────────────────────────────────────────────
const Broadcast = {
  _map(b) {
    return {
      id:        b.id,
      title:     b.title,
      message:   b.message || '',
      variant:   b.variant || 'info',
      isActive:  b.is_active,
      createdBy: b.created_by,
      createdAt: b.created_at
    };
  },

  async getActive() {
    const rows = await sbGet('portal_broadcasts', 'is_active=eq.true&order=created_at.desc&limit=1');
    if (!rows.length) return { broadcast: null };
    return { broadcast: Broadcast._map(rows[0]) };
  },

  async publish(title, message, variant, createdBy) {
    const t = String(title || '').trim();
    if (!t) return { success: false, error: 'Title is required' };
    const v = ['info', 'warning', 'urgent'].includes(variant) ? variant : 'info';
    await sbPatch('portal_broadcasts', 'is_active=eq.true', { is_active: false }).catch(() => {});
    const rows = await sbPost('portal_broadcasts', {
      title:       t,
      message:     String(message || '').trim(),
      variant:     v,
      is_active:   true,
      created_by:  createdBy || 'Unknown'
    }, 'return=representation');
    const row = Array.isArray(rows) ? rows[0] : rows;
    await Audit.log('BROADCAST_LIVE', `${createdBy || 'Unknown'} | ${t}`);
    return { success: true, broadcast: Broadcast._map(row) };
  },

  async deactivate(id) {
    if (id != null && id !== '') {
      await sbPatch('portal_broadcasts', `id=eq.${encodeURIComponent(id)}`, { is_active: false });
    } else {
      await sbPatch('portal_broadcasts', 'is_active=eq.true', { is_active: false }).catch(() => {});
    }
    return { success: true };
  },

  async list() {
    const rows = await sbGet('portal_broadcasts', 'order=created_at.desc&limit=25');
    return { broadcasts: rows.map(Broadcast._map) };
  }
};

window.Broadcast = Broadcast;

// ── AUDIT ──────────────────────────────────────────────────────────────────────
const Audit = {
  async log(event, actor) {
    await sbPost('audit_log', { event, actor }, 'return=minimal').catch(e => console.warn('[Audit]', e));
  }
};

// ── MAIN ROUTER (drop-in replacement for the GAS action router) ───────────────
// This matches the exact same action names your frontend already uses.
async function handleAction(action, id, data) {
  try {
  switch (action) {
    case 'login':          return Auth.login(data.username, data.password);
    case 'changepassword': return Auth.changePassword(data.username, data.currentPassword || data.currentpassword, data.newPassword || data.newpassword);
    case 'checkrole':      return Auth.checkRole(data.username);
    case 'revokeuser':     return Auth.setRevoked(data.username, true,  data.by);
    case 'restoreuser':    return Auth.setRevoked(data.username, false, data.by);
    case 'listusers':      return Auth.listUsers();

    case 'list':           return Jobs.list();
    case 'listarchived':   return Jobs.listArchived();
    case 'lastid':         return Jobs.lastId();
    case 'create':         return Jobs.create(data);
    case 'update':         return Jobs.update(id, data);
    case 'delete':         return Jobs.delete(id);
    case 'archive':        return Jobs.archiveOld();
    case 'claimjob':       return Jobs.claim(id, data.username, data.role);
    case 'unclaim':        return Jobs.unclaim(id, data.username);
    case 'markcalled':     return Jobs.markCalled(id, data.username, data.callNotes);
    case 'addimage':       return Jobs.addImage(data.repairId || id, data.url || data.imageUrl);
    case 'removeimage':    return Jobs.removeImage(data.repairId || id, data.imageUrl);

    case 'listorders':     return SpecialOrders.list();
    case 'createorder':    return SpecialOrders.create(data);
    case 'updateorder':    return SpecialOrders.update(id, data);
    case 'deleteorder':    return SpecialOrders.delete(id);

    case 'listinventory':  return Inventory.list();
    case 'lowstock':       return Inventory.lowStock();
    case 'createitem':     return Inventory.create(data);
    case 'updateitem':     return Inventory.update(data);
    case 'deleteitem':     return Inventory.delete(data.sku);
    case 'adjuststock':    return Inventory.adjustStock(data);
    case 'upsertitem':     return Inventory.upsert(data);
    case 'listmovements':  return Inventory.listMovements(data);

    case 'listsales':      return Sales.list(data);
    case 'createsale':     return Sales.create(data);
    case 'reversesale':    return Sales.reverse(data);
    case 'settlesale':     return Sales.settle(data);
    case 'updatesale':     return Sales.update(data);

    case 'listpayouts':    return Payouts.list(data);
    case 'createpayout':   return Payouts.create(data);

    case 'listbills':      return Bills.list();
    case 'createbill':     return Bills.create(data);
    case 'settlebill':     return Bills.settle(data);
    case 'updatebill':     return Bills.update(data);

    case 'listdaycloses':  return DayCloses.list(data);
    case 'submitdayclose': return DayCloses.submit(data);

    case 'listcustomers':  return Customers.list();

    case 'getpending':     return Notifications.getPending((data.role || '').toLowerCase(), data.username || '');
    case 'markdelivered':  return Notifications.markDelivered(
                             Array.isArray(data.ids) ? data.ids : String(data.ids || '').split(',').filter(Boolean),
                             data.username
                           );

    case 'subscribe':      return PushWorker.subscribe(data);
    case 'unsubscribe':    return PushWorker.unsubscribe(data.endpoint);

    default: return { success: false, error: `Unknown action: ${action}` };
  }
  } catch (err) {
    console.error(`[API] ${action} failed:`, err.message);
    return { success: false, error: err.message || 'Request failed' };
  }
}
