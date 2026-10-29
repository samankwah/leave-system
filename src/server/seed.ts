import { analysePlan } from "@/domain/planRules";
import { analyseRequest, hasErrors } from "@/domain/requestRules";
import type { Period, PolicySettings, Role, RuleStatus } from "@/domain/types";
import { formatRange } from "@/domain/workingDays";
import { hashPassword } from "./auth";
import { get, insert, run, tx, type DB } from "./db";
import { audit } from "./repos/audit";
import {
  getApprovedPlan, getPlan, insertPlan, insertRequest, listAllocations, listRequests, replacePlanPeriods, updatePlan,
  type PlanStatus, type RequestStatus,
} from "./repos/leave";
import { notify } from "./repos/notifications";
import { DEFAULT_POLICY, holidaySet, setSetting } from "./repos/settings";

export const DEMO_PASSWORD = "Demo@2026";

/** Synthetic Ghana public holidays. Moveable/observed dates are marked for HR verification. */
const HOLIDAYS: [string, string, string?][] = [
  ["2026-01-01", "New Year's Day"],
  ["2026-01-07", "Constitution Day"],
  ["2026-03-06", "Independence Day"],
  ["2026-03-20", "Eid al-Fitr", "Moveable – confirm official date"],
  ["2026-04-03", "Good Friday"],
  ["2026-04-06", "Easter Monday"],
  ["2026-05-01", "May Day"],
  ["2026-05-27", "Eid al-Adha", "Moveable – confirm official date"],
  ["2026-07-01", "Republic Day"],
  ["2026-08-04", "Founders' Day"],
  ["2026-09-21", "Kwame Nkrumah Memorial Day"],
  ["2026-12-04", "Farmers' Day"],
  ["2026-12-25", "Christmas Day"],
  ["2026-12-28", "Boxing Day (observed)", "Observed date – confirm"],
  ["2027-01-01", "New Year's Day"],
  ["2027-01-07", "Constitution Day"],
  ["2027-03-08", "Independence Day (observed)", "6 March falls on a Saturday – confirm observed date"],
  ["2027-03-10", "Eid al-Fitr", "Moveable – confirm official date"],
  ["2027-03-26", "Good Friday"],
  ["2027-03-29", "Easter Monday"],
  ["2027-05-03", "May Day (observed)", "1 May falls on a Saturday – confirm observed date"],
  ["2027-05-17", "Eid al-Adha", "Moveable – confirm official date"],
  ["2027-07-01", "Republic Day"],
  ["2027-08-04", "Founders' Day"],
  ["2027-09-21", "Kwame Nkrumah Memorial Day"],
  ["2027-12-03", "Farmers' Day"],
  ["2027-12-24", "Christmas Day (observed)", "Observed date – confirm"],
  ["2027-12-27", "Boxing Day (observed)", "Observed date – confirm"],
];

const POLICY_STATUS: Record<keyof PolicySettings, RuleStatus> = {
  activeYear: "confirmed",
  restrictedMonths: "proposed",
  monthlyCapacity: "proposed",
  carryoverEnabled: "assumption",
  carryoverMaxDays: "assumption",
  overdueApprovalDays: "assumption",
  leaveTypes: "assumption",
};

interface SeedUser {
  key: string; employeeId: string; name: string; dept: string; office: string; title: string;
  category: "SENIOR" | "JUNIOR"; role: Role; manager?: string;
}

