"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Popover from "@mui/material/Popover";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import { api } from "@/lib/client";
import { fmtDateTime } from "@/lib/format";
import type { Notification } from "@/server/repos/notifications";
import EmptyState from "./ui/EmptyState";

export default function NotificationBell({ unread }: { unread: number }) {
  const router = useRouter();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [items, setItems] = useState<Notification[] | null>(null);

  async function open(el: HTMLElement) {
    setAnchor(el);
    setItems(null);
    setItems(await api<Notification[]>("/api/notifications", "GET").catch(() => []));
  }

  async function markAll() {
    await api("/api/notifications/read", "POST", {});
    setItems((list) => list?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? null);
    router.refresh();
  }

  async function follow(n: Notification) {
    setAnchor(null);
    if (!n.read_at) await api("/api/notifications/read", "POST", { ids: [n.id] }).catch(() => undefined);
    if (n.link) router.push(n.link);
    router.refresh();
  }

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton onClick={(e) => open(e.currentTarget)} aria-label={`Notifications, ${unread} unread`}>
          <Badge color="error" badgeContent={unread} max={99}><NotificationsNoneOutlinedIcon /></Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { width: 380, maxWidth: "calc(100vw - 24px)", mt: 1, borderRadius: 3 } } }}
      >
        <Stack direction="row" sx={{ px: 2, py: 1.5, alignItems: "center", justifyContent: "space-between", borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="subtitle1">Notifications</Typography>
          {!!items?.some((n) => !n.read_at) && <Button size="small" onClick={markAll}>Mark all read</Button>}
        </Stack>
        <Box sx={{ maxHeight: 420, overflowY: "auto" }}>
          {items === null && <Box sx={{ display: "grid", placeItems: "center", py: 4 }}><CircularProgress size={22} /></Box>}
          {items?.length === 0 && <EmptyState compact icon={<NotificationsNoneOutlinedIcon />} title="You're all caught up" />}
          {items?.slice(0, 8).map((n) => (
            <Box
              key={n.id} component="button" onClick={() => follow(n)}
              sx={{
                all: "unset", boxSizing: "border-box", display: "flex", gap: 1.5, width: "100%", px: 2, py: 1.5, cursor: "pointer",
                borderBottom: 1, borderColor: "divider", "&:hover": { bgcolor: "action.hover" }, "&:focus-visible": { bgcolor: "action.focus" },
              }}
            >
              <Box sx={{ width: 8, height: 8, mt: 0.75, borderRadius: "50%", flexShrink: 0, bgcolor: n.read_at ? "transparent" : "secondary.main" }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: n.read_at ? 500 : 700 }}>{n.title}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{n.body}</Typography>
                <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.25 }}>{fmtDateTime(n.created_at)}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
        <Box sx={{ p: 1, textAlign: "center" }}>
          <Button component={Link} href="/notifications" size="small" onClick={() => setAnchor(null)}>View all notifications</Button>
        </Box>
      </Popover>
    </>
  );
}
