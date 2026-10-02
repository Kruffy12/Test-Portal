// ─────────────────────────────────────────────────────────────────────────────
// statistics.js — ServiCell Belize Statistics Page (Manager only)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// statistics.js — ServiCell Belize Statistics Page
// SCRIPT_URL is provided globally by js/api.js
// ─────────────────────────────────────────────────────────────────────────────

// ── Utilities ─────────────────────────────────────────────────────────────────
function bz(n) { return 'BZ$' + (parseFloat(n) || 0).toFixed(2); }
function escH(s) { const d = document.createElement('div'); d.textContent = String(s || ''); return d.innerHTML; }
function tryParseJSON(str, fb) { try { return JSON.parse(str); } catch(_) { return fb; } }

/** Mirrors sales.js — collected revenue per sale (excludes reversed). */
function saleCollectedAmount(s) {
    if (!s || s.status === 'reversed') return 0;
    const total = parseFloat(s.total) || 0;
    const paid  = parseFloat(s.amountPaid) || 0;
    if (s.method === 'partial') return paid;
    return total;
}

/** Cash in drawer from this sale (excludes card). */
function saleDrawerCash(s) {
    if (!s || s.status === 'reversed') return 0;
    if (s.method === 'card') return 0;
    const total = parseFloat(s.total) || 0;
    const paid  = parseFloat(s.amountPaid) || 0;
    if (s.method === 'partial') return paid;
    return total;
}

function sumCollected(sales) {
    return sales.filter(s => s.status !== 'reversed').reduce((t, s) => t + saleCollectedAmount(s), 0);
}

function sumCash(sales) {
    return sales.filter(s => s.status !== 'reversed').reduce((t, s) => t + saleDrawerCash(s), 0);
}

function sumCard(sales) {
    return sales
        .filter(s => s.status !== 'reversed' && s.method === 'card')
        .reduce((t, s) => t + saleCollectedAmount(s), 0);
}

function saleShiftDate(s) {
    return s.shiftDate || (s.timestamp || '').slice(0, 10);
}

function saleInDateRange(s, from, to) {
    const d = saleShiftDate(s);
    return d && d >= from && d <= to;
}

function parsePortalDate(str) {
    if (!str) return null;
    const s = String(str).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    // Shop stamps are M/D/YYYY or "M/D/YYYY, h:mm AM" — keep that calendar day (not UTC).
    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mdy) return mdy[3] + '-' + mdy[1].padStart(2, '0') + '-' + mdy[2].padStart(2, '0');
    const ms = Date.parse(s);
    if (!Number.isNaN(ms)) return new Date(ms).toISOString().slice(0, 10);
    return null;
}

function dateInRange(dateStr, from, to) {
    const d = parsePortalDate(dateStr);
    return !!(d && d >= from && d <= to);
}

function jobInDateRange(j, from, to) {
    return dateInRange(j.dateReceived, from, to);
}

function jobCompletedInDateRange(j, from, to) {
    const status = (j.status || '').toLowerCase();
    if (!['resolved', 'ready'].includes(status)) return false;
    return dateInRange(j.dateCompleted, from, to);
}

/**
 * Who should be credited for a job's revenue.
 * Prefer the person who claimed (did) the job; fall back to the assigned technician.
 * Returns null when there is no real person to credit (so that revenue stays unattributed
 * rather than being dumped on a placeholder like "Unknown" or "Unassigned").
 */
function techCreditFor(job) {
    if (!job) return null;
    const claimer = String(job.claimedBy || '').trim();
    if (claimer) return claimer;
    const tech = String(job.technician || '').trim();
    if (tech && !['unknown', 'unassigned'].includes(tech.toLowerCase())) return tech;
    return null;
}

/**
 * Attribute each in-period sale's collected revenue to the technician of its job.
 * The job→tech map is built from ALL jobs (window._allJobs), not just jobs received in the
 * period, so a payment collected now still credits the tech even if the job came in earlier.
 * This keeps technician revenue reconciled with the shop's collected (job-linked) revenue.
 */
function buildTechRevenue(salesInRange) {
    const detail = buildTechRevenueDetail(salesInRange);
    const rev = {};
    Object.entries(detail).forEach(([tech, rows]) => {
        rev[tech] = rows.reduce((t, r) => t + r.amount, 0);
    });
    return rev;
}

/** Per-tech revenue lines for badge drill-down (job # + collected on that sale). */
function buildTechRevenueDetail(salesInRange) {
    const allJobs = window._allJobs || [];
    const creditByJob = {};
    allJobs.forEach(j => {
        const credit = techCreditFor(j);
        if (credit && j.id != null) creditByJob[String(j.id)] = credit;
    });
    const detail = {};
    (salesInRange || []).forEach(s => {
        if (!s || s.status === 'reversed') return;
        if (!s.jobId || String(s.jobId).trim() === '') return;
        const credit = creditByJob[String(s.jobId)];
        if (!credit) return;
        const amount = saleCollectedAmount(s);
        if (amount <= 0) return;
        if (!detail[credit]) detail[credit] = [];
        detail[credit].push({
            jobId: String(s.jobId),
            saleId: s.saleId || '',
            amount,
            date: saleShiftDate(s)
        });
    });
    return detail;
}

function formatTechJobsDetail(jobs) {
    if (!jobs || !jobs.length) return '';
    const parts = jobs.slice(0, 6).map(j => '#' + j.id + (j.device ? ' (' + j.device + ')' : ''));
    return parts.join(' · ') + (jobs.length > 6 ? ' · …' : '');
}

function formatTechRevenueDetail(rows) {
    if (!rows || !rows.length) return '';
    const byJob = {};
    rows.forEach(r => {
        byJob[r.jobId] = (byJob[r.jobId] || 0) + r.amount;
    });
    return Object.entries(byJob)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([id, amt]) => 'Job #' + id + ' ' + bz(amt))
        .join(' · ')
        + (Object.keys(byJob).length > 6 ? ' · …' : '');
}

function techBucketForJob(j) {
    const status = (j.status || '').toLowerCase();
    const credit = techCreditFor(j);
    if (credit) return credit;
    if (j.claimedBy) return String(j.claimedBy).trim();
    if (['resolved', 'ready'].includes(status)) {
        const tech = String(j.technician || '').trim();
        if (tech && !['unknown', 'unassigned'].includes(tech.toLowerCase())) return tech;
    }
    return 'Unassigned';
}

function buildStaffRoleMap(users) {
    const map = {};
    (users || []).forEach(u => {
        const name = String(u.username || '').trim();
        if (name) map[name] = String(u.role || '').toLowerCase();
    });
    return map;
}

function inferStaffRoleFromUsername(username) {
    const u = String(username || '');
    if (/^cashier_/i.test(u)) return 'cashier';
    if (/^technician_/i.test(u)) return 'technician';
    if (/^manager_/i.test(u)) return 'manager';
    return '';
}

function staffRoleFor(username) {
    const key = String(username || '').trim();
    if (!key) return '';
    const map = window._staffRoles || {};
    if (map[key]) return map[key];
    return inferStaffRoleFromUsername(key);
}

/** Technicians and managers only — cashiers belong under Cashier Performance. */
function isCashierAccount(username) {
    const key = String(username || '').trim();
    if (!key) return false;
    if (staffRoleFor(key) === 'cashier') return true;
    return /^cashier_/i.test(key);
}

function isTechPerformanceEligible(username) {
    const key = String(username || '').trim();
    if (key === 'Unassigned') return true;
    if (!key) return false;
    const role = staffRoleFor(key);
    if (role === 'manager' || role === 'technician') return true;
    if (role === 'cashier') return false;
    if (/^cashier_/i.test(key)) return false;
    if (/^technician_/i.test(key) || /^manager_/i.test(key)) return true;
    return false;
}

function jobClaimedInDateRange(j, from, to) {
    const claimer = String(j.claimedBy || '').trim();
    if (!claimer) return false;
    return dateInRange(j.claimedAt, from, to);
}

function collectedOnJob(jobId, sales) {
    let total = 0;
    (sales || []).forEach(s => {
        if (!s || s.status === 'reversed') return;
        if (String(s.jobId) !== String(jobId)) return;
        total += saleCollectedAmount(s);
    });
    return total;
}