const USERS: SeedUser[] = [
  { key: "sysadmin", employeeId: "GRA-9001", name: "Yaw Boateng", dept: "Information Technology", office: "Head Office – Accra", title: "Systems Administrator", category: "SENIOR", role: "sysadmin" },
  { key: "hr", employeeId: "GRA-8001", name: "Efua Asante", dept: "Human Resource Management", office: "Head Office – Accra", title: "HR Manager", category: "SENIOR", role: "hr" },
  { key: "mgrDt", employeeId: "GRA-7001", name: "Kwame Mensah", dept: "Domestic Tax Revenue Division", office: "Head Office – Accra", title: "Sector Commander", category: "SENIOR", role: "manager" },
  { key: "mgrCu", employeeId: "GRA-7002", name: "Abena Owusu", dept: "Customs Division", office: "Tema Collection Point", title: "Sector Commander", category: "SENIOR", role: "manager" },
  { key: "kofi", employeeId: "GRA-1001", name: "Kofi Adjei", dept: "Domestic Tax Revenue Division", office: "Head Office – Accra", title: "Principal Revenue Officer", category: "SENIOR", role: "employee", manager: "mgrDt" },
  { key: "akosua", employeeId: "GRA-1002", name: "Akosua Boakye", dept: "Domestic Tax Revenue Division", office: "Head Office – Accra", title: "Revenue Assistant", category: "JUNIOR", role: "employee", manager: "mgrDt" },
  { key: "yaw", employeeId: "GRA-1003", name: "Yaw Ofori", dept: "Domestic Tax Revenue Division", office: "Kumasi Regional Office", title: "Senior Revenue Officer", category: "SENIOR", role: "employee", manager: "mgrDt" },
  { key: "esi", employeeId: "GRA-1004", name: "Esi Quaye", dept: "Domestic Tax Revenue Division", office: "Kumasi Regional Office", title: "Revenue Assistant", category: "JUNIOR", role: "employee", manager: "mgrDt" },
  { key: "kwabena", employeeId: "GRA-1005", name: "Kwabena Owusu", dept: "Domestic Tax Revenue Division", office: "Head Office – Accra", title: "Tax Auditor", category: "SENIOR", role: "employee", manager: "mgrDt" },
  { key: "adwoa", employeeId: "GRA-1006", name: "Adwoa Sarpong", dept: "Domestic Tax Revenue Division", office: "Takoradi Office", title: "Data Entry Clerk", category: "JUNIOR", role: "employee", manager: "mgrDt" },
  { key: "ama", employeeId: "GRA-1007", name: "Ama Darko", dept: "Domestic Tax Revenue Division", office: "Head Office – Accra", title: "Revenue Assistant", category: "JUNIOR", role: "employee", manager: "mgrDt" },
  { key: "nana", employeeId: "GRA-2001", name: "Nana Agyeman", dept: "Customs Division", office: "Tema Collection Point", title: "Senior Customs Officer", category: "SENIOR", role: "employee", manager: "mgrCu" },
  { key: "afia", employeeId: "GRA-2002", name: "Afia Mensah", dept: "Customs Division", office: "Tema Collection Point", title: "Customs Assistant", category: "JUNIOR", role: "employee", manager: "mgrCu" },
  { key: "kojo", employeeId: "GRA-2003", name: "Kojo Asamoah", dept: "Customs Division", office: "Takoradi Office", title: "Customs Officer", category: "SENIOR", role: "employee", manager: "mgrCu" },
  { key: "maame", employeeId: "GRA-2004", name: "Maame Ansah", dept: "Customs Division", office: "Tema Collection Point", title: "Customs Assistant", category: "JUNIOR", role: "employee", manager: "mgrCu" },
  { key: "kwesi", employeeId: "GRA-2005", name: "Kwesi Appiah", dept: "Customs Division", office: "Kumasi Regional Office", title: "Customs Officer", category: "SENIOR", role: "employee", manager: "mgrCu" },
  { key: "yaa", employeeId: "GRA-2006", name: "Yaa Frimpong", dept: "Customs Division", office: "Tema Collection Point", title: "Examination Clerk", category: "JUNIOR", role: "employee", manager: "mgrCu" },
  { key: "fiifi", employeeId: "GRA-2007", name: "Fiifi Baidoo", dept: "Customs Division", office: "Takoradi Office", title: "Senior Customs Officer", category: "SENIOR", role: "employee", manager: "mgrCu" },
];

export const emailFor = (name: string) => `${name.toLowerCase().replace(/[^a-z ]/g, "").trim().replace(/\s+/g, ".")}@demo-gra.test`;

type Ids = Record<string, { id: number; name: string }>;

const P = (start: string, end: string): Period => ({ start, end });
const at = (d: string, hhmm = "09:00") => `${d}T${hhmm}:00.000Z`;

