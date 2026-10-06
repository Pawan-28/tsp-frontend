import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Video } from "lucide-react";
import { EmpModal, BtnPrimary, BtnSecondary, FormGroup, FormLabel, FormInput } from "./EmpUI.jsx";
import { TimeOfDaySelects } from "./TimeOfDaySelects.jsx";
import { getEmpAppToday } from "../../data/employeeMock.js";
import { buildClarityCallTitle, resolveCustomerName, resolveLeadServiceName } from "../../lib/meetingTitle.js";
import { formatIndianPhone } from "../../lib/indianFormat.js";
import MeetingBookedWhatsAppModal from "./MeetingBookedWhatsAppModal.jsx";

const READONLY_FIELD =
  "min-h-10 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 font-semibold flex items-center";

/**
 * Lead Details → Book Meeting. The employee only picks Date + Time; lead, customer
 * name, phone, service and employee come from the open lead. Reuses the existing
 * EmployeeContext.createMeeting → POST /api/v1/employee/meetings flow (Google
 * Calendar/Meet link generated server-side, lead moved to Meeting Booked, n8n
 * "Booked" webhook fired after a successful save).
 */
export default function LeadBookMeetingModal({ open, lead, serviceName, employee, createMeeting, onBooked, onClose }) {
  const [date, setDate] = useState(getEmpAppToday());
  const [time, setTime] = useState("14:00");
  const [submitting, setSubmitting] = useState(false);
  // Saved meeting → after booking, offer to send the customer a WhatsApp confirmation.
  const [booked, setBooked] = useState(null);

  useEffect(() => {
    if (open) {
      setDate(getEmpAppToday());
      setTime("14:00");
      setBooked(null);
    }
  }, [open, lead?.id]);

  if (!lead) return null;

  if (booked) {
    return (
      <MeetingBookedWhatsAppModal
        open={open}
        meeting={booked}
        lead={lead}
        employee={employee}
        onClose={() => { setBooked(null); onClose?.(); }}
      />
    );
  }

  const service = serviceName || resolveLeadServiceName(lead);
  const customerName = resolveCustomerName(lead);
  const title = buildClarityCallTitle(customerName, service);

  const handleConfirm = async () => {
    if (submitting) return;
    if (!date || !time) {
      toast.error("Pick a date and time");
      return;
    }
    if (typeof createMeeting !== "function") {
      toast.error("Meeting booking is not available here");
      return;
    }
    setSubmitting(true);
    try {
      const saved = await createMeeting({
        title,
        date,
        time,
        leadId: String(lead._dbId ?? lead.id),
        platform: "google_meet",
        meetLink: "",
        service,
        agenda: service ? `Service: ${service}` : "",
      });
      // createMeeting already shows the error toast (e.g. Google not connected) and
      // returns null — keep the modal open so the employee can retry.
      if (!saved) return;
      toast.success(`Meeting booked — ${saved.title || title}`);
      await onBooked?.(saved);
      setBooked(saved);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <EmpModal
      open={open}
      onClose={() => { if (!submitting) onClose?.(); }}
      title="Book Meeting"
      subtitle="Pick a date and time — everything else is taken from this lead."
      footer={(
        <>
          <BtnSecondary onClick={onClose} disabled={submitting}>Cancel</BtnSecondary>
          <BtnPrimary onClick={handleConfirm} disabled={submitting}>
            <Video className="w-4 h-4" /> {submitting ? "Booking…" : "Confirm"}
          </BtnPrimary>
        </>
      )}
    >
      <div className="grid grid-cols-2 gap-3 mb-3 sm:mb-4">
        <div>
          <FormLabel>Date</FormLabel>
          <FormInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <FormLabel>Time</FormLabel>
          <TimeOfDaySelects value={time} onChange={setTime} />
        </div>
      </div>

      <FormGroup>
        <FormLabel>Meeting Title (automatic)</FormLabel>
        <div className={READONLY_FIELD}><span className="truncate">{title}</span></div>
      </FormGroup>

      <div className="grid grid-cols-2 gap-3 text-[11px] text-slate-600">
        <div><span className="font-bold text-slate-400 uppercase text-[9px] block">Customer</span>{customerName}</div>
        <div><span className="font-bold text-slate-400 uppercase text-[9px] block">Phone</span>{formatIndianPhone(lead.phone)}</div>
        <div><span className="font-bold text-slate-400 uppercase text-[9px] block">Service</span>{service || "—"}</div>
        <div><span className="font-bold text-slate-400 uppercase text-[9px] block">Employee</span>{employee?.name || "You"}</div>
      </div>

      <p className="text-[10px] text-slate-400 mt-3">
        A Google Meet link is created automatically on Confirm (connect Google in Profile → Preferences if you haven&apos;t).
      </p>
    </EmpModal>
  );
}
