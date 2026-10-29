import { describe, expect, it } from "vitest";
import { fmtDateTime, fmtDay, relativeDays } from "@/lib/format";
import { all } from "@/server/db";
import { listUsers } from "@/server/repos/users";
import { loadContextBatch, loadEmployeeContext } from "@/server/services/context";
import { submitPlan, savePlanDraft } from "@/server/services/planService";
import { submitRequest } from "@/server/services/requestService";
import { anonymisedAllocations } from "@/server/services/queries";
import { seededDb, user } from "./helpers";

describe("batched employee contexts", () => {
  it("match single-employee contexts exactly for every employee and year", () => {
    const db = seededDb();
    for (const year of [2026, 2027]) {
      const batch = loadContextBatch(db, year);
      for (const u of listUsers(db)) {
        const single = loadEmployeeContext(db, u.id, year);
        const b = batch.get(u.id)!;
        expect(b.balance).toEqual(single.balance);
        expect(b.entitlement).toBe(single.entitlement);
        expect(b.approvedPlan?.id).toBe(single.approvedPlan?.id);
        expect(b.workingPlan?.id).toBe(single.workingPlan?.id);
        expect(b.activeRequests).toEqual(single.activeRequests);
      }
    }
  });
});

describe("notification deep links", () => {
  it("point approvers and employees at the exact plan or request", () => {
    const db = seededDb();
    const ama = user(db, "GRA-1007");
    const plan = savePlanDraft(db, ama, 2027, [{ start: "2027-03-01", end: "2027-03-05" }]);
    submitPlan(db, ama, plan.id);
    const kofi = user(db, "GRA-1001");
    const req = submitRequest(db, kofi, { leaveType: "Annual Leave", start: "2027-03-01", end: "2027-03-05" });
    const links = all<{ link: string }>(db, "SELECT link FROM notifications ORDER BY id DESC LIMIT 10").map((r) => r.link);
    expect(links).toContain(`/approvals?item=plan-${plan.id}`);
    expect(links).toContain(`/approvals?item=request-${req.id}`);
    expect(links).toContain(`/requests?open=${req.id}`);
  });
});

describe("client-safe data", () => {
  it("anonymises other employees while keeping counts and the viewer's own sources", () => {
    const db = seededDb();
    const kofi = user(db, "GRA-1001");
    const raw = loadEmployeeContext(db, kofi.id, 2027).allocations;
    const anon = anonymisedAllocations(raw, kofi.id);
    expect(anon.filter((a) => a.employeeId > 0).every((a) => a.employeeId === kofi.id)).toBe(true);
    const distinct = (list: typeof raw, m: string) => new Set(list.filter((a) => a.month === m).map((a) => a.employeeId)).size;
    for (const m of ["2027-03", "2027-04", "2027-09"]) expect(distinct(anon, m)).toBe(distinct(raw, m));
  });
});

describe("deterministic formatting", () => {
  it("formats in Africa/Accra time regardless of the host timezone", () => {
    expect(fmtDateTime("2026-10-29T23:30:00.000Z")).toBe("29 Oct 2026, 23:30");
    expect(fmtDay("2027-03-08")).toBe("8 Mar 2027");
  });
  it("describes relative days from a fixed reference date", () => {
    expect(relativeDays("2026-10-29", "2026-10-29")).toBe("today");
    expect(relativeDays("2026-10-30", "2026-10-29")).toBe("tomorrow");
    expect(relativeDays("2026-10-19", "2026-10-29")).toBe("10 days ago");
    expect(relativeDays("2027-03-01", "2026-10-29")).toBe("in 4 months");
  });
});
