"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid2";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import RuleOutlinedIcon from "@mui/icons-material/RuleOutlined";
import { describeWindow } from "@/domain/messages";
import type { RuleStatus, StaffCategory } from "@/domain/types";
import { MONTH_NAMES, formatDate } from "@/domain/workingDays";
import { PageHeader, Section, StatusChip } from "@/components/common";
import { useToast } from "@/components/ui/Toaster";
import { api, errorText } from "@/lib/client";
import type { ApprovalRoute, Holiday, NamedRow } from "@/server/repos/settings";

interface PolicyRow { key: string; label: string; value: unknown; status: RuleStatus; updatedAt: string | null }

const HELP: Record<string, string> = {
  activeYear: "The leave year employees plan for by default.",
  restrictedMonths: "Months in which no leave can be planned or requested.",
  monthlyCapacity: "Maximum number of distinct employees who may be scheduled for leave in any calendar month.",
  carryoverEnabled: "Allow unused entitlement from the previous year to be added to this year's entitlement.",
  carryoverMaxDays: "Upper limit on carried-over days when carryover is enabled.",
  overdueApprovalDays: "Pending plans and requests older than this are flagged as overdue.",
  leaveTypes: "Leave types available on the request form.",
};

const STATUSES: RuleStatus[] = ["confirmed", "proposed", "assumption"];
const STATUS_TEXT: Record<RuleStatus, string> = { confirmed: "Confirmed by GRA", proposed: "Proposed rule", assumption: "Assumption awaiting approval" };

const SECTIONS = [
  { key: "rules", label: "Leave rules", icon: <RuleOutlinedIcon fontSize="small" /> },
  { key: "categories", label: "Staff categories", icon: <BadgeOutlinedIcon fontSize="small" /> },
  { key: "holidays", label: "Public holidays", icon: <EventBusyOutlinedIcon fontSize="small" /> },
  { key: "org", label: "Organisation", icon: <BusinessOutlinedIcon fontSize="small" /> },
  { key: "routing", label: "Approval routing", icon: <AccountTreeOutlinedIcon fontSize="small" /> },
];

function StatusSelect({ value, onChange }: { value: RuleStatus; onChange: (s: RuleStatus) => void }) {
  return (
    <TextField select size="small" label="Governance status" value={value} onChange={(e) => onChange(e.target.value as RuleStatus)} sx={{ minWidth: 220 }}>
      {STATUSES.map((s) => <MenuItem key={s} value={s}>{STATUS_TEXT[s]}</MenuItem>)}
    </TextField>
  );
}

function RuleCard({ row, onSaved, onError }: { row: PolicyRow; onSaved: (m: string) => void; onError: (m: string) => void }) {
  const [value, setValue] = useState<unknown>(row.value);
  const [status, setStatus] = useState<RuleStatus>(row.status);
  const [text, setText] = useState(Array.isArray(row.value) && typeof row.value[0] === "string" ? (row.value as string[]).join(", ") : "");
  const isList = row.key === "leaveTypes";
  const dirty = JSON.stringify(value) !== JSON.stringify(row.value) || status !== row.status || (isList && text !== (row.value as string[]).join(", "));

  async function save() {
    try {
      const v = isList ? text.split(",").map((s) => s.trim()).filter(Boolean) : value;
      await api("/api/hr/policy", "PUT", { key: row.key, value: v, status });
      onSaved(`Saved “${row.label}”.`);
    } catch (e) {
      onError(errorText(e));
    }
  }

  let editor: React.ReactNode;
  if (typeof row.value === "boolean") {
    editor = <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}><Switch checked={!!value} onChange={(e) => setValue(e.target.checked)} /><Typography variant="body2">{value ? "Enabled" : "Disabled"}</Typography></Stack>;
  } else if (typeof row.value === "number") {
    editor = <TextField size="small" type="number" value={value as number} onChange={(e) => setValue(Number(e.target.value))} sx={{ width: 140 }} slotProps={{ htmlInput: { min: 0 } }} />;
  } else if (row.key === "restrictedMonths") {
    const months = value as number[];
    editor = (
      <Box>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
          {MONTH_NAMES.map((m, i) => {
            const on = months.includes(i + 1);
            return (
              <Chip key={m} label={m.slice(0, 3)} size="small" clickable aria-pressed={on} color={on ? "error" : "default"} variant={on ? "filled" : "outlined"}
                onClick={() => setValue(on ? months.filter((x) => x !== i + 1) : [...months, i + 1].sort((a, b) => a - b))} />
            );
          })}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>Highlighted = restricted. Scheduling window: <b>{describeWindow(months)}</b>.</Typography>
      </Box>
    );
  } else {
    editor = <TextField size="small" fullWidth value={text} onChange={(e) => setText(e.target.value)} helperText="Separate with commas" />;
  }

  return (
    <Paper component="section" aria-label={row.label} variant="outlined" sx={{ p: 2.5, borderRadius: "14px", borderColor: dirty ? "secondary.main" : "divider" }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "flex-start" }, mb: 1.5 }}>
        <Box>
          <Typography variant="subtitle1">{row.label}</Typography>
          <Typography variant="body2" color="text.secondary">{HELP[row.key]}</Typography>
        </Box>
        <StatusChip status={row.status} label={STATUS_TEXT[row.status]} />
      </Stack>
      {editor}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 2, alignItems: { sm: "center" } }}>
        <StatusSelect value={status} onChange={setStatus} />
        <Box sx={{ flex: 1 }} />
        {dirty && <Typography variant="caption" color="secondary.main" sx={{ fontWeight: 600 }}>Unsaved changes</Typography>}
        <Button variant="contained" disabled={!dirty} onClick={save}>Save</Button>
      </Stack>
    </Paper>
  );
}

