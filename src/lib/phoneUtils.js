/**
 * Central phone formatting for dialers (tel:), WhatsApp and display.
 * Mirrors backend/src/utils/phone.js.
 *
 * Indian numbers resolve to the LAST 10 DIGITS once the input is known to be Indian:
 *   9876543210 / 919876543210 / +919876543210 / 91919876543210 / +91919876543210
 *   → "9876543210"
 * A number is Indian when (after removing spaces, brackets, hyphens, …) it is exactly
 * 10 digits, or longer and prefixed with 91 (even repeated) / 0 / 0091.
 * Other "+CC" international numbers (+1, +44, +65, …) are left unchanged — the CRM
 * supports several countries. The stored lead value is never modified by these helpers.
 */

function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/** @returns {string|null} 10-digit Indian mobile, or null if not an Indian number. */
export function toIndianMobile10(phone) {
  if (phone == null) return null;
  const text = String(phone).trim();
  if (!text) return null;
  let digits = digitsOnly(text);
  if (!digits) return null;

  if (/^(\+|00)/.test(text)) {
    if (text.startsWith("00")) digits = digits.replace(/^00/, "");
    return digits.startsWith("91") && digits.length >= 12 ? digits.slice(-10) : null;
  }
  if (digits.length === 10) return digits;
  if (digits.length > 10 && (digits.startsWith("91") || digits.startsWith("0"))) {
    return digits.slice(-10);
  }
  return null;
}

/**
 * Number for phone dialers (tel: links): Indian → clean 10 digits (never 91 before 91);
 * other international numbers → "+<digits>"; anything else → its digits.
 */
export function formatDialerPhone(phone) {
  if (!phone) return "";
  const indian = toIndianMobile10(phone);
  if (indian) return indian;
  const text = String(phone).trim();
  const digits = digitsOnly(text);
  if (!digits) return "";
  return /^(\+|00)/.test(text) ? `+${digits.replace(/^00/, "")}` : digits;
}

/** Returns a tel: URL formatted with the clean real number for phone dialers. */
export function formatTelUrl(phone) {
  const formatted = formatDialerPhone(phone);
  return formatted ? `tel:${formatted}` : "";
}

/**
 * wa.me / api.whatsapp.com "phone" param: full international digits WITHOUT "+".
 * Indian → "91" + 10 digits (exactly one 91). Other countries → their digits.
 */
export function formatWhatsAppPhone(phone) {
  if (!phone) return "";
  const indian = toIndianMobile10(phone);
  if (indian) return `91${indian}`;
  return digitsOnly(phone).replace(/^00/, "");
}

/** Full international format: Indian → "+91XXXXXXXXXX". */
export function formatE164Phone(phone) {
  const indian = toIndianMobile10(phone);
  if (indian) return `+91${indian}`;
  const digits = digitsOnly(phone).replace(/^00/, "");
  return digits ? `+${digits}` : "";
}
