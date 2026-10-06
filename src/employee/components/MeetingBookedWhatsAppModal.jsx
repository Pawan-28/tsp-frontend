import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CalendarCheck, MessageCircle } from "lucide-react";
import { EmpModal, BtnPrimary, BtnSecondary, FormLabel, FormInput } from "./EmpUI.jsx";
import { buildMeetingConfirmationMessage, openWhatsAppChat } from "../../lib/whatsappScripts.js";
import { formatIndianPhone } from "../../lib/indianFormat.js";

/**
 * Shown right after an employee books a meeting: one tap opens WhatsApp to the customer's number with
 * the meeting details (title, date, time, Meet link) pre-filled. Phone and message stay editable.
 * `meeting` is the saved meeting returned by EmployeeContext.createMeeting.
 */
export default function MeetingBookedWhatsAppModal({ open, meeting, lead, employee, onClose }) {
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setPhone(lead?.phone || meeting?.leadPhone || "");
    setMessage(buildMeetingConfirmationMessage({
      leadName: lead?.name || meeting?.lead,
      meeting,
      employeeName: employee?.name,
    }));
  }, [open, meeting?.id, lead?.id]);

  if (!open || !meeting) return null;

  const handleSend = () => {
    if (!phone) {
      toast.error("Add the customer's phone number");
      return;
    }
    if (!openWhatsAppChat(phone, message)) {
      toast.error("Invalid phone number");
      return;
    }
    toast.success("Opening WhatsApp…");
    onClose?.();
  };

  return (
    <EmpModal
      open={open}
      onClose={onClose}
      title="Meeting booked"
      subtitle="Send the customer a WhatsApp confirmation with the meeting details."
      footer={(
        <>
          <BtnSecondary onClick={onClose}>Skip</BtnSecondary>
          <BtnPrimary onClick={handleSend} className="!bg-emerald-600 hover:!bg-emerald-700">
            <MessageCircle className="w-4 h-4" /> Send on WhatsApp
          </BtnPrimary>
        </>
      )}
    >
      <div className="flex items-start gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 mb-3">
        <CalendarCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
        <div className="min-w-0 text-xs">
          <p className="font-bold text-slate-900 truncate">{meeting.title}</p>
          <p className="text-slate-500 mt-0.5">{meeting.time}</p>
        </div>
      </div>

      <div className="mb-3">
        <FormLabel>WhatsApp number</FormLabel>
        <FormInput
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="e.g. 98765 43210"
        />
        {phone ? <p className="text-[10px] text-slate-400 mt-1">{formatIndianPhone(phone)}</p> : null}
      </div>

      <div>
        <FormLabel>Message</FormLabel>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={8}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700 leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-200"
        />
      </div>
    </EmpModal>
  );
}
