export function isValidServiceName(name) {
  if (!name || typeof name !== "string") return false;
  const str = name.trim();
  if (!str || str === "—" || str === "undefined" || str === "null") return false;
  if (str.length > 45) return false;

  const lower = str.toLowerCase();
  const sentenceJunk = [
    "karwaega", "karwaege", "agar", "he it self", "itself", "has ", "have ",
    "will ", "want ", "because ", "asking ", "called ", "said ", "told ",
    "thinks ", "wants ", "looking for ", "need ", "needed ", "book publishing karwaega"
  ];
  if (sentenceJunk.some((word) => lower.includes(word))) return false;

  const words = str.split(/\s+/);
  if (words.length > 6) return false;

  return true;
}

export function cleanServiceName(raw) {
  if (!raw || typeof raw !== "string") return "";
  let str = raw.trim();
  if (!str || str === "—" || str === "undefined" || str === "null") return "";

  // 1) Match [Service: X]
  const matchBracket = str.match(/\[Service:\s*([^\]]+)\]/i);
  if (matchBracket && matchBracket[1]) {
    const candidate = matchBracket[1].trim();
    if (isValidServiceName(candidate)) return candidate;
  }

  // 2) Match Service: X
  const matchColon = str.match(/^Service:\s*([^\n\r\]]+)/i);
  if (matchColon && matchColon[1]) {
    const candidate = matchColon[1].trim();
    if (isValidServiceName(candidate)) return candidate;
  }

  // 3) Match inline Service: X
  const matchInline = str.match(/Service:\s*([^\n\r\]]+)/i);
  if (matchInline && matchInline[1]) {
    const candidate = matchInline[1].trim();
    if (isValidServiceName(candidate)) return candidate;
  }

  // 4) If raw string itself is a clean valid service title
  if (isValidServiceName(str)) {
    return str;
  }

  return "";
}

export function extractLeadService(lead) {
  if (!lead) return "";

  // Check direct fields
  const direct = lead.service || lead.service_name || lead.serviceName;
  if (direct) {
    const cleanedDirect = cleanServiceName(direct);
    if (cleanedDirect) return cleanedDirect;
  }

  // Check requirements field
  if (lead.requirements) {
    const cleanedReq = cleanServiceName(lead.requirements);
    if (cleanedReq) return cleanedReq;
  }

  // Check insights field
  if (lead.insights) {
    const cleanedIns = cleanServiceName(lead.insights);
    if (cleanedIns) return cleanedIns;
  }

  // Check sourceMeta / source_meta
  const meta = lead.sourceMeta || lead.source_meta;
  if (meta && typeof meta === "object") {
    if (meta.service) {
      const cleanedMeta = cleanServiceName(meta.service);
      if (cleanedMeta) return cleanedMeta;
    }
    if (meta.services) {
      const cleanedMetaSvc = cleanServiceName(
        Array.isArray(meta.services) ? meta.services.join(", ") : meta.services
      );
      if (cleanedMetaSvc) return cleanedMetaSvc;
    }
  }

  return "";
}

export const CANONICAL_SERVICES = [
  "All Services",
  "AI Automation Suite",
  "CRM Setup & Onboarding",
  "Lead Gen Engine",
  "Custom Software Dev",
  "Strategic Consulting",
];

export function getDynamicServicesList(catalogServices = [], leads = []) {
  const set = new Set();
  set.add("All Services");

  if (Array.isArray(catalogServices) && catalogServices.length > 0) {
    catalogServices.forEach((s) => {
      const name = typeof s === "string" ? s : s?.name;
      const cleaned = cleanServiceName(name);
      if (cleaned && cleaned !== "All Services" && isValidServiceName(cleaned)) {
        set.add(cleaned);
      }
    });
  } else {
    CANONICAL_SERVICES.forEach((s) => {
      if (s !== "All Services") set.add(s);
    });
  }

  return Array.from(set);
}

export function leadBelongsToService(lead, serviceName) {
  if (!serviceName || serviceName === "All Services") return true;
  const leadSvc = extractLeadService(lead);
  if (!leadSvc) return false;
  return leadSvc.toLowerCase() === serviceName.toLowerCase() ||
    String(lead.requirements || "").toLowerCase().includes(serviceName.toLowerCase()) ||
    String(lead.service || "").toLowerCase().includes(serviceName.toLowerCase());
}
