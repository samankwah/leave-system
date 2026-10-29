"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { Issue } from "@/domain/types";
import { IssueAlerts } from "../common";

/** One-line rule-check summary ("All checks passed" / "2 issues to fix") that expands to details. */
export default function ValidationSummary({ issues, okText = "All checks passed", emptyText, defaultOpen = true }: {
  issues: Issue[];
  okText?: string;
  emptyText?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const errors = issues.filter((i) => i.severity === "error").length;
  if (emptyText) {
    return <Typography variant="body2" color="text.secondary">{emptyText}</Typography>;
  }
  if (issues.length === 0) {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", color: "success.main" }} role="status">
        <CheckCircleRoundedIcon fontSize="small" />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{okText}</Typography>
      </Stack>
    );
  }
  return (
    <Box>
      <ButtonBase onClick={() => setOpen(!open)} aria-expanded={open}
        sx={{ width: "100%", justifyContent: "space-between", borderRadius: 1, py: 0.5, color: errors ? "error.main" : "warning.main" }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <ErrorRoundedIcon fontSize="small" />
          <Typography variant="body2" sx={{ fontWeight: 650 }}>
            {errors ? `${errors} issue${errors === 1 ? "" : "s"} to fix` : `${issues.length} warning${issues.length === 1 ? "" : "s"}`}
          </Typography>
        </Stack>
        <ExpandMoreIcon fontSize="small" sx={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </ButtonBase>
      <Collapse in={open}><Box sx={{ mt: 1 }}><IssueAlerts issues={issues} /></Box></Collapse>
    </Box>
  );
}
