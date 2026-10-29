import type { Role } from "@/domain/types";
import { all, get, type DB } from "../db";

export interface User {
  id: number;
  employeeId: string;
  email: string;
  fullName: string;
  departmentId: number | null;
  departmentName: string | null;
  officeId: number | null;
  officeName: string | null;
  jobTitle: string;
  categoryCode: string;
  categoryName: string;
  role: Role;
  managerId: number | null;
  managerName: string | null;
  active: boolean;
  lockedUntil: string | null;
}

interface UserRow {
  id: number; employee_id: string; email: string; full_name: string; department_id: number | null;
  department_name: string | null; office_id: number | null; office_name: string | null; job_title: string;
  category_code: string; category_name: string; role: Role; manager_id: number | null; manager_name: string | null;
  active: number; locked_until: string | null;
}

const SELECT = `
  SELECT u.*, d.name AS department_name, o.name AS office_name, c.name AS category_name, m.full_name AS manager_name
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN offices o ON o.id = u.office_id
    LEFT JOIN staff_categories c ON c.code = u.category_code
    LEFT JOIN users m ON m.id = u.manager_id`;

const map = (r: UserRow): User => ({
  id: r.id,
  employeeId: r.employee_id,
  email: r.email,
  fullName: r.full_name,
  departmentId: r.department_id,
  departmentName: r.department_name,
  officeId: r.office_id,
  officeName: r.office_name,
  jobTitle: r.job_title,
  categoryCode: r.category_code,
  categoryName: r.category_name,
  role: r.role,
  managerId: r.manager_id,
  managerName: r.manager_name,
  active: r.active === 1,
  lockedUntil: r.locked_until,
});

export function getUser(db: DB, id: number): User | undefined {
  const r = get<UserRow>(db, `${SELECT} WHERE u.id = ?`, id);
  return r && map(r);
}

export function findLogin(db: DB, login: string) {
  return get<UserRow & { password_hash: string; failed_logins: number }>(
    db, `${SELECT} WHERE u.employee_id = ? OR u.email = ?`, login.trim(), login.trim(),
  );
}

export function listUsers(db: DB, opts: { activeOnly?: boolean } = {}): User[] {
  return all<UserRow>(db, `${SELECT} ${opts.activeOnly ? "WHERE u.active = 1" : ""} ORDER BY u.full_name`).map(map);
}

export function usersByRole(db: DB, role: Role): User[] {
  return all<UserRow>(db, `${SELECT} WHERE u.role = ? AND u.active = 1`, role).map(map);
}

export { map as mapUserRow };
