import type { Metadata } from "next";
import { getDb } from "@/server/instance";
import { getCategories, getDepartments, getOffices, getPolicy } from "@/server/repos/settings";
import { listUsers } from "@/server/repos/users";
import { loadContextBatch } from "@/server/services/context";
import { requireUser } from "@/server/session";
import EmployeesView, { type EmployeeRow } from "./EmployeesView";

export const metadata: Metadata = { title: "Employees" };

export default async function EmployeesPage() {
  const [, db] = await Promise.all([requireUser(["hr"]), getDb()]);
  const [policy, users, departments, offices, categories] = await Promise.all([
    getPolicy(db), listUsers(db), getDepartments(db), getOffices(db), getCategories(db),
  ]);
  const year = policy.activeYear;
  const contexts = await loadContextBatch(db, year, users);
  const rows: EmployeeRow[] = users.map((u) => {
    const c = contexts.get(u.id)!;
    return {
      ...u,
      balance: c.balance,
      planStatus: c.approvedPlan ? (c.workingPlan ? `approved + ${c.workingPlan.status}` : "approved") : c.workingPlan?.status ?? "none",
      planPeriods: (c.approvedPlan ?? c.workingPlan)?.periods.map((p) => ({ start: p.start, end: p.end, days: p.days })) ?? [],
      requests: c.requests.slice(0, 5).map((r) => ({ id: r.id, start: r.start, end: r.end, days: r.days, status: r.status })),
    };
  });
  return <EmployeesView year={year} users={rows} departments={departments} offices={offices} categories={categories} />;
}
