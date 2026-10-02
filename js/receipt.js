// ── Shared Receipt Helper ─────────────────────────────────────────────────────
// Used by: current-jobs.html, new-job.html, sales.js
// Requires: js/qz-drawer.js loaded before this file

const RECEIPT_STYLES = `
@media print { @page { size: 72mm auto; margin: 0; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; color: #000 !important; background: transparent !important; -webkit-font-smoothing: none !important; -moz-osx-font-smoothing: unset !important; text-rendering: geometricPrecision !important; } body, #printInvoice, .po-slip, .po-report { background: white !important; color: #000 !important; } body:has(.po-slip) { text-align: left; } img { display: block !important; } }
#printInvoice { font-family: 'Courier New', Courier, monospace; color: #000; background: white; width: 100%; max-width: 100%; margin: 0 auto; padding: 3mm 3mm 12mm 3mm; font-size: 11px; font-weight: 700; line-height: 1.4; letter-spacing: 0; box-sizing: border-box; -webkit-font-smoothing: none; text-rendering: geometricPrecision; }
#printInvoice * { font-weight: 700; box-sizing: border-box; color: #000; }
.pi-shop { text-align: center; margin-bottom: 4px; }
.pi-shop img { max-width: 72px; margin-bottom: 2px; display: block; margin-left: auto; margin-right: auto; }
.pi-shop h1 { font-size: 15px; font-weight: 900; letter-spacing: 0.5px; margin: 0 0 2px; }
.pi-shop p { font-size: 10px; margin: 1px 0; letter-spacing: 0; }
.pi-shop-tagline { font-size: 9px; white-space: nowrap; letter-spacing: -0.25px; }
.pi-rule { border: none; border-top: 2px solid #000; margin: 4px 0 3px; }
.pi-dash { border: none; border-top: 1px solid #000; margin: 3px 0 2px; }
.pi-title { text-align: center; font-size: 11px; font-weight: 900; letter-spacing: 0.3px; text-transform: uppercase; margin: 2px 0 3px; }
.pi-meta { font-size: 10px; line-height: 1.4; margin-bottom: 2px; }
.pi-meta-row { font-size: 10px; margin: 2px 0 3px; padding: 3px 4px; background: transparent; border: 1px solid #000; line-height: 1.4; }
.pi-meta-row strong { display: block; }
.pi-section { font-size: 9px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; margin: 3px 0 1px; }
.pi-grid { margin-bottom: 2px; }
.pi-field-label { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0; }
.pi-field-value { font-size: 11px; padding: 1px 0; border-bottom: 1px solid #000; min-height: 12px; margin-bottom: 2px; }
.pi-notes { border: 1px solid #000; padding: 3px 4px; min-height: 18px; font-size: 10px; line-height: 1.4; margin: 2px 0 4px; }
.pi-cost-table { width: 100%; border-collapse: collapse; margin: 2px 0 4px; font-size: 10px; }
.pi-cost-table th { text-align: left; font-size: 9px; font-weight: 900; letter-spacing: 0.3px; text-transform: uppercase; padding: 2px 0; border-bottom: 2px solid #000; }
.pi-cost-table th:last-child { text-align: right; }
.pi-cost-table td { padding: 2px 0; border-bottom: 1px solid #000; }
.pi-cost-table td:last-child { text-align: right; }
.pi-cost-table .pi-total-row td { border-top: 2px solid #000; border-bottom: none; font-size: 12px; font-weight: 900; padding-top: 3px; }
.pi-payment-status { text-align: center; font-size: 10px; margin: 3px 0 4px; padding: 3px 4px; background: transparent; border: 1px solid #000; font-weight: 900; }
.pi-footer { text-align: center; font-size: 9px; margin-top: 4px; border-top: 1px solid #000; padding-top: 3px; line-height: 1.4; }
.pi-qr { text-align: center; margin-top: 5px; }
.pi-qr img { max-width: 110px; margin: 0 auto 3px; display: block !important; }
.pi-qr-text { font-size: 10px; font-weight: 900; letter-spacing: 0.3px; }
.pi-sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 6px; }
.pi-sig { border-top: 1px solid #000; padding-top: 2px; font-size: 9px; text-align: center; }
.po-slip { font-family: 'Courier New', Courier, monospace; color: #000; background: #fff; width: 68mm; margin: 0 auto; padding: 2mm 2mm 10mm; font-size: 11px; font-weight: 700; line-height: 1.35; text-align: left; }
.po-slip * { box-sizing: border-box; color: #000; font-weight: 700; }
.po-rule-eq { display: block; width: 100%; height: 0; border: none; border-top: 2px solid #000; margin: 5px 0; }
.po-rule-dash { display: block; width: 100%; height: 0; border: none; border-top: 1px dashed #000; margin: 5px 0; }
.po-banner { text-align: center; margin: 3px 0; }
.po-company { font-size: 12px; font-weight: 900; letter-spacing: 0.4px; margin: 0 0 2px; }
.po-title { font-size: 11px; font-weight: 900; letter-spacing: 0.5px; margin: 0; }
.po-meta-row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; font-size: 10px; line-height: 1.5; letter-spacing: 0.2px; margin: 2px 0; font-weight: 700; }
.po-meta-row span:last-child { text-align: right; white-space: nowrap; flex-shrink: 0; }
.po-meta-row span:first-child { min-width: 0; word-break: break-word; }
.po-block { margin: 2px 0; }
.po-line { font-size: 11px; font-weight: 700; line-height: 1.35; margin: 1px 0; word-break: break-word; }
.po-line .po-k { font-weight: 900; }
.po-line-label { font-size: 11px; font-weight: 900; margin: 0 0 2px; line-height: 1.35; }
.po-line-body { font-size: 11px; font-weight: 700; line-height: 1.35; word-break: break-word; margin: 0 0 2px; }
.po-total-line { font-size: 12px; font-weight: 700; line-height: 1.35; margin: 2px 0 0; }
.po-total-line .po-k { font-weight: 900; }
.po-words { font-size: 10px; font-weight: 700; line-height: 1.35; margin: 0 0 2px; }
.po-foot { margin-top: 2px; font-size: 10px; font-weight: 700; text-align: center; line-height: 1.35; }
.po-slip#printInvoice, .po-slip#printInvoice * { font-weight: 700 !important; }
.po-slip#printInvoice .po-company, .po-slip#printInvoice .po-title, .po-slip#printInvoice .po-line-label, .po-slip#printInvoice .po-total-line, .po-slip#printInvoice .po-k { font-weight: 900 !important; }
.po-report { font-family: 'Courier New', Courier, monospace; color: #000; background: #fff; width: 68mm; margin: 0 auto; padding: 2mm 2mm 12mm; font-weight: 700; font-size: 11px; line-height: 1.5; letter-spacing: 0.2px; }
.po-report * { box-sizing: border-box; color: #000; font-weight: 700; }
.po-report-head { text-align: center; margin-bottom: 3px; }
.po-report-company { font-size: 15px; font-weight: 900; letter-spacing: 0.4px; margin: 0 0 2px; }
.po-report-title { font-size: 12px; font-weight: 900; margin: 0 0 2px; }
.po-report-date { font-size: 11px; font-weight: 700; margin: 0 0 2px; }
.po-report-rule { height: 0; border: none; border-top: 2px solid #000; margin: 5px 0; }
.po-report-table { width: 100%; border-collapse: collapse; font-size: 11px; font-weight: 700; line-height: 1.5; letter-spacing: 0.2px; }
.po-report-table th { text-align: left; font-size: 10px; font-weight: 900; padding: 3px 2px; border-bottom: 2px solid #000; }
.po-report-table th.col-amt { text-align: right; }
.po-report-table td { padding: 3px 2px; border-bottom: 1px solid #000; vertical-align: top; word-break: break-word; }
.po-report-table td + td { padding-left: 4px; }
.po-report-table td.col-amt { text-align: right; font-weight: 900; white-space: nowrap; padding-left: 6px; }
.po-report-table tr.total td { border-top: 3px solid #000; border-bottom: none; font-size: 13px; font-weight: 900; padding-top: 4px; }
.po-report-table tr.total td.col-amt { text-align: right; }
.po-report-table td.empty { text-align: center; padding: 8px 0; border-bottom: none; }
.po-report-foot { text-align: center; font-size: 10px; font-weight: 700; margin-top: 6px; border-top: 1px dashed #000; padding-top: 4px; line-height: 1.35; }
`;

const RECEIPT_FONT_LINK = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&display=swap">';
const PO_FONT_LINK = RECEIPT_FONT_LINK;
const QR_LIBRARY = '<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>';

let _cachedLogoDataUrl = null;

function _receiptLogoSrc(fallback) {
    return _cachedLogoDataUrl || fallback || 'img/logo.png';
}

function _preloadReceiptLogo() {
    const img = new Image();
    img.onload = function() {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.getContext('2d').drawImage(img, 0, 0);
            _cachedLogoDataUrl = canvas.toDataURL('image/png');
        } catch (_) {}
    };
    img.src = new URL('img/logo.png', window.location.href).href;
}

if (typeof document !== 'undefined') {
    const _startLogoPreload = function() { _preloadReceiptLogo(); };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _startLogoPreload);
    } else {
        _startLogoPreload();
    }
}

function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/** Logged-at stamps already include 12-hour time. Older rows are date-only. */
function _receivedLabel(raw, dateOnly) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (/\b(?:AM|PM)\b/i.test(s)) return s;
    return dateOnly(s);
}

