"use client";

import { useMemo, useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid2";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import SearchIcon from "@mui/icons-material/Search";
import { MONTH_NAMES, formatRange } from "@/domain/workingDays";
import PlanProgress from "@/components/PlanProgress";
import RequestDrawer from "@/components/RequestDrawer";
import RequestProgress from "@/components/RequestProgress";
import { PageHeader, Stat, StatusChip } from "@/components/common";
import EmptyState from "@/components/ui/EmptyState";
import type { LeaveRequest, Plan } from "@/server/repos/leave";

const REQUEST_FILTERS: { key: string; label: string; match: (r: LeaveRequest, today: string) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "pending", label: "Awaiting decision", match: (r) => r.status === "pending" },
  { key: "now", label: "On leave now", match: (r, t) => r.status === "approved" && r.start <= t && r.end >= t },
  { key: "upcoming", label: "Upcoming", match: (r, t) => r.status === "approved" && r.start > t },
  { key: "returned", label: "Returned", match: (r) => r.status === "returned" },
  { key: "closed", label: "Taken / closed", match: (r, t) => (r.status === "approved" && r.end < t) || r.status === "rejected" || r.status === "cancelled" },
];

const PLAN_FILTERS: { key: string; label: string; statuses: string[] }[] = [
  { key: "all", label: "All", statuses: [] },
  { key: "submitted", label: "Awaiting decision", statuses: ["submitted"] },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  { key: "returned", label: "Returned / rejected", statuses: ["returned", "rejected"] },
];

function DateTile({ iso }: { iso: string }) {
  return (
    <Box sx={{ width: 46, flexShrink: 0, textAlign: "center", borderRadius: 2, border: 1, borderColor: "divider", py: 0.5 }}>
      <Typography sx={{ fontSize: "0.65625rem", fontWeight: 700, color: "secondary.main", textTransform: "uppercase", lineHeight: 1.3 }}>{MONTH_NAMES[Number(iso.slice(5, 7)) - 1].slice(0, 3)}</Typography>
      <Typography sx={{ fontSize: "1.0625rem", fontWeight: 700, lineHeight: 1.1 }}>{Number(iso.slice(8))}</Typography>
    </Box>
  );
}

