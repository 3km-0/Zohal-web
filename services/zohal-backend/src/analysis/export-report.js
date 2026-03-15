import { resolveDataPlane } from "../runtime/data-plane.js";
import {
  generateSignedUploadUrl,
  joinObjectPath,
} from "../runtime/gcs.js";

function normalizeId(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isArabic(settings) {
  return String(settings?.language || "en").toLowerCase() === "ar";
}

function translate(settings, key) {
  const en = {
    report: "Contract Report",
    generated: "Generated",
    finalized: "Finalized",
    provisional: "Provisional",
    reviewedBy: "Reviewed by",
    state: "State",
    version: "Version",
    variables: "Variables",
    clauses: "Clauses",
    obligations: "Obligations",
    risks: "Risks",
    records: "Records",
    verdicts: "Verdicts",
    exceptions: "Exceptions",
    modules: "Modules",
    evidence: "Evidence",
    none: "No items available.",
    executiveSummary: "Executive Summary",
    proofAppendix: "Proof Appendix",
    auditTrail: "Audit Trail",
    template: "Template",
    schema: "Schema",
    analyzed: "Analyzed",
    chunks: "Chunks",
    keyDates: "Key Dates",
    keyVariables: "Key Variables",
    openRisks: "Open Risks",
    itemsToReview: "Items To Review",
    dueSoon: "Due Soon",
    importantClauses: "Important Clauses",
    priorityObligations: "Priority Obligations",
    riskRegister: "Risk Register",
    moduleOutputs: "Module Outputs",
    reviewSignals: "Review Signals",
    reportGenerated: "Report Generated",
  };
  const ar = {
    report: "تقرير العقد",
    generated: "تم الإنشاء",
    finalized: "نهائي",
    provisional: "مبدئي",
    reviewedBy: "تمت المراجعة بواسطة",
    state: "الحالة",
    version: "الإصدار",
    variables: "المتغيرات",
    clauses: "البنود",
    obligations: "الالتزامات",
    risks: "المخاطر",
    records: "السجلات",
    verdicts: "الأحكام",
    exceptions: "الاستثناءات",
    modules: "الوحدات",
    evidence: "الدليل",
    none: "لا توجد عناصر.",
    executiveSummary: "الملخص التنفيذي",
    proofAppendix: "ملحق الأدلة",
    auditTrail: "سجل التدقيق",
    template: "القالب",
    schema: "المخطط",
    analyzed: "تم التحليل",
    chunks: "الأجزاء",
    keyDates: "التواريخ الأساسية",
    keyVariables: "المتغيرات الأساسية",
    openRisks: "المخاطر المفتوحة",
    itemsToReview: "عناصر للمراجعة",
    dueSoon: "مستحق قريباً",
    importantClauses: "البنود المهمة",
    priorityObligations: "الالتزامات ذات الأولوية",
    riskRegister: "سجل المخاطر",
    moduleOutputs: "مخرجات الوحدات",
    reviewSignals: "إشارات المراجعة",
    reportGenerated: "تم إنشاء التقرير",
  };
  const dict = isArabic(settings) ? ar : en;
  return dict[key] || key;
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = safeDate(value);
  return date ? date.toLocaleString() : "—";
}

function formatValue(variable) {
  if (variable?.value === null || variable?.value === undefined) return "—";
  if (variable?.type === "boolean") return variable.value ? "Yes" : "No";
  if (variable?.type === "date") {
    const parsed = safeDate(variable.value);
    if (parsed) return parsed.toLocaleDateString();
  }
  if (variable?.unit) return `${variable.value} ${variable.unit}`;
  if (typeof variable.value === "object") return JSON.stringify(variable.value);
  return String(variable.value);
}

function toStringSet(value) {
  if (!Array.isArray(value)) return new Set();
  return new Set(
    value.map((item) => String(item || "").trim()).filter(Boolean),
  );
}

function getRejectedSets(snapshot) {
  const pack = snapshot?.pack && typeof snapshot.pack === "object"
    ? snapshot.pack
    : {};
  const reviewRejected = pack.review?.rejected &&
      typeof pack.review.rejected === "object" &&
      !Array.isArray(pack.review.rejected)
    ? pack.review.rejected
    : null;
  const legacyRejected = pack.rejected &&
      typeof pack.rejected === "object" &&
      !Array.isArray(pack.rejected)
    ? pack.rejected
    : null;
  const source = reviewRejected || legacyRejected || {};
  return {
    variables: toStringSet(source.variables),
    clauses: toStringSet(source.clauses),
    obligations: toStringSet(source.obligations),
    risks: toStringSet(source.risks),
    records: toStringSet(source.records),
    verdicts: toStringSet(source.verdicts),
    exceptions: toStringSet(source.exceptions),
    modules: toStringSet(source.modules),
  };
}

function isEvidenceGradeSnapshot(snapshot) {
  const version = typeof snapshot?.schema_version === "string"
    ? snapshot.schema_version
    : "";
  return version.split(".")[0] === "2" && Array.isArray(snapshot?.variables);
}

function normalizeList(value) {
  return Array.isArray(value) ? value : [];
}

function renderEvidence(item) {
  const evidence = item?.evidence;
  if (!evidence || typeof evidence !== "object") return "";
  const page = evidence.page_number ? `p.${escapeHtml(evidence.page_number)}` : "";
  const snippet = evidence.snippet ? escapeHtml(evidence.snippet) : "";
  if (!page && !snippet) return "";
  return `
    <div class="evidence">
      ${page ? `<div class="evidence-page">${page}</div>` : ""}
      ${snippet ? `<blockquote>${snippet}</blockquote>` : ""}
    </div>
  `;
}

function renderGenericSection(title, items, renderItem, emptyLabel) {
  if (!items.length) {
    return `
      <section class="section">
        <h2>${escapeHtml(title)}</h2>
        <div class="empty">${escapeHtml(emptyLabel)}</div>
      </section>
    `;
  }

  return `
    <section class="section">
      <h2>${escapeHtml(title)}</h2>
      ${items.map(renderItem).join("")}
    </section>
  `;
}

function renderVariable(variable) {
  return `
    <article class="card">
      <div class="card-head">
        <div>
          <div class="card-title">${escapeHtml(variable.display_name || variable.name || "Variable")}</div>
          <div class="card-meta">${escapeHtml(variable.name || "")}</div>
        </div>
        <div class="value-pill">${escapeHtml(formatValue(variable))}</div>
      </div>
      ${renderEvidence(variable)}
    </article>
  `;
}

function renderEntityCard(item, fallbackTitle, metaParts = []) {
  const title = item.clause_title || item.summary || item.title || item.name ||
    item.rule_id || fallbackTitle;
  const body = item.description || item.message || item.explanation || "";
  const meta = metaParts.filter(Boolean).map((part) => escapeHtml(part)).join(" • ");
  return `
    <article class="card">
      <div class="card-title">${escapeHtml(title)}</div>
      ${meta ? `<div class="card-meta">${meta}</div>` : ""}
      ${body ? `<div class="card-body">${escapeHtml(body)}</div>` : ""}
      ${renderEvidence(item)}
    </article>
  `;
}

function renderPackModules(snapshot, rejected, settings) {
  const pack = snapshot?.pack && typeof snapshot.pack === "object" ? snapshot.pack : {};
  const coreIds = new Set(["variables", "clauses", "obligations", "risks", "deadlines"]);
  const groupedRecordModules = new Map();
  for (const item of normalizeList(pack.records)) {
    const recordId = String(item?.id || "").trim();
    const moduleId = String(item?.module_id || "").trim();
    if (!recordId || !moduleId || coreIds.has(moduleId)) continue;
    if (rejected.records.has(recordId)) continue;
    if (String(item?.status || "").trim().toLowerCase() === "rejected") continue;
    if (item?.show_in_report === false) continue;
    if (!groupedRecordModules.has(moduleId)) {
      groupedRecordModules.set(moduleId, {
        title: String(item?.module_title || moduleId),
        items: [],
      });
    }
    groupedRecordModules.get(moduleId).items.push({
      title: item?.title || item?.summary || item?.record_type || moduleId,
      body: item?.summary || item?.rationale || "",
      meta: item?.status || item?.record_type || null,
      evidence: Array.isArray(item?.evidence) && item.evidence[0]
        ? { page_number: item.evidence[0].page_number, snippet: item.evidence[0].source_quote || item.evidence[0].snippet }
        : null,
    });
  }
  const recordBackedIds = new Set(Array.from(groupedRecordModules.keys()));
  const modules = pack.modules && typeof pack.modules === "object" && !Array.isArray(pack.modules)
    ? Object.entries(pack.modules)
      .filter(([key]) =>
        !rejected.modules.has(String(key || "").trim()) &&
        !coreIds.has(String(key || "").trim()) &&
        !recordBackedIds.has(String(key || "").trim())
      )
      .map(([key, value]) => ({ key, value }))
    : [];
  const customModules = Array.isArray(pack?.playbook?.custom_modules)
    ? pack.playbook.custom_modules.filter((item) =>
      !rejected.modules.has(String(item?.id || "").trim()) &&
      !recordBackedIds.has(String(item?.id || "").trim())
    )
    : [];

  const moduleCards = modules.map(({ key, value }) => ({
    title: String(key || "module"),
    body: typeof value === "string" ? value : JSON.stringify(value, null, 2),
    meta: value?.status || value?.title || null,
    evidence: Array.isArray(value?.evidence) && value.evidence[0]
      ? { page_number: value.evidence[0].page_number, snippet: value.evidence[0].source_quote }
      : null,
  }));
  const customCards = customModules.map((item) => ({
    title: item?.title || item?.id || "Custom Module",
    body: item?.status === "ok"
      ? JSON.stringify(item?.result ?? {}, null, 2)
      : String(item?.error || "Unavailable"),
    meta: item?.status || null,
    evidence: Array.isArray(item?.evidence) && item.evidence[0]
      ? { page_number: item.evidence[0].page_number, snippet: item.evidence[0].source_quote }
      : null,
  }));

  const legacyHtml = renderGenericSection(
    translate(settings, "moduleOutputs"),
    [...moduleCards, ...customCards],
    (item) => `
      <article class="card">
        <div class="card-title">${escapeHtml(item.title)}</div>
        ${item.meta ? `<div class="card-meta">${escapeHtml(String(item.meta))}</div>` : ""}
        <pre>${escapeHtml(String(item.body || ""))}</pre>
        ${item.evidence ? renderEvidence(item) : ""}
      </article>
    `,
    translate(settings, "none"),
  );

  const recordHtml = Array.from(groupedRecordModules.values()).map((group) =>
    renderGenericSection(
      String(group.title || "Module"),
      group.items,
      (item) => `
        <article class="card">
          <div class="card-title">${escapeHtml(String(item.title || "Record"))}</div>
          ${item.meta ? `<div class="card-meta">${escapeHtml(String(item.meta))}</div>` : ""}
          ${item.body ? `<div class="card-body">${escapeHtml(String(item.body || ""))}</div>` : ""}
          ${item.evidence ? renderEvidence(item) : ""}
        </article>
      `,
      translate(settings, "none"),
    )
  ).join("");

  return `${recordHtml}${legacyHtml}`;
}

function getVariableValue(snapshot, name) {
  return normalizeList(snapshot?.variables).find((item) => item?.name === name)?.value ?? null;
}

function formatDateOnly(value) {
  const date = safeDate(value);
  return date ? date.toLocaleDateString() : "—";
}

function buildSlateReportCss(settings) {
  const accent = escapeHtml(settings.primaryColor || "#0d9488");
  return `
    @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
    :root {
      --bg: #ffffff;
      --bg-alt: #fafaf9;
      --surface: #ffffff;
      --line: #e7e5e4;
      --line-strong: #d6d3d1;
      --ink: #1c1917;
      --text-soft: #78716c;
      --text-muted: #a8a29e;
      --accent: ${accent};
      --accent-deep: #0f766e;
      --accent-soft: rgba(13, 148, 136, 0.08);
      --success: #16a34a;
      --warning: #b45309;
      --danger: #b91c1c;
      --shadow: 0 20px 60px rgba(28, 25, 23, 0.06);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        radial-gradient(circle at top left, rgba(13, 148, 136, 0.06), transparent 26%),
        linear-gradient(180deg, #ffffff 0%, #fafaf9 100%);
      color: var(--ink);
      font: 15px/1.7 "Plus Jakarta Sans", system-ui, sans-serif;
      ${isArabic(settings) ? "direction: rtl; text-align: right;" : ""}
    }
    main { max-width: 1080px; margin: 0 auto; padding: 32px 20px 48px; }
    .hero, .section {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 24px;
      box-shadow: var(--shadow);
    }
    .hero {
      position: relative;
      overflow: hidden;
      padding: 30px;
      margin-bottom: 18px;
    }
    .hero::after {
      content: "";
      position: absolute;
      inset: auto -10% -40% 55%;
      height: 220px;
      background: radial-gradient(circle, rgba(13, 148, 136, 0.14), transparent 65%);
      pointer-events: none;
    }
    .eyebrow {
      color: var(--accent);
      font: 700 11px/1.4 "Plus Jakarta Sans", system-ui, sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }
    h1, h2, h3 { margin: 0; color: var(--ink); }
    h1 {
      margin-top: 10px;
      font: 400 52px/0.98 "Instrument Serif", Georgia, serif;
      letter-spacing: -0.03em;
    }
    .hero-subtitle {
      margin-top: 14px;
      max-width: 640px;
      color: var(--text-soft);
      font-size: 15px;
    }
    .hero-meta, .summary-grid, .three-grid, .two-grid {
      display: grid;
      gap: 12px;
      margin-top: 20px;
    }
    .hero-meta, .summary-grid { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
    .three-grid { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .two-grid { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    .metric {
      padding: 16px;
      border-radius: 18px;
      background: var(--bg-alt);
      border: 1px solid var(--line);
    }
    .metric-label {
      color: var(--text-soft);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.09em;
    }
    .metric-value {
      margin-top: 6px;
      font-size: 21px;
      font-weight: 700;
    }
    .metric-detail {
      margin-top: 6px;
      color: var(--text-soft);
      font-size: 12px;
    }
    .section {
      margin-top: 16px;
      padding: 24px;
    }
    .section h2 {
      font: 400 28px/1.05 "Instrument Serif", Georgia, serif;
      letter-spacing: -0.02em;
    }
    .section-lead {
      margin-top: 8px;
      color: var(--text-soft);
      font-size: 14px;
    }
    .card {
      margin-top: 12px;
      padding: 18px;
      border-radius: 18px;
      background: var(--bg-alt);
      border: 1px solid rgba(28, 25, 23, 0.06);
    }
    .card:first-of-type { margin-top: 0; }
    .card-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
    }
    .card-title {
      font-size: 16px;
      font-weight: 700;
    }
    .card-meta {
      margin-top: 5px;
      color: var(--text-soft);
      font-size: 12px;
    }
    .card-body {
      margin-top: 10px;
      color: var(--ink);
      white-space: pre-wrap;
    }
    .value-pill, .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      padding: 6px 11px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .value-pill {
      background: var(--accent-soft);
      color: var(--accent-deep);
      font-family: "Plus Jakarta Sans", system-ui, sans-serif;
    }
    .badge.teal { background: var(--accent-soft); color: var(--accent-deep); }
    .badge.green { background: rgba(22, 163, 74, 0.08); color: var(--success); }
    .badge.amber { background: rgba(180, 83, 9, 0.08); color: var(--warning); }
    .badge.ink { background: rgba(28, 25, 23, 0.06); color: var(--ink); }
    .evidence {
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid rgba(28, 25, 23, 0.08);
    }
    .evidence-page {
      color: var(--text-soft);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    blockquote, pre {
      margin: 8px 0 0;
      padding: 14px 16px;
      border-radius: 16px;
      background: #ffffff;
      border: 1px solid rgba(28, 25, 23, 0.08);
      overflow: auto;
      white-space: pre-wrap;
    }
    .empty { color: var(--text-soft); font-style: italic; }
    .group-list { display: grid; gap: 10px; margin-top: 14px; }
    .group-label {
      color: var(--text-soft);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .timeline {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 14px;
    }
    .timeline-step {
      padding: 16px;
      border-radius: 18px;
      background: var(--bg-alt);
      border: 1px solid var(--line);
    }
    .timeline-step strong {
      display: block;
      margin-top: 6px;
      font-size: 18px;
    }
    .timeline-step span {
      color: var(--text-soft);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .proof-grid { display: grid; gap: 12px; margin-top: 14px; }
    .audit-grid {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      margin-top: 14px;
    }
    .audit-item {
      padding: 14px;
      border-radius: 16px;
      background: var(--bg-alt);
      border: 1px solid var(--line);
    }
    .audit-item-label {
      color: var(--text-soft);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .audit-item-value {
      margin-top: 6px;
      font-size: 14px;
      font-weight: 600;
      word-break: break-word;
    }
    @media (max-width: 700px) {
      main { padding: 18px 14px 28px; }
      .hero, .section { padding: 18px; border-radius: 20px; }
      h1 { font-size: 38px; }
      .card-head { flex-direction: column; }
    }
  `;
}

function renderMetric(label, value, detail = "") {
  return `
    <div class="metric">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${escapeHtml(String(value ?? "—"))}</div>
      ${detail ? `<div class="metric-detail">${escapeHtml(detail)}</div>` : ""}
    </div>
  `;
}

function renderAdvancedSections(snapshot, rejected, settings) {
  const records = normalizeList(snapshot?.pack?.records).filter((item) =>
    !rejected.records.has(String(item?.id || "").trim())
  );
  const verdicts = normalizeList(snapshot?.pack?.verdicts).filter((item) =>
    !rejected.verdicts.has(String(item?.id || "").trim())
  );
  const exceptions = normalizeList(snapshot?.pack?.exceptions_v3).filter((item) =>
    !rejected.exceptions.has(String(item?.id || "").trim())
  );

  return [
    renderGenericSection(
      translate(settings, "records"),
      records,
      (item) => renderEntityCard(item, "Record", [item.record_type, item.status, item.confidence || item.ai_confidence]),
      translate(settings, "none"),
    ),
    renderGenericSection(
      translate(settings, "verdicts"),
      verdicts,
      (item) => renderEntityCard(item, "Verdict", [item.status, item.severity, item.rule_id]),
      translate(settings, "none"),
    ),
    renderGenericSection(
      translate(settings, "exceptions"),
      exceptions,
      (item) => renderEntityCard(item, "Exception", [item.status, item.severity, item.rule_id]),
      translate(settings, "none"),
    ),
    renderPackModules(snapshot, rejected, settings),
  ].join("");
}

function renderProofAppendix(snapshot, rejected, settings) {
  const proofItems = [];
  const groups = [
    { key: "variables", items: normalizeList(snapshot?.variables), rejected: rejected.variables, title: "Variable" },
    { key: "clauses", items: normalizeList(snapshot?.clauses), rejected: rejected.clauses, title: "Clause" },
    { key: "obligations", items: normalizeList(snapshot?.obligations), rejected: rejected.obligations, title: "Obligation" },
    { key: "risks", items: normalizeList(snapshot?.risks), rejected: rejected.risks, title: "Risk" },
  ];
  for (const group of groups) {
    for (const item of group.items) {
      if (group.rejected.has(String(item?.id || "").trim())) continue;
      if (!item?.evidence?.snippet) continue;
      proofItems.push({
        title: item.display_name || item.clause_title || item.summary || item.description || item.name || group.title,
        page: item.evidence.page_number || "—",
        snippet: item.evidence.snippet,
      });
    }
  }

  return renderGenericSection(
    translate(settings, "proofAppendix"),
    proofItems.slice(0, 40),
    (item) => `
      <article class="card">
        <div class="card-title">${escapeHtml(String(item.title || "Evidence"))}</div>
        <div class="card-meta">${escapeHtml(`p.${item.page}`)}</div>
        <blockquote>${escapeHtml(String(item.snippet || ""))}</blockquote>
      </article>
    `,
    translate(settings, "none"),
  );
}

function renderAuditSection(snapshot, state, versionNumber, finalizedAt, reviewerName, settings) {
  return `
    <section class="section">
      <h2>${escapeHtml(translate(settings, "auditTrail"))}</h2>
      <div class="audit-grid">
        <div class="audit-item">
          <div class="audit-item-label">${escapeHtml(translate(settings, "state"))}</div>
          <div class="audit-item-value">${escapeHtml(state === "finalized" ? translate(settings, "finalized") : translate(settings, "provisional"))}</div>
        </div>
        <div class="audit-item">
          <div class="audit-item-label">${escapeHtml(translate(settings, "version"))}</div>
          <div class="audit-item-value">${escapeHtml(versionNumber > 0 ? `v${versionNumber}` : "—")}</div>
        </div>
        <div class="audit-item">
          <div class="audit-item-label">${escapeHtml(translate(settings, "reviewedBy"))}</div>
          <div class="audit-item-value">${escapeHtml(reviewerName || "—")}</div>
        </div>
        <div class="audit-item">
          <div class="audit-item-label">${escapeHtml(translate(settings, "generated"))}</div>
          <div class="audit-item-value">${escapeHtml(formatDate(finalizedAt || new Date().toISOString()))}</div>
        </div>
        <div class="audit-item">
          <div class="audit-item-label">${escapeHtml(translate(settings, "template"))}</div>
          <div class="audit-item-value">${escapeHtml(String(snapshot?.template || "contract_analysis"))}</div>
        </div>
        <div class="audit-item">
          <div class="audit-item-label">${escapeHtml(translate(settings, "schema"))}</div>
          <div class="audit-item-value">${escapeHtml(String(snapshot?.schema_version || "legacy"))}</div>
        </div>
      </div>
    </section>
  `;
}

function renderSlateShell({
  documentTitle,
  state,
  versionNumber,
  finalizedAt,
  reviewerName,
  settings,
  templateLabel,
  heroSummary,
  sectionsHtml,
}) {
  const stateClass = state === "finalized" ? "green" : "amber";
  return `
<!doctype html>
<html lang="${escapeHtml(isArabic(settings) ? "ar" : "en")}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(documentTitle)}</title>
  <style>${buildSlateReportCss(settings)}</style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="eyebrow">${escapeHtml(translate(settings, "report"))} • ${escapeHtml(templateLabel)}</div>
      <h1>${escapeHtml(settings.customTitle || documentTitle)}</h1>
      <div class="hero-subtitle">${escapeHtml(settings.customSubtitle || `${templateLabel} • ${documentTitle}`)}</div>
      <div class="hero-meta">
        ${renderMetric(translate(settings, "state"), state === "finalized" ? translate(settings, "finalized") : translate(settings, "provisional"))}
        ${renderMetric(translate(settings, "version"), versionNumber > 0 ? `v${versionNumber}` : "—")}
        ${renderMetric(translate(settings, "generated"), formatDate(finalizedAt || new Date().toISOString()))}
        ${renderMetric(translate(settings, "reviewedBy"), reviewerName || "—")}
      </div>
      <div class="summary-grid">
        ${heroSummary}
      </div>
      <div style="margin-top:16px;">
        <span class="badge ${stateClass}">${escapeHtml(state === "finalized" ? translate(settings, "finalized") : translate(settings, "provisional"))}</span>
        <span class="badge teal">${escapeHtml(templateLabel)}</span>
      </div>
    </section>
    ${sectionsHtml}
  </main>
</body>
</html>
  `.trim();
}

function renderRenewalPackHtml(snapshot, documentTitle, state, versionNumber, finalizedAt, reviewerName, settings) {
  const rejected = getRejectedSets(snapshot);
  const variables = normalizeList(snapshot?.variables).filter((item) =>
    !rejected.variables.has(String(item?.id || "").trim())
  );
  const clauses = normalizeList(snapshot?.clauses).filter((item) =>
    !rejected.clauses.has(String(item?.id || "").trim())
  );
  const obligations = normalizeList(snapshot?.obligations).filter((item) =>
    !rejected.obligations.has(String(item?.id || "").trim())
  );
  const risks = normalizeList(snapshot?.risks).filter((item) =>
    !rejected.risks.has(String(item?.id || "").trim())
  );

  const endDate = getVariableValue(snapshot, "end_date");
  const effectiveDate = getVariableValue(snapshot, "effective_date");
  const noticeDeadline = getVariableValue(snapshot, "notice_deadline");
  const noticeDays = getVariableValue(snapshot, "notice_period_days");
  const itemsToReview = variables.filter((item) =>
    item?.verification_state === "needs_review" ||
    String(item?.ai_confidence || "").toLowerCase() === "low"
  ).length + obligations.filter((item) =>
    item?.verification_state === "needs_review" ||
    String(item?.ai_confidence || "").toLowerCase() === "low"
  ).length;
  const openRisks = risks.filter((item) => !item?.resolved).length;
  const dueSoon = obligations.filter((item) => {
    const date = safeDate(item?.due_at);
    if (!date) return false;
    const days = Math.ceil((date.getTime() - Date.now()) / 86400000);
    return days >= 0 && days <= 30;
  }).length;
  const timelineHtml = `
    <section class="section">
      <h2>${escapeHtml(translate(settings, "keyDates"))}</h2>
      <div class="section-lead">${escapeHtml("Anchor dates and notice timing pulled from the current contract snapshot.")}</div>
      <div class="timeline">
        <div class="timeline-step"><span>${escapeHtml("Effective")}</span><strong>${escapeHtml(formatDateOnly(effectiveDate))}</strong></div>
        <div class="timeline-step"><span>${escapeHtml("Notice")}</span><strong>${escapeHtml(formatDateOnly(noticeDeadline))}</strong></div>
        <div class="timeline-step"><span>${escapeHtml("End")}</span><strong>${escapeHtml(formatDateOnly(endDate))}</strong></div>
        <div class="timeline-step"><span>${escapeHtml("Notice Window")}</span><strong>${escapeHtml(noticeDays ? `${noticeDays} days` : "—")}</strong></div>
      </div>
    </section>
  `;

  const groups = [
    {
      label: "Identity",
      names: ["counterparty_name", "contract_type", "governing_law"],
    },
    {
      label: "Dates",
      names: ["effective_date", "end_date", "notice_deadline"],
    },
    {
      label: "Renewal",
      names: ["term_length_months", "notice_period_days", "auto_renewal", "termination_for_convenience"],
    },
  ];
  const variableGroupsHtml = `
    <section class="section">
      <h2>${escapeHtml(translate(settings, "keyVariables"))}</h2>
      <div class="section-lead">${escapeHtml("Variables are grouped for quick renewal review and decision support.")}</div>
      <div class="three-grid">
        ${groups.map((group) => `
          <div class="card">
            <div class="group-label">${escapeHtml(group.label)}</div>
            <div class="group-list">
              ${variables
                .filter((item) => group.names.includes(String(item?.name || "")))
                .map((item) => `
                  <div>
                    <div class="card-meta">${escapeHtml(item.display_name || item.name || "Variable")}</div>
                    <div class="card-title">${escapeHtml(formatValue(item))}</div>
                  </div>
                `)
                .join("") || `<div class="empty">${escapeHtml(translate(settings, "none"))}</div>`}
            </div>
          </div>
        `).join("")}
      </div>
    </section>
  `;

  const sectionsHtml = [
    timelineHtml,
    variableGroupsHtml,
    renderGenericSection(
      translate(settings, "priorityObligations"),
      obligations,
      (item) => renderEntityCard(item, "Obligation", [item.responsible_party, item.due_at, item.ai_confidence]),
      translate(settings, "none"),
    ),
    renderGenericSection(
      translate(settings, "riskRegister"),
      risks,
      (item) => renderEntityCard(item, "Risk", [item.severity, item.resolved ? "resolved" : "open"]),
      translate(settings, "none"),
    ),
    renderGenericSection(
      translate(settings, "importantClauses"),
      clauses,
      (item) => renderEntityCard(item, "Clause", [item.clause_type, item.risk_level]),
      translate(settings, "none"),
    ),
    renderAdvancedSections(snapshot, rejected, settings),
    renderProofAppendix(snapshot, rejected, settings),
    renderAuditSection(snapshot, state, versionNumber, finalizedAt, reviewerName, settings),
  ].join("");

  return renderSlateShell({
    documentTitle,
    state,
    versionNumber,
    finalizedAt,
    reviewerName,
    settings,
    templateLabel: String(snapshot?.template || "contract_analysis").replace(/_/g, " "),
    heroSummary: [
      renderMetric(translate(settings, "keyVariables"), variables.length),
      renderMetric(translate(settings, "itemsToReview"), itemsToReview),
      renderMetric(translate(settings, "openRisks"), openRisks),
      renderMetric(translate(settings, "dueSoon"), dueSoon),
    ].join(""),
    sectionsHtml,
  });
}

function renderEvidenceGradeHtml(snapshot, documentTitle, state, versionNumber, finalizedAt, reviewerName, settings) {
  const rejected = getRejectedSets(snapshot);
  const variables = normalizeList(snapshot?.variables).filter((item) =>
    !rejected.variables.has(String(item?.id || "").trim())
  );
  const clauses = normalizeList(snapshot?.clauses).filter((item) =>
    !rejected.clauses.has(String(item?.id || "").trim())
  );
  const obligations = normalizeList(snapshot?.obligations).filter((item) =>
    !rejected.obligations.has(String(item?.id || "").trim())
  );
  const risks = normalizeList(snapshot?.risks).filter((item) =>
    !rejected.risks.has(String(item?.id || "").trim())
  );

  const sectionsHtml = [
    renderGenericSection(translate(settings, "variables"), variables, renderVariable, translate(settings, "none")),
    renderGenericSection(translate(settings, "clauses"), clauses, (item) => renderEntityCard(item, "Clause", [item.clause_type, item.risk_level]), translate(settings, "none")),
    renderGenericSection(translate(settings, "obligations"), obligations, (item) => renderEntityCard(item, "Obligation", [item.responsible_party, item.due_at, item.priority || item.severity]), translate(settings, "none")),
    renderGenericSection(translate(settings, "risks"), risks, (item) => renderEntityCard(item, "Risk", [item.severity, item.resolved ? "resolved" : "open"]), translate(settings, "none")),
    renderAdvancedSections(snapshot, rejected, settings),
    renderProofAppendix(snapshot, rejected, settings),
    renderAuditSection(snapshot, state, versionNumber, finalizedAt, reviewerName, settings),
  ].join("");

  return renderSlateShell({
    documentTitle,
    state,
    versionNumber,
    finalizedAt,
    reviewerName,
    settings,
    templateLabel: String(snapshot?.template || "contract_analysis").replace(/_/g, " "),
    heroSummary: [
      renderMetric(translate(settings, "variables"), variables.length),
      renderMetric(translate(settings, "clauses"), clauses.length),
      renderMetric(translate(settings, "obligations"), obligations.length),
      renderMetric(translate(settings, "risks"), risks.length),
    ].join(""),
    sectionsHtml,
  });
}

function renderLegacyHtml(snapshot, documentTitle, state, versionNumber, finalizedAt, reviewerName, settings) {
  const legacySnapshot = snapshot && typeof snapshot === "object" ? snapshot : {};
  return renderEvidenceGradeHtml(
    {
      schema_version: "legacy",
      template: String(legacySnapshot.template || "legacy"),
      variables: [],
      clauses: normalizeList(legacySnapshot.clauses),
      obligations: normalizeList(legacySnapshot.obligations),
      risks: normalizeList(legacySnapshot.risks),
      pack: {},
    },
    documentTitle,
    state,
    versionNumber,
    finalizedAt,
    reviewerName,
    settings,
  );
}

export function renderContractExportHtml({
  snapshot,
  documentTitle,
  state,
  versionNumber,
  finalizedAt,
  reviewerName,
  settings,
}) {
  if (snapshot && isEvidenceGradeSnapshot(snapshot)) {
    const templateId = String(snapshot.template || "").trim();
    if (templateId === "renewal_pack" || templateId === "contract_analysis") {
      return renderRenewalPackHtml(
        snapshot,
        documentTitle,
        state,
        versionNumber,
        finalizedAt,
        reviewerName,
        settings,
      );
    }
    return renderEvidenceGradeHtml(
      snapshot,
      documentTitle,
      state,
      versionNumber,
      finalizedAt,
      reviewerName,
      settings,
    );
  }

  return renderLegacyHtml(
    snapshot,
    documentTitle,
    state,
    versionNumber,
    finalizedAt,
    reviewerName,
    settings,
  );
}

async function fetchReviewerName(supabase, reviewerId) {
  if (!reviewerId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", normalizeId(reviewerId))
    .maybeSingle();
  return data?.display_name ? String(data.display_name) : null;
}

async function loadVersionExport(supabase, versionId) {
  const { data: version, error } = await supabase
    .from("verification_object_versions")
    .select("*, verification_objects(*, documents(id, title, user_id, workspace_id))")
    .eq("id", normalizeId(versionId))
    .single();

  if (error || !version) {
    throw new Error("Version not found");
  }

  return {
    snapshot: version.snapshot_json || null,
    state: String(version.state || "unknown"),
    versionNumber: Number(version.version_number || 0),
    finalizedAt: version.reviewed_at || null,
    reviewerName: await fetchReviewerName(supabase, version.reviewed_by),
    documentTitle: version.verification_objects?.documents?.title || "Contract",
    documentId: version.verification_objects?.documents?.id
      ? normalizeId(version.verification_objects.documents.id)
      : null,
    workspaceId: version.verification_objects?.documents?.workspace_id
      ? normalizeId(version.verification_objects.documents.workspace_id)
      : null,
  };
}

async function loadVerificationObjectExport(supabase, verificationObjectId) {
  const { data: verificationObject, error } = await supabase
    .from("verification_objects")
    .select("*, documents(id, title, user_id, workspace_id)")
    .eq("id", normalizeId(verificationObjectId))
    .single();

  if (error || !verificationObject) {
    throw new Error("Verification object not found");
  }

  let snapshot = null;
  let versionNumber = 0;
  if (verificationObject.current_version_id) {
    const { data: version } = await supabase
      .from("verification_object_versions")
      .select("*")
      .eq("id", normalizeId(verificationObject.current_version_id))
      .maybeSingle();
    if (version) {
      snapshot = version.snapshot_json || null;
      versionNumber = Number(version.version_number || 0);
    }
  }

  return {
    snapshot,
    state: String(verificationObject.state || "unknown"),
    versionNumber,
    finalizedAt: verificationObject.finalized_at || null,
    reviewerName: await fetchReviewerName(supabase, verificationObject.finalized_by),
    documentTitle: verificationObject.documents?.title || "Contract",
    documentId: verificationObject.documents?.id
      ? normalizeId(verificationObject.documents.id)
      : null,
    workspaceId: verificationObject.documents?.workspace_id
      ? normalizeId(verificationObject.documents.workspace_id)
      : null,
  };
}

async function buildLegacySnapshotFromContract(supabase, contract) {
  const contractId = normalizeId(contract?.id);
  if (!contractId) return null;

  const [
    clausesResult,
    obligationsResult,
    risksResult,
  ] = await Promise.all([
    supabase.from("legal_clauses").select("*").eq("contract_id", contractId),
    supabase.from("legal_obligations").select("*").eq("contract_id", contractId),
    supabase.from("legal_risk_flags").select("*").eq("contract_id", contractId),
  ]);

  return {
    contract_type: contract.contract_type,
    effective_date: contract.effective_date,
    end_date: contract.end_date,
    term_length_months: contract.term_length_months,
    notice_period_days: contract.notice_period_days,
    auto_renewal: contract.auto_renewal,
    termination_for_convenience: contract.termination_for_convenience,
    governing_law: contract.governing_law,
    counterparty_name: contract.counterparty_name,
    clauses: clausesResult.data || [],
    obligations: obligationsResult.data || [],
    risks: risksResult.data || [],
  };
}

async function loadDocumentExport(supabase, documentId) {
  const { data: contract, error } = await supabase
    .from("legal_contracts")
    .select("*, documents(id, title, user_id, workspace_id), verification_objects(*)")
    .eq("document_id", normalizeId(documentId))
    .single();

  if (error || !contract) {
    throw new Error("Contract analysis not found");
  }

  let snapshot = null;
  let state = "unknown";
  let versionNumber = 0;
  let finalizedAt = null;
  let reviewerName = null;

  if (contract.verification_object_id && contract.version_id) {
    const { data: version } = await supabase
      .from("verification_object_versions")
      .select("*")
      .eq("id", normalizeId(contract.version_id))
      .maybeSingle();
    if (version) {
      snapshot = version.snapshot_json || null;
      versionNumber = Number(version.version_number || 0);
      state = String(version.state || state);
      finalizedAt = version.reviewed_at || finalizedAt;
    }
    if (contract.verification_objects) {
      state = String(contract.verification_objects.state || state);
      finalizedAt = contract.verification_objects.finalized_at || finalizedAt;
      reviewerName = await fetchReviewerName(
        supabase,
        contract.verification_objects.finalized_by,
      );
    }
  }

  if (!snapshot) {
    snapshot = await buildLegacySnapshotFromContract(supabase, contract);
    state = "legacy";
  }

  return {
    snapshot,
    state,
    versionNumber,
    finalizedAt,
    reviewerName,
    documentTitle: contract.documents?.title || "Contract",
    documentId: contract.documents?.id ? normalizeId(contract.documents.id) : normalizeId(documentId),
    workspaceId: contract.documents?.workspace_id
      ? normalizeId(contract.documents.workspace_id)
      : null,
  };
}

async function loadExportModel(supabase, body) {
  if (body.version_id) {
    return await loadVersionExport(supabase, body.version_id);
  }
  if (body.verification_object_id) {
    return await loadVerificationObjectExport(supabase, body.verification_object_id);
  }
  return await loadDocumentExport(supabase, body.document_id);
}

function buildReportSettings(body) {
  const language = String(body?.language || "en").toLowerCase() === "ar"
    ? "ar"
    : "en";
  return {
    customTitle: body?.title ? String(body.title) : "",
    customSubtitle: body?.subtitle ? String(body.subtitle) : "",
    primaryColor: body?.primary_color ? String(body.primary_color) : "#0d9488",
    template: body?.template ? String(body.template) : "decision_pack",
    language,
  };
}

async function mirrorExportArtifact({
  supabase,
  workspaceId,
  documentId,
  versionNumber,
  format,
  payload,
}) {
  if (!workspaceId) return null;

  const plane = await resolveDataPlane({ workspaceId, supabase });
  const exportsBucket = plane.mode === "enterprise_firebase"
    ? (plane.enterprise?.exports?.bucket || plane.enterprise?.documents?.bucket || null)
    : null;
  const exportsPrefix = plane.mode === "enterprise_firebase"
    ? (plane.enterprise?.exports?.prefix || null)
    : null;

  if (plane.mode !== "enterprise_firebase" || !exportsBucket) return null;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const extension = format === "json" ? "json" : "html.json";
  const storagePath = `exports/${workspaceId}/contract-report/${
    documentId || "unknown"
  }/v${versionNumber || 0}_${timestamp}.${extension}`;
  const uploadUrl = generateSignedUploadUrl(storagePath, {
    contentType: "application/json",
    expiresInSeconds: 15 * 60,
    bucketNameOverride: exportsBucket,
    ...(exportsPrefix ? { pathPrefix: exportsPrefix } : {}),
  }).url;

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`export_artifact_upload_failed: ${response.status}`);
  }

  return {
    storage_path: joinObjectPath(exportsPrefix, storagePath),
    data_plane: {
      mode: plane.mode,
      region: plane.enterprise?.region || null,
      tenant_id: plane.enterprise?.tenant_id || null,
    },
  };
}

