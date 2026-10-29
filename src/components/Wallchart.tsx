"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { MonthKey } from "@/domain/types";
import { formatDate, monthNumber, parseISO, toISO, yearOf } from "@/domain/workingDays";
import type { WallchartData } from "@/server/services/queries";

const KIND = {
  approved: { label: "Approved leave", bg: "leave.approved" },
  pending: { label: "Pending request", bg: "leave.pending" },
  plan: { label: "Approved plan", bg: "leave.planned" },
  "plan-pending": { label: "Plan awaiting approval", bg: "leave.planned" },
} as const;
const PRIORITY = ["approved", "pending", "plan", "plan-pending"] as const;
const PAGE = 40;

/**
 * Team wallchart (Timetastic/Breathe style): one row per person, one column per day of the month.
 * Weekends and holidays are shaded, today is highlighted, and a footer row counts people off per day.
 */
export default function Wallchart({ data, month, holidays, today, restricted }: {
  data: WallchartData; month: MonthKey; holidays: Map<string, string>; today: string; restricted: boolean;
}) {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const days = useMemo(() => {
    const y = yearOf(month);
    const m = monthNumber(month);
    return Array.from({ length: new Date(Date.UTC(y, m, 0)).getUTCDate() }, (_, i) => toISO(Date.UTC(y, m - 1, i + 1)));
  }, [month]);
  const matching = useMemo(
    () => data.employees.filter((e) => `${e.name} ${e.department}`.toLowerCase().includes(q.toLowerCase())),
    [data.employees, q],
  );
  // Rows render incrementally: a large organisation never mounts thousands of rows at once.
  const people = matching.slice(0, limit);

  const byPerson = useMemo(() => {
    const map = new Map<number, Map<string, (typeof PRIORITY)[number]>>();
    for (const s of data.spans) {
      if (s.end < days[0] || s.start > days[days.length - 1]) continue;
      const row = map.get(s.employeeId) ?? new Map();
      for (const d of days) {
        if (d < s.start || d > s.end) continue;
        const cur = row.get(d);
        if (!cur || PRIORITY.indexOf(s.kind) < PRIORITY.indexOf(cur)) row.set(d, s.kind);
      }
      map.set(s.employeeId, row);
    }
    return map;
  }, [data.spans, days]);

  const isOff = (d: string) => { const w = new Date(parseISO(d)).getUTCDay(); return w === 0 || w === 6 || holidays.has(d); };
  const offCount = (d: string) => matching.filter((p) => { const k = byPerson.get(p.id)?.get(d); return k === "approved" || k === "pending"; }).length;
  const anyone = people.some((p) => byPerson.get(p.id)?.size);
  const nameCol = 180;

  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 1.5, justifyContent: "space-between", alignItems: { sm: "center" } }}>
        <TextField size="small" placeholder="Filter people or departments" value={q} onChange={(e) => setQ(e.target.value)} sx={{ width: { xs: "100%", sm: 260 } }} />
        <Stack direction="row" sx={{ flexWrap: "wrap", columnGap: 2, rowGap: 0.5 }}>
          {(Object.keys(KIND) as (keyof typeof KIND)[]).map((k) => (
            <Stack key={k} direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
              <Box sx={{ width: 12, height: 12, borderRadius: 0.75, bgcolor: KIND[k].bg, border: k === "plan-pending" ? "1.5px dashed" : "none", borderColor: "leave.plannedText" }} />
              <Typography variant="caption" color="text.secondary">{KIND[k].label}</Typography>
            </Stack>
          ))}
        </Stack>
      </Stack>
      {restricted && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>This month is restricted for leave scheduling.</Typography>}
      <Box sx={{ overflowX: "auto", border: 1, borderColor: "divider", borderRadius: 2 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: `${nameCol}px repeat(${days.length}, minmax(26px, 1fr))`, minWidth: nameCol + days.length * 26 }}>
          <Box sx={{ position: "sticky", left: 0, zIndex: 2, bgcolor: "background.paper", borderBottom: 1, borderColor: "divider", px: 1.5, py: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>{matching.length} people</Typography>
          </Box>
          {days.map((d) => (
            <Box key={d} sx={{
              textAlign: "center", py: 0.5, borderBottom: 1, borderColor: "divider", bgcolor: isOff(d) ? "leave.weekend" : "background.paper",
              boxShadow: d === today ? (t) => `inset 0 -2px 0 ${t.vars!.palette.leave.today}` : undefined,
            }}>
              <Typography sx={{ fontSize: 10, color: "text.disabled", lineHeight: 1.2 }}>{"SMTWTFS"[new Date(parseISO(d)).getUTCDay()]}</Typography>
              <Typography sx={{ fontSize: 12, fontWeight: d === today ? 800 : 600, color: holidays.has(d) ? "leave.holidayAccent" : "text.primary" }}>{Number(d.slice(8))}</Typography>
            </Box>
          ))}
          {people.map((p) => (
            <Box key={p.id} sx={{ display: "contents" }}>
              <Box sx={{ position: "sticky", left: 0, zIndex: 1, bgcolor: "background.paper", borderBottom: 1, borderColor: "divider", px: 1.5, py: 0.75, minWidth: 0 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{p.name}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>{p.department}</Typography>
              </Box>
              {days.map((d, i) => {
                const row = byPerson.get(p.id);
                const k = row?.get(d);
                const off = isOff(d);
                // Join consecutive days of the same kind into one continuous bar (weekends inside a span stay joined).
                const joinLeft = !!k && i > 0 && row?.get(days[i - 1]) === k;
                const joinRight = !!k && i < days.length - 1 && row?.get(days[i + 1]) === k;
                return (
                  <Box key={d} sx={{ borderBottom: 1, borderColor: "divider", bgcolor: off ? "leave.weekend" : undefined, py: "6px", display: "flex" }}>
                    {k && (
                        <Box title={`${p.name} · ${formatDate(d)} · ${KIND[k].label}${off ? " (non-working day)" : ""}`} sx={{
                          flex: 1, ml: joinLeft ? 0 : "2px", mr: joinRight ? 0 : "2px", opacity: off ? 0.45 : 1,
                          borderTopLeftRadius: joinLeft ? 0 : 6, borderBottomLeftRadius: joinLeft ? 0 : 6,
                          borderTopRightRadius: joinRight ? 0 : 6, borderBottomRightRadius: joinRight ? 0 : 6,
                          bgcolor: KIND[k].bg, borderStyle: k === "plan-pending" ? "dashed" : "none", borderWidth: "1.5px 0",
                          borderColor: "leave.plannedText",
                        }} />
                    )}
                  </Box>
                );
              })}
            </Box>
          ))}
          <Box sx={{ position: "sticky", left: 0, zIndex: 1, bgcolor: "background.default", px: 1.5, py: 0.75 }}>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>Off (booked)</Typography>
          </Box>
          {days.map((d) => {
            const n = isOff(d) ? 0 : offCount(d);
            return (
              <Box key={d} sx={{ bgcolor: "background.default", textAlign: "center", py: 0.75 }}>
                <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: n ? "text.primary" : "text.disabled" }}>{isOff(d) ? "" : n || "·"}</Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
      {matching.length > people.length && (
        <Box sx={{ textAlign: "center", mt: 1.5 }}>
          <Button onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, matching.length - people.length)} more of {matching.length - people.length}</Button>
        </Box>
      )}
      {!anyone && <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>Nobody in this view has leave planned or booked this month.</Typography>}
    </Box>
  );
}