export async function seed(db: DB) {
  await tx(db, async (db) => {
    for (const [k, v] of Object.entries(DEFAULT_POLICY)) {
      await setSetting(db, k as keyof PolicySettings, v, POLICY_STATUS[k as keyof PolicySettings], null);
    }
    await run(db, "INSERT INTO staff_categories (code, name, entitlement_days, status) VALUES ('SENIOR', 'Senior Staff', 35, 'proposed'), ('JUNIOR', 'Junior Staff', 28, 'proposed')");
    for (const [date, name, note] of HOLIDAYS) await run(db, "INSERT INTO public_holidays (date, name, note) VALUES (?, ?, ?)", date, name, note ?? "");

    const deptIds = new Map<string, number>();
    const officeIds = new Map<string, number>();
    for (const u of USERS) {
      if (!deptIds.has(u.dept)) deptIds.set(u.dept, await insert(db, "INSERT INTO departments (name) VALUES (?)", u.dept));
      if (!officeIds.has(u.office)) officeIds.set(u.office, await insert(db, "INSERT INTO offices (name) VALUES (?)", u.office));
    }
    deptIds.set("Finance", await insert(db, "INSERT INTO departments (name) VALUES ('Finance')"));

    const ids: Ids = {};
    // Every synthetic account shares the published demo password, so it is hashed once.
    const demoHash = hashPassword(DEMO_PASSWORD);
    for (const u of USERS) {
      const id = await insert(
        db,
        `INSERT INTO users (employee_id, email, full_name, department_id, office_id, job_title, category_code, role, manager_id, password_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        u.employeeId, emailFor(u.name), u.name, deptIds.get(u.dept)!, officeIds.get(u.office)!, u.title, u.category, u.role,
        u.manager ? ids[u.manager].id : null, demoHash, at("2026-09-01"),
      );
      ids[u.key] = { id, name: u.name };
    }

    await run(db, "INSERT INTO approval_routes (priority, scope_type, scope_value, approver_mode, note) VALUES (10, 'role', 'manager', 'hr', 'Managers'' leave is decided by HR (proposed – confirm delegation of authority)')");
    await run(db, "INSERT INTO approval_routes (priority, scope_type, scope_value, approver_mode, note) VALUES (20, 'role', 'hr', 'hr', 'HR staff leave decided by another HR Administrator')");
    await run(db, "INSERT INTO approval_routes (priority, scope_type, scope_value, approver_mode, note) VALUES (100, 'default', '', 'line_manager', 'Default: employee''s line manager')");
    await audit(db, { id: null, name: "System" }, "system.seed", "system", null, "Loaded synthetic demo data and proposed prototype policies", {}, at("2026-09-01", "08:00"));

    await seedLeave(db, ids);
  });
}

async function seedLeave(db: DB, ids: Ids) {
  const hol = await holidaySet(db);
  const policy = DEFAULT_POLICY;
  const ent = async (key: string) => (await get<{ e: number }>(db, "SELECT c.entitlement_days AS e FROM users u JOIN staff_categories c ON c.code = u.category_code WHERE u.id = ?", ids[key].id))!.e;
  const approverFor = async (key: string) => {
    const mgr = (await get<{ manager_id: number | null; role: string }>(db, "SELECT manager_id, role FROM users WHERE id = ?", ids[key].id))!;
    return mgr.role === "employee" ? mgr.manager_id : null;
  };
  const deciderFor = async (key: string) => (await approverFor(key)) ?? ids.hr.id;
  const nameOf = (id: number) => Object.values(ids).find((v) => v.id === id)!.name;

  async function plan(
    key: string, year: number, periods: Period[], status: PlanStatus,
    o: { submitted?: string; decided?: string; reason?: string; amends?: number } = {},
  ): Promise<number> {
    const employeeId = ids[key].id;
    const analysis = analysePlan(periods, {
      employeeId, year, entitlement: await ent(key), holidays: hol, restrictedMonths: policy.restrictedMonths,
      capacity: policy.monthlyCapacity, allocations: await listAllocations(db, year), approvedRequests: [], mode: "submit",
    });
    if (hasErrors(analysis.issues)) throw new Error(`Seed plan for ${key} ${year} invalid: ${analysis.issues.map((i) => i.title).join(", ")}`);
    const created = o.submitted ?? at("2026-09-15");
    const id = await insertPlan(db, { employeeId, year, status: "draft", amendsPlanId: o.amends ?? null, createdAt: created });
    await replacePlanPeriods(db, id, analysis.periods.map((p) => ({ start: p.start, end: p.end, days: p.days })), analysis.monthly);
    const p = (await getPlan(db, id))!;
    const actor = ids[key];
    await audit(db, actor, "plan.create", "plan", id, `Created master leave plan ${year} v${p.version} (draft)`, {}, created);
    if (status === "draft") return id;

    const approverId = await approverFor(key);
    await updatePlan(db, id, { status: "submitted", submitted_at: created, approver_id: approverId });
    await audit(db, actor, "plan.submit", "plan", id, `Submitted ${o.amends ? "plan amendment" : "master leave plan"} ${year} v${p.version} (${analysis.total} days)`, { monthly: analysis.monthly }, created);
    if (status === "submitted") {
      await notify(db, approverId ? [approverId] : [ids.hr.id], "plan.submitted", "New master leave plan to review",
        `${actor.name} submitted a ${year} plan (${analysis.total} working days).`, `/approvals?item=plan-${id}`, created);
      return id;
    }
    const decider = await deciderFor(key);
    const decided = o.decided ?? at("2026-09-20");
    if (status === "approved") {
      const prev = await getApprovedPlan(db, employeeId, year);
      if (prev) await updatePlan(db, prev.id, { status: "superseded" });
      await updatePlan(db, id, { status: "approved", decided_by: decider, decided_at: decided });
      await audit(db, { id: decider, name: nameOf(decider) }, "plan.approve", "plan", id, `Approved ${actor.name}'s ${o.amends ? "plan amendment" : "master leave plan"} ${year} v${p.version}`,
        { supersedes: prev?.id ?? null, before: prev?.periods.map(formatRange) ?? [], after: periods.map(formatRange) }, decided);
      await notify(db, [employeeId], "plan.approved", `${year} plan approved`, `${nameOf(decider)} approved your master leave plan.`, `/plan?year=${year}`, decided);
    } else {
      await updatePlan(db, id, { status, decided_by: decider, decided_at: decided, decision_reason: o.reason ?? null });
      await audit(db, { id: decider, name: nameOf(decider) }, status === "returned" ? "plan.return" : "plan.reject", "plan", id,
        `${status === "returned" ? "Returned for revision" : "Rejected"}: ${actor.name}'s plan ${year} v${p.version}`, { reason: o.reason }, decided);
      await notify(db, [employeeId], `plan.${status}`, `${year} plan ${status === "returned" ? "returned for revision" : "rejected"}`, `${nameOf(decider)}: ${o.reason}`, `/plan?year=${year}`, decided);
    }
    return id;
  }

  async function request(
    key: string, period: Period, status: RequestStatus,
    o: { submitted?: string; decided?: string; reason?: string; note?: string } = {},
  ) {
    const employeeId = ids[key].id;
    const year = Number(period.start.slice(0, 4));
    const approvedPlan = await getApprovedPlan(db, employeeId, year);
    const existing = (await listRequests(db, { employeeId, status: ["pending", "approved"] }))
      .map((r) => ({ id: r.id, start: r.start, end: r.end, status: r.status as "pending" | "approved", days: r.days }));
    const a = analyseRequest(period, {
      employeeId, today: "2000-01-01", holidays: hol, restrictedMonths: policy.restrictedMonths, capacity: policy.monthlyCapacity,
      entitlement: await ent(key), approvedPlan: approvedPlan?.periods ?? null, existing, allocations: await listAllocations(db, year), mode: "submit",
    });
    if (hasErrors(a.issues)) throw new Error(`Seed request for ${key} ${formatRange(period)} invalid: ${a.issues.map((i) => i.title).join(", ")}`);
    const submitted = o.submitted ?? at("2026-10-01");
    const approverId = await approverFor(key);
    const id = await insertRequest(db, {
      employeeId, year, leaveType: "Annual Leave", start: period.start, end: period.end, days: a.days, reason: o.note ?? "Annual leave",
      status: "pending", planId: approvedPlan?.id ?? null, approverId, submittedAt: submitted,
    }, a.breakdown);
    const actor = ids[key];
    await audit(db, actor, "request.submit", "request", id, `Submitted Annual Leave ${formatRange(period)} (${a.days} days)`, { breakdown: a.breakdown }, submitted);
    if (status === "pending") {
      await notify(db, [approverId ?? ids.hr.id], "request.submitted", "New leave request to review", `${actor.name} requested ${a.days} working day(s): ${formatRange(period)}.`, `/approvals?item=request-${id}`, submitted);
      return id;
    }
    const decider = await deciderFor(key);
    const decided = o.decided ?? at("2026-10-05");
    await run(db, "UPDATE leave_requests SET status = ?, decided_by = ?, decided_at = ?, decision_reason = ? WHERE id = ?", status, decider, decided, o.reason ?? null, id);
    const verb = status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : status === "returned" ? "Returned for revision" : "Cancelled";
    await audit(db, { id: decider, name: nameOf(decider) }, `request.${status === "approved" ? "approve" : status === "rejected" ? "reject" : status === "returned" ? "return" : "cancel"}`,
      "request", id, `${verb}: ${actor.name}'s leave ${formatRange(period)}`, { reason: o.reason }, decided);
    await notify(db, [employeeId], `request.${status}`, `Leave request ${status}`, o.reason ? `${nameOf(decider)}: ${o.reason}` : `${verb} by ${nameOf(decider)}.`, `/requests?open=${id}`, decided);
    return id;
  }

  /* ---------- 2026: historical year (leave already taken) ---------- */
  await plan("kofi", 2026, [P("2026-03-02", "2026-03-13"), P("2026-07-06", "2026-07-24"), P("2026-11-16", "2026-11-27")], "approved", { submitted: at("2026-01-12"), decided: at("2026-01-16") });
  await request("kofi", P("2026-03-02", "2026-03-13"), "approved", { submitted: at("2026-02-10"), decided: at("2026-02-12") });
  await request("kofi", P("2026-07-06", "2026-07-24"), "approved", { submitted: at("2026-06-01"), decided: at("2026-06-03") });
  await request("kofi", P("2026-11-16", "2026-11-27"), "approved", { submitted: at("2026-10-12"), decided: at("2026-10-14") });
  await plan("akosua", 2026, [P("2026-05-04", "2026-05-22"), P("2026-09-07", "2026-09-18")], "approved", { submitted: at("2026-01-13"), decided: at("2026-01-19") });
  await request("akosua", P("2026-05-04", "2026-05-15"), "approved", { submitted: at("2026-04-06"), decided: at("2026-04-08") });
  await plan("nana", 2026, [P("2026-08-03", "2026-08-21"), P("2026-10-05", "2026-10-16")], "approved", { submitted: at("2026-01-14"), decided: at("2026-01-20") });
  await request("nana", P("2026-08-03", "2026-08-21"), "approved", { submitted: at("2026-07-01"), decided: at("2026-07-03") });
  await request("nana", P("2026-10-05", "2026-10-09"), "approved", { submitted: at("2026-09-01"), decided: at("2026-09-02") });

  /* ---------- 2027: active planning year ---------- */
  // March: 4 distinct employees (Kofi, Akosua, Yaw, Esi). Kofi's plan has 14 working days in March.
  await plan("kofi", 2027, [P("2027-03-01", "2027-03-19"), P("2027-08-09", "2027-08-20"), P("2027-10-11", "2027-10-22")], "approved", { submitted: at("2026-10-02"), decided: at("2026-10-06") });
  await plan("akosua", 2027, [P("2027-03-15", "2027-03-25"), P("2027-09-06", "2027-09-24")], "approved", { submitted: at("2026-10-02"), decided: at("2026-10-06") });
  await request("akosua", P("2027-03-15", "2027-03-25"), "approved", { submitted: at("2026-10-08"), decided: at("2026-10-09"), note: "Family visit to Cape Coast" });
  await plan("yaw", 2027, [P("2027-03-30", "2027-04-16"), P("2027-07-05", "2027-07-16"), P("2027-11-01", "2027-11-05")], "approved", { submitted: at("2026-10-03"), decided: at("2026-10-07") });
  await request("yaw", P("2027-03-30", "2027-04-09"), "approved", { submitted: at("2026-10-12"), decided: at("2026-10-13"), note: "Easter travel (spans March and April)" });
  await plan("esi", 2027, [P("2027-03-22", "2027-04-02"), P("2027-10-04", "2027-10-22")], "approved", { submitted: at("2026-10-03"), decided: at("2026-10-07") });
  await request("esi", P("2027-10-04", "2027-10-08"), "rejected", {
    submitted: at("2026-10-14"), decided: at("2026-10-16"), note: "Personal",
    reason: "Clashes with the Q3 filing peak in the Kumasi office. Please choose the later week of your planned October leave.",
  });

  // April: FULL — 5 distinct employees (Yaw, Esi, Kwabena, Adwoa, Nana). Nana has two April periods but counts once.
  await plan("kwabena", 2027, [P("2027-04-05", "2027-04-16"), P("2027-06-14", "2027-07-02")], "approved", { submitted: at("2026-10-04"), decided: at("2026-10-05") });
  const kwabenaV1 = (await getApprovedPlan(db, ids.kwabena.id, 2027))!.id;
  // Amendment: June leave moved one week earlier (v1 superseded by v2).
  await plan("kwabena", 2027, [P("2027-04-05", "2027-04-16"), P("2027-06-07", "2027-06-25")], "approved", { submitted: at("2026-10-15"), decided: at("2026-10-20"), amends: kwabenaV1 });
  await plan("adwoa", 2027, [P("2027-04-19", "2027-04-30"), P("2027-09-13", "2027-09-24")], "approved", { submitted: at("2026-10-05"), decided: at("2026-10-08") });
  await request("adwoa", P("2027-04-19", "2027-04-23"), "pending", { submitted: at("2026-10-22"), note: "Wedding of a sibling" });
  await plan("nana", 2027, [P("2027-04-12", "2027-04-16"), P("2027-04-26", "2027-04-30"), P("2027-08-02", "2027-08-13")], "approved", { submitted: at("2026-10-05"), decided: at("2026-10-09") });

  // February: available (2 employees). May: 2. June/July/etc.: mixed.
  await plan("afia", 2027, [P("2027-02-08", "2027-02-19"), P("2027-07-12", "2027-07-23")], "approved", { submitted: at("2026-10-06"), decided: at("2026-10-09") });
  await plan("kojo", 2027, [P("2027-02-15", "2027-02-26"), P("2027-05-04", "2027-05-21"), P("2027-09-06", "2027-09-10")], "approved", { submitted: at("2026-10-06"), decided: at("2026-10-10") });
  await plan("maame", 2027, [P("2027-06-01", "2027-06-18")], "returned", {
    submitted: at("2026-10-07"), decided: at("2026-10-12"),
    reason: "Your plan only allocates 14 of 28 days. Please plan the remaining days (e.g. September or October) and resubmit.",
  });
  await plan("kwesi", 2027, [P("2027-06-14", "2027-07-02"), P("2027-11-08", "2027-11-19")], "approved", { submitted: at("2026-10-07"), decided: at("2026-10-11") });
  await request("kwesi", P("2027-06-14", "2027-06-25"), "pending", { submitted: at("2026-10-19"), note: "Annual leave – first half of planned June period" });
  await plan("yaa", 2027, [P("2027-10-11", "2027-10-22")], "draft", { submitted: at("2026-10-20") });
  // Pending plan (reserves May, September and October capacity while awaiting approval).
  await plan("fiifi", 2027, [P("2027-05-10", "2027-05-28"), P("2027-09-20", "2027-10-01")], "submitted", { submitted: at("2026-10-16") });

  // Managers' own plans route to HR.
  await plan("mgrDt", 2027, [P("2027-07-19", "2027-08-06"), P("2027-11-15", "2027-11-19")], "approved", { submitted: at("2026-10-01"), decided: at("2026-10-04") });
  // September becomes FULL: Akosua, Adwoa, Kojo, Fiifi (pending) and Abena (pending).
  await plan("mgrCu", 2027, [P("2027-08-16", "2027-09-03")], "submitted", { submitted: at("2026-10-18") });
}
