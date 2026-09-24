import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  Copy, Download, FileSpreadsheet, FileText, FolderOpen, GraduationCap,
  Layers, Mail, Plus, Presentation, Search, Share2, Upload, Briefcase,
  BookOpen, AlignLeft, X, CheckCircle2,
} from "lucide-react";
import { GlassCard, StatCard, Badge, Drawer } from "../../components/Primitives.jsx";
import { SEGMENT_WRAP, SEGMENT_BTN, SEGMENT_BTN_ACTIVE, SEGMENT_BTN_INACTIVE } from "../../lib/segmentPills.js";
import { apiGet, apiPostForm, apiPost, invalidateCache } from "../../lib/api.js";
import { getCrmHeaders } from "../../lib/crmContext.js";
import { unwrapApiData } from "../../lib/leadSync.js";
import {
  mapTeamAssetFromApi,
  formatFileSize,
  assetDownloadUrl,
} from "../../lib/teamAssets.js";
import {
  BtnPrimary, BtnSecondary, EmpEmptyState, EmpModal,
} from "../components/EmpUI.jsx";

const CATEGORIES = [
  { id: "all", label: "All", icon: FolderOpen },
  { id: "brochure", label: "Brochures", icon: FileText },
  { id: "proposal", label: "Proposals", icon: Briefcase },
  { id: "price", label: "Price Lists", icon: FileSpreadsheet },
  { id: "template", label: "Templates", icon: Layers },
  { id: "training", label: "Training", icon: GraduationCap },
  { id: "case", label: "Case Studies", icon: BookOpen },
];

const ASSET_CATS = CATEGORIES.filter((c) => c.id !== "all");

const CAT_ICON = {
  brochure: FileText,
  proposal: Briefcase,
  price: FileSpreadsheet,
  template: Layers,
  training: GraduationCap,
  case: BookOpen,
};

const TAG_TONE = {
  PDF: "muted",
  Excel: "success",
  DOCX: "info",
  PPT: "warning",
  TEXT: "primary",
};

const INPUT = "w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition";
const LABEL = "block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1.5";
const CARD_BTN = "inline-flex items-center justify-center gap-1.5 flex-1 py-1.5 px-3 rounded-xl text-[11px] font-semibold border transition";

const EMPTY_FORM = {
  mode: "upload",
  name: "",
  cat: "brochure",
  file: null,
  text: "",
};

function Field({ label, children, className = "" }) {
  return (
    <div className={className}>
      <label className={LABEL}>{label}</label>
      {children}
    </div>
  );
}

function formatFileSizeLocal(bytes) {
  return formatFileSize(bytes);
}

function assetShareUrl(asset) {
  return asset?.downloadUrl || assetDownloadUrl(asset?.url) || "";
}

