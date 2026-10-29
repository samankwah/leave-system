"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import CloseIcon from "@mui/icons-material/Close";
import { formatRange, monthLabel } from "@/domain/workingDays";
import { KeyValue, StatusChip } from "@/components/common";
import ActivityTimeline, { type TimelineItem } from "@/components/ui/ActivityTimeline";
import { api } from "@/lib/client";
import { fmtDateTime } from "@/lib/format";
import type { LeaveRequest } from "@/server/repos/leave";
import RequestProgress from "./RequestProgress";

/**
 * Detail drawer for one leave request. "own" mode offers the employee's actions (cancel, revise);
 * "viewer" mode is read-only for a manager or HR, with a link to the approvals queue when it is theirs to decide.
 */
export default function RequestDrawer({ request, today, mode, onClose, onCancel, department, canReview }: {
  request: LeaveRequest | null; today: string; mode: "own" | "viewer"; onClose: () => void;
  onCancel?: (r: LeaveRequest) => void; department?: string; canReview?: boolean;
}) {
  // The timeline is fetched when the drawer opens, not sent with the page; keyed by status so it refreshes after a change.
  const [history, setHistory] = useState<Record<string, TimelineItem[]>>({});
  const id = request?.id ?? null;
  const key = request ? `${request.id}:${request.status}` : null;
  useEffect(() => {
    if (id === null || key === null || history[key]) return;
    let live = true;
    api<TimelineItem[]>(`/api/requests/${id}/history`, "GET")
      .then((items) => { if (live) setHistory((h) => ({ ...h, [key]: items })); })
      .catch(() => { if (live) setHistory((h) => ({ ...h, [key]: [] })); });
    return () => { live = false; };
  }, [id, key, history]);

  const own = mode === "own";
  const canCancel = (r: LeaveRequest) => own && (r.status === "pending" || r.status === "returned" || (r.status === "approved" && r.start > today));
  const r = request;

  return (
    <Drawer anchor="right" open={!!r} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: "100%", sm: 460 } } } }}>
      {r && (
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <Stack direction="row" sx={{ alignItems: "center", px: 2.5, py: 2, borderBottom: 1, borderColor: "divider" }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">{own ? r.leaveType : `${r.employeeName} · ${r.leaveType}`}</Typography>
              <Typography variant="h6">{formatRange(r)}</Typography>
            </Box>
            <IconButton onClick={onClose} aria-label="Close"><CloseIcon /></IconButton>
          </Stack>
          <Box sx={{ p: 2.5, flex: 1, overflowY: "auto" }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
              <StatusChip status={r.status} size="medium" />
            </Stack>
            <Box sx={{ mb: 2.5, p: 2, borderRadius: 2, border: 1, borderColor: "divider" }}>
              <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1, lineHeight: 1.5 }}>Workflow</Typography>
              <RequestProgress request={r} today={today} vertical />
            </Box>
            <KeyValue rows={[
              ...(!own ? [["Employee", department ? `${r.employeeName} · ${department}` : r.employeeName] as [string, string]] : []),
              ["Working days", r.days],
              ["By month", Object.entries(r.breakdown).map(([m, d]) => `${monthLabel(m)}: ${d}`).join(" · ")],
              ["Submitted", fmtDateTime(r.submittedAt)],
              ["Approver", r.approverName ?? "HR Administrators"],
              ...(r.decidedAt ? [["Decided", `${r.decidedByName ?? ""} · ${fmtDateTime(r.decidedAt)}`] as [string, string]] : []),
              ...(r.reason ? [[own ? "Your note" : "Employee's note", r.reason] as [string, string]] : []),
            ]} />
            {r.decisionReason && (
              <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: "action.hover" }}>
                <Typography variant="caption" color="text.secondary">Comment from {r.decidedByName}</Typography>
                <Typography variant="body2">{r.decisionReason}</Typography>
              </Box>
            )}
            {r.attachmentName && (
              <Button sx={{ mt: 2 }} variant="outlined" startIcon={<AttachFileIcon />} href={`/api/requests/${r.id}/attachment`}>{r.attachmentName}</Button>
            )}
            <Divider sx={{ my: 2.5 }} />
            <Typography variant="overline" color="text.secondary">Activity</Typography>
            <Box sx={{ mt: 1 }}>
              {key && history[key] ? <ActivityTimeline items={history[key]} /> : <CircularProgress size={20} aria-label="Loading activity" />}
            </Box>
          </Box>
          {(own ? r.status === "returned" || canCancel(r) : canReview && r.status === "pending") && (
            <Stack direction="row" spacing={1} sx={{ p: 2, borderTop: 1, borderColor: "divider", justifyContent: "flex-end" }}>
              {canCancel(r) && onCancel && <Button color="error" onClick={() => onCancel(r)}>Cancel request</Button>}
              {own && r.status === "returned" && <Button variant="contained" component={NextLink} href={`/requests/new?edit=${r.id}`}>Revise and resubmit</Button>}
              {!own && <Button variant="contained" component={NextLink} href={`/approvals?item=request-${r.id}`}>Review in Approvals</Button>}
            </Stack>
          )}
        </Box>
      )}
    </Drawer>
  );
}
