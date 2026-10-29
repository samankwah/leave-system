import type { Metadata } from "next";
import { ROLE_LABEL } from "@/components/nav";
import { requireUser } from "@/server/session";
import AccountView from "./AccountView";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const u = await requireUser();
  return (
    <AccountView
      name={u.fullName}
      subtitle={`${u.jobTitle} · ${ROLE_LABEL[u.role]}`}
      profile={[
        ["Employee ID", u.employeeId], ["Official email", u.email], ["Department", u.departmentName ?? "—"],
        ["Office", u.officeName ?? "—"], ["Staff category", u.categoryName], ["Line manager", u.managerName ?? "—"],
      ]}
    />
  );
}
