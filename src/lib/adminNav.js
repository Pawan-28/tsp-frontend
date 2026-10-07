import {
  LayoutDashboard, FileText, GitBranch, Kanban, Users, Coins, Settings,
  BookUser, ClipboardList, Package, Plus, Calculator,
} from "lucide-react";

/** Every admin module. Used by the sidebar / mobile drawer (single source of truth). */
export const ADMIN_NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/sop", label: "SOP Management", icon: FileText },
  { to: "/sales", label: "Sales Funnel", icon: GitBranch },
  { to: "/pipeline", label: "Pipeline", icon: Kanban },
  { to: "/leads", label: "Leads Assign", icon: Users },
  { to: "/sources", label: "Source", icon: ClipboardList },
  { to: "/services", label: "Services", icon: Package },
  { to: "/team", label: "Team Management", icon: BookUser },
  { to: "/incentives", label: "Incentives", icon: Coins },
  { to: "/settings", label: "Settings", icon: Settings },
];

/** Header "Quick Actions" menu; also listed in the mobile drawer (the header button is hidden on phones). */
export const ADMIN_QUICK_ACTIONS = [
  { label: "Add Lead", icon: Plus, to: "/sales", search: "?action=addLead" },
  { label: "Add SOP", icon: FileText, to: "/sop", search: "?action=addSOP" },
  { label: "Add New Team Member", icon: Users, to: "/team", search: "?action=addMember" },
  { label: "View Sources", icon: FileText, to: "/sources" },
  { label: "Calculate Incentive", icon: Calculator, to: "/incentives" },
];
