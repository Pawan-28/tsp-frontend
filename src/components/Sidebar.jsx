import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { History } from "lucide-react";
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
import Avatar from "./Avatar.jsx";
import { useDismissable } from "../hooks/useDismissable.js";
import { openHeaderPopover } from "../hooks/useHeaderPopover.js";
import { ADMIN_NAV_ITEMS, ADMIN_QUICK_ACTIONS } from "../lib/adminNav.js";

const items = ADMIN_NAV_ITEMS;

export default function Sidebar({ open, onClose, collapsed, onToggleCollapse }) {
  const [hovered, setHovered] = useState(false);
  const { admin } = useAdmin();
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const isExpanded = !collapsed || hovered;

  // Esc closes the mobile drawer.
  useDismissable({ open, onDismiss: onClose, outside: false });

  return (
    <SidebarContext.Provider value={{ collapsed: !isExpanded }}>
      {open && (
        <div onClick={onClose} aria-hidden className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-[2px] lg:hidden" />
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

          {/* Phones only: the header Quick Actions / History buttons live here too. */}
          <div className="lg:hidden pt-3">
            <SidebarSectionLabel isExpanded={isExpanded}>Quick actions</SidebarSectionLabel>
            {ADMIN_QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => { onClose(); navigate(`${action.to}${action.search ?? ""}`); }}
                  className="w-full text-left"
                >
                  <SidebarNavItem isActive={false} isExpanded={isExpanded} icon={Icon} label={action.label} />
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => { onClose(); openHeaderPopover("activity"); }}
              className="w-full text-left"
            >
              <SidebarNavItem isActive={false} isExpanded={isExpanded} icon={History} label="Recent Activity" />
            </button>
          </div>
        </SidebarNav>

        <SidebarFooter>
          <SidebarProfileCard
            isExpanded={isExpanded}
            onClick={() => { navigate("/admin"); onClose(); }}
            name={admin.fullName}
            role={admin.role}
            title={`${admin.fullName} — ${admin.role}`}
            avatar={<Avatar size={32} shape="circle" src={user?.avatarUrl || admin.avatarUrl} name={admin.fullName || user?.name} />}
            onSignOut={() => { logout(); onClose(); navigate("/login", { replace: true }); }}
          />
        </SidebarFooter>

        <SidebarCollapseHint show={collapsed && !hovered} />
      </aside>
    </SidebarContext.Provider>
  );
}
