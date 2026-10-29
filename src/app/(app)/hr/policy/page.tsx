import type { Metadata } from "next";
import { getDb } from "@/server/instance";
import { getCategories, getDepartments, getHolidays, getOffices, getPolicy, getPolicyRows, getRoutes } from "@/server/repos/settings";
import { listUsers } from "@/server/repos/users";
import { requireUser } from "@/server/session";
import PolicyView from "./PolicyView";

export const metadata: Metadata = { title: "Policy settings" };

export default async function PolicyPage() {
  await requireUser(["hr"]);
  const db = getDb();
  const users = listUsers(db, { activeOnly: true });
  return (
    <PolicyView
      rows={getPolicyRows(db)}
      activeYear={getPolicy(db).activeYear}
      categories={getCategories(db)}
      holidays={getHolidays(db)}
      departments={getDepartments(db)}
      offices={getOffices(db)}
      routes={getRoutes(db)}
      approvers={users.filter((u) => u.role === "manager" || u.role === "hr").map((u) => ({ id: u.id, name: u.fullName }))}
      employees={users.map((u) => ({ id: u.id, name: u.fullName }))}
    />
  );
}
