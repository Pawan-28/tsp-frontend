import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { apiPostForm } from "../lib/api.js";
import { assetDownloadUrl } from "../lib/teamAssets.js";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/** Small camera-icon overlay button — pick an image, upload it, hand back the resolved URL. */
export default function AvatarUploadButton({ onUploaded, headers, className = "" }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Image must be under 5MB");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("entityType", "avatar");

    setUploading(true);
    try {
      const res = await apiPostForm("/api/v1/files/upload", formData, { headers });
      const url = res?.data?.url || res?.url;
      if (!url) throw new Error("Upload did not return a file URL");
      onUploaded(assetDownloadUrl(url));
      toast.success("Photo updated");
    } catch (err) {
      toast.error(err.message || "Could not upload photo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title="Change photo"
        className={`absolute grid place-items-center bg-white text-[#be123c] border border-rose-200 rounded-full shadow-sm hover:bg-rose-50 transition disabled:opacity-60 ${className}`}
      >
        {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
      </button>
    </>
  );
}
