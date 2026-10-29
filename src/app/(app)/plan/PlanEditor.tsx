"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid2";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import EditCalendarOutlinedIcon from "@mui/icons-material/EditCalendarOutlined";
import EventNoteOutlinedIcon from "@mui/icons-material/EventNoteOutlined";
import { messages } from "@/domain/messages";
import { analysePlan } from "@/domain/planRules";
import { hasErrors } from "@/domain/requestRules";
import type { Issue, MonthKey, Period } from "@/domain/types";
import { formatRange, monthKey, monthNumber, monthlyBreakdown, yearMonths } from "@/domain/workingDays";
import LeaveCalendar, { MonthStrip, type Selection } from "@/components/LeaveCalendar";
import PlanProgress from "@/components/PlanProgress";
import { IssueAlerts, PageHeader, Section, StatusChip } from "@/components/common";
import ActivityTimeline from "@/components/ui/ActivityTimeline";
import EmptyState from "@/components/ui/EmptyState";
import MonthBars from "@/components/ui/MonthBars";
import { useToast } from "@/components/ui/Toaster";
import ValidationSummary from "@/components/ui/ValidationSummary";
import { ApiError, api, errorText } from "@/lib/client";
import { fmtDateTime } from "@/lib/format";
import type { Plan } from "@/server/repos/leave";
import type { CalendarData } from "@/server/services/queries";

interface Props {
  data: CalendarData;
  years: number[];
  category: string;
  working: Plan | null;
  approved: Plan | null;
  versions: Plan[];
  history: { id: number; ts: string; actor: string; summary: string }[];
  suggestAmend: boolean;
}

const key = (p: Period) => `${p.start}|${p.end}`;

