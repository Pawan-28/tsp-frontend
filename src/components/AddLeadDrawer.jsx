import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Sparkles, BarChart2, Calendar,
  Mail, CheckCircle2, Radio, Briefcase,
} from "lucide-react";
import { Drawer } from "./Primitives.jsx";
import { apiPost, apiGet, invalidateCache } from "../lib/api.js";
import { getAdminCrmHeaders } from "../lib/crmContext.js";
import { apiLeadToAdmin, unwrapApiData } from "../lib/leadSync.js";
import { SOURCE_CATALOG } from "../lib/leadSource.js";

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jammu & Kashmir", "Jharkhand", "Karnataka",
  "Kerala", "Ladakh", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));

const LEAD_SOURCE_OPTIONS = SOURCE_CATALOG.filter((s) => !["n8n", "api", "form", "other"].includes(s.key)).map((s) => s.label);

const DEFAULT_SERVICES = [
  "AI Automation Suite",
  "CRM Setup & Onboarding",
  "Lead Gen Engine",
  "Custom Software Dev",
  "Strategic Consulting",
];

export function AddLead({ onClose, showToast, pipelineStages, defaultStage = "Lead" }) {
    const [activeTab, setActiveTab] = useState("basic");
    const [warmth, setWarmth] = useState("Cold Lead");
    const [stage, setStage] = useState(defaultStage);
    const [prob, setProb] = useState(50);
    const [dealVal, setDealVal] = useState("");
    const [countryCode, setCountryCode] = useState("+91");
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [serviceOptions, setServiceOptions] = useState(DEFAULT_SERVICES);
  
    const [formData, setFormData] = useState({
      lead_name: "", phone: "", email: "", city: "", state: "", company_name: "",
      source: "", service: "",
      keyword: "", ad_content: "", campaign_notes: "",
      win_probability: 50, purchased: "", expected_close_date: "",
      interactions: 0, next_followup_date: "", mom: "", call_summary: "", notes: "",
      expected_revenue: "",
    });

    useEffect(() => {
      let cancelled = false;
      (async () => {
        try {
          const data = await apiGet("/api/services", { skipCache: true, cacheTtl: 0 });
          const names = (data?.services || data?.data || [])
            .map((s) => s.name || s.title)
            .filter(Boolean);
          if (!cancelled && names.length) setServiceOptions(names);
        } catch {
          // keep defaults
        }
      })();
      return () => { cancelled = true; };
    }, []);
  
    const tabs = [
      { id: "basic",     label: "Basic Info",  icon: Users },
      { id: "marketing", label: "Marketing",   icon: Sparkles },
      { id: "pipeline",  label: "Pipeline",    icon: BarChart2 },
      { id: "followup",  label: "Follow Up",   icon: Calendar },
    ];
  
    const tabIds = tabs.map(t => t.id);
    const currentIndex = tabIds.indexOf(activeTab);
    const isLastTab = currentIndex === tabIds.length - 1;
    const isFirstTab = currentIndex === 0;
  
    const setField = (key, val) => {
      setFormData(prev => ({ ...prev, [key]: val }));
      setErrors(prev => ({ ...prev, [key]: "" }));
    };
  
    const countryCodes = [
      { code: "+91", flag: "" },
      { code: "+1",  flag: "" },
      { code: "+44", flag: "" },
      { code: "+61", flag: "" },
      { code: "+971",flag: "" },
      { code: "+65", flag: "" },
    ];

    const formatIndianCurrency = (numStr) => {
      const cleanNum = numStr.replace(/\D/g, "");
      if (!cleanNum) return "";
      let lastThree = cleanNum.substring(cleanNum.length - 3);
      let otherNumbers = cleanNum.substring(0, cleanNum.length - 3);
      if (otherNumbers !== "") {
        lastThree = "," + lastThree;
      }
      const formatted = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;
      return formatted;
    };
  
    const validateTab = (tabId) => {
      const errs = {};
      if (tabId === "basic") {
        if (!formData.lead_name.trim()) errs.lead_name = "Full name is required";
        if (!formData.phone.trim()) errs.phone = "Phone number is required";
        else if (!/^\d{10}$/.test(formData.phone.trim())) errs.phone = "Phone must be exactly 10 digits";
        if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.(com|in|org|net|co|io|edu|gov|uk|au|us)$/i.test(formData.email.trim()))
          errs.email = "Enter a valid email (e.g. name@domain.com)";
        if (!formData.source) errs.source = "Lead source is required";
        if (!formData.service) errs.service = "Service is required";
      }
      if (tabId === "marketing") {
        // source captured on Basic Info tab
      }
      if (tabId === "pipeline") {
        if (!dealVal.trim()) errs.expected_revenue = "Proposal value is required";
      }
      if (tabId === "followup") {
        if (!formData.next_followup_date) errs.next_followup_date = "Next follow-up date is required";
      }
      return errs;
    };

    const validateAll = () => {
      let allErrors = {};
      let firstTabWithErrors = null;
      for (const tab of tabs) {
        const errs = validateTab(tab.id);
        if (Object.keys(errs).length > 0) {
          allErrors = { ...allErrors, ...errs };
          if (!firstTabWithErrors) firstTabWithErrors = tab.id;
        }
      }
      return { errors: allErrors, firstTab: firstTabWithErrors };
    };

    const handleTabClick = (targetTabId) => {
      const targetIndex = tabIds.indexOf(targetTabId);
      if (targetIndex === currentIndex) return;

      if (targetIndex < currentIndex) {
        setErrors({});
        setActiveTab(targetTabId);
      } else {
        // Going forward: validate current tab first
        const errs = validateTab(activeTab);
        if (Object.keys(errs).length > 0) {
          setErrors(errs);
          return;
        }
        setErrors({});
        setActiveTab(targetTabId);
      }
    };
  
    const handleNext = () => {
      const errs = validateTab(activeTab);
      if (Object.keys(errs).length > 0) { setErrors(errs); return; }
      setErrors({});
      setActiveTab(tabIds[currentIndex + 1]);
    };
  
    const handleBack = () => {
      setErrors({});
      if (!isFirstTab) setActiveTab(tabIds[currentIndex - 1]);
    };
  
    const handleCreate = async () => {
        const { errors: allErrors, firstTab } = validateAll();
        if (Object.keys(allErrors).length > 0) {
          setErrors(allErrors);
          if (firstTab) {
            setActiveTab(firstTab);
            const tabLabel = tabs.find(t => t.id === firstTab)?.label || firstTab;
            showToast(`Please correct the fields in the ${tabLabel} tab`, "error");
          }
          return;
        }

        setLoading(true);
        const payload = {
          ...formData,
          phone: `${countryCode}${formData.phone}`,
          temperature: warmth,
          pipeline_stage: stage,
          status: stage,
          win_probability: prob,
          expected_revenue: formData.expected_revenue ? parseInt(formData.expected_revenue) : 0,
          next_followup_date: formData.next_followup_date || null,
        };
        try {
          const v1Payload = {
            leadName: payload.lead_name,
            companyName: payload.company_name,
            phone: payload.phone,
            email: payload.email || "",
            city: payload.city,
            source: payload.source || "manual",
            formName: payload.service,
            form_name: payload.service,
            temperature: payload.temperature,
            pipelineStage: payload.pipeline_stage,
            status: payload.status,
            winProbability: prob,
            expectedRevenue: payload.expected_revenue || 0,
            requirements: payload.service,
            notes: payload.campaign_notes || payload.notes || "",
            nextFollowUpAt: payload.next_followup_date || null,
            next_follow_up_at: payload.next_followup_date || null,
            sourceMeta: {
              integration: "admin",
              channel: payload.source,
              service: payload.service,
              campaign_name: payload.campaign_name,
              campaign_term: payload.campaign_term,
              lead_type: payload.lead_type,
              country: payload.country,
              mom: payload.mom,
              call_summary: payload.call_summary,
              meeting_notes: payload.meeting_notes,
            },
          };
          const res = await apiPost("/api/v1/leads", v1Payload, { headers: getAdminCrmHeaders() });
          const resData = unwrapApiData(res) || res?.data || res;
          const saved = resData?.lead || resData;
          const leadId = saved?.id || saved?.lead_id || saved?.leadId || resData?.id || res?.data?.id || res?.id;
          if (!leadId) throw new Error(res?.message || "Lead was not saved — no id returned");
          invalidateCache("/api/v1");
          showToast("Lead created successfully!");
          onClose(apiLeadToAdmin({ ...saved, id: leadId }));
        } catch (error) {
          console.error("Create lead error:", error);
          showToast(error.message || "Failed to create lead", "error");
        } finally {
          setLoading(false);
        }
      };
  
    const iconFieldWrap = { position: "relative" };
    const iconStyle = { position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#f43f5e", pointerEvents: "none" };
    const pipelineStagesList = pipelineStages || [
      "Lead",
      "Not Pick",
      "Conversation 2 min+",
      "Meeting Booked",
      "Meeting Done",
      "Proposal Sent",
      "Objection",
      "Advance Paid",
      "Payment Complete",
      "Not Interested",
    ];
    const warmthOptions = [
      { label: "Hot",  value: "Hot Lead",  style: { background: warmth === "Hot Lead" ? "#be123c" : "#fff1f2", color: warmth === "Hot Lead" ? "#fff" : "#be123c", borderColor: warmth === "Hot Lead" ? "#be123c" : "#fda4af" } },
      { label: "Warm", value: "Warm Lead", style: { background: warmth === "Warm Lead" ? "#ea580c" : "#fff7ed", color: warmth === "Warm Lead" ? "#fff" : "#c2410c", borderColor: warmth === "Warm Lead" ? "#ea580c" : "#fdba74" } },
      { label: "Cold", value: "Cold Lead", style: { background: warmth === "Cold Lead" ? "#2563eb" : "#eff6ff", color: warmth === "Cold Lead" ? "#fff" : "#1d4ed8", borderColor: warmth === "Cold Lead" ? "#2563eb" : "#93c5fd" } },
    ];
  
    const ErrMsg = ({ field }) => errors[field] ? (
      <div style={{ color: "#f43f5e", fontSize: 11, marginTop: 4 }}>{errors[field]}</div>
    ) : null;
  
    return (
      <div style={{ fontFamily: "inherit" }}>
        <style>{`
          .al-input {
            background: #fff5f5;
            border: 1.5px solid #fecdd3;
            border-radius: 10px;
            padding: 10px 13px;
            font-size: 13px;
            color: #111827;
            outline: none;
            width: 100%;
            box-sizing: border-box;
            font-family: inherit;
            transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
          }
          .al-input:hover {
            background: #fff8f8;
            border-color: #fda4af;
          }
          .al-input:focus {
            background: #ffffff;
            border-color: #be123c;
            box-shadow: 0 0 0 3px rgba(190, 18, 60, 0.12);
          }
          .al-input.error {
            border-color: #f43f5e !important;
            background: #fff5f5;
          }
          .al-input.error:focus {
            box-shadow: 0 0 0 3px rgba(244, 63, 94, 0.12) !important;
          }
          
          /* Custom scrollbar for textareas */
          .al-textarea::-webkit-scrollbar {
            width: 6px;
          }
          .al-textarea::-webkit-scrollbar-track {
            background: #fff5f5;
            border-radius: 10px;
          }
          .al-textarea::-webkit-scrollbar-thumb {
            background: #fda4af;
            border-radius: 10px;
          }
          .al-textarea::-webkit-scrollbar-thumb:hover {
            background: #f43f5e;
          }
        `}</style>
  
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,#be123c,#f43f5e)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Users size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>New Lead</div>
            <div style={{ fontSize: 11, color: "#f43f5e", marginTop: 1 }}>Fill in the details below</div>
          </div>
        </div>
  
        {/* Tab indicators */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
          {tabs.map((tab, i) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            const done = i < currentIndex;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabClick(tab.id)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                  fontFamily: "inherit", cursor: "pointer", transition: "all 0.2s ease",
                  background: active ? "#be123c" : done ? "#fef2f2" : "#fff5f5",
                  color: active ? "#fff" : done ? "#be123c" : "#9ca3af",
                  border: `1.5px solid ${active ? "#be123c" : done ? "#fda4af" : "#fecdd3"}`,
                  outline: "none",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = done ? "#fce7f3" : "#ffe4e6";
                    e.currentTarget.style.borderColor = "#fda4af";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = done ? "#fef2f2" : "#fff5f5";
                    e.currentTarget.style.borderColor = done ? "#fda4af" : "#fecdd3";
                  }
                }}
              >
                {done ? <CheckCircle2 size={13} /> : <Icon size={13} />}
                {tab.label}
              </button>
            );
          })}
        </div>
  
        {/* Tab content */}
        <AnimatePresence mode="wait">
  
          {activeTab === "basic" && (
            <motion.div key="basic" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }}>
              <SectionDivider label="Contact details" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
  
                <FormField label="Full Name" required>
                  <div style={iconFieldWrap}>
                    <Users size={14} style={iconStyle} />
                    <input className={`al-input ${errors.lead_name ? "error" : ""}`} style={{ paddingLeft: 36 }} placeholder="e.g. Ananya Sharma" value={formData.lead_name} onChange={e => setField("lead_name", e.target.value)} />
                  </div>
                  <ErrMsg field="lead_name" />
                </FormField>
  
                <FormField label="Phone Number" required>
                  <div style={{ display: "flex", gap: 6 }}>
                    <select value={countryCode} onChange={e => setCountryCode(e.target.value)} style={{ background: "#fff5f5", border: "1.5px solid #fecdd3", borderRadius: 10, padding: "10px 8px", fontSize: 13, color: "#111827", outline: "none", width: "auto", flexShrink: 0, fontFamily: "inherit" }}>
                      {countryCodes.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                    </select>
                    <input className={`al-input ${errors.phone ? "error" : ""}`} placeholder="98765 43210" value={formData.phone} maxLength={10} onChange={e => setField("phone", e.target.value.replace(/\D/g, ""))} />
                  </div>
                  <ErrMsg field="phone" />
                </FormField>
  
                <FormField label="Email Address">
                  <div style={iconFieldWrap}>
                    <Mail size={14} style={iconStyle} />
                    <input className={`al-input ${errors.email ? "error" : ""}`} style={{ paddingLeft: 36 }} placeholder="name@company.com" value={formData.email} onChange={e => setField("email", e.target.value)} />
                  </div>
                  <ErrMsg field="email" />
                </FormField>

                <FormField label="Business Name" fullWidth>
                  <input className={`al-input ${errors.company_name ? "error" : ""}`} placeholder="e.g. Penguin India Pvt. Ltd." value={formData.company_name} onChange={e => setField("company_name", e.target.value)} />
                  <ErrMsg field="company_name" />
                </FormField>

              </div>

              <SectionDivider label="Location" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>

                <FormField label="City">
                  <input className={`al-input ${errors.city ? "error" : ""}`} placeholder="e.g. Mumbai" value={formData.city} onChange={e => setField("city", e.target.value)} />
                  <ErrMsg field="city" />
                </FormField>

                <FormField label="State">
                  <ALSelect options={INDIAN_STATES} value={formData.state} onChange={val => setField("state", val)} error={!!errors.state} placeholder="Select state" />
                  <ErrMsg field="state" />
                </FormField>
  
              </div>

              <SectionDivider label="Source & service" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>

                <FormField label="Source" required>
                  <div style={iconFieldWrap}>
                    <Radio size={14} style={iconStyle} />
                    <div style={{ paddingLeft: 36 }}>
                      <ALSelect
                        options={LEAD_SOURCE_OPTIONS}
                        value={formData.source}
                        onChange={val => setField("source", val)}
                        error={!!errors.source}
                        placeholder="Select source (Meta, Google…)"
                      />
                    </div>
                  </div>
                  <ErrMsg field="source" />
                </FormField>

                <FormField label="Service" required>
                  <div style={iconFieldWrap}>
                    <Briefcase size={14} style={iconStyle} />
                    <div style={{ paddingLeft: 36 }}>
                      <ALSelect
                        options={serviceOptions}
                        value={formData.service}
                        onChange={val => setField("service", val)}
                        error={!!errors.service}
                        placeholder="Select service"
                      />
                    </div>
                  </div>
                  <ErrMsg field="service" />
                </FormField>

              </div>
            </motion.div>
          )}
  
          {activeTab === "marketing" && (
            <motion.div key="marketing" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }}>
              <SectionDivider label="Campaign attribution" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
  
                <FormField label="Lead Source" fullWidth>
                  <ALSelect options={LEAD_SOURCE_OPTIONS} value={formData.source} onChange={val => setField("source", val)} error={!!errors.source} placeholder="Set on Basic Info tab" />
                  <p style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>Primary source is set under Basic Info → Source &amp; service.</p>
                </FormField>
  
                <FormField label="Keyword / Adset">
                  <input className="al-input" placeholder="e.g. crm software india" value={formData.keyword} onChange={e => setField("keyword", e.target.value)} />
                </FormField>
  
                <FormField label="Ad / Content">
                  <input className="al-input" placeholder="e.g. summer-campaign-v2" value={formData.ad_content} onChange={e => setField("ad_content", e.target.value)} />
                </FormField>
  
                <FormField label="Campaign Notes" fullWidth>
                  <textarea rows={3} className="al-input al-textarea" style={{ resize: "vertical", lineHeight: 1.5 }} placeholder="Any additional campaign context..." value={formData.campaign_notes} onChange={e => setField("campaign_notes", e.target.value)} />
                </FormField>
  
              </div>
            </motion.div>
          )}
  
          {activeTab === "pipeline" && (
            <motion.div key="pipeline" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }}>
              <SectionDivider label="Deal details" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
  
                <FormField label="Pipeline Stage" fullWidth>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                    {pipelineStagesList.map(s => {
                      const active = stage === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setStage(s)}
                          style={{
                            padding: "8px 14px",
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            transition: "all .2s ease",
                            background: active ? "#be123c" : "#fff5f5",
                            color: active ? "#fff" : "#be123c",
                            border: `1.5px solid ${active ? "#be123c" : "#fda4af"}`,
                            boxShadow: active ? "0 4px 12px rgba(190, 18, 60, 0.25)" : "none",
                            outline: "none",
                          }}
                          onMouseEnter={(e) => {
                            if (!active) {
                              e.currentTarget.style.background = "#ffe4e6";
                              e.currentTarget.style.transform = "translateY(-1px)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!active) {
                              e.currentTarget.style.background = "#fff5f5";
                              e.currentTarget.style.transform = "none";
                            }
                          }}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </FormField>
  
                <FormField label="Lead Warmth" fullWidth>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                    {warmthOptions.map(w => {
                      const active = warmth === w.value;
                      return (
                        <button
                          key={w.value}
                          type="button"
                          onClick={() => setWarmth(w.value)}
                          style={{
                            padding: "8px 18px",
                            borderRadius: 99,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            border: "1.5px solid",
                            transition: "all .2s ease",
                            boxShadow: active ? "0 4px 12px rgba(0, 0, 0, 0.1)" : "none",
                            transform: active ? "scale(1.03)" : "none",
                            outline: "none",
                            ...w.style
                          }}
                          onMouseEnter={(e) => {
                            if (!active) {
                              e.currentTarget.style.transform = "translateY(-1px)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!active) {
                              e.currentTarget.style.transform = "none";
                            }
                          }}
                        >
                          {w.label}
                        </button>
                      );
                    })}
                  </div>
                </FormField>
  
                <FormField
                  label={
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                      <span>Proposal Value (₹)</span>
                      {dealVal && (
                        <span style={{ fontSize: 10, background: "#fecdd3", color: "#be123c", padding: "1px 6px", borderRadius: 4, textTransform: "none", fontWeight: 700 }}>
                          ₹{dealVal}
                        </span>
                      )}
                    </div>
                  }
                  required
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#be123c" }}>₹</span>
                    <input className={`al-input ${errors.expected_revenue ? "error" : ""}`} style={{ flex: 1 }} placeholder="2,50,000" value={dealVal} onChange={e => { const rawVal = e.target.value.replace(/\D/g, ""); const formatted = formatIndianCurrency(rawVal); setDealVal(formatted); setField("expected_revenue", rawVal); }} />
                  </div>
                  <div style={{ background: "#fce7f3", borderRadius: 99, height: 5, marginTop: 8, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 99, background: "linear-gradient(90deg,#be123c,#f43f5e)", width: `${Math.min((parseInt(dealVal.replace(/\D/g, "")) / 1000000) * 100 || 0, 100)}%`, transition: "width .3s ease" }} />
                  </div>
                  <ErrMsg field="expected_revenue" />
                </FormField>
  
                <FormField
                  label={
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                      <span>Win Probability</span>
                      <span style={{
                        fontSize: 10,
                        padding: "2px 8px",
                        borderRadius: 6,
                        textTransform: "none",
                        fontWeight: 700,
                        background: prob >= 70 ? "#dcfce7" : prob >= 40 ? "#fef3c7" : "#ffe4e6",
                        color: prob >= 70 ? "#15803d" : prob >= 40 ? "#b45309" : "#be123c",
                        transition: "all 0.15s ease",
                      }}>
                        {prob}% — {prob >= 70 ? "High Chance" : prob >= 40 ? "Medium Chance" : "Low Chance"}
                      </span>
                    </div>
                  }
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={prob}
                      onChange={e => {
                        setProb(Number(e.target.value));
                        setField("win_probability", Number(e.target.value));
                      }}
                      style={{
                        width: "100%",
                        accentColor: prob >= 70 ? "#22c55e" : prob >= 40 ? "#f59e0b" : "#be123c",
                        cursor: "pointer",
                      }}
                    />
                  </div>
                </FormField>
  
                <FormField label="Purchased">
                  <input className="al-input" placeholder="Product / plan purchased" value={formData.purchased} onChange={e => setField("purchased", e.target.value)} />
                </FormField>
  
                <FormField label="Expected Close Date">
                  <input type="date" className="al-input" value={formData.expected_close_date} onChange={e => setField("expected_close_date", e.target.value)} />
                </FormField>
  
              </div>
            </motion.div>
          )}
  
          {activeTab === "followup" && (
            <motion.div key="followup" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }}>
              <SectionDivider label="Follow-up log" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
  
                <FormField label="Interactions (count)">
                  <input type="number" className="al-input" placeholder="e.g. 3" min={0} value={formData.interactions} onChange={e => setField("interactions", e.target.value)} />
                </FormField>
  
                <FormField label="Next Follow-up Date" required>
                  <input type="date" className={`al-input ${errors.next_followup_date ? "error" : ""}`} value={formData.next_followup_date} onChange={e => setField("next_followup_date", e.target.value)} />
                  <ErrMsg field="next_followup_date" />
                </FormField>
  
                <FormField label="MOM (Minutes of Meeting)" fullWidth>
                  <textarea rows={4} className="al-input al-textarea" style={{ resize: "vertical", lineHeight: 1.5 }} placeholder="Key points discussed..." value={formData.mom} onChange={e => setField("mom", e.target.value)} />
                </FormField>
  
                <FormField label="Call Summary" fullWidth>
                  <textarea rows={4} className="al-input al-textarea" style={{ resize: "vertical", lineHeight: 1.5 }} placeholder="Summary of the last call..." value={formData.call_summary} onChange={e => setField("call_summary", e.target.value)} />
                </FormField>
  
                <FormField label="Meeting Notes" fullWidth>
                  <textarea rows={4} className="al-input al-textarea" style={{ resize: "vertical", lineHeight: 1.5 }} placeholder="Observations, objections, next steps..." value={formData.notes} onChange={e => setField("notes", e.target.value)} />
                </FormField>
  
              </div>
            </motion.div>
          )}
  
        </AnimatePresence>
  
        {/* Footer */}
        <div style={{ display: "flex", gap: 12, marginTop: 28, paddingTop: 20, borderTop: "1px solid #fce7f3", flexWrap: "wrap" }}>
          {isFirstTab ? (
            <button type="button" onClick={onClose} style={{ flex: 1, minWidth: 100, padding: 12, borderRadius: 12, border: "1.5px solid #fecdd3", background: "#fff", color: "#6b7280", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
          ) : (
            <button type="button" onClick={handleBack} style={{ flex: 1, minWidth: 100, padding: 12, borderRadius: 12, border: "1.5px solid #fecdd3", background: "#fff", color: "#6b7280", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
              ← Back
            </button>
          )}
  
          {!isLastTab ? (
            <button type="button" onClick={handleNext} style={{ flex: 1, minWidth: 100, padding: 12, borderRadius: 12, border: "none", background: "linear-gradient(135deg,#be123c,#f43f5e)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Next →
            </button>
          ) : (
            <button type="button" onClick={handleCreate} disabled={loading} style={{ flex: 1, minWidth: 100, padding: 12, borderRadius: 12, border: "none", background: loading ? "#fda4af" : "linear-gradient(135deg,#be123c,#f43f5e)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              {loading ? "Creating..." : "Create Lead"}
            </button>
          )}
        </div>
      </div>
    );
  }
  
  function SectionDivider({ label }) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#f43f5e", whiteSpace: "nowrap" }}>{label}</span>
        <div style={{ flex: 1, height: 1, background: "#fce7f3" }} />
      </div>
    );
  }
  
  function FormField({ label, children, fullWidth = false, required = false }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 5, ...(fullWidth ? { gridColumn: "1 / -1" } : {}) }}>
        <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "#be123c" }}>
          {label}{required && <span style={{ color: "#f43f5e", marginLeft: 2 }}>*</span>}
        </label>
        {children}
      </div>
    );
  }
  
  const CUSTOM_OPTION_VALUE = "__custom__";

  function ALSelect({ options, value = "", onChange, error = false, placeholder = "Select", customPlaceholder = "Type your own…" }) {
    const [customMode, setCustomMode] = useState(Boolean(value) && !options.includes(value));

    const baseFieldStyle = {
      background: "#fff5f5",
      border: `1.5px solid ${error ? "#f43f5e" : "#fecdd3"}`,
      borderRadius: 10,
      padding: "10px 13px", fontSize: 13, color: "#111827",
      outline: "none", width: "100%", fontFamily: "inherit",
    };

    if (customMode) {
      return (
        <div style={{ position: "relative" }}>
          <input
            type="text"
            value={value}
            onChange={e => onChange && onChange(e.target.value)}
            placeholder={customPlaceholder}
            autoFocus
            style={{ ...baseFieldStyle, paddingRight: 32 }}
          />
          <button
            type="button"
            onClick={() => { setCustomMode(false); onChange && onChange(""); }}
            title="Choose from list instead"
            style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", color: "#9ca3af", cursor: "pointer",
              fontSize: 16, lineHeight: 1, padding: 4,
            }}
          >
            ×
          </button>
        </div>
      );
    }

    return (
      <select
        value={value}
        onChange={e => {
          if (e.target.value === CUSTOM_OPTION_VALUE) {
            setCustomMode(true);
            onChange && onChange("");
            return;
          }
          onChange && onChange(e.target.value);
        }}
        style={{
          ...baseFieldStyle,
          padding: "10px 36px 10px 13px", color: value ? "#111827" : "#9ca3af",
          appearance: "none",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23f43f5e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value={CUSTOM_OPTION_VALUE}>+ Add new…</option>
      </select>
    );
  }
  
  export default function AddLeadDrawer({
    open,
    onClose,
    showToast,
    title = "New Lead",
    subtitle,
    width = "drawer-panel",
    pipelineStages,
    defaultStage,
  }) {
    const handleClose = (result) => onClose?.(result);

    return (
      <Drawer open={open} onClose={() => handleClose()} title={title} width={width}>
        {subtitle && (
          <p className="text-xs text-slate-500 mb-4 pb-3 border-b border-rose-50">{subtitle}</p>
        )}
        <AddLead
          onClose={handleClose}
          showToast={showToast}
          pipelineStages={pipelineStages}
          defaultStage={defaultStage}
        />
      </Drawer>
    );
  }