function CategoryRow({ c, onSave }: { c: StaffCategory; onSave: (c: StaffCategory) => void }) {
  const [v, setV] = useState(c);
  const dirty = JSON.stringify(v) !== JSON.stringify(c);
  return (
    <TableRow>
      <TableCell><Typography variant="body2" sx={{ fontFamily: "monospace" }}>{c.code}</Typography></TableCell>
      <TableCell><TextField size="small" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></TableCell>
      <TableCell><TextField size="small" type="number" value={v.entitlementDays} onChange={(e) => setV({ ...v, entitlementDays: Number(e.target.value) })} sx={{ width: 96 }} /></TableCell>
      <TableCell><StatusSelect value={v.status} onChange={(s) => setV({ ...v, status: s })} /></TableCell>
      <TableCell align="right"><Button disabled={!dirty} variant={dirty ? "contained" : "text"} onClick={() => onSave(v)}>Save</Button></TableCell>
    </TableRow>
  );
}

export default function PolicyView({ rows, activeYear, categories, holidays, departments, offices, routes, approvers, employees }: {
  rows: PolicyRow[]; activeYear: number; categories: StaffCategory[]; holidays: Holiday[]; departments: NamedRow[]; offices: NamedRow[];
  routes: ApprovalRoute[]; approvers: { id: number; name: string }[]; employees: { id: number; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [section, setSection] = useState("rules");
  const ok = (text: string) => { toast.success(text); router.refresh(); };
  const fail = (text: string) => toast.error(text);
  const call = async (fn: () => Promise<unknown>, success: string) => { try { await fn(); ok(success); return true; } catch (e) { fail(errorText(e)); return false; } };

  const [cat, setCat] = useState({ code: "", name: "", entitlementDays: 28, status: "proposed" as RuleStatus });
  const holidayYears = [...new Set([...holidays.map((h) => Number(h.date.slice(0, 4))), activeYear])].sort();
  const [holYear, setHolYear] = useState(activeYear);
  const [hol, setHol] = useState({ date: "", name: "", note: "" });
  const [unit, setUnit] = useState({ kind: "department", name: "" });
  const [route, setRoute] = useState({ priority: 50, scope_type: "department", scope_value: "", approver_mode: "line_manager", approver_user_id: null as number | null, active: true, note: "" });
  const [tester, setTester] = useState<number | "">("");
  const [testResult, setTestResult] = useState<{ employee: string; routeId: number | null; approver: string | null; pool: boolean } | null>(null);
  const yearHolidays = holidays.filter((h) => h.date.startsWith(String(holYear)));

  async function testRoute(id: number) {
    setTester(id);
    try { setTestResult(await api(`/api/hr/routes/test?employee=${id}`, "GET")); } catch (e) { fail(errorText(e)); }
  }

  const describeRoute = (r: ApprovalRoute) =>
    r.scope_type === "default" ? "Everyone else"
      : r.scope_type === "department" ? `Department: ${departments.find((d) => String(d.id) === r.scope_value)?.name ?? r.scope_value}`
        : r.scope_type === "category" ? `Category: ${categories.find((c) => c.code === r.scope_value)?.name ?? r.scope_value}`
          : `Role: ${r.scope_value}`;
  const describeApprover = (r: ApprovalRoute) =>
    r.approver_mode === "line_manager" ? "Line manager" : r.approver_mode === "hr" ? "Any HR Administrator" : approvers.find((a) => a.id === r.approver_user_id)?.name ?? "—";

  return (
    <>
      <PageHeader title="Policy settings" subtitle="Configure the leave rules this system enforces. Each rule records whether it is confirmed by GRA, proposed, or an assumption." />
      <Alert severity="warning" sx={{ mb: 3 }}>
        The prototype rules — entitlements, the February–November window and the 5-employee monthly cap — are <b>proposals</b>. Mark a rule <b>Confirmed</b> only after checking GRA’s Conditions of Service, HR leave procedures and delegation of authority.
      </Alert>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 3 }}>
          <Stack component="nav" aria-label="Policy sections" direction={{ xs: "row", md: "column" }} spacing={0.5}
            sx={{ position: { md: "sticky" }, top: { md: 88 }, overflowX: "auto", pb: { xs: 1, md: 0 } }}>
            {SECTIONS.map((s) => (
              <ButtonBase key={s.key} onClick={() => setSection(s.key)} aria-current={section === s.key ? "page" : undefined}
                sx={{
                  justifyContent: "flex-start", gap: 1.25, px: 1.5, height: 40, borderRadius: 2, whiteSpace: "nowrap", fontSize: "0.875rem",
                  fontWeight: section === s.key ? 650 : 500, color: section === s.key ? "text.primary" : "text.secondary",
                  bgcolor: section === s.key ? "action.selected" : "transparent", "&:hover": { bgcolor: "action.hover" },
                }}>
                {s.icon}{s.label}
              </ButtonBase>
            ))}
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 9 }}>
          {section === "rules" && (
            <Stack spacing={2}>
              {rows.map((r) => <RuleCard key={`${r.key}-${r.updatedAt}-${r.status}-${JSON.stringify(r.value)}`} row={r} onSaved={ok} onError={fail} />)}
            </Stack>
          )}

          {section === "categories" && (
            <Section title="Staff categories and annual entitlement" subtitle="Entitlement is derived from the category. Changing it immediately affects every employee in the category; approved leave is never removed automatically.">
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead><TableRow><TableCell>Code</TableCell><TableCell>Name</TableCell><TableCell>Working days</TableCell><TableCell>Status</TableCell><TableCell /></TableRow></TableHead>
                  <TableBody>
                    {categories.map((c) => <CategoryRow key={`${c.code}-${c.entitlementDays}-${c.status}-${c.name}`} c={c} onSave={(v) => call(() => api("/api/hr/categories", "POST", v), `Saved category ${v.name}.`)} />)}
                    <TableRow>
                      <TableCell><TextField size="small" placeholder="CODE" value={cat.code} onChange={(e) => setCat({ ...cat, code: e.target.value.toUpperCase() })} sx={{ width: 110 }} /></TableCell>
                      <TableCell><TextField size="small" placeholder="New category name" value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value })} /></TableCell>
                      <TableCell><TextField size="small" type="number" value={cat.entitlementDays} onChange={(e) => setCat({ ...cat, entitlementDays: Number(e.target.value) })} sx={{ width: 96 }} /></TableCell>
                      <TableCell><StatusSelect value={cat.status} onChange={(s) => setCat({ ...cat, status: s })} /></TableCell>
                      <TableCell align="right"><Button variant="outlined" disabled={!cat.code || !cat.name}
                        onClick={async () => { if (await call(() => api("/api/hr/categories", "POST", cat), `Added category ${cat.name}.`)) setCat({ code: "", name: "", entitlementDays: 28, status: "proposed" }); }}>Add</Button></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Box>
            </Section>
          )}

          {section === "holidays" && (
            <Section title="Public holidays" subtitle="Excluded from all working-day counts. Moveable and observed dates should be confirmed against official announcements."
              action={
                <TextField select size="small" value={holYear} onChange={(e) => setHolYear(Number(e.target.value))} aria-label="Holiday year" sx={{ width: 100 }}>
                  {holidayYears.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                </TextField>
              }>
              {!holidays.some((h) => h.date.startsWith(String(activeYear))) && (
                <Alert severity="error" sx={{ mb: 2 }}>No public holidays are configured for the active year {activeYear}. Working-day counts will include those days until you add them.</Alert>
              )}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 2 }}>
                <TextField type="date" label="Date" value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField label="Holiday name" value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} sx={{ flex: 1 }} />
                <TextField label="Note (optional)" value={hol.note} onChange={(e) => setHol({ ...hol, note: e.target.value })} sx={{ flex: 1 }} />
                <Button variant="contained" disabled={!hol.date || !hol.name}
                  onClick={async () => { if (await call(() => api("/api/hr/holidays", "POST", hol), "Holiday added.")) { setHolYear(Number(hol.date.slice(0, 4))); setHol({ date: "", name: "", note: "" }); } }}>Add</Button>
              </Stack>
              {yearHolidays.length === 0 ? <Typography variant="body2" color="text.secondary">No holidays for {holYear}.</Typography> : (
                <Table size="small">
                  <TableHead><TableRow><TableCell>Date</TableCell><TableCell>Holiday</TableCell><TableCell>Note</TableCell><TableCell /></TableRow></TableHead>
                  <TableBody>
                    {yearHolidays.map((h) => (
                      <TableRow key={h.id} hover>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDate(h.date)}</TableCell>
                        <TableCell>{h.name}</TableCell>
                        <TableCell><Typography variant="caption" color="text.secondary">{h.note}</Typography></TableCell>
                        <TableCell align="right">
                          <Tooltip title="Remove holiday"><IconButton size="small" aria-label={`Remove ${h.name}`} onClick={() => call(() => api(`/api/hr/holidays/${h.id}`, "DELETE"), "Holiday removed.")}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Section>
          )}

          {section === "org" && (
            <Section title="Departments and offices">
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 3 }}>
                <TextField select value={unit.kind} onChange={(e) => setUnit({ ...unit, kind: e.target.value })} sx={{ minWidth: 150 }} aria-label="Type">
                  <MenuItem value="department">Department</MenuItem><MenuItem value="office">Office</MenuItem>
                </TextField>
                <TextField label="Name" value={unit.name} onChange={(e) => setUnit({ ...unit, name: e.target.value })} sx={{ flex: 1 }} />
                <Button variant="contained" disabled={unit.name.trim().length < 2}
                  onClick={async () => { if (await call(() => api("/api/hr/org", "POST", unit), `Added ${unit.kind}.`)) setUnit({ ...unit, name: "" }); }}>Add</Button>
              </Stack>
              <Grid container spacing={3}>
                {([["Departments", departments], ["Offices", offices]] as const).map(([t, list]) => (
                  <Grid key={t} size={{ xs: 12, sm: 6 }}>
                    <Typography variant="overline" color="text.secondary">{t} · {list.length}</Typography>
                    <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                      {list.map((d) => <Box key={d.id} sx={{ px: 1.5, py: 1, borderRadius: 1.5, border: 1, borderColor: "divider" }}><Typography variant="body2">{d.name}</Typography></Box>)}
                    </Stack>
                  </Grid>
                ))}
              </Grid>
            </Section>
          )}

          {section === "routing" && (
            <Stack spacing={2.5}>
              <Section title="Approval routes" subtitle="Checked in priority order, lowest first. The first matching route decides who approves. Configure these to match GRA’s verified delegation of authority.">
                <Stack spacing={1}>
                  {routes.map((r, i) => (
                    <Stack key={r.id} direction="row" spacing={1.5} sx={{
                      alignItems: "center", p: 1.5, borderRadius: 2, border: 1,
                      borderColor: testResult?.routeId === r.id ? "secondary.main" : "divider", opacity: r.active ? 1 : 0.5,
                    }}>
                      <Box sx={{ width: 28, height: 28, borderRadius: "50%", bgcolor: "action.selected", display: "grid", placeItems: "center", fontSize: "0.75rem", fontWeight: 700 }}>{i + 1}</Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 650 }}>{describeRoute(r)} → {describeApprover(r)}</Typography>
                        <Typography variant="caption" color="text.secondary">Priority {r.priority}{r.note ? ` · ${r.note}` : ""}{r.active ? "" : " · inactive"}</Typography>
                      </Box>
                      {testResult?.routeId === r.id && <Chip size="small" color="secondary" label="Matches" />}
                      <Tooltip title="Delete route"><IconButton size="small" aria-label="Delete route" onClick={() => call(() => api(`/api/hr/routes/${r.id}`, "DELETE"), "Route deleted.")}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                    </Stack>
                  ))}
                </Stack>
              </Section>

              <Section title="Test routing" subtitle="See who would approve a given employee’s plans and requests under the routes above.">
                <TextField select fullWidth label="Employee" value={tester} onChange={(e) => testRoute(Number(e.target.value))}>
                  {employees.map((e) => <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>)}
                </TextField>
                {testResult && (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    <b>{testResult.employee}</b>’s plans and requests go to <b>{testResult.pool ? "any HR Administrator" : testResult.approver}</b>
                    {testResult.routeId ? ` (route ${routes.findIndex((r) => r.id === testResult.routeId) + 1})` : " (no matching route; HR pool)"}.
                  </Alert>
                )}
              </Section>

              <Section title="Add a route">
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 6, sm: 2 }}><TextField fullWidth type="number" label="Priority" value={route.priority} onChange={(e) => setRoute({ ...route, priority: Number(e.target.value) })} /></Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <TextField select fullWidth label="Applies to" value={route.scope_type} onChange={(e) => setRoute({ ...route, scope_type: e.target.value, scope_value: "" })}>
                      <MenuItem value="department">Department</MenuItem><MenuItem value="category">Staff category</MenuItem><MenuItem value="role">Role</MenuItem><MenuItem value="default">Everyone</MenuItem>
                    </TextField>
                  </Grid>
                  {route.scope_type !== "default" && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField select fullWidth label="Which" value={route.scope_value} onChange={(e) => setRoute({ ...route, scope_value: e.target.value })}>
                        {route.scope_type === "department" && departments.map((d) => <MenuItem key={d.id} value={String(d.id)}>{d.name}</MenuItem>)}
                        {route.scope_type === "category" && categories.map((c) => <MenuItem key={c.code} value={c.code}>{c.name}</MenuItem>)}
                        {route.scope_type === "role" && ["employee", "manager", "hr", "sysadmin"].map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                      </TextField>
                    </Grid>
                  )}
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField select fullWidth label="Approver" value={route.approver_mode} onChange={(e) => setRoute({ ...route, approver_mode: e.target.value })}>
                      <MenuItem value="line_manager">Line manager</MenuItem><MenuItem value="hr">Any HR Administrator</MenuItem><MenuItem value="specific_user">Specific person</MenuItem>
                    </TextField>
                  </Grid>
                  {route.approver_mode === "specific_user" && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField select fullWidth label="Person" value={route.approver_user_id ?? ""} onChange={(e) => setRoute({ ...route, approver_user_id: Number(e.target.value) })}>
                        {approvers.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
                      </TextField>
                    </Grid>
                  )}
                  <Grid size={12}><TextField fullWidth label="Note (e.g. delegation reference)" value={route.note} onChange={(e) => setRoute({ ...route, note: e.target.value })} /></Grid>
                  <Grid size={12} sx={{ textAlign: "right" }}>
                    <Button variant="contained" disabled={route.scope_type !== "default" && !route.scope_value}
                      onClick={() => call(() => api("/api/hr/routes", "POST", route), "Route added.")}>Add route</Button>
                  </Grid>
                </Grid>
              </Section>
            </Stack>
          )}
        </Grid>
      </Grid>
    </>
  );
}