// ── Job Receipt (current-jobs.html + new-job.html) ────────────────────────────
function buildJobReceiptHTML(j, opts) {
    opts = opts || {};
    const isEstimate = !!(opts.isEstimate || j.isEstimate);
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    function bzDate(d) {
        if (!d || d === '—') return '—';
        try { return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
        catch(_) { return d; }
    }

    function fmtPhone(p) {
        if (!p) return '—';
        const c = p.replace(/\D/g,'');
        return c.length === 7 ? '+501 ' + c.slice(0,3) + '-' + c.slice(3) : p;
    }

    const priorityLabel = (j.priority||'low').toLowerCase() === 'high' ? 'HIGH — URGENT' : 'LOW — NORMAL';
    const receivedDate  = j.dateReceived ? _receivedLabel(j.dateReceived, bzDate) : today;
    const estimatedDate = j.estimatedCompletion || '—';

    // Cost table
    const items = (() => {
        if (!j.invoiceItems || j.invoiceItems === '—') return [];
        try { return JSON.parse(j.invoiceItems); } catch(_) { return []; }
    })();
    const total = items.reduce((s,i) => s + (parseFloat(i.price||0)||0), 0);

    let paymentStatus = 'N/A — Invoice Pending';
    if (items.length && total > 0) {
        const p = String(j.payment||'unpaid').toLowerCase();
        paymentStatus = p.startsWith('paid') ? 'Paid via ' + (p.includes('card') ? 'Card' : 'Cash') : 'UNPAID';
    }

    const costTableHTML = items.length ? `
        <table class="pi-cost-table">
            <thead><tr><th>Service</th><th>BZD</th></tr></thead>
            <tbody>
                ${items.map(i => `<tr><td>${_esc(i.desc||'')}</td><td>${(parseFloat(i.price||0)||0).toFixed(2)}</td></tr>`).join('')}
                <tr class="pi-total-row"><td><strong>TOTAL</strong></td><td><strong>${total.toFixed(2)}</strong></td></tr>
            </tbody>
        </table>` :
        `<div class="pi-notes" style="text-align:center;"><strong>${isEstimate ? 'Quotation only. Final price finalized upon device inspection.' : 'Price To Be Determined'}</strong>${isEstimate ? '' : '<br><span style="font-size:7px;">Final cost after diagnostic.</span>'}</div>`;

    const inspectionHTML = (j.inspection && j.inspection !== 'No damage noted')
        ? `<div class="pi-section">Inspection</div><div class="pi-notes">${_esc(j.inspection).replace(/;/g, '<br>')}</div>`
        : '';

    const imgSrc = opts.imgSrc || _receiptLogoSrc();
    
    // Generate QR code URL for job tracking
    const jobId = j.id;
    const trackerUrl = `https://servicellbze.github.io/ServiCell/tracker.html?job=${jobId}`;
    // Use quickchart.io - a free, reliable QR code API
    const qrCodeUrl = `https://quickchart.io/qr?text=${encodeURIComponent(trackerUrl)}&size=120`;

    return `<style>${RECEIPT_STYLES}</style>
<div id="printInvoice">
    <div class="pi-shop">
        <img src="${imgSrc}" alt="Servicell Belize">
        <h1>SERVICELL BELIZE</h1>
        <p class="pi-shop-tagline">Device Repair &amp; Services &middot; Belize City, Belize</p>
        <p>Tel: +501 615-3388</p>
    </div>
    <hr class="pi-rule">
    <div class="pi-title">${isEstimate ? 'Repair Estimate' : 'Job Receipt &amp; Intake Form'}</div>
    ${isEstimate ? '<div class="pi-notes" style="text-align:center;font-size:8px;margin-bottom:4px;">Quotation only. Final price finalized upon device inspection.</div>' : ''}
    <div class="pi-meta">
        <div><strong>${isEstimate ? 'ESTIMATE #' : 'JOB #:'}</strong> ${_esc(j.id)}</div>
        <div><strong>DATE:</strong> ${_esc(receivedDate)}</div>
    </div>
    <div class="pi-meta-row">
        <strong>Type: ${_esc(j.jobType||'Repair')}</strong>
        <strong>Priority: ${_esc(priorityLabel)}</strong>
        <strong>Issued By: ${_esc(_jobIssuedByName(j))}</strong>
    </div>
    <hr class="pi-dash">
    <div class="pi-section">Customer Information</div>
    <div class="pi-grid">
        <div class="pi-field-label">Name</div>
        <div class="pi-field-value">${_esc(j.customerName||'Walk-in')}</div>
        <div class="pi-field-label">Phone</div>
        <div class="pi-field-value">${_esc(fmtPhone(j.customerPhone))}</div>
    </div>
    <div class="pi-section">Device Information</div>
    <div class="pi-grid">
        <div class="pi-field-label">Device</div>
        <div class="pi-field-value">${_esc(j.device||'—')}</div>
        <div class="pi-field-label">Issue Reported</div>
        <div class="pi-field-value">${_esc(j.issue||'—')}</div>
        <div class="pi-field-label">Status</div>
        <div class="pi-field-value">${_esc(_jobFmtStatus(j.status))}</div>
        <div class="pi-field-label">${j.dateCompleted ? 'Completed On' : 'Est. Completion'}</div>
        <div class="pi-field-value">${_esc(j.dateCompleted ? bzDate(j.dateCompleted) : estimatedDate)}</div>
    </div>
    <div class="pi-section">Work Notes</div>
    <div class="pi-notes">${_esc(j.notes||'No additional notes.')}</div>
    ${inspectionHTML}
    <div class="pi-section">Cost Breakdown</div>
    ${costTableHTML}
    ${isEstimate ? '' : `<div class="pi-payment-status"><strong>Payment Status:</strong> ${_esc(paymentStatus)}</div>`}
    <div class="pi-footer">Thank you for choosing Servicell Belize!<br>${isEstimate ? 'Quotation only — approve in store to start repair.<br>' : 'Devices not collected within <strong>90 days of completion</strong> may be considered <strong>abandoned</strong>.<br>'}We are not responsible for data loss. Please back up your device.</div>
    ${isEstimate ? '' : `<hr class="pi-dash">
    <div class="pi-qr">
        <img src="${qrCodeUrl}" alt="Track Your Repair">
        <div class="pi-qr-text">SCAN TO TRACK YOUR REPAIR</div>
    </div>`}
</div>`;
}

// ── Sale Receipt (sales.js) ───────────────────────────────────────────────────
function _receiptPaymentSummary(total, amountPaid, method, receiptOpts) {
    const opts = receiptOpts || {};
    const invoiceTotal = parseFloat(total) || 0;
    const paidThisVisit = opts.paidThisVisit != null
        ? parseFloat(opts.paidThisVisit) || 0
        : parseFloat(amountPaid) || 0;
    const priorPaid = parseFloat(opts.priorPaid) || 0;
    const totalPaid = opts.totalPaid != null
        ? parseFloat(opts.totalPaid) || 0
        : priorPaid + paidThisVisit;
    const balanceDue = opts.balanceDue != null
        ? Math.max(0, parseFloat(opts.balanceDue) || 0)
        : Math.max(0, invoiceTotal - totalPaid);
    const isPartial = method === 'partial'
        || balanceDue > 0.009
        || (totalPaid + 0.009 < invoiceTotal);
    const displayMethod = method === 'partial'
        ? 'Partial payment'
        : (method ? method.charAt(0).toUpperCase() + method.slice(1) : 'Cash');
    const change = !isPartial && method === 'cash'
        ? Math.max(0, paidThisVisit - invoiceTotal)
        : 0;
    return {
        invoiceTotal, paidThisVisit, priorPaid, totalPaid, balanceDue, isPartial, displayMethod, change
    };
}

function _receiptPaymentRowsHTML(summary, bz, esc) {
    const s = summary;
    if (!s.isPartial) {
        let html = `<tr class="divider"><td colspan="3">TOTAL</td><td style="text-align:right">${bz(s.invoiceTotal)}</td></tr>`
            + `<tr><td colspan="3">Paid (${esc(s.displayMethod)})</td><td style="text-align:right">${bz(s.paidThisVisit)}</td></tr>`;
        if (s.change > 0.009) {
            html += `<tr><td colspan="3">Change</td><td style="text-align:right">${bz(s.change)}</td></tr>`;
        }
        return html;
    }
    let html = `<tr class="divider"><td colspan="3">INVOICE TOTAL</td><td style="text-align:right">${bz(s.invoiceTotal)}</td></tr>`;
    if (s.priorPaid > 0.009) {
        html += `<tr><td colspan="3">Paid previously</td><td style="text-align:right">${bz(s.priorPaid)}</td></tr>`;
    }
    html += `<tr class="partial-paid"><td colspan="3">Paid this visit (${esc(s.displayMethod)})</td><td style="text-align:right">${bz(s.paidThisVisit)}</td></tr>`;
    html += `<tr><td colspan="3">Total paid to date</td><td style="text-align:right">${bz(s.totalPaid)}</td></tr>`;
    html += `<tr class="partial-due"><td colspan="3">BALANCE DUE</td><td style="text-align:right">${bz(s.balanceDue)}</td></tr>`;
    return html;
}

function buildSaleReceiptHTML(items, total, amountPaid, method, saleId, customer, cashier, receiptOpts) {
    const pay = _receiptPaymentSummary(total, amountPaid, method, receiptOpts);
    const gst     = pay.invoiceTotal * 12.5 / 112.5;
    const preTax  = pay.invoiceTotal - gst;
    function bz(n) { return 'BZ$' + parseFloat(n||0).toFixed(2); }
    
    const friendlyName = resolveStaffDisplayName(cashier) || 'Staff';

    const rows = items.map(i =>
        `<tr><td>${_esc(i.name)}</td><td style="text-align:center">${i.qty}</td><td style="text-align:right">${bz(i.price)}</td><td style="text-align:right">${bz(i.total != null ? i.total : (i.price || 0) * (i.qty || 1))}</td></tr>`
    ).join('');

    const partialFooter = pay.isPartial
        ? '<br>Partial payment — remaining balance due is shown above.'
        : '';

    return `<style>
@media print { @page { size: 72mm auto; margin: 0; } * { -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; color:#000!important; background:transparent!important; -webkit-font-smoothing:none!important; text-rendering:geometricPrecision!important; } body { background:white!important; } }
#printInvoice { font-family:'Courier New',Courier,monospace; font-size:12px; font-weight:700; width:100%; max-width:100%; margin:0 auto; padding:3mm 3mm 12mm 3mm; line-height:1.4; letter-spacing:0; box-sizing:border-box; background:white; color:#000; -webkit-font-smoothing:none; text-rendering:geometricPrecision; }
#printInvoice * { box-sizing:border-box; font-weight:700; color:#000; }
#printInvoice h2 { text-align:center; font-size:16px; font-weight:900; letter-spacing:0.5px; margin:0 0 2px; }
#printInvoice p { text-align:center; margin:1px 0; font-size:11px; }
#printInvoice img { display:block; margin:0 auto 3px; max-width:72px; }
#printInvoice hr { border:none; border-top:1px solid #000; margin:4px 0 3px; }
#printInvoice hr.solid { border-top:2px solid #000; margin:4px 0 3px; }
#printInvoice table { width:100%; border-collapse:collapse; font-size:11px; }
#printInvoice th { border-bottom:2px solid #000; padding:3px 0; font-size:10px; text-align:left; font-weight:900; letter-spacing:0.3px; text-transform:uppercase; }
#printInvoice th:nth-child(2),#printInvoice th:nth-child(3),#printInvoice th:nth-child(4) { text-align:right; }
#printInvoice td { padding:3px 0; border-bottom:1px solid #000; }
#printInvoice .divider td { border-top:2px solid #000; border-bottom:none; font-size:13px; font-weight:900; padding-top:4px; }
#printInvoice .gst-row td { border-bottom:1px solid #000; font-size:11px; }
#printInvoice .partial-paid td { font-weight:900; }
#printInvoice .partial-due td { border-top:2px double #000; border-bottom:2px double #000; font-size:13px; font-weight:900; padding:4px 0; }
#printInvoice .footer { text-align:center; font-size:11px; margin-top:5px; border-top:1px solid #000; padding-top:4px; line-height:1.4; }
</style>
<div id="printInvoice">
<img src="${_receiptLogoSrc()}" alt="Servicell Belize">
<h2>SERVICELL BELIZE</h2>
<p>#7 Douglas Jones, Belize City</p>
<p>Tel: +501 615-3388</p>
<p>${new Date().toLocaleString()}</p>
<p>Served by: ${_esc(friendlyName)}</p>
${customer ? `<p>Customer: ${_esc(customer)}</p>` : ''}
<p>Receipt #${_esc(saleId||'')}</p>
<hr class="solid">
<table>
    <tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>
    ${rows}
    <tr class="divider"><td colspan="3">Subtotal (excl. GST)</td><td style="text-align:right">${bz(preTax)}</td></tr>
    <tr class="gst-row"><td colspan="3">GST (12.5% incl.)</td><td style="text-align:right">${bz(gst)}</td></tr>
    ${_receiptPaymentRowsHTML(pay, bz, _esc)}
</table>
<div class="footer">Thank you for choosing Servicell Belize!<br>Prices include GST.${partialFooter}</div>
</div>`;
}

// ── Payout slip & report (sales.js) ───────────────────────────────────────────
function _intToWords(n) {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    n = Math.floor(Math.abs(n));
    if (n === 0) return 'Zero';
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) {
        return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + _intToWords(n % 100) : '');
    }
    if (n < 1000000) {
        return _intToWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + _intToWords(n % 1000) : '');
    }
    return _intToWords(Math.floor(n / 1000000)) + ' Million' + (n % 1000000 ? ' ' + _intToWords(n % 1000000) : '');
}

function amountToWordsLine(amount) {
    const n = Math.round((parseFloat(amount) || 0) * 100) / 100;
    const dollars = Math.floor(n);
    const cents = Math.round((n - dollars) * 100);
    const dollarPart = _intToWords(dollars) + (dollars === 1 ? ' Dollar' : ' Dollars');
    if (cents > 0) {
        return dollarPart + ' and ' + _intToWords(cents) + (cents === 1 ? ' Cent' : ' Cents');
    }
    return dollarPart + ' only';
}

function amountToWords(amount) {
    return amountToWordsLine(amount);
}

function formatPayoutSlipDate(ts) {
    const d = ts ? new Date(ts) : new Date();
    if (isNaN(d.getTime())) return '— / — / —';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return dd + ' / ' + mm + ' / ' + yyyy;
}

