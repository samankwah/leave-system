"use client";

import { useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import BeachAccessOutlinedIcon from "@mui/icons-material/BeachAccessOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { MONTH_NAMES, formatRange, monthLabel } from "@/domain/workingDays";
import ReasonDialog from "@/components/ReasonDialog";
import RequestDrawer from "@/components/RequestDrawer";
import RequestProgress from "@/components/RequestProgress";
import { PageHeader, StatusChip } from "@/components/common";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toaster";
import { api, errorText } from "@/lib/client";
import type { LeaveRequest } from "@/server/repos/leave";

const FILTERS: { key: string; label: string; statuses: string[] }[] = [
  { key: "all", label: "All", statuses: [] },
  { key: "pending", label: "Pending", statuses: ["pending"] },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  { key: "returned", label: "Returned", statuses: ["returned"] },
  { key: "closed", label: "Rejected / cancelled", statuses: ["rejected", "cancelled"] },
];

export default function MyRequests({ requests, today, openId, hasApprovedPlan, canSeeTeam }: {
  requests: LeaveRequest[]; today: string; openId: number | null; hasApprovedPlan: boolean; canSeeTeam: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const years = [...new Set(requests.map((r) => r.year))].sort((a, b) => b - a);
  const [year, setYear] = useState<number | "all">("all");
  const [filter, setFilter] = useState("all");
  const [openReq, setOpenReq] = useState<number | null>(openId);
  const [cancelling, setCancelling] = useState<LeaveRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const inYear = requests.filter((r) => year === "all" || r.year === year);
  const count = (statuses: string[]) => inYear.filter((r) => !statuses.length || statuses.includes(r.status)).length;
  const shown = inYear.filter((r) => { const f = FILTERS.find((x) => x.key === filter)!; return !f.statuses.length || f.statuses.includes(r.status); });
  const current = requests.find((r) => r.id === openReq) ?? null;

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
            description={requests.length ? undefined : hasApprovedPlan
              ? "Your annual plan is approved. Request leave for any of its periods and you can follow each approval step here."
              : "Leave is requested against an approved annual plan. Submit your plan first; once it is approved you can request leave."}
            action={!requests.length ? (
              <Stack direction="row" spacing={1} sx={{ justifyContent: "center", flexWrap: "wrap", gap: 1 }}>
                {hasApprovedPlan
                  ? <Button variant="contained" component={NextLink} href="/requests/new">Request leave</Button>
                  : <Button variant="contained" component={NextLink} href="/plan">Go to annual plan</Button>}
                {canSeeTeam && <Button variant="outlined" component={NextLink} href="/team">View team leave</Button>}
              </Stack>
            ) : undefined} />
        ) : (
          <Stack divider={<Divider />}>
            {shown.map((r) => (
              <ButtonBase key={r.id} onClick={() => setOpenReq(r.id)} sx={{ display: "flex", flexWrap: { xs: "wrap", sm: "nowrap" }, textAlign: "left", px: { xs: 2, md: 2.5 }, py: 1.75, columnGap: 2, rowGap: 0.5, "&:hover": { bgcolor: "action.hover" } }}>
                <Box sx={{ width: 46, flexShrink: 0, textAlign: "center", borderRadius: 2, border: 1, borderColor: "divider", py: 0.5 }}>
                  <Typography sx={{ fontSize: "0.65625rem", fontWeight: 700, color: "secondary.main", textTransform: "uppercase", lineHeight: 1.3 }}>{MONTH_NAMES[Number(r.start.slice(5, 7)) - 1].slice(0, 3)}</Typography>
                  <Typography sx={{ fontSize: "1.0625rem", fontWeight: 700, lineHeight: 1.1 }}>{Number(r.start.slice(8))}</Typography>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                    <Typography variant="body2" sx={{ fontWeight: 650 }}>{formatRange(r)}</Typography>
                    {r.attachmentName && <AttachFileIcon sx={{ fontSize: "0.9375rem", color: "text.secondary" }} aria-label="Has attachment" />}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
                    {r.days} working days · {Object.entries(r.breakdown).map(([m, d]) => `${monthLabel(m).split(" ")[0]} ${d}`).join(", ")}
                  </Typography>
                  <Box sx={{ mt: 0.75, maxWidth: 420, display: { xs: "none", sm: "block" } }}><RequestProgress request={r} today={today} compact /></Box>
                </Box>
                <StatusChip status={r.status} />
                <ChevronRightIcon sx={{ color: "text.disabled", display: { xs: "none", sm: "block" } }} />
                {/* On phones the tracker gets its own line so the stage name isn't truncated. */}
                <Box sx={{ display: { xs: "block", sm: "none" }, width: "100%", pl: "62px" }}><RequestProgress request={r} today={today} compact /></Box>
              </ButtonBase>
            ))}
          </Stack>
        )}
      </Paper>

      <RequestDrawer request={current} today={today} mode="own" onClose={() => setOpenReq(null)} onCancel={setCancelling} />

      <ReasonDialog
        open={!!cancelling} busy={busy} color="error" confirmLabel="Cancel request"
        title={`Cancel leave ${cancelling ? formatRange(cancelling) : ""}?`}
        description="Cancelling releases any monthly capacity this request reserved. Your approved annual plan is not changed."
        onClose={() => setCancelling(null)} onConfirm={(r) => { setOpenReq(null); cancel(r); }}
      />
    </>
  );
}
