import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { login } from "@/server/auth";
import { openDb, run, type DB } from "@/server/db";
import { verifyAuditChain } from "@/server/repos/audit";
import { getApprovedPlan, getPlan, listPlans } from "@/server/repos/leave";
import { setSetting } from "@/server/repos/settings";
import { loadEmployeeContext } from "@/server/services/context";
import { decidePlan, savePlanDraft, startAmendment, submitPlan } from "@/server/services/planService";
import { cancelRequest, decideRequest, submitRequest } from "@/server/services/requestService";
import { codes, occupancy, seededDb, user } from "./helpers";

let db: DB;
beforeEach(() => {
  db = seededDb();
});

const AL = "Annual Leave";

describe("seeded scenarios", () => {
  it("derives entitlement from staff category", () => {
    expect(loadEmployeeContext(db, user(db, "GRA-1001").id, 2027).entitlement).toBe(35);
    expect(loadEmployeeContext(db, user(db, "GRA-1002").id, 2027).entitlement).toBe(28);
  });
  it("has an available month, a 4-employee month and full months, never over capacity", () => {
    const occ = occupancy(db);
    expect(occ["2027-02"].count).toBe(2);
    expect(occ["2027-03"].count).toBe(4);
    expect(occ["2027-04"].count).toBe(5);
    expect(occ["2027-04"].status).toBe("full");
    expect(occ["2027-01"].status).toBe("restricted");
    expect(Object.values(occ).every((m) => m.count <= 5)).toBe(true);
  });
  it("keeps the superseded amendment history", () => {
    const plans = listPlans(db, { employeeId: user(db, "GRA-1005").id, year: 2027 });
    expect(plans.map((p) => [p.version, p.status])).toEqual([[2, "approved"], [1, "superseded"]]);
    expect(plans[0].amendsPlanId).toBe(plans[1].id);
  });
});

describe("leave requests", () => {
  it("accepts a 10-working-day March request supported by the approved plan", () => {
    const kofi = user(db, "GRA-1001");
    const r = submitRequest(db, kofi, { leaveType: AL, start: "2027-03-01", end: "2027-03-16" });
    expect(r.days).toBe(10);
    expect(r.status).toBe("pending");
  });
  it("rejects requests outside the approved master plan", () => {
    expect(codes(() => submitRequest(db, user(db, "GRA-1001"), { leaveType: AL, start: "2027-05-03", end: "2027-05-07" }))).toContain("PLAN_MISMATCH");
  });
  it("counts several requests from one employee as one employee in the month", () => {
    const kofi = user(db, "GRA-1001");
    submitRequest(db, kofi, { leaveType: AL, start: "2027-03-01", end: "2027-03-05" });
    submitRequest(db, kofi, { leaveType: AL, start: "2027-03-15", end: "2027-03-19" });
    expect(occupancy(db)["2027-03"].count).toBe(4);
  });
  it("rejects duplicate and overlapping requests", () => {
    const kofi = user(db, "GRA-1001");
    submitRequest(db, kofi, { leaveType: AL, start: "2027-03-01", end: "2027-03-05" });
    expect(codes(() => submitRequest(db, kofi, { leaveType: AL, start: "2027-03-01", end: "2027-03-05" }))).toContain("DUPLICATE");
    expect(codes(() => submitRequest(db, kofi, { leaveType: AL, start: "2027-03-04", end: "2027-03-11" }))).toContain("OVERLAP");
  });
  it("enforces annual balance when the entitlement no longer covers the plan", () => {
    const kofi = user(db, "GRA-1001");
    run(db, "UPDATE users SET category_code = 'JUNIOR' WHERE id = ?", kofi.id); // 28 days now
    submitRequest(db, kofi, { leaveType: AL, start: "2027-03-01", end: "2027-03-19" }); // 13 days
    submitRequest(db, kofi, { leaveType: AL, start: "2027-08-09", end: "2027-08-20" }); // 10 days
    expect(codes(() => submitRequest(db, kofi, { leaveType: AL, start: "2027-10-11", end: "2027-10-22" }))).toContain("BALANCE_EXCEEDED");
  });
  it("updates dashboard balances through pending and approval", () => {
    const kofi = user(db, "GRA-1001");
    const mgr = user(db, "GRA-7001");
    const before = loadEmployeeContext(db, kofi.id, 2027).balance;
    const r = submitRequest(db, kofi, { leaveType: AL, start: "2027-03-01", end: "2027-03-16" });
    const pending = loadEmployeeContext(db, kofi.id, 2027).balance;
    expect(pending.pendingDays).toBe(before.pendingDays + 10);
    expect(pending.approvedDays).toBe(before.approvedDays);
    expect(pending.projectedDays).toBe(before.projectedDays - 10);
    decideRequest(db, mgr, r.id, "approve", "");
    const after = loadEmployeeContext(db, kofi.id, 2027).balance;
    expect(after.pendingDays).toBe(before.pendingDays);
    expect(after.approvedDays).toBe(before.approvedDays + 10);
    expect(after.remainingDays).toBe(35 - 10);
    expect(after.plannedDays).toBe(33);
  });
});

