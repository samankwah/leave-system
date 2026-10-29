"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import AppBar from "@mui/material/AppBar";
import Avatar from "@mui/material/Avatar";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardDoubleArrowLeftIcon from "@mui/icons-material/KeyboardDoubleArrowLeft";
import KeyboardDoubleArrowRightIcon from "@mui/icons-material/KeyboardDoubleArrowRight";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import SearchIcon from "@mui/icons-material/Search";
import type { Role } from "@/domain/types";
import { api } from "@/lib/client";
import { NAV_COOKIE } from "@/lib/constants";
import { initials } from "@/lib/format";
import ColorModeSwitch from "./ColorModeSwitch";
import CommandPalette from "./CommandPalette";
import NotificationBell from "./NotificationBell";
import { ROLE_LABEL, isActive, navSections, titleFor } from "./nav";

export { ROLE_LABEL } from "./nav";

const WIDE = 248;
const RAIL = 72;

export interface ShellUser { fullName: string; employeeId: string; role: Role; departmentName: string | null }

function BrandMark({ compact }: { compact?: boolean }) {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", minWidth: 0 }}>
      <Box sx={{
        width: 34, height: 34, borderRadius: 2, flexShrink: 0, display: "grid", placeItems: "center",
        bgcolor: "sidebar.accent", color: "#1A1405", fontWeight: 800, fontSize: "0.9375rem", letterSpacing: "-0.02em",
      }} aria-hidden>
        LM
      </Box>
      {!compact && (
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: "0.9375rem", lineHeight: 1.2, color: "sidebar.text" }} noWrap>Leave Management</Typography>
          <Typography sx={{ fontSize: "0.71875rem", color: "sidebar.muted" }} noWrap>GRA · prototype</Typography>
        </Box>
      )}
    </Stack>
  );
}