function formatPayoutSlipDateShort(ts) {
    const d = ts ? new Date(ts) : new Date();
    if (isNaN(d.getTime())) return '—/—/—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return dd + '/' + mm + '/' + yyyy;
}

function formatPayoutSlipTime(ts) {
    const d = ts ? new Date(ts) : new Date();
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatPayoutSlipNo(payoutId) {
    if (!payoutId) return '—';
    const s = String(payoutId).trim();
    const m = s.match(/^P-(\d+)$/i);
    if (m) return 'P-' + m[1].slice(-6);
    const digits = s.replace(/\D/g, '');
    if (digits.length > 6) return 'P-' + digits.slice(-6);
    return s;
}

const STAFF_DISPLAY_NAMES = {
    cashier_chee:      'Ericson C.',
    cashier_nova24:    'Shane N.',
    cashier_coleman:   'Kiana C.',
    manager_chee:      'Eric C.',
    technician_bailey: 'Kareem B.',
    technician_bat:    'Bat'
};

function formatProfessionalStaffName(name) {
    if (!name) return '';
    const trimmed = String(name).trim();
    if (!trimmed) return '';
    if (/^[A-Za-z]+\s+[A-Za-z]\.$/.test(trimmed)) return trimmed;
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return parts[0] + ' ' + parts[parts.length - 1].charAt(0).toUpperCase() + '.';
    }
    return parts[0];
}

function resolveStaffDisplayName(username) {
    if (!username) return '—';
    const key = String(username).trim();
    const lower = key.toLowerCase();
    if (STAFF_DISPLAY_NAMES[lower]) return STAFF_DISPLAY_NAMES[lower];
    try {
        const sessionUser = localStorage.getItem('scUser') || sessionStorage.getItem('scUser') || '';
        const sessionName = localStorage.getItem('scDisplayName') || sessionStorage.getItem('scDisplayName') || '';
        if (sessionName && sessionUser.toLowerCase() === lower) {
            return formatProfessionalStaffName(sessionName) || sessionName;
        }
    } catch (_) {}
    const stripped = key.replace(/^(Cashier_|Manager_|Technician_)/i, '').replace(/_/g, ' ').trim();
    if (stripped && stripped !== key) {
        return stripped.charAt(0).toUpperCase() + stripped.slice(1).toLowerCase();
    }
    return formatProfessionalStaffName(key) || key;
}
window.resolveStaffDisplayName = resolveStaffDisplayName;
window.formatProfessionalStaffName = formatProfessionalStaffName;

/** Staff-facing “Logged by” in job modals: username when known, else receipt Issued By fallback. */
function scJobLoggedByStaff(j) {
    if (!j) return '—';
    const createdBy = String(j.createdBy || '').trim();
    if (createdBy) return createdBy;
    return _jobIssuedByName(j);
}
window.scJobLoggedByStaff = scJobLoggedByStaff;

function _jobIssuedByName(j) {
    if (!j) return '—';
    const createdBy = String(j.createdBy || '').trim();
    if (createdBy) return resolveStaffDisplayName(createdBy);
    const tech = String(j.technician || '').trim();
    const techLower = tech.toLowerCase();
    if (tech && techLower !== 'unassigned' && techLower !== 'unknown') {
        return resolveStaffDisplayName(tech);
    }
    try {
        const sessionUser = localStorage.getItem('scUser') || sessionStorage.getItem('scUser') || '';
        if (sessionUser) return resolveStaffDisplayName(sessionUser);
    } catch (_) {}
    return '—';
}

function buildPayoutSlipHTML(p, loggedByUser) {
    const amount     = parseFloat(p.amount) || 0;
    const slipNo     = formatPayoutSlipNo(p.payoutId);
    const dateLong   = formatPayoutSlipDate(p.timestamp);
    const dateShort  = formatPayoutSlipDateShort(p.timestamp);
    const timeStr    = formatPayoutSlipTime(p.timestamp);
    const author     = p.loggedBy || loggedByUser || '';
    const issuedBy   = resolveStaffDisplayName(author);
    const receivedBy = p.takenBy || '—';
    const reasonRaw  = (p.reason || '').trim();
    const reason     = reasonRaw || '---';
    const shift      = p.shift || '—';
    const words      = amountToWordsLine(amount);

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${RECEIPT_STYLES}</style></head><body>
<div class="po-slip" id="printInvoice">
    <div class="po-rule-eq" aria-hidden="true"></div>
    <div class="po-banner">
        <div class="po-company">SERVICELL BELIZE</div>
        <div class="po-title">PAYOUT SLIP</div>
    </div>
    <div class="po-rule-eq" aria-hidden="true"></div>

    <div class="po-meta-row"><span>Slip No: #${_esc(slipNo)}</span><span>Date: ${dateShort}</span></div>
    <div class="po-meta-row"><span>Shift: ${_esc(shift)}</span><span>Time: ${timeStr}</span></div>

    <div class="po-rule-dash" aria-hidden="true"></div>

    <div class="po-block">
        <div class="po-line"><span class="po-k">ISSUED BY:</span> ${_esc(issuedBy)}</div>
        <div class="po-line"><span class="po-k">RECEIVED BY:</span> ${_esc(receivedBy)}</div>
    </div>

    <div class="po-rule-dash" aria-hidden="true"></div>

    <div class="po-block">
        <div class="po-line-label">PURPOSE / REASON:</div>
        <div class="po-line-body">${_esc(reason)}</div>
    </div>

    <div class="po-rule-dash" aria-hidden="true"></div>

    <div class="po-block">
        <div class="po-total-line"><span class="po-k">TOTAL PAID:</span> BZ$${amount.toFixed(2)}</div>
        <div class="po-words">(${_esc(words)})</div>
    </div>

    <div class="po-rule-dash" aria-hidden="true"></div>

    <div class="po-foot">Authorized on ${dateLong}</div>
</div></body></html>`;
}

function buildPayoutsReportHTML(payouts, displayDate) {
    const list  = [...(payouts || [])].reverse();
    const total = list.reduce((t, p) => t + (parseFloat(p.amount) || 0), 0);
    const dateLabel = displayDate || formatPayoutSlipDateShort(Date.now()).replace(/\//g, '-');

    function bzAmt(n) {
        return 'BZ$' + (parseFloat(n) || 0).toFixed(2);
    }

    const rows = list.length
        ? list.map(p => {
            const reason  = ((p.reason || '').trim() || '---').substring(0, 30);
            const takenBy = (p.takenBy || '').trim();
            const time    = p.timestamp
                ? new Date(p.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                : '';
            return '<tr>'
                + '<td>' + _esc(time) + '</td>'
                + '<td>' + _esc(reason) + '</td>'
                + '<td>' + _esc(takenBy) + '</td>'
                + '<td class="col-amt">' + bzAmt(p.amount) + '</td>'
                + '</tr>';
        }).join('')
        : '<tr><td colspan="4" class="empty">No payouts</td></tr>';

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Payouts Report</title><style>${RECEIPT_STYLES}</style></head><body>
<div class="po-report" id="printInvoice">
    <div class="po-report-head">
        <div class="po-report-company">SERVICELL BELIZE</div>
        <div class="po-report-title">Payouts Report</div>
        <div class="po-report-date">${_esc(dateLabel)}</div>
    </div>
    <div class="po-report-rule" aria-hidden="true"></div>
    <table class="po-report-table">
        <thead>
            <tr>
                <th>Time</th>
                <th>Reason</th>
                <th>Taken By</th>
                <th class="col-amt">Amount</th>
            </tr>
        </thead>
        <tbody>
            ${rows}
            <tr class="total">
                <td colspan="3">Total Payouts</td>
                <td class="col-amt">${bzAmt(total)}</td>
            </tr>
        </tbody>
    </table>
    <div class="po-report-foot">Printed ${_esc(new Date().toLocaleString())}</div>
</div></body></html>`;
}
window.buildPayoutsReportHTML = buildPayoutsReportHTML;

// ── Unified print entry point ─────────────────────────────────────────────────
// Browser print dialog (faithful formatting). QZ Tray is cash drawer only.
let _printInFlight = false;

