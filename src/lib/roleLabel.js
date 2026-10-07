/**
 * One display format for employee roles across the app ("sales manager",
 * "Sales Manager ", "SALES_MANAGER" -> "Sales Manager").
 * Short all-caps tokens (SDR, CMO, HR) are kept as acronyms.
 */
export function roleLabel(role, fallback = "") {
  const text = String(role ?? "").replace(/[_\s]+/g, " ").trim();
  if (!text) return fallback;
  return text
    .split(" ")
    .map((word) => {
      if (word.length <= 4 && word === word.toUpperCase() && /[A-Z]{2,}/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export default roleLabel;
