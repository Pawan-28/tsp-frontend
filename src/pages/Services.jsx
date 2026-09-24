import { Routes, Route, Navigate } from "react-router-dom";
import ServicesDashboard from "./services/ServicesDashboard.jsx";
import ServiceDetail from "./services/ServiceDetail.jsx";
import ServiceEdit from "./services/ServiceEdit.jsx";

export default function Services() {
  return (
    <Routes>
      <Route index element={<ServicesDashboard />} />
      <Route path=":serviceId/edit" element={<ServiceEdit />} />
      <Route path=":serviceId" element={<ServiceDetail />} />
      <Route path="*" element={<Navigate to="/services" replace />} />
    </Routes>
  );
}