function printHTML(htmlContent) {
    if (_printInFlight) return;
    _printInFlight = true;

    const qrMatch = htmlContent.match(/https:\/\/quickchart\.io\/qr[^"'\s]+/);

    function _releasePrintLock() {
        setTimeout(function() { _printInFlight = false; }, 400);
    }

    function _dispatchPrint() {
        _windowPrint(htmlContent, _releasePrintLock);
    }

    if (qrMatch) {
        const qrUrl = qrMatch[0];
        const preloadImg = new Image();
        let finished = false;

        function _finishPreload() {
            if (finished) return;
            finished = true;
            _dispatchPrint();
        }

        preloadImg.onload = _finishPreload;
        preloadImg.onerror = function() {
            console.warn('QR code failed to preload, printing anyway');
            _finishPreload();
        };
        preloadImg.src = qrUrl;
        setTimeout(_finishPreload, 800);
        return;
    }

    _dispatchPrint();
}

function _waitForPrintImages(doc, maxMs) {
    return new Promise(function(resolve) {
        const images = Array.from(doc.getElementsByTagName('img'));
        if (!images.length) {
            resolve();
            return;
        }

        let pending = 0;
        images.forEach(function(img) {
            if (!img.complete || img.naturalWidth === 0) pending++;
        });

        if (pending === 0) {
            resolve();
            return;
        }

        let settled = false;
        function finish() {
            if (settled) return;
            settled = true;
            resolve();
        }

        function oneDone() {
            pending--;
            if (pending <= 0) finish();
        }

        images.forEach(function(img) {
            if (img.complete && img.naturalWidth > 0) return;
            img.addEventListener('load', oneDone, { once: true });
            img.addEventListener('error', oneDone, { once: true });
        });

        setTimeout(finish, maxMs);
    });
}

function _windowPrint(htmlContent, onDone) {
    function finish(ok) {
        if (typeof onDone === 'function') onDone(ok !== false);
    }

    function runPrint(doc, win) {
        let printed = false;
        function triggerPrint() {
            if (printed) return;
            printed = true;
            try { win.focus(); } catch (_) {}
            setTimeout(function() {
                try { win.print(); } catch (_) { finish(false); return; }
                setTimeout(function() {
                    try { if (win !== window && win.close) win.close(); } catch (_) {}
                    finish(true);
                }, 600);
            }, 0);
        }
        _waitForPrintImages(doc, 600).then(triggerPrint);
        setTimeout(triggerPrint, 800);
    }

    const w = window.open('', '_blank', 'width=400,height=600,alwaysRaised=yes');
    if (w) {
        w.document.open();
        w.document.write(htmlContent);
        w.document.close();
        if (w.document.readyState === 'complete') {
            runPrint(w.document, w);
        } else {
            w.addEventListener('load', function() { runPrint(w.document, w); }, { once: true });
        }
        return;
    }

    let frame = document.getElementById('_scPrintFrame');
    if (!frame) {
        frame = document.createElement('iframe');
        frame.id = '_scPrintFrame';
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText = 'position:fixed;width:0;height:0;border:none;opacity:0;pointer-events:none;left:-9999px;';
        document.body.appendChild(frame);
    }

    const fwin = frame.contentWindow;
    const fdoc = fwin.document;
    fdoc.open();
    fdoc.write(htmlContent);
    fdoc.close();
    runPrint(fdoc, fwin);
}

// ── Mobile preview & text sharing ─────────────────────────────────────────────

function isMobileReceipt() {
    return window.matchMedia('(max-width: 768px)').matches
        || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function _receiptNotify(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type || 'ok');
}

function _receiptCashierName(cashier) {
    return resolveStaffDisplayName(cashier) || 'Staff';
}

function buildSaleReceiptText(items, total, amountPaid, method, saleId, customer, cashier, receiptOpts) {
    const pay = _receiptPaymentSummary(total, amountPaid, method, receiptOpts);
    const gst = pay.invoiceTotal * 12.5 / 112.5;
    const preTax = pay.invoiceTotal - gst;
    function bz(n) { return 'BZ$' + parseFloat(n || 0).toFixed(2); }
    const lines = [
        'SERVICELL BELIZE',
        '#7 Douglas Jones, Belize City',
        'Tel: +501 615-3388',
        new Date().toLocaleString(),
        'Served by: ' + _receiptCashierName(cashier),
        customer ? 'Customer: ' + customer : '',
        'Receipt #' + (saleId || ''),
        '--------------------------------',
        'Item                    Qty  Total'
    ];
    (items || []).forEach(function(i) {
        const qty = i.qty || 1;
        const lineTotal = bz((i.price || 0) * qty);
        lines.push(String(i.name || 'Item').slice(0, 24).padEnd(24) + String(qty).padStart(3) + '  ' + lineTotal);
    });
    lines.push(
        '--------------------------------',
        'Subtotal (excl. GST): ' + bz(preTax),
        'GST (12.5% incl.): ' + bz(gst)
    );
    if (pay.isPartial) {
        lines.push('INVOICE TOTAL: ' + bz(pay.invoiceTotal));
        if (pay.priorPaid > 0.009) lines.push('Paid previously: ' + bz(pay.priorPaid));
        lines.push('Paid this visit (' + pay.displayMethod + '): ' + bz(pay.paidThisVisit));
        lines.push('Total paid to date: ' + bz(pay.totalPaid));
        lines.push('*** BALANCE DUE: ' + bz(pay.balanceDue) + ' ***');
        lines.push('', 'Partial payment — remaining balance due is shown above.');
    } else {
        lines.push('TOTAL: ' + bz(pay.invoiceTotal));
        lines.push('Paid (' + pay.displayMethod + '): ' + bz(pay.paidThisVisit));
        if (pay.change > 0.009) lines.push('Change: ' + bz(pay.change));
    }
    lines.push('', 'Thank you for choosing Servicell Belize!', 'Prices include GST.');
    return lines.filter(Boolean).join('\n');
}

function buildJobReceiptText(j) {
    j = j || {};
    function bzDate(d) {
        if (!d || d === '—') return '—';
        try { return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
        catch (_) { return d; }
    }
    function fmtPhone(p) {
        if (!p) return '—';
        const c = p.replace(/\D/g, '');
        return c.length === 7 ? '+501 ' + c.slice(0, 3) + '-' + c.slice(3) : p;
    }
    let items = [];
    try { items = j.invoiceItems ? JSON.parse(j.invoiceItems) : []; } catch (_) { items = []; }
    const total = items.reduce(function(s, i) { return s + (parseFloat(i.price || 0) || 0); }, 0);
    const priorityLabel = (j.priority || 'low').toLowerCase() === 'high' ? 'HIGH — URGENT' : 'LOW — NORMAL';
    let paymentStatus = 'N/A — Invoice Pending';
    if (items.length && total > 0) {
        const p = String(j.payment || 'unpaid').toLowerCase();
        paymentStatus = p.startsWith('paid') ? 'Paid via ' + (p.includes('card') ? 'Card' : 'Cash') : 'UNPAID';
    }

    const lines = [
        'SERVICELL BELIZE',
        'Device Repair & Services · Belize City',
        'Tel: +501 615-3388',
        '',
        'JOB RECEIPT & INTAKE FORM',
        'JOB #: ' + (j.id || '—'),
        'DATE: ' + (j.dateReceived ? _receivedLabel(j.dateReceived, bzDate) : bzDate(new Date())),
        'Type: ' + (j.jobType || 'Repair') + ' · Priority: ' + priorityLabel,
        'Issued By: ' + _jobIssuedByName(j),
        '',
        'CUSTOMER',
        'Name: ' + (j.customerName || 'Walk-in'),
        'Phone: ' + fmtPhone(j.customerPhone),
        '',
        'DEVICE',
        'Device: ' + (j.device || '—'),
        'Issue: ' + (j.issue || '—'),
        'Status: ' + _jobFmtStatus(j.status),
        (j.dateCompleted ? 'Completed: ' : 'Est. Completion: ') + (j.dateCompleted ? bzDate(j.dateCompleted) : (j.estimatedCompletion || '—')),
        '',
        'NOTES',
        j.notes || 'No additional notes.',
    ];
    if (j.inspection && j.inspection !== 'No damage noted') {
        lines.push('', 'INSPECTION', j.inspection.replace(/;/g, '\n'));
    }
    lines.push(
        '',
        'COST BREAKDOWN'
    );
    if (items.length) {
        items.forEach(function(i) {
            lines.push('• ' + (i.desc || 'Service') + ' — BZ$' + (parseFloat(i.price || 0) || 0).toFixed(2));
        });
        lines.push('TOTAL: BZ$' + total.toFixed(2));
    } else {
        lines.push('Price To Be Determined');
        lines.push('Final cost after diagnostic.');
    }
    lines.push('Payment Status: ' + paymentStatus);
    if (j.id) {
        lines.push('', 'Track your repair:', 'https://servicellbze.github.io/ServiCell/tracker.html?job=' + j.id);
    }
    lines.push('', 'Thank you for choosing ServiCell Belize!');
    return lines.join('\n');
}

function _jobParseInvoiceItems(j) {
    if (!j || !j.invoiceItems || j.invoiceItems === '—') return [];
    try { return JSON.parse(j.invoiceItems); } catch (_) { return []; }
}

function _jobFmtPhone(p) {
    if (!p) return '—';
    const c = String(p).replace(/\D/g, '');
    return c.length === 7 ? '+501 ' + c.slice(0, 3) + '-' + c.slice(3) : String(p);
}

function _jobPhoneForSms(p) {
    const d = String(p || '').replace(/\D/g, '');
    if (d.length === 7) return '+501' + d;
    if (d.length === 10 && d.startsWith('501')) return '+' + d;
    if (d.length === 11 && d.startsWith('501')) return '+' + d.slice(0, 10);
    return d.length >= 7 ? '+' + d : '';
}

function _jobFmtStatus(s) {
    return ({ ordered: 'Parts Ordered', received: 'Received', inqueue: 'In Queue',
        fixing: 'Being Repaired', testing: 'Testing', ready: 'Ready for Pickup',
        completed: 'Completed', abandoned: 'Abandoned', unsuccessful: 'Unsuccessful' })[s] || s || '—';
}

function _jobFmtDate(d) {
    if (!d || d === '—') return '—';
    try { return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
    catch (_) { return d; }
}

function _jobFirstName(name) {
    const n = String(name || '').trim();
    if (!n || n.toLowerCase() === 'walk-in') return 'there';
    return n.split(/\s+/)[0];
}

function buildJobA4Text(j) {
    j = j || {};
    const items = _jobParseInvoiceItems(j);
    const total = items.reduce(function(s, i) { return s + (parseFloat(i.price || 0) || 0); }, 0);
    const priorityLabel = (j.priority || 'low').toLowerCase() === 'high' ? 'HIGH — URGENT' : 'LOW — NORMAL';
    const receivedDate = j.dateReceived ? _receivedLabel(j.dateReceived, _jobFmtDate) : _jobFmtDate(new Date());
    const estimatedDate = j.estimatedCompletion || '—';
    let paymentStatus = 'N/A — Invoice Pending';
    if (items.length && total > 0) {
        const p = String(j.payment || 'unpaid').toLowerCase();
        paymentStatus = p.startsWith('paid') ? 'Paid via ' + (p.includes('card') ? 'Card' : 'Cash') : 'UNPAID';
    }

    const lines = [
        'SERVICELL BELIZE',
        'Job Invoice & Intake Form',
        '',
        'JOB #: ' + (j.id || '—'),
        'DATE RECEIVED: ' + receivedDate,
        'Job Type: ' + (j.jobType || 'Repair'),
        'Priority: ' + priorityLabel,
        'Issued By: ' + _jobIssuedByName(j),
        '',
        'CUSTOMER',
        'Name: ' + (j.customerName || 'Walk-in'),
        'Phone: ' + _jobFmtPhone(j.customerPhone),
        '',
        'DEVICE',
        'Device: ' + (j.device || '—'),
        'Issue: ' + (j.issue || '—'),
        'Status: ' + _jobFmtStatus(j.status),
        (j.dateCompleted ? 'Completed On: ' : 'Est. Completion: ') + (j.dateCompleted ? _jobFmtDate(j.dateCompleted) : estimatedDate),
        '',
        'NOTES',
        j.notes || 'No additional notes.'
    ];

    if (j.inspection && j.inspection !== 'No damage noted') {
        lines.push('', 'INSPECTION', j.inspection.replace(/;/g, '\n'));
    }

    lines.push('', 'COST BREAKDOWN');
    if (items.length) {
        const gst = total * 12.5 / 112.5;
        const preTax = total - gst;
        function bz(n) { return 'BZ$' + (parseFloat(n) || 0).toFixed(2); }
        items.forEach(function(i) {
            lines.push('• ' + (i.desc || 'Service') + ' — ' + bz(i.price || 0));
        });
        lines.push('Subtotal (excl. GST): ' + bz(preTax));
        lines.push('GST (12.5%): ' + bz(gst));
        lines.push('TOTAL: ' + bz(total));
    } else {
        lines.push('Price To Be Determined');
        lines.push('Final cost will be provided after diagnostic assessment.');
    }

    lines.push('Payment Status: ' + paymentStatus);
    if (j.id) {
        lines.push('', 'Track your repair:', 'https://servicellbze.github.io/ServiCell/tracker.html?job=' + j.id);
    }
    lines.push('', 'Thank you for choosing ServiCell Belize!');
    lines.push('Prices include GST where applicable.');
    return lines.join('\n');
}

const JOB_TRACKER_PAGE = 'https://servicellbze.github.io/ServiCell/tracker.html';
const JOB_TRACKER_LABEL = 'servicellbze.github.io/ServiCell';

function _jobTrackerUrl(j) {
    return j && j.id ? JOB_TRACKER_PAGE + '?job=' + encodeURIComponent(j.id) : '';
}

function _jobTimeGreeting() {
    const belizeHour = (new Date().getUTCHours() - 6 + 24) % 24;
    if (belizeHour >= 5 && belizeHour < 12) return 'Good morning';
    if (belizeHour >= 12 && belizeHour < 17) return 'Good afternoon';
    return 'Good evening';
}

function _jobDefaultGreetingId() {
    const g = _jobTimeGreeting();
    if (g === 'Good morning') return 'morning';
    if (g === 'Good afternoon') return 'afternoon';
    return 'evening';
}

function _jobGreetingPhraseFromId(greetingId, customText) {
    const map = {
        morning: 'Good morning',
        afternoon: 'Good afternoon',
        evening: 'Good evening',
        hi: 'Hi',
        hello: 'Hello'
    };
    if (greetingId === 'custom') {
        const t = String(customText || '').trim();
        return t || _jobTimeGreeting();
    }
    return map[greetingId] || _jobTimeGreeting();
}

function _jobGreetingLine(greetingPhrase, firstName) {
    return String(greetingPhrase || _jobTimeGreeting()).trim() + ', ' + firstName + ',';
}

function getJobGreetingOptions() {
    return [
        { id: 'morning', label: 'Good morning' },
        { id: 'afternoon', label: 'Good afternoon' },
        { id: 'evening', label: 'Good evening' },
        { id: 'hi', label: 'Hi' },
        { id: 'hello', label: 'Hello' },
        { id: 'custom', label: 'Custom' }
    ];
}

function getJobMessageTypeOptions() {
    return [
        { id: 'intake', label: 'Check-in confirmed' },
        { id: 'progress', label: 'Repair update' },
        { id: 'ready', label: 'Ready for pickup' }
    ];
}

function getJobProgressOptions() {
    return [
        { id: 'received', label: 'Received & assessing' },
        { id: 'inqueue', label: 'In queue' },
        { id: 'ordered', label: 'Waiting on parts' },
        { id: 'fixing', label: 'Being repaired' },
        { id: 'testing', label: 'Testing' },
        { id: 'completed', label: 'Repair completed' }
    ];
}

function _jobDefaultMessageType(j, opts) {
    opts = opts || {};
    if (opts.context === 'intake') return 'intake';
    if (String(j.status || '').toLowerCase() === 'ready') return 'ready';
    return 'progress';
}

function _jobDefaultProgressStatus(j) {
    const s = String(j.status || 'received').toLowerCase();
    const valid = getJobProgressOptions().some(function(o) { return o.id === s; });
    return valid ? s : 'received';
}

function _jobProgressPhrase(status) {
    return ({
        ordered: 'we are waiting on parts for your repair',
        received: 'your device has been received and is being assessed',
        inqueue: 'your device is in our queue awaiting service',
        fixing: 'your repair is currently in progress',
        testing: 'your device is being tested following repair',
        completed: 'your repair has been completed'
    })[status] || ('your repair is currently ' + _jobFmtStatus(status).toLowerCase());
}

function _jobBz(n) {
    return 'BZ$' + (parseFloat(n) || 0).toFixed(2);
}

function _jobTrackerLine(j, forSms) {
    const jobRef = 'Job #' + j.id;
    if (forSms) {
        return 'You can follow your repair anytime on our tracker at ' + JOB_TRACKER_LABEL + ' (' + jobRef + ').';
    }
    return 'You can follow your repair anytime on our online tracker using ' + jobRef + '.';
}

function _jobWarmSignOff(variant) {
    if (variant === 'ready') {
        return 'We\'d love to see you when it suits you — feel free to reply here or call us at +501 615-3388 if you\'d like to arrange pickup or have any questions.\n\nWarm regards,\nServiCell Belize';
    }
    if (variant === 'intake') {
        return 'We\'re here if anything comes up — reply to this message or call us at +501 615-3388 anytime.\n\nThank you for choosing ServiCell,\nServiCell Belize';
    }
    return 'If you have any questions, just reply here or call us at +501 615-3388 — we\'re happy to help.\n\nWarm regards,\nServiCell Belize';
}

function buildJobCustomerMessage(j, opts) {
    opts = opts || {};
    j = j || {};
    const firstName = _jobFirstName(j.customerName);
    const greetingPhrase = opts.greeting != null ? String(opts.greeting).trim() : _jobTimeGreeting();
    const greeting = _jobGreetingLine(greetingPhrase, firstName);
    const messageType = opts.messageType || _jobDefaultMessageType(j, opts);
    const progressStatus = String(opts.progressStatus || _jobDefaultProgressStatus(j)).toLowerCase();
    const items = _jobParseInvoiceItems(j);
    const total = items.reduce(function(s, i) { return s + (parseFloat(i.price || 0) || 0); }, 0);
    const hasTotal = items.length > 0 && total > 0;
    const device = j.device || 'device';
    const jobRef = j.id ? ('Job #' + j.id) : 'your repair';
    const issueText = j.issue ? String(j.issue).trim() : '';
    const isReady = messageType === 'ready';
    const isIntake = messageType === 'intake';
    const estDate = j.estimatedCompletion || 'to be confirmed';
    const payment = String(j.payment || 'unpaid').toLowerCase();
    const isPaid = payment.startsWith('paid');
    const paidSoFar = opts.amountPaid != null ? parseFloat(opts.amountPaid) : null;
    const hasPartial = paidSoFar != null && hasTotal && paidSoFar > 0.01 && (total - paidSoFar) > 0.01;
    const trackerLine = _jobTrackerLine(j, !!opts.forSms);
    let body = '';

    if (j.isEstimate) {
        const quoteRef = j.id ? ('Quote #' + j.id) : 'your quote';
        const priceLine = hasTotal
            ? (' The quoted total is ' + _jobBz(total) + '.')
            : ' The price will be confirmed after we see the device.';
        const issueClause = issueText ? (' We noted: ' + issueText + '.') : '';
        body = greeting + '\n\n'
            + 'Thank you for asking ServiCell Belize for a quote on your ' + device + ' (' + quoteRef + ').'
            + issueClause
            + priceLine
            + ' This is a quotation only — the repair has not started, and online tracking is available after you approve the work.'
            + ' Reply here or call us at +501 615-3388 when you would like us to begin.';
        return body + '\n\n' + _jobWarmSignOff('intake');
    }

    if (isIntake) {
        const issueClause = issueText
            ? (' We have noted the reported issue: ' + issueText + '.')
            : '';
        body = greeting + '\n\n'
            + 'Thank you for bringing your ' + device + ' to ServiCell Belize. This message confirms we have received your device and logged your repair (' + jobRef + ') in our system.'
            + issueClause
            + ' We expect to have an update for you by ' + estDate + ', and we will reach out when your device is ready or if we need anything further from you.'
            + ' ' + trackerLine;
    } else if (isReady) {
        if (hasPartial) {
            const balance = total - paidSoFar;
            body = greeting + '\n\n'
                + 'This is ServiCell Belize reaching out regarding your ' + device + ' repair (' + jobRef + '). Good news — your device is ready for pickup at our shop on Douglas Jones Street.'
                + ' Your invoice total is ' + _jobBz(total) + ', which includes GST. You have paid ' + _jobBz(paidSoFar) + ' so far, with a balance of ' + _jobBz(balance) + ' due when you collect. Payment can be made by cash or card at pickup.'
                + ' ' + trackerLine;
        } else if (isPaid && hasTotal) {
            body = greeting + '\n\n'
                + 'This is ServiCell Belize reaching out regarding your ' + device + ' repair (' + jobRef + '). Good news — your device is ready for pickup at our shop on Douglas Jones Street.'
                + ' Your final total is ' + _jobBz(total) + ', which includes GST, and we have recorded your payment — you are all set for collection.'
                + ' ' + trackerLine;
        } else if (hasTotal) {
            body = greeting + '\n\n'
                + 'This is ServiCell Belize reaching out regarding your ' + device + ' repair (' + jobRef + '). Good news — your device is ready for pickup at our shop on Douglas Jones Street.'
                + ' Your final total is ' + _jobBz(total) + ', which includes GST. Payment can be made by cash or card when you collect.'
                + ' ' + trackerLine;
        } else {
            body = greeting + '\n\n'
                + 'This is ServiCell Belize reaching out regarding your ' + device + ' repair (' + jobRef + '). Good news — your device is ready for pickup at our shop on Douglas Jones Street.'
                + ' We will confirm your final total with you at collection.'
                + ' ' + trackerLine;
        }
    } else {
        const statusPhrase = _jobProgressPhrase(progressStatus);

        let totalClause = '';
        if (hasTotal) {
            totalClause = ' Your repair total is ' + _jobBz(total) + ' (GST included); we will confirm the final amount with you if anything changes after diagnostic.';
            if (isPaid) {
                totalClause = ' Your repair total is ' + _jobBz(total) + ' (GST included), and we have your payment on file.';
            } else if (hasPartial) {
                totalClause = ' Your repair total is ' + _jobBz(total) + ' (GST included). You have paid ' + _jobBz(paidSoFar) + ' so far, with ' + _jobBz(total - paidSoFar) + ' still outstanding.';
            }
        } else {
            totalClause = ' We will confirm your final total once the diagnostic and repair are complete.';
        }

        body = greeting + '\n\n'
            + 'This is ServiCell Belize following up on your ' + device + ' (' + jobRef + '). ' + statusPhrase.charAt(0).toUpperCase() + statusPhrase.slice(1)
            + ', and we will notify you as soon as it is ready for pickup.'
            + ' We expect to have an update for you by ' + estDate + '.'
            + totalClause
            + ' ' + trackerLine;
    }

    const signVariant = isIntake ? 'intake' : (isReady ? 'ready' : 'update');
    return body + '\n\n' + _jobWarmSignOff(signVariant);
}

function buildJobCustomerMessagePayload(j, opts) {
    opts = opts || {};
    return {
        text: buildJobCustomerMessage(j, opts),
        url: _jobTrackerUrl(j)
    };
}

function buildJobDocumentHTML(j, format, opts) {
    opts = opts || { imgSrc: 'img/logo.png' };
    if (format === 'a4') return buildJobA4HTML(j, opts);
    return buildJobReceiptHTML(j, opts);
}

async function shareJobCustomerMessage(j, opts) {
    if (!j || !j.id) {
        _receiptNotify('No job data available', 'err');
        return false;
    }
    openCustomerSmsModal(j, opts || {});
    return true;
}

async function _dispatchJobCustomerMessage(j, opts) {
    const payload = buildJobCustomerMessagePayload(j, opts);
    const smsPhone = _jobPhoneForSms(j.customerPhone);
    const smsText = buildJobCustomerMessage(j, Object.assign({}, opts, { forSms: true }));

    if (navigator.share) {
        try {
            const shareData = {
                title: 'ServiCell Belize — Job #' + j.id,
                text: payload.text
            };
            if (payload.url) shareData.url = payload.url;
            if (!navigator.canShare || navigator.canShare(shareData)) {
                await navigator.share(shareData);
            } else {
                await navigator.share({ title: shareData.title, text: payload.text });
            }
            _receiptNotify('Message shared!', 'ok');
            if (typeof haptic === 'function') haptic('success');
            return true;
        } catch (e) {
            if (e && e.name === 'AbortError') return false;
        }
    }

    if (smsPhone && /iPhone|iPad|Android|Mobile/i.test(navigator.userAgent)) {
        window.location.href = 'sms:' + smsPhone + '?&body=' + encodeURIComponent(smsText);
        _receiptNotify('Opening Messages…', 'ok');
        return true;
    }

    return shareReceiptText(smsText, 'ServiCell Job #' + j.id);
}

let _customerSmsState = null;

function _ensureCustomerSmsModal() {
    const existing = document.getElementById('customerSmsModal');
    if (existing) {
        if (document.getElementById('customerSmsMessageTypes')) return;
        existing.remove();
    }

    const style = document.createElement('style');
    style.id = 'customerSmsModalStyles';
    if (!document.getElementById('customerSmsModalStyles')) {
        style.textContent = `
.customer-sms-overlay { display:none; position:fixed; inset:0; z-index:10060; background:rgba(0,0,0,0.55); backdrop-filter:blur(6px); align-items:flex-end; justify-content:center; padding:0; }
.customer-sms-overlay.open { display:flex; }
.customer-sms-sheet { width:100%; max-width:520px; max-height:92vh; background:var(--glass-strong,#fff); border-radius:28px 28px 0 0; box-shadow:0 -8px 40px rgba(0,0,0,0.25); display:flex; flex-direction:column; animation:receiptSlideUp 0.3s ease both; }
.customer-sms-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:18px 20px 12px; border-bottom:1px solid var(--glass-border,rgba(0,0,0,0.08)); }
.customer-sms-head h3 { margin:0 0 4px; font-size:1rem; font-weight:800; }
.customer-sms-sub { margin:0; font-size:0.78rem; color:var(--text-dim,#64748b); line-height:1.4; }
.customer-sms-close { width:36px; height:36px; border-radius:50%; border:1px solid var(--glass-border,rgba(0,0,0,0.1)); background:transparent; color:var(--text-main,#111); cursor:pointer; font-size:1.1rem; flex-shrink:0; }
.customer-sms-body { overflow:auto; padding:16px 20px; flex:1; -webkit-overflow-scrolling:touch; }
.customer-sms-label { display:block; font-size:0.68rem; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; color:var(--text-dim,#64748b); margin-bottom:8px; }
.customer-sms-pills { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px; }
.customer-sms-pill-btn { padding:9px 14px; border-radius:999px; border:1px solid var(--glass-border,rgba(0,0,0,0.12)); background:var(--glass,rgba(0,0,0,0.04)); color:var(--text-main,#111); font-family:inherit; font-size:0.82rem; font-weight:700; cursor:pointer; }
.customer-sms-pill-btn.active { background:var(--primary,#2563eb); border-color:var(--primary,#2563eb); color:#fff; }
.customer-sms-progress-wrap { display:none; margin-bottom:14px; }
.customer-sms-progress-wrap.is-visible { display:block; }
.customer-sms-custom { display:none; width:100%; padding:12px 14px; border-radius:12px; border:1px solid var(--glass-border,rgba(0,0,0,0.12)); background:var(--login-field-bg, var(--white-alt, #fff)); color:var(--text-main,#111); caret-color:var(--text-main,#111); font-family:inherit; font-size:0.9rem; margin-bottom:14px; box-sizing:border-box; }
.customer-sms-custom::placeholder { color:var(--text-light,#94a3b8); }
.customer-sms-custom.is-visible { display:block; }
.customer-sms-preview { width:100%; min-height:160px; max-height:240px; padding:14px; border-radius:12px; border:1px solid var(--glass-border,rgba(0,0,0,0.1)); background:var(--login-field-bg, var(--white-alt, #fff)); color:var(--text-main,#111); font-family:inherit; font-size:0.84rem; line-height:1.55; resize:vertical; box-sizing:border-box; white-space:pre-wrap; }
.customer-sms-actions { display:flex; gap:10px; padding:14px 20px calc(14px + env(safe-area-inset-bottom)); border-top:1px solid var(--glass-border,rgba(0,0,0,0.08)); }
.customer-sms-actions button { flex:1; padding:14px; border-radius:12px; border:none; font-family:inherit; font-size:0.9rem; font-weight:700; cursor:pointer; }
.customer-sms-cancel { background:var(--glass,rgba(0,0,0,0.06)); color:var(--text-main,#111); border:1px solid var(--glass-border,rgba(0,0,0,0.1)) !important; }
.customer-sms-send { background:var(--primary,#2563eb); color:#fff; }
.customer-sms-send:disabled { opacity:0.65; cursor:wait; }
@media (min-width:769px) {
    .customer-sms-overlay { align-items:center; padding:24px; }
    .customer-sms-sheet { border-radius:20px; max-height:88vh; }
}`;
        document.head.appendChild(style);
    }

    const modal = document.createElement('div');
    modal.id = 'customerSmsModal';
    modal.className = 'customer-sms-overlay';
    modal.innerHTML =
        '<div class="customer-sms-sheet" role="dialog" aria-labelledby="customerSmsTitle">'
        + '<div class="customer-sms-head">'
        + '<div><h3 id="customerSmsTitle">Text Customer</h3><p class="customer-sms-sub" id="customerSmsSub"></p></div>'
        + '<button type="button" class="customer-sms-close" aria-label="Close">&times;</button>'
        + '</div>'
        + '<div class="customer-sms-body">'
        + '<span class="customer-sms-label">Message type</span>'
        + '<div class="customer-sms-pills" id="customerSmsMessageTypes"></div>'
        + '<div class="customer-sms-progress-wrap" id="customerSmsProgressWrap">'
        + '<span class="customer-sms-label">Repair progress</span>'
        + '<div class="customer-sms-pills" id="customerSmsProgress"></div>'
        + '</div>'
        + '<span class="customer-sms-label">Greeting</span>'
        + '<div class="customer-sms-pills" id="customerSmsGreetings"></div>'
        + '<input type="text" class="customer-sms-custom" id="customerSmsCustom" placeholder="Type a custom greeting, e.g. Hey" maxlength="40">'
        + '<span class="customer-sms-label" style="margin-top:4px;">Message preview</span>'
        + '<textarea class="customer-sms-preview" id="customerSmsPreview" readonly></textarea>'
        + '</div>'
        + '<div class="customer-sms-actions">'
        + '<button type="button" class="customer-sms-cancel" id="customerSmsCancelBtn">Cancel</button>'
        + '<button type="button" class="customer-sms-send" id="customerSmsSendBtn">Send Message</button>'
        + '</div></div>';
    document.body.appendChild(modal);

    modal.addEventListener('click', function(e) {
        if (e.target === modal) closeCustomerSmsModal();
    });
    modal.querySelector('.customer-sms-close').addEventListener('click', closeCustomerSmsModal);
    document.getElementById('customerSmsCancelBtn').addEventListener('click', closeCustomerSmsModal);
    document.getElementById('customerSmsCustom').addEventListener('input', _refreshCustomerSmsPreview);
    document.getElementById('customerSmsSendBtn').addEventListener('click', _submitCustomerSmsModal);
}

function _customerSmsBuildSendOpts() {
    const phrase = _jobGreetingPhraseFromId(_customerSmsState.greetingId, _customerSmsState.customGreeting);
    return Object.assign({}, _customerSmsState.opts, {
        greeting: phrase,
        messageType: _customerSmsState.messageType,
        progressStatus: _customerSmsState.progressStatus
    });
}

function _refreshCustomerSmsPreview() {
    if (!_customerSmsState) return;
    const customEl = document.getElementById('customerSmsCustom');
    const previewEl = document.getElementById('customerSmsPreview');
    const progressWrap = document.getElementById('customerSmsProgressWrap');
    if (!_customerSmsState.greetingId) _customerSmsState.greetingId = _jobDefaultGreetingId();
    if (!_customerSmsState.messageType) _customerSmsState.messageType = _jobDefaultMessageType(_customerSmsState.j, _customerSmsState.opts);
    if (!_customerSmsState.progressStatus) _customerSmsState.progressStatus = _jobDefaultProgressStatus(_customerSmsState.j);

    if (_customerSmsState.greetingId === 'custom' && customEl) {
        _customerSmsState.customGreeting = customEl.value;
        customEl.classList.add('is-visible');
    } else if (customEl) {
        customEl.classList.remove('is-visible');
    }

    if (progressWrap) {
        progressWrap.classList.toggle('is-visible', _customerSmsState.messageType === 'progress');
    }

    if (previewEl) {
        previewEl.value = buildJobCustomerMessage(_customerSmsState.j, _customerSmsBuildSendOpts());
    }

    document.querySelectorAll('#customerSmsMessageTypes .customer-sms-pill-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-message-type') === _customerSmsState.messageType);
    });
    document.querySelectorAll('#customerSmsProgress .customer-sms-pill-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-progress-status') === _customerSmsState.progressStatus);
    });
    document.querySelectorAll('#customerSmsGreetings .customer-sms-pill-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-greeting-id') === _customerSmsState.greetingId);
    });
}

