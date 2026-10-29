"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid2";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import BeachAccessOutlinedIcon from "@mui/icons-material/BeachAccessOutlined";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import type { Role } from "@/domain/types";
import { MONTH_NAMES, formatRange, monthLabel } from "@/domain/workingDays";
import { MonthStrip } from "@/components/LeaveCalendar";
import PlanProgress from "@/components/PlanProgress";
import { PageHeader, Section, Stat, StatusChip } from "@/components/common";
import BalanceBar from "@/components/ui/BalanceBar";
import EmptyState from "@/components/ui/EmptyState";
import { fmtLongDate, fmtDateTime, relativeDays } from "@/lib/format";
import type { LeaveRequest, Plan } from "@/server/repos/leave";
import type { Notification } from "@/server/repos/notifications";
import type { CalendarData } from "@/server/services/queries";

interface Props {
  denied: boolean;
  user: { fullName: string; employeeId: string; department: string; title: string; category: string; role: Role; manager: string | null };
  year: number;
  years: number[];
  data: CalendarData;
  requests: LeaveRequest[];
  working: Plan | null;
  notifications: Notification[];
  attention: { pending: number; overdue: number; fullMonths: string[] } | null;
}

const FILTERS = [
  { key: "all", label: "All", statuses: ["pending", "approved", "returned", "rejected", "cancelled"] },
  { key: "pending", label: "Pending", statuses: ["pending", "returned"] },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  { key: "closed", label: "Closed", statuses: ["rejected", "cancelled"] },
];

function DateBlock({ iso }: { iso: string }) {
  return (
    <Box sx={{ width: 44, flexShrink: 0, textAlign: "center", borderRadius: 2, border: 1, borderColor: "divider", py: 0.5, bgcolor: "background.default" }}>
      <Typography sx={{ fontSize: "0.65625rem", fontWeight: 700, color: "secondary.main", lineHeight: 1.3, textTransform: "uppercase" }}>{MONTH_NAMES[Number(iso.slice(5, 7)) - 1].slice(0, 3)}</Typography>
      <Typography sx={{ fontSize: "1.0625rem", fontWeight: 700, lineHeight: 1.1 }}>{Number(iso.slice(8))}</Typography>
    </Box>
  );
}

