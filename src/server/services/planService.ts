import { hasReservation } from "@/domain/capacity";
import { analysePlan, type PlanAnalysis } from "@/domain/planRules";
import { hasErrors } from "@/domain/requestRules";
import type { Allocation, MonthKey, Period } from "@/domain/types";
import { formatRange, isValidISO, yearOf } from "@/domain/workingDays";
import { nowIso, run, tx, type DB } from "../db";
import { badRequest, forbidden, notFound, rejected } from "../errors";
import { audit } from "../repos/audit";
import {
  getApprovedPlan, getPlan, getWorkingPlan, insertPlan, replacePlanPeriods, updatePlan, type Plan,
} from "../repos/leave";
import { notify } from "../repos/notifications";
import { usersByRole, type User } from "../repos/users";
import { loadEmployeeContext } from "./context";
import { approverRecipients, assertCanDecide, notifyIfMonthsFull, resolveApprover } from "./workflow";

const actorOf = (u: User) => ({ id: u.id, name: u.fullName });

export function analyseForEmployee(
  db: DB, employeeId: number, year: number, periods: Period[], mode: "submit" | "approve", planId?: number,
): PlanAnalysis & { allocations: Allocation[] } {
  const ctx = loadEmployeeContext(db, employeeId, year);
  const analysis = analysePlan(periods, {
    employeeId,
    planId,
    year,
    entitlement: ctx.entitlement,
    holidays: ctx.holidays,
    restrictedMonths: ctx.policy.restrictedMonths,
    capacity: ctx.policy.monthlyCapacity,
    allocations: ctx.allocations,
    approvedRequests: ctx.requests.filter((r) => r.status === "approved"),
    mode,
  });
  return { ...analysis, allocations: ctx.allocations };
}

function assertPeriodsShape(periods: Period[], year: number) {
  if (!Array.isArray(periods)) throw badRequest("Periods must be a list.");
  for (const p of periods) {
    if (!isValidISO(p.start) || !isValidISO(p.end) || p.start > p.end) throw badRequest("Each period needs a valid start and end date (end on or after start).");
    if (yearOf(p.start) !== year || yearOf(p.end) !== year) throw badRequest(`All periods must fall within ${year}.`);
  }
}

/** Saves (creates or updates) the employee's editable plan. Drafts may contain rule violations; submission may not. */
export function savePlanDraft(db: DB, actor: User, year: number, periods: Period[]): Plan {
  assertPeriodsShape(periods, year);
  return tx(db, () => {
    let plan = getWorkingPlan(db, actor.id, year);
    if (plan?.status === "submitted") throw badRequest("This plan is awaiting approval and cannot be edited. Ask your approver to return it for revision if changes are needed.");
    if (!plan) {
      const approved = getApprovedPlan(db, actor.id, year);
      if (approved) throw badRequest("You already have an approved plan for this year. Start a plan amendment to change it.");
      const id = insertPlan(db, { employeeId: actor.id, year, status: "draft" });
      plan = getPlan(db, id)!;
      audit(db, actorOf(actor), "plan.create", "plan", id, `Created master leave plan ${year} v${plan.version} (draft)`);
    }
    const analysis = analyseForEmployee(db, actor.id, year, periods, "submit", plan.id);
    replacePlanPeriods(db, plan.id, analysis.periods.map((p) => ({ start: p.start, end: p.end, days: p.days })), analysis.monthly);
    if (plan.status === "returned") updatePlan(db, plan.id, { status: "draft" });
    audit(db, actorOf(actor), "plan.save", "plan", plan.id, `Saved plan ${year} v${plan.version}: ${analysis.total} day(s) in ${periods.length} period(s)`, {
      periods: periods.map(formatRange),
    });
    return getPlan(db, plan.id)!;
  });
}

export function submitPlan(db: DB, actor: User, planId: number): Plan {
  return tx(db, () => {
    const plan = getPlan(db, planId);
    if (!plan) throw notFound("Plan");
    if (plan.employeeId !== actor.id) throw forbidden("You can only submit your own plan.");
    if (plan.status !== "draft" && plan.status !== "returned") throw badRequest(`A ${plan.status} plan cannot be submitted.`);
    const analysis = analyseForEmployee(db, actor.id, plan.year, plan.periods, "submit", plan.id);
    if (hasErrors(analysis.issues)) throw rejected(analysis.issues, "The plan cannot be submitted until these issues are resolved.");

    const newMonths = Object.keys(analysis.monthly).filter(
      (m) => !hasReservation({ employeeId: actor.id, allocations: analysis.allocations, mode: "submit", self: { sourceType: "plan", sourceId: plan.id } }, m),
    );
    const approverId = resolveApprover(db, actor);
    updatePlan(db, plan.id, { status: "submitted", submitted_at: nowIso(), approver_id: approverId, decided_by: null, decided_at: null, decision_reason: null });
    const label = plan.amendsPlanId ? "plan amendment" : "master leave plan";
    audit(db, actorOf(actor), "plan.submit", "plan", plan.id, `Submitted ${label} ${plan.year} v${plan.version} (${analysis.total} days)`, {
      approverId, monthly: analysis.monthly,
    });
    notify(db, approverRecipients(db, approverId), "plan.submitted", `New ${label} to review`,
      `${actor.fullName} submitted a ${plan.year} ${label} (${analysis.total} working days).`, `/approvals?item=plan-${plan.id}`);
    notify(db, [actor.id], "plan.submitted", `${plan.year} plan submitted`,
      `Your ${label} was submitted for approval. Its months are now reserved against monthly capacity.`, `/plan?year=${plan.year}`);
    notifyIfMonthsFull(db, newMonths, plan.year);
    return getPlan(db, plan.id)!;
  });
}