function _bindCustomerSmsPills(container, attrName, stateKey, onSelect) {
    if (!container) return;
    container.querySelectorAll('.customer-sms-pill-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            _customerSmsState[stateKey] = btn.getAttribute(attrName);
            if (typeof onSelect === 'function') onSelect();
            _refreshCustomerSmsPreview();
        });
    });
}

function openCustomerSmsModal(j, opts) {
    opts = opts || {};
    _ensureCustomerSmsModal();
    _customerSmsState = {
        j: j,
        opts: Object.assign({}, opts),
        greetingId: _jobDefaultGreetingId(),
        customGreeting: '',
        messageType: _jobDefaultMessageType(j, opts),
        progressStatus: _jobDefaultProgressStatus(j)
    };

    const sub = document.getElementById('customerSmsSub');
    const messageTypesEl = document.getElementById('customerSmsMessageTypes');
    const progressEl = document.getElementById('customerSmsProgress');
    const greetingsEl = document.getElementById('customerSmsGreetings');
    const customEl = document.getElementById('customerSmsCustom');

    if (sub) {
        const name = j.customerName || 'Customer';
        const device = j.device ? (' · ' + j.device) : '';
        const actualStatus = _jobFmtStatus(j.status);
        sub.textContent = name + device + ' · Job #' + j.id + ' · Current: ' + actualStatus;
    }

    if (messageTypesEl) {
        messageTypesEl.innerHTML = getJobMessageTypeOptions().map(function(opt) {
            return '<button type="button" class="customer-sms-pill-btn" data-message-type="' + opt.id + '">' + opt.label + '</button>';
        }).join('');
        _bindCustomerSmsPills(messageTypesEl, 'data-message-type', 'messageType');
    }

    if (progressEl) {
        progressEl.innerHTML = getJobProgressOptions().map(function(opt) {
            return '<button type="button" class="customer-sms-pill-btn" data-progress-status="' + opt.id + '">' + opt.label + '</button>';
        }).join('');
        _bindCustomerSmsPills(progressEl, 'data-progress-status', 'progressStatus');
    }

    if (greetingsEl) {
        greetingsEl.innerHTML = getJobGreetingOptions().map(function(opt) {
            return '<button type="button" class="customer-sms-pill-btn" data-greeting-id="' + opt.id + '">' + opt.label + '</button>';
        }).join('');
        _bindCustomerSmsPills(greetingsEl, 'data-greeting-id', 'greetingId', function() {
            if (_customerSmsState.greetingId === 'custom') {
                const customInput = document.getElementById('customerSmsCustom');
                if (customInput) customInput.focus();
            }
        });
    }

    if (customEl) {
        customEl.value = '';
        customEl.classList.remove('is-visible');
    }

    _refreshCustomerSmsPreview();

    const modal = document.getElementById('customerSmsModal');
    modal.classList.add('open');
    document.body.classList.add('modal-open');
}

