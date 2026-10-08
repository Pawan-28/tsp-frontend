import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, Mic } from "lucide-react";

const TONE_CHIP = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-rose-50 text-rose-700 border-rose-200",
};

function CallIcon({ item }) {
  if (item.status === "Missed") return <PhoneMissed className="h-3.5 w-3.5 text-amber-600" />;
  if (!item.connected) return <Phone className="h-3.5 w-3.5 text-slate-400" />;
  return item.direction === "Incoming"
    ? <PhoneIncoming className="h-3.5 w-3.5 text-emerald-600" />
    : <PhoneOutgoing className="h-3.5 w-3.5 text-emerald-600" />;
}

/** Call-by-call history of a lead: direction, status, time, duration, and the recording of a connected call. */
export default function CallHistoryList({ items = [], loading = false }) {
  if (loading && items.length === 0) {
    return <p className="py-1 pl-1 text-[11px] italic text-slate-400">Loading call history…</p>;
  }
  if (items.length === 0) return null;
  return (
    <div data-testid="call-history-list">
      <p className="mb-1.5 text-[9.5px] font-extrabold uppercase tracking-wider text-slate-400">Calls ({items.length})</p>
      <ul className="max-h-[360px] space-y-2 overflow-y-auto pr-1 scrollbar-thin">
        {items.map((item) => (
          <li key={item.id} data-call-id={item.id} className="rounded-xl border border-rose-100 bg-white px-3 py-2">
            <div className="flex items-center gap-2">
              <CallIcon item={item} />
              <span className="text-[11.5px] font-bold text-slate-800">{item.direction} call</span>
              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${TONE_CHIP[item.tone] || TONE_CHIP.warning}`}>
                {item.status}
              </span>
              {item.duration ? (
                <span className="ml-auto rounded-md border border-rose-100 bg-rose-50/60 px-1.5 py-0.5 text-[10.5px] font-black tabular-nums text-slate-700">{item.duration}</span>
              ) : (
                <span className="ml-auto text-[10px] font-semibold text-slate-400">{item.connected ? "" : "Not connected"}</span>
              )}
            </div>
            <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-slate-500">
              <Clock className="h-3 w-3 text-slate-400" /> {item.when}
            </p>
            {item.connected && (
              item.recordingUrl ? (
                <div className="mt-1.5">
                  <p className="mb-0.5 flex items-center gap-1 text-[9.5px] font-bold text-rose-700"><Mic className="h-3 w-3" /> Recording</p>
                  <audio controls preload="none" src={item.recordingUrl} className="h-8 w-full" />
                </div>
              ) : (
                <p className="mt-1 text-[9.5px] font-semibold text-slate-400">No recording for this call</p>
              )
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
