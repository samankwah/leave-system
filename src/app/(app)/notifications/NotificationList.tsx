"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import EventNoteOutlinedIcon from "@mui/icons-material/EventNoteOutlined";
import HighlightOffIcon from "@mui/icons-material/HighlightOff";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import ReplyOutlinedIcon from "@mui/icons-material/ReplyOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import { PageHeader } from "@/components/common";
import EmptyState from "@/components/ui/EmptyState";
import { api } from "@/lib/client";
import { fmtDateTime, fmtLongDate } from "@/lib/format";
import type { Notification } from "@/server/repos/notifications";

function iconFor(kind: string): [React.ReactNode, string] {
  if (kind === "capacity") return [<WarningAmberOutlinedIcon key="i" />, "warning.main"];
  if (kind.endsWith("approved")) return [<CheckCircleOutlineIcon key="i" />, "success.main"];
  if (kind.endsWith("rejected")) return [<HighlightOffIcon key="i" />, "error.main"];
  if (kind.endsWith("returned") || kind.endsWith("cancelled")) return [<ReplyOutlinedIcon key="i" />, "warning.main"];
  if (kind.startsWith("plan")) return [<EventNoteOutlinedIcon key="i" />, "primary.main"];
  return [<NotificationsNoneOutlinedIcon key="i" />, "primary.main"];
}

const PAGE = 50;

export default function NotificationList({ items: initial, today }: { items: Notification[]; today: string }) {
  // Older notifications are fetched page by page (cursor = oldest loaded id) instead of all at once.
  const [older, setOlder] = useState<Notification[]>([]);
  const [hasMore, setHasMore] = useState(initial.length >= PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const items = [...initial, ...older.filter((o) => !initial.some((i) => i.id === o.id))];
  const router = useRouter();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const unread = items.filter((n) => !n.read_at).length;
  const shown = items.filter((n) => tab === "all" || !n.read_at);
  const yesterday = new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10);
  const groups = new Map<string, Notification[]>();
  for (const n of shown) {
    const d = n.created_at.slice(0, 10);
    const label = d === today ? "Today" : d === yesterday ? "Yesterday" : fmtLongDate(d);
    groups.set(label, [...(groups.get(label) ?? []), n]);
  }

  async function loadOlder() {
    const oldest = items[items.length - 1];
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const page = await api<Notification[]>(`/api/notifications?before=${oldest.id}&limit=${PAGE}`, "GET");
      setOlder((o) => [...o, ...page]);
      setHasMore(page.length === PAGE);
    } finally {
      setLoadingMore(false);
    }
  }

  async function read(ids?: number[]) {
    await api("/api/notifications/read", "POST", { ids });
    router.refresh();
  }

  async function open(n: Notification) {
    if (!n.read_at) await read([n.id]);
    if (n.link) router.push(n.link);
  }

  return (
    <>
      <PageHeader title="Notifications" subtitle={unread ? `${unread} unread` : "You're all caught up"}
        actions={unread > 0 && <Button variant="outlined" startIcon={<DoneAllIcon />} onClick={() => read()}>Mark all as read</Button>} />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2.5 }}>
        <Tab value="all" label={hasMore ? "All" : `All ${items.length}`} />
        <Tab value="unread" label={`Unread ${unread}`} />
      </Tabs>
      {shown.length === 0 ? (
        <Paper sx={{ borderRadius: "14px" }}>
          <EmptyState icon={<NotificationsNoneOutlinedIcon />} title={tab === "unread" ? "No unread notifications" : "No notifications yet"} />
        </Paper>
      ) : (
        <Stack spacing={3}>
          {[...groups.entries()].map(([label, list]) => (
            <Box key={label}>
              <Typography variant="overline" color="text.secondary">{label}</Typography>
              <Paper sx={{ borderRadius: "14px", overflow: "hidden", mt: 0.5 }}>
                {list.map((n, i) => {
                  const [icon, color] = iconFor(n.kind);
                  return (
                    <ButtonBase key={n.id} onClick={() => open(n)}
                      sx={{
                        display: "flex", width: "100%", textAlign: "left", gap: 2, px: 2.5, py: 1.75, alignItems: "flex-start",
                        borderTop: i ? 1 : 0, borderColor: "divider", bgcolor: n.read_at ? "transparent" : "action.hover",
                        "&:hover": { bgcolor: "action.selected" },
                      }}>
                      <Box sx={{ width: 36, height: 36, borderRadius: 2, flexShrink: 0, display: "grid", placeItems: "center", color, bgcolor: "background.default", "& svg": { fontSize: "1.25rem" } }}>{icon}</Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: n.read_at ? 550 : 750 }}>{n.title}</Typography>
                        <Typography variant="body2" color="text.secondary">{n.body}</Typography>
                        <Typography variant="caption" color="text.disabled">{fmtDateTime(n.created_at)}</Typography>
                      </Box>
                      {!n.read_at && <Box sx={{ width: 8, height: 8, mt: 1, borderRadius: "50%", bgcolor: "secondary.main", flexShrink: 0 }} aria-label="Unread" />}
                    </ButtonBase>
                  );
                })}
              </Paper>
            </Box>
          ))}
        </Stack>
      )}
      {hasMore && (
        <Box sx={{ textAlign: "center", mt: 2.5 }}>
          <Button onClick={loadOlder} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load older notifications"}</Button>
        </Box>
      )}
    </>
  );
}
