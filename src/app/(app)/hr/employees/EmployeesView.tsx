"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import Grid from "@mui/material/Grid2";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PeopleOutlineOutlinedIcon from "@mui/icons-material/PeopleOutlineOutlined";
import SearchIcon from "@mui/icons-material/Search";
import type { Balance } from "@/domain/balance";
import type { StaffCategory } from "@/domain/types";
import { formatRange } from "@/domain/workingDays";
import { KeyValue, PageHeader, StatusChip } from "@/components/common";
import { ROLE_LABEL } from "@/components/nav";
import BalanceBar from "@/components/ui/BalanceBar";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toaster";
import { api, errorText } from "@/lib/client";
import { initials } from "@/lib/format";
import type { NamedRow } from "@/server/repos/settings";
import type { User } from "@/server/repos/users";

export type EmployeeRow = User & {
  balance: Balance;
  planStatus: string;
  planPeriods: { start: string; end: string; days: number }[];
  requests: { id: number; start: string; end: string; days: number; status: string }[];
};

interface Form {
  id?: number; employeeId: string; email: string; fullName: string; departmentId: number | ""; officeId: number | "";
  jobTitle: string; categoryCode: string; managerId: number | "";
}

const blank = (cat: string): Form => ({ employeeId: "", email: "", fullName: "", departmentId: "", officeId: "", jobTitle: "", categoryCode: cat, managerId: "" });

function validate(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  if (!/^[A-Za-z0-9-]{3,20}$/.test(f.employeeId.trim())) e.employeeId = "3–20 letters, digits or dashes";
  if (f.fullName.trim().length < 2) e.fullName = "Enter the full name";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "Enter a valid email address";
  if (!f.departmentId) e.departmentId = "Choose a department";
  if (!f.categoryCode) e.categoryCode = "Choose a staff category";
  return e;
}

