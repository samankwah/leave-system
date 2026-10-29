import { hasReservation } from "@/domain/capacity";
import { analyseRequest, hasErrors, type RequestAnalysis } from "@/domain/requestRules";
import type { Allocation, Period } from "@/domain/types";
import { formatRange, isValidISO, yearOf } from "@/domain/workingDays";
import { capKeys, empKey, lockKeys, nowIso, todayIso, tx, type DB } from "../db";
import { badRequest, forbidden, notFound, rejected } from "../errors";
import { audit } from "../repos/audit";
import { getPolicy } from "../repos/settings";
import {
  getRequest, insertRequest, replaceRequestBreakdown, updateRequest, type LeaveRequest, type StoredAttachment,
} from "../repos/leave";
import { notify } from "../repos/notifications";
import type { User } from "../repos/users";
import { loadEmployeeContext } from "./context";
import { approverRecipients, assertCanDecide, notifyIfMonthsFull, resolveApprover } from "./workflow";
import { monthsOfPeriods, type Decision } from "./planService";

const actorOf = (u: User) => ({ id: u.id, name: u.fullName });

export interface RequestInput extends Period {
  leaveType: string;
  reason?: string;
}

export interface Attachment {
  name: string;
  type: string;
  data: Buffer;
}

export const ATTACHMENT_RULES = {
  maxBytes: 2 * 1024 * 1024,
  types: { "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg" } as Record<string, string>,
};

export async function analyseRequestFor(
  db: DB, employeeId: number, input: Period, mode: "submit" | "approve", requestId?: number,
): Promise<RequestAnalysis & { planId: number | null; allocations: Allocation[] }> {
  if (!isValidISO(input.start) || !isValidISO(input.end)) {
    return { ...analyseRequest(input, emptyCtx(employeeId)), planId: null, allocations: [] };
  }
  const ctx = await loadEmployeeContext(db, employeeId, yearOf(input.start));
  const analysis = analyseRequest(input, {
    employeeId,
    requestId,
    today: ctx.today,
    holidays: ctx.holidays,
    restrictedMonths: ctx.policy.restrictedMonths,
    capacity: ctx.policy.monthlyCapacity,
    entitlement: ctx.entitlement,
    approvedPlan: ctx.approvedPlan?.periods ?? null,
    existing: ctx.activeRequests,
    allocations: ctx.allocations,
    mode,
  });
  return { ...analysis, planId: ctx.approvedPlan?.id ?? null, allocations: ctx.allocations };
}

function emptyCtx(employeeId: number) {
  return {
    employeeId, today: todayIso(), holidays: new Set<string>(), restrictedMonths: [], capacity: 0, entitlement: 0,
    approvedPlan: null, existing: [], allocations: [], mode: "submit" as const,
  };
}

async function validateInput(db: DB, input: RequestInput) {
  const { leaveTypes } = await getPolicy(db);
  if (!leaveTypes.includes(input.leaveType)) throw badRequest(`Unknown leave type "${input.leaveType}".`);
  if ((input.reason ?? "").length > 1000) throw badRequest("Reason must be 1000 characters or fewer.");
}

/** Validates type, size and file signature. Documents are stored in the database (serverless disks don't persist). */
export function checkAttachment(att: Attachment | undefined): StoredAttachment | null {
  if (!att) return null;
  const ext = ATTACHMENT_RULES.types[att.type];
  if (!ext) throw badRequest("Supporting documents must be PDF, PNG or JPEG files.");
  if (att.data.length > ATTACHMENT_RULES.maxBytes) throw badRequest("Supporting documents must be 2 MB or smaller.");
  const magic = att.data.subarray(0, 4).toString("hex");
  const ok = (ext === ".pdf" && magic === "25504446") || (ext === ".png" && magic === "89504e47") || (ext === ".jpg" && magic.startsWith("ffd8ff"));
  if (!ok) throw badRequest("The uploaded file's content does not match its type.");
  return { name: att.name.replace(/[^\w.\- ]/g, "_").slice(0, 120), type: att.type, data: att.data };
}