/** Creates a new draft version from the approved plan. The approved plan stays in force until the amendment is approved. */
export function startAmendment(db: DB, actor: User, year: number): Plan {
  return tx(db, () => {
    const approved = getApprovedPlan(db, actor.id, year);
    if (!approved) throw badRequest("There is no approved plan to amend.");
    if (getWorkingPlan(db, actor.id, year)) throw badRequest("You already have a plan version in progress for this year.");
    const id = insertPlan(db, { employeeId: actor.id, year, status: "draft", amendsPlanId: approved.id });
    replacePlanPeriods(db, id, approved.periods, approved.monthly);
    const plan = getPlan(db, id)!;
    audit(db, actorOf(actor), "plan.amend.start", "plan", id, `Started amendment v${plan.version} of approved plan v${approved.version} (${year})`);
    return plan;
  });
}

export function discardDraft(db: DB, actor: User, planId: number) {
  tx(db, () => {
    const plan = getPlan(db, planId);
    if (!plan) throw notFound("Plan");
    if (plan.employeeId !== actor.id) throw forbidden();
    if (plan.status !== "draft") throw badRequest("Only draft plans can be discarded.");
    run(db, "DELETE FROM master_plans WHERE id = ?", planId);
    audit(db, actorOf(actor), "plan.discard", "plan", planId, `Discarded draft plan ${plan.year} v${plan.version}`);
  });
}

export type Decision = "approve" | "reject" | "return";

export function decidePlan(db: DB, actor: User, planId: number, decision: Decision, reason: string): Plan {
  return tx(db, () => {
    const plan = getPlan(db, planId);
    if (!plan) throw notFound("Plan");
    assertCanDecide(actor, plan);
    if (plan.status !== "submitted") throw badRequest(`This plan is ${plan.status}; only submitted plans can be decided.`);
    reason = (reason ?? "").trim();
    if (decision !== "approve" && !reason) throw badRequest("A reason is required when rejecting or returning a plan.");
    const ts = nowIso();
    const label = plan.amendsPlanId ? "plan amendment" : "master leave plan";

    if (decision === "approve") {
      // Revalidate every mandatory rule immediately before approval.
      const analysis = analyseForEmployee(db, plan.employeeId, plan.year, plan.periods, "approve", plan.id);
      if (hasErrors(analysis.issues)) throw rejected(analysis.issues, "This plan can no longer be approved because it violates mandatory rules.");
      const previous = getApprovedPlan(db, plan.employeeId, plan.year);
      if (previous) updatePlan(db, previous.id, { status: "superseded" });
      updatePlan(db, plan.id, { status: "approved", decided_by: actor.id, decided_at: ts, decision_reason: reason || null });
      audit(db, actorOf(actor), "plan.approve", "plan", plan.id, `Approved ${plan.employeeName}'s ${label} ${plan.year} v${plan.version}`, {
        reason, supersedes: previous?.id ?? null,
        before: previous?.periods.map(formatRange) ?? [], after: plan.periods.map(formatRange),
      });
      notify(db, [plan.employeeId], "plan.approved", `${plan.year} ${label} approved`,
        `${actor.fullName} approved your ${label}. You can now request leave for the approved dates.`, `/plan?year=${plan.year}`);
      if (previous) {
        notify(db, [...usersByRole(db, "hr").map((u) => u.id), plan.approverId], "plan.changed",
          `Approved plan changed: ${plan.employeeName}`,
          `${plan.employeeName}'s ${plan.year} plan v${previous.version} was superseded by v${plan.version}.`, "/hr/roster");
      }
    } else {
      const status = decision === "reject" ? "rejected" : "returned";
      updatePlan(db, plan.id, { status, decided_by: actor.id, decided_at: ts, decision_reason: reason });
      audit(db, actorOf(actor), `plan.${decision}`, "plan", plan.id, `${decision === "reject" ? "Rejected" : "Returned for revision"}: ${plan.employeeName}'s ${label} ${plan.year} v${plan.version}`, { reason });
      notify(db, [plan.employeeId], `plan.${status}`,
        decision === "reject" ? `${plan.year} ${label} rejected` : `${plan.year} ${label} returned for revision`,
        `${actor.fullName}: ${reason}`, `/plan?year=${plan.year}`);
    }
    return getPlan(db, plan.id)!;
  });
}

export function monthsOf(plan: Plan): MonthKey[] {
  return Object.keys(plan.monthly);
}
