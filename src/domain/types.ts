/** ISO calendar date, e.g. "2027-03-15". */
export type ISODate = string;
/** Calendar month key, e.g. "2027-03". */
export type MonthKey = string;

export type Role = "employee" | "manager" | "hr" | "sysadmin";

/** Governance status of a configurable rule (see README: policies requiring confirmation). */
export type RuleStatus = "confirmed" | "proposed" | "assumption";

export interface Period {
  start: ISODate;
  end: ISODate;
}

export interface PolicySettings {
  activeYear: number;
  /** Months (1-12) in which leave cannot be scheduled. */
  restrictedMonths: number[];
  /** Maximum distinct employees scheduled for leave per calendar month. */
  monthlyCapacity: number;
  carryoverEnabled: boolean;
  carryoverMaxDays: number;
  /** Pending approvals older than this many days are reported as overdue. */
  overdueApprovalDays: number;
  leaveTypes: string[];
}

export interface StaffCategory {
  code: string;
  name: string;
  entitlementDays: number;
  status: RuleStatus;
}

export type IssueCode =
  | "INVALID_DATES"
  | "RESTRICTED"
  | "CROSS_YEAR"
  | "NO_WORKING_DAYS"
  | "PAST_DATE"
  | "NO_PLAN"
  | "PLAN_MISMATCH"
  | "BALANCE_EXCEEDED"
  | "PLAN_OVER_ENTITLEMENT"
  | "CAPACITY_FULL"
  | "OVERLAP"
  | "DUPLICATE"
  | "EMPTY_PLAN"
  | "AMENDMENT_CONFLICT";

export interface Issue {
  code: IssueCode;
  severity: "error" | "warning";
  title: string;
  message: string;
  month?: MonthKey;
}

/** One employee's leave days in one month, contributed by a plan or a request. */
export interface Allocation {
  employeeId: number;
  month: MonthKey;
  days: number;
  sourceType: "plan" | "request";
  sourceId: number;
  approved: boolean;
}

export type MonthStatus = "available" | "nearly-full" | "full" | "restricted";

export interface MonthOccupancy {
  month: MonthKey;
  employeeIds: number[];
  approvedEmployeeIds: number[];
  pendingOnlyEmployeeIds: number[];
  count: number;
  capacity: number;
  remaining: number;
  status: MonthStatus;
}