const TECH_AUDIT_LABELS = {
    ring: {
        title: 'Cashier ≠ person credited',
        hint: 'Payment was rung up by one staff member; repair credit goes to whoever claimed the job.'
    },
    unclaimed: {
        title: 'Finished but never claimed',
        hint: 'Job marked complete without a Claim on file — confirm who did the work.'
    },
    claim: {
        title: 'Claim vs stats name mismatch',
        hint: 'Someone else claimed this job, but this row is credited under a different name — check job history.'
    },
    assign: {
        title: 'Different tech on ticket vs claimer',
        hint: 'Ticket shows one technician; another technician or manager claimed it. Credit follows whoever claimed (often normal).'
    },
    nopay: {
        title: 'Complete, no payment logged',
        hint: 'Job marked done but the system shows $0 collected — add sale or fix payment status.'
    }
};

function buildTechFraudFlags(name, completedJobs, revRows, allJobs) {
    const flags = [];
    const seen = new Set();
    function add(type, jobId, line) {
        const key = type + '|' + jobId;
        if (seen.has(key)) return;
        seen.add(key);
        flags.push({ type, jobId: String(jobId), line });
    }
    (revRows || []).forEach(r => {
        const sale = (window._allSales || []).find(s =>
            String(s.saleId) === String(r.saleId) || (r.date && saleShiftDate(s) === r.date && String(s.jobId) === String(r.jobId))
        );
        const cashier = sale ? String(sale.cashier || '').trim() : '';
        if (cashier && cashier !== name) {
            add('ring', r.jobId, 'Job #' + r.jobId + ': ' + cashier + ' rang ' + bz(r.amount) + '; credit stays with claimer (' + name + ').');
        }
    });
    (completedJobs || []).forEach(job => {
        const full = (allJobs || []).find(j => String(j.id) === String(job.id));
        if (!full) return;
        const claimer = String(full.claimedBy || '').trim();
        const assignee = String(full.technician || '').trim();
        if (!claimer) {
            add('unclaimed', job.id, 'Job #' + job.id + ': completed — no Claim on file.');
        } else if (claimer !== name) {
            add('claim', job.id, 'Job #' + job.id + ': claimed by ' + claimer + ', but this stats row is for ' + name + '.');
        } else if (
            assignee && assignee !== name
            && !['unassigned', 'unknown'].includes(assignee.toLowerCase())
            && !isCashierAccount(assignee)
            && (isTechPerformanceEligible(assignee) || /^technician_/i.test(assignee) || /^manager_/i.test(assignee))
        ) {
            add('assign', job.id, 'Job #' + job.id + ': ticket listed ' + assignee + '; ' + name + ' claimed it (credit follows claimer).');
        }
        const collected = collectedOnJob(job.id, window._allSales);
        if (collected <= 0.009) {
            add('nopay', job.id, 'Job #' + job.id + ': marked complete — $0 collected in system.');
        }
    });
    return flags;
}

function renderTechAuditFlags(flags) {
    if (!flags.length) return '';
    const groups = {};
    flags.forEach(f => {
        if (!groups[f.type]) groups[f.type] = [];
        groups[f.type].push(f);
    });
    let html = '<div class="tech-audit-panel">';
    html += '<div class="tech-audit-head">' + statIcon('warning', 14) + ' '
        + flags.length + ' item' + (flags.length === 1 ? '' : 's') + ' to review</div>';
    Object.entries(groups).forEach(([type, items]) => {
        const meta = TECH_AUDIT_LABELS[type] || { title: type, hint: '' };
        html += '<div class="tech-audit-group">';
        html += '<div class="tech-audit-group-title">' + escH(meta.title) + ' <span class="tech-audit-count">(' + items.length + ')</span></div>';
        if (meta.hint) html += '<div class="tech-audit-hint">' + escH(meta.hint) + '</div>';
        html += '<ul class="tech-audit-lines">';
        items.forEach(it => { html += '<li>' + escH(it.line) + '</li>'; });
        html += '</ul></div>';
    });
    html += '</div>';
    return html;
}

function renderTechJobTable(rows, emptyText) {
    if (!rows.length) {
        return '<div class="tech-perf-empty">' + escH(emptyText) + '</div>';
    }
    let html = '<div class="tech-job-table">';
    rows.forEach(r => {
        html += '<div class="tech-job-row">';
        html += '<span class="tech-perf-job-id">' + escH(r.primary) + '</span>';
        html += '<span class="tech-job-mid">' + escH(r.mid) + '</span>';
        if (r.right) html += '<span class="tech-job-right">' + r.right + '</span>';
        html += '</div>';
    });
    html += '</div>';
    return html;
}

function renderTechBreakdownBody(name, d, from, to, revRows, claimedJobs, allJobs) {
    const flags = buildTechFraudFlags(name, d.completedJobs, revRows, allJobs);
    let html = renderTechAuditFlags(flags);
    const fmtDate = (str) => {
        const d0 = parsePortalDate(str);
        if (!d0) return '—';
        return new Date(d0 + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    html += '<div class="tech-perf-block-title">Claimed this period <span class="tech-perf-count">' + claimedJobs.length + '</span></div>';
    html += renderTechJobTable(
        claimedJobs.sort((a, b) => String(b.claimedAt || '').localeCompare(String(a.claimedAt || ''))).map(j => {
            const st = STATUS_LABELS[(j.status || '').toLowerCase()] || j.status || '—';
            return {
                primary: '#' + j.id,
                mid: (j.device || 'Device') + ' · ' + st,
                right: 'Claimed ' + fmtDate(j.claimedAt)
            };
        }),
        'No new claims in this date range.'
    );

    html += '<div class="tech-perf-block-title">Completed this period <span class="tech-perf-count">' + d.completedJobs.length + '</span></div>';
    html += renderTechJobTable(
        d.completedJobs.slice().sort((a, b) => String(b.dateCompleted || '').localeCompare(String(a.dateCompleted || ''))).map(j => {
            const coll = collectedOnJob(j.id, window._allSales);
            return {
                primary: '#' + j.id,
                mid: (j.device || 'Device') + ' · Done ' + fmtDate(j.dateCompleted),
                right: '<span class="tech-perf-amt">' + bz(coll) + '</span> on job'
            };
        }),
        'No completions in this date range.'
    );

    const revTotal = (revRows || []).reduce((t, r) => t + r.amount, 0);
    html += '<div class="tech-perf-block-title">Payments this period <span class="tech-perf-count">' + bz(revTotal) + '</span></div>';
    html += renderTechJobTable(
        (revRows || []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).map(r => ({
            primary: 'Job #' + r.jobId,
            mid: (r.date || '') + (r.saleId ? ' · Sale ' + r.saleId : ''),
            right: '<span class="tech-perf-amt">' + bz(r.amount) + '</span>'
        })),
        'No job-linked payments in this date range.'
    );
    return html;
}

function renderTechPerfMeta(d) {
    const avgDays = d.countMs ? (d.totalMs / d.countMs / 86400000).toFixed(1) : '—';
    let chips = ''
        + '<span class="tech-chip"><span class="tech-chip-n">' + d.assigned + '</span> received</span>'
        + '<span class="tech-chip"><span class="tech-chip-n">' + d.claimedInPeriod + '</span> claimed</span>'
        + '<span class="tech-chip"><span class="tech-chip-n">' + d.completed + '</span> completed</span>'
        + '<span class="tech-chip"><span class="tech-chip-n">' + avgDays + '</span> avg days</span>';
    if (d.stale) {
        chips += '<span class="tech-chip warn"><span class="tech-chip-n">' + d.stale + '</span> stale</span>';
    }
    if (d.unclaimed) {
        chips += '<span class="tech-chip bad"><span class="tech-chip-n">' + d.unclaimed + '</span> unclaimed</span>';
    }
    return '<div class="tech-perf-chips">' + chips + '</div>';
}

function formatPeriodLabel(from, to) {
    const fmt = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return from === to ? fmt(from) : fmt(from) + ' – ' + fmt(to);
}

function statIcon(name, size) {
    return typeof scIcon === 'function' ? scIcon(name, size || 16) : '';
}

function statBadge(text, type) {
    const cls = type === 'primary' ? 'stat-badge-primary' : 'stat-badge-success';
    return '<span class="stat-badge ' + cls + '">' + statIcon('trophy', 11) + ' ' + escH(text) + '</span>';
}

const METHOD_LABELS = { cash: 'Cash', card: 'Card', partial: 'Partial' };
const STATUS_LABELS = { resolved: 'Resolved', ready: 'Ready', fixing: 'Fixing', testing: 'Testing', received: 'Received', abandoned: 'Abandoned', unsuccessful: 'Unsuccessful' };

function saleOutstanding(s) {
    if (!s || s.status === 'reversed' || s.status === 'settled' || s.method !== 'partial') return 0;
    return Math.max(0, (parseFloat(s.total) || 0) - (parseFloat(s.amountPaid) || 0));
}

function sumPartialOutstandingStats(sales) {
    return sales.filter(s => s.status !== 'reversed' && s.method === 'partial').reduce((t, s) => t + saleOutstanding(s), 0);
}

/**
 * True money still owed by customers, as of now.
 *
 * Job repairs are measured PER JOB (invoice total vs. everything ever collected on that job),
 * so a repair settled across several visits — or a job whose payment status is already "paid" —
 * no longer shows a phantom balance. Summing each partial sale on its own would double-count a
 * job paid over multiple visits and never clear a job that was later paid in full.
 * Retail partial sales (no job attached) are still measured per sale.
 *
 * Returns { owed, count }.
 */
function computePartialOutstanding(allSales) {
    const jobById = {};
    (window._allJobs || []).forEach(j => { if (j.id != null) jobById[String(j.id)] = j; });

    const collectedByJob = {};
    let retailOwed = 0, retailCount = 0;
    (allSales || []).filter(s => s && s.status !== 'reversed').forEach(s => {
        const jid = s.jobId != null ? String(s.jobId).trim() : '';
        if (jid && jobById[jid]) {
            collectedByJob[jid] = (collectedByJob[jid] || 0) + saleCollectedAmount(s);
        } else if (s.method === 'partial') {
            const out = saleOutstanding(s);
            if (out > 0.009) { retailOwed += out; retailCount++; }
        }
    });

    let jobOwed = 0, jobCount = 0;
    Object.keys(collectedByJob).forEach(jid => {
        const j = jobById[jid];
        const invoiceTotal = (tryParseJSON(j.invoiceItems, []) || []).reduce((t, i) => t + (parseFloat(i.price) || 0), 0);
        const collected = collectedByJob[jid];
        const fullyPaid = String(j.payStatus || j.payment || '').toLowerCase() === 'paid';
        const remaining = invoiceTotal - collected;
        // Only a genuine partial: some money in, not fully paid, still something left.
        if (!fullyPaid && collected > 0.009 && remaining > 0.009) { jobOwed += remaining; jobCount++; }
    });

    return { owed: jobOwed + retailOwed, count: jobCount + retailCount };
}

function gstFromInclusive(gross) {
    return (parseFloat(gross) || 0) * 12.5 / 112.5;
}

function getPreviousPeriod(from, to) {
    const startMs = new Date(from + 'T12:00:00').getTime();
    const endMs = new Date(to + 'T12:00:00').getTime();
    const days = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);
    const prevEnd = new Date(startMs);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days + 1);
    return { from: prevStart.toISOString().slice(0, 10), to: prevEnd.toISOString().slice(0, 10) };
}

