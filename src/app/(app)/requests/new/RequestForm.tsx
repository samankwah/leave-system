"use client";

import { useMemo, useRef, useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid2";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import EventNoteOutlinedIcon from "@mui/icons-material/EventNoteOutlined";
import { messages } from "@/domain/messages";
import { analyseRequest, hasErrors, type RequestAnalysis } from "@/domain/requestRules";
import type { Issue, MonthKey } from "@/domain/types";
import { formatRange, monthKey, monthKeyOf, monthLabel, monthNumber, yearMonths } from "@/domain/workingDays";
import LeaveCalendar, { type Selection } from "@/components/LeaveCalendar";
import { IssueAlerts, KeyValue, PageHeader, Section } from "@/components/common";
import EmptyState from "@/components/ui/EmptyState";
import FileDrop from "@/components/ui/FileDrop";
import { useToast } from "@/components/ui/Toaster";
import ValidationSummary from "@/components/ui/ValidationSummary";
import { ApiError, api, errorText } from "@/lib/client";
import type { CalendarData } from "@/server/services/queries";

interface Props {
  data: CalendarData;
  years: number[];
  initial: { start?: string; end?: string; leaveType: string; reason: string };
  editing: { id: number; decidedByName: string | null; decisionReason: string | null } | null;
}

function Step({ n, title, done, children, action }: { n: number; title: string; done?: boolean; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Section>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 2 }}>
        <Box sx={{
          width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, flexShrink: 0,
          bgcolor: done ? "success.main" : "primary.main", color: "#fff",
        }}>{done ? "✓" : n}</Box>
        <Typography variant="subtitle1" component="h2" sx={{ flex: 1 }}>{title}</Typography>
        {action}
      </Stack>
      {children}
    </Section>
  );
}

