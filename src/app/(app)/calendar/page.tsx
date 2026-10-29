import type { Metadata } from "next";
import { getDb } from "@/server/instance";
import { getPolicy } from "@/server/repos/settings";
import { calendarData, wallchart } from "@/server/services/queries";
import { requireUser } from "@/server/session";
import CalendarView from "./CalendarView";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string; view?: string }> }) {
  const [user, db, sp] = await Promise.all([requireUser(), getDb(), searchParams]);
  const policy = await getPolicy(db);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : undefined;
  const year = Number(sp.year) || (month ? Number(month.slice(0, 4)) : policy.activeYear);
  const showTeam = user.role === "manager" || user.role === "hr";
  const [data, team] = await Promise.all([calendarData(db, user, year), showTeam ? wallchart(db, user, year) : null]);
  return (
    <CalendarView
      key={year}
      data={data}
      years={[policy.activeYear - 1, policy.activeYear, policy.activeYear + 1]}
      initialMonth={month}
      initialView={showTeam && sp.view === "team" ? "team" : "mine"}
      team={team}
      teamLabel={user.role === "hr" ? "Organisation" : "My team"}
    />
  );
}
