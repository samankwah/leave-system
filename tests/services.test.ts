import { beforeEach, describe, expect, it } from "vitest";
import { login } from "@/server/auth";
import { run, type DB } from "@/server/db";
import { verifyAuditChain } from "@/server/repos/audit";
import { getApprovedPlan, getPlan, listPlans } from "@/server/repos/leave";
import { setSetting } from "@/server/repos/settings";
import { loadEmployeeContext } from "@/server/services/context";
import { decidePlan, savePlanDraft, startAmendment, submitPlan } from "@/server/services/planService";
import { cancelRequest, decideRequest, submitRequest } from "@/server/services/requestService";
import { codes, occupancy, seededDb, user } from "./helpers";

let db: DB;
beforeEach(async () => {
  db = await seededDb();
});

const AL = "Annual Leave";

describe("seeded scenarios", () => {
  it("derives entitlement from staff category", async () => {
    expect((await loadEmployeeContext(db, (await user(db, "GRA-1001")).id, 2027)).entitlement).toBe(35);
    expect((await loadEmployeeContext(db, (await user(db, "GRA-1002")).id, 2027)).entitlement).toBe(28);
  });
  it("has an available month, a 4-employee month and full months, never over capacity", async () => {
    const occ = await occupancy(db);
    expect(occ["2027-02"].count).toBe(2);
    expect(occ["2027-03"].count).toBe(4);
    expect(occ["2027-04"].count).toBe(5);
    expect(occ["2027-04"].status).toBe("full");
    expect(occ["2027-01"].status).toBe("restricted");
    expect(Object.values(occ).every((m) => m.count <= 5)).toBe(true);
  });
  it("keeps the superseded amendment history", async () => {
    const plans = await listPlans(db, { employeeId: (await user(db, "GRA-1005")).id, year: 2027 });
    expect(plans.map((p) => [p.version, p.status])).toEqual([[2, "approved"], [1, "superseded"]]);
    expect(plans[0].amendsPlanId).toBe(plans[1].id);
  });
});

