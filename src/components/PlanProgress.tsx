"use client";

import Steps, { type StepTone } from "./ui/Steps";

type PlanState = "none" | "draft" | "submitted" | "returned" | "rejected" | "approved" | "superseded";

/** Compact horizontal stepper: Draft → Submitted → Approved (with returned/rejected states). */
export default function PlanProgress({ state, amendment, compact }: { state: PlanState; amendment?: boolean; compact?: boolean }) {
  const names = ["Draft", amendment ? "Amendment submitted" : "Submitted", "Approved"];
  const at = { none: -1, draft: 0, returned: 1, rejected: 1, submitted: 1, approved: 2, superseded: 2 }[state];
  const problem = state === "returned" || state === "rejected";
  const steps = names.map((s, i) => {
    const done = i < at || (i === at && (state === "approved" || state === "superseded"));
    const current = i === at && !done;
    const tone: StepTone = done ? "done" : current ? (problem ? "warning" : "current") : "todo";
    const label = current && problem ? (state === "returned" ? "Returned" : "Rejected") : state === "superseded" && i === 2 ? "Superseded" : s;
    return { label, tone };
  });
  return <Steps steps={steps} compact={compact} label={`Plan progress: ${steps.map((s) => `${s.label}${s.tone === "todo" ? " (to do)" : ""}`).join(", ")}`} />;
}