export function buildExportSuccessEnvelope(requestId, payload) {
  const data = {
    ...(payload && typeof payload === "object" ? payload : {}),
    execution_plane: "gcp",
  };
  return {
    ok: true,
    data,
    request_id: requestId,
    ...data,
    execution_plane: "gcp",
  };
}

export async function buildContractExportPayload({
  supabase,
  requestId,
  body,
  log,
}) {
  if (!body?.document_id && !body?.verification_object_id && !body?.version_id) {
    const error = new Error(
      "Missing required parameter: document_id, verification_object_id, or version_id",
    );
    error.statusCode = 400;
    throw error;
  }

  const format = String(body?.format || "html").toLowerCase() === "json"
    ? "json"
    : "html";
  const model = await loadExportModel(supabase, body);
  const settings = buildReportSettings(body);

  const payload = format === "json"
    ? {
        document_title: model.documentTitle,
        state: model.state,
        version_number: model.versionNumber,
        finalized_at: model.finalizedAt,
        reviewed_by: model.reviewerName,
        snapshot: model.snapshot,
      }
    : {
        html: renderContractExportHtml({
          snapshot: model.snapshot,
          documentTitle: model.documentTitle,
          state: model.state,
          versionNumber: model.versionNumber,
          finalizedAt: model.finalizedAt,
          reviewerName: model.reviewerName,
          settings,
        }),
      };

  try {
    const exportArtifact = await mirrorExportArtifact({
      supabase,
      workspaceId: model.workspaceId,
      documentId: model.documentId,
      versionNumber: model.versionNumber,
      format,
      payload,
    });
    if (exportArtifact) {
      payload.export_artifact = exportArtifact;
    }
  } catch (error) {
    log?.warn?.("Contract export artifact mirroring failed", {
      error: error instanceof Error ? error.message : String(error),
      workspace_id: model.workspaceId,
      document_id: model.documentId,
    });
  }

  return buildExportSuccessEnvelope(requestId, payload);
}
