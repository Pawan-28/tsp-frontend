import {
  LayoutDashboard, FileText, GitBranch, Users, BookUser, Coins,
} from "lucide-react";
import BottomNavShell, { BottomNavItem } from "./BottomNavShell.jsx";

const items = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/sales", label: "Sales", icon: GitBranch },
  { to: "/team", label: "Team", icon: BookUser },
  { to: "/sop", label: "SOP", icon: FileText },
  { to: "/incentives", label: "Pay", icon: Coins },
];

export default function MobileNav() {
  return (
    <BottomNavShell label="Admin navigation">
      {items.map((i) => (
        <BottomNavItem key={i.to} {...i} />
      ))}
    </BottomNavShell>
  );
}