export default function PlanEditor({ data, years, category, working, approved, versions, history, suggestAmend }: Props) {
  const router = useRouter();
  const toast = useToast();
  const editable = !working || working.status === "draft" || working.status === "returned";
  const canEdit = editable && !(approved && !working); // an approved plan changes only through an amendment
  const baseline = useMemo(
    () => (working?.periods ?? approved?.periods ?? []).map((p) => ({ start: p.start, end: p.end })),
    [working, approved],
  );
  const [periods, setPeriods] = useState<Period[]>(baseline);
  const firstOpen = yearMonths(data.year).find((m) => !data.restrictedMonths.includes(monthNumber(m))) ?? monthKey(data.year, 1);
  const [month, setMonth] = useState<MonthKey>(periods[0]?.start.slice(0, 7) ?? firstOpen);
  const [sel, setSel] = useState<Selection>({});
  const [clickIssue, setClickIssue] = useState<Issue | null>(null);
  const [serverIssues, setServerIssues] = useState<Issue[]>([]);
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);

  const holidays = useMemo(() => new Map(data.holidays.map((h) => [h.date, h.name])), [data.holidays]);
  const holidaySet = useMemo(() => new Set(holidays.keys()), [holidays]);
  const approvedRequests = data.requests.filter((r) => r.status === "approved");
  const ctx = {
    employeeId: data.employeeId, planId: working?.id, year: data.year, entitlement: data.entitlement, holidays: holidaySet,
    restrictedMonths: data.restrictedMonths, capacity: data.capacity, allocations: data.allocations,
    approvedRequests, mode: "submit" as const,
  };
  const analysis = analysePlan(periods, ctx);
  const ownMonths = new Set(data.allocations
    .filter((a) => a.employeeId === data.employeeId && !(a.sourceType === "plan" && a.sourceId === working?.id))
    .map((a) => a.month));
  const blocked = new Set(Object.keys(analysis.monthly).filter((m) =>
    !data.restrictedMonths.includes(monthNumber(m)) && !ownMonths.has(m) && (data.occupancy[m]?.count ?? 0) >= data.capacity));
  const dirty = canEdit && JSON.stringify(periods) !== JSON.stringify(baseline);

  // Immediate feedback for the current selection, checked as if it were added to the plan.
  const selPeriod = sel.start ? { start: sel.start, end: sel.end ?? sel.start } : null;
  const selDays = selPeriod ? Object.values(monthlyBreakdown(selPeriod.start, selPeriod.end, holidaySet)).reduce((a, b) => a + b, 0) : 0;
  const selIssues = selPeriod
    ? analysePlan([...periods, selPeriod], ctx).issues.filter((i) => !analysis.issues.some((j) => j.title === i.title && j.message === i.message))
    : [];

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function addSelection() {
    if (!selPeriod || hasErrors(selIssues)) return;
    setPeriods([...periods, selPeriod].sort((a, b) => a.start.localeCompare(b.start)));
    setSel({});
    setServerIssues([]);
  }

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setServerIssues([]);
    try {
      await fn();
      toast.success(ok);
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.issues.length) setServerIssues(e.issues);
      else toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const save = () => run(() => api("/api/plans", "POST", { year: data.year, periods }), "Draft saved.");
  const submit = () => run(async () => {
    const plan = await api<Plan>("/api/plans", "POST", { year: data.year, periods });
    await api(`/api/plans/${plan.id}/submit`);
  }, working?.amendsPlanId ? "Amendment submitted for approval." : "Plan submitted for approval.");
  const amend = () => run(() => api("/api/plans/amend", "POST", { year: data.year }), "Amendment started. Adjust your periods, then submit.");
  const discard = () => run(() => api(`/api/plans/${working!.id}`, "DELETE"), "Draft discarded.");

  const state = working ? (working.status as "draft" | "submitted" | "returned") : approved ? "approved" : "none";
  const amending = !!working?.amendsPlanId && !!approved;
  const approvedKeys = new Set(approved?.periods.map(key) ?? []);
  const currentKeys = new Set(periods.map(key));
  const removed = amending ? approved!.periods.filter((p) => !currentKeys.has(key(p))) : [];
  const pct = Math.min(100, (analysis.total / Math.max(1, data.entitlement)) * 100);
  const over = analysis.total > data.entitlement;
  const issues = serverIssues.length ? serverIssues : analysis.issues;

  return (
    <Box>
      <PageHeader
        eyebrow="Annual master leave plan"
        title={`${data.year} leave plan`}
        subtitle={`Plan exact leave dates for the year. ${category}: ${data.entitlement} working days. Weekends and public holidays are not counted.`}
        actions={
          <TextField select size="small" value={data.year} aria-label="Plan year" sx={{ width: 104 }}
            onChange={(e) => { if (!dirty || confirm("Discard unsaved changes?")) router.push(`/plan?year=${e.target.value}`); }}>
            {years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
          </TextField>
        }
      />

      <Section dense sx={{ mb: 2.5 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: { md: "center" } }}>
          <Box sx={{ flex: 1, maxWidth: 520 }}><PlanProgress state={state} amendment={!!working?.amendsPlanId} /></Box>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            {state === "none" && "Start by selecting your leave periods on the calendar."}
            {state === "draft" && `${amending ? "Amendment" : "Draft"} v${working!.version} · last saved ${fmtDateTime(working!.updatedAt)}`}
            {state === "submitted" && `Submitted ${fmtDateTime(working!.submittedAt)} · awaiting ${working!.approverName ?? "HR"}`}
            {state === "returned" && `Returned by ${working!.decidedByName}`}
            {state === "approved" && `v${approved!.version} approved by ${approved!.decidedByName} · ${fmtDateTime(approved!.decidedAt)}`}
          </Typography>
          {approved && !working && (
            <Button variant={suggestAmend ? "contained" : "outlined"} startIcon={<EditCalendarOutlinedIcon />} onClick={amend} disabled={busy}>
              Request amendment
            </Button>
          )}
        </Stack>
      </Section>

      <Stack spacing={1.5} sx={{ mb: 2.5, "&:empty": { display: "none" } }}>
        {working?.status === "returned" && (
          <Alert severity="info"><b>Returned for revision.</b> {working.decisionReason}</Alert>
        )}
        {working?.status === "submitted" && (
          <Alert severity="warning">This plan is awaiting approval. Its months are reserved against monthly capacity, and it can&apos;t be edited until a decision is made.</Alert>
        )}
        {approved && !working && suggestAmend && (
          <Alert severity="info">Your requested dates aren&apos;t in your approved plan. Request an amendment to change your planned periods; your current plan stays in force until the amendment is approved.</Alert>
        )}
        {amending && (
          <Alert severity="info">You&apos;re amending approved plan v{approved!.version}. It stays in force until this amendment is approved. Approved leave must stay inside the amended plan.</Alert>
        )}
      </Stack>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Stack spacing={2.5}>
            <Section title={canEdit ? "Choose leave periods" : "Planned periods"} subtitle={canEdit ? "Click a start date, then an end date. Each period can be any length." : undefined}>
              <MonthStrip year={data.year} occupancy={data.occupancy} restrictedMonths={data.restrictedMonths}
                myDays={analysis.monthly} myLabel="in plan" current={month} onPick={setMonth} ownMonths={ownMonths} />
              <Box sx={{ mt: 3 }}>
                <LeaveCalendar
                  month={month} onMonthChange={setMonth} minMonth={monthKey(data.year, 1)} maxMonth={monthKey(data.year, 12)}
                  holidays={holidays} restrictedMonths={data.restrictedMonths} occupancy={data.occupancy} ownMonths={ownMonths}
                  layers={{ draft: periods, approved: approvedRequests, pending: data.requests.filter((r) => r.status === "pending") }}
                  showDraft today={data.today} selection={canEdit ? sel : {}}
                  onSelect={canEdit ? (s) => { setSel(s); setClickIssue(null); } : undefined}
                  onRestricted={(m) => setClickIssue(messages.restricted(data.restrictedMonths, m))}
                />
              </Box>
              {clickIssue && <Box sx={{ mt: 2 }}><IssueAlerts issues={[clickIssue]} /></Box>}
              {canEdit && (
                <Box sx={{ mt: 2.5 }}>
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: "background.default" }}>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {selPeriod ? <><b>{formatRange(selPeriod)}</b> · {selDays} working day{selDays === 1 ? "" : "s"}</> : "No dates selected"}
                      </Typography>
                      <Link component="button" variant="body2" onClick={() => setManual(!manual)} underline="hover">
                        {manual ? "Hide date fields" : "Type dates instead"}
                      </Link>
                      {selPeriod && <Button size="small" onClick={() => setSel({})}>Clear</Button>}
                      <Button variant="contained" startIcon={<AddIcon />} onClick={addSelection} disabled={!selPeriod || hasErrors(selIssues)}>
                        Add to plan
                      </Button>
                    </Stack>
                    <Collapse in={manual}>
                      <Stack direction="row" spacing={1.5} sx={{ mt: 1.5 }}>
                        <TextField type="date" label="Start date" value={sel.start ?? ""} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: `${data.year}-01-01`, max: `${data.year}-12-31` } }} fullWidth
                          onChange={(e) => { const v = e.target.value || undefined; setSel({ start: v, end: sel.end && v && sel.end >= v ? sel.end : undefined }); if (v) setMonth(v.slice(0, 7)); }} />
                        <TextField type="date" label="End date" value={sel.end ?? ""} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: sel.start ?? `${data.year}-01-01`, max: `${data.year}-12-31` } }} fullWidth
                          onChange={(e) => setSel({ ...sel, end: e.target.value || undefined })} />
                      </Stack>
                    </Collapse>
                  </Paper>
                  {selIssues.length > 0 && <Box sx={{ mt: 1.5 }}><IssueAlerts issues={selIssues} /></Box>}
                </Box>
              )}
            </Section>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2.5} sx={{ position: { lg: "sticky" }, top: { lg: 88 } }}>
            <Section title="Summary">
              <Stack direction="row" sx={{ alignItems: "baseline", justifyContent: "space-between" }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "baseline" }}>
                  <Typography sx={{ fontSize: "1.875rem", fontWeight: 750, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: over ? "error.main" : "text.primary" }}>{analysis.total}</Typography>
                  <Typography color="text.secondary">/ {data.entitlement} days planned</Typography>
                </Stack>
              </Stack>
              <LinearProgress variant="determinate" value={pct} color={over ? "error" : analysis.total === data.entitlement ? "success" : "primary"} sx={{ height: 8, mt: 1.5 }} />
              <Typography variant="caption" color={over ? "error" : "text.secondary"} sx={{ display: "block", mt: 0.75 }}>
                {over ? `${analysis.total - data.entitlement} days over your entitlement` : analysis.unallocated === 0 ? "Fully allocated" : `${analysis.unallocated} days still unallocated`}
              </Typography>

              <Divider sx={{ my: 2 }} />
              <Typography variant="overline" color="text.secondary">Periods</Typography>
              {periods.length === 0 && removed.length === 0 ? (
                <EmptyState compact icon={<EventNoteOutlinedIcon />} title="No periods yet" description="Select dates on the calendar to add your first leave period." />
              ) : (
                <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                  {analysis.periods.map((p, i) => (
                    <Stack key={key(p)} direction="row" spacing={1} sx={{ alignItems: "center", py: 0.5, px: 1, borderRadius: 1.5, bgcolor: "leave.planned", color: "leave.plannedText" }}>
                      <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }}>{formatRange(p)}</Typography>
                      {amending && !approvedKeys.has(key(p)) && <Chip size="small" color="success" label="New" />}
                      <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>{p.days} d</Typography>
                      {canEdit && (
                        <Tooltip title="Remove period">
                          <IconButton size="small" aria-label={`Remove ${formatRange(p)}`} onClick={() => { setPeriods(periods.filter((_, j) => j !== i)); setServerIssues([]); }} sx={{ color: "inherit" }}>
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  ))}
                  {removed.map((p) => (
                    <Stack key={`r${key(p)}`} direction="row" spacing={1} sx={{ alignItems: "center", py: 0.5, px: 1, borderRadius: 1.5, border: 1, borderStyle: "dashed", borderColor: "divider" }}>
                      <Typography variant="body2" color="text.secondary" sx={{ flex: 1, textDecoration: "line-through" }}>{formatRange(p)}</Typography>
                      <Chip size="small" label="Removed" />
                    </Stack>
                  ))}
                </Stack>
              )}

              <Divider sx={{ my: 2 }} />
              <Typography variant="overline" color="text.secondary">Monthly allocation</Typography>
              <Box sx={{ mt: 1 }}>
                <MonthBars year={data.year} values={analysis.monthly} compare={amending ? approved!.monthly : undefined}
                  restrictedMonths={data.restrictedMonths} blocked={blocked} />
              </Box>
              {amending && <Typography variant="caption" color="text.secondary">Dashed outline = currently approved plan.</Typography>}

              {canEdit && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <ValidationSummary issues={issues} emptyText={periods.length === 0 ? "Add at least one period to check it against the rules." : undefined}
                    okText="All scheduling rules pass" />
                </>
              )}
            </Section>

            <Section title="History">
              {versions.length > 1 && (
                <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75, mb: 2 }}>
                  {versions.map((v) => (
                    <Tooltip key={v.id} title={v.periods.map(formatRange).join("; ") || "No periods"}>
                      <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700 }}>v{v.version}</Typography>
                        <StatusChip status={v.status} />
                      </Box>
                    </Tooltip>
                  ))}
                </Stack>
              )}
              <ActivityTimeline items={history} max={8} />
            </Section>
          </Stack>
        </Grid>
      </Grid>

      {canEdit && (
        <Paper elevation={0} sx={(t) => ({
          position: "sticky", bottom: 16, zIndex: 20, mt: 2.5,
          px: 2, py: 1.25, borderRadius: 3, border: 1, borderColor: "divider",
          boxShadow: "0 12px 32px rgba(16,24,40,0.16)", bgcolor: `rgba(${t.vars!.palette.background.paperChannel} / 0.92)`, backdropFilter: "blur(8px)",
        })}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", flexWrap: "wrap", gap: 1, justifyContent: "flex-end" }}>
            <Typography variant="body2" color={dirty ? "warning.main" : "text.secondary"} sx={{ fontWeight: 600, mr: "auto" }}>
              {dirty ? "● Unsaved changes" : working ? "All changes saved" : "Not saved yet"}
            </Typography>
            {working?.status === "draft" && <Button color="error" onClick={discard} disabled={busy}>Discard</Button>}
            <Button variant="outlined" onClick={save} disabled={busy || (!dirty && !!working)}>Save draft</Button>
            <Button variant="contained" onClick={submit} disabled={busy || periods.length === 0 || hasErrors(analysis.issues)}>
              Submit {working?.amendsPlanId ? "amendment" : "plan"}
            </Button>
          </Stack>
        </Paper>
      )}
    </Box>
  );
}
