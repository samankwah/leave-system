"use client";

import Link from "next/link";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Theme } from "@mui/material/styles";
import type { SxProps } from "@mui/material/styles";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import type { Issue } from "@/domain/types";

export { fmtDateTime } from "@/lib/format";

export function PageHeader({ title, subtitle, actions, crumbs, eyebrow }: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  crumbs?: { label: string; href?: string }[];
  eyebrow?: React.ReactNode;
}) {
  return (
    <Box sx={{ mb: { xs: 2.5, md: 3.5 } }}>
      {crumbs && (
        <Breadcrumbs sx={{ mb: 1, fontSize: "0.8125rem" }} aria-label="Breadcrumb">
          {crumbs.map((c) => c.href
            ? <Typography key={c.label} component={Link} href={c.href} variant="body2" color="text.secondary" sx={{ textDecoration: "none", "&:hover": { color: "text.primary" } }}>{c.label}</Typography>
            : <Typography key={c.label} variant="body2" color="text.primary">{c.label}</Typography>)}
        </Breadcrumbs>
      )}
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: { md: "flex-end" }, justifyContent: "space-between" }}>
        <Box sx={{ minWidth: 0 }}>
          {eyebrow && <Typography variant="overline" color="text.secondary" sx={{ display: "block", lineHeight: 1.6 }}>{eyebrow}</Typography>}
          <Typography variant="h4" component="h1">{title}</Typography>
          {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, maxWidth: 760 }}>{subtitle}</Typography>}
        </Box>
        {actions && <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, alignItems: "center", flexShrink: 0 }}>{actions}</Stack>}
      </Stack>
    </Box>
  );
}

export function Section({ title, subtitle, action, children, sx, dense, id }: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  sx?: SxProps<Theme>;
  dense?: boolean;
  id?: string;
}) {
  return (
    <Paper id={id} sx={[{ p: dense ? { xs: 1.5, md: 2 } : { xs: 2, md: 2.5 }, borderRadius: "14px" }, ...(Array.isArray(sx) ? sx : [sx])]}>
      {(title || action) && (
        <Stack direction="row" sx={{ mb: 2, alignItems: "flex-start", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
          <Box sx={{ minWidth: 0 }}>
            {title && <Typography variant="subtitle1" component="h2">{title}</Typography>}
            {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{subtitle}</Typography>}
          </Box>
          {action}
        </Stack>
      )}
      {children}
    </Paper>
  );
}

/** Shows validation issues with their title, explanation and next step. */
export function IssueAlerts({ issues, success, compact }: { issues: Issue[]; success?: string; compact?: boolean }) {
  if (!issues.length) {
    return success ? (
      <Alert icon={<CheckCircleRoundedIcon fontSize="inherit" />} severity="success">{success}</Alert>
    ) : null;
  }
  // Collapse identical messages (e.g. several restricted months) to keep the list readable.
  const seen = new Set<string>();
  const unique = issues.filter((i) => {
    const k = i.title + i.message;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return (
    <Stack spacing={1} role="status" aria-live="polite">
      {unique.map((i, n) => (
        <Alert key={n} severity={i.severity === "error" ? "error" : "warning"}>
          <AlertTitle sx={{ fontWeight: 700, mb: compact ? 0 : 0.25 }}>{i.title}</AlertTitle>
          {!compact && i.message}
        </Alert>
      ))}
    </Stack>
  );
}

type Tone = "success" | "warning" | "error" | "info" | "neutral" | "primary";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  approved: { label: "Approved", tone: "success" },
  pending: { label: "Pending", tone: "warning" },
  submitted: { label: "Awaiting approval", tone: "warning" },
  draft: { label: "Draft", tone: "neutral" },
  returned: { label: "Returned", tone: "info" },
  rejected: { label: "Rejected", tone: "error" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  superseded: { label: "Superseded", tone: "neutral" },
  confirmed: { label: "Confirmed", tone: "success" },
  proposed: { label: "Proposed", tone: "warning" },
  assumption: { label: "Assumption", tone: "info" },
  available: { label: "Available", tone: "success" },
  "nearly-full": { label: "1 slot left", tone: "warning" },
  full: { label: "Fully booked", tone: "error" },
  restricted: { label: "Restricted", tone: "neutral" },
  none: { label: "No plan", tone: "neutral" },
};

export function toneSx(tone: Tone): SxProps<Theme> {
  if (tone === "neutral") {
    return (t: Theme) => ({ bgcolor: t.vars!.palette.action.selected, color: t.vars!.palette.text.secondary });
  }
  return (t: Theme) => ({
    bgcolor: `rgba(${t.vars!.palette[tone].mainChannel} / 0.12)`,
    color: t.vars!.palette[tone].dark,
    ...t.applyStyles("dark", { color: t.vars!.palette[tone].light, bgcolor: `rgba(${t.vars!.palette[tone].mainChannel} / 0.18)` }),
  });
}

/** Tonal status pill with a leading dot, so status is never conveyed by colour alone. */
export function StatusChip({ status, label, size = "small" }: { status: string; label?: string; size?: "small" | "medium" }) {
  const s = STATUS[status] ?? { label: status.charAt(0).toUpperCase() + status.slice(1), tone: "neutral" as Tone };
  return (
    <Box
      component="span"
      sx={[
        {
          display: "inline-flex", alignItems: "center", gap: 0.75, px: 1, borderRadius: 1.5, whiteSpace: "nowrap",
          height: size === "small" ? 22 : 28, fontSize: size === "small" ? "0.75rem" : "0.8125rem", fontWeight: 600, lineHeight: 1,
        },
        toneSx(s.tone) as object,
      ]}
    >
      <Box component="span" sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "currentColor", opacity: 0.85 }} />
      {label ?? s.label}
    </Box>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "error" | "success" | "warning" }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontWeight: 500 }}>{label}</Typography>
      <Typography sx={{ fontSize: "1.375rem", fontWeight: 700, lineHeight: 1.3, letterSpacing: "-0.01em", color: tone ? `${tone}.main` : undefined, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Box>
  );
}

export function KeyValue({ rows }: { rows: [React.ReactNode, React.ReactNode][] }) {
  return (
    <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "minmax(110px, auto) 1fr", columnGap: 2, rowGap: 1 }}>
      {rows.map(([k, v], i) => (
        <Box key={i} sx={{ display: "contents" }}>
          <Typography component="dt" variant="body2" color="text.secondary">{k}</Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, fontWeight: 500, minWidth: 0, overflowWrap: "anywhere" }}>{v}</Typography>
        </Box>
      ))}
    </Box>
  );
}
