/**
 * Automatic CRM meeting title: "{{Customer Name}} {{Service Name}} - Clarity Call".
 * Mirrors backend/src/utils/meetingTitle.js (the backend regenerates the same title
 * when saving, and that saved title is what Google Calendar / Meet and n8n receive).
 *
 *   ("Raakesh Kumavat", "Podcast Interview On News Channel")
 *     → "Raakesh Kumavat Podcast Interview On News Channel - Clarity Call"
 *   ("Raakesh Kumavat", "—") → "Raakesh Kumavat - Clarity Call"
 */

const EMPTY_SERVICE_VALUES = new Set(["", "—", "-", "–", "n/a", "na", "none", "null", "undefined", "all services"]);

export function cleanServiceName(value) {
  let text = String(value ?? "").trim();
  const bracketed = text.match(/^\[Service:\s*([^\]]+)\]/i);
  if (bracketed) text = bracketed[1].trim();
  else {
    // Stop at " | " so "Service: X | SOP: Y" yields just "X".
    const prefixed = text.match(/^Service:\s*([^|\r\n]+)/im);
    if (prefixed) text = prefixed[1].trim();
  }
  return EMPTY_SERVICE_VALUES.has(text.toLowerCase()) ? "" : text;
}

/**
 * Match whatever the webhook/lead stored (raw requirements, "[Service: X] …", a service code like
 * SRV-010, or a name in a different case) to a service in the catalog.
 * `catalog` = [{ name, serviceId }]. Returns the catalog entry, or null.
 */
export function matchCatalogService(candidates, catalog) {
  const list = Array.isArray(catalog) ? catalog.filter((s) => s?.name) : [];
  if (!list.length) return null;
  const values = (Array.isArray(candidates) ? candidates : [candidates])
    .map((c) => String(c ?? "").trim())
    .filter(Boolean);

  // 1) exact NAME first. The name is what the customer actually chose (the form / ad they filled); a service CODE sent next to it can
  //    be wrong (n8n sent serviceId SRV-010 = "Book Launch With Chetan Bhagat" with the name "Podcast Interview On News Channel"),
  //    and the catalog even has duplicate codes - so a code must never beat a name that is in the catalog.
  for (const raw of values) {
    if (/^SRV-\d+$/i.test(raw)) continue; // a bare code is an id, not a name (the catalog even holds a junk service NAMED "SRV-001")
    const cleaned = cleanServiceName(raw).toLowerCase();
    if (cleaned) {
      const byName = list.find((s) => s.name.toLowerCase() === cleaned);
      if (byName) return byName;
    }
  }
  // 2) service code / id (SRV-010) - when no name resolves
  for (const raw of values) {
    const lower = raw.toLowerCase();
    const byId = list.find((s) => s.serviceId && String(s.serviceId).toLowerCase() === lower);
    if (byId) return byId;
  }
  // 3) catalog name appears inside the raw text (longest name first so
  //    "Book Launch With Celebrities" wins over "Book Launch")
  const byLength = [...list].sort((a, b) => b.name.length - a.name.length);
  for (const raw of values) {
    const lower = raw.toLowerCase();
    const hit = byLength.find((s) => lower.includes(s.name.toLowerCase()));
    if (hit) return hit;
  }
  return null;
}

/** Service for an employee-panel lead object (same field order the UI already uses). */
export function resolveLeadServiceName(lead) {
  if (!lead) return "";
  const candidates = [lead.service, lead.requirements, lead.serviceName, lead.service_name];
  for (const c of candidates) {
    const cleaned = cleanServiceName(c);
    // A bare service code (e.g. "SRV-001") is an id, not a name — never show it as the service.
    if (cleaned && !/^SRV-\d+$/i.test(cleaned)) return cleaned;
  }
  return "";
}

/** Customer name for the title — falls back to the phone when the lead is unnamed. */
export function resolveCustomerName(lead) {
  const raw = String(lead?.name ?? lead?.leadName ?? lead?.lead_name ?? "").trim();
  if (raw && !/^unknown( lead)?$/i.test(raw) && raw !== "Lead") return raw;
  const digits = String(lead?.phone ?? "").replace(/\D/g, "");
  return digits ? digits.slice(-10) : (raw || "Lead");
}

export function buildClarityCallTitle(customerName, serviceName) {
  const name = String(customerName ?? "").trim() || "Lead";
  const service = cleanServiceName(serviceName);
  return service ? `${name} ${service} - Clarity Call` : `${name} - Clarity Call`;
}
