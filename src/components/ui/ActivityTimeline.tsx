"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { fmtDateTime } from "@/lib/format";

export interface TimelineItem { id?: number | string; ts: string; actor: string; summary: string }

function toneOf(summary: string): string {
  const s = summary.toLowerCase();
  if (s.startsWith("approved")) return "success.main";
  if (s.startsWith("rejected")) return "error.main";
  if (s.startsWith("returned") || s.startsWith("cancelled")) return "warning.main";
  if (s.startsWith("submitted") || s.startsWith("resubmitted")) return "primary.main";
  return "text.disabled";
}

/** Vertical activity timeline (newest first by default). */
export default function ActivityTimeline({ items, max }: { items: TimelineItem[]; max?: number }) {
  const list = max ? items.slice(0, max) : items;
  if (!list.length) return <Typography variant="body2" color="text.secondary">No activity yet.</Typography>;
  return (
    <Box component="ol" sx={{ listStyle: "none", m: 0, p: 0 }}>
      {list.map((h, i) => (
        <Box component="li" key={h.id ?? i} sx={{ display: "flex", gap: 1.5, position: "relative", pb: i === list.length - 1 ? 0 : 2 }}>
          <Box sx={{ position: "relative", width: 12, flexShrink: 0, display: "flex", justifyContent: "center" }}>
            <Box sx={{ width: 10, height: 10, mt: 0.6, borderRadius: "50%", bgcolor: toneOf(h.summary), border: 2, borderColor: "background.paper", zIndex: 1 }} />
            {i < list.length - 1 && <Box sx={{ position: "absolute", top: 14, bottom: -6, width: "2px", bgcolor: "divider" }} />}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2">{h.summary}</Typography>
            <Typography variant="caption" color="text.secondary">{h.actor} · {fmtDateTime(h.ts)}</Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
