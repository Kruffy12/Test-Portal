// STAGING ONLY. End-to-end checks of the Phase 2 `api` function with the fake staging data.
// Run: node supabase/phase2/staging/smoke.mjs
// Refuses to run against anything but the throwaway staging project.

const REF = 'pviqyfnqzcsosihpoxks';
const API = `https://${REF}.supabase.co/functions/v1/api`;
const PUBLIC_BASE = `https://${REF}.supabase.co/storage/v1/object/public/repair-photos/`;
if (!API.includes('pviqyfnqzcsosihpoxks')) throw new Error('Not staging — refusing to run.');

const PW = {
  Manager_Test: 'test-manager', Cashier_Test: 'test-cashier',
  Technician_Test: 'test-tech', Technician_Two: 'test-tech2',
};

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name); console.log('  FAIL ' + name + (detail !== undefined ? '  → ' + JSON.stringify(detail).slice(0, 300) : '')); }
}

async function raw(body, headers = {}) {
  const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8', ...headers }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}
const call = async (session, action, data = {}, id) => (await raw({ session, action, id, data })).json;
async function login(username, password = PW[username], remember = false) {
  return (await raw({ action: 'login', data: { username, password, remember: remember ? '1' : '0' } })).json;
}

// A tiny valid JPEG (1×1).
const JPEG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

console.log('\n── Transport');
{
  const p = await raw({ action: 'ping' });
  check('ping answers api 2, not in maintenance', p.status === 200 && p.json.api === 2 && p.json.maintenance === false, p);
  const o = await raw({ action: 'ping' }, { Origin: 'https://evil.example' });
  check('unknown website origin is refused', o.status === 403, o);
  const n = await raw({ action: 'list' });
  check('no session → 401 (none)', n.status === 401 && n.json.reason === 'none', n);
  const g = await raw({ session: 'deadbeef', action: 'list' });
  check('made-up session → 401 (invalid)', g.status === 401 && g.json.reason === 'invalid', g);
}

console.log('\n── Sign-in');
{
  const w = await login('Manager_Test', 'wrong');
  check('wrong password → remaining tries', w.success === false && w.remaining === 4, w);
  let last;
  for (let i = 0; i < 5; i++) last = await login('Nobody_Here', 'x');
  check('5 wrong tries → paused up to 15 min', last.locked === true && last.minutes >= 1 && last.minutes <= 15, last);
  const again = await login('nobody_here', 'x');
  check('pause applies regardless of letter case', again.locked === true, again);
  const ci = await login('manager_test', PW.Manager_Test);
  check('username is case-insensitive, canonical name returned', ci.success && ci.username === 'Manager_Test' && ci.role === 'manager' && ci.token?.length === 64, ci);
  const r = await login('Cashier_Gone', 'test-gone');
  check('suspended account cannot sign in', r.success === false && r.revoked === true, r);
  check('login response has no password', !JSON.stringify(ci).includes('password') && !JSON.stringify(ci).includes('$2'), ci);
}

const M = (await login('Manager_Test')).token;
const C = (await login('Cashier_Test')).token;
const T = (await login('Technician_Test')).token;
const T2 = (await login('Technician_Two')).token;

console.log('\n── Roles');
{
  const cr = await call(T, 'checkrole');
  check('checkrole comes from the session', cr.role === 'technician' && cr.username === 'Technician_Test', cr);
  check('technician: full sales list refused', (await call(T, 'listsales')).forbidden === true);
  check('technician: sales for one job allowed', Array.isArray((await call(T, 'listsales', { jobId: '9001' })).sales));
  check('technician: create sale refused', (await call(T, 'createsale', { items: '[{"name":"x","qty":1,"price":1}]', total: 1 })).forbidden === true);
  check('technician: payouts refused', (await call(T, 'createpayout', { amount: 5, reason: 'x' })).forbidden === true);
  check('cashier: user list refused', (await call(C, 'listusers')).forbidden === true);
  check('cashier: publish broadcast refused', (await call(C, 'publishbroadcast', { title: 'x' })).forbidden === true);
  check('cashier: delete special order refused', (await call(C, 'deleteorder', {}, 'SO-1')).forbidden === true);
  check('cashier: claim job refused', (await call(C, 'claimjob', {}, 9001)).success === false);
  const users = await call(M, 'listusers');
  check('manager: user list has no passwords', Array.isArray(users.users) && !JSON.stringify(users).includes('$2'), users);
}

console.log('\n── Jobs, claims and the delete rule');
{
  const cl = await call(T, 'claimjob', { username: 'Manager_Test', role: 'manager' }, 9001);
  check('claim uses the session, not the name sent', cl.success && cl.claimedBy === 'Technician_Test', cl);
  check('other technician can’t change a claimed job', (await call(T2, 'update', { status: 'fixing' }, 9001)).forbidden === true);
  check('other technician can’t unclaim it', (await call(T2, 'unclaim', {}, 9001)).forbidden === true);
  check('technician can’t delete a job claimed by someone else', (await call(T, 'delete', {}, 9002)).forbidden === true);

  const lid = await call(C, 'lastid');
  const newId = Math.max(9100, Number(lid.lastId) + 1);
  const cj = await call(C, 'create', { repairId: newId, customerName: 'Fake Customer C', device: 'Test Watch', customerPhone: '600-3333', technician: 'Manager_Test' });
  check('cashier creates a job', cj.success === true, cj);
  const list = await call(C, 'list');
  const job = (list.jobs || []).find((j) => j.id === newId);
  check('job records who created it (from the session)', job?.createdBy === 'Cashier_Test', job);
  check('desk-created job isn’t assigned to the cashier', job?.technician === 'Unassigned', job);
  check('technician can’t delete a job they didn’t create or claim', (await call(T2, 'delete', {}, newId)).forbidden === true);
  check('creator (cashier) can delete their job', (await call(C, 'delete', {}, newId)).success === true);

  const photo = await call(T, 'uploadphoto', { repairId: 9001, stage: 'front', image: 'data:image/jpeg;base64,' + JPEG });
  check('technician uploads a photo to their job', photo.success && photo.url?.startsWith(PUBLIC_BASE), photo);
  if (photo.url) {
    const pub = await fetch(photo.url);
    check('photo link opens publicly', pub.status === 200, pub.status);
    const after = (await call(T, 'list')).jobs.find((j) => j.id === 9001);
    check('photo attached to the job', after?.inspectionImages?.includes(photo.url), after?.inspectionImages);
    const rm = await call(T, 'removeimage', { repairId: 9001, imageUrl: photo.url });
    check('photo can be removed from the job', rm.success === true, rm);
  }
  check('non-JPEG upload refused', (await call(T, 'uploadphoto', { repairId: 9001, image: 'data:image/png;base64,iVBORw0KGgo=' })).success === false);
  check('upload to someone else’s claimed job refused', (await call(T2, 'uploadphoto', { repairId: 9001, image: JPEG })).forbidden === true);
  check('attaching an outside link refused', (await call(T, 'addimage', { repairId: 9001, url: 'https://evil.example/x.jpg' })).success === false);

  const mc = await call(M, 'markcalled', { callNotes: 'left voicemail' }, 9003);
  check('mark ready job as called', mc.success === true && mc.calledBy === 'Manager_Test', mc);
  const un = await call(T, 'unclaim', {}, 9001);
  check('claimer can unclaim', un.success === true, un);
}

console.log('\n── Sales, payouts, bills, day close, stock');
{
  const before = (await call(C, 'listinventory')).items.find((i) => i.sku === 'TST-001').qty;
  const s = await call(C, 'createsale', { items: JSON.stringify([{ sku: 'TST-001', name: 'Test Screen Protector', qty: 2, price: 15 }]), total: 30, method: 'cash', cashier: 'Manager_Test', shiftDate: '2026-09-27' });
  check('cashier records a sale', s.success && /^S-\d+$/.test(s.saleId), s);
  const sales = (await call(C, 'listsales', { date: '2026-09-27' })).sales;
  const sale = sales.find((x) => x.saleId === s.saleId);
  check('sale is stamped with the real cashier, not the name sent', sale?.cashier === 'Cashier_Test', sale);
  const afterQty = (await call(C, 'listinventory')).items.find((i) => i.sku === 'TST-001').qty;
  check('sale takes stock off', afterQty === before - 2, { before, afterQty });
  check('sale edit works', (await call(C, 'updatesale', { saleId: s.saleId, total: 28, items: JSON.stringify([{ sku: 'TST-001', name: 'x', qty: 2, price: 14 }]) })).success === true);
  check('sale reverse works', (await call(C, 'reversesale', { saleId: s.saleId, reason: 'test' })).success === true);

  const p = await call(C, 'createpayout', { amount: 12.5, reason: 'Test lunch', takenBy: 'Someone', shiftDate: '2026-09-27' });
  check('payout recorded', p.success && /^P-\d{6}$/.test(p.payoutId), p);
  const b = await call(C, 'createbill', { personName: 'Fake Tab', items: JSON.stringify([{ name: 'x', qty: 1, price: 20 }]), totalOwed: 20, shiftDate: '2026-09-27' });
  check('bill created', b.success === true, b);
  const bs = await call(C, 'settlebill', { billId: b.billId, amount: 20, payMethod: 'cash', shiftDate: '2026-09-27' });
  check('bill settled (and a sale created for it)', bs.success && bs.fullySettled === true && !!bs.saleId, bs);
  const dc = await call(C, 'submitdayclose', { shiftDate: '2026-09-27', grossSales: 50, totalPayouts: 12.5, netExpected: 37.5, actualDrawer: 37.5, variance: 0, float: 100 });
  check('day close recorded', dc.success === true, dc);

  await call(M, 'adjuststock', { sku: 'TST-002', type: 'set', qty: 3, reason: 'test reset' });
  const adj = await call(T, 'adjuststock', { sku: 'TST-002', type: 'remove', qty: 1, reason: 'used on job', jobId: '9001' });
  check('stock adjust returns before/after', adj.success && adj.qtyBefore === 3 && adj.newQty === 2, adj);
  await Promise.all([
    call(C, 'adjuststock', { sku: 'TST-001', type: 'add', qty: 1, reason: 'same moment A' }),
    call(M, 'adjuststock', { sku: 'TST-001', type: 'add', qty: 1, reason: 'same moment B' }),
  ]);
  const both = (await call(M, 'listinventory')).items.find((i) => i.sku === 'TST-001').qty;
  check('two stock changes at the same moment both count', both === afterQty + 2, { afterQty, both });
  const sku = 'TST-' + Date.now();
  const ci = await call(C, 'createitem', { sku, name: 'Test Cable', qty: 4, costPrice: 99, salePrice: 10 });
  check('cashier adds an item', ci.success === true, ci);
  await call(C, 'updateitem', { sku, costPrice: 55 });
  const item = (await call(M, 'listinventory')).items.find((i) => i.sku === sku);
  check('cashier can’t set cost price', Number(item?.costPrice) === 0, item);
  await call(M, 'updateitem', { sku, costPrice: 3 });
  const item2 = (await call(M, 'listinventory')).items.find((i) => i.sku === sku);
  check('manager can set cost price', Number(item2?.costPrice) === 3, item2);
  const mv = await call(M, 'listmovements', { sku: 'TST-002' });
  check('stock movement logged with the real name', mv.movements?.[0]?.updatedBy === 'Technician_Test', mv.movements?.[0]);
}

console.log('\n── Special orders and broadcasts');
{
  const o = await call(T, 'createorder', { customer: 'Fake Customer B', item: 'Test Earbuds', quantity: 1, requestedBy: 'Manager_Test' });
  check('special order numbered after the last one', o.success && o.orderNumber === 'SO-3', o);
  const orders = (await call(T, 'listorders')).orders;
  check('order requested-by comes from the session', orders.find((x) => x.orderNumber === 'SO-3')?.requestedBy === 'Technician_Test');
  check('manager updates order status', (await call(M, 'updateorder', { status: 'Ordered' }, 'SO-3')).success === true);
  check('manager deletes order', (await call(M, 'deleteorder', {}, 'SO-3')).success === true);
  const [x1, x2] = await Promise.all([
    call(C, 'createorder', { customer: 'A', item: 'Same moment 1' }),
    call(M, 'createorder', { customer: 'B', item: 'Same moment 2' }),
  ]);
  check('two orders at the same moment get different numbers', x1.success && x2.success && x1.orderNumber !== x2.orderNumber, [x1, x2]);
  await call(M, 'deleteorder', {}, x1.orderNumber);
  await call(M, 'deleteorder', {}, x2.orderNumber);

  const pb = await call(M, 'publishbroadcast', { title: 'Test notice', message: 'Hello', variant: 'warning' });
  check('manager publishes a broadcast', pb.success && pb.broadcast?.createdBy === 'Manager_Test', pb);
  const gb = await call(T, 'getbroadcast');
  check('staff see the active broadcast', gb.broadcast?.title === 'Test notice', gb);
  check('manager turns it off', (await call(M, 'deactivatebroadcast', {}, pb.broadcast?.id)).success === true);
  check('no active broadcast after', (await call(T, 'getbroadcast')).broadcast === null);
}

console.log('\n── Batching, notifications');
{
  const r = await raw({ session: C, calls: [{ action: 'list' }, { action: 'listinventory' }, { action: 'listusers' }] });
  check('batched calls answered in order', r.status === 200 && r.json.results?.length === 3 && Array.isArray(r.json.results[0].jobs) && Array.isArray(r.json.results[1].items) && r.json.results[2].forbidden === true, r.json);
  await new Promise((res) => setTimeout(res, 1500));
  const pend = await call(T, 'getpending');
  check('technician gets staff notifications', (pend.notifications || []).length > 0, pend);
  check('technician never gets manager-only notifications', !(pend.notifications || []).some((n) => n.type === 'manageronly'));
  const mp = await call(M, 'getpending');
  check('manager gets manager-only notifications', (mp.notifications || []).some((n) => n.type === 'manageronly'), mp);
  const ids = (pend.notifications || []).map((n) => n.id);
  await call(T, 'markdelivered', { ids: ids.join(',') });
  check('delivered notifications don’t come back', ((await call(T, 'getpending')).notifications || []).length === 0);
}

console.log('\n── Suspension, password change, sign-out');
{
  const tmp = await login('Cashier_Test');
  check('manager suspends a cashier', (await call(M, 'revokeuser', { username: 'Cashier_Test' })).success === true);
  const after = await raw({ session: tmp.token, action: 'list' });
  check('suspended cashier’s session ends (401 revoked)', after.status === 401 && after.json.reason === 'revoked', after);
  check('manager can’t suspend themselves', (await call(M, 'revokeuser', { username: 'Manager_Test' })).success === false);
  const tmp2 = await login('Cashier_Test');
  await call(M, 'revokeuser', { username: 'Cashier_Test' });
  check('manager restores the cashier', (await call(M, 'restoreuser', { username: 'Cashier_Test' })).success === true);
  check('a device signed in before the suspension stays signed out', (await raw({ session: tmp2.token, action: 'list' })).status === 401);
  check('restored cashier signs in again', (await login('Cashier_Test')).success === true);

  const a = (await login('Technician_Two')).token;
  const b = (await login('Technician_Two')).token;
  const wrong = await call(a, 'changepassword', { currentPassword: 'nope', newPassword: 'newpass-2' });
  check('password change needs the current password', wrong.success === false, wrong);
  const short = await call(a, 'changepassword', { currentPassword: PW.Technician_Two, newPassword: '123' });
  check('new password must be 6+ characters', short.success === false, short);
  const ok = await call(a, 'changepassword', { currentPassword: PW.Technician_Two, newPassword: 'newpass-2', username: 'Manager_Test' });
  check('password changed (for the signed-in user only)', ok.success === true, ok);
  check('this device stays signed in', (await raw({ session: a, action: 'checkrole' })).status === 200);
  check('other devices are signed out', (await raw({ session: b, action: 'checkrole' })).status === 401);
  check('old password no longer works', (await login('Technician_Two', PW.Technician_Two)).success === false);
  check('new password works', (await login('Technician_Two', 'newpass-2')).success === true);
  check('manager password untouched', (await login('Manager_Test')).success === true);
  await call(a, 'changepassword', { currentPassword: 'newpass-2', newPassword: PW.Technician_Two });

  const out = (await login('Technician_Test')).token;
  await call(out, 'logout');
  check('signed-out token stops working', (await raw({ session: out, action: 'list' })).status === 401);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('Failed: ' + failures.join(' | ')); process.exit(1); }
