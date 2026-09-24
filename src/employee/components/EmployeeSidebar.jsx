import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, CheckSquare, MessageSquare, Phone, Users, FileText,
  Download, Calendar, LogOut, MessagesSquare,
} from "lucide-react";
import { SidebarContext } from "../../context/SidebarContext.js";
import { useAuth } from "../../context/AuthContext.jsx";
import EmployeeDoodleAvatar from "./EmployeeDoodleAvatar.jsx";
import EmployeePanelDoodleLogo from "./EmployeePanelDoodleLogo.jsx";
import { useEmployee } from "../../context/EmployeeContext.jsx";
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
} from "../../components/LightSidebar.jsx";

const NAV = [
  { to: "/employee", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/employee/tasks", label: "My Tasks", icon: CheckSquare },
  { to: "/employee/follow-ups", label: "Follow-Up", icon: MessageSquare },
  { to: "/employee/whatsapp-scripts", label: "WhatsApp Scripts", icon: MessagesSquare },
  { to: "/employee/calls", label: "Call Reporting", icon: Phone },
  { to: "/employee/leads", label: "Leads", icon: Users },
  { to: "/employee/sales-process", label: "Sales Process", icon: FileText },
  { to: "/employee/assets", label: "Assets", icon: Download },
  { to: "/employee/meetings", label: "Meetings", icon: Calendar },
];

export default function EmployeeSidebar({ open, onClose, collapsed, onToggleCollapse }) {
  const [hovered, setHovered] = useState(false);
  const { employee } = useEmployee();
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const isExpanded = !collapsed || hovered;

  return (
    <SidebarContext.Provider value={{ collapsed: !isExpanded }}>
      {open && <div onClick={onClose} className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] lg:hidden" />}

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
            to="/employee"
            onNavigate={onClose}
            isExpanded={isExpanded}
            logo={<EmployeePanelDoodleLogo size={36} showBackground={false} />}
            title="Employee Panel"
            subtitle="LRMS · Sales workspace"
          />
        </SidebarHeader>

        <SidebarNav>
          <SidebarSectionLabel isExpanded={isExpanded}>Menu</SidebarSectionLabel>
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end={item.end} onClick={onClose} className="block group">
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
            onClick={() => { navigate("/employee/profile"); onClose(); }}
            name={employee.name}
            role={employee.role}
            title={employee.name}
            avatar={<EmployeeDoodleAvatar size={32} shape="circle" photoUrl={user?.avatarUrl || employee?.avatarUrl} />}
            onSignOut={() => { logout(); onClose(); navigate("/login", { replace: true }); }}
          />
        </SidebarFooter>

        <SidebarCollapseHint show={collapsed && !hovered} />
      </aside>
    </SidebarContext.Provider>
  );
}
