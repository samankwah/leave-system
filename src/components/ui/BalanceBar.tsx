"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

export interface Segment { key: string; label: string; value: number; color: string; hatch?: boolean }

/**
 * Segmented horizontal bar (taken / scheduled / pending / remaining) with a legend.
 * Segments carry text labels in the legend, so colour is not the only signal.
 */
export default function BalanceBar({ segments, total, height = 10, legend = true }: {
  segments: Segment[];
  total: number;
  height?: number;
  legend?: boolean;
}) {
  const sum = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const denom = Math.max(total, sum, 1);
  return (
    <Box>
      <Box
        role="img"
        aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(", ")}
        sx={{ display: "flex", height, borderRadius: height, overflow: "hidden", bgcolor: "chart.remaining", gap: "2px" }}
      >
        {segments.filter((s) => s.value > 0).map((s) => (
          <Tooltip key={s.key} title={`${s.label}: ${s.value} day${s.value === 1 ? "" : "s"}`}>
            <Box sx={{
              width: `${(s.value / denom) * 100}%`, bgcolor: s.color, transition: "width .4s ease",
              backgroundImage: s.hatch ? "repeating-linear-gradient(135deg, rgba(255,255,255,.35) 0 3px, transparent 3px 6px)" : undefined,
            }} />
          </Tooltip>
        ))}
      </Box>
      {legend && (
        <Stack direction="row" sx={{ flexWrap: "wrap", columnGap: 2, rowGap: 0.75, mt: 1.25 }}>
          {segments.map((s) => (
            <Stack key={s.key} direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
              <Box sx={{
                width: 10, height: 10, borderRadius: 0.75, bgcolor: s.color,
                backgroundImage: s.hatch ? "repeating-linear-gradient(135deg, rgba(255,255,255,.45) 0 2px, transparent 2px 4px)" : undefined,
              }} />
              <Typography variant="caption" color="text.secondary">
                {s.label} <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>{s.value}</Box>
              </Typography>
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
  );
}