describe("master plans and capacity", () => {
  it("blocks restricted months and full months, then admits the fifth employee", () => {
    const ama = user(db, "GRA-1007");
    const jan = savePlanDraft(db, ama, 2027, [{ start: "2027-01-11", end: "2027-01-15" }]);
    expect(codes(() => submitPlan(db, ama, jan.id))).toContain("RESTRICTED");
    savePlanDraft(db, ama, 2027, [{ start: "2027-04-05", end: "2027-04-09" }]);
    expect(codes(() => submitPlan(db, ama, jan.id))).toEqual(["CAPACITY_FULL"]);
    savePlanDraft(db, ama, 2027, [{ start: "2027-03-01", end: "2027-03-12" }, { start: "2027-05-03", end: "2027-05-14" }]);
    expect(submitPlan(db, ama, jan.id).status).toBe("submitted");
    expect(occupancy(db)["2027-03"].count).toBe(5);
    const yaa = user(db, "GRA-2006");
    const draft = savePlanDraft(db, yaa, 2027, [{ start: "2027-03-15", end: "2027-03-19" }]);
    expect(codes(() => submitPlan(db, yaa, draft.id))).toEqual(["CAPACITY_FULL"]);
  });
  it("releases a reservation when a pending plan is rejected", () => {
    expect(occupancy(db)["2027-09"].count).toBe(5);
    const fiifiPlan = listPlans(db, { employeeId: user(db, "GRA-2007").id, year: 2027 })[0];
    decidePlan(db, user(db, "GRA-7002"), fiifiPlan.id, "reject", "Peak season");
    expect(occupancy(db)["2027-09"].count).toBe(4);
    const yaa = user(db, "GRA-2006");
    const draft = savePlanDraft(db, yaa, 2027, [{ start: "2027-09-06", end: "2027-09-10" }]);
    expect(submitPlan(db, yaa, draft.id).status).toBe("submitted");
  });
  it("releases reservations when a pending plan is returned for revision", () => {
    const fiifiPlan = listPlans(db, { employeeId: user(db, "GRA-2007").id, year: 2027 })[0];
    expect(occupancy(db)["2027-05"].count).toBe(2);
    decidePlan(db, user(db, "GRA-7002"), fiifiPlan.id, "return", "Please revise");
    expect(occupancy(db)["2027-05"].count).toBe(1);
  });
  it("keeps an employee's slot while any other active source remains", () => {
    const kofi = user(db, "GRA-1001");
    const r = submitRequest(db, kofi, { leaveType: AL, start: "2027-03-01", end: "2027-03-05" });
    cancelRequest(db, kofi, r.id, "Changed my mind");
    expect(occupancy(db)["2027-03"].employeeIds).toContain(kofi.id); // still held by the approved plan
  });
  it("versions approved plans through the amendment workflow", () => {
    const kofi = user(db, "GRA-1001");
    const mgr = user(db, "GRA-7001");
    const v1 = getApprovedPlan(db, kofi.id, 2027)!;
    const draft = startAmendment(db, kofi, 2027);
    expect(draft.amendsPlanId).toBe(v1.id);
    savePlanDraft(db, kofi, 2027, [{ start: "2027-03-01", end: "2027-03-19" }, { start: "2027-08-09", end: "2027-08-20" }, { start: "2027-11-08", end: "2027-11-19" }]);
    submitPlan(db, kofi, draft.id);
    expect(getApprovedPlan(db, kofi.id, 2027)!.id).toBe(v1.id); // old plan stays in force until approval
    decidePlan(db, mgr, draft.id, "approve", "");
    expect(getPlan(db, v1.id)!.status).toBe("superseded");
    expect(getApprovedPlan(db, kofi.id, 2027)!.id).toBe(draft.id);
  });
  it("blocks amendments that drop dates of approved leave", () => {
    const akosua = user(db, "GRA-1002");
    const draft = startAmendment(db, akosua, 2027);
    savePlanDraft(db, akosua, 2027, [{ start: "2027-09-06", end: "2027-09-24" }]);
    expect(codes(() => submitPlan(db, akosua, draft.id))).toContain("AMENDMENT_CONFLICT");
  });
  it("revalidates capacity immediately before approval", () => {
    setSetting(db, "monthlyCapacity", 3, "proposed", null);
    const fiifiPlan = listPlans(db, { employeeId: user(db, "GRA-2007").id, year: 2027 })[0];
    expect(codes(() => decidePlan(db, user(db, "GRA-7002"), fiifiPlan.id, "approve", ""))).toContain("CAPACITY_FULL");
    expect(getPlan(db, fiifiPlan.id)!.status).toBe("submitted");
  });
});

