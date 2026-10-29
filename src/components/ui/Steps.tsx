"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import PriorityHighIcon from "@mui/icons-material/PriorityHigh";

export type StepTone = "done" | "current" | "warning" | "stopped" | "todo";
export interface Step { label: string; tone: StepTone; /** Who/when, shown in the vertical layout. */ detail?: string }

const DOT_BG: Record<StepTone, string> = {
  done: "success.main", current: "primary.main", warning: "warning.main", stopped: "text.disabled", todo: "action.disabledBackground",
};

const LABEL_COLOR: Record<StepTone, string> = {
  done: "success.main", current: "primary.main", warning: "warning.dark", stopped: "text.secondary", todo: "text.secondary",
};

/**
 * Stepper used by the plan and request trackers. Horizontal by default; `compact` shows small dots followed by the
 * name of the step the item has reached (every step's name is in the tooltip and aria-label); `vertical` lists each
 * step with its detail, for narrow panels such as drawers.
 */
export default function Steps({ steps, label, compact, vertical }: { steps: Step[]; label: string; compact?: boolean; vertical?: boolean }) {
  if (vertical) return <Vertical steps={steps} label={label} />;
  if (compact) {
    const at = steps.findLastIndex((s) => s.tone !== "todo");
    const focus = steps[Math.max(0, at)];
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }} role="img" aria-label={label} title={label}>
        <Box sx={{ width: { xs: steps.length * 24, sm: steps.length * 34 }, flexShrink: 0 }}><Dots steps={steps} compact /></Box>
        <Typography variant="caption" noWrap sx={{ fontWeight: 650, color: LABEL_COLOR[focus.tone], minWidth: 0 }}>
          {at >= 0 ? <><Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>Step {at + 1} of {steps.length} · </Box>{focus.label}</> : "Not started"}
        </Typography>
      </Stack>
    );
  }
  return <Box role="img" aria-label={label}><Dots steps={steps} /></Box>;
}

function Dots({ steps, compact }: { steps: Step[]; compact?: boolean }) {
  const size = compact ? 16 : 22;
  return (
    <Stack direction="row" sx={{ alignItems: "center", minWidth: 0 }}>
      {steps.map((s, i) => {
        const active = s.tone !== "todo";
        return (
          <Stack key={i} direction="row" sx={{ alignItems: "center", flex: i < steps.length - 1 ? 1 : "none", minWidth: 0 }}>
            <Stack direction="row" spacing={0.6} sx={{ alignItems: "center", minWidth: 0, flexShrink: compact ? 0 : 1 }}>
              <Box sx={{
                width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
                fontSize: compact ? "0.5625rem" : "0.6875rem", fontWeight: 700,
                bgcolor: DOT_BG[s.tone], color: active ? "#fff" : "text.secondary",
              }}>
                {s.tone === "done" ? <CheckIcon sx={{ fontSize: compact ? "0.6875rem" : "0.875rem" }} />
                  : s.tone === "warning" ? <PriorityHighIcon sx={{ fontSize: compact ? "0.6875rem" : "0.875rem" }} />
                  : s.tone === "stopped" ? <CloseIcon sx={{ fontSize: compact ? "0.6875rem" : "0.875rem" }} />
                  : i + 1}
              </Box>
              {!compact && (
                <Typography variant="caption" noWrap sx={{ fontWeight: active ? 700 : 500, color: active ? "text.primary" : "text.secondary" }}>
                  {s.label}
                </Typography>
              )}
            </Stack>
            {i < steps.length - 1 && (
              <Box sx={{ flex: 1, height: 2, mx: compact ? 0.25 : 0.75, minWidth: compact ? 4 : 6, borderRadius: 1, bgcolor: ["todo", "stopped"].includes(steps[i + 1].tone) ? "divider" : "success.main" }} />
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}

function Vertical({ steps, label }: { steps: Step[]; label: string }) {
  return (
    <Box component="ol" aria-label={label} sx={{ listStyle: "none", m: 0, p: 0 }}>
      {steps.map((s, i) => {
        const active = s.tone !== "todo";
        const last = i === steps.length - 1;
        return (
          <Box component="li" key={i} sx={{ display: "flex", gap: 1.5, minHeight: last ? 0 : 48 }}>
            <Stack sx={{ alignItems: "center", flexShrink: 0 }}>
              <Box sx={{
                width: 24, height: 24, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "0.6875rem", fontWeight: 700,
                bgcolor: DOT_BG[s.tone], color: active ? "#fff" : "text.secondary",
              }}>
                {s.tone === "done" ? <CheckIcon sx={{ fontSize: "0.875rem" }} />
                  : s.tone === "warning" ? <PriorityHighIcon sx={{ fontSize: "0.875rem" }} />
                  : s.tone === "stopped" ? <CloseIcon sx={{ fontSize: "0.875rem" }} />
                  : i + 1}
              </Box>
              {!last && <Box sx={{ width: 2, flex: 1, my: 0.5, borderRadius: 1, bgcolor: ["todo", "stopped"].includes(steps[i + 1].tone) ? "divider" : "success.main" }} />}
            </Stack>
            <Box sx={{ pb: last ? 0 : 1.5, pt: 0.25, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: active ? 650 : 500, color: s.tone === "warning" ? "warning.dark" : active ? "text.primary" : "text.secondary", lineHeight: 1.4 }}>
                {s.label}
              </Typography>
              {s.detail && <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{s.detail}</Typography>}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
