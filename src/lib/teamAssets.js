import { apiUrl } from "./api.js";

export function tagFromMime(mime = "", filename = "") {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (mime.includes("pdf") || ext === "pdf") return "PDF";
  if (mime.includes("spreadsheet") || ["xlsx", "xls", "csv"].includes(ext)) return "Excel";
  if (mime.includes("word") || ["docx", "doc"].includes(ext)) return "DOCX";
  if (mime.includes("presentation") || ["pptx", "ppt"].includes(ext)) return "PPT";
  if (mime.includes("text") || ext === "txt") return "TEXT";
  return ext ? ext.toUpperCase() : "FILE";
}

export function formatAssetDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startToday - startThat) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function mapTeamAssetFromApi(row) {
  if (!row) return null;
  const name = row.originalName || row.original_name || row.filename || "Asset";
  const cat = row.entityId || row.entity_id || "brochure";
  const url = row.url || "";
  return {
    id: row.id,
    name,
    cat,
    size: formatFileSize(row.size),
    sizeBytes: Number(row.size) || 0,
    date: formatAssetDate(row.createdAt || row.created_at),
    tag: tagFromMime(row.mime, name),
    url,
    downloadUrl: assetDownloadUrl(url),
    uploadedBy: row.uploadedBy || row.uploaded_by || "Team",
    mime: row.mime || "",
  };
}

export function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function assetDownloadUrl(path) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return apiUrl(path);
}

export function tagFromFile(file) {
  return tagFromMime(file?.type, file?.name);
}
