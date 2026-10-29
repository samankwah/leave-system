"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
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
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import GppGoodOutlinedIcon from "@mui/icons-material/GppGoodOutlined";
import GppBadOutlinedIcon from "@mui/icons-material/GppBadOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import SearchIcon from "@mui/icons-material/Search";
import { PageHeader } from "@/components/common";
import EmptyState from "@/components/ui/EmptyState";
import { api } from "@/lib/client";
import { fmtDateTime } from "@/lib/format";
import type { AuditEntry } from "@/server/repos/audit";

const TYPES = ["plan", "request", "user", "policy", "category", "holiday", "route", "department", "office", "session", "system"];

function tone(action: string): "success" | "error" | "warning" | "info" | "default" {
  if (/approve|create|login$/.test(action)) return "success";
  if (/reject|delete|locked|revoke|reset/.test(action)) return "error";
  if (/return|cancel|update|change|discard/.test(action)) return "warning";
  if (/submit/.test(action)) return "info";
  return "default";
}

function Details({ json }: { json: string }) {
  let obj: Record<string, unknown>;
  try { obj = JSON.parse(json); } catch { return <Typography variant="body2">{json}</Typography>; }
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0));
  if (!entries.length) return <Typography variant="body2" color="text.secondary">No additional details recorded.</Typography>;
  const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
  return (
    <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "minmax(110px, auto) 1fr", gap: "6px 16px" }}>
      {entries.map(([k, v]) => {
        const fromTo = v && typeof v === "object" && !Array.isArray(v) && "from" in v && "to" in v ? (v as { from: unknown; to: unknown }) : null;
        return (
          <Fragment key={k}>
            <Typography component="dt" variant="caption" color="text.secondary" sx={{ pt: 0.25 }}>{k}</Typography>
            <Box component="dd" sx={{ m: 0, minWidth: 0 }}>
              {fromTo ? (
                <Typography variant="body2"><Box component="span" sx={{ textDecoration: "line-through", color: "error.main" }}>{show(fromTo.from)}</Box> → <Box component="span" sx={{ color: "success.main", fontWeight: 600 }}>{show(fromTo.to)}</Box></Typography>
              ) : Array.isArray(v) && v.every((x) => x && typeof x === "object" && "field" in x) ? (
                (v as { field: string; from: unknown; to: unknown }[]).map((c) => (
                  <Typography key={c.field} variant="body2">{c.field}: <Box component="span" sx={{ textDecoration: "line-through", color: "error.main" }}>{show(c.from)}</Box> → <Box component="span" sx={{ color: "success.main", fontWeight: 600 }}>{show(c.to)}</Box></Typography>
                ))
              ) : (
                <Typography variant="body2" sx={{ fontFamily: typeof v === "object" ? "monospace" : undefined, fontSize: typeof v === "object" ? 12.5 : undefined, overflowWrap: "anywhere" }}>
                  {Array.isArray(v) ? v.map(show).join(" · ") : show(v)}
                </Typography>
              )}
            </Box>
          </Fragment>
        );
      })}
    </Box>
  );
}

export default function AuditView({ entries, filters }: { entries: AuditEntry[]; filters: { q: string; type: string; from: string; to: string } }) {
  const router = useRouter();
  const [f, setF] = useState(filters);
  const [open, setOpen] = useState<number | null>(null);
  const [integrity, setIntegrity] = useState<{ ok: boolean; checked: number; brokenAt?: number } | null>(null);

  useEffect(() => { api<{ ok: boolean; checked: number; brokenAt?: number }>("/api/audit/verify", "GET").then(setIntegrity).catch(() => undefined); }, []);

  const go = (next = f) => {
    const sp = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
    router.push(`/audit${sp.size ? `?${sp}` : ""}`);
  };
  const filtered = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader title="Audit trail" subtitle="Append-only, hash-chained record of who did what, when and why. Records cannot be edited or deleted."
        actions={
          <>
            {integrity && (
              <Tooltip title={integrity.ok ? `All ${integrity.checked} records verified against the hash chain` : `Chain broken at record #${integrity.brokenAt}`}>
                <Chip icon={integrity.ok ? <GppGoodOutlinedIcon /> : <GppBadOutlinedIcon />} color={integrity.ok ? "success" : "error"} variant="outlined"
                  label={integrity.ok ? "Integrity verified" : "Integrity check failed"} />
              </Tooltip>
            )}
            <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} href="/api/reports/audit?format=xlsx">Export</Button>
          </>
        } />

      <Paper component="form" onSubmit={(e) => { e.preventDefault(); go(); }} sx={{ p: 1.5, mb: 2, borderRadius: "14px" }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
          <TextField placeholder="Search summary, action or person" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} sx={{ flex: 1 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
          <TextField select label="Record type" value={f.type} onChange={(e) => { const n = { ...f, type: e.target.value }; setF(n); go(n); }} sx={{ minWidth: 160 }} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
            <MenuItem value="">All records</MenuItem>
            {TYPES.map((t) => <MenuItem key={t} value={t} sx={{ textTransform: "capitalize" }}>{t}</MenuItem>)}
          </TextField>
          <TextField type="date" label="From" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField type="date" label="To" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <Button type="submit" variant="contained">Apply</Button>
          {filtered && <Button onClick={() => { const n = { q: "", type: "", from: "", to: "" }; setF(n); go(n); }}>Clear</Button>}
        </Stack>
      </Paper>

      <TableContainer component={Paper} sx={{ borderRadius: "14px" }}>
        {entries.length === 0 ? (
          <EmptyState icon={<HistoryOutlinedIcon />} title="No audit records match" description="Try widening the date range or clearing filters." />
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 40 }} />
                <TableCell>When</TableCell>
                <TableCell>Who</TableCell>
                <TableCell>Action</TableCell>
                <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>Record</TableCell>
                <TableCell>Summary</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((e) => (
                <Fragment key={e.id}>
                  <TableRow hover onClick={() => setOpen(open === e.id ? null : e.id)} sx={{ cursor: "pointer", "& > td": { borderBottom: open === e.id ? 0 : undefined } }}>
                    <TableCell>
                      <IconButton size="small" aria-label={open === e.id ? "Hide details" : "Show details"} aria-expanded={open === e.id}>
                        <KeyboardArrowDownIcon fontSize="small" sx={{ transform: open === e.id ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                      </IconButton>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtDateTime(e.ts)}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{e.actor_name}</TableCell>
                    <TableCell><Chip size="small" variant="outlined" color={tone(e.action)} label={e.action} sx={{ fontFamily: "monospace", fontWeight: 500 }} /></TableCell>
                    <TableCell sx={{ display: { xs: "none", md: "table-cell" }, whiteSpace: "nowrap" }}>{e.entity_type}{e.entity_id ? ` #${e.entity_id}` : ""}</TableCell>
                    <TableCell>{e.summary}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={6} sx={{ py: 0, borderBottom: open === e.id ? undefined : 0 }}>
                      <Collapse in={open === e.id} unmountOnExit>
                        <Box sx={{ py: 2, pl: { md: 6 } }}>
                          <Details json={e.details} />
                          <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1.5, fontFamily: "monospace" }}>record #{e.id} · hash {e.hash.slice(0, 16)}…</Typography>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </TableContainer>
      {entries.length === 500 && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>Showing the latest 500 records. Narrow the filters or export for more.</Typography>}
    </>
  );
}