describe("leave requests", () => {
  it("accepts a 10-working-day March request supported by the approved plan", async () => {
    const kofi = await user(db, "GRA-1001");
    const r = await submitRequest(db, kofi, { leaveType: AL, start: "2027-03-01", end: "2027-03-16" });
    expect(r.days).toBe(10);
    expect(r.status).toBe("pending");
  });
  it("rejects requests outside the approved master plan", async () => {
    const kofi = await user(db, "GRA-1001");
    expect(await codes(() => submitRequest(db, kofi, { leaveType: AL, start: "2027-05-03", end: "2027-05-07" }))).toContain("PLAN_MISMATCH");
  });
  it("counts several requests from one employee as one employee in the month", async () => {
    const kofi = await user(db, "GRA-1001");
    await submitRequest(db, kofi, { leaveType: AL, start: "2027-03-01", end: "2027-03-05" });
    await submitRequest(db, kofi, { leaveType: AL, start: "2027-03-15", end: "2027-03-19" });
    expect((await occupancy(db))["2027-03"].count).toBe(4);
  });
  it("rejects duplicate and overlapping requests", async () => {
    const kofi = await user(db, "GRA-1001");
    await submitRequest(db, kofi, { leaveType: AL, start: "2027-03-01", end: "2027-03-05" });
    expect(await codes(() => submitRequest(db, kofi, { leaveType: AL, start: "2027-03-01", end: "2027-03-05" }))).toContain("DUPLICATE");
    expect(await codes(() => submitRequest(db, kofi, { leaveType: AL, start: "2027-03-04", end: "2027-03-11" }))).toContain("OVERLAP");
  });
  it("enforces annual balance when the entitlement no longer covers the plan", async () => {
    const kofi = await user(db, "GRA-1001");
    await run(db, "UPDATE users SET category_code = 'JUNIOR' WHERE id = ?", kofi.id); // 28 days now
    await submitRequest(db, kofi, { leaveType: AL, start: "2027-03-01", end: "2027-03-19" }); // 13 days
    await submitRequest(db, kofi, { leaveType: AL, start: "2027-08-09", end: "2027-08-20" }); // 10 days
    expect(await codes(() => submitRequest(db, kofi, { leaveType: AL, start: "2027-10-11", end: "2027-10-22" }))).toContain("BALANCE_EXCEEDED");
  });
  it("updates dashboard balances through pending and approval", async () => {
    const kofi = await user(db, "GRA-1001");
    const mgr = await user(db, "GRA-7001");
    const before = (await loadEmployeeContext(db, kofi.id, 2027)).balance;
    const r = await submitRequest(db, kofi, { leaveType: AL, start: "2027-03-01", end: "2027-03-16" });
    const pending = (await loadEmployeeContext(db, kofi.id, 2027)).balance;
    expect(pending.pendingDays).toBe(before.pendingDays + 10);
    expect(pending.approvedDays).toBe(before.approvedDays);
    expect(pending.projectedDays).toBe(before.projectedDays - 10);
    await decideRequest(db, mgr, r.id, "approve", "");
    const after = (await loadEmployeeContext(db, kofi.id, 2027)).balance;
    expect(after.pendingDays).toBe(before.pendingDays);
    expect(after.approvedDays).toBe(before.approvedDays + 10);
    expect(after.remainingDays).toBe(35 - 10);
    expect(after.plannedDays).toBe(33);
  });
  it("stores supporting documents in the database and rejects mismatched content", async () => {
    const kofi = await user(db, "GRA-1001");
    const pdf = Buffer.from("%PDF-1.4\n%test\n");
    const r = await submitRequest(db, kofi, { leaveType: AL, start: "2027-03-01", end: "2027-03-05" }, { name: "note.pdf", type: "application/pdf", data: pdf });
    expect(r.attachmentName).toBe("note.pdf");
    expect(await codes(() => submitRequest(db, kofi, { leaveType: AL, start: "2027-03-08", end: "2027-03-12" },
      { name: "fake.pdf", type: "application/pdf", data: Buffer.from("not a pdf") }))).toEqual(["HTTP_400"]);
  });
});