export async function submitRequest(db: DB, actor: User, input: RequestInput, attachment?: Attachment): Promise<LeaveRequest> {
  await validateInput(db, input);
  const file = checkAttachment(attachment);
  return tx(db, async (db) => {
    await lockKeys(db, [empKey(actor.id), ...capKeys(monthsOfPeriods([input]))]);
    const analysis = await analyseRequestFor(db, actor.id, input, "submit");
    if (hasErrors(analysis.issues)) throw rejected(analysis.issues, "The leave request cannot be submitted until these issues are resolved.");
    const year = yearOf(input.start);
    const newMonths = Object.keys(analysis.breakdown).filter((m) => !hasReservation({ employeeId: actor.id, allocations: analysis.allocations, mode: "submit" }, m));
    const approverId = await resolveApprover(db, actor);
    const id = await insertRequest(db, {
      employeeId: actor.id, year, leaveType: input.leaveType, start: input.start, end: input.end, days: analysis.days,
      reason: (input.reason ?? "").trim(), status: "pending", planId: analysis.planId, approverId, attachment: file,
    }, analysis.breakdown);
    await audit(db, actorOf(actor), "request.submit", "request", id, `Submitted ${input.leaveType} ${formatRange(input)} (${analysis.days} days)`, {
      breakdown: analysis.breakdown, approverId,
    });
    await notify(db, await approverRecipients(db, approverId), "request.submitted", "New leave request to review",
      `${actor.fullName} requested ${analysis.days} working day(s): ${formatRange(input)}.`, `/approvals?item=request-${id}`);
    await notify(db, [actor.id], "request.submitted", "Leave request submitted",
      `Your request for ${formatRange(input)} (${analysis.days} days) is awaiting approval.`, `/requests?open=${id}`);
    await notifyIfMonthsFull(db, newMonths, year);
    return (await getRequest(db, id))!;
  });
}

/** Edits and resubmits a request that was returned for revision. History is kept in the audit trail. */
export async function resubmitRequest(db: DB, actor: User, id: number, input: RequestInput, attachment?: Attachment): Promise<LeaveRequest> {
  await validateInput(db, input);
  const file = checkAttachment(attachment);
  return tx(db, async (db) => {
    await lockKeys(db, [empKey(actor.id), ...capKeys(monthsOfPeriods([input]))]);
    const req = await getRequest(db, id);
    if (!req) throw notFound("Leave request");
    if (req.employeeId !== actor.id) throw forbidden("You can only edit your own requests.");
    if (req.status !== "returned") throw badRequest("Only requests returned for revision can be edited and resubmitted.");
    const analysis = await analyseRequestFor(db, actor.id, input, "submit", id);
    if (hasErrors(analysis.issues)) throw rejected(analysis.issues, "The leave request cannot be resubmitted until these issues are resolved.");
    const approverId = await resolveApprover(db, actor);
    await updateRequest(db, id, {
      status: "pending", leave_type: input.leaveType, start_date: input.start, end_date: input.end, working_days: analysis.days,
      year: yearOf(input.start), reason: (input.reason ?? "").trim(), plan_id: analysis.planId, approver_id: approverId,
      submitted_at: nowIso(), decided_by: null, decided_at: null, decision_reason: null,
      ...(file ? { attachment_name: file.name, attachment_type: file.type, attachment_data: file.data } : {}),
    });
    await replaceRequestBreakdown(db, id, analysis.breakdown);
    await audit(db, actorOf(actor), "request.resubmit", "request", id, `Resubmitted request: ${formatRange(req)} → ${formatRange(input)}`, {
      before: { start: req.start, end: req.end, days: req.days }, after: { start: input.start, end: input.end, days: analysis.days },
    });
    await notify(db, await approverRecipients(db, approverId), "request.submitted", "Revised leave request to review",
      `${actor.fullName} revised and resubmitted a request: ${formatRange(input)} (${analysis.days} days).`, `/approvals?item=request-${id}`);
    return (await getRequest(db, id))!;
  });
}

