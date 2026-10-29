import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import BeachAccessOutlinedIcon from "@mui/icons-material/BeachAccessOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";
import EventNoteOutlinedIcon from "@mui/icons-material/EventNoteOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import GavelOutlinedIcon from "@mui/icons-material/TuneOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import ListAltOutlinedIcon from "@mui/icons-material/ListAltOutlined";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import PeopleOutlineOutlinedIcon from "@mui/icons-material/PeopleOutlineOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import type { Role } from "@/domain/types";

export const ROLE_LABEL: Record<Role, string> = {
  employee: "Employee",
  manager: "Manager",
  hr: "HR Administrator",
  sysadmin: "System Administrator",
};

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badgeKey?: "unread" | "approvals";
  keywords?: string;
}

export function navSections(role: Role): { title: string; items: NavItem[] }[] {
  const sections: { title: string; items: NavItem[] }[] = [
    {
      title: "My leave",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: <DashboardOutlinedIcon />, keywords: "home overview balance" },
        { href: "/plan", label: "Annual plan", icon: <EventNoteOutlinedIcon />, keywords: "master leave plan amendment" },
        { href: "/requests/new", label: "Request leave", icon: <BeachAccessOutlinedIcon />, keywords: "new time off book holiday" },
        { href: "/requests", label: "My requests", icon: <ListAltOutlinedIcon />, keywords: "history cancel status" },
        { href: "/calendar", label: "Calendar", icon: <CalendarMonthOutlinedIcon />, keywords: "capacity wallchart team schedule" },
        { href: "/notifications", label: "Notifications", icon: <NotificationsOutlinedIcon />, badgeKey: "unread", keywords: "inbox alerts" },
      ],
    },
  ];
  if (role === "manager" || role === "hr") {
    sections.push({ title: "Manage", items: [{ href: "/approvals", label: "Approvals", icon: <FactCheckOutlinedIcon />, badgeKey: "approvals", keywords: "approve reject review inbox" }] });
  }
  if (role === "hr") {
    sections.push({
      title: "HR administration",
      items: [
        { href: "/hr/employees", label: "Employees", icon: <PeopleOutlineOutlinedIcon />, keywords: "staff profiles category" },
        { href: "/hr/roster", label: "Annual roster", icon: <TableChartOutlinedIcon />, keywords: "master roster capacity" },
        { href: "/hr/reports", label: "Reports", icon: <AssessmentOutlinedIcon />, keywords: "export csv excel" },
        { href: "/hr/policy", label: "Policy settings", icon: <GavelOutlinedIcon />, keywords: "rules holidays routing entitlement" },
        { href: "/audit", label: "Audit trail", icon: <HistoryOutlinedIcon />, keywords: "log history" },
      ],
    });
  }
  if (role === "sysadmin") {
    sections.push({
      title: "System",
      items: [
        { href: "/admin", label: "User access", icon: <AdminPanelSettingsOutlinedIcon />, keywords: "roles sessions password" },
        { href: "/audit", label: "Audit trail", icon: <HistoryOutlinedIcon />, keywords: "log history" },
      ],
    });
  }
  sections.push({ title: "Account", items: [{ href: "/account", label: "Account", icon: <PersonOutlineOutlinedIcon />, keywords: "password profile theme dark" }] });
  return sections;
}

export function isActive(pathname: string, href: string) {
  if (href === "/requests") return pathname === "/requests";
  return pathname === href || pathname.startsWith(href + "/");
}

export function titleFor(pathname: string, role: Role): string {
  for (const s of navSections(role)) for (const i of s.items) if (isActive(pathname, i.href)) return i.label;
  return "";
}
