export const TIME_HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1));

export const TIME_MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

function extractTimePart(time24) {
  const raw = String(time24 || "").trim();
  if (!raw) return "14:00";
  if (raw.includes("T")) {
    const segment = raw.split("T")[1] || "";
    return segment.slice(0, 5) || "14:00";
  }
  return raw.slice(0, 5);
}

function snapMinuteToGrid(minute) {
  let m = Math.round(minute / 5) * 5;
  if (m >= 60) m = 55;
  return String(m).padStart(2, "0");
}

export function parseTime12(time24 = "14:00") {
  const [hStr, mStr] = extractTimePart(time24).split(":");
  let h = parseInt(hStr || "14", 10);
  let m = parseInt(mStr || "0", 10);
  if (Number.isNaN(h)) h = 14;
  if (Number.isNaN(m)) m = 0;

  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;

  return {
    hour: String(h),
    minute: snapMinuteToGrid(m),
    ampm,
  };
}

export function formatTime24(hour, minute, ampm) {
  let h = parseInt(hour || "12", 10);
  if (Number.isNaN(h)) h = 12;
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  const hStr = String(h).padStart(2, "0");
  const mStr = snapMinuteToGrid(parseInt(minute || "0", 10));
  return `${hStr}:${mStr}`;
}
