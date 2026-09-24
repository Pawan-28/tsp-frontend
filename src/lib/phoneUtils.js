/**
 * Shared utility functions for formatting phone numbers for dialers (tel: links)
 */

/**
 * Formats a phone number for dialing (e.g. for tel: links).
 * Strips redundant country code prefixes (+91, 91, leading 0) so the dialer receives
 * only the clean, real 10-digit phone number. Never adds extra 91 before 91.
 *
 * Examples:
 * - "8208813895" -> "8208813895"
 * - "918208813895" -> "8208813895"
 * - "+918208813895" -> "8208813895"
 * - "+91918208813895" -> "8208813895"
 * - "08208813895" -> "8208813895"
 */
export function formatDialerPhone(phone) {
  if (!phone) return "";
  const raw = String(phone).trim();
  if (!raw) return "";

  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  // Strip repeated leading 91 or 0 prefixes down to genuine 10 digits
  while (digits.length > 10 && (digits.startsWith("91") || digits.startsWith("0"))) {
    if (digits.startsWith("91") && digits.length >= 12) {
      digits = digits.slice(2);
    } else if (digits.startsWith("0")) {
      digits = digits.slice(1);
    } else {
      break;
    }
  }

  // If standard 10-digit number, return clean 10 digits directly
  if (digits.length === 10) {
    return digits;
  }

  // If 11 or 12 digits remaining, check if starting with 91 or 0
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }

  // Fallback: return clean digits directly without prepending 91
  return digits;
}

/**
 * Returns a tel: URL formatted with clean real number for phone dialers.
 */
export function formatTelUrl(phone) {
  const formatted = formatDialerPhone(phone);
  return formatted ? `tel:${formatted}` : "";
}