function computeDrawerVariance(closes) {
    let net = 0, totalShort = 0, totalOver = 0;
    (closes || []).forEach(c => {
        const v = parseFloat(c.variance) || 0;
        net += v;
        if (v < -0.01) totalShort += Math.abs(v);
        else if (v > 0.01) totalOver += v;
    });
    return { net, totalShort, totalOver };
}

function formatDelta(current, previous, invert) {
    if (previous == null || previous === undefined) return { text: '', cls: 'neutral' };
    if (Math.abs(previous) < 0.01 && Math.abs(current) < 0.01) return { text: 'Same as prior period', cls: 'neutral' };
    if (Math.abs(previous) < 0.01) return { text: current > 0 ? 'New this period' : '', cls: 'neutral' };
    const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
    if (pct === 0) return { text: 'Same as prior period', cls: 'neutral' };
    const isUp = pct > 0;
    const good = invert ? !isUp : isUp;
    return { text: (isUp ? '↑ ' : '↓ ') + Math.abs(pct) + '% vs prior period', cls: good ? 'up' : 'down' };
}

function setKpiDelta(id, delta) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!delta || !delta.text) { el.textContent = ''; el.className = 'kpi-delta'; return; }
    el.textContent = delta.text;
    el.className = 'kpi-delta ' + (delta.cls || 'neutral');
}

function setSyncState(state, text) {
    const dot = document.getElementById('syncDot');
    const txt = document.getElementById('syncText');
    if (dot) dot.className = 'sync-dot' + (state === 'loading' ? ' loading' : state === 'error' ? ' error' : '');
    if (txt) txt.textContent = text;
}

// ── Date Range ────────────────────────────────────────────────────────────────
let _range = 'month';

function setRange(r) {
    _range = r;
    document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
    const map = { today: 0, week: 1, month: 2, custom: 3 };
    document.querySelectorAll('.range-btn')[map[r]]?.classList.add('active');
    document.getElementById('customRange').style.display = r === 'custom' ? 'flex' : 'none';
    if (r !== 'custom') loadStats();
}

function getDateRange() {
    const now = new Date();
    let from, to;
    to = now.toISOString().slice(0, 10);
    if (_range === 'today') {
        from = to;
    } else if (_range === 'week') {
        const d = new Date(now);
        d.setDate(d.getDate() - 6);
        from = d.toISOString().slice(0, 10);
    } else if (_range === 'month') {
        from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    } else {
        from = document.getElementById('dateFrom').value || to;
        to   = document.getElementById('dateTo').value   || to;
    }
    return { from, to };
}