export default function DashboardView(p: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const b = p.data.balance;
  const today = p.data.today;
  const approved = p.data.approvedPlan;
  const upcoming = p.requests.filter((r) => r.status === "approved" && r.end >= today).sort((a, z) => a.start.localeCompare(z.start));
  const next = upcoming[0];
  const shown = p.requests.filter((r) => FILTERS.find((f) => f.key === filter)!.statuses.includes(r.status));
  const ownMonths = new Set(p.data.allocations.filter((a) => a.employeeId === p.data.employeeId).map((a) => a.month));
  const firstName = p.user.fullName.split(" ")[0];

  const planState = p.working ? p.working.status as "draft" | "submitted" | "returned" : approved ? "approved" : "none";
  const cta = !approved && !p.working
    ? { label: "Create annual plan", href: `/plan?year=${p.year}` }
    : p.working && !approved
      ? { label: p.working.status === "submitted" ? "View submitted plan" : "Continue your plan", href: `/plan?year=${p.year}` }
      : { label: "Request leave", href: "/requests/new" };

  const remainingAfterPending = Math.max(0, b.projectedDays);
  const segments = [
    { key: "taken", label: "Taken", value: b.takenToDate, color: "chart.taken" },
    { key: "scheduled", label: "Booked", value: b.scheduledDays, color: "chart.scheduled" },
    { key: "pending", label: "Pending", value: b.pendingDays, color: "chart.pending", hatch: true },
    { key: "left", label: "Available", value: remainingAfterPending, color: "chart.remaining" },
  ];

  return (
    <>
      {p.denied && <Alert severity="warning" sx={{ mb: 2 }}>You don&apos;t have access to that page, so you were brought back to your dashboard.</Alert>}
      <PageHeader
        eyebrow={fmtLongDate(today)}
        title={`Welcome back, ${firstName}`}
        subtitle={`${p.user.title} · ${p.user.department}${p.user.manager ? ` · Reports to ${p.user.manager}` : ""}`}
        actions={
          <>
            <TextField select size="small" value={p.year} onChange={(e) => router.push(`/dashboard?year=${e.target.value}`)} aria-label="Leave year" sx={{ width: 104 }}>
              {p.years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </TextField>
            <Button variant="contained" component={Link} href={cta.href} startIcon={<AddIcon />}>{cta.label}</Button>
          </>
        }
      />

      {p.attention && (p.attention.pending > 0 || p.attention.fullMonths.length > 0) && (
        <Section sx={{ mb: 2.5 }} dense>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: { md: "center" } }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flex: 1 }}>
              <Box sx={{ width: 40, height: 40, borderRadius: 2, display: "grid", placeItems: "center", bgcolor: "action.hover", color: "secondary.main" }}>
                <FactCheckOutlinedIcon />
              </Box>
              <Box>
                <Typography variant="subtitle1">Needs your attention</Typography>
                <Typography variant="body2" color="text.secondary">
                  {p.attention.pending} item{p.attention.pending === 1 ? "" : "s"} awaiting your decision
                  {p.attention.overdue > 0 && <> · <Box component="span" sx={{ color: "error.main", fontWeight: 600 }}>{p.attention.overdue} overdue</Box></>}
                  {p.attention.fullMonths.length > 0 && <> · Full months: {p.attention.fullMonths.map((m) => monthLabel(m).split(" ")[0]).join(", ")}</>}
                </Typography>
              </Box>
            </Stack>
            {p.attention.pending > 0 && <Button variant="outlined" component={Link} href="/approvals" endIcon={<ArrowForwardIcon />}>Review approvals</Button>}
          </Stack>
        </Section>
      )}

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Section sx={{ height: "100%" }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={3} sx={{ justifyContent: "space-between" }}>
              <Box>
                <Typography variant="body2" color="text.secondary">Available to book in {p.year}</Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", mt: 0.5 }}>
                  <Typography sx={{ fontSize: "2.75rem", fontWeight: 750, lineHeight: 1, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{b.projectedDays}</Typography>
                  <Typography color="text.secondary">of {b.entitlement} working days</Typography>
                </Stack>
              </Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", flexWrap: "wrap", gap: 1 }}>
                <Chip size="small" label={p.user.category} />
                {b.carryover > 0 && <Chip size="small" color="info" label={`+${b.carryover} carried over`} />}
              </Stack>
            </Stack>
            <Box sx={{ mt: 2.5 }}>
              <BalanceBar total={b.entitlement} segments={segments} height={12} />
            </Box>
            <Divider sx={{ my: 2.5 }} />
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, md: 3 }}><Stat label="Approved leave" value={b.approvedDays} hint={`${b.takenToDate} taken · ${b.scheduledDays} booked`} /></Grid>
              <Grid size={{ xs: 6, md: 3 }}><Stat label="Pending approval" value={b.pendingDays} hint="Not yet deducted" tone={b.pendingDays ? "warning" : undefined} /></Grid>
              <Grid size={{ xs: 6, md: 3 }}><Stat label="In approved plan" value={b.plannedDays} hint={approved ? `Plan v${approved.version}` : "No approved plan"} /></Grid>
              <Grid size={{ xs: 6, md: 3 }}><Stat label="Unallocated" value={b.unallocatedDays} hint="Not yet planned" tone={b.unallocatedDays < 0 ? "error" : undefined} /></Grid>
            </Grid>
          </Section>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Section title="Annual master plan" action={<Button size="small" component={Link} href={`/plan?year=${p.year}`}>Open</Button>} sx={{ height: "100%" }}>
            <PlanProgress state={planState} amendment={!!p.working?.amendsPlanId} />
            <Box sx={{ mt: 2 }}>
              {approved ? (
                <Stack spacing={0.75}>
                  {approved.periods.map((pp) => (
                    <Stack key={pp.start} direction="row" sx={{ justifyContent: "space-between" }}>
                      <Typography variant="body2">{formatRange(pp)}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>{pp.days} d</Typography>
                    </Stack>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {p.working ? `Your ${p.year} plan is ${p.working.status === "submitted" ? "awaiting approval" : p.working.status === "returned" ? "returned for revision" : "in draft"}.` : `You haven't planned your ${p.year} leave yet. Leave can be requested once your plan is approved.`}
                </Typography>
              )}
              {p.working?.status === "returned" && p.working.decisionReason && (
                <Alert severity="info" sx={{ mt: 1.5 }}>{p.working.decisionReason}</Alert>
              )}
              {p.working && approved && (
                <Alert severity="warning" sx={{ mt: 1.5 }}>Amendment v{p.working.version} is {p.working.status === "submitted" ? "awaiting approval" : p.working.status}.</Alert>
              )}
            </Box>
          </Section>
        </Grid>

        <Grid size={12}>
          <Section
            title={`${p.year} at a glance`}
            subtitle="Your planned days per month and organisation-wide scheduling capacity (dots = employee slots)."
            action={<Button size="small" component={Link} href={`/calendar?year=${p.year}`} endIcon={<ArrowForwardIcon />}>Calendar</Button>}
          >
            <MonthStrip year={p.year} occupancy={p.data.occupancy} restrictedMonths={p.data.restrictedMonths}
              myDays={approved?.monthly ?? {}} myLabel="planned" ownMonths={ownMonths}
              onPick={(m) => router.push(`/calendar?month=${m}`)} />
          </Section>
        </Grid>

        <Grid size={{ xs: 12, lg: 8 }}>
          <Section
            title="My requests"
            action={
              <ToggleButtonGroup size="small" exclusive value={filter} onChange={(_, v) => v && setFilter(v)} aria-label="Filter requests"
                sx={{ "& .MuiToggleButton-root": { textTransform: "none", px: 1.25, py: 0.25, fontWeight: 600 } }}>
                {FILTERS.map((f) => <ToggleButton key={f.key} value={f.key}>{f.label}</ToggleButton>)}
              </ToggleButtonGroup>
            }
          >
            {shown.length === 0 ? (
              <EmptyState compact icon={<BeachAccessOutlinedIcon />} title={filter === "all" ? `No requests for ${p.year}` : "Nothing here"}
                description={approved ? "Book leave inside your approved plan periods." : "Requests open once your annual plan is approved."}
                action={approved && filter === "all" ? <Button variant="outlined" component={Link} href="/requests/new">Request leave</Button> : undefined} />
            ) : (
              <Stack divider={<Divider flexItem />}>
                {shown.slice(0, 6).map((r) => (
                  <Stack key={r.id} direction="row" spacing={2} sx={{ py: 1.25, alignItems: "center" }}>
                    <DateBlock iso={r.start} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatRange(r)}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                        {r.days} working days · {r.decisionReason ? `${r.decidedByName}: ${r.decisionReason}` : r.status === "pending" ? `Awaiting ${r.approverName ?? "HR"}` : `Submitted ${fmtDateTime(r.submittedAt)}`}
                      </Typography>
                    </Box>
                    <StatusChip status={r.status} />
                  </Stack>
                ))}
              </Stack>
            )}
            {shown.length > 6 && <Button size="small" component={Link} href="/requests" sx={{ mt: 1 }}>View all {shown.length}</Button>}
          </Section>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2.5}>
            <Section title="Next leave">
              {next ? (
                <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                  <Box sx={{ width: 48, height: 48, borderRadius: 2, display: "grid", placeItems: "center", bgcolor: "leave.approved", color: "leave.approvedText" }}>
                    <EventAvailableOutlinedIcon />
                  </Box>
                  <Box>
                    <Typography variant="subtitle1">{formatRange(next)}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {next.start <= today ? "On leave now" : `Starts ${relativeDays(next.start, today)}`} · {next.days} days
                    </Typography>
                  </Box>
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">No approved leave coming up.</Typography>
              )}
            </Section>
            <Section title="Recent activity" action={<Button size="small" component={Link} href="/notifications">All</Button>}>
              {p.notifications.length === 0 ? (
                <EmptyState compact icon={<NotificationsNoneOutlinedIcon />} title="You're all caught up" />
              ) : (
                <Stack spacing={1.5}>
                  {p.notifications.map((n) => (
                    <Stack key={n.id} direction="row" spacing={1.25}>
                      <Box sx={{ width: 7, height: 7, mt: 0.9, borderRadius: "50%", flexShrink: 0, bgcolor: n.read_at ? "divider" : "secondary.main" }} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: n.read_at ? 500 : 650 }}>{n.title}</Typography>
                        <Typography variant="caption" color="text.secondary">{fmtDateTime(n.created_at)}</Typography>
                      </Box>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Section>
          </Stack>
        </Grid>
      </Grid>
    </>
  );
}
