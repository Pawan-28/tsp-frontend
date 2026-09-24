import { useEffect, useMemo, useState } from "react";
import { Drawer } from "../Primitives.jsx";
import LeadDetailPanel from "../leads/LeadDetailPanel.jsx";
import {
  apiLeadToPipeline,
  fetchLeadForPipelineCard,
  normalizeLeadForDetailPanel,
  resolvePipelineCardLeadLocal,
  adminPipelineIdToDbStage,
} from "../../lib/leadSync.js";
import { getAdminCrmHeaders } from "../../lib/crmContext.js";
import { getStageMeta } from "../../data/pipelineMock.js";
import { mapStageToId } from "../../lib/pipelineStages.js";
import { apiPatch } from "../../lib/api.js";

export default function PipelineLeadDrawer({ open, onClose, lead, calls = [], onMoveStage }) {
  const [resolvedLead, setResolvedLead] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!lead) {
      setResolvedLead(null);
      setLoadingDetail(false);
      return undefined;
    }

    const local = resolvePipelineCardLeadLocal(lead, { leads: [], periodCalls: calls });
    setResolvedLead((prev) => (prev?.id === local?.id && prev?.stage === local?.stage ? prev : local));

    const crmId = local?._dbId ?? local?.id;
    const hasLocalCrm = /^\d+$/.test(String(crmId));
    const needsFetch = Boolean(lead._fromCall) && !hasLocalCrm;

    if (!needsFetch) {
      setLoadingDetail(false);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      setLoadingDetail(true);
      try {
        const fetched = await fetchLeadForPipelineCard(lead, {
          periodCalls: calls,
          headers: getAdminCrmHeaders(),
          mapLead: apiLeadToPipeline,
        });
        if (!cancelled) setResolvedLead(fetched);
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();

    return () => { cancelled = true; };
  }, [lead, calls]);

  const liveLead = useMemo(
    () => normalizeLeadForDetailPanel(resolvedLead || lead),
    [resolvedLead, lead],
  );

  if (!lead) return null;

  const crmId = liveLead?._dbId ?? (/^\d+$/.test(String(liveLead?.id)) ? liveLead.id : null);
  const editLeadsHref = crmId ? `/leads?leadId=${crmId}` : null;

  const handleStageSelect = (stageLabel) => {
    const leadId = liveLead?._dbId ?? liveLead?.id ?? lead?.id;
    if (!leadId) return;
    const targetStageId = mapStageToId(stageLabel) || getStageMeta(stageLabel)?.id || "lead";
    if (onMoveStage) {
      onMoveStage(leadId, targetStageId, { scroll: false });
    }
  };

  const handleSave = async (updates) => {
    const leadId = liveLead?._dbId ?? liveLead?.id ?? lead?.id;
    if (!leadId) return;
    if (updates.stage || updates.pipelineStage) {
      const stageLabel = updates.pipelineStage || updates.stage;
      handleStageSelect(stageLabel);
      if (crmId && String(crmId).match(/^\d+$/)) {
        const stageMeta = getStageMeta(stageLabel);
        const dbStage = adminPipelineIdToDbStage(stageMeta?.id || mapStageToId(stageLabel));
        apiPatch(`/api/v1/leads/${crmId}/stage`, { stage: dbStage, status: dbStage }, {
          headers: getAdminCrmHeaders(),
        }).catch(() => {});
      }
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title={liveLead?.name || "Lead Details"}>
      {loadingDetail && !crmId ? (
        <p className="text-sm text-slate-400 text-center py-8">Loading lead details…</p>
      ) : liveLead ? (
        <LeadDetailPanel
          liveLead={liveLead}
          variant="admin"
          showReassignment={false}
          readOnly={false}
          pipelineView
          editLeadsHref={editLeadsHref}
          onStageChange={handleStageSelect}
          onSave={handleSave}
          onClose={onClose}
          calls={calls}
        />
      ) : (
        <p className="text-sm text-slate-400 text-center py-8">No CRM lead found for this number.</p>
      )}
    </Drawer>
  );
}
