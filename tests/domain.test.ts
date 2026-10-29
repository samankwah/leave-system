import { describe, expect, it } from "vitest";
import { computeBalance } from "@/domain/balance";
import { checkCapacity, computeOccupancy } from "@/domain/capacity";
import { describeWindow, messages } from "@/domain/messages";
import { analysePlan, type PlanContext } from "@/domain/planRules";
import { analyseRequest, type RequestContext } from "@/domain/requestRules";
import type { Allocation } from "@/domain/types";
import { countWorkingDays, monthlyBreakdown, monthsSpanned } from "@/domain/workingDays";

const HOL = new Set(["2027-03-08", "2027-03-26", "2027-03-29"]);
const alloc = (employeeId: number, month: string, approved = true, sourceId = employeeId, sourceType: "plan" | "request" = "plan"): Allocation =>
  ({ employeeId, month, days: 5, approved, sourceId, sourceType });

describe("working days", () => {
  it("excludes weekends", () => {
    expect(countWorkingDays("2027-02-01", "2027-02-14", new Set())).toBe(10);
  });
  it("excludes configurable public holidays", () => {
    expect(countWorkingDays("2027-03-01", "2027-03-12", new Set())).toBe(10);
    expect(countWorkingDays("2027-03-01", "2027-03-12", HOL)).toBe(9);
  });
  it("splits a cross-month range into a monthly breakdown", () => {
    expect(monthlyBreakdown("2027-03-24", "2027-04-07", HOL)).toEqual({ "2027-03": 4, "2027-04": 5 });
    expect(monthsSpanned("2027-03-24", "2027-05-02")).toEqual(["2027-03", "2027-04", "2027-05"]);
  });
});

describe("messages", () => {
  it("uses the exact restricted-month wording", () => {
    const m = messages.restricted([1, 12]);
    expect(m.title).toBe("Leave Scheduling Restricted");
    expect(m.message).toBe("Leave scheduling is available from February through November only. Please select an available period.");
  });
  it("names the selected month in the capacity warning", () => {
    const m = messages.capacityFull("2027-02", 5);
    expect(m.title).toBe("⚠️ February Leave Limit Reached!");
    expect(m.message).toContain("A maximum of 5 employees can be scheduled for leave in February.");
  });
  it("describes reconfigured windows", () => {
    expect(describeWindow([1, 7, 12])).toBe("February through June and August through November");
  });
});

describe("monthly capacity", () => {
  it("counts distinct employees, not periods or requests", () => {
    const allocs = [alloc(1, "2027-04"), alloc(1, "2027-04", false, 9, "request"), alloc(2, "2027-04"), alloc(3, "2027-04", false)];
    const occ = computeOccupancy(allocs, ["2027-04"], 5, [1, 12])["2027-04"];
    expect(occ.count).toBe(3);
    expect(occ.pendingOnlyEmployeeIds).toEqual([3]);
  });
  it("blocks a sixth distinct employee", () => {
    const allocs = [1, 2, 3, 4, 5].map((e) => alloc(e, "2027-04"));
    expect(checkCapacity({ employeeId: 6, months: ["2027-04"], allocations: allocs, capacity: 5, mode: "submit" })[0].code).toBe("CAPACITY_FULL");
  });
  it("lets an employee who already holds a slot reuse it", () => {
    const allocs = [1, 2, 3, 4, 5].map((e) => alloc(e, "2027-04"));
    expect(checkCapacity({ employeeId: 5, months: ["2027-04"], allocations: allocs, capacity: 5, mode: "submit" })).toEqual([]);
  });
  it("in approve mode only approved allocations of others block", () => {
    const allocs = [alloc(1, "2027-04"), alloc(2, "2027-04", false), alloc(3, "2027-04", false)];
    expect(checkCapacity({ employeeId: 3, months: ["2027-04"], allocations: allocs, capacity: 2, mode: "approve", self: { sourceType: "plan", sourceId: 3 } })).toEqual([]);
    expect(checkCapacity({ employeeId: 3, months: ["2027-04"], allocations: allocs, capacity: 1, mode: "approve", self: { sourceType: "plan", sourceId: 3 } })[0].code).toBe("CAPACITY_FULL");
  });
});

describe("balances", () => {
  it("keeps approved, pending and planned separate", () => {
    const b = computeBalance({
      baseEntitlement: 35, carryover: 0, approvedRequests: [{ start: "2027-02-01", end: "2027-02-05" }],
      pendingDays: 3, plannedDays: 30, today: "2027-02-03", holidays: new Set(),
    });
    expect(b).toMatchObject({ entitlement: 35, approvedDays: 5, takenToDate: 3, scheduledDays: 2, pendingDays: 3, remainingDays: 30, projectedDays: 27, unallocatedDays: 5 });
  });
});

