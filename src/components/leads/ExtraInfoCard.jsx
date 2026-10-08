import {
  Sparkles, Briefcase, Heart, Target, TrendingUp, Wallet, Tag, AlertCircle, CalendarClock, Users, ShieldAlert,
  ArrowRightCircle, BellRing, Video, BadgeCheck,
} from "lucide-react";

const FIELD_ICON = {
  business: Briefcase,
  interests: Heart,
  requirement: Target,
  intent: TrendingUp,
  budget: Wallet,
  offerQuoted: Tag,
  mainConcern: AlertCircle,
  purchaseTimeline: CalendarClock,
  decisionMaker: Users,
  objection: ShieldAlert,
  nextAction: ArrowRightCircle,
  followUp: BellRing,
  meeting: Video,
  conversion: BadgeCheck,
};

const TEMPERATURE_CHIP = {
  Hot: "bg-rose-100 border-rose-300 text-rose-800",
  Warm: "bg-amber-100 border-amber-300 text-amber-800",
  Cold: "bg-sky-100 border-sky-300 text-sky-800",
};

// a row is real information only when it came from a call / verified CRM data (r.known); defaults are never shown as a fact
const isEmptyRow = (r) => !r.known;

/**
 * EXTRA INFO - a SMALL customer profile box, directly below the lead header card. It shows only what the customer's connected calls
 * (and verified CRM data) actually told us - business / job, interests / hobbies, requirement, budget ... Anything that was not
 * discussed is not given a tile; it is listed in one muted line at the bottom so nothing is hidden or invented.
 */
export default function ExtraInfoCard({ rows = [], hasAnalysedCall = false }) {
  const temperature = rows.find((r) => r.key === "temperature");
  const tiles = rows.filter((r) => r.key !== "temperature" && !isEmptyRow(r));
  const missing = rows.filter((r) => r.key !== "temperature" && isEmptyRow(r));
  const showTemp = temperature && TEMPERATURE_CHIP[temperature.value];

  return (
    <section
      className="rounded-xl border border-rose-200/70 bg-gradient-to-br from-rose-50/80 via-white to-amber-50/40 p-2.5 shadow-sm"
      aria-label="Extra info"
      data-testid="extra-info-card"
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-rose-800">
          <span className="grid h-5 w-5 place-items-center rounded-md bg-rose-600 text-white shadow-sm">
            <Sparkles className="h-3 w-3" />
          </span>
          Extra Info
          <span className="hidden sm:inline font-semibold normal-case tracking-normal text-slate-400">· from connected calls</span>
        </h4>
        {showTemp && (
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide ${TEMPERATURE_CHIP[temperature.value]}`}
            data-extra-key="temperature"
            title="Lead temperature"
          >
            {temperature.value}
          </span>
        )}
      </div>

      {tiles.length > 0 ? (
        <dl className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {tiles.map((r) => {
            const Icon = FIELD_ICON[r.key] || Sparkles;
            return (
              <div
                key={r.key}
                data-extra-key={r.key}
                title={`${r.label}: ${r.value}`}
                className="min-w-0 rounded-lg border border-rose-100/80 bg-white/85 px-2 py-1.5"
              >
                <dt className="flex items-center gap-1 text-[8.5px] font-extrabold uppercase tracking-wider text-slate-400">
                  <Icon className="h-2.5 w-2.5 shrink-0 text-rose-400" />
                  <span className="truncate">{r.label}</span>
                </dt>
                <dd className="mt-0.5 break-words text-[11px] font-bold leading-snug text-slate-800">{r.value}</dd>
              </div>
            );
          })}
        </dl>
      ) : (
        <p className="mt-2 text-[10.5px] italic text-slate-400">
          {hasAnalysedCall ? "Nothing about this customer was discussed yet." : "No details yet - they fill in after a connected call is analysed by AI."}
        </p>
      )}

      {missing.length > 0 && tiles.length > 0 && (
        <p className="mt-1.5 text-[9.5px] leading-snug text-slate-400">
          <span className="font-bold text-slate-500">Not discussed:</span> {missing.map((r) => r.label).join(" · ")}
        </p>
      )}
    </section>
  );
}
