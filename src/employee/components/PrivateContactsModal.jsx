import React, { useState, useEffect, useId } from "react";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Plus,
  Trash2,
  Phone,
  User,
  Tag,
  FileText,
  X,
  Lock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import { fetchPrivateContacts, addPrivateContact, deletePrivateContact } from "../../lib/api.js";

const RELATIONS = [
  { id: "Personal", label: "Personal", color: "bg-purple-50 text-purple-700 border-purple-200" },
  { id: "Family", label: "Family", color: "bg-rose-50 text-rose-700 border-rose-200" },
  { id: "Friend", label: "Friend", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { id: "Medical", label: "Medical / Doctor", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { id: "Other", label: "Other", color: "bg-gray-50 text-gray-700 border-gray-200" },
];

export default function PrivateContactsModal({ isOpen, onClose, employeeId, employeeName }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState("Personal");
  const [notes, setNotes] = useState("");

  const nameInputId = useId();
  const phoneInputId = useId();
  const relationInputId = useId();
  const notesInputId = useId();

  const loadContacts = async () => {
    if (!employeeId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetchPrivateContacts(employeeId);
      setContacts(res?.data || []);
    } catch (err) {
      console.error("Failed to load private contacts:", err);
      setError(err.message || "Could not load private contacts list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && employeeId) {
      loadContacts();
      setShowAddForm(false);
      setName("");
      setPhone("");
      setRelation("Personal");
      setNotes("");
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen, employeeId]);

  if (!isOpen) return null;

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setError("Please provide both name and phone number");
      return;
    }

    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setError("Please enter a valid 10-digit phone number");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccessMsg(null);

      const res = await addPrivateContact(employeeId, {
        name: name.trim(),
        phone: phone.trim(),
        relation,
        notes: notes.trim() || undefined,
      });

      setSuccessMsg(res?.message || "Private contact added. Call data is strictly excluded.");
      setName("");
      setPhone("");
      setRelation("Personal");
      setNotes("");
      setShowAddForm(false);
      await loadContacts();

      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      console.error("Failed to add private contact:", err);
      setError(err.message || "Failed to add private contact");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (contactId) => {
    if (!window.confirm("Remove this contact from your private list? Callyzer call tracking rules will resume for this number.")) {
      return;
    }

    try {
      setDeletingId(contactId);
      setError(null);
      await deletePrivateContact(employeeId, contactId);
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
      setSuccessMsg("Contact removed from private list.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error("Failed to delete private contact:", err);
      setError(err.message || "Failed to remove private contact");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredContacts = contacts.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.phoneNormalized?.includes(q) ||
      c.relation?.toLowerCase().includes(q)
    );
  });

  return (
    <div
      id="private-contacts-modal-backdrop"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target.id === "private-contacts-modal-backdrop") onClose();
      }}
    >
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-rose-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#DC143C] to-[#E63956] text-white px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center border border-white/20 shadow-inner">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold tracking-tight text-white">Private Contacts & Privacy Shield</h3>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-white/20 px-2 py-0.5 rounded-full uppercase tracking-wider text-rose-50">
                  <ShieldCheck className="w-3 h-3 text-emerald-300" />
                  Active
                </span>
              </div>
              <p className="text-xs text-rose-100 mt-0.5">
                {employeeName ? `Personal privacy rules for ${employeeName}` : "Personal numbers are 100% excluded from all dashboards & logs"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Privacy Assurance Banner */}
        <div className="bg-amber-50/80 border-b border-amber-200/60 px-6 py-3 flex items-start gap-3 text-xs text-amber-900 shrink-0">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-950">Strict Privacy Enforcement: </span>
            Calls to/from numbers in this list will <strong>never</strong> appear in employee or admin call logs, recordings, analytics, or KPI reports.
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mx-6 mt-4 p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-6 mt-4 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Action Row */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search private list..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:border-rose-400 transition"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition shadow-sm ${
                showAddForm
                  ? "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300"
                  : "bg-gradient-to-r from-[#DC143C] to-[#E63956] text-white hover:opacity-95 shadow-rose-200"
              }`}
            >
              {showAddForm ? (
                <>
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  Add Private Contact
                </>
              )}
            </button>
          </div>

          {/* Add Contact Form Card */}
          {showAddForm && (
            <form
              onSubmit={handleAdd}
              className="p-5 rounded-2xl bg-gradient-to-br from-rose-50/70 via-white to-pink-50/50 border border-rose-200/80 shadow-sm space-y-4 animate-in slide-in-from-top-2 duration-200"
            >
              <div className="flex items-center gap-2 pb-2 border-b border-rose-100 text-xs font-bold text-rose-950 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-[#DC143C]" />
                Add New Private Number
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={nameInputId} className="block text-xs font-semibold text-gray-700 mb-1">
                    Contact Name <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      id={nameInputId}
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Mom, Rahul (Friend)"
                      className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-400"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor={phoneInputId} className="block text-xs font-semibold text-gray-700 mb-1">
                    Phone Number <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      id={phoneInputId}
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. 9876543210 or +91..."
                      className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-400 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={relationInputId} className="block text-xs font-semibold text-gray-700 mb-1">
                    Category / Tag
                  </label>
                  <select
                    id={relationInputId}
                    value={relation}
                    onChange={(e) => setRelation(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-400"
                  >
                    {RELATIONS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor={notesInputId} className="block text-xs font-semibold text-gray-700 mb-1">
                    Notes (Optional)
                  </label>
                  <input
                    id={notesInputId}
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Personal mobile"
                    className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-400"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-[#DC143C] text-white hover:bg-[#b01030] transition shadow-md disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving & Purging...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Save & Apply Privacy Rule
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Contacts List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-500 px-1">
              <span>Your Protected Contacts ({contacts.length})</span>
              <span className="text-[11px] text-gray-400">Excludes incoming, outgoing, & recordings</span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-gray-400 text-xs flex flex-col items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-[#DC143C]" />
                <span>Loading your private list...</span>
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="p-8 text-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/50">
                <Shield className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-gray-700">No private contacts found</p>
                <p className="text-[11px] text-gray-400 mt-0.5 max-w-sm mx-auto">
                  {searchQuery
                    ? "No contact matches your search filter."
                    : "Add numbers for family, friends, or private conversations to exclude them completely from CRM call logs & metrics."}
                </p>
                {!showAddForm && !searchQuery && (
                  <button
                    type="button"
                    onClick={() => setShowAddForm(true)}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-rose-200 text-[#DC143C] text-xs font-semibold hover:bg-rose-50 transition shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add First Private Number
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200 overflow-hidden bg-white shadow-sm">
                {filteredContacts.map((contact) => {
                  const relObj = RELATIONS.find((r) => r.id === contact.relation) || RELATIONS[0];
                  return (
                    <div
                      key={contact.id}
                      className="p-3.5 sm:px-4 sm:py-3.5 flex items-center justify-between gap-3 hover:bg-rose-50/30 transition group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-rose-100/70 border border-rose-200 text-[#DC143C] flex items-center justify-center font-bold text-xs shrink-0">
                          {contact.name?.charAt(0)?.toUpperCase() || "P"}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-900 truncate">{contact.name}</span>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${relObj.color}`}
                            >
                              {contact.relation || "Personal"}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5">
                            <span className="font-mono text-gray-700 font-medium">{contact.phone}</span>
                            {contact.notes && <span className="truncate text-gray-400">· {contact.notes}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDelete(contact.id)}
                          disabled={deletingId === contact.id}
                          title="Remove from private list"
                          className="w-8 h-8 rounded-xl border border-gray-200 hover:border-red-300 hover:bg-red-50 text-gray-400 hover:text-red-600 flex items-center justify-center transition disabled:opacity-40"
                        >
                          {deletingId === contact.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-3.5 border-t border-gray-100 flex items-center justify-between shrink-0 text-xs text-gray-500">
          <div className="flex items-center gap-1.5 text-emerald-700">
            <Lock className="w-3.5 h-3.5" />
            <span className="font-medium">100% Private & Server-Enforced</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white border border-gray-300 text-gray-700 font-semibold hover:bg-gray-100 transition shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
