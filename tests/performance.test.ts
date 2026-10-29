import { describe, expect, it } from "vitest";
import { login, userForToken } from "@/server/auth";
import { get, lockKeys, run, type DB } from "@/server/db";
import { verifyAuditChain } from "@/server/repos/audit";
import { listPlans, listRequests } from "@/server/repos/leave";
import { approvalQueue, approvalScope, pendingApprovalCount } from "@/server/services/queries";
import { savePlanDraft, submitPlan } from "@/server/services/planService";
import { submitRequest } from "@/server/services/requestService";
import { occupancy, seededDb, user } from "./helpers";

/** Wraps a DB handle and counts the statements sent through it (transactions are counted inside too). */
function counting(db: DB): DB & { count: number } {
  const wrap = (inner: DB, counter: { count: number }): DB & { count: number } => ({
    get inTx() { return inner.inTx; },
    get count() { return counter.count; },
    set count(v: number) { counter.count = v; },
    query(sql, params) { counter.count++; return inner.query(sql, params); },
    exec(sql) { counter.count++; return inner.exec(sql); },
    transaction(fn) { return inner.transaction((t) => fn(wrap(t, counter))); },
    beforeCommit(hook) { inner.beforeCommit((t) => hook(wrap(t, counter))); },
    close() { return inner.close(); },
  });
  return wrap(db, { count: 0 });
}

describe("per-request query budget", () => {
  it("resolves the signed-in user with a single query", async () => {
    const db = await seededDb();
    const { token } = await login(db, "GRA-1001", "Demo@2026");
    const c = counting(db);
    expect((await userForToken(c, token))?.employeeId).toBe("GRA-1001");
    expect(c.count).toBe(1);
  });

  it("counts pending approvals with one COUNT query and matches the full listing", async () => {
    const db = await seededDb();
    for (const id of ["GRA-7001", "GRA-7002", "GRA-8001", "GRA-1001"]) {
      const u = await user(db, id);
      const scope = approvalScope(u);
      const expected = u.role === "manager" || u.role === "hr"
        ? [...await listPlans(db, { ...scope, status: ["submitted"] }), ...await listRequests(db, { ...scope, status: ["pending"] })]
          .filter((i) => i.employeeId !== u.id).length
        : 0;
      const c = counting(db);
      expect(await pendingApprovalCount(c, u)).toBe(expected);
      expect(c.count).toBeLessThanOrEqual(1);
    }
  });
});

describe("audit chain under concurrency", () => {
  it("stays valid when many audited writes run at once", async () => {
    const db = await seededDb();
    const [kofi, akosua, yaw] = await Promise.all(["GRA-1001", "GRA-1002", "GRA-1003"].map((id) => user(db, id)));
    const results = await Promise.allSettled([
      submitRequest(db, kofi, { leaveType: "Annual Leave", start: "2027-03-01", end: "2027-03-05" }),
      submitRequest(db, kofi, { leaveType: "Annual Leave", start: "2027-08-09", end: "2027-08-13" }),
      submitRequest(db, yaw, { leaveType: "Annual Leave", start: "2027-07-05", end: "2027-07-09" }),
      submitRequest(db, akosua, { leaveType: "Annual Leave", start: "2027-09-06", end: "2027-09-10" }),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const check = await verifyAuditChain(db, { full: true });
    expect(check.ok).toBe(true);
  });

  it("keeps routine sign-ins out of the hash chain (they go to auth_events)", async () => {
    const db = await seededDb();
    const before = (await get<{ c: number }>(db, "SELECT COUNT(*)::int AS c FROM audit_log"))!.c;
    await Promise.all([login(db, "GRA-1001", "Demo@2026"), login(db, "GRA-1002", "Demo@2026"), login(db, "GRA-7001", "Demo@2026")]);
    expect((await get<{ c: number }>(db, "SELECT COUNT(*)::int AS c FROM audit_log"))!.c).toBe(before);
    expect((await get<{ c: number }>(db, "SELECT COUNT(*)::int AS c FROM auth_events WHERE kind = 'login'"))!.c).toBe(3);
  });

  it("verifies incrementally from a checkpoint and still detects tampering", async () => {
    const db = await seededDb();
    const first = await verifyAuditChain(db);
    expect(first.ok).toBe(true);
    const kofi = await user(db, "GRA-1001");
    await submitRequest(db, kofi, { leaveType: "Annual Leave", start: "2027-03-01", end: "2027-03-05" });
    const second = await verifyAuditChain(db);
    expect(second).toMatchObject({ ok: true, incremental: true });
    expect(second.verifiedNow).toBeLessThanOrEqual(3); // only the new record(s), not the whole log

    // Simulate tampering outside the app (bypassing the append-only trigger).
    await db.exec("ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change");
    await run(db, "UPDATE audit_log SET summary = 'tampered' WHERE id = 3");
    const cp = JSON.parse((await get<{ value: string }>(db, "SELECT value FROM meta WHERE key = 'audit_checkpoint'"))!.value) as { id: number };
    await run(db, "UPDATE audit_log SET summary = 'tampered' WHERE id = ?", cp.id);
    await db.exec("ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_change");

    expect((await verifyAuditChain(db)).ok).toBe(false); // checkpoint record is re-checked
    const full = await verifyAuditChain(db, { full: true });
    expect(full).toMatchObject({ ok: false, brokenAt: 3 });
  });
});

describe("fine-grained locking", () => {
  it("lets submissions for different months both succeed when started together", async () => {
    const db = await seededDb();
    const ama = await user(db, "GRA-1007");
    const yaa = await user(db, "GRA-2006");
    const pA = await savePlanDraft(db, ama, 2027, [{ start: "2027-02-01", end: "2027-02-05" }]);
    const pB = await savePlanDraft(db, yaa, 2027, [{ start: "2027-05-03", end: "2027-05-07" }]);
    const results = await Promise.allSettled([submitPlan(db, ama, pA.id), submitPlan(db, yaa, pB.id)]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    const occ = await occupancy(db);
    expect(occ["2027-02"].count).toBe(3);
    expect(occ["2027-05"].count).toBe(3);
  });

  it("refuses to take locks outside a transaction", async () => {
    const db = await seededDb();
    await expect(lockKeys(db, ["cap:2027-03"])).rejects.toThrow(/inside a transaction/);
  });
});

describe("approvals history is limited in SQL", () => {
  it("returns at most 50 recent decisions, newest first, never the viewer's own", async () => {
    const db = await seededDb();
    const hr = await user(db, "GRA-8001");
    const decided = await approvalQueue(db, hr, "decided");
    expect(decided.length).toBeGreaterThan(0);
    expect(decided.length).toBeLessThanOrEqual(50);
    const times = decided.map((i) => (i.plan?.decidedAt ?? i.request?.decidedAt)!);
    expect([...times].sort().reverse()).toEqual(times);
    expect(decided.every((i) => i.employee.id !== hr.id)).toBe(true);
  });
});

describe("password hashing", () => {
  it("is asynchronous (never blocks the event loop)", async () => {
    const { hashPassword, verifyPassword } = await import("@/server/auth");
    const hashing = hashPassword("Secret123");
    expect(hashing).toBeInstanceOf(Promise);
    const h = await hashing;
    expect(await verifyPassword("Secret123", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});