function closeCustomerSmsModal() {
    const modal = document.getElementById('customerSmsModal');
    if (modal) modal.classList.remove('open');
    if (!document.querySelector('.modal-overlay.open, .paper-modal-overlay.open, .mark-called-modal.open, .receipt-preview-overlay.open, .customer-sms-overlay.open')) {
        document.body.classList.remove('modal-open');
    }
    _customerSmsState = null;
}

async function _submitCustomerSmsModal() {
    if (!_customerSmsState || !_customerSmsState.j) return;
    const sendBtn = document.getElementById('customerSmsSendBtn');
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending…';
    }

    const sendOpts = _customerSmsBuildSendOpts();
    const j = _customerSmsState.j;

    try {
        await _dispatchJobCustomerMessage(j, sendOpts);
        closeCustomerSmsModal();
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send Message';
        }
    }
}

function openJobReceiptPreview(j, format, opts) {
    format = format || 'receipt';
    opts = opts || {};
    const imgOpts = { imgSrc: 'img/logo.png', isEstimate: !!(j && j.isEstimate) };
    const html = buildJobDocumentHTML(j, format, imgOpts);
    const text = format === 'a4' ? buildJobA4Text(j) : buildJobReceiptText(j);
    showReceiptPreview(html, text, {
        title: (j.isEstimate ? 'Quote #' : 'Job #') + j.id + (format === 'a4' ? ' Invoice' : ' Receipt'),
        format: format,
        job: j,
        imgOpts: imgOpts
    });
}

function _receiptShareFilename(title) {
    const slug = String(title || 'receipt')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
    return (slug || 'servicell-receipt') + '.png';
}

function _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
}

function _loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    return new Promise(function(resolve, reject) {
        const src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        const existing = document.querySelector('script[data-receipt-src="' + src + '"]');
        if (existing) {
            existing.addEventListener('load', function() { resolve(window.html2canvas); });
            existing.addEventListener('error', reject);
            return;
        }
        const s = document.createElement('script');
        s.src = src;
        s.dataset.receiptSrc = src;
        s.onload = function() { resolve(window.html2canvas); };
        s.onerror = function() { reject(new Error('Could not load image library')); };
        document.head.appendChild(s);
    });
}

async function _capturePreviewPaperToBlob() {
    const paper = document.getElementById('receiptPreviewPaper');
    if (!paper) throw new Error('Receipt preview not ready');
    const html2canvas = await _loadHtml2Canvas();
    const images = Array.from(paper.querySelectorAll('img'));
    await Promise.all(images.map(function(img) {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise(function(resolve) {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
            setTimeout(resolve, 2500);
        });
    }));
    const canvas = await html2canvas(paper, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        imageTimeout: 3000
    });
    return new Promise(function(resolve, reject) {
        canvas.toBlob(function(blob) {
            if (blob) resolve(blob);
            else reject(new Error('Could not create image'));
        }, 'image/png');
    });
}

