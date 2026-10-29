import type { Metadata } from "next";
import { isValidISO, yearOf } from "@/domain/workingDays";
import { getDb } from "@/server/instance";
import { getRequest } from "@/server/repos/leave";
import { getPolicy } from "@/server/repos/settings";
import { calendarData } from "@/server/services/queries";
import { requireUser } from "@/server/session";
import RequestForm from "./RequestForm";

export const metadata: Metadata = { title: "Request leave" };

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ start?: string; end?: string; edit?: string; year?: string }> }) {
  const [user, db, sp] = await Promise.all([requireUser(), getDb(), searchParams]);
  const [editing, policy] = await Promise.all([sp.edit ? getRequest(db, Number(sp.edit)) : undefined, getPolicy(db)]);
  const editable = editing && editing.employeeId === user.id && editing.status === "returned" ? editing : null;
  const start = editable?.start ?? (isValidISO(sp.start) ? sp.start : undefined);
  const end = editable?.end ?? (isValidISO(sp.end) ? sp.end : undefined);
  const year = Number(sp.year) || (start ? yearOf(start) : policy.activeYear);
  const data = await calendarData(db, user, year);
  return (
    <RequestForm
      key={`${year}-${editable?.id ?? "new"}`}
      data={data}
      years={[policy.activeYear - 1, policy.activeYear, policy.activeYear + 1]}
      initial={{ start, end, leaveType: editable?.leaveType ?? policy.leaveTypes[0], reason: editable?.reason ?? "" }}
      editing={editable ? { id: editable.id, decidedByName: editable.decidedByName, decisionReason: editable.decisionReason } : null}
    />
  );
}
