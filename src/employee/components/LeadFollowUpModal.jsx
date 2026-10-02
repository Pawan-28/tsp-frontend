import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CalendarClock } from "lucide-react";
import { EmpModal, BtnPrimary, BtnSecondary, FormGroup, FormLabel, FormInput, FormSelect } from "./EmpUI.jsx";
import { TimeOfDaySelects } from "./TimeOfDaySelects.jsx";
import { getEmpAppToday } from "../../data/employeeMock.js";

/**
 * Lead Details → "Follow-up". Saves through the existing EmployeeContext.scheduleFollowUp
 * flow (POST /api/v1/employee/followups), so it shows in Follow-ups and My Tasks.
 */
export default function LeadFollowUpModal({ open, lead, scheduleFollowUp, onClose }) {
  const [form, setForm] = useState({ date: getEmpAppToday(), time: "11:00", type: "Call", note: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm({ date: getEmpAppToday(), time: "11:00", type: "Call", note: "" });
  }, [open, lead?.id]);

  if (!lead) return null;

  const handleSubmit = async () => {
    if (saving) return;
    if (!form.date || !form.time) {
      toast.error("Pick date and time");
      return;
    }
    if (typeof scheduleFollowUp !== "function") {
      toast.error("Follow-up scheduling is not available here");
      return;
    }
    setSaving(true);
    try {
      const saved = await scheduleFollowUp({
        leadName: lead.name,
        company: lead.company,
        type: form.type,
        date: form.date,
        time: form.time,
        note: form.note,
        leadId: lead._dbId ?? lead.id,
        phone: lead.phone,
      });
      if (saved === null) return; // scheduleFollowUp already showed the error
      toast.success("Follow-up scheduled — added to My Tasks");
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <EmpModal
      open={open}
      onClose={() => { if (!saving) onClose?.(); }}
      title="Schedule Follow-up"
      subtitle={`${lead.name || "Lead"}${lead.phone ? ` · ${lead.phone}` : ""}`}
      footer={(
        <>
          <BtnSecondary onClick={onClose} disabled={saving}>Cancel</BtnSecondary>
          <BtnPrimary onClick={handleSubmit} disabled={saving}>
            <CalendarClock className="w-4 h-4" /> {saving ? "Saving…" : "Schedule"}
          </BtnPrimary>
        </>
      )}
    >
      <div className="grid grid-cols-2 gap-3 mb-3 sm:mb-4">
        <div>
          <FormLabel>Date</FormLabel>
          <FormInput type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
        </div>
        <div>
          <FormLabel>Time</FormLabel>
          <TimeOfDaySelects value={form.time} onChange={(time) => setForm((f) => ({ ...f, time }))} />
        </div>
      </div>
      <FormGroup>
        <FormLabel>Type</FormLabel>
        <FormSelect value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
          <option>Call</option>
          <option>WhatsApp</option>
          <option>Email</option>
        </FormSelect>
      </FormGroup>
      <FormGroup>
        <FormLabel>Note</FormLabel>
        <FormInput
          value={form.note}
          placeholder="What to discuss…"
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
        />
      </FormGroup>
    </EmpModal>
  );
}