// ── Load All Data ─────────────────────────────────────────────────────────────
async function loadStats() {
    setSyncState('loading', 'Loading statistics…');
    const { from, to } = getDateRange();

    const prev = getPreviousPeriod(from, to);

    const [salesData, prevSalesData, payoutsData, prevPayoutsData, jobsData, invData, movData, closesData, billsData, custData, usersData] = await Promise.all([
        apiGet({ action: 'listsales', from, to, includeReversed: '1' }).catch(() => ({})),
        apiGet({ action: 'listsales', from: prev.from, to: prev.to, includeReversed: '1' }).catch(() => ({})),
        apiGet({ action: 'listpayouts', from, to }).catch(() => ({})),
        apiGet({ action: 'listpayouts', from: prev.from, to: prev.to }).catch(() => ({})),
        apiGet({ action: 'list' }).catch(() => ({})),
        apiGet({ action: 'listinventory' }).catch(() => ({})),
        apiGet({ action: 'listmovements', limit: 1000 }).catch(() => ({})),
        apiGet({ action: 'listdaycloses', from, to }).catch(() => ({})),
        apiGet({ action: 'listbills' }).catch(() => ({})),
        apiGet({ action: 'listcustomers' }).catch(() => ({})),
        apiGet({ action: 'listusers' }).catch(() => ({}))
    ]);

    const allSalesRaw = salesData.sales || [];
    const sales    = allSalesRaw.filter(s => s.status !== 'reversed');
    const reversed = allSalesRaw.filter(s => s.status === 'reversed');
    const payouts  = payoutsData.payouts || [];
    const allJobs  = jobsData.jobs || [];
    const jobs     = allJobs.filter(j => jobInDateRange(j, from, to));
    const inv     = invData.items       || [];
    const movs    = movData.movements   || [];
    const closes  = closesData.closes   || [];
    const bills   = billsData.bills     || [];

    // Cache customers for lookup
    window._allCustomers = custData.customers || [];
    window._allJobs      = allJobs;
    window._allSales     = allSalesRaw;
    window._allPayouts   = payouts;
    window._statRange    = { from, to };
    window._prevPeriod   = prev;
    window._prevSales    = (prevSalesData.sales || []).filter(s => s.status !== 'reversed');
    window._prevPayoutsTotal = (prevPayoutsData.payouts || []).reduce((t, p) => t + (parseFloat(p.amount) || 0), 0);
    window._prevJobsCompleted = allJobs.filter(j =>
        jobInDateRange(j, prev.from, prev.to) && ['resolved', 'ready'].includes((j.status || '').toLowerCase())
    ).length;
    window._allCloses    = closes;
    window._staffRoles   = buildStaffRoleMap((usersData.users || []));

    renderKPIs(sales, reversed, payouts, jobs, bills, closes, window._prevSales);
    renderRevenueChart(sales, from, to);
    renderPaymentMethods(sales);
    renderJobStatus(jobs);
    renderTopItems(sales, movs);
    renderInvHealth(inv);
    renderCashierPerf(sales, reversed, payouts, closes);
    renderTechPerf(jobs, from, to);
    renderShortHistory(closes);

    setSyncState('ok', formatPeriodLabel(from, to) + ' · Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
function renderKPIs(sales, reversed, payouts, jobs, bills, closes, prevSales) {
    const gross     = sumCollected(sales);
    const cashColl  = sumCash(sales);
    const cardColl  = sumCard(sales);
    const pTotal    = payouts.reduce((t, p) => t + (parseFloat(p.amount) || 0), 0);
    const netCash   = cashColl - pTotal;
    const completed = jobs.filter(j => ['resolved','ready'].includes((j.status||'').toLowerCase()));
    const jobSales  = sales.filter(s => s.jobId && String(s.jobId).trim() !== '');
    // Average per repair, not per transaction — a job paid over several visits is still one repair.
    const uniqueJobIds = new Set(jobSales.map(s => String(s.jobId).trim()));
    const avgRepair = uniqueJobIds.size
        ? jobSales.reduce((t, s) => t + saleCollectedAmount(s), 0) / uniqueJobIds.size
        : 0;
    const openBills = bills.filter(b => b.status === 'open');
    const billsOwed = openBills.reduce((t, b) => t + Math.max(0, (parseFloat(b.totalOwed)||0) - (parseFloat(b.totalPaid)||0)), 0);
    const totalTx   = sales.length + reversed.length;
    const revRate   = totalTx > 0 ? Math.round((reversed.length / totalTx) * 100) : 0;
    // Outstanding balances are an as-of-now figure (all time), measured per job — see computePartialOutstanding.
    const partialBal   = computePartialOutstanding(window._allSales || sales);
    const partialOwed  = partialBal.owed;
    const partialCount = partialBal.count;
    const gstTotal = gstFromInclusive(gross);
    const variance = computeDrawerVariance(closes);

    const prevGross = sumCollected(prevSales || []);
    const prevCash = sumCash(prevSales || []);
    const prevPTotal = window._prevPayoutsTotal || 0;
    const prevNet = prevCash - prevPTotal;
    const prevCompleted = window._prevJobsCompleted || 0;

    document.getElementById('kpiRevenue').textContent    = bz(gross);
    document.getElementById('kpiRevenueSub').textContent = sales.length + ' tx · ' + bz(cashColl) + ' cash · ' + bz(cardColl) + ' card';
    setKpiDelta('kpiRevenueDelta', formatDelta(gross, prevGross));
    document.getElementById('kpiPayouts').textContent    = bz(pTotal);
    document.getElementById('kpiPayoutsSub').textContent = payouts.length + ' payouts';
    setKpiDelta('kpiPayoutsDelta', formatDelta(pTotal, prevPTotal, true));
    document.getElementById('kpiNet').textContent        = bz(netCash);
    document.getElementById('kpiNetSub').textContent      = 'Cash collected − payouts (matches EOD)';
    setKpiDelta('kpiNetDelta', formatDelta(netCash, prevNet));
    document.getElementById('kpiJobs').textContent       = completed.length;
    document.getElementById('kpiJobsSub').textContent    = jobs.length + ' received in period';
    setKpiDelta('kpiJobsDelta', formatDelta(completed.length, prevCompleted));
    document.getElementById('kpiAvgRepair').textContent  = bz(avgRepair);
    document.getElementById('kpiBills').textContent      = bz(billsOwed);
    document.getElementById('kpiBillsSub').textContent   = openBills.length + ' open bills (all time)';
    document.getElementById('kpiReversals').textContent  = revRate + '%';
    document.getElementById('kpiReversalsSub').textContent = reversed.length + ' of ' + totalTx + ' reversed';
    const revCard = document.getElementById('kpiReversalsCard');
    if (revCard) {
        const r = parseFloat(revRate) || 0;
        revCard.classList.remove('green', 'yellow', 'red');
        revCard.classList.add(r <= 2 ? 'green' : r <= 5 ? 'yellow' : 'red');
    }
    document.getElementById('kpiPartialOwed').textContent = bz(partialOwed);
    document.getElementById('kpiPartialSub').textContent = partialCount + ' open balance' + (partialCount === 1 ? '' : 's') + ' (all time)';
    document.getElementById('kpiGST').textContent = bz(gstTotal);
    document.getElementById('kpiGSTSub').textContent = 'Pre-tax approx. ' + bz(gross - gstTotal);
    const varEl = document.getElementById('kpiVariance');
    const varSub = document.getElementById('kpiVarianceSub');
    if (varEl) {
        varEl.textContent = bz(variance.net);
        varEl.style.color = variance.net < -0.01 ? 'var(--danger)' : variance.net > 0.01 ? 'var(--success)' : 'var(--text-main)';
    }
    if (varSub) {
        varSub.textContent = (closes || []).length
            ? bz(variance.totalShort) + ' short · ' + bz(variance.totalOver) + ' over · ' + closes.length + ' closes'
            : 'No EOD closes in period';
    }
}

// ── Revenue by Day Chart ──────────────────────────────────────────────────────
function renderRevenueChart(sales, from, to) {
    const el = document.getElementById('revenueChart');
    // Build day buckets
    const days = {};
    const start = new Date(from), end = new Date(to);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        days[d.toISOString().slice(0, 10)] = 0;
    }
    sales.forEach(s => {
        const day = saleShiftDate(s);
        if (days[day] !== undefined) days[day] += saleCollectedAmount(s);
    });
    const entries = Object.entries(days);
    if (!entries.length) { el.innerHTML = '<div class="empty-state">No sales in this period.</div>'; return; }
    const max = Math.max(...entries.map(e => e[1]), 1);
    el.innerHTML = entries.map(([day, val]) => {
        const pct  = Math.round((val / max) * 100);
        const lbl  = new Date(day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return '<div class="bar-wrap drillable" onclick="openStatDrill(\'day\',\'' + day + '\')" title="' + escH(lbl) + ': ' + bz(val) + ' — click for details">'
            + '<div class="bar" style="height:' + Math.max(pct, 2) + '%;background:' + (val > 0 ? 'var(--primary)' : 'var(--glass-border)') + ';"></div>'
            + '<div class="bar-label">' + escH(lbl) + '</div>'
            + '</div>';
    }).join('');
}

// ── Payment Methods ───────────────────────────────────────────────────────────
function renderPaymentMethods(sales) {
    const el = document.getElementById('paymentMethods');
    if (!sales.length) { el.innerHTML = '<div class="empty-state">No sales data.</div>'; return; }
    const methods = {};
    sales.forEach(s => {
        const m = s.method || 'cash';
        if (!methods[m]) methods[m] = { count: 0, revenue: 0 };
        methods[m].count++;
        methods[m].revenue += saleCollectedAmount(s);
    });
    const totalRev = sumCollected(sales);
    const colors = { cash: 'green', card: '', partial: 'yellow' };
    el.innerHTML = Object.entries(methods).sort((a,b) => b[1].revenue - a[1].revenue).map(([m, d]) => {
        const pct = totalRev > 0 ? Math.round((d.revenue / totalRev) * 100) : 0;
        const label = METHOD_LABELS[m] || (m.charAt(0).toUpperCase() + m.slice(1));
        return '<div class="progress-row">'
            + '<div class="progress-label"><span>' + escH(label) + '</span><span>' + d.count + ' tx · ' + bz(d.revenue) + ' (' + pct + '%)</span></div>'
            + '<div class="progress-track"><div class="progress-fill ' + (colors[m]||'') + '" style="width:' + pct + '%;"></div></div>'
            + '</div>';
    }).join('');
}

// ── Job Status ────────────────────────────────────────────────────────────────
function renderJobStatus(jobs) {
    const el = document.getElementById('jobStatus');
    if (!jobs.length) { el.innerHTML = '<div class="empty-state">No jobs data.</div>'; return; }
    const counts = {};
    jobs.forEach(j => { const s = (j.status||'received').toLowerCase(); counts[s] = (counts[s]||0) + 1; });
    const total = jobs.length;
    const colors = { resolved:'green', ready:'green', fixing:'yellow', testing:'yellow', received:'', abandoned:'red', unsuccessful:'red' };
    el.innerHTML = Object.entries(counts).sort((a,b) => b[1]-a[1]).map(([s, c]) => {
        const pct = Math.round((c / total) * 100);
        const label = STATUS_LABELS[s] || (s.charAt(0).toUpperCase() + s.slice(1));
        return '<div class="progress-row">'
            + '<div class="progress-label"><span>' + escH(label) + '</span><span>' + c + ' (' + pct + '%)</span></div>'
            + '<div class="progress-track"><div class="progress-fill ' + (colors[s]||'') + '" style="width:' + pct + '%;"></div></div>'
            + '</div>';
    }).join('');
}

// ── Top Selling Items ─────────────────────────────────────────────────────────
function renderTopItems(sales, movs) {
    const el = document.getElementById('topItems');
    // Count item names from sales line items
    const counts = {};
    sales.forEach(s => {
        const items = tryParseJSON(s.items, []);
        items.forEach(i => {
            if (!i.name) return;
            counts[i.name] = (counts[i.name] || 0) + (i.qty || 1);
        });
    });
    const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 8);
    if (!sorted.length) { el.innerHTML = '<div class="empty-state">No sales data.</div>'; return; }
    const max = sorted[0][1];
    el.innerHTML = sorted.map(([name, qty]) => {
        const pct = Math.round((qty / max) * 100);
        return '<div class="progress-row">'
            + '<div class="progress-label"><span>' + escH(name) + '</span><span>' + qty + ' sold</span></div>'
            + '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%;"></div></div>'
            + '</div>';
    }).join('');
}

// ── Inventory Health ──────────────────────────────────────────────────────────
function renderInvHealth(inv) {
    const el = document.getElementById('invHealth');
    if (!inv.length) { el.innerHTML = '<div class="empty-state">No inventory data.</div>'; return; }
    const totalValue = inv.reduce((t, i) => t + (parseFloat(i.qty) || 0) * (parseFloat(i.costPrice) || 0), 0);
    const outOfStock = inv.filter(i => (parseFloat(i.qty) || 0) <= 0);
    const lowStock   = inv.filter(i => {
        const q = parseFloat(i.qty) || 0;
        const min = parseFloat(i.minQty) || 0;
        return q > 0 && min > 0 && q <= min;
    });
    const critical   = [...outOfStock, ...lowStock].slice(0, 6);
    let html = '<div class="stat-row"><span class="stat-row-label">Total Inventory Value</span><span class="stat-row-val green">' + bz(totalValue) + '</span></div>'
        + '<div class="stat-row"><span class="stat-row-label">Out of Stock</span><span class="stat-row-val red">' + outOfStock.length + ' items</span></div>'
        + '<div class="stat-row" style="border-bottom:none;"><span class="stat-row-label">Low Stock</span><span class="stat-row-val yellow">' + lowStock.length + ' items</span></div>';
    if (critical.length) {
        html += '<div style="margin-top:12px;border-top:1px solid var(--glass-border);padding-top:10px;">';
        html += critical.map(i => {
            const isOut = i.qty <= 0;
            return '<div class="inv-item">'
                + '<div class="inv-dot ' + (isOut ? 'red' : 'yellow') + '"></div>'
                + '<span class="inv-name">' + escH(i.name) + '</span>'
                + '<span class="inv-qty" style="color:' + (isOut ? 'var(--danger)' : 'var(--warning)') + ';">' + i.qty + ' left</span>'
                + '</div>';
        }).join('');
        html += '</div>';
    }
    el.innerHTML = html;
}

// ── Cashier Performance ───────────────────────────────────────────────────────
function renderCashierPerf(sales, reversed, payouts, closes) {
    const el = document.getElementById('cashierPerf');
    const cashiers = {};
    sales.forEach(s => {
        const c = s.cashier || 'Unknown';
        if (!cashiers[c]) cashiers[c] = { sales: 0, revenue: 0, reversals: 0, payouts: 0, shorts: 0 };
        cashiers[c].sales++;
        cashiers[c].revenue += saleCollectedAmount(s);
    });
    reversed.forEach(s => {
        const c = s.cashier || 'Unknown';
        if (!cashiers[c]) cashiers[c] = { sales: 0, revenue: 0, reversals: 0, payouts: 0, shorts: 0 };
        cashiers[c].reversals++;
    });
    payouts.forEach(p => {
        const c = p.loggedBy || 'Unknown';
        if (!cashiers[c]) cashiers[c] = { sales: 0, revenue: 0, reversals: 0, payouts: 0, shorts: 0 };
        cashiers[c].payouts += parseFloat(p.amount) || 0;
    });
    closes.forEach(c => {
        if ((parseFloat(c.variance) || 0) < -0.01) {
            const who = c.closedBy || 'Unknown';
            if (!cashiers[who]) cashiers[who] = { sales: 0, revenue: 0, reversals: 0, payouts: 0, shorts: 0 };
            cashiers[who].shorts++;
        }
    });
    const sorted = Object.entries(cashiers).sort((a,b) => b[1].revenue - a[1].revenue);
    if (!sorted.length) { el.innerHTML = '<div class="empty-state">No cashier data.</div>'; return; }
    el.innerHTML = sorted.map(([name, d]) => {
        const revNote = d.reversals ? ' &bull; <span style="color:var(--danger);">' + d.reversals + ' reversed</span>' : '';
        return '<div class="person-row drill-row" data-drill-cashier="' + escH(name) + '" onclick="openStatDrill(\'cashier\', this.dataset.drillCashier)" title="View sales">'
        + '<div class="person-avatar">' + statIcon('dollar', 16) + '</div>'
        + '<div><div class="person-name">' + escH(name) + '</div>'
        + '<div class="person-meta">' + d.sales + ' sales &bull; ' + bz(d.payouts) + ' payouts' + revNote + (d.shorts ? ' &bull; <span style="color:var(--danger);">' + d.shorts + ' short</span>' : '') + '</div></div>'
        + '<div class="person-stats"><div class="person-stat-main">' + bz(d.revenue) + '</div><div class="person-stat-sub">collected</div></div>'
        + '</div>';
    }).join('');
}

// ── Technician Performance ────────────────────────────────────────────────────
function renderTechPerf(jobs, from, to) {
    const el = document.getElementById('techPerf');
    const allJobs = window._allJobs || [];
    const techs = {};
    const excludedCashierRev = {};

    function ensureTech(name) {
        if (!techs[name]) {
            techs[name] = {
                assigned: 0, completed: 0, completedJobs: [],
                stale: 0, unclaimed: 0, totalMs: 0, countMs: 0,
                claimedInPeriod: 0
            };
        }
    }

    function bucketEligible(t) {
        return t === 'Unassigned' || isTechPerformanceEligible(t);
    }

    const salesInRange = (window._allSales || []).filter(s => s.status !== 'reversed' && saleInDateRange(s, from, to));
    const techRevenueDetailRaw = buildTechRevenueDetail(salesInRange);
    const techRevenueDetail = {};
    const techRevenue = {};
    Object.entries(techRevenueDetailRaw).forEach(([credit, rows]) => {
        if (!bucketEligible(credit)) {
            const amt = rows.reduce((t, r) => t + r.amount, 0);
            excludedCashierRev[credit] = (excludedCashierRev[credit] || 0) + amt;
            return;
        }
        techRevenueDetail[credit] = rows;
        techRevenue[credit] = rows.reduce((t, r) => t + r.amount, 0);
    });

    jobs.forEach(j => {
        const t = techBucketForJob(j);
        if (!bucketEligible(t)) return;
        ensureTech(t);
        techs[t].assigned++;
        const status = (j.status || '').toLowerCase();
        const STALE = 3 * 24 * 60 * 60 * 1000;
        const skip  = ['abandoned', 'unsuccessful', 'resolved', 'ready'];
        if (!skip.includes(status)) {
            const recvMs = j.dateReceived ? Date.parse(j.dateReceived) : 0;
            const compMs = j.dateCompleted ? Date.parse(j.dateCompleted) : 0;
            const last = Math.max(recvMs || 0, compMs || 0);
            if (last && (Date.now() - last) > STALE) {
                techs[t].stale++;
                if (!j.claimedBy && status === 'received') techs[t].unclaimed++;
            }
        }
    });

    allJobs.forEach(j => {
        const claimer = String(j.claimedBy || '').trim();
        if (claimer && bucketEligible(claimer) && jobClaimedInDateRange(j, from, to)) {
            ensureTech(claimer);
            techs[claimer].claimedInPeriod++;
        }
    });

    allJobs.forEach(j => {
        if (!jobCompletedInDateRange(j, from, to)) return;
        const t = techBucketForJob(j);
        if (!bucketEligible(t)) return;
        ensureTech(t);
        techs[t].completed++;
        techs[t].completedJobs.push({
            id: j.id,
            device: j.device || '',
            dateCompleted: j.dateCompleted || ''
        });
        const recvMs = j.dateReceived ? Date.parse(j.dateReceived) : NaN;
        const compMs = j.dateCompleted ? Date.parse(j.dateCompleted) : NaN;
        if (!Number.isNaN(recvMs) && !Number.isNaN(compMs) && compMs > recvMs) {
            techs[t].totalMs += compMs - recvMs;
            techs[t].countMs++;
        }
    });

    Object.keys(techRevenue).forEach(name => ensureTech(name));

    const sorted = Object.entries(techs)
        .filter(([name]) => bucketEligible(name))
        .sort((a, b) => b[1].completed - a[1].completed);
    if (!sorted.length) { el.innerHTML = '<div class="empty-state">No technician data.</div>'; return; }

    const eligibleSorted = sorted.filter(([name]) => name !== 'Unassigned');
    const maxCompleted = Math.max(...eligibleSorted.map(([, d]) => d.completed), 0);
    const maxRevenue   = Math.max(...eligibleSorted.map(([name]) => techRevenue[name] || 0), 0);
    const completedWinners = eligibleSorted.filter(([, d]) => d.completed === maxCompleted && maxCompleted > 0);
    const revenueWinners   = eligibleSorted.filter(([name]) => (techRevenue[name] || 0) === maxRevenue && maxRevenue > 0);
    const soloJobsWinner   = completedWinners.length === 1 ? completedWinners[0][0] : null;
    const soloRevWinner    = revenueWinners.length === 1 ? revenueWinners[0][0] : null;

    let html = '<p class="tech-perf-note">Technicians and managers only. Money collected is credited to whoever <strong>claimed</strong> the job. Tap <strong>Full breakdown</strong> for job lists and review items.</p>';

    html += sorted.map(([name, d]) => {
        const revenue = techRevenue[name] || 0;
        const isUnassigned = name === 'Unassigned';
        const topJobs = name === soloJobsWinner;
        const topRev = name === soloRevWinner;
        const revRows = techRevenueDetail[name] || [];
        const claimedJobs = isUnassigned ? [] : allJobs.filter(j =>
            String(j.claimedBy || '').trim() === name && jobClaimedInDateRange(j, from, to)
        );
        const roleLabel = isUnassigned ? '' : staffRoleFor(name);
        const roleBadge = roleLabel === 'manager'
            ? ' <span class="tech-role-chip">Manager</span>' : '';

        return '<div class="tech-perf-card">'
            + '<div class="person-row tech-perf-summary">'
            + '<div class="person-avatar">' + statIcon(isUnassigned ? 'info' : 'wrench', 16) + '</div>'
            + '<div style="flex:1;min-width:0;">'
            +   '<div class="person-name">' + escH(name) + roleBadge
            +     (topJobs ? ' ' + statBadge('Most Jobs', 'success') : '')
            +     (topRev ? ' ' + statBadge('Top Revenue', 'primary') : '')
            +   '</div>'
            +   renderTechPerfMeta(d)
            + '</div>'
            + '<div class="tech-perf-metrics">'
            +   '<div class="person-stats"><div class="person-stat-main">' + d.completed + '</div><div class="person-stat-sub">completed</div></div>'
            +   (revenue > 0 ? '<div class="person-stats"><div class="person-stat-main tech-perf-revenue">' + bz(revenue) + '</div><div class="person-stat-sub">collected</div></div>' : '')
            + '</div>'
            + '</div>'
            + (isUnassigned ? '' : (
                '<details class="tech-perf-details">'
                + '<summary>Full breakdown</summary>'
                + '<div class="tech-perf-details-body">'
                + renderTechBreakdownBody(name, d, from, to, revRows, claimedJobs, allJobs)
                + '</div></details>'
            ))
            + '</div>';
    }).join('');

    const excludedEntries = Object.entries(excludedCashierRev).filter(([, amt]) => amt > 0);
    if (excludedEntries.length) {
        const exTotal = excludedEntries.reduce((t, [, a]) => t + a, 0);
        html += '<div class="tech-perf-excluded">'
            + statIcon('info', 14) + ' '
            + bz(exTotal) + ' job-linked revenue in this period is attributed to cashier accounts (shown under Cashier Performance, not here): '
            + excludedEntries.map(([n, a]) => escH(n) + ' ' + bz(a)).join(' · ')
            + '</div>';
    }

    el.innerHTML = html;
    if (typeof initDataIcons === 'function') initDataIcons(el);
}

// ── Short Cashier History ─────────────────────────────────────────────────────
function renderShortHistory(closes) {
    const el = document.getElementById('shortHistory');
    const shorts = closes.filter(c => (parseFloat(c.variance) || 0) < -0.01)
        .sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    if (!shorts.length) {
        el.innerHTML = '<div class="empty-state" style="color:var(--success);display:flex;align-items:center;justify-content:center;gap:6px;">' + statIcon('check', 16) + ' No short closes in this period.</div>';
        return;
    }
    el.innerHTML = shorts.map(c => {
        const ts  = c.timestamp ? new Date(c.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        const variance = parseFloat(c.variance) || 0;
        return '<div class="stat-row">'
            + '<div><div style="font-size:0.85rem;font-weight:700;">' + escH(c.closedBy || 'Unknown') + '</div>'
            + '<div style="font-size:0.72rem;color:var(--text-dim);">' + escH(ts) + ' &bull; ' + escH(c.shift || '') + '</div></div>'
            + '<span class="stat-row-val red">' + bz(Math.abs(variance)) + ' short</span>'
            + '</div>';
    }).join('');
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    const now   = new Date();
    const from  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const to    = now.toISOString().slice(0, 10);
    document.getElementById('dateFrom').value = from;
    document.getElementById('dateTo').value   = to;
    if (typeof initDataIcons === 'function') initDataIcons(document);
    loadStats();
});

window.addEventListener('sc-back-online', loadStats);

// ── Partial Sales Modal (Statistics) ───────────────────────────────────────────
function openStatsPartialSales() {
    openPartialSalesModal(window._allSales || [], {
        emptyText: 'No partial sales with balance due in this view.'
    });
}

// ── Drill-down Modal ──────────────────────────────────────────────────────────
function openStatDrill(type, key) {
    const active = (window._allSales || []).filter(s => s.status !== 'reversed');
    let filtered = [];
    let title = 'Details';
    if (type === 'day') {
        filtered = active.filter(s => saleShiftDate(s) === key);
        title = 'Sales — ' + new Date(key + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    } else if (type === 'cashier') {
        filtered = active.filter(s => (s.cashier || 'Unknown') === key);
        title = 'Sales — ' + key;
    }
    const titleEl = document.getElementById('statDrillTitle');
    if (titleEl) titleEl.textContent = title;
    const body = document.getElementById('statDrillBody');
    if (!body) return;
    if (!filtered.length) {
        body.innerHTML = '<div class="empty-state">No sales found.</div>';
    } else {
        const total = filtered.reduce((t, s) => t + saleCollectedAmount(s), 0);
        body.innerHTML = '<div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:10px;font-weight:700;">'
            + filtered.length + ' sale' + (filtered.length === 1 ? '' : 's') + ' · ' + bz(total) + ' collected</div>'
            + filtered.map(s => {
                const items = tryParseJSON(s.items, []);
                const desc = items.map(i => i.name).slice(0, 2).join(', ') + (items.length > 2 ? '…' : '') || 'Sale';
                const ts = s.timestamp ? new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                return '<div class="drill-sale-row">'
                    + '<div><div style="font-weight:700;">' + escH(desc) + '</div>'
                    + '<div style="font-size:0.72rem;color:var(--text-dim);margin-top:2px;">' + escH(s.method || 'cash') + (ts ? ' · ' + escH(ts) : '') + '</div></div>'
                    + '<div style="font-weight:800;text-align:right;">' + bz(saleCollectedAmount(s)) + '</div>'
                    + '</div>';
            }).join('');
    }
    document.getElementById('statDrillModal').classList.add('open');
    document.body.classList.add('modal-open');
    if (typeof initDataIcons === 'function') initDataIcons(document.getElementById('statDrillModal'));
}

function closeStatDrill() {
    const el = document.getElementById('statDrillModal');
    if (el) el.classList.remove('open');
    if (!document.querySelector('.modal-overlay.open')) document.body.classList.remove('modal-open');
}

// ── Customer Lookup ───────────────────────────────────────────────────────────
function searchCustomers() {
    const q  = (document.getElementById('customerSearch').value || '').trim().toLowerCase();
    const el = document.getElementById('customerResults');
    if (!q) { el.innerHTML = ''; return; }
    const customers = window._allCustomers || [];
    const matches = customers.filter(c =>
        (c.name || '').toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q)
    ).slice(0, 10);
    if (!matches.length) { el.innerHTML = '<div class="empty-state">No customers found.</div>'; return; }
    const allJobs  = window._allJobs  || [];
    let allSales = window._allSales || [];
    const periodOnly = document.getElementById('customerPeriodToggle')?.checked;
    const range = window._statRange || getDateRange();
    if (periodOnly) {
        allSales = allSales.filter(s => saleInDateRange(s, range.from, range.to));
    }
    el.innerHTML = matches.map(c => {
        const cJobs  = allJobs.filter(j => (j.customerName||'').toLowerCase() === (c.name||'').toLowerCase());
        let cSales = allSales.filter(s => (s.customer||'').toLowerCase() === (c.name||'').toLowerCase());
        const spent  = cSales.filter(s => s.status !== 'reversed').reduce((t, s) => t + saleCollectedAmount(s), 0);
        const lastSeen = c.lastSeen ? new Date(c.lastSeen).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
        const periodNote = periodOnly ? ' · this period' : ' · all time';
        return '<div class="person-row">'
            + '<div class="person-avatar">' + statIcon('users', 16) + '</div>'
            + '<div><div class="person-name">' + escH(c.name || '—') + '</div>'
            + '<div class="person-meta">' + escH(c.phone || 'No phone') + ' &bull; Last seen: ' + escH(lastSeen) + '</div></div>'
            + '<div class="person-stats"><div class="person-stat-main">' + bz(spent) + '</div>'
            + '<div class="person-stat-sub">' + cJobs.length + ' jobs &bull; ' + cSales.filter(s => s.status !== 'reversed').length + ' sales' + periodNote + '</div></div>'
            + '</div>';
    }).join('');
}

function csvEscape(v) {
    return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
}

function csvSection(title, headers, rows) {
    let out = title + '\n' + headers.map(csvEscape).join(',') + '\n';
    rows.forEach(r => { out += r.map(csvEscape).join(',') + '\n'; });
    return out + '\n';
}

// ── Export CSV ────────────────────────────────────────────────────────────────
function exportCSV() {
    const { from, to } = getDateRange();
    const allSales = window._allSales || [];
    const payouts = window._allPayouts || [];
    if (!allSales.length && !payouts.length) { alert('No data to export for this period.'); return; }

    const sales = allSales.filter(s => s.status !== 'reversed');
    const reversed = allSales.filter(s => s.status === 'reversed');

    const salesRows = sales.map(s => {
        const items = tryParseJSON(s.items, []).map(i => i.name + ' x' + i.qty).join('; ');
        return [s.saleId, s.shiftDate, s.shift, s.cashier, items, s.total, s.method, s.amountPaid, s.jobId || '', s.status];
    });

    const payoutRows = payouts.map(p => [
        p.payoutId, p.shiftDate, p.shift, p.loggedBy, p.takenBy, p.amount, p.reason
    ]);

    const reversalRows = reversed.map(s => {
        const items = tryParseJSON(s.items, []).map(i => i.name + ' x' + i.qty).join('; ');
        return [s.saleId, s.shiftDate, s.cashier, items, s.total, s.amountPaid, s.status];
    });

    const partialRows = sales.filter(s => s.method === 'partial' && saleOutstanding(s) > 0.009).map(s => {
        const items = tryParseJSON(s.items, []).map(i => i.name + ' x' + i.qty).join('; ');
        return [s.saleId, s.shiftDate, s.cashier, s.customer || '', items, s.total, s.amountPaid, saleOutstanding(s)];
    });

    let csv = csvSection('=== SALES ===', ['SaleID','Date','Shift','Cashier','Items','Total','Method','AmountPaid','JobID','Status'], salesRows);
    csv += csvSection('=== PAYOUTS ===', ['PayoutID','Date','Shift','LoggedBy','TakenBy','Amount','Reason'], payoutRows);
    csv += csvSection('=== REVERSALS ===', ['SaleID','Date','Cashier','Items','Total','AmountPaid','Status'], reversalRows);
    csv += csvSection('=== PARTIAL BALANCES ===', ['SaleID','Date','Cashier','Customer','Items','Total','Paid','StillOwed'], partialRows);

    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'ServiCell_Report_' + from + '_to_' + to + '.csv';
    a.click(); URL.revokeObjectURL(url);
}

// ── Print Report (PDF) ────────────────────────────────────────────────────────
function exportPDF() {
    const { from, to } = getDateRange();
    const allS      = window._allSales || [];
    const allJobs   = window._allJobs  || [];
    const payouts   = window._allPayouts || [];
    const sales     = allS.filter(s => s.status !== 'reversed');
    const reversed  = allS.filter(s => s.status === 'reversed');
    const gross     = sumCollected(sales);
    const cashColl  = sumCash(sales);
    const cardColl  = sumCard(sales);
    const pTotal    = payouts.reduce((t, p) => t + (parseFloat(p.amount) || 0), 0);
    const netCash   = cashColl - pTotal;
    const totalTx   = sales.length + reversed.length;
    const revRate   = totalTx > 0 ? Math.round((reversed.length / totalTx) * 100) : 0;
    const partialOwed = computePartialOutstanding(window._allSales || sales).owed;
    const gstTotal = gstFromInclusive(gross);
    const variance = computeDrawerVariance(window._allCloses || []);

    const jobs = allJobs.filter(j => jobInDateRange(j, from, to));
    const completedJobs = jobs.filter(j => ['resolved','ready'].includes((j.status||'').toLowerCase()));

    const itemCounts = {};
    sales.forEach(s => { tryParseJSON(s.items, []).forEach(i => { if (i.name) itemCounts[i.name] = (itemCounts[i.name]||0) + (i.qty||1); }); });
    const topItems = Object.entries(itemCounts).sort((a,b) => b[1]-a[1]).slice(0, 8);

    const techRevenueAll = buildTechRevenue(sales.filter(s => saleInDateRange(s, from, to)));
    const techRevenue = {};
    Object.entries(techRevenueAll).forEach(([name, amt]) => {
        if (name === 'Unassigned' || isTechPerformanceEligible(name)) techRevenue[name] = amt;
    });
    const techs = {};
    jobs.forEach(j => {
        const t = techBucketForJob(j);
        if (t !== 'Unassigned' && !isTechPerformanceEligible(t)) return;
        if (!techs[t]) techs[t] = { completed: 0, assigned: 0 };
        techs[t].assigned++;
        if (jobCompletedInDateRange(j, from, to)) techs[t].completed++;
    });
    Object.keys(techRevenue).forEach(name => { if (!techs[name]) techs[name] = { completed: 0, assigned: 0 }; });
    const techSorted = Object.entries(techs)
        .filter(([name]) => name === 'Unassigned' || isTechPerformanceEligible(name))
        .sort((a,b) => b[1].completed - a[1].completed);
    const maxCompleted = Math.max(...techSorted.map(([,d]) => d.completed), 0);
    const maxRevenue   = Math.max(...techSorted.map(([n]) => techRevenue[n]||0), 0);
    const soloJobsWinner = techSorted.filter(([n,d]) => n !== 'Unassigned' && d.completed === maxCompleted && maxCompleted > 0).length === 1
        ? techSorted.find(([n,d]) => n !== 'Unassigned' && d.completed === maxCompleted)[0] : null;
    const soloRevWinner  = techSorted.filter(([n]) => n !== 'Unassigned' && (techRevenue[n]||0) === maxRevenue && maxRevenue > 0).length === 1
        ? techSorted.find(([n]) => n !== 'Unassigned' && (techRevenue[n]||0) === maxRevenue)[0] : null;

    const cashiers = {};
    sales.forEach(s => {
        const c = s.cashier || 'Unknown';
        if (!cashiers[c]) cashiers[c] = { sales: 0, revenue: 0 };
        cashiers[c].sales++;
        cashiers[c].revenue += saleCollectedAmount(s);
    });
    reversed.forEach(s => {
        const c = s.cashier || 'Unknown';
        if (!cashiers[c]) cashiers[c] = { sales: 0, revenue: 0, reversals: 0 };
        cashiers[c].reversals = (cashiers[c].reversals || 0) + 1;
    });
    const cashierSorted = Object.entries(cashiers).sort((a,b) => b[1].revenue - a[1].revenue);

    const statusCounts = {};
    jobs.forEach(j => { const s = (j.status||'received').toLowerCase(); statusCounts[s] = (statusCounts[s]||0) + 1; });

    // ── HTML ──
    const css = `
        body{font-family:Arial,sans-serif;padding:28px 32px;max-width:760px;margin:0 auto;color:#1a1a1a;font-size:13px;}
        h1{font-size:1.5rem;font-weight:800;margin:0 0 2px;}
        .sub{color:#64748b;font-size:0.82rem;margin-bottom:6px;}
        .meta{color:#64748b;font-size:0.78rem;margin-bottom:24px;padding-bottom:12px;border-bottom:2px solid #e2e8f0;}
        h2{font-size:0.72rem;text-transform:uppercase;letter-spacing:1.5px;color:#2563eb;margin:22px 0 8px;font-weight:800;}
        .kpi-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:4px;}
        .kpi{flex:1;min-width:100px;padding:12px 14px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;}
        .kpi-label{font-size:0.6rem;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:4px;}
        .kpi-val{font-size:1.25rem;font-weight:800;color:#1a1a1a;}
        table{width:100%;border-collapse:collapse;margin-bottom:4px;}
        th{text-align:left;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#64748b;padding:6px 8px;border-bottom:2px solid #e2e8f0;background:#f8fafc;}
        td{padding:7px 8px;border-bottom:1px solid #f1f5f9;font-size:0.85rem;vertical-align:middle;}
        tr:last-child td{border-bottom:none;}
        .badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:0.65rem;font-weight:700;margin-left:6px;}
        .badge-jobs{background:#dcfce7;color:#166534;}
        .badge-rev{background:#dbeafe;color:#1e40af;}
        .right{text-align:right;}
        .footer{margin-top:28px;font-size:0.72rem;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:12px;}
        @media print{@page{margin:15mm 18mm;}}
    `;

    const itemRows = topItems.map(([n,q]) =>
        '<tr><td>' + escH(n) + '</td><td class="right">' + q + '</td></tr>'
    ).join('') || '<tr><td colspan="2" style="color:#94a3b8;">No data</td></tr>';

    const techRows = techSorted.map(([name, d]) => {
        const rev = techRevenue[name] || 0;
        const badges = (name === soloJobsWinner ? '<span class="badge badge-jobs">Most Jobs</span>' : '')
                     + (name === soloRevWinner  ? '<span class="badge badge-rev">Top Revenue</span>' : '');
        return '<tr><td>' + escH(name) + badges + '</td>'
            + '<td class="right">' + d.assigned + '</td>'
            + '<td class="right">' + d.completed + '</td>'
            + '<td class="right">' + (rev > 0 ? bz(rev) : '—') + '</td></tr>';
    }).join('') || '<tr><td colspan="4" style="color:#94a3b8;">No data</td></tr>';

    const cashierRows = cashierSorted.map(([name, d]) =>
        '<tr><td>' + escH(name) + '</td><td class="right">' + d.sales + '</td><td class="right">' + bz(d.revenue) + '</td></tr>'
    ).join('') || '<tr><td colspan="3" style="color:#94a3b8;">No data</td></tr>';

    const statusRows = Object.entries(statusCounts).sort((a,b) => b[1]-a[1]).map(([s,c]) =>
        '<tr><td>' + escH(STATUS_LABELS[s] || (s.charAt(0).toUpperCase() + s.slice(1))) + '</td><td class="right">' + c + '</td></tr>'
    ).join('') || '<tr><td colspan="2" style="color:#94a3b8;">No data</td></tr>';

    const html = '<html><head><title>ServiCell Report</title><style>' + css + '</style></head><body>'
        + '<h1>ServiCell Belize &mdash; Performance Report</h1>'
        + '<div class="sub">Period: <strong>' + from + '</strong> to <strong>' + to + '</strong></div>'
        + '<div class="meta">Generated: ' + new Date().toLocaleString() + ' &nbsp;&bull;&nbsp; Confidential &mdash; Manager Use Only</div>'

        + '<h2>Financial Summary</h2>'
        + '<div class="kpi-row">'
        + '<div class="kpi"><div class="kpi-label">Gross Collected</div><div class="kpi-val">' + bz(gross) + '</div></div>'
        + '<div class="kpi"><div class="kpi-label">Cash / Card</div><div class="kpi-val">' + bz(cashColl) + ' / ' + bz(cardColl) + '</div></div>'
        + '<div class="kpi"><div class="kpi-label">Net Cash</div><div class="kpi-val">' + bz(netCash) + '</div></div>'
        + '<div class="kpi"><div class="kpi-label">Payouts</div><div class="kpi-val">' + bz(pTotal) + '</div></div>'
        + '<div class="kpi"><div class="kpi-label">Transactions</div><div class="kpi-val">' + sales.length + '</div></div>'
        + '<div class="kpi"><div class="kpi-label">Reversals</div><div class="kpi-val">' + reversed.length + ' (' + revRate + '%)</div></div>'
        + '<div class="kpi"><div class="kpi-label">Partial Owed</div><div class="kpi-val">' + bz(partialOwed) + '</div></div>'
        + '<div class="kpi"><div class="kpi-label">GST Included</div><div class="kpi-val">' + bz(gstTotal) + '</div></div>'
        + '<div class="kpi"><div class="kpi-label">Drawer Variance</div><div class="kpi-val">' + bz(variance.net) + '</div></div>'
        + '<div class="kpi"><div class="kpi-label">Jobs Completed</div><div class="kpi-val">' + completedJobs.length + '</div></div>'
        + '</div>'

        + '<h2>Technician Performance</h2>'
        + '<table><tr><th>Technician</th><th class="right">Assigned</th><th class="right">Completed</th><th class="right">Revenue</th></tr>'
        + techRows + '</table>'

        + '<h2>Cashier Performance</h2>'
        + '<table><tr><th>Cashier</th><th class="right">Sales</th><th class="right">Gross Revenue</th></tr>'
        + cashierRows + '</table>'

        + '<h2>Job Status Breakdown</h2>'
        + '<table><tr><th>Status</th><th class="right">Count</th></tr>'
        + statusRows + '</table>'

        + '<h2>Top Selling Items</h2>'
        + '<table><tr><th>Item</th><th class="right">Qty Sold</th></tr>'
        + itemRows + '</table>'

        + '<div class="footer">ServiCell Belize Staff Portal &bull; This report is confidential and intended for management use only.</div>'
        + '</body></html>';

    const w = window.open('', '_blank', 'width=820,height=900');
    if (!w) { alert('Allow popups to print the report.'); return; }
    w.document.write(html); w.document.close(); w.focus(); w.print();
    setTimeout(() => w.close(), 1500);
}
