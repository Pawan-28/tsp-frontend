import { Routes, Route, Navigate } from "react-router-dom";
import SourcesDashboard from "./sources/SourcesDashboard.jsx";
import SourceLeads from "./sources/SourceLeads.jsx";

/** Lead sources dashboard (Meta, Google, Website, etc.) — replaces legacy Forms section. */
export default function Sources() {
  return (
    <Routes>
      <Route index element={<SourcesDashboard />} />
      <Route path=":sourceKey" element={<SourceLeads />} />
      <Route path="*" element={<Navigate to="/sources" replace />} />
    </Routes>
  );
}