export default function RequestForm({ data, years, initial, editing }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [sel, setSel] = useState<Selection>({ start: initial.start, end: initial.end });
  const [leaveType, setLeaveType] = useState(initial.leaveType);
  const [reason, setReason] = useState(initial.reason);
  const [file, setFile] = useState<File | null>(null);
  const firstMonth = initial.start ? monthKeyOf(initial.start)
    : data.approvedPlan?.periods.find((p) => p.end >= data.today)?.start.slice(0, 7)
      ?? yearMonths(data.year).find((m) => !data.restrictedMonths.includes(monthNumber(m))) ?? monthKey(data.year, 2);
  const [month, setMonth] = useState<MonthKey>(firstMonth);
  const [clickIssue, setClickIssue] = useState<Issue | null>(null);
  const [review, setReview] = useState<(RequestAnalysis & { planId: number | null }) | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [serverIssues, setServerIssues] = useState<Issue[]>([]);
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const reviewRef = useRef<HTMLDivElement>(null);

  const holidays = useMemo(() => new Map(data.holidays.map((h) => [h.date, h.name])), [data.holidays]);
  const holidaySet = useMemo(() => new Set(holidays.keys()), [holidays]);
  const existing = data.requests
    .filter((r) => (r.status === "pending" || r.status === "approved") && r.id !== editing?.id)
    .map((r) => ({ id: r.id, start: r.start, end: r.end, status: r.status as "pending" | "approved", days: r.days }));
  const period = sel.start ? { start: sel.start, end: sel.end ?? sel.start } : null;
  const analysis = period
    ? analyseRequest(period, {
        employeeId: data.employeeId, requestId: editing?.id, today: data.today, holidays: holidaySet,
        restrictedMonths: data.restrictedMonths, capacity: data.capacity, entitlement: data.entitlement,
        approvedPlan: data.approvedPlan?.periods ?? null, existing, allocations: data.allocations, mode: "submit",
      })
    : null;
  // Months where I already hold a slot — excluding the request being revised, which no longer reserves anything.
  const ownMonths = new Set(data.allocations
    .filter((a) => a.employeeId === data.employeeId && !(a.sourceType === "request" && a.sourceId === editing?.id))
    .map((a) => a.month));
  const issues = serverIssues.length ? serverIssues : [...(clickIssue ? [clickIssue] : []), ...(analysis?.issues ?? [])];
  const approvedDays = existing.filter((r) => r.status === "approved").reduce((s, r) => s + r.days, 0);
  const pendingDays = existing.filter((r) => r.status === "pending").reduce((s, r) => s + r.days, 0);
  const available = data.entitlement - approvedDays - pendingDays;
  const mismatch = analysis?.issues.some((i) => i.code === "PLAN_MISMATCH" || i.code === "NO_PLAN");
  const months = analysis ? Object.keys({ ...analysis.planBreakdown, ...analysis.breakdown }).sort() : [];
  const datesOk = !!analysis && !hasErrors(issues);

  function changeSelection(s: Selection) {
    setSel(s);
    setClickIssue(null);
    setServerIssues([]);
    setReview(null);
  }

  async function openReview() {
    if (!period) return;
    setReviewing(true);
    setReview(null);
    try {
      setReview(await api("/api/requests/preview", "POST", { ...period, requestId: editing?.id }));
      setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setReviewing(false);
    }
  }

  async function submit() {
    if (!period) return;
    setBusy(true);
    setServerIssues([]);
    const fd = new FormData();
    fd.set("leaveType", leaveType);
    fd.set("start", period.start);
    fd.set("end", period.end);
    fd.set("reason", reason);
    if (file) fd.set("attachment", file);
    try {
      await api(editing ? `/api/requests/${editing.id}` : "/api/requests", editing ? "PUT" : "POST", fd);
      toast.success(editing ? "Request revised and resubmitted." : "Leave request submitted for approval.");
      router.push("/requests");
      router.refresh();
    } catch (e) {
      setReview(null);
      if (e instanceof ApiError && e.issues.length) setServerIssues(e.issues);
      else toast.error(errorText(e));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: "My requests", href: "/requests" }, { label: editing ? "Revise request" : "New request" }]}
        title={editing ? "Revise leave request" : "Request leave"}
        subtitle="Choose dates inside your approved annual plan. Every rule is checked as you go."
        actions={
          <TextField select size="small" value={data.year} aria-label="Leave year" sx={{ width: 104 }} onChange={(e) => router.push(`/requests/new?year=${e.target.value}`)}>
            {years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
          </TextField>
        }
      />
      {editing && (
        <Alert severity="info" sx={{ mb: 2.5 }}>
          <b>Returned for revision</b> by {editing.decidedByName}: {editing.decisionReason}
        </Alert>
      )}

      {!data.approvedPlan ? (
        <Section>
          <EmptyState icon={<EventNoteOutlinedIcon />} title={`No approved plan for ${data.year}`}
            description="Leave is requested against your approved annual master plan. Prepare your plan and submit it for approval first."
            action={<Button variant="contained" component={NextLink} href={`/plan?year=${data.year}`}>Go to my annual plan</Button>} />
        </Section>
      ) : (
        <Grid container spacing={2.5}>
          <Grid size={{ xs: 12, lg: 8 }}>
            <Stack spacing={2.5}>
              <Step n={1} title="Choose dates" done={datesOk}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Your approved plan periods (click one to use it):</Typography>
                <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, mb: 2.5 }}>
                  {data.approvedPlan.periods.map((p) => {
                    const active = sel.start === p.start && sel.end === p.end;
                    return (
                      <ButtonBase key={p.start} onClick={() => { changeSelection({ start: p.start, end: p.end }); setMonth(monthKeyOf(p.start)); }}
                        aria-pressed={active}
                        sx={{
                          px: 1.5, py: 1, borderRadius: 2, border: 1, textAlign: "left", display: "block",
                          borderColor: active ? "primary.main" : "divider", bgcolor: active ? "leave.range" : "leave.planned", color: "leave.plannedText",
                          "&:hover": { borderColor: "primary.main" },
                        }}>
                        <Typography variant="body2" sx={{ fontWeight: 650 }}>{formatRange(p)}</Typography>
                        <Typography variant="caption">{p.days} working days</Typography>
                      </ButtonBase>
                    );
                  })}
                </Stack>
                <LeaveCalendar
                  month={month} onMonthChange={setMonth} minMonth={monthKey(data.year, 1)} maxMonth={monthKey(data.year, 12)}
                  holidays={holidays} restrictedMonths={data.restrictedMonths} occupancy={data.occupancy} ownMonths={ownMonths}
                  layers={{
                    planned: data.approvedPlan.periods,
                    pending: data.requests.filter((r) => r.status === "pending" && r.id !== editing?.id),
                    approved: data.requests.filter((r) => r.status === "approved"),
                  }}
                  today={data.today} selection={sel} onSelect={changeSelection}
                  onRestricted={(m) => { setClickIssue(messages.restricted(data.restrictedMonths, m)); setReview(null); }}
                />
                <Box sx={{ mt: 1.5 }}>
                  <Link component="button" variant="body2" underline="hover" onClick={() => setManual(!manual)}>{manual ? "Hide date fields" : "Type dates instead"}</Link>
                  <Collapse in={manual}>
                    <Stack direction="row" spacing={1.5} sx={{ mt: 1.5 }}>
                      <TextField type="date" label="Start date" fullWidth value={sel.start ?? ""} slotProps={{ inputLabel: { shrink: true } }}
                        onChange={(e) => { const v = e.target.value || undefined; changeSelection({ start: v, end: sel.end && v && sel.end >= v ? sel.end : v }); if (v) setMonth(monthKeyOf(v)); }} />
                      <TextField type="date" label="End date" fullWidth value={sel.end ?? ""} slotProps={{ inputLabel: { shrink: true } }}
                        onChange={(e) => changeSelection({ ...sel, end: e.target.value || undefined })} />
                    </Stack>
                  </Collapse>
                </Box>
                {issues.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <IssueAlerts issues={issues} />
                    {mismatch && (
                      <Button sx={{ mt: 1 }} component={NextLink} href={`/plan?year=${data.year}&amend=1`} variant="outlined">Request a plan amendment</Button>
                    )}
                  </Box>
                )}
              </Step>

              <Step n={2} title="Details">
                <Stack spacing={2}>
                  <TextField select label="Leave type" value={leaveType} onChange={(e) => setLeaveType(e.target.value)} fullWidth>
                    {data.leaveTypes.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                  </TextField>
                  <TextField label="Reason or note for your approver (optional)" value={reason} onChange={(e) => setReason(e.target.value)} multiline minRows={2}
                    slotProps={{ htmlInput: { maxLength: 1000 } }} helperText={`${reason.length}/1000`} />
                  <FileDrop file={file} onChange={setFile} />
                </Stack>
              </Step>

              <Box ref={reviewRef}>
                <Step n={3} title="Review and submit">
                  {!review ? (
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" } }}>
                      <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                        {datesOk ? "Your dates pass every check. Review the final summary — it is validated again on the server." : "Choose valid dates to continue."}
                      </Typography>
                      <Button onClick={() => router.push("/requests")}>Cancel</Button>
                      <Button variant="contained" onClick={openReview} disabled={!datesOk || reviewing}
                        startIcon={reviewing ? <CircularProgress size={16} color="inherit" /> : undefined}>
                        Review request
                      </Button>
                    </Stack>
                  ) : (
                    <Stack spacing={2}>
                      <KeyValue rows={[
                        ["Leave type", leaveType],
                        ["Dates", period && formatRange(period)],
                        ["Working days", review.days],
                        ["Monthly allocation", Object.entries(review.breakdown).map(([m, d]) => `${monthLabel(m)}: ${d}`).join(" · ")],
                        ["Balance", `${review.available} available → ${review.balanceAfter} after this request`],
                        ["Capacity", Object.keys(review.breakdown).map((m) => `${monthLabel(m)}: ${ownMonths.has(m) ? "uses your reserved slot" : `${data.occupancy[m]?.count ?? 0}/${data.capacity}`}`).join(" · ")],
                        ...(reason ? [["Note", reason] as [string, string]] : []),
                        ...(file ? [["Attachment", file.name] as [string, string]] : []),
                      ]} />
                      <IssueAlerts issues={review.issues} success="Validated on the server. Your approver will be notified when you submit." />
                      <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
                        <Button onClick={() => setReview(null)} disabled={busy}>Edit</Button>
                        <Button variant="contained" onClick={submit} disabled={busy || hasErrors(review.issues)}
                          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>
                          {editing ? "Resubmit request" : "Submit request"}
                        </Button>
                      </Stack>
                    </Stack>
                  )}
                </Step>
              </Box>
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, lg: 4 }}>
            <Stack spacing={2.5} sx={{ position: { lg: "sticky" }, top: { lg: 88 } }}>
              <Section title="Impact">
                <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
                  <Typography sx={{ fontSize: 34, fontWeight: 750, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{analysis?.days ?? 0}</Typography>
                  <Typography color="text.secondary">working days</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">Weekends and public holidays excluded</Typography>

                <Divider sx={{ my: 2 }} />
                <Typography variant="overline" color="text.secondary">Annual balance</Typography>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mt: 0.5 }}>
                  <Box sx={{ textAlign: "center" }}>
                    <Typography sx={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{available}</Typography>
                    <Typography variant="caption" color="text.secondary">available now</Typography>
                  </Box>
                  <Typography color="text.disabled" sx={{ fontSize: 20 }}>→</Typography>
                  <Box sx={{ textAlign: "center" }}>
                    <Typography sx={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: analysis && analysis.balanceAfter < 0 ? "error.main" : "success.main" }}>
                      {analysis ? analysis.balanceAfter : available}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">after this request</Typography>
                  </Box>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                  Entitlement {data.entitlement} · approved {approvedDays} · other pending {pendingDays}
                </Typography>

                {analysis && months.length > 0 && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="overline" color="text.secondary">By month</Typography>
                    <Table size="small" sx={{ mt: 0.5, "& td, & th": { px: 0.75 } }}>
                      <TableHead>
                        <TableRow><TableCell>Month</TableCell><TableCell align="right">Days</TableCell><TableCell align="right">Plan</TableCell><TableCell align="right">Slots</TableCell></TableRow>
                      </TableHead>
                      <TableBody>
                        {months.map((m) => {
                          const req = analysis.breakdown[m] ?? 0;
                          const plan = analysis.planBreakdown[m] ?? 0;
                          const covered = req <= plan || req === 0;
                          const o = data.occupancy[m];
                          const restricted = data.restrictedMonths.includes(monthNumber(m));
                          const fullForMe = !restricted && !ownMonths.has(m) && (o?.count ?? 0) >= data.capacity;
                          return (
                            <TableRow key={m}>
                              <TableCell>{monthLabel(m).split(" ")[0]}</TableCell>
                              <TableCell align="right">{req}</TableCell>
                              <TableCell align="right">
                                <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end", alignItems: "center" }}>
                                  <span>{plan}</span>
                                  {covered ? <CheckCircleRoundedIcon sx={{ fontSize: 15, color: "success.main" }} aria-label="covered by plan" />
                                    : <ErrorOutlineRoundedIcon sx={{ fontSize: 15, color: "error.main" }} aria-label="not covered by plan" />}
                                </Stack>
                              </TableCell>
                              <TableCell align="right" sx={{ color: fullForMe ? "error.main" : undefined, fontWeight: fullForMe ? 700 : undefined }}>
                                {restricted ? "—" : ownMonths.has(m) ? "Yours" : `${o?.count ?? 0}/${data.capacity}`}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </>
                )}

                <Divider sx={{ my: 2 }} />
                <ValidationSummary issues={issues} emptyText={analysis ? undefined : "Select dates to see the rule checks."} okText="All leave rules pass" defaultOpen={false} />
              </Section>
            </Stack>
          </Grid>
        </Grid>
      )}
    </>
  );
}
