"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import Grid from "@mui/material/Grid2";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { Theme } from "@mui/material/styles";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import CloseIcon from "@mui/icons-material/Close";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import KeyboardOutlinedIcon from "@mui/icons-material/KeyboardOutlined";
import { hasErrors } from "@/domain/requestRules";
import type { Issue } from "@/domain/types";
import { formatRange, monthLabel } from "@/domain/workingDays";
import ReasonDialog from "@/components/ReasonDialog";
import { IssueAlerts, KeyValue, PageHeader, StatusChip } from "@/components/common";
import ActivityTimeline from "@/components/ui/ActivityTimeline";
import BalanceBar from "@/components/ui/BalanceBar";
import EmptyState from "@/components/ui/EmptyState";
import MonthBars from "@/components/ui/MonthBars";
import { useToast } from "@/components/ui/Toaster";
import { ApiError, api, errorText } from "@/lib/client";
import { daysBetween, fmtDateTime, initials, relativeDays } from "@/lib/format";
import type { QueueItem } from "@/server/services/queries";

type Decision = "approve" | "reject" | "return";

const DECISION_TEXT: Record<Decision, { title: string; label: string; color: "success" | "error" | "warning"; required: boolean }> = {
  approve: { title: "Approve", label: "Approve", color: "success", required: false },
  return: { title: "Return for revision", label: "Return for revision", color: "warning", required: true },
  reject: { title: "Reject", label: "Reject", color: "error", required: true },
};

const itemKey = (i: QueueItem) => `${i.kind}-${i.id}`;
const kindLabel = (i: QueueItem) => (i.kind === "plan" ? (i.plan?.amendsPlanId ? "Plan amendment" : "Annual plan") : "Leave request");

function Kbd({ children }: { children: React.ReactNode }) {
  return <Box component="kbd" sx={{ fontFamily: "inherit", fontSize: 11, border: 1, borderColor: "divider", borderRadius: 0.75, px: 0.6, ml: 0.75, color: "text.secondary" }}>{children}</Box>;
}

