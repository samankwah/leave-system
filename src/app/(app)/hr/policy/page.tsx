import type { Metadata } from "next";
import { getDb } from "@/server/instance";
import { getCategories, getDepartments, getHolidays, getOffices, getPolicy, getPolicyRows, getRoutes } from "@/server/repos/settings";
import { listUsers } from "@/server/repos/users";
import { requireUser } from "@/server/session";
import PolicyView from "./PolicyView";

export const metadata: Metadata = { title: "Policy settings" };

export default async function PolicyPage() {
  const [, db] = await Promise.all([requireUser(["hr"]), getDb()]);
  const [users, rows, policy, categories, holidays, departments, offices, routes] = await Promise.all([
    listUsers(db, { activeOnly: true }), getPolicyRows(db), getPolicy(db), getCategories(db), getHolidays(db),
    getDepartments(db), getOffices(db), getRoutes(db),
  ]);
  return (
    <PolicyView
      rows={rows}
      activeYear={policy.activeYear}
      categories={categories}
      holidays={holidays}
      departments={departments}
      offices={offices}
      routes={routes}
      approvers={users.filter((u) => u.role === "manager" || u.role === "hr").map((u) => ({ id: u.id, name: u.fullName }))}
      employees={users.map((u) => ({ id: u.id, name: u.fullName }))}
    />
  );
}