describe("master plans and capacity", () => {
  it("blocks restricted months and full months, then admits the fifth employee", async () => {
    const ama = await user(db, "GRA-1007");
    const jan = await savePlanDraft(db, ama, 2027, [{ start: "2027-01-11", end: "2027-01-15" }]);
    expect(await codes(() => submitPlan(db, ama, jan.id))).toContain("RESTRICTED");
    await savePlanDraft(db, ama, 2027, [{ start: "2027-04-05", end: "2027-04-09" }]);
    expect(await codes(() => submitPlan(db, ama, jan.id))).toEqual(["CAPACITY_FULL"]);
    await savePlanDraft(db, ama, 2027, [{ start: "2027-03-01", end: "2027-03-12" }, { start: "2027-05-03", end: "2027-05-14" }]);
    expect((await submitPlan(db, ama, jan.id)).status).toBe("submitted");
    expect((await occupancy(db))["2027-03"].count).toBe(5);
    const yaa = await user(db, "GRA-2006");
    const draft = await savePlanDraft(db, yaa, 2027, [{ start: "2027-03-15", end: "2027-03-19" }]);
    expect(await codes(() => submitPlan(db, yaa, draft.id))).toEqual(["CAPACITY_FULL"]);
  });
  it("releases a reservation when a pending plan is rejected", async () => {
    expect((await occupancy(db))["2027-09"].count).toBe(5);
    const fiifiPlan = (await listPlans(db, { employeeId: (await user(db, "GRA-2007")).id, year: 2027 }))[0];
    await decidePlan(db, await user(db, "GRA-7002"), fiifiPlan.id, "reject", "Peak season");
    expect((await occupancy(db))["2027-09"].count).toBe(4);
    const yaa = await user(db, "GRA-2006");
    const draft = await savePlanDraft(db, yaa, 2027, [{ start: "2027-09-06", end: "2027-09-10" }]);
    expect((await submitPlan(db, yaa, draft.id)).status).toBe("submitted");
  });
  it("releases reservations when a pending plan is returned for revision", async () => {
    const fiifiPlan = (await listPlans(db, { employeeId: (await user(db, "GRA-2007")).id, year: 2027 }))[0];
    expect((await occupancy(db))["2027-05"].count).toBe(2);
    await decidePlan(db, await user(db, "GRA-7002"), fiifiPlan.id, "return", "Please revise");
    expect((await occupancy(db))["2027-05"].count).toBe(1);
  });
  it("keeps an employee's slot while any other active source remains", async () => {
    const kofi = await user(db, "GRA-1001");
    const r = await submitRequest(db, kofi, { leaveType: AL, start: "2027-03-01", end: "2027-03-05" });
    await cancelRequest(db, kofi, r.id, "Changed my mind");
    expect((await occupancy(db))["2027-03"].employeeIds).toContain(kofi.id); // still held by the approved plan
  });
  it("versions approved plans through the amendment workflow", async () => {
    const kofi = await user(db, "GRA-1001");
    const mgr = await user(db, "GRA-7001");
    const v1 = (await getApprovedPlan(db, kofi.id, 2027))!;
    const draft = await startAmendment(db, kofi, 2027);
    expect(draft.amendsPlanId).toBe(v1.id);
    await savePlanDraft(db, kofi, 2027, [{ start: "2027-03-01", end: "2027-03-19" }, { start: "2027-08-09", end: "2027-08-20" }, { start: "2027-11-08", end: "2027-11-19" }]);
    await submitPlan(db, kofi, draft.id);
    expect((await getApprovedPlan(db, kofi.id, 2027))!.id).toBe(v1.id); // old plan stays in force until approval
    await decidePlan(db, mgr, draft.id, "approve", "");
    expect((await getPlan(db, v1.id))!.status).toBe("superseded");
    expect((await getApprovedPlan(db, kofi.id, 2027))!.id).toBe(draft.id);
  });
  it("blocks amendments that drop dates of approved leave", async () => {
    const akosua = await user(db, "GRA-1002");
    const draft = await startAmendment(db, akosua, 2027);
    await savePlanDraft(db, akosua, 2027, [{ start: "2027-09-06", end: "2027-09-24" }]);
    expect(await codes(() => submitPlan(db, akosua, draft.id))).toContain("AMENDMENT_CONFLICT");
  });
  it("revalidates capacity immediately before approval", async () => {
    await setSetting(db, "monthlyCapacity", 3, "proposed", null);
    const fiifiPlan = (await listPlans(db, { employeeId: (await user(db, "GRA-2007")).id, year: 2027 }))[0];
    const abena = await user(db, "GRA-7002");
    expect(await codes(() => decidePlan(db, abena, fiifiPlan.id, "approve", ""))).toContain("CAPACITY_FULL");
    expect((await getPlan(db, fiifiPlan.id))!.status).toBe("submitted");
  });
  it("rolls back every write when a rule fails mid-transaction", async () => {
    const ama = await user(db, "GRA-1007");
    const draft = await savePlanDraft(db, ama, 2027, [{ start: "2027-04-05", end: "2027-04-09" }]);
    const auditBefore = (await verifyAuditChain(db)).checked;
    expect(await codes(() => submitPlan(db, ama, draft.id))).toEqual(["CAPACITY_FULL"]);
    expect((await getPlan(db, draft.id))!.status).toBe("draft");
    expect((await verifyAuditChain(db)).checked).toBe(auditBefore);
  });
});

