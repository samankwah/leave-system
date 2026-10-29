import type { Metadata } from "next";
import { todayIso } from "@/server/db";
import { getDb } from "@/server/instance";
import { getPolicy } from "@/server/repos/settings";
import { teamLeave } from "@/server/services/queries";
import { requireUser } from "@/server/session";
import TeamLeaveView from "./TeamLeave";

export const metadata: Metadata = { title: "Team leave" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ year?: string; open?: string }> }) {
  const [user, db, sp] = await Promise.all([requireUser(["manager", "hr"]), getDb(), searchParams]);
  // Defaults to the planning year, like the Annual plan page.
  const { activeYear } = await getPolicy(db);
  const years = [activeYear + 1, activeYear, activeYear - 1];
  const year = years.includes(Number(sp.year)) ? Number(sp.year) : activeYear;
  const data = await teamLeave(db, user, year);
  return (
    <TeamLeaveView key={year} {...data} year={year} years={years} today={todayIso()} viewerId={user.id}
      isHr={user.role === "hr"} openId={Number(sp.open) || null} />
  );
}
