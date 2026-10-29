"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import BeachAccessOutlinedIcon from "@mui/icons-material/BeachAccessOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import { MONTH_NAMES, formatRange, monthLabel } from "@/domain/workingDays";
import ReasonDialog from "@/components/ReasonDialog";
import { KeyValue, PageHeader, StatusChip } from "@/components/common";
import ActivityTimeline, { type TimelineItem } from "@/components/ui/ActivityTimeline";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toaster";
import { api, errorText } from "@/lib/client";
import { fmtDateTime, relativeDays } from "@/lib/format";
import type { LeaveRequest } from "@/server/repos/leave";

const FILTERS: { key: string; label: string; statuses: string[] }[] = [
  { key: "all", label: "All", statuses: [] },
  { key: "pending", label: "Pending", statuses: ["pending"] },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  { key: "returned", label: "Returned", statuses: ["returned"] },
  { key: "closed", label: "Rejected / cancelled", statuses: ["rejected", "cancelled"] },
];

export default function MyRequests({ requests, today, openId }: {
  requests: LeaveRequest[]; today: string; openId: number | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const years = [...new Set(requests.map((r) => r.year))].sort((a, b) => b - a);
  const [year, setYear] = useState<number | "all">("all");
  const [filter, setFilter] = useState("all");
  const [openReq, setOpenReq] = useState<number | null>(openId);
  const [cancelling, setCancelling] = useState<LeaveRequest | null>(null);
  const [busy, setBusy] = useState(false);
  // Each request's timeline is fetched when its drawer opens, not sent with the page.
  const [history, setHistory] = useState<Record<number, TimelineItem[]>>({});
  useEffect(() => {
    if (openReq === null || history[openReq]) return;
    let live = true;
    api<TimelineItem[]>(`/api/requests/${openReq}/history`, "GET")
      .then((items) => { if (live) setHistory((h) => ({ ...h, [openReq]: items })); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [openReq, history]);

  const inYear = requests.filter((r) => year === "all" || r.year === year);
  const count = (statuses: string[]) => inYear.filter((r) => !statuses.length || statuses.includes(r.status)).length;
  const shown = inYear.filter((r) => { const f = FILTERS.find((x) => x.key === filter)!; return !f.statuses.length || f.statuses.includes(r.status); });
  const current = requests.find((r) => r.id === openReq) ?? null;
  const canCancel = (r: LeaveRequest) => r.status === "pending" || r.status === "returned" || (r.status === "approved" && r.start > today);

  async function cancel(reason: string) {
    if (!cancelling) return;
    setBusy(true);
    try {
      await api(`/api/requests/${cancelling.id}/cancel`, "POST", { reason });
      toast.success("Request cancelled. Any capacity it reserved has been released.");
      router.refresh();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
      setCancelling(null);
    }
  }

  return (
    <>
      <PageHeader title="My requests" subtitle="Track your leave requests and their approvals."
        actions={<Button variant="contained" component={NextLink} href="/requests/new" startIcon={<AddIcon />}>New request</Button>} />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2, alignItems: { sm: "center" }, justifyContent: "space-between" }}>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75 }} role="tablist" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <Chip key={f.key} role="tab" aria-selected={filter === f.key} clickable onClick={() => setFilter(f.key)}
              label={`${f.label} ${count(f.statuses)}`} color={filter === f.key ? "primary" : "default"} variant={filter === f.key ? "filled" : "outlined"} />
          ))}
        </Stack>
        <TextField select size="small" value={year} onChange={(e) => setYear(e.target.value === "all" ? "all" : Number(e.target.value))} aria-label="Year" sx={{ width: 130 }}>
          <MenuItem value="all">All years</MenuItem>
          {years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
        </TextField>
      </Stack>

      <Paper sx={{ borderRadius: "14px", overflow: "hidden" }}>
        {shown.length === 0 ? (
          <EmptyState icon={<BeachAccessOutlinedIcon />} title={requests.length ? "No requests match this filter" : "You haven't requested leave yet"}
            description={requests.length ? undefined : "Requests are made against your approved annual plan."}
            action={!requests.length ? <Button variant="contained" component={NextLink} href="/requests/new">Request leave</Button> : undefined} />
        ) : (
          <Stack divider={<Divider />}>
            {shown.map((r) => (
              <ButtonBase key={r.id} onClick={() => setOpenReq(r.id)} sx={{ display: "flex", textAlign: "left", px: { xs: 2, md: 2.5 }, py: 1.75, gap: 2, "&:hover": { bgcolor: "action.hover" } }}>
                <Box sx={{ width: 46, flexShrink: 0, textAlign: "center", borderRadius: 2, border: 1, borderColor: "divider", py: 0.5 }}>
                  <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: "secondary.main", textTransform: "uppercase", lineHeight: 1.3 }}>{MONTH_NAMES[Number(r.start.slice(5, 7)) - 1].slice(0, 3)}</Typography>
                  <Typography sx={{ fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>{Number(r.start.slice(8))}</Typography>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                    <Typography variant="body2" sx={{ fontWeight: 650 }}>{formatRange(r)}</Typography>
                    {r.attachmentName && <AttachFileIcon sx={{ fontSize: 15, color: "text.secondary" }} aria-label="Has attachment" />}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
                    {r.days} working days · {Object.entries(r.breakdown).map(([m, d]) => `${monthLabel(m).split(" ")[0]} ${d}`).join(", ")}
                    {r.status === "pending" ? ` · awaiting ${r.approverName ?? "HR"}` : r.decidedByName ? ` · ${r.decidedByName}` : ""}
                  </Typography>
                </Box>
                <StatusChip status={r.status} />
                <ChevronRightIcon sx={{ color: "text.disabled", display: { xs: "none", sm: "block" } }} />
              </ButtonBase>
            ))}
          </Stack>
        )}
      </Paper>

      <Drawer anchor="right" open={!!current} onClose={() => setOpenReq(null)} slotProps={{ paper: { sx: { width: { xs: "100%", sm: 440 } } } }}>
        {current && (
          <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <Stack direction="row" sx={{ alignItems: "center", px: 2.5, py: 2, borderBottom: 1, borderColor: "divider" }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary">{current.leaveType}</Typography>
                <Typography variant="h6">{formatRange(current)}</Typography>
              </Box>
              <IconButton onClick={() => setOpenReq(null)} aria-label="Close"><CloseIcon /></IconButton>
            </Stack>
            <Box sx={{ p: 2.5, flex: 1, overflowY: "auto" }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
                <StatusChip status={current.status} size="medium" />
                {current.status === "approved" && current.start > today && <Typography variant="body2" color="text.secondary">Starts {relativeDays(current.start, today)}</Typography>}
              </Stack>
              <KeyValue rows={[
                ["Working days", current.days],
                ["By month", Object.entries(current.breakdown).map(([m, d]) => `${monthLabel(m)}: ${d}`).join(" · ")],
                ["Submitted", fmtDateTime(current.submittedAt)],
                ["Approver", current.approverName ?? "HR Administrators"],
                ...(current.decidedAt ? [["Decided", `${current.decidedByName ?? ""} · ${fmtDateTime(current.decidedAt)}`] as [string, string]] : []),
                ...(current.reason ? [["Your note", current.reason] as [string, string]] : []),
              ]} />
              {current.decisionReason && (
                <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: "action.hover" }}>
                  <Typography variant="caption" color="text.secondary">Comment from {current.decidedByName}</Typography>
                  <Typography variant="body2">{current.decisionReason}</Typography>
                </Box>
              )}
              {current.attachmentName && (
                <Button sx={{ mt: 2 }} variant="outlined" startIcon={<AttachFileIcon />} href={`/api/requests/${current.id}/attachment`}>{current.attachmentName}</Button>
              )}
              <Divider sx={{ my: 2.5 }} />
              <Typography variant="overline" color="text.secondary">Activity</Typography>
              <Box sx={{ mt: 1 }}>
                {history[current.id] ? <ActivityTimeline items={history[current.id]} /> : <CircularProgress size={20} aria-label="Loading activity" />}
              </Box>
            </Box>
            {(current.status === "returned" || canCancel(current)) && (
              <Stack direction="row" spacing={1} sx={{ p: 2, borderTop: 1, borderColor: "divider", justifyContent: "flex-end" }}>
                {canCancel(current) && <Button color="error" onClick={() => setCancelling(current)}>Cancel request</Button>}
                {current.status === "returned" && <Button variant="contained" component={NextLink} href={`/requests/new?edit=${current.id}`}>Revise and resubmit</Button>}
              </Stack>
            )}
          </Box>
        )}
      </Drawer>

      <ReasonDialog
        open={!!cancelling} busy={busy} color="error" confirmLabel="Cancel request"
        title={`Cancel leave ${cancelling ? formatRange(cancelling) : ""}?`}
        description="Cancelling releases any monthly capacity this request reserved. Your approved annual plan is not changed."
        onClose={() => setCancelling(null)} onConfirm={(r) => { setOpenReq(null); cancel(r); }}
      />
    </>
  );
}
