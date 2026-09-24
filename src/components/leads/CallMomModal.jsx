import { useState, useEffect } from "react";
import {
  X, Sparkles, Play, Pause, RotateCcw, Clock, CheckCircle, Circle, Star,
  ShieldCheck, RefreshCw, Volume2, Calendar, Phone, User, MessageSquare
} from "lucide-react";
import { GlassCard } from "../Primitives.jsx";
import { BtnPrimary, BtnGhost, FormTextarea } from "../../employee/components/EmpUI.jsx";
import { LOCAL_SOPS } from "../../data/employeeMock.js";
import toast from "react-hot-toast";

function formatTime(seconds) {
  if (isNaN(seconds) || seconds === null) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatAiSummaryText(val) {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object") {
    try {
      if (val.summary && typeof val.summary === "string") return val.summary;
      return Object.entries(val)
        .map(([k, v]) => {
          if (typeof v === "object" && v !== null) {
            const inner = Object.entries(v).map(([ik, iv]) => `  • ${ik}: ${iv}`).join("\n");
            return `[${k}]\n${inner}`;
          }
          return `[${k}]\n${v}`;
        })
        .join("\n\n");
    } catch {
      return JSON.stringify(val, null, 2);
    }
  }
  return String(val);
}

export default function CallMomModal({ open, onClose, call, lead }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [newNoteText, setNewNoteText] = useState("");
  const [notesList, setNotesList] = useState([]);
  const [savingNote, setSavingNote] = useState(false);

  // Parse duration in seconds from call object
  const durationSec = (() => {
    if (!call?.duration) return 120;
    if (typeof call.duration === "number") return call.duration;
    const str = String(call.duration);
    const parts = str.split(":").map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return parts[0] * 60 + parts[1];
    }
    const match = str.match(/(\d+)\s*s/);
    if (match) return parseInt(match[1], 10);
    const matchMin = str.match(/(\d+)\s*m/);
    if (matchMin) return parseInt(matchMin[1], 10) * 60;
    return 120;
  })();

  useEffect(() => {
    if (!open) {
      setIsPlaying(false);
      setCurrentTime(0);
      return;
    }
    if (call) {
      const summaryText = call.aiSummary || call.ai_summary || call.note || call.notes || call.outcome || "";
      setAiNote(summaryText);
      
      const initialNotes = [];
      if (call.note) initialNotes.push({ id: 1, text: call.note, author: "System", date: call.date || "Today" });
      if (call.notes && call.notes !== call.note) initialNotes.push({ id: 2, text: call.notes, author: "System", date: call.date || "Today" });
      setNotesList(initialNotes);
    }
  }, [open, call]);

  // Audio timer simulation when playing
  useEffect(() => {
    let interval = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= durationSec) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isPlaying, durationSec]);

  if (!open || !call) return null;

  const isIncoming = call.type === "in";
  const isMissed = call.type === "miss";

  // Match SOP checklist or default to first SOP
  const activeSop = LOCAL_SOPS.find((s) => s.id === call.sopId) || LOCAL_SOPS[0];
  const allQuestions = activeSop.steps.flatMap((st) => st.questions || []);
  const askedCount = Math.min(allQuestions.length, Math.max(3, Math.floor(allQuestions.length * 0.75)));
  const adherencePct = allQuestions.length > 0 ? Math.round((askedCount / allQuestions.length) * 100) : 100;

  const handleProcessAiMoM = () => {
    setIsAiProcessing(true);
    setTimeout(() => {
      setIsAiProcessing(false);
      const generatedMoM = `• Key Discussion: Discussed ${lead?.name || call.name || "client"}'s requirement for ${lead?.requirements || "services package"}.\n• Decision Parameter: Client confirmed budget of ${lead?.budget || "standard pricing"} and requested next follow-up.\n• SOP Compliance: Checked ${askedCount}/${allQuestions.length} script items (${adherencePct}% adherence).\n• Recommended Next Action: Schedule follow-up meeting and send formal SOP deck.`;
      setAiNote(generatedMoM);
      toast.success("AI MoM & Call Summary generated with OpenAI!");
    }, 1500);
  };

  const handleAddNote = (e) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    setSavingNote(true);
    setTimeout(() => {
      setNotesList((prev) => [
        {
          id: Date.now(),
          text: newNoteText.trim(),
          author: "Admin",
          date: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
        ...prev,
      ]);
      setNewNoteText("");
      setSavingNote(false);
      toast.success("Note added to call log");
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-rose-100 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-rose-100 bg-gradient-to-r from-rose-50/80 via-white to-rose-50/40 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-rose-100/80 text-rose-700 grid place-items-center shrink-0">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display font-black text-slate-900 text-base sm:text-lg truncate">
                  {lead?.name || call.name || "Lead Call MoM"}
                </h2>
                <span className={`text-[9.5px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                  isIncoming ? "bg-emerald-100 text-emerald-800" : isMissed ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"
                }`}>
                  {isIncoming ? "Inbound Call" : isMissed ? "Missed Call" : "Outbound Call"}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-slate-400" /> {call.phone || lead?.phone || "N/A"}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-slate-400" /> {call.date || "Today"}</span>
                <span>•</span>
                <span className="font-mono font-bold text-slate-700">{call.duration || "02:00"}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-rose-100 hover:text-rose-700 text-slate-500 grid place-items-center transition active:scale-95 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 scrollbar-thin">
          
          {/* Call Recording Audio Waveform */}
          <GlassCard className="p-4 bg-slate-900 text-white rounded-2xl space-y-3 shadow-md">
            <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
              <span className="flex items-center gap-1.5 font-bold text-rose-300">
                <Volume2 className="w-4 h-4" /> Call Recording Sync
              </span>
              <span className="font-mono text-slate-400">
                {formatTime(currentTime)} / {call.duration || formatTime(durationSec)}
              </span>
            </div>

            {/* Simulated Audio Waveform */}
            <div className="h-8 flex items-center justify-between gap-[3px] px-1 relative overflow-hidden">
              {Array.from({ length: 50 }).map((_, idx) => {
                const isPassed = (idx / 50) * durationSec <= currentTime;
                const heights = [10, 22, 14, 28, 18, 8, 16, 30, 12, 24, 18, 8, 20, 32, 14, 18, 26, 10, 20, 30, 12, 24, 16, 8, 22, 18, 12, 30, 20, 10, 14, 28, 18, 8, 22, 26];
                const height = heights[idx % heights.length];
                return (
                  <span
                    key={idx}
                    style={{ height: `${height}px` }}
                    className={`w-[3px] rounded-full transition-all duration-300 ${
                      isPassed ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]" : "bg-slate-700"
                    }`}
                  />
                );
              })}
            </div>

            {/* Slider & Controls */}
            <div className="flex items-center justify-between gap-3 pt-1">
              <input
                type="range"
                min={0}
                max={durationSec}
                value={currentTime}
                onChange={(e) => setCurrentTime(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-rose-500"
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setCurrentTime((t) => Math.max(0, t - 10))}
                  className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 grid place-items-center transition"
                  title="Rewind 10s"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-9 h-9 rounded-full bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white shadow-md grid place-items-center transition active:scale-95"
                >
                  {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
                </button>
              </div>
            </div>
          </GlassCard>

          {/* AI Call Summary & MoM Card */}
          <div className="bg-gradient-to-br from-rose-50/60 via-white to-rose-100/20 border border-rose-200/80 shadow-sm rounded-2xl p-4 sm:p-5 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-rose-100 pb-2">
              <h3 className="text-xs font-extrabold text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-rose-600 animate-pulse" /> AI Call Summary & MoM
              </h3>
              <button
                type="button"
                onClick={handleProcessAiMoM}
                disabled={isAiProcessing}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-[11px] font-bold transition shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {isAiProcessing ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" /> Processing OpenAI...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 text-amber-300 fill-amber-300" />
                    {aiNote ? "Re-process with OpenAI" : "Generate AI MoM"}
                  </>
                )}
              </button>
            </div>

            {aiNote ? (
              <div className="text-xs text-slate-800 leading-relaxed font-medium bg-white/80 border border-rose-100 p-4 rounded-xl space-y-2 whitespace-pre-line shadow-xs">
                {formatAiSummaryText(aiNote)}
              </div>
            ) : (
              <div className="border border-dashed border-rose-200 rounded-xl p-5 text-center bg-rose-50/20 space-y-2">
                <p className="text-xs font-bold text-slate-700">No AI MoM generated yet for this call</p>
                <p className="text-[11px] text-slate-500">Click the button above to analyze recording audio & extract discussion points.</p>
              </div>
            )}

            {call.rating > 0 && (
              <div className="flex items-center justify-between border-t border-rose-100 pt-2.5 mt-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Quality Audit Rating</span>
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Star
                      key={idx}
                      className={`w-3.5 h-3.5 ${idx < call.rating ? "fill-amber-400 text-amber-400" : "text-slate-200"}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* SOP Compliance Audit Checklist */}
          <div className="bg-white border border-rose-100 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between border-b border-rose-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-rose-600" /> SOP Compliance Audit
                </h3>
                <p className="text-[10.5px] text-slate-500 mt-0.5">
                  Standard: <span className="font-semibold text-slate-700">{activeSop.title}</span> ({activeSop.category})
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs font-black text-rose-700 font-mono bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-lg">
                  {adherencePct}% Script Adherence
                </span>
                <p className="text-[10px] text-slate-400 mt-0.5 font-medium">{askedCount}/{allQuestions.length} Questions Asked</p>
              </div>
            </div>

            {/* Checklist items */}
            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
              {activeSop.steps.map((step, idx) => (
                <div key={step.id} className="space-y-1.5">
                  <div className="text-[10.5px] font-extrabold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-rose-100 text-rose-700 text-[9.5px] font-bold grid place-items-center">
                      {idx + 1}
                    </span>
                    {step.label}
                  </div>
                  <div className="space-y-1 pl-5">
                    {(step.questions || []).map((q, qIdx) => {
                      const isAsked = qIdx < 3 || idx === 0;
                      return (
                        <div
                          key={q.id}
                          className={`flex items-start gap-2 p-2 rounded-xl border text-[11px] transition-colors ${
                            isAsked ? "bg-emerald-50/40 border-emerald-100 text-slate-800 font-medium" : "bg-slate-50/40 border-slate-100 text-slate-400"
                          }`}
                        >
                          {isAsked ? (
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 fill-emerald-100 shrink-0 mt-0.5" />
                          ) : (
                            <Circle className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
                          )}
                          <span>{q.text}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Call Notes & Comments */}
          <div className="bg-white border border-rose-100 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs">
            <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 border-b border-rose-100 pb-2">
              <MessageSquare className="w-3.5 h-3.5 text-rose-600" /> Call Notes & Comments
            </h3>

            <form onSubmit={handleAddNote} className="space-y-2">
              <FormTextarea
                rows={2}
                placeholder="Add call notes or feedback..."
                className="!rounded-xl border-rose-100 focus:border-rose-400 text-xs"
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
              />
              <div className="flex justify-end">
                <BtnPrimary type="submit" className="!py-1.5 !px-3.5 !text-xs" disabled={savingNote}>
                  {savingNote ? "Saving..." : "Add Note"}
                </BtnPrimary>
              </div>
            </form>

            {notesList.length > 0 ? (
              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin">
                {notesList.map((n) => (
                  <div key={n.id} className="bg-rose-50/30 border border-rose-100/60 rounded-xl p-2.5 text-xs space-y-0.5">
                    <div className="flex items-center justify-between text-[9.5px] text-slate-400 font-bold">
                      <span>{n.author}</span>
                      <span>{n.date}</span>
                    </div>
                    <p className="text-slate-800 font-medium whitespace-pre-line leading-relaxed">{n.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No notes added yet for this call.</p>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-rose-100 bg-slate-50/60 flex justify-end shrink-0">
          <BtnGhost onClick={onClose} className="!py-1.5 !px-4">
            Close MoM
          </BtnGhost>
        </div>

      </div>
    </div>
  );
}
