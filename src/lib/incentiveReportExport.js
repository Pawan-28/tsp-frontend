import { formatINR } from "./indianFormat.js";
import { kraPeriodLabel } from "./kraPeriod.js";
import { computeRemunerationBreakdown, DEFAULT_INCENTIVE_SETTINGS } from "./incentiveCalculator.js";

function csvCell(value) {
  const str = value == null ? "" : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function csvRow(cells) {
  return cells.map(csvCell).join(",");
}

function money(n) {
  return formatINR(Number(n) || 0);
}

function plainMoney(n) {
  return Math.round(Number(n) || 0);
}

/**
 * Build a structured employee performance + remuneration report payload.
 */
export function buildEmployeeIncentiveReport({
  employee,
  monthValue,
  monthLabel,
  kraPeriod = "month",
  kraRows = [],
  insightRows = [],
  kraMetrics = {},
  serviceMetrics = [],
  leadSnapshot = {},
  competency = [],
  remunerationDraft = null,
  calcResult = null,
  leads = [],
  weightedPerformance = 0,
  incentiveSettings = DEFAULT_INCENTIVE_SETTINGS,
}) {
  const draft = remunerationDraft || employee || {};
  const breakdown = calcResult || computeRemunerationBreakdown(draft, {
    kraRows,
    employee,
    weightedPerformance: calcResult?.performance ?? weightedPerformance,
    baseIncentiveRate: incentiveSettings.baseIncentiveRate,
    targetBonusAmount: incentiveSettings.targetBonusAmount,
    incentiveSlabs: incentiveSettings.incentiveSlabs,
    useManualCashRate: Boolean(remunerationDraft?.incRate),
  });

  return {
    generatedAt: new Date().toISOString(),
    employee: {
      id: employee?.id,
      name: employee?.name || "—",
      role: employee?.role || "—",
      team: employee?.team || employee?.department || "—",
      status: employee?.status || "—",
    },
    period: {
      monthValue,
      monthLabel: monthLabel || monthValue,
      kraPeriod,
      kraPeriodLabel: kraPeriodLabel(kraPeriod),
    },
    calls: {
      totalCalls: kraMetrics.totalCalls ?? 0,
      conversations2Min: kraMetrics.calls5Min ?? employee?.callsCompleted ?? 0,
      pickupRate: kraMetrics.pickupRate ?? employee?.pickupRate ?? 0,
      avgDurationMin:
        kraMetrics.avgDurationSec != null
          ? Math.round((kraMetrics.avgDurationSec / 60) * 10) / 10
          : employee?.responseTimeMin ?? 0,
      totalLeads: kraMetrics.totalLeads ?? 0,
      convertedLeads: kraMetrics.converted ?? 0,
    },
    kraPerformance: (insightRows.length ? insightRows : kraRows).map((row) => ({
      label: row.label,
      actual: row.actual ?? 0,
      target: row.target ?? 0,
      weight: row.weight ?? 0,
      earned: row.earned ?? 0,
      display: row.display || `${row.actual ?? 0}/${row.target ?? 0}`,
    })),
    kraScore: calcResult?.performance ?? weightedPerformance ?? 0,
    serviceMetrics: serviceMetrics.map((m) => ({
      label: m.label,
      value: m.value,
      score: m.score,
    })),
    leadStatus: leadSnapshot.leadStatus || {},
    competency,
    remuneration: {
      baseSalary: breakdown.baseSalary ?? draft.baseSalary ?? employee?.baseSalary ?? 0,
      incentiveRate: draft.incRate ?? employee?.incRate ?? breakdown.slabRate ?? 0,
      baselineRate: breakdown.baselineRate ?? incentiveSettings.baseIncentiveRate,
      performanceScore: breakdown.performanceScore ?? breakdown.kraScore ?? weightedPerformance,
      kraScore: breakdown.performanceScore ?? breakdown.kraScore ?? weightedPerformance,
      incentiveAmount: breakdown.incentiveCore ?? breakdown.commission ?? 0,
      performanceIncentive: breakdown.performanceIncentive ?? 0,
      cashCollected: draft.cashCollected ?? employee?.cashCollected ?? 0,
      cashTarget: draft.cashTarget ?? employee?.cashTarget ?? 0,
      cashCommission: breakdown.cashCommission ?? 0,
      manualIncentiveOverride: breakdown.manualIncentiveOverride ?? false,
      kraIncentive: 0,
      commission: breakdown.incentiveCore ?? breakdown.commission ?? 0,
      bonus: breakdown.bonus ?? 0,
      autoTargetBonus: breakdown.autoTargetBonus ?? 0,
      manualBonus: breakdown.manualBonus ?? 0,
      penalty: breakdown.penalty ?? 0,
      totalMoney: breakdown.totalMoney ?? breakdown.totalRemuneration ?? 0,
    },
    leads: leads.map((lead) => ({
      name: lead.name || "—",
      phone: lead.phone || "—",
      service: lead.service || "—",
      status: lead.status || "—",
      value: lead.value ?? 0,
      pipelineStage: lead.pipelineStage || lead.notes || "—",
      updatedAt: lead.updatedAt || "—",
    })),
  };
}

function reportFilename(report) {
  const slug = (report.employee.name || "employee")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const month = report.period.monthValue || "report";
  return `incentive-report-${slug}-${month}.csv`;
}

/**
 * Download a comprehensive employee incentive report as CSV.
 */
export function downloadIncentiveReportCsv(report) {
  const rows = [];
  const push = (...cells) => rows.push(csvRow(cells));
  const blank = () => rows.push("");

  push("Employee Performance & Incentive Report");
  push("Generated At", new Date(report.generatedAt).toLocaleString("en-IN"));
  blank();

  push("Employee Information");
  push("Name", report.employee.name);
  push("Role", report.employee.role);
  push("Team", report.employee.team);
  push("Status", report.employee.status);
  push("Month", report.period.monthLabel);
  push("Period", report.period.kraPeriodLabel);
  blank();

  push("Call Statistics");
  push("Total Calls (Callyzer)", report.calls.totalCalls);
  push("2 Min+ Conversations", report.calls.conversations2Min);
  push("Pickup Rate (%)", report.calls.pickupRate);
  push("Avg Call Duration (min)", report.calls.avgDurationMin);
  push("Total Leads Assigned", report.calls.totalLeads);
  push("Converted Leads", report.calls.convertedLeads);
  blank();

  push("Incentive Metrics");
  push("Metric", "Completed", "Target", "Weight %", "Earned %", "Achievement");
  report.kraPerformance.forEach((row) => {
    push(row.label, row.actual, row.target, row.weight, row.earned, row.display);
  });
  push("Overall Performance Score (%)", report.kraScore);
  blank();

  push("Service Metrics");
  push("Metric", "Value", "Score %");
  report.serviceMetrics.forEach((m) => push(m.label, m.value, m.score));
  blank();

  push("Lead Status Summary");
  push("Status", "Count");
  Object.entries(report.leadStatus).forEach(([status, count]) => push(status, count));
  blank();

  push("Remuneration");
  push("Base Salary (INR)", plainMoney(report.remuneration.baseSalary));
  push("Performance Score (%)", report.remuneration.performanceScore ?? report.remuneration.kraScore);
  push("Incentive (INR)", plainMoney(report.remuneration.incentiveAmount));
  push("Performance Component (INR)", plainMoney(report.remuneration.performanceIncentive));
  push("Cash Collected (INR)", plainMoney(report.remuneration.cashCollected));
  push("Cash Target (INR)", plainMoney(report.remuneration.cashTarget));
  push("Cash Commission Rate (%)", report.remuneration.incentiveRate);
  push("Cash Commission (INR)", plainMoney(report.remuneration.cashCommission));
  if (report.remuneration.autoTargetBonus > 0) {
    push("Target Bonus (INR)", plainMoney(report.remuneration.autoTargetBonus));
  }
  if (report.remuneration.bonus > 0) {
    push("Total Bonus (INR)", plainMoney(report.remuneration.bonus));
  }
  if (report.remuneration.penalty > 0) {
    push("Penalty (INR)", plainMoney(report.remuneration.penalty));
  }
  push("Total Money (INR)", plainMoney(report.remuneration.totalMoney));

  const csv = `\uFEFF${rows.join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = reportFilename(report);
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Open a printable HTML report (user can Save as PDF from browser print).
 * Performance metrics + remuneration only — no lead list.
 */
export function downloadIncentiveReportHtml(report) {
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const generatedLabel = new Date(report.generatedAt).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const initials = (report.employee.name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");

  const kraRows = report.kraPerformance
    .map(
      (r) => `<tr>
        <td>${esc(r.label)}</td>
        <td class="num">${esc(r.display)}</td>
        <td class="num">${esc(r.weight)}%</td>
        <td class="num earned">${esc(r.earned)}%</td>
      </tr>`,
    )
    .join("");

  const callStats = [
    ["Total Calls", report.calls.totalCalls],
    ["2 Min+ Conversations", report.calls.conversations2Min],
    ["Pickup Rate", `${report.calls.pickupRate}%`],
    ["Avg Call Duration", `${report.calls.avgDurationMin} min`],
    ["Leads Assigned", report.calls.totalLeads],
    ["Converted Leads", report.calls.convertedLeads],
  ]
    .map(([label, val]) => `<tr><td>${esc(label)}</td><td class="num">${esc(val)}</td></tr>`)
    .join("");

  const serviceRows = report.serviceMetrics
    .map((m) => `<tr><td>${esc(m.label)}</td><td class="num">${esc(m.value)}</td><td class="num">${esc(m.score)}%</td></tr>`)
    .join("");

  const leadStatusRows = Object.entries(report.leadStatus)
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${esc(v)}</td></tr>`)
    .join("");

  const moneyRows = [
    ["Base Salary", money(report.remuneration.baseSalary), ""],
    [
      "Incentive",
      money(report.remuneration.incentiveAmount),
      report.remuneration.manualIncentiveOverride
        ? "Manual override"
        : `${report.remuneration.performanceScore ?? report.remuneration.kraScore}% performance · ${report.remuneration.incentiveRate}% on ${money(report.remuneration.cashCollected)} collected`,
    ],
  ];

  if (report.remuneration.autoTargetBonus > 0) {
    moneyRows.push(["Target Bonus", money(report.remuneration.autoTargetBonus), "Performance target reached"]);
  }
  if (report.remuneration.manualBonus > 0 || (report.remuneration.bonus > report.remuneration.autoTargetBonus)) {
    const manual = report.remuneration.bonus - (report.remuneration.autoTargetBonus || 0);
    if (manual > 0) moneyRows.push(["Additional Bonus", money(manual), ""]);
  }
  if (report.remuneration.penalty > 0) {
    moneyRows.push(["Penalty", `−${money(report.remuneration.penalty)}`, ""]);
  }

  const remunerationTable = moneyRows
    .map(
      ([label, amount, note]) => `<tr>
        <td>${esc(label)}${note ? `<span class="note">${esc(note)}</span>` : ""}</td>
        <td class="num amount-cell">${esc(amount)}</td>
      </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(report.employee.name)} — Performance Report ${esc(report.period.monthLabel)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: A4; margin: 14mm 16mm; }
    body {
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 24px;
      line-height: 1.45;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .report-header {
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid #fecdd3;
      margin-bottom: 28px;
      box-shadow: 0 4px 24px rgba(190, 18, 60, 0.08);
    }
    .report-header-top {
      background: linear-gradient(135deg, #be123c 0%, #e11d48 100%);
      color: #fff;
      padding: 14px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .report-header-top .doc-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      opacity: 0.92;
    }
    .report-header-top .doc-date {
      font-size: 11px;
      opacity: 0.85;
      white-space: nowrap;
    }
    .employee-banner {
      background: linear-gradient(180deg, #fff5f6 0%, #ffffff 100%);
      padding: 22px 24px 20px;
      display: flex;
      align-items: center;
      gap: 20px;
    }
    .avatar {
      width: 72px;
      height: 72px;
      border-radius: 18px;
      background: linear-gradient(135deg, #be123c, #fb7185);
      color: #fff;
      font-size: 26px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 4px 14px rgba(190, 18, 60, 0.25);
    }
    .employee-info h1 {
      margin: 0 0 6px;
      font-size: 28px;
      font-weight: 800;
      color: #881337;
      letter-spacing: -0.02em;
      line-height: 1.1;
    }
    .employee-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 4px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      background: #fff;
      border: 1px solid #fecdd3;
      color: #9f1239;
    }
    .chip.period { background: #be123c; color: #fff; border-color: #be123c; }
    .chip.status { background: #fef3c7; border-color: #fcd34d; color: #92400e; }

    .score-banner {
      margin-left: auto;
      text-align: center;
      padding: 10px 18px;
      border-radius: 14px;
      background: #fff;
      border: 2px solid #fecdd3;
      min-width: 100px;
    }
    .score-banner .label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #94a3b8;
    }
    .score-banner .value {
      font-size: 26px;
      font-weight: 900;
      color: #be123c;
      line-height: 1.1;
      margin-top: 2px;
    }

    h2 {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #be123c;
      margin: 0 0 10px;
      padding-bottom: 6px;
      border-bottom: 2px solid #fecdd3;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 22px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-bottom: 4px;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 9px 12px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f8fafc;
      font-weight: 700;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #64748b;
    }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.earned { color: #be123c; font-weight: 700; }
    td .note {
      display: block;
      font-size: 10px;
      color: #94a3b8;
      font-weight: 400;
      margin-top: 2px;
    }
    td.amount-cell { font-weight: 700; color: #0f172a; }

    .money-section {
      margin-top: 24px;
      page-break-inside: avoid;
    }
    .total-box {
      margin-top: 14px;
      background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
      border: 2px solid #6ee7b7;
      border-radius: 14px;
      padding: 18px 22px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .total-box .total-label {
      font-size: 13px;
      font-weight: 700;
      color: #065f46;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .total-box .total-sub {
      font-size: 11px;
      color: #047857;
      margin-top: 4px;
    }
    .total-box .amount {
      font-size: 32px;
      font-weight: 900;
      color: #047857;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }

    .footer {
      margin-top: 28px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      font-size: 10px;
      color: #94a3b8;
      text-align: center;
    }

    @media print {
      body { padding: 0; }
      .report-header { box-shadow: none; }
    }
    @media (max-width: 640px) {
      .grid-2 { grid-template-columns: 1fr; }
      .employee-banner { flex-wrap: wrap; }
      .score-banner { margin-left: 0; width: 100%; }
    }
  </style>
</head>
<body>
  <header class="report-header">
    <div class="report-header-top">
      <span class="doc-title">Performance &amp; Incentive Report</span>
      <span class="doc-date">${esc(generatedLabel)}</span>
    </div>
    <div class="employee-banner">
      <div class="avatar">${esc(initials)}</div>
      <div class="employee-info">
        <h1>${esc(report.employee.name)}</h1>
        <div class="employee-meta">
          <span class="chip">${esc(report.employee.role)}</span>
          <span class="chip">${esc(report.employee.team)}</span>
          <span class="chip period">${esc(report.period.monthLabel)} · ${esc(report.period.kraPeriodLabel)}</span>
          <span class="chip status">${esc(report.employee.status)}</span>
        </div>
      </div>
      <div class="score-banner">
        <div class="label">Performance Score</div>
        <div class="value">${esc(report.kraScore)}%</div>
      </div>
    </div>
  </header>

  <div class="grid-2">
    <section>
      <h2>Call Performance</h2>
      <table>
        <tr><th>Metric</th><th class="num">Value</th></tr>
        ${callStats}
      </table>
    </section>
    <section>
      <h2>Lead Status Summary</h2>
      <table>
        <tr><th>Status</th><th class="num">Count</th></tr>
        ${leadStatusRows || '<tr><td colspan="2">No lead data</td></tr>'}
      </table>
    </section>
  </div>

  <section>
    <h2>Incentive Metrics</h2>
    <table>
      <tr>
        <th>Metric</th>
        <th class="num">Completed / Target</th>
        <th class="num">Weight</th>
        <th class="num">Earned</th>
      </tr>
      ${kraRows}
    </table>
  </section>

  ${
    serviceRows
      ? `<section style="margin-top:22px">
    <h2>Service Metrics</h2>
    <table>
      <tr><th>Metric</th><th class="num">Value</th><th class="num">Score</th></tr>
      ${serviceRows}
    </table>
  </section>`
      : ""
  }

  <section class="money-section">
    <h2>Remuneration Breakdown</h2>
    <table>
      <tr><th>Component</th><th class="num">Amount (INR)</th></tr>
      ${remunerationTable}
    </table>
    <div class="total-box">
      <div>
        <div class="total-label">Total Money</div>
        <div class="total-sub">Base Salary + Incentive + Bonus − Penalty</div>
      </div>
      <div class="amount">${esc(money(report.remuneration.totalMoney))}</div>
    </div>
  </section>

  <div class="footer">
    Confidential · ${esc(report.employee.name)} · ${esc(report.period.monthLabel)} · Generated ${esc(generatedLabel)}
  </div>

  <script>window.onload = () => { setTimeout(() => window.print(), 300); };</script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function downloadEmployeeIncentiveReport(payload, format = "csv") {
  const report = buildEmployeeIncentiveReport(payload);
  if (format === "html" || format === "pdf") {
    downloadIncentiveReportHtml(report);
  } else {
    downloadIncentiveReportCsv(report);
  }
  return report;
}
