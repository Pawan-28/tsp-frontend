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
    const prefixed = text.match(/^Service:\s*(.+)$/im);
    if (prefixed) text = prefixed[1].trim();
  }
  return EMPTY_SERVICE_VALUES.has(text.toLowerCase()) ? "" : text;
}

/** Service for an employee-panel lead object (same field order the UI already uses). */
export function resolveLeadServiceName(lead) {
  if (!lead) return "";
  const candidates = [lead.service, lead.requirements, lead.serviceName, lead.service_name];
  for (const c of candidates) {
    const cleaned = cleanServiceName(c);
    if (cleaned) return cleaned;
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
