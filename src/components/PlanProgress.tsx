"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CheckIcon from "@mui/icons-material/Check";
import PriorityHighIcon from "@mui/icons-material/PriorityHigh";

type PlanState = "none" | "draft" | "submitted" | "returned" | "rejected" | "approved";

/** Compact horizontal stepper: Draft → Submitted → Approved (with returned/rejected states). */
export default function PlanProgress({ state, amendment }: { state: PlanState; amendment?: boolean }) {
  const steps = ["Draft", amendment ? "Amendment submitted" : "Submitted", "Approved"];
  const at = { none: -1, draft: 0, returned: 1, rejected: 1, submitted: 1, approved: 2 }[state];
  const problem = state === "returned" || state === "rejected";
  return (
    <Stack direction="row" sx={{ alignItems: "center" }} aria-label={`Plan progress: ${state}`}>
      {steps.map((s, i) => {
        const done = i < at || (i === at && state === "approved");
        const current = i === at && !done;
        const label = current && problem ? (state === "returned" ? "Returned" : "Rejected") : s;
        return (
          <Stack key={s} direction="row" sx={{ alignItems: "center", flex: i < steps.length - 1 ? 1 : "none", minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
              <Box sx={{
                width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700,
                bgcolor: done ? "success.main" : current ? (problem ? "warning.main" : "primary.main") : "action.disabledBackground",
                color: done || current ? "#fff" : "text.secondary",
              }}>
                {done ? <CheckIcon sx={{ fontSize: 14 }} /> : current && problem ? <PriorityHighIcon sx={{ fontSize: 14 }} /> : i + 1}
              </Box>
              <Typography variant="caption" noWrap sx={{ fontWeight: current || done ? 700 : 500, color: current || done ? "text.primary" : "text.secondary" }}>
                {label}
              </Typography>
            </Stack>
            {i < steps.length - 1 && <Box sx={{ flex: 1, height: 2, mx: 1, minWidth: 12, borderRadius: 1, bgcolor: i < at ? "success.main" : "divider" }} />}
          </Stack>
        );
      })}
    </Stack>
  );
}
