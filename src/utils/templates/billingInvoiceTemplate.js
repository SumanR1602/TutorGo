/**
 * billingInvoiceTemplate.js
 * Pure function — takes pre-computed invoice data, returns an HTML string.
 */
function escHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c])
}

export function buildInvoiceHTML({
  invNo, teacherName, issued, student, isMonthly,
  periodLabel, sessionCount, totalHours, periodDue, carryForward, amountDueNow,
  sessionRows, fmt,
}) {
  const duePositive = amountDueNow >= 0
  const dueLabel    = duePositive ? 'Amount Due Now' : 'Net Credit Balance'
  const dueColor    = duePositive ? '#fff'    : '#166534'
  const dueBg       = duePositive ? '#4f46e5' : '#dcfce7'
  const dueBorder   = duePositive ? 'none'    : '1px solid #bbf7d0'
  const nameSlug    = student.name.split(' ').join('-')
  const safeTeacher = escHtml(teacherName)
  const safeName    = escHtml(student.name)
  const safeCity    = escHtml(student.city ?? '')
  const safeInvNo   = escHtml(invNo)
  const safeIssued  = escHtml(issued)
  const safePeriod  = escHtml(periodLabel)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Invoice_${nameSlug}_${safeInvNo}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after {
      box-sizing: border-box; margin: 0; padding: 0;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    body {
      font-family: 'Inter','Segoe UI',-apple-system,Arial,sans-serif;
      background: #eef2ff; color: #1e293b; font-size: 12px; line-height: 1.5;
    }
    .screen-pad { padding: 14px 12px 28px; }
    .no-print { display: flex; justify-content: center; margin-bottom: 12px; }
    .print-btn {
      background: #4f46e5; color: #fff; border: none;
      padding: 9px 24px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;
      display: inline-flex; align-items: center; gap: 7px;
    }
    .print-btn:hover { background: #4338ca; }
    .page {
      position: relative; background: #fff;
      max-width: 760px; margin: 0 auto;
      overflow: hidden;
      box-shadow: 0 4px 28px rgba(79,70,229,.14);
    }
    .wm-text {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%) rotate(-35deg);
      font-family: 'Inter', Arial, sans-serif;
      font-size: 72px; font-weight: 700;
      color: rgba(79,70,229,0.10); white-space: nowrap;
      letter-spacing: 10px; pointer-events: none; z-index: 2;
      user-select: none;
    }
    .page > *:not(.wm-text) { position: relative; z-index: 1; }
    .inv-header {
      background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
      padding: 14px 24px;
      display: flex; justify-content: space-between; align-items: flex-start; color: #fff;
    }
    .t-name { font-size: 16px; font-weight: 600; letter-spacing: -.2px; }
    .t-role { font-size: 10px; opacity: .65; margin-top: 2px; text-transform: uppercase; letter-spacing: .9px; }
    .inv-right { text-align: right; }
    .inv-word  { font-size: 8.5px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; opacity: .65; }
    .inv-num   { font-size: 15px; font-weight: 700; margin-top: 1px; }
    .inv-date  { font-size: 10px; opacity: .65; margin-top: 2px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #e2e8f0; }
    .meta-cell { padding: 10px 24px; }
    .meta-cell + .meta-cell { border-left: 1px solid #e2e8f0; }
    .m-label { font-size: 8px; font-weight: 600; letter-spacing: 1.8px; text-transform: uppercase; color: #4f46e5; margin-bottom: 4px; }
    .m-name  { font-size: 13px; font-weight: 600; color: #0f172a; }
    .m-sub   { font-size: 11px; color: #64748b; margin-top: 2px; }
    .rate-chip {
      display: inline-block; margin-top: 8px;
      background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe;
      border-radius: 100px; padding: 2px 11px; font-size: 11.5px; font-weight: 500;
    }
    .summary-bar {
      padding: 7px 24px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
      display: flex; gap: 20px; align-items: center; flex-wrap: wrap;
    }
    .s-pill { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: #475569; }
    .s-dot  { width: 6px; height: 6px; border-radius: 50%; background: #a5b4fc; flex-shrink: 0; }
    .s-pill strong { color: #1e293b; }
    .tbl-wrap  { padding: 12px 24px 0; }
    .tbl-label { font-size: 8px; font-weight: 600; letter-spacing: 1.8px; text-transform: uppercase; color: #94a3b8; margin-bottom: 7px; }
    table.items { width: 100%; border-collapse: collapse; table-layout: fixed; }
    table.items thead { display: table-header-group; }
    table.items tfoot { display: table-footer-group; }
    table.items thead th {
      background: #4f46e5; color: rgba(255,255,255,.9);
      padding: 6px 10px; font-size: 9px; font-weight: 600;
      letter-spacing: .8px; text-transform: uppercase; text-align: left;
    }
    table.items thead th:first-child { border-radius: 7px 0 0 7px; }
    table.items thead th:last-child  { border-radius: 0 7px 7px 0; }
    table.items tbody tr.data-row:nth-child(even) { background: #f8fafc; }
    table.items tbody td { padding: 5px 10px; font-size: 11.5px; color: #374151; border-bottom: 1px solid #f1f5f9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    table.items tbody td.wrap { white-space: normal; word-break: break-word; }
    table.items tbody tr:last-child td { border-bottom: none; }
    table.items tfoot td {
      border-top: 2px solid #e2e8f0; padding: 7px 10px;
      font-size: 12px; font-weight: 600; color: #0f172a; background: #fff;
    }
    .badge { display: inline-block; padding: 2px 9px; border-radius: 100px; font-size: 10.5px; font-weight: 500; }
    .badge-regular { background: #e0e7ff; color: #3730a3; }
    .badge-extra   { background: #fef3c7; color: #92400e; }
    table.items tbody tr.fee-row td {
      background: #eef2ff; color: #3730a3; font-size: 11.5px;
      border-top: 1px solid #c7d2fe; border-bottom: 1px solid #c7d2fe; padding: 5px 10px;
    }
    table.items tbody tr.month-row td {
      background: #4f46e5; color: #fff; font-size: 11.5px;
      padding: 6px 10px;
    }
    table.items tbody tr.month-row td strong { color: #fff; }
    table.items tbody tr.month-row td:first-child { border-radius: 7px 0 0 7px; }
    table.items tbody tr.month-row td:last-child  { border-radius: 0 7px 7px 0; }
    table.items tbody tr.month-row td:only-child  { border-radius: 7px; }
    .c { text-align: center; }
    .r { text-align: right; }
    .muted { color: #94a3b8; }
    table.items th.r { text-align: right; }
    table.items th.c { text-align: center; }
    .summary-wrap { padding: 12px 24px 16px; display: flex; justify-content: flex-end; }
    .summary-card { min-width: 300px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .sum-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 16px; border-bottom: 1px solid #f1f5f9; font-size: 11.5px;
    }
    .sum-row:last-child { border-bottom: none; }
    .sum-row .lbl { color: #64748b; }
    .sum-row .val { font-weight: 600; color: #0f172a; }
    .due-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 16px; font-size: 13px; font-weight: 600;
    }
    .inv-footer {
      padding: 10px 24px; border-top: 1px solid #e2e8f0; background: #f8fafc;
      display: flex; justify-content: space-between; align-items: flex-end;
    }
    .f-left  { font-size: 11.5px; color: #94a3b8; }
    .f-left em { display: block; font-style: italic; color: #64748b; margin-bottom: 2px; }
    .f-right { text-align: right; }
    .f-name  { font-size: 13px; font-weight: 600; color: #0f172a; }
    .f-role  { font-size: 10.5px; color: #94a3b8; margin-top: 1px; }
    @media print {
      html, body { background: #fff !important; padding: 0 !important; }
      .screen-pad { padding: 0 !important; }
      .no-print   { display: none !important; }
      .page { box-shadow: none !important; overflow: visible !important; max-width: 100% !important; }
      .meta-grid   { break-inside: avoid; }
      .summary-bar { break-inside: avoid; }
      .summary-wrap { break-inside: avoid; }
      .inv-footer  { break-inside: avoid; }
      table.items tbody tr { break-inside: avoid; }
      table.items thead { display: table-header-group; }
      table.items tfoot { display: table-footer-group; }
      @page { margin: 1.1cm 1.3cm; size: A4; }
    }
  </style>
  <script>
    async function dlPDF() {
      var btn = document.querySelector('.print-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
      try {
        var res = await fetch('/api/pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ html: document.documentElement.outerHTML, filename: document.title })
        });
        if (res.ok) {
          var blob = await res.blob();
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url; a.download = document.title + '.pdf';
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(function() { URL.revokeObjectURL(url), 10000; });
          if (btn) { btn.disabled = false; btn.innerHTML = '\u2713 Downloaded'; }
          return;
        }
      } catch (e) {}
      // Fallback: browser print dialog
      window.print();
      if (btn) { btn.disabled = false; btn.textContent = 'Save as PDF'; }
    }
  <\/script>
</head>
<body>
<div class="screen-pad">

  <div class="no-print">
    <button class="print-btn" onclick="dlPDF()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Save as PDF
    </button>
  </div>

  <div class="page">

    <!-- Watermark -->
    <div class="wm-text" aria-hidden="true">TutorsPad</div>

    <!-- Header -->
    <div class="inv-header">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0">
          <svg style="width:36px;height:36px" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="ilogo-g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#4338ca"/></linearGradient></defs>
            <rect width="512" height="512" rx="112" fill="url(#ilogo-g)"/>
            <rect x="96" y="248" width="320" height="36" rx="18" fill="white"/>
            <rect x="128" y="284" width="36" height="120" rx="18" fill="white"/>
            <rect x="348" y="284" width="36" height="120" rx="18" fill="white"/>
            <path d="M168 136 Q200 128 256 148 L256 248 Q200 228 168 236 Z" fill="rgba(255,255,255,0.92)"/>
            <path d="M344 136 Q312 128 256 148 L256 248 Q312 228 344 236 Z" fill="rgba(255,255,255,0.75)"/>
            <line x1="256" y1="148" x2="256" y2="248" stroke="rgba(79,70,229,0.4)" stroke-width="4"/>
            <rect x="310" y="118" width="14" height="72" rx="7" fill="rgba(255,255,255,0.6)" transform="rotate(20 317 154)"/>
            <polygon points="317,186 310,202 324,202" fill="rgba(255,255,255,0.5)" transform="rotate(20 317 154)"/>
          </svg>
          <span style="font-size:8px;font-weight:700;color:rgba(255,255,255,0.85);letter-spacing:2px;text-transform:uppercase">TutorsPad</span>
        </div>
        <div>
          <div class="t-name">${safeTeacher}</div>
          <div class="t-role">Private Tutor</div>
        </div>
      </div>
      <div class="inv-right">
        <div class="inv-word">Invoice</div>
        <div class="inv-num">${safeInvNo}</div>
        <div class="inv-date">Issued ${safeIssued}</div>
      </div>
    </div>

    <!-- Meta -->
    <div class="meta-grid">
      <div class="meta-cell">
        <div class="m-label">Billed To</div>
        <div class="m-name">${safeName}</div>
        ${safeCity ? `<div class="m-sub">${safeCity}${student.timezone ? ` &middot; ${escHtml(student.timezone)}` : ''}</div>` : ''}
        <div class="rate-chip">${fmt(student.ratePerHour)} / ${isMonthly ? 'month' : 'hour'}</div>
      </div>
      <div class="meta-cell">
        <div class="m-label">Invoice</div>
        <div class="m-name">${safeInvNo}</div>
        <div class="m-sub" style="margin-top:3px">Issued ${safeIssued}</div>
      </div>
    </div>

    <!-- Summary bar -->
    <div class="summary-bar">
      <div class="s-pill"><span class="s-dot"></span>Sessions: <strong>${sessionCount}</strong></div>
      <div class="s-pill"><span class="s-dot"></span>Hours: <strong>${totalHours.toFixed(1)}h</strong></div>
      <div class="s-pill"><span class="s-dot"></span>Period Total: <strong>${fmt(periodDue)}</strong></div>
    </div>

    <!-- Sessions table -->
    <div class="tbl-wrap">
      <div class="tbl-label">Sessions This Period &nbsp;<span style="font-weight:400;color:#94a3b8">(${safePeriod})</span></div>
      <table class="items">
        <thead>
          <tr>
            <th style="width:18%">Date</th>
            <th style="width:20%">Type</th>
            <th class="c" style="width:10%">Hrs</th>
            <th class="r" style="width:26%">Rate</th>
            <th class="r" style="width:26%">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${sessionRows || `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:18px">No sessions in this period</td></tr>`}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3">${sessionCount} session${sessionCount !== 1 ? 's' : ''} &middot; ${totalHours.toFixed(1)}h</td>
            <td></td>
            <td class="r">${fmt(periodDue)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Financial summary -->
    <div class="summary-wrap">
      <div class="summary-card">
        ${carryForward !== 0 ? `
        <div class="sum-row">
          <span class="lbl">${carryForward >= 0 ? 'Carry Forward Balance' : 'Previous Balance Due'}</span>
          <span class="val" style="color:${carryForward >= 0 ? '#4f46e5' : '#dc2626'}">
            ${fmt(Math.abs(carryForward))}
          </span>
        </div>` : ''}
        <div class="sum-row">
          <span class="lbl">Sessions this period</span>
          <span class="val">${fmt(periodDue)}</span>
        </div>
        <div class="due-row" style="background:${dueBg};border-top:2px solid #e2e8f0;${dueBorder !== 'none' ? 'border:'+dueBorder+';' : ''}">
          <span style="color:${dueColor}">${dueLabel}</span>
          <span style="color:${dueColor};font-size:18px">${fmt(Math.abs(amountDueNow))}</span>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="inv-footer">
      <div class="f-left">
        <em>Please make payment at your earliest convenience.</em>
        <span>Generated via TutorsPad &middot; ${safeIssued}</span>
      </div>
      <div class="f-right">
        <div class="f-name">${safeTeacher}</div>
        <div class="f-role">Private Tutor</div>
      </div>
    </div>

  </div>
</div>
</body>
</html>`
}
