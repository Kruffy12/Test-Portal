/**
 * ServiCell — API client.
 *
 * Every action goes to the secure `api` Edge Function with this device's session token. The
 * database itself is closed to the browser; the function checks the session and role, and fills
 * in who did what. The action names and results are the same as before, so pages are unchanged.
 */

const SUPABASE_URL  = 'https://lakusziubvqhqhrlkdhd.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxha3Vzeml1YnZxaHFocmxrZGhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExODMxMjMsImV4cCI6MjA5Njc1OTEyM30.gPlBwVd3sLmgRT7Dq7MB4vVRyvdaG4-e77wsdGm02pc';
const SC_API_URL    = `${SUPABASE_URL}/functions/v1/api`;

// Some pages still load the Supabase SDK; keep `supabase` pointing at a client so nothing breaks.
if (typeof supabase !== 'undefined' && supabase.createClient) {
  window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
}

function scSessionToken() {
  return localStorage.getItem('scSession') || sessionStorage.getItem('scSession') || '';
}

// ── Signed out by the server (expired, suspended, or a login from before the upgrade) ────────
let _scSigningOut = false;
function scHandleSignedOut(reason) {
  if (_scSigningOut) return;
  _scSigningOut = true;
  const why = !scSessionToken() ? 'upgrade' : (reason || 'invalid');
  const keep = typeof SC_PREF_KEYS !== 'undefined' ? SC_PREF_KEYS : [];
  const prefs = {};
  keep.forEach(k => { const v = localStorage.getItem(k); if (v !== null) prefs[k] = v; });
  localStorage.clear();
  sessionStorage.clear();
  Object.entries(prefs).forEach(([k, v]) => localStorage.setItem(k, v));
  window.location.replace('index.html?signedout=' + encodeURIComponent(why));
}
window.scHandleSignedOut = scHandleSignedOut;

// ── Transport ────────────────────────────────────────────────────────────────────────────────
// Calls made in the same moment (a page loading several lists, the background check) travel
// together in one request. text/plain keeps it a "simple" request, so there is no extra CORS
// preflight round trip.
const SC_BATCH_WINDOW_MS = 12;
let _scQueue = [];
let _scTimer = null;

const SC_PUBLIC_ACTIONS = ['login', 'ping'];

function scCall(action, id, data) {
  // No token: nothing to send. Pages without a session are already sent to sign-in by
  // auth-guard.js, and index.html explains logins from before the upgrade itself.
  if (!scSessionToken() && !SC_PUBLIC_ACTIONS.includes(action)) {
    return Promise.resolve({ success: false, error: 'Not signed in', signedOut: true });
  }
  return new Promise((resolve, reject) => {
    _scQueue.push({ action, id, data: data || {}, resolve, reject });
    if (!_scTimer) _scTimer = setTimeout(scFlush, SC_BATCH_WINDOW_MS);
  });
}

async function scFlush() {
  const batch = _scQueue;
  _scQueue = [];
  _scTimer = null;
  if (!batch.length) return;

  const single = batch.length === 1;
  const body = single
    ? { session: scSessionToken(), action: batch[0].action, id: batch[0].id, data: batch[0].data }
    : { session: scSessionToken(), calls: batch.map(c => ({ action: c.action, id: c.id, data: c.data })) };

  try {
    const res = await fetch(SC_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(body)
    });

    if (res.status === 401) {
      const info = await res.json().catch(() => ({}));
      batch.forEach(c => c.resolve({ success: false, error: 'Signed out', signedOut: true }));
      scHandleSignedOut(info.reason);
      return;
    }
    if (res.status === 503) {
      const info = await res.json().catch(() => ({}));
      if (info.maintenance) {
        if (typeof window.scShowMaintenance === 'function') window.scShowMaintenance();
        throw new Error('The portal is being upgraded. Please try again shortly.');
      }
      throw new Error('The server is busy. Please try again shortly.');
    }
    if (!res.ok) throw new Error(`Server ${res.status}`);

    const out = await res.json();
    if (single) batch[0].resolve(out);
    else batch.forEach((c, i) => c.resolve((out.results || [])[i] || { success: false, error: 'No response' }));
  } catch (err) {
    batch.forEach(c => c.reject(err));
  }
}

/** Fire-and-forget that survives the page closing (used when an undo window ends on unload). */
function scBeacon(action, id, data) {
  if (!scSessionToken()) return;
  try {
    fetch(SC_API_URL, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ session: scSessionToken(), action, id, data: data || {} })
    });
  } catch (_) { }
}
window.scBeacon = scBeacon;

// ── Staff broadcasts (used directly by the banner and Settings) ──────────────────────────────
const Broadcast = {
  getActive()                   { return scCall('getbroadcast'); },
  publish(title, message, variant) { return scCall('publishbroadcast', null, { title, message, variant }); },
  deactivate(id)                { return scCall('deactivatebroadcast', id, {}); },
  list()                        { return scCall('listbroadcasts'); }
};
window.Broadcast = Broadcast;

// ── Router (same entry point the pages already use via apiGet / apiPost) ──────────────────────
async function handleAction(action, id, data) {
  try {
    const res = await scCall(action, id, data);
    return res == null ? { success: true } : res;
  } catch (err) {
    console.error(`[API] ${action} failed:`, err.message);
    if (typeof scLooksLikeLockdown === 'function' && scLooksLikeLockdown(err) && typeof scShowMaintenance === 'function') {
      scShowMaintenance();
    }
    return { success: false, error: err.message || 'Request failed' };
  }
}
