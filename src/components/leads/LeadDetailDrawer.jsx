import { useMemo } from "react";
import { Drawer } from "../Primitives.jsx";
import LeadDetailPanel from "./LeadDetailPanel.jsx";
import { normalizeLeadForDetailPanel } from "../../lib/leadSync.js";

export default function LeadDetailDrawer({
  open,
  onClose,
  lead,
  calls = [],
  editable = false,
  onSave,
}) {
  const liveLead = useMemo(() => normalizeLeadForDetailPanel(lead), [lead]);

  if (!lead) return null;

  return (
    <Drawer open={open} onClose={onClose} title={liveLead?.name || "Lead Details"}>
      <LeadDetailPanel
        liveLead={liveLead}
        variant="admin"
        showReassignment={false}
        readOnly={!editable}
        onSave={editable ? onSave : undefined}
        onClose={onClose}
        calls={calls}
      />
    </Drawer>
  );
}