export default function EmployeesView({ year, users, departments, offices, categories }: {
  year: number; users: EmployeeRow[]; departments: NamedRow[]; offices: NamedRow[]; categories: StaffCategory[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<Form | null>(null);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; password: string } | null>(null);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [viewing, setViewing] = useState<number | null>(null);
  const managers = users.filter((u) => u.role === "manager" || u.role === "hr");
  const shown = users.filter((u) => (!dept || u.departmentName === dept) && `${u.fullName} ${u.employeeId} ${u.email} ${u.jobTitle}`.toLowerCase().includes(q.toLowerCase()));
  const current = users.find((u) => u.id === viewing) ?? null;
  const errors = form ? validate(form) : {};

  async function save() {
    if (!form) return;
    setTouched(true);
    if (Object.keys(errors).length) return;
    setServerError(null);
    try {
      const res = await api<{ user: User; tempPassword?: string }>("/api/hr/employees", "POST", {
        ...form, departmentId: form.departmentId || null, officeId: form.officeId || null, managerId: form.managerId || null,
      });
      if (res.tempPassword) setCreated({ name: res.user.fullName, password: res.tempPassword });
      else toast.success(`Saved ${res.user.fullName}.`);
      setForm(null);
      router.refresh();
    } catch (e) {
      setServerError(errorText(e));
    }
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const openEdit = (u: EmployeeRow) => {
    setTouched(false); setServerError(null);
    setForm({ id: u.id, employeeId: u.employeeId, email: u.email, fullName: u.fullName, departmentId: u.departmentId ?? "", officeId: u.officeId ?? "", jobTitle: u.jobTitle, categoryCode: u.categoryCode, managerId: u.managerId ?? "" });
  };
  const err = (k: keyof Form) => (touched ? errors[k] : undefined);

  return (
    <>
      <PageHeader title="Employees" subtitle={`${users.length} people. Entitlement follows the staff category; balances shown for ${year}.`}
        actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => { setTouched(false); setServerError(null); setForm(blank(categories[0]?.code ?? "")); }}>Add employee</Button>} />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField placeholder="Search name, ID, email or title" value={q} onChange={(e) => setQ(e.target.value)} sx={{ width: { xs: "100%", sm: 340 } }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
        <TextField select value={dept} onChange={(e) => setDept(e.target.value)} sx={{ width: { xs: "100%", sm: 260 } }} aria-label="Department" slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
          <MenuItem value="">All departments</MenuItem>
          {departments.map((d) => <MenuItem key={d.id} value={d.name}>{d.name}</MenuItem>)}
        </TextField>
      </Stack>

      <TableContainer component={Paper} sx={{ borderRadius: "14px" }}>
        {shown.length === 0 ? (
          <EmptyState icon={<PeopleOutlineOutlinedIcon />} title="No matching employees" />
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Employee</TableCell>
                <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>Department</TableCell>
                <TableCell sx={{ display: { xs: "none", lg: "table-cell" } }}>Category · role</TableCell>
                <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>Plan</TableCell>
                <TableCell sx={{ width: 220, display: { xs: "none", sm: "table-cell" } }}>{year} balance</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((u) => (
                <TableRow key={u.id} hover onClick={() => setViewing(u.id)} sx={{ cursor: "pointer", opacity: u.active ? 1 : 0.55 }}>
                  <TableCell>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                      <Avatar sx={{ width: 32, height: 32, fontSize: 12, fontWeight: 700, bgcolor: "action.selected", color: "text.primary" }}>{initials(u.fullName)}</Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 650 }} noWrap>{u.fullName}{u.active ? "" : " (inactive)"}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>{u.employeeId} · {u.jobTitle}</Typography>
                      </Box>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
                    <Typography variant="body2">{u.departmentName}</Typography>
                    <Typography variant="caption" color="text.secondary">{u.officeName}</Typography>
                  </TableCell>
                  <TableCell sx={{ display: { xs: "none", lg: "table-cell" } }}>
                    <Typography variant="body2">{u.categoryName}</Typography>
                    <Typography variant="caption" color="text.secondary">{ROLE_LABEL[u.role]}</Typography>
                  </TableCell>
                  <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}><StatusChip status={u.planStatus.split(" ")[0]} label={u.planStatus === "none" ? "No plan" : undefined} /></TableCell>
                  <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>
                    <BalanceBar total={u.balance.entitlement} height={6} legend={false} segments={[
                      { key: "a", label: "Approved", value: u.balance.approvedDays, color: "chart.taken" },
                      { key: "p", label: "Pending", value: u.balance.pendingDays, color: "chart.pending", hatch: true },
                    ]} />
                    <Typography variant="caption" color="text.secondary">{u.balance.remainingDays} of {u.balance.entitlement} left · {u.balance.plannedDays} planned</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" aria-label={`Edit ${u.fullName}`} onClick={(e) => { e.stopPropagation(); openEdit(u); }}><EditOutlinedIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      <Drawer anchor="right" open={!!current} onClose={() => setViewing(null)} slotProps={{ paper: { sx: { width: { xs: "100%", sm: 440 } } } }}>
        {current && (
          <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", px: 2.5, py: 2, borderBottom: 1, borderColor: "divider" }}>
              <Avatar sx={{ bgcolor: "primary.main", color: "primary.contrastText", fontWeight: 700 }}>{initials(current.fullName)}</Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h6" noWrap>{current.fullName}</Typography>
                <Typography variant="body2" color="text.secondary" noWrap>{current.jobTitle}</Typography>
              </Box>
              <IconButton onClick={() => setViewing(null)} aria-label="Close"><CloseIcon /></IconButton>
            </Stack>
            <Box sx={{ p: 2.5, overflowY: "auto", flex: 1 }}>
              <KeyValue rows={[
                ["Employee ID", current.employeeId], ["Email", current.email], ["Department", current.departmentName ?? "—"],
                ["Office", current.officeName ?? "—"], ["Category", current.categoryName], ["Role", ROLE_LABEL[current.role]],
                ["Line manager", current.managerName ?? "—"], ["Status", current.active ? "Active" : "Deactivated"],
              ]} />
              <Divider sx={{ my: 2.5 }} />
              <Typography variant="overline" color="text.secondary">{year} balance</Typography>
              <Box sx={{ mt: 1 }}>
                <BalanceBar total={current.balance.entitlement} segments={[
                  { key: "t", label: "Taken", value: current.balance.takenToDate, color: "chart.taken" },
                  { key: "s", label: "Booked", value: current.balance.scheduledDays, color: "chart.scheduled" },
                  { key: "p", label: "Pending", value: current.balance.pendingDays, color: "chart.pending", hatch: true },
                  { key: "r", label: "Available", value: Math.max(0, current.balance.projectedDays), color: "chart.remaining" },
                ]} />
              </Box>
              <Divider sx={{ my: 2.5 }} />
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
                <Typography variant="overline" color="text.secondary">Annual plan</Typography>
                <StatusChip status={current.planStatus.split(" ")[0]} label={current.planStatus === "none" ? "No plan" : current.planStatus} />
              </Stack>
              {current.planPeriods.length ? current.planPeriods.map((p) => (
                <Stack key={p.start} direction="row" sx={{ justifyContent: "space-between", py: 0.5 }}>
                  <Typography variant="body2">{formatRange(p)}</Typography><Typography variant="body2" color="text.secondary">{p.days} d</Typography>
                </Stack>
              )) : <Typography variant="body2" color="text.secondary">No plan yet.</Typography>}
              <Divider sx={{ my: 2.5 }} />
              <Typography variant="overline" color="text.secondary">Recent requests</Typography>
              {current.requests.length ? current.requests.map((r) => (
                <Stack key={r.id} direction="row" spacing={1} sx={{ alignItems: "center", py: 0.5 }}>
                  <Typography variant="body2" sx={{ flex: 1 }}>{formatRange(r)} · {r.days} d</Typography><StatusChip status={r.status} />
                </Stack>
              )) : <Typography variant="body2" color="text.secondary">No requests this year.</Typography>}
            </Box>
            <Box sx={{ p: 2, borderTop: 1, borderColor: "divider", textAlign: "right" }}>
              <Button variant="contained" startIcon={<EditOutlinedIcon />} onClick={() => openEdit(current)}>Edit profile</Button>
            </Box>
          </Box>
        )}
      </Drawer>

      <Dialog open={!!form} onClose={() => setForm(null)} fullWidth maxWidth="sm">
        <DialogTitle>{form?.id ? "Edit employee" : "Add employee"}</DialogTitle>
        <DialogContent dividers>
          {form && (
            <Grid container spacing={2} component="form" noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
              {serverError && <Grid size={12}><Alert severity="error">{serverError}</Alert></Grid>}
              <Grid size={{ xs: 12, sm: 5 }}><TextField fullWidth required label="Employee ID" value={form.employeeId} onChange={(e) => set("employeeId", e.target.value)} error={!!err("employeeId")} helperText={err("employeeId") ?? " "} /></Grid>
              <Grid size={{ xs: 12, sm: 7 }}><TextField fullWidth required label="Full name" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} error={!!err("fullName")} helperText={err("fullName") ?? " "} /></Grid>
              <Grid size={12}><TextField fullWidth required type="email" label="Official email" value={form.email} onChange={(e) => set("email", e.target.value)} error={!!err("email")} helperText={err("email") ?? " "} /></Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField select fullWidth required label="Department" value={form.departmentId} onChange={(e) => set("departmentId", Number(e.target.value))} error={!!err("departmentId")} helperText={err("departmentId") ?? " "}>
                  {departments.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField select fullWidth label="Office" value={form.officeId} onChange={(e) => set("officeId", Number(e.target.value))} helperText=" ">
                  {offices.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={12}><TextField fullWidth label="Job title" value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} helperText=" " /></Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField select fullWidth required label="Staff category" value={form.categoryCode} onChange={(e) => set("categoryCode", e.target.value)}
                  helperText={`Entitlement: ${categories.find((c) => c.code === form.categoryCode)?.entitlementDays ?? "?"} working days`}>
                  {categories.map((c) => <MenuItem key={c.code} value={c.code}>{c.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField select fullWidth label="Line manager" value={form.managerId} onChange={(e) => set("managerId", e.target.value === "" ? "" : Number(e.target.value))} helperText="Approves this person's leave by default">
                  <MenuItem value="">None</MenuItem>
                  {managers.filter((m) => m.id !== form.id).map((m) => <MenuItem key={m.id} value={m.id}>{m.fullName}</MenuItem>)}
                </TextField>
              </Grid>
              {!form.id && (
                <Grid size={12}><Alert severity="info">New accounts get the Employee role and a one-time temporary password. Roles are assigned by the System Administrator.</Alert></Grid>
              )}
              <button type="submit" hidden />
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setForm(null)}>Cancel</Button>
          <Button variant="contained" onClick={save}>{form?.id ? "Save changes" : "Create employee"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!created} onClose={() => setCreated(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Employee created</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>Share this one-time temporary password with {created?.name} through a secure channel. It won&apos;t be shown again.</Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", p: 1.5, borderRadius: 2, bgcolor: "action.hover", fontFamily: "monospace", fontSize: 16 }}>
            <Box sx={{ flex: 1 }}>{created?.password}</Box>
            <IconButton size="small" aria-label="Copy password" onClick={() => { navigator.clipboard?.writeText(created?.password ?? ""); toast.info("Copied to clipboard."); }}><ContentCopyIcon fontSize="small" /></IconButton>
          </Stack>
        </DialogContent>
        <DialogActions><Button variant="contained" onClick={() => setCreated(null)}>Done</Button></DialogActions>
      </Dialog>
    </>
  );
}
