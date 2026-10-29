import type { Metadata } from "next";
import { getDb } from "@/server/instance";
import { getCategories, getDepartments, getHolidays, getOffices, getPolicy, getPolicyRows, getRoutes } from "@/server/repos/settings";
import { listUsers } from "@/server/repos/users";
import { requireUser } from "@/server/session";
import PolicyView from "./PolicyView";

export const metadata: Metadata = { title: "Policy settings" };

export default async function PolicyPage() {
  await requireUser(["hr"]);
  const db = await getDb();
  const users = await listUsers(db, { activeOnly: true });
  return (
    <PolicyView
      rows={await getPolicyRows(db)}
      activeYear={(await getPolicy(db)).activeYear}
      categories={await getCategories(db)}
      holidays={await getHolidays(db)}
      departments={await getDepartments(db)}
      offices={await getOffices(db)}
      routes={await getRoutes(db)}
      approvers={users.filter((u) => u.role === "manager" || u.role === "hr").map((u) => ({ id: u.id, name: u.fullName }))}
      employees={users.map((u) => ({ id: u.id, name: u.fullName }))}
    />
  );
}
