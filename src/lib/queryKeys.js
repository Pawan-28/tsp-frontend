export const queryKeys = {
  employees: ["employees"],
  employeeLeads: (name) => ["employee-leads", name],
  teamChart: (range) => ["team-chart", range],
  teamKpis: (range) => ["team-kpis", range],
  sops: ["sops"],
  salesLeads: ["sales-leads"],
  salesEmpLeads: ["sales-emp-leads"],
  pipelineStats: ["pipeline-stats"],
  leads: ["leads"],
  activities: ["activities"],
  notifications: ["notifications"],
  activitySearch: (q) => ["activity-search", q],
};