async function _receiptHtmlToPngBlob(html) {
    if (typeof receiptHtmlToPngBlob === 'function') {
        return receiptHtmlToPngBlob(html);
    }
    const paper = document.getElementById('receiptPreviewPaper');
    if (paper && paper.innerHTML) {
        return _capturePreviewPaperToBlob();
    }
    throw new Error('Image capture unavailable');
}

async function shareReceiptText(text, title) {
    if (!text) {
        _receiptNotify('Nothing to share', 'err');
        return false;
    }
    if (navigator.share) {
        try {
            await navigator.share({ title: title || 'ServiCell Receipt', text: text });
            _receiptNotify('Shared!', 'ok');
            if (typeof haptic === 'function') haptic('success');
            return true;
        } catch (e) {
            if (e && e.name === 'AbortError') return false;
        }
    }
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            _receiptNotify('Receipt copied — paste into your message app', 'ok');
            if (typeof haptic === 'function') haptic('light');
            return true;
        }
    } catch (_) {}
    _receiptNotify('Could not share — try copying manually', 'err');
    return false;
}

async function shareReceiptImage(html, opts) {
    opts = opts || {};
    if (!html) {
        _receiptNotify('Nothing to share', 'err');
        return false;
    }

    const filename = opts.filename || _receiptShareFilename(opts.title);
    const shareBtn = document.getElementById('receiptPreviewShareBtn');
    const prevLabel = shareBtn ? shareBtn.textContent : '';
    if (shareBtn) {
        shareBtn.disabled = true;
        shareBtn.textContent = 'Preparing…';
    }

    try {
        const blob = await _receiptHtmlToPngBlob(html);
        const file = new File([blob], filename, { type: 'image/png' });

        if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
            try {
                await navigator.share({
                    files: [file],
                    title: opts.title || 'ServiCell Receipt'
                });
                _receiptNotify('Receipt image shared!', 'ok');
                if (typeof haptic === 'function') haptic('success');
                return true;
            } catch (e) {
                if (e && e.name === 'AbortError') return false;
            }
        }

        _downloadBlob(blob, filename);
        _receiptNotify('Receipt saved — attach the image in your message app', 'ok');
        if (typeof haptic === 'function') haptic('light');
        return true;
    } catch (e) {
        console.warn('Receipt image share failed:', e);
        if (opts.text) {
            _receiptNotify('Image failed — sharing as text instead', 'ok');
            return shareReceiptText(opts.text, opts.title);
        }
        _receiptNotify('Could not create receipt image', 'err');
        return false;
    } finally {
        if (shareBtn) {
            shareBtn.disabled = false;
            shareBtn.textContent = prevLabel || 'Share Image';
        }
    }
}

function _ensureReceiptPreviewModal() {
    if (document.getElementById('receiptPreviewModal')) return;

    const style = document.createElement('style');
    style.textContent = `
.receipt-preview-overlay { display:none; position:fixed; inset:0; z-index:10050; background:rgba(0,0,0,0.55); backdrop-filter:blur(6px); align-items:flex-end; justify-content:center; padding:0; }
.receipt-preview-overlay.open { display:flex; }
.receipt-preview-sheet { width:100%; max-width:480px; max-height:92vh; background:var(--glass-strong,#fff); border-radius:28px 28px 0 0; box-shadow:0 -8px 40px rgba(0,0,0,0.25); display:flex; flex-direction:column; animation:receiptSlideUp 0.3s ease both; }
@keyframes receiptSlideUp { from { transform:translateY(100%); opacity:0; } to { transform:translateY(0); opacity:1; } }
.receipt-preview-head { display:flex; align-items:center; justify-content:space-between; padding:18px 20px 12px; border-bottom:1px solid var(--glass-border,rgba(0,0,0,0.08)); }
.receipt-preview-head h3 { margin:0; font-size:1rem; font-weight:800; }
.receipt-preview-close { width:36px; height:36px; border-radius:50%; border:1px solid var(--glass-border,rgba(0,0,0,0.1)); background:transparent; cursor:pointer; font-size:1.1rem; }
.receipt-preview-body { overflow:auto; padding:16px; background:#f3f4f6; flex:1; -webkit-overflow-scrolling:touch; }
.receipt-preview-format { display:none; gap:8px; padding:0 20px 12px; }
.receipt-preview-format.is-visible { display:flex; }
.receipt-preview-format button { flex:1; padding:10px 12px; border-radius:999px; border:1px solid var(--glass-border,rgba(0,0,0,0.12)); background:var(--glass,rgba(0,0,0,0.04)); color:var(--text-main,#111); font-family:inherit; font-size:0.82rem; font-weight:700; cursor:pointer; }
.receipt-preview-format button.active { background:var(--primary,#2563eb); border-color:var(--primary,#2563eb); color:#fff; }
.receipt-preview-paper { background:#fff; color:#000; margin:0 auto; max-width:320px; padding:10px 12px 18px; box-shadow:0 2px 12px rgba(0,0,0,0.12); border-radius:4px; box-sizing:border-box; }
.receipt-preview-paper.receipt-preview-a4 { max-width:100%; padding:0; box-shadow:none; background:transparent; border-radius:0; }
.receipt-preview-paper.receipt-preview-a4 .a4-invoice { max-width:100%; margin:0; padding:16px 18px 24px; box-shadow:0 2px 12px rgba(0,0,0,0.12); border-radius:4px; }
.receipt-preview-actions { display:flex; gap:10px; padding:14px 20px calc(14px + env(safe-area-inset-bottom)); border-top:1px solid var(--glass-border,rgba(0,0,0,0.08)); }
.receipt-preview-actions button { flex:1; padding:14px; border-radius:12px; border:none; font-family:inherit; font-size:0.9rem; font-weight:700; cursor:pointer; }
.receipt-preview-share { background:var(--primary,#2563eb); color:#fff; }
.receipt-preview-share:disabled { opacity:0.65; cursor:wait; }
.receipt-preview-print { background:var(--glass,rgba(0,0,0,0.06)); color:var(--text-main,#111); border:1px solid var(--glass-border,rgba(0,0,0,0.1)) !important; }
@media (min-width:769px) {
    .receipt-preview-overlay { align-items:center; padding:24px; }
    .receipt-preview-sheet { border-radius:20px; max-height:88vh; }
}`;
    document.head.appendChild(style);

    const modal = document.createElement('div');
    modal.id = 'receiptPreviewModal';
    modal.className = 'receipt-preview-overlay';
    modal.innerHTML =
        '<div class="receipt-preview-sheet" role="dialog" aria-labelledby="receiptPreviewTitle">'
        + '<div class="receipt-preview-head">'
        + '<h3 id="receiptPreviewTitle">Receipt</h3>'
        + '<button type="button" class="receipt-preview-close" aria-label="Close">&times;</button>'
        + '</div>'
        + '<div class="receipt-preview-format" id="receiptPreviewFormat">'
        + '<button type="button" data-format="receipt">72mm Receipt</button>'
        + '<button type="button" data-format="a4">A4 Invoice</button>'
        + '</div>'
        + '<div class="receipt-preview-body"><div class="receipt-preview-paper" id="receiptPreviewPaper"></div></div>'
        + '<div class="receipt-preview-actions">'
        + '<button type="button" class="receipt-preview-share" id="receiptPreviewShareBtn">Share Image</button>'
        + '<button type="button" class="receipt-preview-print" id="receiptPreviewPrintBtn">Print</button>'
        + '</div></div>';
    document.body.appendChild(modal);

    modal.addEventListener('click', function(e) {
        if (e.target === modal) closeReceiptPreview();
    });
    modal.querySelector('.receipt-preview-close').addEventListener('click', closeReceiptPreview);

    modal.querySelectorAll('#receiptPreviewFormat button').forEach(function(btn) {
        btn.addEventListener('click', function() {
            if (!_receiptPreviewState || !_receiptPreviewState.job) return;
            _applyJobPreviewFormat(btn.getAttribute('data-format') || 'receipt');
        });
    });
}

function _applyJobPreviewFormat(format) {
    if (!_receiptPreviewState || !_receiptPreviewState.job) return;
    format = format === 'a4' ? 'a4' : 'receipt';
    const j = _receiptPreviewState.job;
    const imgOpts = _receiptPreviewState.imgOpts || { imgSrc: 'img/logo.png' };
    _receiptPreviewState.format = format;
    _receiptPreviewState.html = buildJobDocumentHTML(j, format, imgOpts);
    _receiptPreviewState.text = format === 'a4' ? buildJobA4Text(j) : buildJobReceiptText(j);

    const paper = document.getElementById('receiptPreviewPaper');
    const titleEl = document.getElementById('receiptPreviewTitle');
    if (paper) {
        paper.innerHTML = _receiptPreviewState.html;
        paper.className = 'receipt-preview-paper' + (format === 'a4' ? ' receipt-preview-a4' : '');
    }
    if (titleEl) {
        titleEl.textContent = 'Job #' + j.id + (format === 'a4' ? ' Invoice' : ' Receipt');
    }

    document.querySelectorAll('#receiptPreviewFormat button').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-format') === format);
    });
}

let _receiptPreviewState = null;

function showReceiptPreview(html, plainText, opts) {
    opts = opts || {};
    _ensureReceiptPreviewModal();
    _receiptPreviewState = {
        html: html,
        text: plainText || '',
        opts: opts,
        job: opts.job || null,
        format: opts.format || 'receipt',
        imgOpts: opts.imgOpts || { imgSrc: 'img/logo.png' }
    };

    const modal = document.getElementById('receiptPreviewModal');
    const titleEl = document.getElementById('receiptPreviewTitle');
    const paper = document.getElementById('receiptPreviewPaper');
    const formatBar = document.getElementById('receiptPreviewFormat');

    if (_receiptPreviewState.job) {
        if (formatBar) formatBar.classList.add('is-visible');
        _applyJobPreviewFormat(_receiptPreviewState.format);
    } else {
        if (formatBar) formatBar.classList.remove('is-visible');
        if (titleEl) titleEl.textContent = opts.title || 'Receipt';
        if (paper) {
            paper.innerHTML = html;
            paper.className = 'receipt-preview-paper';
        }
    }

    document.getElementById('receiptPreviewShareBtn').onclick = function() {
        const state = _receiptPreviewState || {};
        const suffix = state.format === 'a4' ? '-a4-invoice' : '-receipt';
        shareReceiptImage(state.html, {
            title: (state.opts && state.opts.title) || 'ServiCell Receipt',
            text: state.text,
            filename: _receiptShareFilename(((state.opts && state.opts.title) || 'receipt') + suffix)
        });
    };
    document.getElementById('receiptPreviewPrintBtn').onclick = function() {
        if (_receiptPreviewState && _receiptPreviewState.html) printHTML(_receiptPreviewState.html);
    };

    modal.classList.add('open');
    document.body.classList.add('modal-open');
}

function closeReceiptPreview() {
    const modal = document.getElementById('receiptPreviewModal');
    if (modal) modal.classList.remove('open');
    if (!document.querySelector('.modal-overlay.open, .paper-modal-overlay.open, .mark-called-modal.open, .receipt-preview-overlay.open, .customer-sms-overlay.open')) {
        document.body.classList.remove('modal-open');
    }
    _receiptPreviewState = null;
}

window.buildJobA4Text = buildJobA4Text;
window.buildJobCustomerMessage = buildJobCustomerMessage;
window.buildJobCustomerMessagePayload = buildJobCustomerMessagePayload;
window.buildJobDocumentHTML = buildJobDocumentHTML;
window.shareJobCustomerMessage = shareJobCustomerMessage;
window.openCustomerSmsModal = openCustomerSmsModal;
window.getJobMessageTypeOptions = getJobMessageTypeOptions;
window.getJobProgressOptions = getJobProgressOptions;
window.closeCustomerSmsModal = closeCustomerSmsModal;
window.openJobReceiptPreview = openJobReceiptPreview;
window.buildSaleReceiptText = buildSaleReceiptText;
window.buildJobReceiptText = buildJobReceiptText;
window.shareReceiptText = shareReceiptText;
window.shareReceiptImage = shareReceiptImage;
window.showReceiptPreview = showReceiptPreview;
window.closeReceiptPreview = closeReceiptPreview;
window.isMobileReceipt = isMobileReceipt;
window.openReceiptPreview = showReceiptPreview;