export function cancelRequest(db: DB, actor: User, id: number, reason: string): Promise<LeaveRequest> {
  return tx(db, async (db) => {
    const pre = await getRequest(db, id);
    if (!pre) throw notFound("Leave request");
    await lockKeys(db, [empKey(pre.employeeId)]);
    const req = await getRequest(db, id);
    if (!req) throw notFound("Leave request");
    const own = req.employeeId === actor.id;
    if (!own && actor.role !== "hr") throw forbidden("You can only cancel your own requests.");
    if (!["pending", "approved", "returned"].includes(req.status)) throw badRequest(`A ${req.status} request cannot be cancelled.`);
    if (own && req.status === "approved" && req.start <= todayIso()) {
      throw badRequest("Approved leave that has already started can only be cancelled by HR.");
    }
    await updateRequest(db, id, { status: "cancelled", decision_reason: reason?.trim() || null, decided_at: nowIso(), decided_by: actor.id });
    await audit(db, actorOf(actor), "request.cancel", "request", id, `Cancelled ${req.employeeName}'s request ${formatRange(req)} (was ${req.status})`, { reason });
    await notify(db, own ? await approverRecipients(db, req.approverId) : [req.employeeId], "request.cancelled", "Leave request cancelled",
      `${actor.fullName} cancelled the request for ${formatRange(req)}. Any capacity it reserved has been released.`, own ? `/approvals?item=request-${id}` : `/requests?open=${id}`);
    return (await getRequest(db, id))!;
  });
}

export function decideRequest(db: DB, actor: User, id: number, decision: Decision, reason: string): Promise<LeaveRequest> {
  return tx(db, async (db) => {
    const pre = await getRequest(db, id);
    if (!pre) throw notFound("Leave request");
    await lockKeys(db, [empKey(pre.employeeId), ...(decision === "approve" ? capKeys(monthsOfPeriods([pre])) : [])]);
    const req = await getRequest(db, id);
    if (!req) throw notFound("Leave request");
    assertCanDecide(actor, req);
    if (req.status !== "pending") throw badRequest(`This request is ${req.status}; only pending requests can be decided.`);
    reason = (reason ?? "").trim();
    if (decision !== "approve" && !reason) throw badRequest("A reason is required when rejecting or returning a request.");
    const ts = nowIso();
    if (decision === "approve") {
      const analysis = await analyseRequestFor(db, req.employeeId, req, "approve", id);
      if (hasErrors(analysis.issues)) throw rejected(analysis.issues, "This request can no longer be approved because it violates mandatory rules.");
      await updateRequest(db, id, { status: "approved", decided_by: actor.id, decided_at: ts, decision_reason: reason || null });
      await audit(db, actorOf(actor), "request.approve", "request", id, `Approved ${req.employeeName}'s leave ${formatRange(req)} (${req.days} days)`, { reason });
      await notify(db, [req.employeeId], "request.approved", "Leave request approved",
        `${actor.fullName} approved your leave for ${formatRange(req)} (${req.days} days).`, `/requests?open=${id}`);
    } else {
      const status = decision === "reject" ? "rejected" : "returned";
      await updateRequest(db, id, { status, decided_by: actor.id, decided_at: ts, decision_reason: reason });
      await audit(db, actorOf(actor), `request.${decision}`, "request", id,
        `${decision === "reject" ? "Rejected" : "Returned for revision"}: ${req.employeeName}'s leave ${formatRange(req)}`, { reason });
      await notify(db, [req.employeeId], `request.${status}`,
        decision === "reject" ? "Leave request rejected" : "Leave request returned for revision",
        `${actor.fullName}: ${reason}`, `/requests?open=${id}`);
    }
    return (await getRequest(db, id))!;
  });
}