function Detail({ item, isHistory, today, liveIssues, onDecide, busy, restrictedMonths }: {
  item: QueueItem; isHistory: boolean; today: string; liveIssues: Issue[]; onDecide: (d: Decision) => void; busy: boolean; restrictedMonths: number[];
}) {
  const b = item.balance;
  const issues = liveIssues.length ? liveIssues : item.issues;
  const blocked = hasErrors(issues);
  const status = item.plan?.status ?? item.request?.status ?? "";
  const prev = item.previousPlan;
  const prevKeys = new Set(prev?.periods.map((p) => `${p.start}|${p.end}`) ?? []);
  const curKeys = new Set(item.plan?.periods.map((p) => `${p.start}|${p.end}`) ?? []);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ p: { xs: 2, md: 3 }, flex: 1, overflowY: "auto" }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 2.5 }}>
          <Avatar sx={{ bgcolor: "primary.main", color: "primary.contrastText", fontWeight: 700 }}>{initials(item.employee.name)}</Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" noWrap>{item.employee.name}</Typography>
            <Typography variant="body2" color="text.secondary" noWrap>{item.employee.title} · {item.employee.department}</Typography>
          </Box>
          {isHistory && <StatusChip status={status} size="medium" />}
        </Stack>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2.5 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
            <Chip size="small" label={kindLabel(item)} color={item.kind === "plan" ? "primary" : "secondary"} variant="outlined" />
            <Chip size="small" label={item.employee.category} />
            <Typography variant="caption" color="text.secondary">Submitted {fmtDateTime(item.submittedAt)} ({relativeDays(item.submittedAt, today)})</Typography>
          </Stack>
          {item.request ? (
            <>
              <Typography variant="h5">{formatRange(item.request)}</Typography>
              <Typography variant="body2" color="text.secondary">{item.request.days} working days · {item.request.leaveType}</Typography>
              {item.request.reason && <Typography variant="body2" sx={{ mt: 1.5, p: 1.5, borderRadius: 1.5, bgcolor: "action.hover" }}>“{item.request.reason}”</Typography>}
              {item.request.attachmentName && (
                <Button size="small" sx={{ mt: 1 }} startIcon={<AttachFileIcon />} href={`/api/requests/${item.request.id}/attachment`}>{item.request.attachmentName}</Button>
              )}
            </>
          ) : item.plan && (
            <>
              <Typography variant="h5">{item.plan.totalDays} days in {item.plan.periods.length} period{item.plan.periods.length === 1 ? "" : "s"}</Typography>
              <Stack spacing={0.5} sx={{ mt: 1.5 }}>
                {item.plan.periods.map((p) => (
                  <Stack key={p.id} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Typography variant="body2" sx={{ flex: 1 }}>{formatRange(p)}</Typography>
                    {prev && !prevKeys.has(`${p.start}|${p.end}`) && <Chip size="small" color="success" label="New" />}
                    <Typography variant="body2" color="text.secondary">{p.days} d</Typography>
                  </Stack>
                ))}
                {prev?.periods.filter((p) => !curKeys.has(`${p.start}|${p.end}`)).map((p) => (
                  <Stack key={`r${p.id}`} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Typography variant="body2" color="text.secondary" sx={{ flex: 1, textDecoration: "line-through" }}>{formatRange(p)}</Typography>
                    <Chip size="small" label="Removed" />
                  </Stack>
                ))}
              </Stack>
            </>
          )}
        </Paper>

        {!isHistory && (
          <Box sx={{ mb: 2.5 }}>
            <Typography variant="overline" color="text.secondary">Rule check · revalidated now</Typography>
            <Box sx={{ mt: 0.75 }}>
              <IssueAlerts issues={issues} success="All mandatory rules pass. This can be approved." />
              {blocked && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  Approval is blocked while a mandatory rule is violated. Return it for revision{item.kind === "request" ? ", or ask the employee to amend their plan" : ""}.
                </Alert>
              )}
            </Box>
          </Box>
        )}
        {isHistory && (item.plan?.decisionReason || item.request?.decisionReason) && (
          <Alert severity="info" sx={{ mb: 2.5 }}>Decision note: {item.plan?.decisionReason ?? item.request?.decisionReason}</Alert>
        )}

        <Grid container spacing={2.5}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="overline" color="text.secondary">Annual balance</Typography>
            <Box sx={{ mt: 1 }}>
              <BalanceBar total={b.entitlement} height={8} segments={[
                { key: "a", label: "Approved", value: b.approvedDays, color: "chart.taken" },
                { key: "p", label: "Pending", value: b.pendingDays, color: "chart.pending", hatch: true },
                { key: "r", label: "Left", value: Math.max(0, b.projectedDays), color: "chart.remaining" },
              ]} />
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                Entitlement {b.entitlement} · in approved plan {b.plannedDays}
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="overline" color="text.secondary">{item.kind === "plan" ? "Monthly allocation" : "Plan coverage"}</Typography>
            <Box sx={{ mt: 1 }}>
              {item.kind === "plan" ? (
                <MonthBars year={item.plan!.year} values={item.monthly} compare={prev?.monthly} restrictedMonths={restrictedMonths}
                  blocked={new Set(Object.keys(item.capacity).filter((m) => item.capacity[m].count - (item.capacity[m].includesEmployee ? 1 : 0) >= item.capacity[m].capacity))} />
              ) : (
                <KeyValue rows={[
                  ["Approved plan", item.approvedPlan ? item.approvedPlan.periods.map(formatRange).join("; ") : "None"],
                  ...Object.entries(item.monthly).map(([m, d]) => [monthLabel(m), `${d} requested · ${item.planMonthly?.[m] ?? 0} in plan`] as [string, string]),
                ]} />
              )}
            </Box>
          </Grid>
        </Grid>

        <Box sx={{ mt: 2.5 }}>
          <Typography variant="overline" color="text.secondary">Monthly capacity & who else is off</Typography>
          <Table size="small" sx={{ mt: 0.5 }}>
            <TableHead><TableRow><TableCell>Month</TableCell><TableCell>Slots</TableCell><TableCell>Also scheduled</TableCell></TableRow></TableHead>
            <TableBody>
              {Object.keys(item.monthly).map((m) => {
                const c = item.capacity[m];
                return (
                  <TableRow key={m}>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{monthLabel(m)}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <span>{c.count}/{c.capacity}</span><StatusChip status={c.status} />
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">
                        {[...c.others, ...(c.hiddenOthers ? [`${c.hiddenOthers} other${c.hiddenOthers === 1 ? "" : "s"}`] : [])].join(", ") || "Nobody else"}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>

        <Divider sx={{ my: 2.5 }} />
        <Typography variant="overline" color="text.secondary">History</Typography>
        <Box sx={{ mt: 1 }}><ActivityTimeline items={[...item.history].reverse()} /></Box>
      </Box>

      {!isHistory && (
        <Stack direction="row" spacing={1} sx={{ p: 2, borderTop: 1, borderColor: "divider", justifyContent: "flex-end", flexWrap: "wrap", gap: 1, bgcolor: "background.paper" }}>
          <Button color="error" variant="outlined" onClick={() => onDecide("reject")} disabled={busy}>Reject<Kbd>X</Kbd></Button>
          <Button color="warning" variant="outlined" onClick={() => onDecide("return")} disabled={busy}>Return<Kbd>R</Kbd></Button>
          <Tooltip title={blocked ? "Blocked by a rule violation" : ""}>
            <span><Button color="success" variant="contained" onClick={() => onDecide("approve")} disabled={busy || blocked}>Approve<Kbd>A</Kbd></Button></span>
          </Tooltip>
        </Stack>
      )}
    </Box>
  );
}

export default function ApprovalsBoard({ pending, isHr, today, overdueDays, initialItem, restrictedMonths }: {
  pending: QueueItem[]; isHr: boolean; today: string; overdueDays: number; initialItem: string | null; restrictedMonths: number[];
}) {
  const router = useRouter();
  const toast = useToast();
  const desktop = useMediaQuery((t: Theme) => t.breakpoints.up("md"));
  // A deep link to an item that's no longer pending opens the "Recently decided" tab.
  const initialTab = initialItem && !pending.some((i) => itemKey(i) === initialItem) ? 1 : 0;
  const [tab, setTab] = useState(initialTab);
  // Decided items are loaded on demand, only when that tab is opened.
  const [decided, setDecided] = useState<QueueItem[] | null>(null);
  const [decidedError, setDecidedError] = useState<string | null>(null);
  const [kind, setKind] = useState<"all" | "plan" | "request" | "overdue">("all");
  const [dept, setDept] = useState("");
  const [selected, setSelected] = useState<string | null>(initialItem ?? null);
  const [mobileOpen, setMobileOpen] = useState(!!initialItem);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [liveIssues, setLiveIssues] = useState<Issue[]>([]);

  const waiting = useCallback((iso: string) => Math.max(0, daysBetween(iso, today)), [today]);
  const source = useMemo(() => (tab === 0 ? pending : decided ?? []), [tab, pending, decided]);
  const depts = [...new Set([...pending, ...(decided ?? [])].map((i) => i.employee.department))].sort();
  const list = useMemo(() => source.filter((i) =>
    (kind === "all" || (kind === "overdue" ? waiting(i.submittedAt) > overdueDays : i.kind === kind)) && (!dept || i.employee.department === dept),
  ), [source, kind, dept, waiting, overdueDays]);
  const current = list.find((i) => itemKey(i) === selected) ?? (desktop ? list[0] : undefined) ?? null;

  useEffect(() => { setLiveIssues([]); }, [selected]);

  useEffect(() => {
    if (tab !== 1 || decided !== null) return;
    let live = true;
    setDecidedError(null);
    api<QueueItem[]>("/api/approvals/decided", "GET")
      .then((items) => { if (live) setDecided(items); })
      .catch((e) => { if (live) setDecidedError(errorText(e)); });
    return () => { live = false; };
  }, [tab, decided]);

  const move = useCallback((delta: number) => {
    if (!list.length) return;
    const idx = current ? list.findIndex((i) => itemKey(i) === itemKey(current)) : -1;
    const next = list[Math.min(list.length - 1, Math.max(0, idx + delta))];
    setSelected(itemKey(next));
  }, [list, current]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (decision || e.ctrlKey || e.metaKey || e.altKey || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable) return;
      if (e.key === "j") move(1);
      else if (e.key === "k") move(-1);
      else if (tab === 0 && current) {
        if (e.key === "a" && !hasErrors(liveIssues.length ? liveIssues : current.issues)) setDecision("approve");
        if (e.key === "r") setDecision("return");
        if (e.key === "x") setDecision("reject");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, current, tab, decision, liveIssues]);

  async function decide(reason: string) {
    if (!current || !decision) return;
    setBusy(true);
    setLiveIssues([]);
    const idx = list.findIndex((i) => itemKey(i) === itemKey(current));
    try {
      await api(`/api/${current.kind === "plan" ? "plans" : "requests"}/${current.id}/decision`, "POST", { decision, reason });
      toast.success(`${DECISION_TEXT[decision].label}: ${current.employee.name}'s ${kindLabel(current).toLowerCase()}.`);
      const next = list[idx + 1] ?? list[idx - 1];
      setSelected(next ? itemKey(next) : null);
      if (!next) setMobileOpen(false);
      setDecided(null); // the decided list is stale now; refetch when next opened
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.issues.length) { setLiveIssues(e.issues); toast.error("The rules changed since this page loaded — approval is blocked."); }
      else toast.error(errorText(e));
    } finally {
      setBusy(false);
      setDecision(null);
    }
  }

  const overdueCount = pending.filter((i) => waiting(i.submittedAt) > overdueDays).length;

  const listPane = (
    <Paper sx={{ borderRadius: "14px", overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75 }}>
          {([["all", "All"], ["request", "Requests"], ["plan", "Plans"], ...(tab === 0 ? [["overdue", `Overdue ${overdueCount}`]] : [])] as [typeof kind, string][]).map(([k, l]) => (
            <Chip key={k} size="small" label={l} clickable onClick={() => setKind(k)} color={kind === k ? "primary" : "default"} variant={kind === k ? "filled" : "outlined"} />
          ))}
        </Stack>
        {isHr && depts.length > 1 && (
          <TextField select size="small" fullWidth value={dept} onChange={(e) => setDept(e.target.value)} sx={{ mt: 1.25 }} aria-label="Department" slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
            <MenuItem value="">All departments</MenuItem>
            {depts.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
          </TextField>
        )}
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto" }} role="listbox" aria-label="Items">
        {tab === 1 && decided === null ? (
          decidedError ? <Alert severity="error" sx={{ m: 2 }}>{decidedError}</Alert>
            : <Box sx={{ display: "grid", placeItems: "center", py: 6 }}><CircularProgress size={24} aria-label="Loading decisions" /></Box>
        ) : list.length === 0 ? (
          <EmptyState compact icon={<InboxOutlinedIcon />} title={tab === 0 ? "Inbox zero" : "No decisions yet"} description={tab === 0 ? "Nothing is waiting for your decision." : undefined} />
        ) : list.map((i) => {
          const active = current && itemKey(current) === itemKey(i);
          const w = waiting(i.submittedAt);
          const errs = i.issues.filter((x) => x.severity === "error").length;
          return (
            <ButtonBase key={itemKey(i)} role="option" aria-selected={!!active}
              onClick={() => { setSelected(itemKey(i)); setMobileOpen(true); }}
              sx={{
                display: "flex", width: "100%", textAlign: "left", gap: 1.5, px: 1.75, py: 1.5, borderBottom: 1, borderColor: "divider",
                bgcolor: active ? "action.selected" : "transparent", borderLeft: 3, borderLeftColor: active ? "secondary.main" : "transparent",
                "&:hover": { bgcolor: active ? "action.selected" : "action.hover" },
              }}>
              <Avatar sx={{ width: 34, height: 34, fontSize: 13, fontWeight: 700, bgcolor: "action.selected", color: "text.primary" }}>{initials(i.employee.name)}</Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Typography variant="body2" sx={{ fontWeight: 650, flex: 1 }} noWrap>{i.employee.name}</Typography>
                  <Typography variant="caption" color={tab === 0 && w > overdueDays ? "error.main" : "text.secondary"} sx={{ fontWeight: tab === 0 && w > overdueDays ? 700 : 400, whiteSpace: "nowrap" }}>
                    {tab === 0 ? (w > overdueDays ? `${w}d overdue` : relativeDays(i.submittedAt, today)) : ""}
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                  {kindLabel(i)} · {i.request ? formatRange(i.request) : `${i.days} days`}
                </Typography>
                <Stack direction="row" spacing={0.75} sx={{ mt: 0.5 }}>
                  {tab === 1 && <StatusChip status={i.plan?.status ?? i.request?.status ?? ""} />}
                  {tab === 0 && errs > 0 && <StatusChip status="rejected" label={`${errs} rule issue${errs === 1 ? "" : "s"}`} />}
                  {tab === 0 && errs === 0 && <StatusChip status="approved" label="Rules pass" />}
                </Stack>
              </Box>
            </ButtonBase>
          );
        })}
      </Box>
    </Paper>
  );

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle={isHr ? "Every pending annual plan and leave request across the organisation." : "Annual plans and leave requests routed to you."}
        actions={desktop && (
          <Tooltip title="J / K to move · A approve · R return · X reject">
            <Chip icon={<KeyboardOutlinedIcon />} label="Keyboard shortcuts" variant="outlined" />
          </Tooltip>
        )}
      />
      <Tabs value={tab} onChange={(_, v) => { setTab(v); setSelected(null); setKind("all"); }} sx={{ mb: 2 }}>
        <Tab label={`Pending (${pending.length})`} />
        <Tab label="Recently decided" />
      </Tabs>

      <Grid container spacing={2.5} sx={{ height: { md: "calc(100vh - 250px)" }, minHeight: { md: 560 } }}>
        <Grid size={{ xs: 12, md: 4 }} sx={{ height: { md: "100%" } }}>{listPane}</Grid>
        {desktop && (
          <Grid size={{ md: 8 }} sx={{ height: "100%" }}>
            <Paper sx={{ borderRadius: "14px", overflow: "hidden", height: "100%" }}>
              {current ? (
                <Detail item={current} isHistory={tab === 1} today={today} liveIssues={liveIssues} onDecide={setDecision} busy={busy} restrictedMonths={restrictedMonths} />
              ) : (
                <EmptyState icon={<InboxOutlinedIcon />} title="Select an item" description="Choose a plan or request from the list to review it." />
              )}
            </Paper>
          </Grid>
        )}
      </Grid>

      {!desktop && (
        <Drawer anchor="right" open={mobileOpen && !!current} onClose={() => setMobileOpen(false)} slotProps={{ paper: { sx: { width: "100%" } } }}>
          <Stack direction="row" sx={{ alignItems: "center", px: 1, py: 1, borderBottom: 1, borderColor: "divider" }}>
            <IconButton onClick={() => setMobileOpen(false)} aria-label="Back to list"><CloseIcon /></IconButton>
            <Typography variant="subtitle1">{current ? kindLabel(current) : ""}</Typography>
          </Stack>
          {current && <Detail item={current} isHistory={tab === 1} today={today} liveIssues={liveIssues} onDecide={setDecision} busy={busy} restrictedMonths={restrictedMonths} />}
        </Drawer>
      )}

      <ReasonDialog
        open={!!decision} busy={busy}
        title={decision && current ? `${DECISION_TEXT[decision].title}: ${current.employee.name}` : ""}
        description={decision === "approve" ? "Every mandatory rule is checked again on the server before the approval is recorded." : "The employee is notified with your reason."}
        confirmLabel={decision ? DECISION_TEXT[decision].label : ""}
        color={decision ? DECISION_TEXT[decision].color : "primary"}
        required={decision ? DECISION_TEXT[decision].required : false}
        onClose={() => setDecision(null)} onConfirm={decide}
      />
    </>
  );
}
