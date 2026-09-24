export const FORM_SOURCES = [
  { id: "all", label: "All Sources" },
  { id: "google_ads", label: "Google Ads" },
  { id: "instagram", label: "Instagram" },
  { id: "website", label: "Website" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "whatsapp", label: "WhatsApp" },
];

export const FORM_STATUSES = [
  { id: "all", label: "All Statuses" },
  { id: "ACTIVE", label: "Active" },
  { id: "PAUSED", label: "Paused" },
  { id: "DRAFT", label: "Draft" },
];

export const FORM_SERVICES = [
  { id: "all", label: "All Services" },
  { id: "AI Automation", label: "AI Automation" },
  { id: "CRM Setup", label: "CRM Setup" },
  { id: "Lead Gen", label: "Lead Gen" },
  { id: "Consulting", label: "Consulting" },
];

export const DEFAULT_FORM_FIELDS = [
  { id: "f1", label: "Full Name", type: "INPUT", required: true },
  { id: "f2", label: "Email Address", type: "EMAIL", required: true },
  { id: "f3", label: "Interested Service", type: "DROPDOWN", required: true, options: ["AI Automation", "CRM Setup", "Lead Gen", "Consulting"] },
  { id: "f4", label: "Phone Number", type: "PHONE", required: false },
  { id: "f5", label: "Message / Notes", type: "TEXTAREA", required: false },
];

export function formatFormRevenue(val) {
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(1)}K`;
  return `₹${val}`;
}

export function getFormsSummary(forms = []) {
  const active = forms.filter((f) => f.status === "ACTIVE").length;
  const totalLeads = forms.reduce((s, f) => s + f.leads, 0);
  const topSource = [...forms].sort((a, b) => b.leads - a.leads)[0]?.source || "—";
  return {
    totalForms: forms.length,
    totalLeads,
    activeForms: active,
    topSource,
  };
}
