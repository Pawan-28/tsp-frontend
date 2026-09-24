import {
  LayoutDashboard, CheckSquare, Users, FileText, Phone, MessageSquare,
} from "lucide-react";
import BottomNavShell, { BottomNavItem } from "../../components/BottomNavShell.jsx";

const items = [
  { to: "/employee", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/employee/leads", label: "Leads", icon: Users },
  { to: "/employee/calls", label: "Calls", icon: Phone },
  { to: "/employee/follow-ups", label: "Follow", icon: MessageSquare },
  { to: "/employee/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/employee/sales-process", label: "SOP", icon: FileText },
];

export default function EmployeeMobileNav() {
  return (
    <BottomNavShell label="Employee navigation">
      {items.map((i) => (
        <BottomNavItem key={i.to} {...i} />
      ))}
    </BottomNavShell>
  );
}