function AddAssetDrawer({ open, form, setForm, onClose, onSubmit, saving = false }) {
  const fileRef = useRef(null);

  useEffect(() => {
    if (open) setForm({ ...EMPTY_FORM });
  }, [open]);

  const handleFilePick = (file) => {
    if (!file) return;
    setForm((f) => ({
      ...f,
      file,
      name: f.name.trim() || file.name.replace(/\.[^.]+$/, ""),
    }));
  };

  return (
    <Drawer open={open} onClose={onClose} title="Add Asset" width="drawer-panel">
      <p className="text-xs text-slate-500 mb-4 pb-3 border-b border-slate-100">
        Upload a file or text note — visible to all employees
      </p>

      <div className={`${SEGMENT_WRAP} mb-5 w-full`}>
        {[
          { id: "upload", label: "Upload File", icon: Upload },
          { id: "text", label: "Text Note", icon: AlignLeft },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setForm((f) => ({ ...f, mode: id }))}
            className={`flex-1 inline-flex items-center justify-center gap-1 ${SEGMENT_BTN} ${
              form.mode === id
                ? "bg-white text-slate-800 shadow-sm ring-1 ring-slate-200"
                : SEGMENT_BTN_INACTIVE
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <Field label="Asset Name">
          <input
            className={INPUT}
            placeholder="Enterprise CRM Brochure"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </Field>

        <Field label="Category">
          <select
            className={INPUT}
            value={form.cat}
            onChange={(e) => setForm((f) => ({ ...f, cat: e.target.value }))}
          >
            {ASSET_CATS.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </Field>

        {form.mode === "upload" ? (
          <Field label="File">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt"
              onChange={(e) => handleFilePick(e.target.files?.[0] || null)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFilePick(e.dataTransfer.files?.[0] || null);
              }}
              className="w-full rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center hover:border-slate-300 hover:bg-slate-50 transition"
            >
              {form.file ? (
                <div>
                  <FileText className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-800 truncate">{form.file.name}</p>
                  <p className="text-xs text-slate-500 mt-1">{formatFileSizeLocal(form.file.size)}</p>
                  <p className="text-[10px] text-slate-400 mt-2">Click to replace file</p>
                </div>
              ) : (
                <div>
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">Drop file here or click to browse</p>
                  <p className="text-[10px] text-slate-400 mt-1">PDF, DOCX, Excel, PPT supported</p>
                </div>
              )}
            </button>
          </Field>
        ) : (
          <Field label="Content">
            <textarea
              rows={8}
              className={`${INPUT} !h-auto py-2.5 resize-none`}
              placeholder="Paste notes, scripts, message templates, or any text content…"
              value={form.text}
              onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
            />
          </Field>
        )}
      </div>

      <div className="sticky bottom-0 -mx-4 sm:-mx-5 px-4 sm:px-5 py-4 mt-6 bg-white border-t border-slate-100 flex flex-wrap gap-2">
        <BtnPrimary onClick={onSubmit} className="flex-1 sm:flex-initial" disabled={saving}>
          <CheckCircle2 className="w-4 h-4" /> {saving ? "Saving…" : "Save Asset"}
        </BtnPrimary>
        <BtnSecondary onClick={onClose} className="sm:ml-auto">
          <X className="w-4 h-4" /> Cancel
        </BtnSecondary>
      </div>
    </Drawer>
  );
}

function AssetCard({ asset, onDownload, onShare }) {
  const Icon = CAT_ICON[asset.cat] || FileText;

  return (
    <article className="group rounded-2xl border border-slate-200/80 bg-white p-4 hover:border-slate-300 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition-all flex flex-col h-full">
      <div className="flex gap-3 flex-1">
        <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200 grid place-items-center shrink-0">
          <Icon className="w-5 h-5 text-slate-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 leading-snug">{asset.name}</p>
          <p className="text-[11px] text-slate-500 mt-1">{asset.size} · {asset.date}</p>
          {asset.uploadedBy && (
            <p className="text-[10px] text-slate-400 mt-0.5 truncate">By {asset.uploadedBy}</p>
          )}
          <div className="mt-2">
            <Badge tone={TAG_TONE[asset.tag] || "muted"}>{asset.tag}</Badge>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
        <button
          type="button"
          onClick={() => onDownload(asset)}
          className={`${CARD_BTN} bg-rose-700 text-white border-rose-700 hover:bg-rose-800`}
        >
          <Download className="w-3.5 h-3.5" /> Download
        </button>
        <button
          type="button"
          onClick={() => onShare(asset)}
          className={`${CARD_BTN} bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-800`}
        >
          <Share2 className="w-3.5 h-3.5" /> Share
        </button>
      </div>
    </article>
  );
}

export default function EmployeeAssets() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cat, setCat] = useState("all");
  const [search, setSearch] = useState("");
  const [shareAsset, setShareAsset] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const res = await apiGet("/api/v1/assets", {
        headers: getCrmHeaders(),
        skipCache: true,
        cacheTtl: 0,
      });
      const rows = unwrapApiData(res);
      setAssets(Array.isArray(rows) ? rows.map(mapTeamAssetFromApi).filter(Boolean) : []);
    } catch {
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssets();
  }, []);

  const items = useMemo(() => {
    let list = cat === "all" ? assets : assets.filter((a) => a.cat === cat);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.tag.toLowerCase().includes(q) ||
          a.cat.toLowerCase().includes(q),
      );
    }
    return list;
  }, [cat, search, assets]);

  const stats = useMemo(() => ({
    total: assets.length,
    pdfs: assets.filter((a) => a.tag === "PDF").length,
    templates: assets.filter((a) => a.cat === "template" || a.cat === "proposal").length,
    recent: assets.filter((a) => a.date === "Today" || a.date === "Yesterday").length,
  }), [assets]);

  const shareUrl = shareAsset ? (shareAsset.downloadUrl || assetShareUrl(shareAsset)) : "";

  const handleDownload = async (asset) => {
    const href = asset.downloadUrl || assetDownloadUrl(asset.url);
    if (!href) {
      toast.error("Download link not available");
      return;
    }
    try {
      if (asset.tag === "TEXT" || asset.mime?.includes("text")) {
        const res = await fetch(href, { headers: getCrmHeaders() });
        const text = await res.text();
        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${asset.name}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const a = document.createElement("a");
        a.href = href;
        a.download = asset.name;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.click();
      }
      toast.success(`Downloaded ${asset.name}`);
    } catch {
      toast.error("Could not download asset");
    }
  };

  const handleShare = (asset) => {
    setShareAsset(asset);
  };

  const handleCreateAsset = async () => {
    if (!form.name.trim()) {
      toast.error("Asset name is required");
      return;
    }
    if (form.mode === "upload" && !form.file) {
      toast.error("Please select a file to upload");
      return;
    }
    if (form.mode === "text" && !form.text.trim()) {
      toast.error("Please add some text content");
      return;
    }

    setSaving(true);
    try {
      const headers = getCrmHeaders();

      if (form.mode === "upload") {
        const fd = new FormData();
        fd.append("file", form.file);
        fd.append("name", form.name.trim());
        fd.append("category", form.cat);
        const res = await apiPostForm("/api/v1/assets", fd, { headers });
        const saved = mapTeamAssetFromApi(unwrapApiData(res));
        if (saved) setAssets((prev) => [saved, ...prev]);
      } else {
        const res = await apiPost("/api/v1/assets", {
          name: form.name.trim(),
          category: form.cat,
          content: form.text.trim(),
        }, { headers });
        const saved = mapTeamAssetFromApi(unwrapApiData(res));
        if (saved) setAssets((prev) => [saved, ...prev]);
      }

      invalidateCache("/api/v1/assets");
      setDrawerOpen(false);
      toast.success("Asset shared with all employees");
    } catch (err) {
      toast.error(err?.message || "Failed to save asset");
    } finally {
      setSaving(false);
    }
  };

  const copyShareLink = () => {
    if (!shareAsset) return;
    navigator.clipboard?.writeText(shareUrl);
    toast.success("Share link copied");
  };

  const shareViaWhatsApp = () => {
    if (!shareAsset) return;
    const text = encodeURIComponent(`${shareAsset.name}\n${shareUrl}`);
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  };

  const shareViaEmail = () => {
    if (!shareAsset) return;
    const subject = encodeURIComponent(`Asset: ${shareAsset.name}`);
    const body = encodeURIComponent(`Hi,\n\nPlease find the asset here:\n${shareAsset.name}\n${shareUrl}\n\nThanks`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const tryNativeShare = async () => {
    if (!shareAsset || !navigator.share) {
      copyShareLink();
      return;
    }
    try {
      await navigator.share({ title: shareAsset.name, text: shareAsset.name, url: shareUrl });
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div className="space-y-3 sm:space-y-5 page-shell min-w-0 animate-fade-in">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
        <StatCard compact label="Total Assets" value={String(stats.total)} icon={FolderOpen} tone="primary" change="available" sub="" />
        <StatCard compact label="PDF Files" value={String(stats.pdfs)} icon={FileText} tone="success" change="documents" sub="" />
        <StatCard compact label="Templates" value={String(stats.templates)} icon={Layers} tone="info" change="proposals & more" sub="" />
        <StatCard compact label="Recently Added" value={String(stats.recent)} icon={Presentation} tone="success" change="this week" sub="" />
      </div>

      <GlassCard className="p-3 sm:p-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className={`${SEGMENT_WRAP} min-w-0 flex-1 overflow-x-auto scrollbar-none`}>
            {CATEGORIES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setCat(id)}
                className={`flex items-center gap-1 ${SEGMENT_BTN} ${
                  cat === id ? SEGMENT_BTN_ACTIVE : SEGMENT_BTN_INACTIVE
                }`}
              >
                <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                {label}
              </button>
            ))}
          </div>

          <div className="relative shrink-0 w-28 sm:w-44 md:w-52 lg:w-60 min-w-0">
            <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assets…"
              className="w-full h-9 sm:h-10 pl-8 sm:pl-9 pr-2 sm:pr-3 rounded-xl bg-white border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition"
            />
          </div>

          <BtnPrimary onClick={() => setDrawerOpen(true)} className="shrink-0 whitespace-nowrap !px-2.5 sm:!px-4">
            <Plus className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Add Asset</span>
            <span className="sm:hidden">Add</span>
          </BtnPrimary>
        </div>
      </GlassCard>

      {loading ? (
        <GlassCard className="p-10 text-center">
          <p className="text-sm text-slate-400">Loading team assets…</p>
        </GlassCard>
      ) : items.length === 0 ? (
        <GlassCard>
          <EmpEmptyState
            icon=""
            title="No assets found"
            subtitle={search ? "Try a different search or category" : "Upload an asset to share with everyone"}
          />
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map((a) => (
            <AssetCard key={a.id} asset={a} onDownload={handleDownload} onShare={handleShare} />
          ))}
        </div>
      )}

      <AddAssetDrawer
        open={drawerOpen}
        form={form}
        setForm={setForm}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleCreateAsset}
        saving={saving}
      />

      <EmpModal
        open={!!shareAsset}
        onClose={() => setShareAsset(null)}
        title="Share Asset"
        subtitle={shareAsset?.name}
        footer={
          <BtnSecondary onClick={() => setShareAsset(null)}>Close</BtnSecondary>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Share link</p>
            <p className="text-xs font-mono text-slate-700 break-all">{shareUrl}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={copyShareLink}
              className={`${CARD_BTN} w-full bg-rose-700 text-white border-rose-700 hover:bg-rose-800 !flex-none sm:col-span-2`}
            >
              <Copy className="w-4 h-4" /> Copy link
            </button>
            {typeof navigator !== "undefined" && navigator.share && (
              <BtnSecondary onClick={tryNativeShare} className="w-full !rounded-xl">
                <Share2 className="w-4 h-4" /> System share
              </BtnSecondary>
            )}
            <BtnSecondary onClick={shareViaWhatsApp} className="w-full !rounded-xl">
              WhatsApp
            </BtnSecondary>
            <BtnSecondary onClick={shareViaEmail} className="w-full !rounded-xl">
              <Mail className="w-4 h-4" /> Email
            </BtnSecondary>
          </div>
        </div>
      </EmpModal>
    </div>
  );
}