describe("approval workflow and access control", () => {
  const adwoaRequest = async (d: DB) =>
    (await loadEmployeeContext(d, (await user(d, "GRA-1006")).id, 2027)).requests.find((r) => r.status === "pending")!;

  it("lets the assigned manager approve and records the decision", async () => {
    const r = await decideRequest(db, await user(db, "GRA-7001"), (await adwoaRequest(db)).id, "approve", "");
    expect(r.status).toBe("approved");
    expect(r.decidedByName).toBe("Kwame Mensah");
    expect(r.decidedAt).toBeTruthy();
  });
  it("requires a reason to reject or return", async () => {
    const kwame = await user(db, "GRA-7001");
    const id = (await adwoaRequest(db)).id;
    expect(await codes(() => decideRequest(db, kwame, id, "reject", " "))).toEqual(["HTTP_400"]);
    expect((await decideRequest(db, kwame, id, "reject", "Audit week")).status).toBe("rejected");
  });
  it("lets HR decide any item", async () => {
    expect((await decideRequest(db, await user(db, "GRA-8001"), (await adwoaRequest(db)).id, "return", "Attach note")).status).toBe("returned");
  });
  it("forbids employees, unassigned managers and self-approval", async () => {
    const id = (await adwoaRequest(db)).id;
    const kofi = await user(db, "GRA-1001");
    const abena = await user(db, "GRA-7002");
    expect(await codes(() => decideRequest(db, kofi, id, "approve", ""))).toEqual(["HTTP_403"]);
    expect(await codes(() => decideRequest(db, abena, id, "approve", ""))).toEqual(["HTTP_403"]);
    const abenaPlan = (await listPlans(db, { employeeId: abena.id, year: 2027 }))[0];
    expect(await codes(() => decidePlan(db, abena, abenaPlan.id, "approve", ""))).toEqual(["HTTP_403"]);
  });
});

describe("authentication and audit", () => {
  it("signs in with employee ID or email (case-insensitive) and rejects bad passwords", async () => {
    expect((await login(db, "GRA-1001", "Demo@2026")).user.fullName).toBe("Kofi Adjei");
    expect((await login(db, "Kofi.Adjei@demo-gra.test", "Demo@2026")).user.employeeId).toBe("GRA-1001");
    expect(await codes(() => login(db, "GRA-1001", "wrong"))).toEqual(["HTTP_401"]);
  });
  it("locks an account after five failed attempts", async () => {
    for (let i = 0; i < 5; i++) await codes(() => login(db, "GRA-1002", "wrong"));
    expect(await codes(() => login(db, "GRA-1002", "Demo@2026"))).toEqual(["HTTP_423"]);
  });
  it("keeps the audit log append-only and hash-chained", async () => {
    expect((await verifyAuditChain(db)).ok).toBe(true);
    await expect(run(db, "UPDATE audit_log SET summary = 'x' WHERE id = 1")).rejects.toThrow(/append-only/);
    await expect(run(db, "DELETE FROM audit_log")).rejects.toThrow(/append-only/);
  });
});

describe("concurrent attempts on the final slot", () => {
  it("serialises writers so only one employee gets the last March slot", async () => {
    const ama = await user(db, "GRA-1007");
    const yaa = await user(db, "GRA-2006");
    const pA = await savePlanDraft(db, ama, 2027, [{ start: "2027-03-01", end: "2027-03-05" }]);
    const pB = await savePlanDraft(db, yaa, 2027, [{ start: "2027-03-08", end: "2027-03-12" }]);

    // Both submissions start at once; the write lock makes the capacity read-then-write atomic.
    const results = await Promise.allSettled([submitPlan(db, ama, pA.id), submitPlan(db, yaa, pB.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((failure.reason as { issues: { code: string }[] }).issues.map((i) => i.code)).toEqual(["CAPACITY_FULL"]);
    expect((await occupancy(db))["2027-03"].count).toBe(5);
    expect((await verifyAuditChain(db)).ok).toBe(true);
  });
});
