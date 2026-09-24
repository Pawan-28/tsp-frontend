import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  GitBranch,
  Kanban,
  Users,
  Coins,
  Settings,
  BookUser,
  ClipboardList,
  Package,
  LogOut,
} from "lucide-react";
import { SidebarContext } from "../context/SidebarContext.js";
import { useAdmin } from "../context/AdminContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import {
  SIDEBAR_SHELL,
  SidebarLogo,
  SidebarHeader,
  SidebarSectionLabel,
  SidebarNavItem,
  SidebarProfileCard,
  SidebarCollapseHint,
  SidebarNav,
  SidebarFooter,
} from "./LightSidebar.jsx";
import TSPublicationDoodleLogo from "./TSPublicationDoodleLogo.jsx";
import AdminDoodleAvatar from "./AdminDoodleAvatar.jsx";

const items = [
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

export default function Sidebar({ open, onClose, collapsed, onToggleCollapse }) {
  const [hovered, setHovered] = useState(false);
  const { admin } = useAdmin();
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const isExpanded = !collapsed || hovered;

  return (
    <SidebarContext.Provider value={{ collapsed: !isExpanded }}>
      {open && (
        <div onClick={onClose} className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] lg:hidden" />
      )}

      <aside
        onMouseEnter={() => collapsed && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`${SIDEBAR_SHELL} ${isExpanded ? "w-[260px]" : "w-[68px]"} ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <SidebarHeader
          isExpanded={isExpanded}
          onClose={onClose}
          onToggleCollapse={onToggleCollapse}
          collapsed={collapsed}
        >
          <SidebarLogo
            to="/"
            onNavigate={onClose}
            isExpanded={isExpanded}
            logo={<TSPublicationDoodleLogo size={36} showBackground={false} />}
            title="TS Publication"
            subtitle="Admin dashboard"
          />
        </SidebarHeader>

        <SidebarNav>
          <SidebarSectionLabel isExpanded={isExpanded}>Menu</SidebarSectionLabel>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onClose}
                className="block group"
              >
                {({ isActive }) => (
                  <SidebarNavItem isActive={isActive} isExpanded={isExpanded} icon={Icon} label={item.label} />
                )}
              </NavLink>
            );
          })}
        </SidebarNav>

        <SidebarFooter>
          <SidebarProfileCard
            isExpanded={isExpanded}
            onClick={() => { navigate("/admin"); onClose(); }}
            name={admin.fullName}
            role={admin.role}
            title={`${admin.fullName} — ${admin.role}`}
            avatar={<AdminDoodleAvatar size={32} shape="circle" photoUrl={user?.avatarUrl || admin.avatarUrl} />}
            onSignOut={() => { logout(); onClose(); navigate("/login", { replace: true }); }}
          />
        </SidebarFooter>

        <SidebarCollapseHint show={collapsed && !hovered} />
      </aside>
    </SidebarContext.Provider>
  );
}