export default function AppShell({ user, unread, pendingApprovals, initialCollapsed, children }: {
  user: ShellUser; unread: number; pendingApprovals: number; initialCollapsed: boolean; children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [palette, setPalette] = useState(false);
  const [banner, setBanner] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const badges = { unread, approvals: pendingApprovals };
  const title = titleFor(pathname, user.role);

  useEffect(() => {
    try { setBanner(localStorage.getItem("gra_banner_dismissed") !== "1"); } catch { setBanner(true); }
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${NAV_COOKIE}=${next ? 1 : 0}; path=/; max-age=31536000; samesite=lax`;
  }

  function dismissBanner() {
    setBanner(false);
    try { localStorage.setItem("gra_banner_dismissed", "1"); } catch { /* storage unavailable */ }
  }

  async function signOut() {
    setAnchor(null);
    await api("/api/auth/logout").catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  const width = collapsed ? RAIL : WIDE;

  const nav = (rail: boolean) => (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", bgcolor: "sidebar.bg", color: "sidebar.text" }}>
      <Box sx={{ px: rail ? 2.25 : 2.5, height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/dashboard" style={{ textDecoration: "none", minWidth: 0 }} aria-label="Leave Management home"><BrandMark compact={rail} /></Link>
        {!rail && (
          <IconButton size="small" onClick={() => setMobileOpen(false)} sx={{ display: { md: "none" }, color: "sidebar.muted" }} aria-label="Close navigation">
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
      <Box component="nav" aria-label="Main" sx={{ overflowY: "auto", overflowX: "hidden", flex: 1, px: 1.5, pb: 2 }}>
        {navSections(user.role).filter((s) => s.title !== "Account").map((s) => (
          <Box key={s.title} sx={{ mt: 2 }}>
            {rail ? <Divider sx={{ borderColor: "sidebar.border", mx: 1, mb: 1 }} /> : (
              <Typography sx={{ px: 1.5, mb: 0.5, fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "sidebar.muted" }}>
                {s.title}
              </Typography>
            )}
            {s.items.map((i) => {
              const active = isActive(pathname, i.href);
              const count = i.badgeKey ? badges[i.badgeKey] : 0;
              const item = (
                <ButtonBase
                  key={i.href} component={Link} href={i.href} onClick={() => setMobileOpen(false)}
                  aria-current={active ? "page" : undefined}
                  sx={{
                    position: "relative", width: "100%", justifyContent: rail ? "center" : "flex-start", gap: 1.5,
                    px: rail ? 0 : 1.5, height: 40, mb: 0.25, borderRadius: 2, color: active ? "sidebar.text" : "sidebar.muted",
                    bgcolor: active ? "sidebar.active" : "transparent", fontSize: "0.875rem", fontWeight: active ? 600 : 500,
                    transition: "background-color .15s, color .15s",
                    "&:hover": { bgcolor: active ? "sidebar.active" : "sidebar.hover", color: "sidebar.text" },
                    "&::before": active ? { content: '""', position: "absolute", left: -12, top: 10, bottom: 10, width: 3, borderRadius: 3, bgcolor: "sidebar.accent" } : undefined,
                    "& svg": { fontSize: "1.25rem" },
                  }}
                >
                  <Badge color="secondary" badgeContent={count} max={99} variant={rail ? "dot" : "standard"} invisible={!count}
                    sx={{ "& .MuiBadge-badge": { fontWeight: 700 } }}>
                    {i.icon}
                  </Badge>
                  {!rail && <Box component="span" sx={{ flex: 1, textAlign: "left", whiteSpace: "nowrap" }}>{i.label}</Box>}
                </ButtonBase>
              );
              return rail ? <Tooltip key={i.href} title={i.label} placement="right">{item}</Tooltip> : item;
            })}
          </Box>
        ))}
      </Box>
      <Box sx={{ p: 1.5, display: { xs: "none", md: "block" } }}>
        <ButtonBase onClick={toggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          sx={{ width: "100%", height: 36, borderRadius: 2, gap: 1, color: "sidebar.muted", justifyContent: rail ? "center" : "flex-start", px: rail ? 0 : 1.5, fontSize: "0.8125rem", "&:hover": { bgcolor: "sidebar.hover", color: "sidebar.text" } }}>
          {collapsed ? <KeyboardDoubleArrowRightIcon fontSize="small" /> : <><KeyboardDoubleArrowLeftIcon fontSize="small" />Collapse</>}
        </ButtonBase>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <Box component="aside" sx={{ width: { md: width }, flexShrink: { md: 0 }, transition: "width .2s ease" }}>
        <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: "block", md: "none" }, "& .MuiDrawer-paper": { width: WIDE } }}>
          {nav(false)}
        </Drawer>
        <Drawer variant="permanent" open
          sx={{ display: { xs: "none", md: "block" }, "& .MuiDrawer-paper": { width, transition: "width .2s ease", overflowX: "hidden" } }}>
          {nav(collapsed)}
        </Drawer>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <AppBar position="sticky" sx={(t) => ({
          bgcolor: `rgba(${t.vars!.palette.background.defaultChannel} / 0.82)`, backdropFilter: "saturate(180%) blur(12px)",
          borderBottom: 1, borderColor: "divider",
        })}>
          <Toolbar sx={{ gap: 1, minHeight: { xs: 60, md: 64 }, px: { xs: 1.5, md: 3 } }}>
            <IconButton onClick={() => setMobileOpen(true)} sx={{ display: { md: "none" } }} aria-label="Open navigation"><MenuIcon /></IconButton>
            <Typography variant="subtitle1" noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 650 }}>{title}</Typography>
            <ButtonBase onClick={() => setPalette(true)} aria-label="Search pages and actions (Ctrl+K)"
              sx={{
                display: { xs: "none", sm: "flex" }, gap: 1, height: 36, px: 1.5, borderRadius: 2, border: 1, borderColor: "divider",
                color: "text.secondary", bgcolor: "background.paper", minWidth: 220, justifyContent: "flex-start", fontSize: "0.8125rem",
                "&:hover": { borderColor: "text.disabled" },
              }}>
              <SearchIcon fontSize="small" />
              <Box component="span" sx={{ flex: 1, textAlign: "left" }}>Search or jump to…</Box>
              <Box component="kbd" sx={{ fontFamily: "inherit", fontSize: "0.6875rem", border: 1, borderColor: "divider", borderRadius: 1, px: 0.75, py: 0.1 }}>Ctrl K</Box>
            </ButtonBase>
            <IconButton onClick={() => setPalette(true)} sx={{ display: { sm: "none" } }} aria-label="Search"><SearchIcon /></IconButton>
            <NotificationBell unread={unread} />
            <Tooltip title="Account">
              <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label="Account menu" sx={{ p: 0.5 }}>
                <Avatar sx={{ width: 34, height: 34, fontSize: "0.8125rem", fontWeight: 700, bgcolor: "primary.main", color: "primary.contrastText" }}>
                  {initials(user.fullName)}
                </Avatar>
              </IconButton>
            </Tooltip>
            <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}
              slotProps={{ paper: { sx: { width: 300, mt: 1, borderRadius: 3 } } }}>
              <Box sx={{ px: 2, py: 1.5 }}>
                <Typography variant="subtitle2">{user.fullName}</Typography>
                <Typography variant="caption" color="text.secondary">{user.employeeId} · {ROLE_LABEL[user.role]}</Typography>
                {user.departmentName && <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{user.departmentName}</Typography>}
              </Box>
              <Divider />
              <Box sx={{ px: 2, py: 1.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>Theme</Typography>
                <ColorModeSwitch fullWidth />
              </Box>
              <Divider />
              <MenuItem component={Link} href="/account" onClick={() => setAnchor(null)}>
                <ListItemIcon><PersonOutlineOutlinedIcon fontSize="small" /></ListItemIcon>Account & password
              </MenuItem>
              <MenuItem onClick={signOut}>
                <ListItemIcon><LogoutOutlinedIcon fontSize="small" /></ListItemIcon>Sign out
              </MenuItem>
            </Menu>
          </Toolbar>
          <Collapse in={banner}>
            <Stack direction="row" spacing={1} sx={(t) => ({
              alignItems: "center", px: { xs: 2, md: 3 }, py: 0.75, borderTop: 1, borderColor: "divider",
              bgcolor: `rgba(${t.vars!.palette.secondary.mainChannel} / 0.08)`,
            })}>
              <ScienceOutlinedIcon sx={{ fontSize: "1rem", color: "secondary.main" }} />
              <Typography variant="caption" sx={{ flex: 1 }} color="text.secondary">
                <b>Prototype</b> with synthetic data. Leave rules are proposals awaiting confirmation against GRA policy.
              </Typography>
              <IconButton size="small" onClick={dismissBanner} aria-label="Dismiss prototype notice"><CloseIcon sx={{ fontSize: "1rem" }} /></IconButton>
            </Stack>
          </Collapse>
        </AppBar>
        <Box component="main" id="main" sx={{ flex: 1, px: { xs: 2, md: 4 }, py: { xs: 2.5, md: 4 }, maxWidth: 1480, width: "100%", mx: "auto" }}>
          {children}
        </Box>
      </Box>
      <CommandPalette role={user.role} open={palette} onClose={() => setPalette(false)} />
    </Box>
  );
}
