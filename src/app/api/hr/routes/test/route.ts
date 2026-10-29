import { route } from "@/server/api";
import { notFound } from "@/server/errors";
import { getRoutes } from "@/server/repos/settings";
import { getUser } from "@/server/repos/users";
import { resolveApprover } from "@/server/services/workflow";

/** Read-only: who would decide this employee's plans and requests under the current routes? */
export const GET = route(["hr"], ({ db, req }) => {
  const id = Number(new URL(req.url).searchParams.get("employee"));
  const employee = getUser(db, id);
  if (!employee) throw notFound("Employee");
  const routes = getRoutes(db).filter((r) => r.active === 1);
  const matched = routes.find(
    (r) =>
      (r.scope_type === "department" && Number(r.scope_value) === employee.departmentId) ||
      (r.scope_type === "category" && r.scope_value === employee.categoryCode) ||
      (r.scope_type === "role" && r.scope_value === employee.role) ||
      r.scope_type === "default",
  );
  const approverId = resolveApprover(db, employee);
  return {
    employee: employee.fullName,
    routeId: matched?.id ?? null,
    approver: approverId ? getUser(db, approverId)?.fullName ?? null : null,
    pool: approverId === null,
  };
});
