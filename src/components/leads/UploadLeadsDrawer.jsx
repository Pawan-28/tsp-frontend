import { useState, useRef } from "react";
import { 
  Upload, FileSpreadsheet, AlertTriangle, 
  CheckCircle2, Info, X, HelpCircle 
} from "lucide-react";
import { Drawer } from "../Primitives.jsx";
import { apiPostForm, invalidateCache } from "../../lib/api.js";
import { getAdminCrmHeaders } from "../../lib/crmContext.js";

export default function UploadLeadsDrawer({ open, onClose, showToast, onUploadSuccess }) {
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSetFile(droppedFile);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile) => {
    const ext = selectedFile.name.split(".").pop().toLowerCase();
    if (["xlsx", "xls", "csv"].includes(ext)) {
      setFile(selectedFile);
      setResult(null);
    } else {
      showToast("Invalid file type. Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.", "error");
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current.click();
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await apiPostForm("/api/v1/leads/bulk-upload", formData, {
        headers: getAdminCrmHeaders(),
      });

      if (res && res.success) {
        setResult(res);
        invalidateCache("/api/v1");
        showToast(`Successfully processed ${res.successCount} leads!`);
        if (onUploadSuccess) onUploadSuccess();
      } else {
        throw new Error(res?.message || "Failed to upload leads");
      }
    } catch (err) {
      console.error("Bulk upload error:", err);
      showToast(err.message || "Failed to process the spreadsheet.", "error");
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setResult(null);
    setLoading(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <Drawer open={open} onClose={handleClose} title="Upload Lead Spreadsheet">
      <div className="space-y-4 max-h-[82vh] overflow-y-auto scrollbar-thin px-1">
        
        {/* Toggleable Instructions / Parameter Help */}
        <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-3">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowHelp(!showHelp)}>
            <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
              <HelpCircle size={14} className="text-rose-500" />
              <span>How should I format my spreadsheet?</span>
            </div>
            <button type="button" className="text-[10px] text-rose-600 font-semibold hover:underline">
              {showHelp ? "Hide Fields" : "View Supported Columns"}
            </button>
          </div>
          
          {showHelp && (
            <div className="mt-3 space-y-2 text-slate-600 text-[11px] leading-relaxed border-t border-rose-100/50 pt-2.5">
              <p>Your spreadsheet should contain columns with headers matching the fields below. Row header mapping is case-insensitive and ignores spaces/underscores (e.g. <code>Lead Name</code>, <code>lead_name</code>, or <code>name</code> are all mapped correctly).</p>
              
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="bg-white/60 p-2 rounded-lg border border-rose-100/30">
                  <span className="font-bold text-rose-700">Lead Name</span> <span className="text-[9px] text-red-500 font-bold">(Required)</span>
                  <p className="text-[10px] text-slate-500">e.g. Rajesh Mehta</p>
                </div>
                <div className="bg-white/60 p-2 rounded-lg border border-rose-100/30">
                  <span className="font-bold text-slate-800">Phone</span> <span className="text-[9px] text-slate-400">(Recommended)</span>
                  <p className="text-[10px] text-slate-500">e.g. +919876543210</p>
                </div>
                <div className="bg-white/60 p-2 rounded-lg border border-rose-100/30">
                  <span className="font-bold text-slate-800">Email</span>
                  <p className="text-[10px] text-slate-500">e.g. contact@domain.com</p>
                </div>
                <div className="bg-white/60 p-2 rounded-lg border border-rose-100/30">
                  <span className="font-bold text-slate-800">Service</span> <span className="text-[9px] text-slate-400">(Recommended)</span>
                  <p className="text-[10px] text-slate-500">e.g. AI Automation Suite</p>
                </div>
                <div className="bg-white/60 p-2 rounded-lg border border-rose-100/30">
                  <span className="font-bold text-slate-800">Source</span> <span className="text-[9px] text-slate-400">(Recommended)</span>
                  <p className="text-[10px] text-slate-500">e.g. LinkedIn, Facebook</p>
                </div>
                <div className="bg-white/60 p-2 rounded-lg border border-rose-100/30">
                  <span className="font-bold text-slate-800">Expected Revenue</span>
                  <p className="text-[10px] text-slate-500">e.g. 500000</p>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Other supported columns: <code>Company Name</code>, <code>City</code>, <code>Temperature</code>, <code>Pipeline Stage</code>, <code>Win Probability</code>, and <code>Notes</code>.</p>
            </div>
          )}
        </div>

        {/* Upload State / Dragzone */}
        {!result && !loading && (
          <div 
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-6 transition-all text-center flex flex-col items-center justify-center min-h-[220px] ${
              dragActive 
                ? "border-rose-500 bg-rose-50/50 scale-[1.01]" 
                : "border-rose-200 hover:border-rose-400 bg-white"
            }`}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange}
              accept=".xlsx,.xls,.csv"
              className="hidden"
            />
            
            {file ? (
              <div className="space-y-3">
                <div className="p-3 bg-rose-50 rounded-2xl inline-flex text-rose-500">
                  <FileSpreadsheet size={32} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 truncate max-w-[280px] mx-auto">{file.name}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{formatSize(file.size)}</p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button 
                    type="button" 
                    onClick={resetState}
                    className="h-8 px-3 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition"
                  >
                    Clear File
                  </button>
                  <button 
                    type="button" 
                    onClick={handleUpload}
                    className="h-8 px-4 rounded-lg gradient-primary text-white text-xs font-bold shadow-glow hover:opacity-95 transition"
                  >
                    Upload & Process
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3.5 bg-rose-50 rounded-2xl inline-flex text-rose-400 hover:scale-110 transition-transform cursor-pointer" onClick={triggerFileSelect}>
                  <Upload size={28} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700">Drag & drop your lead sheet here</p>
                  <p className="text-[10px] text-slate-400 mt-1">or click to browse local files</p>
                </div>
                <button 
                  type="button" 
                  onClick={triggerFileSelect}
                  className="h-7.5 px-3 rounded-lg border border-rose-200 text-rose-700 text-[10px] font-bold hover:bg-rose-50 transition"
                >
                  Choose Excel / CSV File
                </button>
              </div>
            )}
          </div>
        )}

        {/* Loading / Processing State */}
        {loading && (
          <div className="border border-rose-100 rounded-2xl bg-white p-8 text-center flex flex-col items-center justify-center min-h-[220px] space-y-4">
            <div className="w-10 h-10 border-4 border-rose-200 border-t-rose-600 rounded-full animate-spin"></div>
            <div>
              <p className="text-xs font-bold text-slate-800">Processing Lead Sheet...</p>
              <p className="text-[10px] text-slate-400 mt-1">Parsing rows, creating leads, and assigning to team members.</p>
            </div>
          </div>
        )}

        {/* Results Screen */}
        {result && (
          <div className="space-y-3.5">
            {/* Header Summary */}
            <div className="border border-rose-100 rounded-2xl bg-rose-50/20 p-4 text-center space-y-2">
              <div className="mx-auto inline-flex text-green-500">
                <CheckCircle2 size={32} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">Import Complete</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Your spreadsheet has been parsed and processed.</p>
              </div>
              
              <div className="grid grid-cols-3 gap-2 pt-2.5 max-w-[280px] mx-auto">
                <div className="bg-white p-2 rounded-xl border border-rose-100/50">
                  <span className="block text-slate-800 text-sm font-bold">{result.total}</span>
                  <span className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">Total Rows</span>
                </div>
                <div className="bg-white p-2 rounded-xl border border-rose-100/50">
                  <span className="block text-green-600 text-sm font-bold">{result.successCount}</span>
                  <span className="text-[8px] uppercase tracking-wider text-green-500 font-bold">Uploaded</span>
                </div>
                <div className="bg-white p-2 rounded-xl border border-rose-100/50">
                  <span className="block text-red-600 text-sm font-bold">{result.errorCount}</span>
                  <span className="text-[8px] uppercase tracking-wider text-red-400 font-bold">Failed</span>
                </div>
              </div>
            </div>

            {/* Detailed Row Errors (If Any) */}
            {result.errorCount > 0 && (
              <div className="border border-red-100 rounded-2xl bg-white overflow-hidden">
                <div className="px-3.5 py-2.5 border-b border-red-50 bg-red-50/30 flex items-center gap-1.5 text-red-800">
                  <AlertTriangle size={13} className="text-red-500" />
                  <span className="text-[11px] font-bold">Failed Rows ({result.errorCount})</span>
                </div>
                <div className="max-h-[160px] overflow-y-auto divide-y divide-red-50 p-1.5 space-y-1 scrollbar-thin">
                  {result.errors.map((err, idx) => (
                    <div key={idx} className="p-2 text-[10px] text-slate-600 flex items-start gap-2 bg-red-50/10 rounded-lg">
                      <span className="font-bold text-red-700 shrink-0">Row {err.rowNum}:</span>
                      <span className="flex-1 leading-normal">{err.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2">
              <button 
                type="button" 
                onClick={resetState}
                className="flex-1 h-8 rounded-lg border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-50 transition"
              >
                Upload Another
              </button>
              <button 
                type="button" 
                onClick={handleClose}
                className="flex-1 h-8 rounded-lg gradient-primary text-white text-xs font-bold shadow-glow hover:opacity-95 transition"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