const planCtx = (over: Partial<PlanContext> = {}): PlanContext => ({
  employeeId: 1, year: 2027, entitlement: 35, holidays: HOL, restrictedMonths: [1, 12], capacity: 5,
  allocations: [], approvedRequests: [], mode: "submit", ...over,
});

describe("plan rules", () => {
  it("allows more than five days in one month", () => {
    const a = analysePlan([{ start: "2027-03-01", end: "2027-03-19" }], planCtx());
    expect(a.issues).toEqual([]);
    expect(a.monthly["2027-03"]).toBe(14);
  });
  it("rejects January and December", () => {
    const a = analysePlan([{ start: "2027-01-11", end: "2027-01-15" }, { start: "2027-12-06", end: "2027-12-10" }], planCtx());
    expect(a.issues.filter((i) => i.code === "RESTRICTED").map((i) => i.month)).toEqual(["2027-01", "2027-12"]);
  });
  it("rejects plans exceeding entitlement and reports unallocated days", () => {
    const a = analysePlan([{ start: "2027-02-01", end: "2027-03-31" }], planCtx({ entitlement: 28 }));
    expect(a.issues.map((i) => i.code)).toContain("PLAN_OVER_ENTITLEMENT");
    const ok = analysePlan([{ start: "2027-02-01", end: "2027-02-12" }], planCtx({ entitlement: 28 }));
    expect(ok.unallocated).toBe(18);
  });
  it("rejects overlapping periods", () => {
    const a = analysePlan([{ start: "2027-02-01", end: "2027-02-12" }, { start: "2027-02-10", end: "2027-02-19" }], planCtx());
    expect(a.issues.map((i) => i.code)).toContain("OVERLAP");
  });
});

const reqCtx = (over: Partial<RequestContext> = {}): RequestContext => ({
  employeeId: 1, today: "2026-10-29", holidays: HOL, restrictedMonths: [1, 12], capacity: 5, entitlement: 35,
  approvedPlan: [{ start: "2027-03-01", end: "2027-03-19" }], existing: [],
  allocations: [alloc(1, "2027-03")], mode: "submit", ...over,
});

describe("request rules", () => {
  it("allows a 10-working-day request supported by the approved plan", () => {
    const a = analyseRequest({ start: "2027-03-01", end: "2027-03-15" }, reqCtx());
    expect(a.days).toBe(10);
    expect(a.issues).toEqual([]);
  });
  it("flags dates outside the approved plan as a mismatch", () => {
    const a = analyseRequest({ start: "2027-03-15", end: "2027-03-24" }, reqCtx());
    expect(a.issues.map((i) => i.code)).toEqual(["PLAN_MISMATCH"]);
    expect(a.issues[0].title).toBe("Master Leave Plan Mismatch");
  });
  it("requires an approved plan", () => {
    expect(analyseRequest({ start: "2027-03-01", end: "2027-03-05" }, reqCtx({ approvedPlan: null })).issues[0].code).toBe("NO_PLAN");
  });
  it("enforces the annual balance including pending leave", () => {
    const a = analyseRequest({ start: "2027-03-01", end: "2027-03-05" }, reqCtx({
      entitlement: 10, existing: [{ id: 7, start: "2027-03-15", end: "2027-03-19", status: "pending", days: 6 }],
    }));
    expect(a.issues.map((i) => i.code)).toContain("BALANCE_EXCEEDED");
  });
  it("detects duplicates and overlaps", () => {
    const existing = [{ id: 7, start: "2027-03-01", end: "2027-03-05", status: "approved" as const, days: 5 }];
    expect(analyseRequest({ start: "2027-03-01", end: "2027-03-05" }, reqCtx({ existing })).issues.map((i) => i.code)).toContain("DUPLICATE");
    expect(analyseRequest({ start: "2027-03-04", end: "2027-03-09" }, reqCtx({ existing })).issues.map((i) => i.code)).toContain("OVERLAP");
  });
  it("rejects restricted months and past dates", () => {
    const a = analyseRequest({ start: "2026-12-07", end: "2026-12-11" }, reqCtx({ approvedPlan: [{ start: "2026-12-01", end: "2026-12-31" }] }));
    expect(a.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["RESTRICTED"]));
    expect(analyseRequest({ start: "2026-10-01", end: "2026-10-02" }, reqCtx()).issues.map((i) => i.code)).toContain("PAST_DATE");
  });
});