export default function TeamLeaveView({ requests, plans, departments, year, years, today, viewerId, isHr, openId }: {
  requests: LeaveRequest[]; plans: Plan[]; departments: Record<number, string>; year: number; years: number[];
  today: string; viewerId: number; isHr: boolean; openId: number | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"requests" | "plans">("requests");
  const [reqFilter, setReqFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [dept, setDept] = useState("all");
  const [q, setQ] = useState("");
  const [openReq, setOpenReq] = useState<number | null>(openId);

  const deptNames = useMemo(
    () => [...new Set([...requests, ...plans].map((x) => departments[x.employeeId]))].filter(Boolean).sort(),
    [requests, plans, departments],
  );
  const matchesPerson = (employeeId: number, name: string) =>
    (dept === "all" || departments[employeeId] === dept) && (!q.trim() || name.toLowerCase().includes(q.trim().toLowerCase()));
  const scopedReqs = requests.filter((r) => matchesPerson(r.employeeId, r.employeeName));
  const scopedPlans = plans.filter((p) => matchesPerson(p.employeeId, p.employeeName));
  const reqCount = (key: string) => scopedReqs.filter((r) => REQUEST_FILTERS.find((f) => f.key === key)!.match(r, today)).length;
  const planCount = (statuses: string[]) => scopedPlans.filter((p) => !statuses.length || statuses.includes(p.status)).length;
  const shownReqs = scopedReqs.filter((r) => REQUEST_FILTERS.find((f) => f.key === reqFilter)!.match(r, today));
  const shownPlans = scopedPlans.filter((p) => { const f = PLAN_FILTERS.find((x) => x.key === planFilter)!; return !f.statuses.length || f.statuses.includes(p.status); });
  const current = requests.find((r) => r.id === openReq) ?? null;
  // HR may decide anything; a manager decides what is routed to them.
  const canReview = (item: { approverId: number | null }) => isHr || item.approverId === viewerId;

  return (
    <>
      <PageHeader title="Team leave"
        subtitle={isHr
          ? "Every employee's leave requests and annual plans, with where each one is in its approval workflow."
          : "Leave requests and annual plans from your direct reports and anything routed to you, with where each one is in its workflow."} />

      <Paper sx={{ p: 2, mb: 2.5, borderRadius: "14px" }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 6, md: 3 }}><Stat label="Awaiting decision" value={reqCount("pending") + planCount(["submitted"])} hint="Requests and plans" tone={reqCount("pending") + planCount(["submitted"]) ? "warning" : undefined} /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><Stat label="On leave now" value={reqCount("now")} hint={`As of ${formatRange({ start: today, end: today })}`} /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><Stat label="Upcoming leave" value={reqCount("upcoming")} hint={`Approved, ${year}`} /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><Stat label="Returned for revision" value={reqCount("returned") + planCount(["returned"])} hint="Waiting on the employee" /></Grid>
        </Grid>
      </Paper>

      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ mb: 2, alignItems: { md: "center" }, justifyContent: "space-between" }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 0 }}>
          <Tab value="requests" label={`Leave requests (${scopedReqs.length})`} />
          <Tab value="plans" label={`Annual plans (${scopedPlans.length})`} />
        </Tabs>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
          <TextField size="small" placeholder="Search name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search by name" sx={{ width: { xs: "100%", sm: 200 } }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
          {isHr && (
            <TextField select size="small" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department" sx={{ width: 220 }}>
              <MenuItem value="all">All departments</MenuItem>
              {deptNames.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
            </TextField>
          )}
          <TextField select size="small" value={year} onChange={(e) => router.push(`/team?year=${e.target.value}`)} aria-label="Year" sx={{ width: 100 }}>
            {years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
          </TextField>
        </Stack>
      </Stack>

      {tab === "requests" ? (
        <>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75, mb: 1.5 }} role="tablist" aria-label="Filter requests">
            {REQUEST_FILTERS.map((f) => (
              <Chip key={f.key} role="tab" aria-selected={reqFilter === f.key} clickable onClick={() => setReqFilter(f.key)}
                label={`${f.label} ${reqCount(f.key)}`} color={reqFilter === f.key ? "primary" : "default"} variant={reqFilter === f.key ? "filled" : "outlined"} />
            ))}
          </Stack>
          <Paper sx={{ borderRadius: "14px", overflow: "hidden" }}>
            {shownReqs.length === 0 ? (
              <EmptyState icon={<GroupsOutlinedIcon />} title={requests.length ? "No requests match these filters" : `No leave requests for ${year}`}
                description={requests.length ? undefined : "Requests your team submits will appear here with their approval progress."} />
            ) : (
              <Stack divider={<Divider />}>
                {shownReqs.map((r) => (
                  <ButtonBase key={r.id} onClick={() => setOpenReq(r.id)} aria-label={`${r.employeeName}, ${formatRange(r)}, ${r.status}`}
                    sx={{ display: "flex", flexWrap: { xs: "wrap", sm: "nowrap" }, textAlign: "left", px: { xs: 2, md: 2.5 }, py: 1.75, columnGap: 2, rowGap: 0.5, "&:hover": { bgcolor: "action.hover" } }}>
                    <DateTile iso={r.start} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 650 }} noWrap>
                        {r.employeeName} <Typography component="span" variant="caption" color="text.secondary">· {departments[r.employeeId]}</Typography>
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
                        {formatRange(r)} · {r.days} working days
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
        </>
      ) : (
        <>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75, mb: 1.5 }} role="tablist" aria-label="Filter plans">
            {PLAN_FILTERS.map((f) => (
              <Chip key={f.key} role="tab" aria-selected={planFilter === f.key} clickable onClick={() => setPlanFilter(f.key)}
                label={`${f.label} ${planCount(f.statuses)}`} color={planFilter === f.key ? "primary" : "default"} variant={planFilter === f.key ? "filled" : "outlined"} />
            ))}
          </Stack>
          <Paper sx={{ borderRadius: "14px", overflow: "hidden" }}>
            {shownPlans.length === 0 ? (
              <EmptyState icon={<GroupsOutlinedIcon />} title={plans.length ? "No plans match these filters" : `No submitted plans for ${year}`}
                description={plans.length ? undefined : "Annual plans appear here once they are submitted for approval."} />
            ) : (
              <Stack divider={<Divider />}>
                {shownPlans.map((p) => (
                  <Stack key={p.id} direction={{ xs: "column", md: "row" }} spacing={{ xs: 1.25, md: 2 }} sx={{ px: { xs: 2, md: 2.5 }, py: 1.75, alignItems: { md: "center" } }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 650 }} noWrap>
                        {p.employeeName} <Typography component="span" variant="caption" color="text.secondary">· {departments[p.employeeId]}</Typography>
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        {p.amendsPlanId ? "Amendment" : "Plan"} v{p.version} · {p.totalDays} days · {p.periods.map((x) => formatRange(x)).join("; ")}
                      </Typography>
                    </Box>
                    <Box sx={{ width: { xs: "100%", md: 300 }, flexShrink: 0 }}>
                      <PlanProgress state={p.status} amendment={!!p.amendsPlanId} />
                    </Box>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexShrink: 0, justifyContent: "flex-end", minWidth: { md: 190 } }}>
                      <StatusChip status={p.status} />
                      {p.status === "submitted" && canReview(p) && (
                        <Button size="small" variant="outlined" component={NextLink} href={`/approvals?item=plan-${p.id}`}>Review</Button>
                      )}
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            )}
          </Paper>
        </>
      )}

      <RequestDrawer request={current} today={today} mode="viewer" onClose={() => setOpenReq(null)}
        department={current ? departments[current.employeeId] : undefined} canReview={!!current && canReview(current)} />
    </>
  );
}
