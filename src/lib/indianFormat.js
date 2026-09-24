/** Indian currency and number formatting helpers. */

export function formatINR(amount) {
  const n = Number(amount) || 0;
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function formatIndianNumber(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return String(value ?? "—");
  return n.toLocaleString("en-IN");
}

/** Monthly / one-time service price labels (handles legacy $ strings and bare numbers). */
export function formatServicePriceLabel(price, priceNum) {
  if (price && typeof price === "string") {
    const trimmed = price.trim();
    if (!trimmed) return formatServicePriceLabel(null, priceNum);
    if (/^custom$/i.test(trimmed)) return "Custom";
    if (trimmed.startsWith("₹")) return trimmed;
    if (trimmed.includes("$")) {
      return trimmed.replace(/\$([0-9,]+(?:\.[0-9]+)?)/g, (_, num) =>
        `₹${Number(num.replace(/,/g, "")).toLocaleString("en-IN")}`,
      );
    }
    const suffix = trimmed.match(/(\/\w+)/)?.[0] || "";
    const digits = trimmed.replace(/[^0-9.]/g, "");
    if (digits) {
      const n = Number(digits);
      if (Number.isFinite(n) && n > 0) {
        return `₹${Math.round(n).toLocaleString("en-IN")}${suffix}`;
      }
    }
    return trimmed;
  }
  const n = Number(priceNum) || 0;
  if (!n) return "Custom";
  return `₹${Math.round(n).toLocaleString("en-IN")}/mo`;
}

export function formatIndianPhone(phone) {
  if (!phone) return "—";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return phone;
}
