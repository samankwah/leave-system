"use client";

import { formatRange } from "@/domain/workingDays";
import { fmtDateTime, relativeDays } from "@/lib/format";
import type { LeaveRequest } from "@/server/repos/leave";
import Steps, { type Step } from "./ui/Steps";

type Req = Pick<LeaveRequest, "status" | "approverName" | "start" | "end" | "submittedAt" | "decidedAt" | "decidedByName" | "decisionReason">;

/** Where a request is in its workflow: Submitted → With approver → Decision → Leave taken. */
export function requestSteps(r: Req, today: string): Step[] {
  const approver = r.approverName ?? "HR";
  const submitted: Step = { label: "Submitted", tone: "done", detail: fmtDateTime(r.submittedAt) };
  const reviewed: Step = { label: `Reviewed by ${r.decidedByName ?? approver}`, tone: "done", detail: r.decidedAt ? fmtDateTime(r.decidedAt) : undefined };
  const leave = r.end < today ? "Leave taken" : r.start <= today ? "On leave now" : `Starts ${relativeDays(r.start, today)}`;
  switch (r.status) {
    case "pending":
      return [
        submitted,
        { label: `With ${approver}`, tone: "current", detail: "Awaiting a decision" },
        { label: "Decision", tone: "todo" },
        { label: "Leave", tone: "todo", detail: formatRange(r) },
      ];
    case "approved":
      return [submitted, reviewed, { label: "Approved", tone: "done" }, { label: leave, tone: r.end < today ? "done" : "current", detail: formatRange(r) }];
    case "returned":
      return [submitted, reviewed, { label: "Returned for revision", tone: "warning" }, { label: "Leave", tone: "todo" }];
    case "rejected":
      return [submitted, reviewed, { label: "Rejected", tone: "warning" }];
    case "cancelled":
      return [submitted, { label: "Cancelled", tone: "stopped", detail: r.decidedAt ? `${r.decidedByName ?? ""} · ${fmtDateTime(r.decidedAt)}` : undefined }];
  }
}

export default function RequestProgress({ request, today, compact, vertical }: { request: LeaveRequest; today: string; compact?: boolean; vertical?: boolean }) {
  const steps = requestSteps(request, today);
  const label = `Request progress: ${steps.map((s) => `${s.label}${s.tone === "todo" ? " (to do)" : ""}`).join(", ")}`;
  return <Steps steps={steps} label={label} compact={compact} vertical={vertical} />;
}
