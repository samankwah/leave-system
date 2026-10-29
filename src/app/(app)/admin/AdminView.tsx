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
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Grid from "@mui/material/Grid2";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import KeyOutlinedIcon from "@mui/icons-material/KeyOutlined";
import LockOpenOutlinedIcon from "@mui/icons-material/LockOpenOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SearchIcon from "@mui/icons-material/Search";
import type { Role } from "@/domain/types";
import { ROLE_LABEL } from "@/components/nav";
import { KeyValue, PageHeader, Section, StatusChip } from "@/components/common";
import { useToast } from "@/components/ui/Toaster";
import { api, errorText } from "@/lib/client";
import { fmtDateTime, initials } from "@/lib/format";
import type { User } from "@/server/repos/users";

interface Session { id: string; user_id: number; full_name: string; created_at: string; expires_at: string; user_agent: string }
interface System {
  database: string; sizeKb: number; schemaVersion: string; activeUsers: number; totalUsers: number; plans: number; requests: number;
  audit: { ok: boolean; checked: number; brokenAt?: number }; node: string;
}

function Tile({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "success" | "error" }) {
  return (
    <Paper sx={{ p: 2, borderRadius: "14px", height: "100%" }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography sx={{ fontSize: "1.5rem", fontWeight: 750, color: tone ? `${tone}.main` : undefined, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Paper>
  );
}

const browserOf = (ua: string) => (/Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : ua ? "Other" : "Unknown");

export default function AdminView({ me, users, sessions, system }: { me: number; users: User[]; sessions: Session[]; system: System }) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<{ el: HTMLElement; user: User } | null>(null);
  const [tempPw, setTempPw] = useState<{ name: string; password: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetText, setResetText] = useState("");
  const now = new Date().toISOString();
  const shown = users.filter((u) => `${u.fullName} ${u.employeeId} ${u.email} ${ROLE_LABEL[u.role]}`.toLowerCase().includes(q.toLowerCase()));

  async function call(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); toast.success(ok); router.refresh(); } catch (e) { toast.error(errorText(e)); }
  }

  async function resetPassword(u: User) {
    setMenu(null);
    try {
      const r = await api<{ tempPassword: string }>(`/api/admin/users/${u.id}/reset-password`);
      setTempPw({ name: u.fullName, password: r.tempPassword });
      router.refresh();
    } catch (e) { toast.error(errorText(e)); }
  }

  async function resetDemo() {
    setConfirmReset(false);
    try {
      await api("/api/admin/reset-demo");
      window.location.href = "/login?reset=1";
    } catch (e) { toast.error(errorText(e)); }
  }

  return (
    <>
      <PageHeader title="User access" subtitle="Manage roles, account status, passwords and sessions. Profile details are managed by HR." />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}><Tile label="Active users" value={`${system.activeUsers}`} hint={`${system.totalUsers} accounts in total`} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Tile label="Active sessions" value={sessions.length} hint="Signed in right now" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Tile label="Audit integrity" value={system.audit.ok ? "Verified" : "Failed"} tone={system.audit.ok ? "success" : "error"} hint={`${system.audit.checked} records checked`} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Tile label="Database" value={`${system.sizeKb} KB`} hint={`${system.plans} plans · ${system.requests} requests`} /></Grid>
      </Grid>

      <Section title="Accounts" action={
        <TextField size="small" placeholder="Search accounts" value={q} onChange={(e) => setQ(e.target.value)} sx={{ width: { xs: 160, sm: 260 } }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
      } sx={{ mb: 2.5 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow><TableCell>User</TableCell><TableCell>Role</TableCell><TableCell>Active</TableCell><TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>Status</TableCell><TableCell /></TableRow>
            </TableHead>
            <TableBody>
              {shown.map((u) => {
                const locked = !!u.lockedUntil && u.lockedUntil > now;
                const self = u.id === me;
                return (
                  <TableRow key={u.id} hover>
                    <TableCell>
                      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                        <Avatar sx={{ width: 32, height: 32, fontSize: "0.75rem", fontWeight: 700, bgcolor: "action.selected", color: "text.primary" }}>{initials(u.fullName)}</Avatar>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 650 }} noWrap>{u.fullName}{self ? " (you)" : ""}</Typography>
                          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>{u.employeeId} · {u.email}</Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <TextField select size="small" value={u.role} disabled={self} aria-label={`Role for ${u.fullName}`} sx={{ minWidth: 190 }}
                        onChange={(e) => call(() => api(`/api/admin/users/${u.id}`, "PATCH", { role: e.target.value }), `${u.fullName} is now ${ROLE_LABEL[e.target.value as Role]}.`)}>
                        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <MenuItem key={r} value={r}>{ROLE_LABEL[r]}</MenuItem>)}
                      </TextField>
                    </TableCell>
                    <TableCell>
                      <Switch checked={u.active} disabled={self} inputProps={{ "aria-label": `Account active: ${u.fullName}` }}
                        onChange={(e) => call(() => api(`/api/admin/users/${u.id}`, "PATCH", { active: e.target.checked }), `${u.fullName} ${e.target.checked ? "activated" : "deactivated and signed out"}.`)} />
                    </TableCell>
                    <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
                      {locked ? <StatusChip status="rejected" label={`Locked until ${fmtDateTime(u.lockedUntil).split(", ")[1] ?? ""}`} />
                        : u.active ? <StatusChip status="approved" label="OK" /> : <StatusChip status="cancelled" label="Deactivated" />}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" aria-label={`Actions for ${u.fullName}`} onClick={(e) => setMenu({ el: e.currentTarget, user: u })}><MoreVertIcon fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Section>
      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
        {menu && <MenuItem onClick={() => resetPassword(menu.user)}><ListItemIcon><KeyOutlinedIcon fontSize="small" /></ListItemIcon>Reset password</MenuItem>}
        {menu && menu.user.lockedUntil && menu.user.lockedUntil > now && (
          <MenuItem onClick={() => { const u = menu.user; setMenu(null); call(() => api(`/api/admin/users/${u.id}/unlock`), `${u.fullName} unlocked.`); }}>
            <ListItemIcon><LockOpenOutlinedIcon fontSize="small" /></ListItemIcon>Unlock account
          </MenuItem>
        )}
      </Menu>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Section title={`Active sessions · ${sessions.length}`}>
            <Stack spacing={1}>
              {sessions.map((s) => (
                <Stack key={s.id} direction="row" spacing={1.5} sx={{ alignItems: "center", p: 1.25, borderRadius: 2, border: 1, borderColor: "divider" }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{s.full_name}{s.user_id === me ? " (this is you)" : ""}</Typography>
                    <Typography variant="caption" color="text.secondary">{browserOf(s.user_agent)} · signed in {fmtDateTime(s.created_at)} · expires {fmtDateTime(s.expires_at)}</Typography>
                  </Box>
                  <Button size="small" color="error" onClick={() => call(() => api(`/api/admin/sessions/${s.id}`, "DELETE"), `Signed ${s.full_name} out.`)}>Revoke</Button>
                </Stack>
              ))}
            </Stack>
          </Section>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Stack spacing={2.5}>
            <Section title="System">
              <KeyValue rows={[["Database", <Box key="d" component="span" sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{system.database}</Box>], ["Schema version", system.schemaVersion], ["Runtime", `Node.js ${system.node}`]]} />
            </Section>
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: "14px", borderColor: "error.main" }}>
              <Typography variant="subtitle1" color="error.main">Danger zone</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
                Reset every plan, request, notification, audit record and account change back to the synthetic demo dataset. Everyone is signed out.
              </Typography>
              <Button color="error" variant="outlined" onClick={() => { setResetText(""); setConfirmReset(true); }}>Reset demo data…</Button>
            </Paper>
          </Stack>
        </Grid>
      </Grid>

      <Dialog open={!!tempPw} onClose={() => setTempPw(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Temporary password</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>{tempPw?.name}&apos;s password was reset and their sessions ended. Share this one-time password securely; it won&apos;t be shown again.</Typography>
          <Stack direction="row" sx={{ alignItems: "center", p: 1.5, borderRadius: 2, bgcolor: "action.hover", fontFamily: "monospace", fontSize: "1rem" }}>
            <Box sx={{ flex: 1 }}>{tempPw?.password}</Box>
            <IconButton size="small" aria-label="Copy password" onClick={() => { navigator.clipboard?.writeText(tempPw?.password ?? ""); toast.info("Copied to clipboard."); }}><ContentCopyIcon fontSize="small" /></IconButton>
          </Stack>
        </DialogContent>
        <DialogActions><Button variant="contained" onClick={() => setTempPw(null)}>Done</Button></DialogActions>
      </Dialog>

      <Dialog open={confirmReset} onClose={() => setConfirmReset(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Reset demo data?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>This permanently replaces all data with the synthetic demo dataset and signs everyone out, including you.</DialogContentText>
          <Alert severity="warning" sx={{ mb: 2 }}>Type <b>RESET</b> to confirm.</Alert>
          <TextField fullWidth autoFocus value={resetText} onChange={(e) => setResetText(e.target.value)} placeholder="RESET" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={resetText !== "RESET"} onClick={resetDemo}>Reset demo data</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
