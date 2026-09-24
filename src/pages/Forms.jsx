import { Routes, Route, Navigate, useParams } from "react-router-dom";
import FormsDashboard from "./forms/FormsDashboard.jsx";
import FormLeads from "./forms/FormLeads.jsx";

function EditFormRedirect() {
  const { formId } = useParams();
  return <Navigate to={`/forms?action=editForm&formId=${formId}`} replace />;
}

export default function Forms() {
  return (
    <Routes>
      <Route index element={<FormsDashboard />} />
      <Route path="new" element={<Navigate to="/forms?action=createForm" replace />} />
      <Route path=":formId/edit" element={<EditFormRedirect />} />
      <Route path=":formId" element={<FormLeads />} />
      <Route path="*" element={<Navigate to="/forms" replace />} />
    </Routes>
  );
}