describe("approval workflow and access control", () => {
  const adwoaRequest = (d: DB) => loadEmployeeContext(d, user(d, "GRA-1006").id, 2027).requests.find((r) => r.status === "pending")!;

  it("lets the assigned manager approve and records the decision", () => {
    const r = decideRequest(db, user(db, "GRA-7001"), adwoaRequest(db).id, "approve", "");
    expect(r.status).toBe("approved");
    expect(r.decidedByName).toBe("Kwame Mensah");
    expect(r.decidedAt).toBeTruthy();
  });
  it("requires a reason to reject or return", () => {
    expect(codes(() => decideRequest(db, user(db, "GRA-7001"), adwoaRequest(db).id, "reject", " "))).toEqual(["HTTP_400"]);
    expect(decideRequest(db, user(db, "GRA-7001"), adwoaRequest(db).id, "reject", "Audit week").status).toBe("rejected");
  });
  it("lets HR decide any item", () => {
    expect(decideRequest(db, user(db, "GRA-8001"), adwoaRequest(db).id, "return", "Attach note").status).toBe("returned");
  });
  it("forbids employees, unassigned managers and self-approval", () => {
    const id = adwoaRequest(db).id;
    expect(codes(() => decideRequest(db, user(db, "GRA-1001"), id, "approve", ""))).toEqual(["HTTP_403"]);
    expect(codes(() => decideRequest(db, user(db, "GRA-7002"), id, "approve", ""))).toEqual(["HTTP_403"]);
    const abenaPlan = listPlans(db, { employeeId: user(db, "GRA-7002").id, year: 2027 })[0];
    expect(codes(() => decidePlan(db, user(db, "GRA-7002"), abenaPlan.id, "approve", ""))).toEqual(["HTTP_403"]);
  });
});

describe("authentication and audit", () => {
  it("signs in with employee ID or email and rejects bad passwords", () => {
    expect(login(db, "GRA-1001", "Demo@2026").user.fullName).toBe("Kofi Adjei");
    expect(login(db, "kofi.adjei@demo-gra.test", "Demo@2026").user.employeeId).toBe("GRA-1001");
    expect(codes(() => login(db, "GRA-1001", "wrong"))).toEqual(["HTTP_401"]);
  });
  it("locks an account after five failed attempts", () => {
    for (let i = 0; i < 5; i++) codes(() => login(db, "GRA-1002", "wrong"));
    expect(codes(() => login(db, "GRA-1002", "Demo@2026"))).toEqual(["HTTP_423"]);
  });
  it("keeps the audit log append-only and hash-chained", () => {
    expect(verifyAuditChain(db).ok).toBe(true);
    expect(() => run(db, "UPDATE audit_log SET summary = 'x' WHERE id = 1")).toThrow(/append-only/);
    expect(() => run(db, "DELETE FROM audit_log")).toThrow(/append-only/);
  });
});

describe("concurrent attempts on the final slot", () => {
  it("serialises writers so only one employee gets the last March slot", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gra-leave-")), "race.db");
    const a = seededDb(file);
    const b = openDb(file);
    b.exec("PRAGMA busy_timeout = 0");

    const ama = (d: DB) => user(d, "GRA-1007");
    const yaa = (d: DB) => user(d, "GRA-2006");
    const pA = savePlanDraft(a, ama(a), 2027, [{ start: "2027-03-01", end: "2027-03-05" }]);
    const pB = savePlanDraft(b, yaa(b), 2027, [{ start: "2027-03-08", end: "2027-03-12" }]);

    // Connection A holds the write lock (as it would mid-submission); B cannot read-then-write in between.
    a.exec("BEGIN IMMEDIATE");
    expect(() => submitPlan(b, yaa(b), pB.id)).toThrow(/locked|busy/i);
    submitPlan(a, ama(a), pA.id); // joins A's open transaction
    a.exec("COMMIT");

    // B retries after A commits and now sees the month as full.
    expect(codes(() => submitPlan(b, yaa(b), pB.id))).toEqual(["CAPACITY_FULL"]);
    expect(occupancy(a)["2027-03"].count).toBe(5);
    a.close();
    b.close();
  });
});
