"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import InputBase from "@mui/material/InputBase";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import SearchIcon from "@mui/icons-material/Search";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import type { Role } from "@/domain/types";
import { navSections } from "./nav";

interface Cmd { id: string; label: string; hint: string; href: string; icon: React.ReactNode; keywords: string }

/** Ctrl/⌘+K quick navigation, filtered by role. */
export default function CommandPalette({ role, open, onClose }: { role: Role; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const commands = useMemo<Cmd[]>(() => {
    const pages = navSections(role).flatMap((s) => s.items.map((i) => ({
      id: i.href, label: i.label, hint: s.title, href: i.href, icon: i.icon, keywords: `${i.label} ${i.keywords ?? ""}`.toLowerCase(),
    })));
    const actions: Cmd[] = [
      { id: "a-request", label: "Request leave", hint: "Action", href: "/requests/new", icon: <AddCircleOutlineIcon />, keywords: "new request leave time off" },
      { id: "a-plan", label: "Edit my annual plan", hint: "Action", href: "/plan", icon: <AddCircleOutlineIcon />, keywords: "plan amend create" },
    ];
    return [...actions, ...pages];
  }, [role]);

  const shown = commands.filter((c) => !q.trim() || q.toLowerCase().split(/\s+/).every((w) => c.keywords.includes(w) || c.label.toLowerCase().includes(w)));

  useEffect(() => { setActive(0); }, [q, open]);

  function go(c: Cmd | undefined) {
    if (!c) return;
    onClose();
    setQ("");
    router.push(c.href);
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" sx={{ "& .MuiDialog-container": { alignItems: "flex-start", pt: "12vh" } }}
      aria-label="Command palette">
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
        <SearchIcon color="action" />
        <InputBase
          autoFocus fullWidth placeholder="Search pages and actions…" value={q} onChange={(e) => setQ(e.target.value)}
          inputProps={{ "aria-label": "Search pages and actions" }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter") { e.preventDefault(); go(shown[active]); }
          }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ border: 1, borderColor: "divider", borderRadius: 1, px: 0.75 }}>Esc</Typography>
      </Box>
      <List dense sx={{ maxHeight: 380, overflowY: "auto", p: 1 }}>
        {shown.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No matches.</Typography>}
        {shown.map((c, i) => (
          <ListItemButton key={c.id} selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => go(c)}>
            <ListItemIcon sx={{ minWidth: 36, color: "text.secondary" }}>{c.icon}</ListItemIcon>
            <ListItemText primary={c.label} />
            <Typography variant="caption" color="text.secondary">{c.hint}</Typography>
          </ListItemButton>
        ))}
      </List>
    </Dialog>
  );
}
