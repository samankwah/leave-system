import type { Issue, MonthKey } from "./types";
import { MONTH_NAMES, monthName } from "./workingDays";

/** Human description of the open scheduling window, e.g. "February through November". */
export function describeWindow(restrictedMonths: number[]): string {
  const open = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !restrictedMonths.includes(m));
  if (open.length === 0) return "no months (all months are currently restricted)";
  // Group consecutive open months into ranges.
  const ranges: [number, number][] = [];
  for (const m of open) {
    const last = ranges[ranges.length - 1];
    if (last && last[1] === m - 1) last[1] = m;
    else ranges.push([m, m]);
  }
  const parts = ranges.map(([a, b]) => (a === b ? MONTH_NAMES[a - 1] : `${MONTH_NAMES[a - 1]} through ${MONTH_NAMES[b - 1]}`));
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export const messages = {
  restricted(restrictedMonths: number[], month?: MonthKey): Issue {
    return {
      code: "RESTRICTED",
      severity: "error",
      title: "Leave Scheduling Restricted",
      message: `Leave scheduling is available from ${describeWindow(restrictedMonths)} only. Please select an available period.`,
      month,
    };
  },
  capacityFull(month: MonthKey, capacity: number): Issue {
    const name = monthName(month);
    return {
      code: "CAPACITY_FULL",
      severity: "error",
      title: `⚠️ ${name} Leave Limit Reached!`,
      message: `A maximum of ${capacity} employees can be scheduled for leave in ${name}. This month's allocation is full. Please select another available month.`,
      month,
    };
  },
  planMismatch(detail?: string): Issue {
    return {
      code: "PLAN_MISMATCH",
      severity: "error",
      title: "Master Leave Plan Mismatch",
      message:
        "Your selected dates or monthly allocation do not match your approved annual master leave plan. Adjust your request or submit a plan amendment for manager approval." +
        (detail ? ` ${detail}` : ""),
    };
  },
  noPlan(year: number): Issue {
    return {
      code: "NO_PLAN",
      severity: "error",
      title: "No Approved Master Leave Plan",
      message: `You do not have an approved master leave plan for ${year}. Prepare and submit your annual plan; leave can be requested once it is approved.`,
    };
  },
  balanceExceeded(requested: number, available: number): Issue {
    return {
      code: "BALANCE_EXCEEDED",
      severity: "error",
      title: "Annual Leave Balance Exceeded",
      message: `This request exceeds your available annual leave entitlement. Review your remaining balance or adjust the requested dates. (Requested ${requested} working day(s); ${available} available after approved and pending leave.)`,
    };
  },
  planOverEntitlement(planned: number, entitlement: number): Issue {
    return {
      code: "PLAN_OVER_ENTITLEMENT",
      severity: "error",
      title: "Plan Exceeds Annual Entitlement",
      message: `Your plan allocates ${planned} working days but your annual entitlement is ${entitlement}. Remove or shorten a leave period.`,
    };
  },
  invalidDates(message = "Enter a valid start and end date. The end date cannot be before the start date."): Issue {
    return { code: "INVALID_DATES", severity: "error", title: "Invalid Dates", message };
  },
  crossYear(): Issue {
    return {
      code: "CROSS_YEAR",
      severity: "error",
      title: "Dates Outside Leave Year",
      message: "Leave periods must fall within a single leave year. Split the period or choose dates within the plan year.",
    };
  },
  noWorkingDays(): Issue {
    return {
      code: "NO_WORKING_DAYS",
      severity: "error",
      title: "No Working Days Selected",
      message: "The selected dates fall entirely on weekends or public holidays. Choose dates that include working days.",
    };
  },
  pastDate(): Issue {
    return {
      code: "PAST_DATE",
      severity: "error",
      title: "Start Date Has Passed",
      message: "Leave cannot be requested for a start date in the past. Choose a future start date.",
    };
  },
  overlap(range: string): Issue {
    return {
      code: "OVERLAP",
      severity: "error",
      title: "Overlapping Leave",
      message: `These dates overlap your existing leave (${range}). Cancel or adjust the existing leave, or choose different dates.`,
    };
  },
  duplicate(range: string): Issue {
    return {
      code: "DUPLICATE",
      severity: "error",
      title: "Duplicate Request",
      message: `You already have a request for exactly these dates (${range}). Track it on the My Requests page instead of submitting it again.`,
    };
  },
  emptyPlan(): Issue {
    return {
      code: "EMPTY_PLAN",
      severity: "error",
      title: "No Leave Periods",
      message: "Add at least one leave period with exact start and end dates before submitting your plan.",
    };
  },
  periodOverlap(a: string, b: string): Issue {
    return {
      code: "OVERLAP",
      severity: "error",
      title: "Overlapping Plan Periods",
      message: `Plan periods ${a} and ${b} overlap. Merge or adjust them.`,
    };
  },
  amendmentConflict(range: string): Issue {
    return {
      code: "AMENDMENT_CONFLICT",
      severity: "error",
      title: "Approved Leave Outside Amended Plan",
      message: `Your approved leave (${range}) would no longer be covered by this plan. Keep those dates in the plan, or cancel that leave first.`,
    };
  },
};
