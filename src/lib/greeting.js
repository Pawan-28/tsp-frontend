/**
 * Returns a time-appropriate greeting for the user's local clock.
 * @param {Date} [date=new Date()]
 * @returns {"Good morning"|"Good afternoon"|"Good evening"|"Good night"}
 */
export function getTimeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
}

/**
 * @param {string} name — full or first name
 * @param {Date} [date]
 */
export function formatGreeting(name, date = new Date()) {
  const first = String(name || "").trim().split(/\s+/)[0] || "there";
  return `${getTimeGreeting(date)}, ${first}`;
}