// ── A4 / Letter Job Invoice ───────────────────────────────────────────────────
const A4_STYLES = `
@media print {
    @page { size: A4; margin: 14mm 16mm; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color: #000 !important; background: transparent !important; }
    html, body { background: white !important; }
    img { display: block !important; max-width: 100%; }
    .a4-invoice { box-shadow: none !important; }
}
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.45; }
* { box-sizing: border-box; }
.a4-invoice { max-width: 720px; margin: 0 auto; padding: 24px 28px 32px; background: #fff; color: #000; }
.pi-shop { text-align: center; margin-bottom: 14px; }
.pi-shop img { max-width: 72px; height: auto; display: block; margin: 0 auto 8px; }
.pi-shop h1 { font-size: 22px; font-weight: 900; letter-spacing: 2px; margin: 0 0 4px; }
.pi-shop p { font-size: 11px; margin: 2px 0; line-height: 1.5; }
.pi-rule { border: none; border-top: 2px solid #000; margin: 12px 0 10px; }
.pi-dash { border: none; border-top: 1px dashed #000; margin: 10px 0 8px; }
.pi-title { text-align: center; font-size: 14px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; margin: 4px 0 14px; }
.pi-meta-bar { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 12px; margin-bottom: 10px; line-height: 1.6; }
.pi-meta-bar strong { font-weight: 900; }
.pi-meta-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 16px; font-size: 11px; margin: 0 0 12px; padding: 10px 14px; border: 1px solid #000; line-height: 1.5; }
.pi-meta-row span { display: block; }
.pi-meta-row .pi-k { font-size: 9px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 2px; }
.pi-meta-row .pi-v { font-size: 12px; font-weight: 700; }
.pi-section { font-size: 9px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; margin: 12px 0 8px; }
.pi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 28px; margin-bottom: 4px; }
.pi-field { min-width: 0; }
.pi-field-label { font-size: 9px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 3px; }
.pi-field-value { font-size: 13px; font-weight: 700; padding: 4px 0 6px; border-bottom: 1px solid #000; min-height: 28px; word-break: break-word; }
.pi-notes { border: 1px solid #000; padding: 10px 12px; min-height: 64px; font-size: 12px; line-height: 1.55; margin: 4px 0 12px; white-space: pre-wrap; word-break: break-word; }
.pi-cost-table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 12px; }
.pi-cost-table th { text-align: left; font-size: 9px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; padding: 6px 0; border-bottom: 2px solid #000; }
.pi-cost-table th.col-amt { text-align: right; width: 120px; }
.pi-cost-table td { padding: 7px 0; border-bottom: 1px dashed #ccc; vertical-align: top; word-break: break-word; }
.pi-cost-table td.col-amt { text-align: right; font-weight: 700; white-space: nowrap; padding-left: 12px; }
.pi-cost-table tr.pi-subtotal td { border-bottom: 1px solid #000; font-size: 11px; padding-top: 10px; }
.pi-cost-table tr.pi-gst td { border-bottom: 1px solid #000; font-size: 11px; }
.pi-cost-table tr.pi-total-row td { border-top: 2px solid #000; border-bottom: none; font-weight: 900; font-size: 14px; padding-top: 10px; }
.pi-cost-table tr.pi-total-row td.col-amt { text-align: right; }
.pi-payment-status { text-align: center; font-size: 12px; font-weight: 900; margin: 14px 0 16px; padding: 10px 14px; border: 2px solid #000; }
.pi-inspection { border: 1px solid #000; padding: 10px 12px; margin: 4px 0 12px; font-size: 11px; line-height: 1.65; }
.pi-sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 28px; page-break-inside: avoid; }
.pi-sig { border-top: 1px solid #000; padding-top: 6px; font-size: 10px; text-align: center; min-height: 48px; }
.pi-qr-a4 { text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px dashed #000; page-break-inside: avoid; }
.pi-qr-a4 img { max-width: 140px; height: auto; margin: 0 auto 10px; }
.pi-qr-a4-title { font-size: 11px; font-weight: 900; letter-spacing: 1px; }
.pi-qr-a4-url { font-size: 10px; margin-top: 4px; color: #333; }
.pi-footer { text-align: center; font-size: 10px; font-weight: 700; margin-top: 20px; border-top: 1px dashed #000; padding-top: 10px; line-height: 1.65; page-break-inside: avoid; }
.pi-pending { border: 1px solid #000; padding: 16px; text-align: center; font-size: 12px; line-height: 1.5; margin: 4px 0 8px; }
`;

function buildJobA4HTML(j, opts) {
    opts = opts || {};
    const isEstimate = !!(opts.isEstimate || j.isEstimate);
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    function bzDate(d) {
        if (!d || d === '—') return '—';
        try { return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
        catch(_) { return d; }
    }

    function fmtPhone(p) {
        if (!p) return '—';
        const c = p.replace(/\D/g,'');
        return c.length === 7 ? '+501 ' + c.slice(0,3) + '-' + c.slice(3) : p;
    }

    const priorityLabel = (j.priority||'low').toLowerCase() === 'high' ? 'HIGH — URGENT' : 'LOW — NORMAL';
    const receivedDate  = j.dateReceived ? _receivedLabel(j.dateReceived, bzDate) : today;
    const estimatedDate = j.estimatedCompletion || '—';

    const items = (() => {
        if (!j.invoiceItems || j.invoiceItems === '—') return [];
        try { return JSON.parse(j.invoiceItems); } catch(_) { return []; }
    })();
    const total = items.reduce((s,i) => s + (parseFloat(i.price||0)||0), 0);

    let paymentStatus = 'N/A — Invoice Pending';
    if (items.length && total > 0) {
        const p = String(j.payment||'unpaid').toLowerCase();
        paymentStatus = p.startsWith('paid') ? 'Paid via ' + (p.includes('card') ? 'Card' : 'Cash') : 'UNPAID';
    }

    const costTableHTML = items.length ? (() => {
        const gst = total * 12.5 / 112.5;
        const preTax = total - gst;
        function bz(n) { return 'BZ$' + (parseFloat(n) || 0).toFixed(2); }
        return `
        <table class="pi-cost-table">
            <thead><tr><th>Service / Item</th><th class="col-amt">Amount</th></tr></thead>
            <tbody>
                ${items.map(i => `<tr><td>${_esc(i.desc || '')}</td><td class="col-amt">${bz(i.price || 0)}</td></tr>`).join('')}
                <tr class="pi-subtotal"><td>Subtotal (excl. GST)</td><td class="col-amt">${bz(preTax)}</td></tr>
                <tr class="pi-gst"><td>GST (12.5%)</td><td class="col-amt">${bz(gst)}</td></tr>
                <tr class="pi-total-row"><td><strong>TOTAL</strong></td><td class="col-amt"><strong>${bz(total)}</strong></td></tr>
            </tbody>
        </table>`;
    })() :
        `<div class="pi-pending"><strong>${isEstimate ? 'Quotation only. Final price finalized upon device inspection.' : 'Price To Be Determined'}</strong>${isEstimate ? '' : '<br><span style="font-size:10px;">Final cost will be provided after diagnostic assessment.</span>'}</div>`;

    const inspectionHTML = (j.inspection && j.inspection !== 'No damage noted')
        ? `<div class="pi-section">Device Inspection</div>
           <div class="pi-inspection">${_esc(j.inspection).replace(/;/g, '<br>')}</div>`
        : '';

    const imgSrc = opts.imgSrc || _receiptLogoSrc();
    
    const jobId = j.id;
    const trackerUrl = `https://servicellbze.github.io/ServiCell/tracker.html?job=${jobId}`;
    const qrCodeUrl = `https://quickchart.io/qr?text=${encodeURIComponent(trackerUrl)}&size=200`;
    const qrBlock = isEstimate ? '' : `
<div class="pi-qr-a4">
    <img src="${qrCodeUrl}" alt="Track repair QR code">
    <div class="pi-qr-a4-title">TRACK YOUR REPAIR</div>
    <div class="pi-qr-a4-url">${_esc(trackerUrl)}</div>
</div>`;

    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${isEstimate ? 'Estimate' : 'Job Invoice'} #${_esc(j.id)}</title><style>${A4_STYLES}</style></head><body>
<div id="printInvoice" class="a4-invoice">
<div class="pi-shop">
    <img src="${imgSrc}" alt="Servicell Belize">
    <h1>SERVICELL BELIZE</h1>
    <p>Device Repair &amp; Services</p>
    <p>#7 Douglas Jones, Belize City &middot; Tel: +501 615-3388</p>
</div>
<hr class="pi-rule">
<div class="pi-title">${isEstimate ? 'Repair Estimate / Quotation' : 'Job Invoice &amp; Intake Form'}</div>
${isEstimate ? '<div class="pi-pending" style="margin-bottom:12px;font-size:11px;">Quotation only. Final price finalized upon device inspection.</div>' : ''}
<div class="pi-meta-bar">
    <div><strong>${isEstimate ? 'ESTIMATE #' : 'JOB #:'}</strong> ${_esc(j.id)}</div>
    <div><strong>DATE RECEIVED:</strong> ${_esc(receivedDate)}</div>
</div>
<div class="pi-meta-row">
    <span><span class="pi-k">Job Type</span><span class="pi-v">${_esc(j.jobType || 'Repair')}</span></span>
    <span><span class="pi-k">Priority</span><span class="pi-v">${_esc(priorityLabel)}</span></span>
    <span><span class="pi-k">Issued By</span><span class="pi-v">${_esc(_jobIssuedByName(j))}</span></span>
</div>
<div class="pi-section">Customer Information</div>
<div class="pi-grid">
    <div class="pi-field"><div class="pi-field-label">Name</div><div class="pi-field-value">${_esc(j.customerName || 'Walk-in')}</div></div>
    <div class="pi-field"><div class="pi-field-label">Phone</div><div class="pi-field-value">${_esc(fmtPhone(j.customerPhone))}</div></div>
</div>
<div class="pi-section">Device Information</div>
<div class="pi-grid">
    <div class="pi-field"><div class="pi-field-label">Device</div><div class="pi-field-value">${_esc(j.device || '—')}</div></div>
    <div class="pi-field"><div class="pi-field-label">Issue Reported</div><div class="pi-field-value">${_esc(j.issue || '—')}</div></div>
    <div class="pi-field"><div class="pi-field-label">Status</div><div class="pi-field-value">${_esc(_jobFmtStatus(j.status))}</div></div>
    <div class="pi-field"><div class="pi-field-label">${j.dateCompleted ? 'Completed On' : 'Est. Completion'}</div><div class="pi-field-value">${_esc(j.dateCompleted ? bzDate(j.dateCompleted) : estimatedDate)}</div></div>
</div>
<div class="pi-section">Work Notes</div>
<div class="pi-notes">${_esc(j.notes || 'No additional notes.')}</div>
${inspectionHTML}
<div class="pi-section">Cost Breakdown</div>
${costTableHTML}
${isEstimate ? '' : `<div class="pi-payment-status"><strong>Payment Status:</strong> ${_esc(paymentStatus)}</div>`}
<div class="pi-sigs">
    <div class="pi-sig">Customer Signature &amp; Date</div>
    <div class="pi-sig">Staff Signature &amp; Date</div>
</div>
${qrBlock}
<div class="pi-footer">Thank you for choosing Servicell Belize!<br>${isEstimate ? 'This is a quotation only. Approve the repair in store before work begins.<br>' : 'Devices not collected within <strong>90 days of completion</strong> may be considered <strong>abandoned</strong>.<br>'}We are not responsible for data loss. Please back up your device.<br>Prices include GST where applicable.</div>
</div></body></html>`;
}
