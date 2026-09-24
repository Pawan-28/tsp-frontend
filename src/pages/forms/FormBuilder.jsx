import { useEffect, useState } from "react";
import {
  Wrench, Plus, GripVertical, Pencil, Trash2, ChevronDown,
} from "lucide-react";
import toast from "react-hot-toast";
import { Drawer } from "../../components/Primitives.jsx";
import {
  DEFAULT_FORM_FIELDS, FORM_SOURCES, FORM_SERVICES,
} from "../../data/formsMock.js";

const FIELD_TYPES = ["INPUT", "EMAIL", "PHONE", "DROPDOWN", "TEXTAREA", "NUMBER"];

function fieldMeta(field) {
  const req = field.required ? "REQUIRED" : "OPTIONAL";
  if (field.type === "DROPDOWN") return `DROPDOWN • ${field.required ? "SELECT OPTION" : "OPTIONAL"}`;
  return `${field.type} • ${req}`;
}

export default function FormBuilderDrawer({ open, onClose, existingForm, onSave, saving = false }) {
  const isEdit = Boolean(existingForm);

  const [formName, setFormName] = useState("");
  const [sourceKey, setSourceKey] = useState("website");
  const [service, setService] = useState("Lead Gen");
  const [fields, setFields] = useState([]);
  const [dragIdx, setDragIdx] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editField, setEditField] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newField, setNewField] = useState({ label: "", type: "INPUT", required: false });

  useEffect(() => {
    if (!open) return;
    setFormName(existingForm?.name || "");
    setSourceKey(existingForm?.sourceKey || "website");
    setService(existingForm?.service || "Lead Gen");
    setFields(
      existingForm?.fields?.map((f) => ({ ...f }))
        || DEFAULT_FORM_FIELDS.map((f) => ({ ...f })),
    );
    setDragIdx(null);
    setEditOpen(false);
    setAddOpen(false);
    setEditField(null);
    setNewField({ label: "", type: "INPUT", required: false });
  }, [open, existingForm?.id, existingForm?.name, existingForm?.fields, existingForm?.sourceKey, existingForm?.service]);

  const buildPayload = (status) => {
    const sourceOpt = FORM_SOURCES.find((s) => s.id === sourceKey);
    return {
      name: formName.trim(),
      sourceKey,
      source: sourceOpt?.label || "Website",
      service,
      status,
      fields,
      leads: existingForm?.leads ?? 0,
      revenue: existingForm?.revenue ?? 0,
      conversion: existingForm?.conversion ?? 0,
    };
  };

  const handleSaveDraft = async () => {
    if (!formName.trim()) {
      toast.error("Enter a form name");
      return;
    }
    await onSave?.(buildPayload("DRAFT"), true);
  };

  const handlePublish = async () => {
    if (!formName.trim()) {
      toast.error("Enter a form name");
      return;
    }
    if (fields.length === 0) {
      toast.error("Add at least one field");
      return;
    }
    await onSave?.(buildPayload("ACTIVE"), false);
  };

  const moveField = (from, to) => {
    if (to < 0 || to >= fields.length) return;
    setFields((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const deleteField = (id) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
    toast.success("Field removed");
  };

  const saveFieldEdit = () => {
    if (!editField?.label?.trim()) return;
    setFields((prev) => prev.map((f) => (f.id === editField.id ? { ...editField } : f)));
    setEditOpen(false);
    toast.success("Field updated");
  };

  const addField = () => {
    if (!newField.label.trim()) return;
    setFields((prev) => [
      ...prev,
      {
        id: `f${Date.now()}`,
        label: newField.label,
        type: newField.type,
        required: newField.required,
        ...(newField.type === "DROPDOWN" ? { options: ["Option 1", "Option 2"] } : {}),
      },
    ]);
    setAddOpen(false);
    setNewField({ label: "", type: "INPUT", required: false });
    toast.success("Field added");
  };

  const drawerTitle = isEdit ? `Edit · ${existingForm?.name || "Form"}` : "Create Form";

  return (
    <>
      <Drawer open={open} onClose={() => onClose?.()} title={drawerTitle} width="drawer-panel">
        <p className="text-xs text-slate-500 mb-4 pb-3 border-b border-rose-50">
          Architect your form fields and publish when ready
        </p>

        <div className="flex gap-2 mb-5">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving}
            className="flex-1 sm:flex-initial px-4 py-2 rounded-xl border border-rose-200 bg-white text-slate-700 text-xs font-bold hover:bg-rose-50 transition disabled:opacity-50"
          >
            Save Draft
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={saving}
            className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-rose-700 text-white text-xs font-bold hover:bg-rose-800 shadow-sm transition disabled:opacity-50"
          >
            {saving ? "Saving…" : "Publish Form"}
          </button>
        </div>

        <div className="rounded-xl border border-rose-100 bg-[#fffbfb] p-4 mb-4">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
            Form Name
          </label>
          <input
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. Google Ads Form"
            className="w-full px-4 py-2.5 rounded-xl border border-rose-100 bg-white text-slate-900 text-sm font-semibold outline-none focus:border-rose-400"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                Source
              </label>
              <select
                value={sourceKey}
                onChange={(e) => setSourceKey(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-rose-100 bg-white text-slate-900 text-sm font-semibold outline-none focus:border-rose-400"
              >
                {FORM_SOURCES.filter((s) => s.id !== "all").map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                Service
              </label>
              <select
                value={service}
                onChange={(e) => setService(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-rose-100 bg-white text-slate-900 text-sm font-semibold outline-none focus:border-rose-400"
              >
                {FORM_SERVICES.filter((s) => s.id !== "all").map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-rose-100 bg-[#fffbfb] p-4">
          <div className="flex items-center justify-between mb-4 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Wrench className="w-4 h-4 text-rose-600 shrink-0" />
              <h3 className="text-sm font-extrabold text-slate-800 truncate">Form Builder</h3>
            </div>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 hover:text-rose-800 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Field
            </button>
          </div>

          <div className="space-y-2">
            {fields.map((field, idx) => (
              <div
                key={field.id}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIdx !== null && dragIdx !== idx) moveField(dragIdx, idx);
                  setDragIdx(null);
                }}
                className={`flex items-center gap-3 rounded-xl border p-3.5 bg-white transition ${
                  dragIdx === idx ? "border-rose-400 shadow-md" : "border-rose-100 hover:border-rose-200"
                }`}
              >
                <button
                  type="button"
                  className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing shrink-0"
                  aria-label="Reorder"
                >
                  <GripVertical className="w-4 h-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{field.label}</p>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">
                    {fieldMeta(field)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {field.type === "DROPDOWN" ? (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setEditField({ ...field }); setEditOpen(true); }}
                      className="w-8 h-8 rounded-lg hover:bg-rose-50 text-slate-500 grid place-items-center"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteField(field.id)}
                    className="w-8 h-8 rounded-lg hover:bg-rose-50 text-rose-500 grid place-items-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {fields.length === 0 && (
            <div className="rounded-xl border border-dashed border-rose-200 p-8 text-center text-sm text-slate-500">
              No fields yet — add your first field above.
            </div>
          )}
        </div>
      </Drawer>

      <Drawer nested open={editOpen} onClose={() => setEditOpen(false)} title="Edit Field" width="drawer-panel">
        {editField && (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Label</label>
              <input
                value={editField.label}
                onChange={(e) => setEditField({ ...editField, label: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Type</label>
              <select
                value={editField.type}
                onChange={(e) => setEditField({ ...editField, type: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={editField.required}
                onChange={(e) => setEditField({ ...editField, required: e.target.checked })}
              />
              Required field
            </label>
            <button type="button" onClick={saveFieldEdit} className="w-full py-2.5 rounded-xl bg-rose-700 text-white text-sm font-bold">
              Save Field
            </button>
          </div>
        )}
      </Drawer>

      <Drawer nested open={addOpen} onClose={() => setAddOpen(false)} title="Add Custom Field" width="drawer-panel">
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Label</label>
            <input
              value={newField.label}
              onChange={(e) => setNewField({ ...newField, label: e.target.value })}
              placeholder="Field label"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Type</label>
            <select
              value={newField.type}
              onChange={(e) => setNewField({ ...newField, type: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={newField.required}
              onChange={(e) => setNewField({ ...newField, required: e.target.checked })}
            />
            Required field
          </label>
          <button type="button" onClick={addField} className="w-full py-2.5 rounded-xl bg-rose-700 text-white text-sm font-bold">
            Add Field
          </button>
        </div>
      </Drawer>
    </>
  );
}
