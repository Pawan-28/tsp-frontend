import axiosClient from "./axiosClient.js";

const DASHBOARD_BASE = "/api/dashboard";

export const dashboardService = {
  getOverview: () => axiosClient.get(DASHBOARD_BASE).then((res) => res.data),

  getRevenue: () => axiosClient.get(`${DASHBOARD_BASE}/revenue`).then((res) => res.data),

  getPipeline: () => axiosClient.get(`${DASHBOARD_BASE}/pipeline`).then((res) => res.data),

  getRecentLeads: () => axiosClient.get(`${DASHBOARD_BASE}/leads/recent`).then((res) => res.data),

  getLeadById: (id) =>
    axiosClient.get(`${DASHBOARD_BASE}/leads/${id}`).then((res) => res.data),
};
