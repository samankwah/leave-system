"use client";

import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Grid from "@mui/material/Grid2";
import LinearProgress from "@mui/material/LinearProgress";
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
import TableSortLabel from "@mui/material/TableSortLabel";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import TableRowsOutlinedIcon from "@mui/icons-material/TableRowsOutlined";
import { PageHeader, Section } from "@/components/common";
import EmptyState from "@/components/ui/EmptyState";
import { api, errorText } from "@/lib/client";
import type { Report } from "@/server/services/reportService";

interface Kpis { year: number; planCoverage: number; plannedPct: number; pending: number; fullMonths: number }

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) {
  return (
    <Paper sx={{ p: 2, borderRadius: "14px", height: "100%" }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography sx={{ fontSize: "1.75rem", fontWeight: 750, letterSpacing: "-0.02em", lineHeight: 1.3, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{hint}</Typography>
    </Paper>
  );
}

export default function ReportsView({ reports, defaultYear, years, kpis }: {
  reports: Record<string, { title: string; description: string }>; defaultYear: number; years: number[]; kpis: Kpis;
}) {
  const [key, setKey] = useState("balances");
  const [year, setYear] = useState(defaultYear);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" } | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    setSort(null);
    api<Report>(`/api/reports/${key}?year=${year}`, "GET")
      .then((r) => live && setReport(r))
      .catch((e) => live && setError(errorText(e)))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [key, year]);

  const rows = useMemo(() => {
    if (!report || !sort) return report?.rows ?? [];
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...report.rows].sort((a, b) => {
      const x = a[sort.col]; const y = b[sort.col];
      return typeof x === "number" && typeof y === "number" ? (x - y) * dir : String(x ?? "").localeCompare(String(y ?? "")) * dir;
    });
  }, [report, sort]);

  return (
    <>
      <PageHeader title="Reports" subtitle="Monitor allocations and approvals, and export data for further analysis. Exports reflect live data at download time." />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}><Kpi label="Approved plans" value={`${kpis.planCoverage}%`} hint={`of active employees, ${kpis.year}`} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Kpi label="Entitlement planned" value={`${kpis.plannedPct}%`} hint="Planned days ÷ total entitlement" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Kpi label="Pending approvals" value={kpis.pending} hint="Plans and requests awaiting a decision" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Kpi label="Fully booked months" value={kpis.fullMonths} hint={`At monthly capacity in ${kpis.year}`} /></Grid>
      </Grid>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 4, lg: 3 }}>
          <Stack spacing={1}>
            {Object.entries(reports).map(([k, r]) => (
              <ButtonBase key={k} onClick={() => setKey(k)} aria-pressed={k === key}
                sx={{
                  display: "block", textAlign: "left", p: 1.5, borderRadius: 2, border: 1, bgcolor: "background.paper",
                  borderColor: k === key ? "primary.main" : "divider", boxShadow: k === key ? (t) => `0 0 0 1px ${t.vars!.palette.primary.main}` : "none",
                  "&:hover": { borderColor: "primary.main" },
                }}>
                <Typography variant="body2" sx={{ fontWeight: 650 }}>{r.title}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.description}</Typography>
              </ButtonBase>
            ))}
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, md: 8, lg: 9 }}>
          <Section
            title={report?.title ?? reports[key].title}
            subtitle={report ? `${report.rows.length} row${report.rows.length === 1 ? "" : "s"} · ${reports[key].description}` : reports[key].description}
            action={
              <Stack direction="row" spacing={1}>
                {key !== "audit" && (
                  <TextField select size="small" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year" sx={{ width: 96 }}>
                    {years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                  </TextField>
                )}
                <Button variant="contained" startIcon={<FileDownloadOutlinedIcon />} onClick={(e) => setAnchor(e.currentTarget)}>Export</Button>
                <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
                  <MenuItem component="a" href={`/api/reports/${key}?year=${year}&format=xlsx`} onClick={() => setAnchor(null)}>Excel workbook (.xlsx)</MenuItem>
                  <MenuItem component="a" href={`/api/reports/${key}?year=${year}&format=csv`} onClick={() => setAnchor(null)}>CSV (.csv)</MenuItem>
                </Menu>
              </Stack>
            }
          >
            <Box sx={{ height: 4, mb: 1 }}>{loading && <LinearProgress />}</Box>
            {error && <Alert severity="error">{error}</Alert>}
            {report && (rows.length === 0 ? (
              <EmptyState compact icon={<TableRowsOutlinedIcon />} title="No rows" description="Nothing matches this report for the selected year." />
            ) : (
              <TableContainer sx={{ maxHeight: 560, border: 1, borderColor: "divider", borderRadius: 2 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {report.columns.map((c) => (
                        <TableCell key={c.key} sortDirection={sort?.col === c.key ? sort.dir : false} sx={{ whiteSpace: "nowrap" }}>
                          <TableSortLabel active={sort?.col === c.key} direction={sort?.col === c.key ? sort.dir : "asc"}
                            onClick={() => setSort((s) => ({ col: c.key, dir: s?.col === c.key && s.dir === "asc" ? "desc" : "asc" }))}>
                            {c.label}
                          </TableSortLabel>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row, i) => (
                      <TableRow key={i} hover>
                        {report.columns.map((c) => {
                          const v = row[c.key];
                          const overdue = v === "OVERDUE";
                          return (
                            <TableCell key={c.key} align={typeof v === "number" ? "right" : "left"}
                              sx={{ color: overdue ? "error.main" : undefined, fontWeight: overdue ? 700 : undefined, fontVariantNumeric: "tabular-nums" }}>
                              {String(v ?? "")}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ))}
          </Section>
        </Grid>
      </Grid>
    </>
  );
}
