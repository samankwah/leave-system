"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import InputAdornment from "@mui/material/InputAdornment";
import Menu from "@mui/material/Menu";
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
import SearchIcon from "@mui/icons-material/Search";
import { MONTH_NAMES, monthKey, monthLabel } from "@/domain/workingDays";
import { CapacityPips } from "@/components/LeaveCalendar";
import { PageHeader, Section, StatusChip } from "@/components/common";
import { fmtDateTime } from "@/lib/format";

interface Row {
  id: number; name: string; employeeId: string; department: string; category: string; planStatus: string;
  approvedMonthly: Record<string, number>; pendingMonthly: Record<string, number>;
  requestMonthly: Record<string, { approved: number; pending: number }>; total: number;
}

const LEGEND: [string, string][] = [["Approved plan", "leave.planned"], ["Plan awaiting approval", "leave.pending"], ["Includes approved leave", "leave.approved"]];

export default function RosterView({ year, years, rows, occupancy, amendments }: {
  year: number; years: number[]; rows: Row[];
  occupancy: Record<string, { count: number; capacity: number; status: string }>;
  amendments: { id: number; name: string; version: number; status: string; amends: number | null; periods: string; days: number; decidedBy: string | null; decidedAt: string | null; reason: string | null }[];
}) {
  const router = useRouter();
  const [dept, setDept] = useState("");
  const [q, setQ] = useState("");
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null);
  const depts = [...new Set(rows.map((r) => r.department))].sort();
  const shown = rows.filter((r) => (!dept || r.department === dept) && `${r.name} ${r.employeeId}`.toLowerCase().includes(q.toLowerCase()));
  const months = Array.from({ length: 12 }, (_, i) => monthKey(year, i + 1));
  const over = months.filter((m) => occupancy[m].count > occupancy[m].capacity);
  const planned = rows.filter((r) => r.total > 0).length;

  return (
    <>
      <PageHeader title={`Annual roster ${year}`}
        subtitle={`${planned} of ${rows.length} employees have an approved plan. Cells show planned working days per month.`}
        actions={
          <>
            <TextField select size="small" value={year} aria-label="Year" onChange={(e) => router.push(`/hr/roster?year=${e.target.value}`)} sx={{ width: 104 }}>
              {years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </TextField>
            <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={(e) => setExportAnchor(e.currentTarget)}>Export</Button>
            <Menu anchorEl={exportAnchor} open={!!exportAnchor} onClose={() => setExportAnchor(null)}>
              <MenuItem component="a" href={`/api/reports/department-capacity?year=${year}&format=xlsx`} onClick={() => setExportAnchor(null)}>Capacity by department (Excel)</MenuItem>
              <MenuItem component="a" href={`/api/reports/balances?year=${year}&format=xlsx`} onClick={() => setExportAnchor(null)}>Balances (Excel)</MenuItem>
              <MenuItem component="a" href={`/api/reports/amendments?year=${year}&format=csv`} onClick={() => setExportAnchor(null)}>Amendments (CSV)</MenuItem>
            </Menu>
          </>
        } />
      {over.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Over capacity after a policy change: <b>{over.map(monthLabel).join(", ")}</b>. Existing allocations are kept; new allocations in these months are blocked until numbers fall below the limit.
        </Alert>
      )}

      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ mb: 2, alignItems: { md: "center" } }}>
        <TextField size="small" placeholder="Search employees" value={q} onChange={(e) => setQ(e.target.value)} sx={{ width: { xs: "100%", md: 260 } }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
        <TextField select size="small" value={dept} onChange={(e) => setDept(e.target.value)} sx={{ width: { xs: "100%", md: 260 } }} aria-label="Department" slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
          <MenuItem value="">All departments</MenuItem>
          {depts.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" sx={{ gap: 2, flexWrap: "wrap" }}>
          {LEGEND.map(([l, c]) => (
            <Stack key={l} direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
              <Box sx={{ width: 12, height: 12, bgcolor: c, borderRadius: 0.75 }} /><Typography variant="caption" color="text.secondary">{l}</Typography>
            </Stack>
          ))}
        </Stack>
      </Stack>

      <TableContainer component={Paper} sx={{ mb: 2.5, borderRadius: "14px", maxHeight: "70vh" }}>
        <Table size="small" stickyHeader sx={{ "& td, & th": { px: 0.75 }, minWidth: 900 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ position: "sticky", left: 0, zIndex: 3, minWidth: 200, pl: "16px !important" }}>Employee</TableCell>
              {MONTH_NAMES.map((m) => <TableCell key={m} align="center">{m.slice(0, 3)}</TableCell>)}
              <TableCell align="right" sx={{ pr: "16px !important" }}>Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell sx={{ position: "sticky", left: 0, bgcolor: "background.paper", zIndex: 1, pl: "16px !important" }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{r.name}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>{r.category} · {r.planStatus}</Typography>
                </TableCell>
                {months.map((m) => {
                  const a = r.approvedMonthly[m];
                  const p = r.pendingMonthly[m];
                  const req = r.requestMonthly[m];
                  const bg = req?.approved ? "leave.approved" : a ? "leave.planned" : p ? "leave.pending" : undefined;
                  const fg = req?.approved ? "leave.approvedText" : a ? "leave.plannedText" : p ? "leave.pendingText" : undefined;
                  const tip = [a && `Approved plan: ${a} days`, p && `Pending plan: ${p} days`, req?.approved && `Approved leave: ${req.approved} days`, req?.pending && `Pending request: ${req.pending} days`].filter(Boolean).join(" · ");
                  return (
                    <TableCell key={m} align="center" sx={{ p: "4px !important" }}>
                      {tip && (
                        <Tooltip title={tip}>
                          <Box sx={{ mx: "auto", maxWidth: 52, height: 30, borderRadius: 1.5, bgcolor: bg, color: fg, display: "grid", placeItems: "center", fontWeight: 700, fontSize: "0.8125rem" }}>{a || p}</Box>
                        </Tooltip>
                      )}
                    </TableCell>
                  );
                })}
                <TableCell align="right" sx={{ fontWeight: 700, pr: "16px !important" }}>{r.total || "—"}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell sx={{ position: "sticky", left: 0, bottom: 0, zIndex: 2, bgcolor: "background.default", pl: "16px !important" }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>Employees scheduled</Typography>
                <Typography variant="caption" color="text.secondary">Organisation-wide</Typography>
              </TableCell>
              {months.map((m) => {
                const o = occupancy[m];
                return (
                  <TableCell key={m} align="center" sx={{ position: "sticky", bottom: 0, bgcolor: "background.default" }}>
                    {o.status === "restricted" ? <Typography variant="caption" color="text.disabled">—</Typography> : (
                      <Stack spacing={0.5} sx={{ alignItems: "center" }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: o.count >= o.capacity ? "error.main" : "text.primary" }}>{o.count}/{o.capacity}</Typography>
                        <CapacityPips count={o.count} capacity={o.capacity} size={5} />
                      </Stack>
                    )}
                  </TableCell>
                );
              })}
              <TableCell sx={{ position: "sticky", bottom: 0, bgcolor: "background.default" }} />
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      <Section title="Roster amendment history" subtitle="Approved plans that were changed through the amendment workflow.">
        {amendments.length === 0 ? <Typography variant="body2" color="text.secondary">No amendments for {year}.</Typography> : (
          <Stack spacing={2}>
            {amendments.map((a) => (
              <Stack key={a.id} direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" }, pb: 1.5, borderBottom: 1, borderColor: "divider", "&:last-child": { border: 0, pb: 0 } }}>
                <Box sx={{ minWidth: 180 }}>
                  <Typography variant="body2" sx={{ fontWeight: 650 }}>{a.name}</Typography>
                  <Typography variant="caption" color="text.secondary">v{a.version}{a.amends ? ` · amends plan #${a.amends}` : ""}</Typography>
                </Box>
                <StatusChip status={a.status} />
                <Typography variant="body2" sx={{ flex: 1 }}>{a.periods} <Typography component="span" variant="caption" color="text.secondary">({a.days} days)</Typography></Typography>
                <Typography variant="caption" color="text.secondary">{a.decidedBy ? `${a.decidedBy} · ${fmtDateTime(a.decidedAt)}` : "—"}</Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </Section>
    </>
  );
}
