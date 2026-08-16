/**
 * receiptTemplate.js
 * Pure function — takes pre-computed receipt data, returns a full HTML string.
 * No business logic, no imports, no side effects.
 */
function escHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c])
}

export function buildReceiptHTML({
  recNo, teacherName, issued, student, isMonthly,
  payment, periodLabel, carryForward, periodDue, creditBalance, creditHours, fmt,
}) {
  const balancePositive = creditBalance >= 0
  const balanceIsZero   = creditBalance === 0
  const balanceKind     = balanceIsZero ? 'settled' : (balancePositive ? 'credit' : 'due')
  const balanceText     = balanceIsZero
    ? 'Settled in full'
    : (balancePositive ? `Net Credit Balance ${fmt(creditBalance)}` : `Balance Due ${fmt(Math.abs(creditBalance))}`)
  const balanceColor    = balanceKind === 'due' ? '#dc2626' : (balanceKind === 'credit' ? '#4338ca' : '#15803d')
  const balanceBg       = balanceKind === 'due' ? '#fef2f2' : (balanceKind === 'credit' ? '#eef2ff' : '#f0fdf4')

  const nameSlug        = student.name.split(' ').join('-')
  const safeTeacher     = escHtml(teacherName)
  const safeName        = escHtml(student.name)
  const safeCity        = escHtml(student.city ?? '')
  const safeRecNo       = escHtml(recNo)
  const safeIssued      = escHtml(issued)
  const coverageLine    = periodLabel ? `Period: <strong>${escHtml(periodLabel)}</strong>` : 'Tutoring fees'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Receipt_${nameSlug}_${safeRecNo}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after {
      box-sizing: border-box; margin: 0; padding: 0;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    body {
      font-family: 'Inter', 'Segoe UI', -apple-system, Arial, sans-serif;
      background: #f0fdf4;
      color: #1e293b; font-size: 12px; line-height: 1.5;
    }
    .screen-pad { padding: 14px 12px 28px; }

    /* ── Print button ─────────────────────────────────── */
    .no-print { display: flex; justify-content: center; margin-bottom: 12px; }
    .print-btn {
      background: #16a34a; color: #fff; border: none;
      padding: 9px 24px; border-radius: 8px; font-size: 13px;
      font-weight: 600; cursor: pointer;
      display: inline-flex; align-items: center; gap: 7px;
    }
    .print-btn:hover { background: #15803d; }

    /* ── Card ─────────────────────────────────────────── */
    .page {
      position: relative; background: #fff;
      max-width: 640px; margin: 0 auto;
      overflow: hidden;
      box-shadow: 0 4px 28px rgba(22,163,74,.13);
    }

    /* ── Watermark ────────────────────────────────────── */
    .wm-text {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%) rotate(-35deg);
      font-family: 'Inter', Arial, sans-serif;
      font-size: 60px; font-weight: 700;
      color: rgba(21,128,61,0.10); white-space: nowrap;
      letter-spacing: 10px; pointer-events: none; z-index: 2;
      user-select: none;
    }
    .page > *:not(.wm-text) { position: relative; z-index: 1; }

    /* ── Header ───────────────────────────────────────── */
    .rec-header {
      background: linear-gradient(135deg, #15803d 0%, #16a34a 100%);
      padding: 14px 24px;
      display: flex; justify-content: space-between; align-items: flex-start; color: #fff;
    }
    .t-name  { font-size: 16px; font-weight: 600; letter-spacing: -.2px; }
    .t-role  { font-size: 10px; opacity: .65; margin-top: 2px; text-transform: uppercase; letter-spacing: .9px; }
    .rec-right { text-align: right; }
    .rec-word  { font-size: 8.5px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; opacity: .65; }
    .rec-num   { font-size: 15px; font-weight: 700; margin-top: 1px; }
    .rec-date  { font-size: 10px; opacity: .65; margin-top: 2px; }

    /* ── Meta grid ────────────────────────────────────── */
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #e2e8f0; }
    .meta-cell { padding: 10px 24px; }
    .meta-cell + .meta-cell { border-left: 1px solid #e2e8f0; }
    .m-label { font-size: 8px; font-weight: 600; letter-spacing: 1.8px; text-transform: uppercase; color: #16a34a; margin-bottom: 4px; }
    .m-name  { font-size: 13px; font-weight: 600; color: #0f172a; }
    .m-sub   { font-size: 11px; color: #64748b; margin-top: 2px; }
    .rate-chip {
      display: inline-block; margin-top: 8px;
      background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0;
      border-radius: 100px; padding: 2px 11px; font-size: 11.5px; font-weight: 500;
    }

    /* ── Amount panel — a real green "this succeeded" surface ── */
    .amount-panel {
      margin: 14px 24px 0; padding: 16px 20px;
      background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
      border: 1px solid #bbf7d0; border-radius: 12px;
    }
    .pay-label  { font-size: 9px; font-weight: 600; letter-spacing: 1.6px; text-transform: uppercase; color: #15803d; margin-bottom: 4px; }
    .pay-amount { font-size: 30px; font-weight: 700; color: #15803d; letter-spacing: -.5px; }
    .confirm-row { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 11.5px; }
    .confirm-row .cf-text { color: #15803d; font-weight: 600; }
    .confirm-row .cf-date { color: #4d7d68; }
    .confirm-row .cf-date::before { content: "\\00b7"; margin-right: 7px; color: #86c9a6; }
    .pay-note { font-size: 11px; color: #3f6b58; margin-top: 6px; font-style: italic; }

    .coverage-line { margin: 10px 24px 0; font-size: 11.5px; color: #64748b; }
    .coverage-line strong { color: #0f172a; font-weight: 600; }

    /* ── Breakdown — the math, no itemized table ─────────── */
    .breakdown { margin: 14px 24px 0; padding: 13px 0; border-top: 1px dashed #e2e8f0; border-bottom: 1px dashed #e2e8f0; }
    .b-row { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; font-size: 11.5px; color: #64748b; }
    .b-row .amt { font-weight: 500; color: #334155; }
    .b-row.highlight { font-weight: 700; color: #0f172a; margin-top: 3px; }
    .b-row.highlight .amt { color: #0f172a; }

    /* ── Balance pill ─────────────────────────────────── */
    .balance-wrap { margin: 14px 24px 0; display: flex; justify-content: flex-end; }
    .balance-pill {
      font-size: 13px; font-weight: 700; padding: 7px 16px; border-radius: 8px;
    }

    .hrs-line { margin: 8px 24px 0; text-align: right; font-size: 10.5px; color: #94a3b8; }
    .hrs-line strong { color: #64748b; font-weight: 600; }

    /* ── Footer ───────────────────────────────────────── */
    .rec-footer {
      margin-top: 18px;
      padding: 10px 24px; border-top: 1px solid #e2e8f0; background: #f8fafc;
      display: flex; justify-content: space-between; align-items: flex-end;
    }
    .f-left  { font-size: 11.5px; color: #94a3b8; }
    .f-left em { display: block; font-style: italic; color: #64748b; margin-bottom: 2px; }
    .f-right { text-align: right; }
    .f-name  { font-size: 13px; font-weight: 600; color: #0f172a; }
    .f-role  { font-size: 10.5px; color: #94a3b8; margin-top: 1px; }

    /* ── Print ────────────────────────────────────────── */
    @media print {
      html, body { background: #fff !important; padding: 0 !important; }
      .screen-pad { padding: 0 !important; }
      .no-print   { display: none !important; }
      .page { box-shadow: none !important; overflow: visible !important; max-width: 100% !important; }
      .rec-header  { border-radius: 0 !important; }
      .meta-grid   { break-inside: avoid; }
      .amount-panel { break-inside: avoid; }
      .breakdown   { break-inside: avoid; }
      .rec-footer  { break-inside: avoid; }
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
          setTimeout(function() { URL.revokeObjectURL(url); }, 10000);
          if (btn) { btn.disabled = false; btn.innerHTML = '✓ Downloaded'; }
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
    <div class="rec-header">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0">
          <svg style="width:36px;height:36px" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="rlogo-g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#4338ca"/></linearGradient></defs>
            <rect width="512" height="512" rx="112" fill="url(#rlogo-g)"/>
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
      <div class="rec-right">
        <div class="rec-word">Receipt</div>
        <div class="rec-num">${safeRecNo}</div>
        <div class="rec-date">Issued ${safeIssued}</div>
      </div>
    </div>

    <!-- Received From / Received By -->
    <div class="meta-grid">
      <div class="meta-cell">
        <div class="m-label">Received From</div>
        <div class="m-name">${safeName}</div>
        ${safeCity ? `<div class="m-sub">${safeCity}${student.timezone ? ` &middot; ${escHtml(student.timezone)}` : ''}</div>` : ''}
        <div class="rate-chip">${fmt(student.ratePerHour)} / ${isMonthly ? 'month' : 'hour'}</div>
      </div>
      <div class="meta-cell">
        <div class="m-label">Received By</div>
        <div class="m-name">${safeTeacher}</div>
        <div class="m-sub" style="margin-top:3px">Ref: <strong style="color:#0f172a">${safeRecNo}</strong></div>
      </div>
    </div>

    <!-- Amount — green, unmistakable, confirms this specific payment -->
    <div class="amount-panel">
      <div class="pay-label">Amount Received</div>
      <div class="pay-amount">${fmt(payment.amount)}</div>
      <div class="confirm-row">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        <span class="cf-text">Payment Received</span>
        <span class="cf-date">Paid ${escHtml(payment.date)}</span>
      </div>
      ${payment.note ? `<div class="pay-note">"${escHtml(payment.note)}"</div>` : ''}
    </div>
    <div class="coverage-line">${coverageLine}</div>

    <!-- Breakdown — no itemized sessions, just the math behind the balance -->
    <div class="breakdown">
      ${carryForward !== 0 ? `
      <div class="b-row">
        <span>${carryForward >= 0 ? 'Carry Forward Balance' : 'Previous Balance Due'}</span>
        <span class="amt">${fmt(Math.abs(carryForward))}</span>
      </div>` : ''}
      <div class="b-row">
        <span>Sessions this period</span>
        <span class="amt">${fmt(periodDue)}</span>
      </div>
      <div class="b-row highlight">
        <span>This payment</span>
        <span class="amt">${fmt(payment.amount)}</span>
      </div>
    </div>

    <!-- Resulting balance -->
    <div class="balance-wrap">
      <span class="balance-pill" style="color:${balanceColor};background:${balanceBg}">${balanceText}</span>
    </div>
    ${!isMonthly && creditHours !== null && !balanceIsZero ? `
    <div class="hrs-line">
      ${balancePositive
        ? `&asymp; <strong>${Math.abs(creditHours).toFixed(1)} hrs</strong> of sessions pre-paid`
        : `<strong>${Math.abs(creditHours).toFixed(1)} hrs</strong> of sessions not yet paid`
      }
    </div>` : ''}

    <!-- Footer -->
    <div class="rec-footer">
      <div class="f-left">
        <em>Thank you for your payment.</em>
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
