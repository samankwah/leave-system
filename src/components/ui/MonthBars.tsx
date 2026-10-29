"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { MonthKey } from "@/domain/types";
import { MONTH_NAMES, monthKey, monthLabel } from "@/domain/workingDays";

/**
 * Twelve small vertical bars: working days per month. Restricted months are hatched; months
 * where a new allocation would exceed capacity are flagged in red. Optional `compare` draws a
 * ghost bar (e.g. the approved plan while amending).
 */
export default function MonthBars({ year, values, compare, restrictedMonths, blocked, max }: {
  year: number;
  values: Record<MonthKey, number>;
  compare?: Record<MonthKey, number>;
  restrictedMonths: number[];
  blocked?: Set<MonthKey>;
  max?: number;
}) {
  const top = Math.max(max ?? 0, ...Object.values(values), ...Object.values(compare ?? {}), 5);
  return (
    <Box>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "flex-end", height: 96 }} role="img"
        aria-label={Object.entries(values).map(([m, d]) => `${monthLabel(m)}: ${d} days`).join(", ") || "No days allocated"}>
        {Array.from({ length: 12 }, (_, i) => {
          const m = monthKey(year, i + 1);
          const v = values[m] ?? 0;
          const c = compare?.[m] ?? 0;
          const restricted = restrictedMonths.includes(i + 1);
          const isBlocked = blocked?.has(m);
          return (
            <Tooltip key={m} title={`${monthLabel(m)}: ${restricted ? "restricted" : `${v} day${v === 1 ? "" : "s"}${compare ? ` (approved: ${c})` : ""}${isBlocked ? " — month full" : ""}`}`}>
              <Box sx={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", position: "relative" }}>
                {v > 0 && <Typography sx={{ fontSize: "0.65625rem", fontWeight: 700, mb: 0.25, color: isBlocked ? "error.main" : "text.primary" }}>{v}</Typography>}
                <Box sx={{ width: "100%", position: "relative", height: restricted ? 10 : `${(Math.max(v, c) / top) * 72}px`, minHeight: 3 }}>
                  {compare && c > 0 && (
                    <Box sx={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${(c / Math.max(v, c)) * 100}%`, borderRadius: 1, border: "1.5px dashed", borderColor: "text.disabled" }} />
                  )}
                  <Box sx={{
                    position: "absolute", bottom: 0, left: compare ? 3 : 0, right: compare ? 3 : 0,
                    height: restricted ? "100%" : v ? `${(v / Math.max(v, c)) * 100}%` : 3,
                    borderRadius: 1,
                    bgcolor: restricted ? "leave.restricted" : isBlocked ? "error.main" : v ? "primary.main" : "divider",
                    backgroundImage: restricted ? "repeating-linear-gradient(135deg, rgba(127,127,127,.25) 0 2px, transparent 2px 5px)" : undefined,
                  }} />
                </Box>
              </Box>
            </Tooltip>
          );
        })}
      </Stack>
      <Stack direction="row" spacing={0.5} sx={{ mt: 0.75 }}>
        {MONTH_NAMES.map((n) => (
          <Typography key={n} sx={{ flex: 1, textAlign: "center", fontSize: "0.65625rem", color: "text.secondary" }}>{n[0]}</Typography>
        ))}
      </Stack>
    </Box>
  );
}
