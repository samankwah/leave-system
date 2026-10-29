# Leave Management System – GRA prototype

A full-stack prototype for annual leave planning, scheduling, approval and monitoring. It is designed for the Ghana Revenue Authority but **is not an official GRA system**. All data is synthetic, and every leave rule is a *proposal* until GRA policy confirms it (see [Policies requiring confirmation](#policies-requiring-confirmation-before-production)).

## Setup

Requires **Node.js 22.13+** (built and tested on Node 24.16). Production runs on **Vercel** with a **Neon Postgres** database. For local development and tests the same schema runs in **PGlite** (Postgres compiled to WebAssembly), so no database server is needed.

```bash
npm install
npm run dev:local      # http://localhost:3000 on a local PGlite database (data/pglite)
npm run dev            # same, but against the Neon DATABASE_URL in .env.local
npm test               # unit and service tests (vitest)
npm run typecheck
npm run db:reset       # delete the local PGlite data; demo data reloads on next start

# Browser tests (Playwright, Chromium). They build into .next-build (so a running `npm run dev` is unaffected) and start their own server
# on port 3100 against a throw-away database with "today" fixed at 2026-10-29.
npx playwright install chromium   # once
npm run test:e2e       # end-to-end user journeys
npm run screenshots    # every page x desktop/phone x light/dark -> e2e/screenshots/
```

**Database selection.**
- When `DATABASE_URL` is set, the app uses `node-postgres` with a pooled Neon connection.
- Otherwise it uses PGlite stored in `data/pglite`. Override the location with `LEAVE_DB_PATH`.

On first start the app creates the schema and loads the demo data. Schema changes go over Neon's direct (`DATABASE_URL_UNPOOLED`) endpoint. Supporting documents are stored in Postgres, because serverless disks don't persist. `LEAVE_TODAY=YYYY-MM-DD` fixes "today" for demos and tests.

## Deployment (Vercel + Neon)

- **Vercel project:** `leave-system`, connected to this GitHub repository. Every push to `main` deploys to production.
- **Database:** Neon Postgres, provisioned through the Vercel Marketplace (`vercel integration add neon`). The integration manages `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and the related variables in the project.
- **Region:** functions are pinned to `lhr1` (London) in `vercel.ts`, the same region as the Neon database (`eu-west-2`).
- **Local environment:** run `vercel env pull` to fetch the variables into `.env.local`, which git ignores.
- **Resetting production data:** sign in as the System Administrator and use **User access → Danger zone → Reset demo data**.

## Demo credentials

All accounts use the password **`Demo@2026`**. You can sign in with the Employee ID or the email address (`firstname.lastname@demo-gra.test`).

| Employee ID | Role | Useful for |
|---|---|---|
| GRA-1001 Kofi Adjei | Employee (senior, 35 days) | Approved plan with 13 days in March. Request 1–16 Mar 2027 (10 working days) to see a long request accepted. |
| GRA-1007 Ama Darko | Employee (junior, 28 days) | Has no plan. Try January (restricted), April (full), then March (takes the 5th slot). |
| GRA-1002 Akosua Boakye | Employee (junior) | Approved request in March. An amendment that drops March is blocked. |
| GRA-2004 Maame Ansah | Employee (junior) | Plan returned for revision. |
| GRA-7001 Kwame Mensah | Manager, Domestic Tax | Pending request from Adwoa. |
| GRA-7002 Abena Owusu | Manager, Customs | Pending plan from Fiifi and pending request from Kwesi. |
| GRA-8001 Efua Asante | HR Administrator | Policies, roster, reports, audit, and Abena's plan (managers route to HR). |
| GRA-9001 Yaw Boateng | System Administrator | User access, sessions, audit, reset demo data. |

### Seeded scenarios (2027 is the active planning year; 2026 holds history)

| Scenario | Seeded data |
|---|---|
| Available month | February (2 of 5 employees) |
| Four employees scheduled | March (4 of 5) |
| Fully booked month, 5 distinct employees | April. Nana has two April periods but counts once. |
| Full because of pending reservations | September (Fiifi's and Abena's pending plans) |
| Approved plan with more than 5 days in one month | Kofi: 13 days in March |
| Pending plan | Fiifi; also Abena, which goes to HR |
| Plan returned for revision | Maame |
| Draft plan | Yaa |
| Approved request | Akosua (March) |
| Rejected request | Esi (October, with reason) |
| Request spanning two months | Yaw: 30 Mar – 9 Apr |
| Plan amendment | Kwabena: v1 superseded by v2 |
| Leave already taken and planned-vs-actual history | 2026 records for Kofi, Akosua and Nana |
| Restricted months | January and December |

## User experience

The interface follows patterns from established HR and productivity tools: BambooHR/Personio-style balance cards, Timetastic-style team wallcharts, Linear-style quiet surfaces with keyboard shortcuts, and Airbnb-style two-month range pickers.

- **Design system.** It keeps the navy and gold palette, uses the Inter typeface, and is built from MUI CSS-variable tokens. **Light, dark and automatic (system) themes** are available from the account menu or the Account page; the choice is remembered and there is no flash on load. Leave states (planned, pending, approved, full, restricted, holiday) have their own colours in both themes, and status is never shown by colour alone.
- **App shell.**
  - The sidebar collapses to icons and remembers your choice.
  - On phones the menu becomes a drawer.
  - **Ctrl/Cmd K** opens a command palette to jump to pages and actions.
  - The notification bell opens a popover with deep links to the exact item.
  - A dismissible prototype notice appears at the top.
- **Dashboard.**
  - A single balance card shows a big "available to book" number and a segmented bar for taken, booked, pending and available days.
  - A plan progress stepper and a 12-month at-a-glance grid with capacity dots.
  - Requests with filters, next leave with a countdown, and recent activity.
  - Managers and HR also get a "Needs your attention" card.
- **Calendar and range picker.** Two months on desktop and one on phones.
  - Hovering previews the range with a live working-day count.
  - Arrow, Home, End, Enter and Escape keys work for navigation and selection.
  - Today and public holidays are marked.
  - Each month shows capacity dots, and restricted or full months are clearly overlaid.
- **Annual plan.**
  - Status stepper.
  - A sticky summary showing the entitlement meter, period chips and a monthly allocation chart.
  - Validation shown as one summary line that expands to details.
  - Amendments show a diff: new periods, removed periods, and dashed bars for the approved version.
  - A sticky save/submit bar with an unsaved-changes indicator and a warning if you leave the page with unsaved changes.
- **Request leave.** Three steps: dates (one click on an approved plan period, or the calendar), details (with a drag-and-drop document), then an inline review that is validated on the server. A live impact panel shows the balance before and after, plan coverage for each month, and capacity. A mismatch with the plan offers "Request a plan amendment".
- **My requests.** Status filter chips and a year filter. Each request opens a side drawer with its timeline, approver comment, attachment, and cancel or revise actions.
- **Approvals inbox.** A list on the left and details on the right (a full-screen drawer on phones).
  - Each item shows a balance bar, plan coverage or monthly bars with an amendment diff, and who else is off that month. Names are shown to HR, and to managers only for their own team.
  - Rule checks run again live.
  - Shortcuts: **J/K** move through the list; **A**, **R** and **X** approve, return and reject.
- **Team wallchart** (managers and HR). One row per person and one column per day, with continuous leave bars, shaded weekends and holidays, today highlighted, and a daily headcount.
- **HR pages.**
  - **Employees:** searchable list with a profile drawer, inline form validation, and a copyable one-time password for new accounts.
  - **Roster:** heat-style roster with capacity dots per month, an over-capacity warning and export.
  - **Policy settings:** grouped into sections. Rule cards show the governance status and any unsaved changes, holidays can be filtered by year with a warning when the active year has none, and a routing tester shows who approves a given employee.
  - **Reports:** headline figures, a card-style picker, sortable columns and a CSV or Excel export menu.
- **Audit and admin.**
  - **Audit:** filter by record type and date range; expand any row to see a readable from-to diff. Integrity is checked automatically.
  - **Admin:** summary figures, an account table with an actions menu, a sessions list, and a danger zone where reset requires typing RESET.
- **States and feedback.** Loading skeletons, friendly error and 404 pages, toasts for every action, and empty states that offer a next step.

## Implemented features

- **Login and access control**
  - Employee ID or email login, with form validation and clear error messages.
  - scrypt password hashing, and httpOnly session cookies stored server-side with an 8-hour expiry.
  - Accounts lock for 15 minutes after 5 failed attempts.
  - Role-based navigation. Every page and API checks the role again on the server.
- **Employee dashboard**
  - Shows entitlement, approved leave (split into taken and scheduled), pending leave, remaining balance, projected balance after pending, days allocated in the plan, and unallocated days. Approved, pending and planned days are kept separate.
  - Also shows a 12-month allocation strip with capacity, upcoming leave, requests grouped by status, notifications, and quick actions.
- **Annual master leave plan**
  - Exact periods are chosen on the calendar or typed in. Monthly allocation and totals are calculated automatically.
  - Shows unallocated days, live validation, save draft, submit, and discard.
  - Plans are routed to the configured approver.
  - Approvers can approve, reject or return a plan; reasons and decision times are recorded.
  - Every version is kept. Amendments create a new version, and the approved plan stays in force until the amendment is approved.
- **Interactive calendar**
  - Month navigation, start/end date selection, and a legend for all states (available, selected, planned, pending, approved, full, restricted, holiday).
  - Shows capacity per month, compares the selection with the approved plan, and previews the balance instantly.
- **Leave request form**
  - Leave type, dates, working-day count, monthly breakdown against plan days and capacity, balance preview, and reason.
  - Optional PDF/PNG/JPEG supporting document, up to 2 MB. The file's actual content is checked against its type.
  - A review summary is validated again on the server before submission.
  - Requests can be cancelled, and a request returned for revision can be edited and resubmitted.
- **Automated warnings**
  - Uses the exact specified texts for: Leave Scheduling Restricted, "⚠️ {Month} Leave Limit Reached!", Master Leave Plan Mismatch, and Annual Leave Balance Exceeded.
  - Also warns about overlap/duplicate requests, past dates, plans exceeding entitlement, and amendment conflicts.
  - Warnings appear as you select dates, and other form inputs are kept when a selection fails.
- **Approvals (manager and HR)**
  - Queue of plans and requests showing the employee and category, balance, plan comparison (including the previous version for amendments), monthly capacity, and history.
  - Overdue items are flagged.
  - Every rule is checked again on the server immediately before approval, and Approve is blocked if a rule fails.
  - A reason is required to reject or return.
  - Nobody can approve their own leave.
  - Managers can act only on items routed to them; HR can act on all.
- **HR administration**
  - Employees: create and edit profiles. Category drives entitlement; new accounts get a one-time temporary password.
  - Policy rules, each tagged *confirmed / proposed / assumption*: entitlements, restricted months, monthly capacity, carryover, overdue threshold, leave types.
  - Public holidays, departments and offices, and configurable approval routes.
  - Annual roster grid with capacity per month, and amendment history.
- **Reports** with CSV and Excel export:
  - balances
  - planned vs actual
  - upcoming leave by month
  - departmental capacity
  - fully booked periods
  - pending/overdue approvals
  - returned items
  - roster amendments
  - audit history
- **Notifications**
  - Plan and request submitted, approved, rejected or returned.
  - Request cancelled.
  - A month becomes fully booked (sent to HR).
  - An approved plan is changed (sent to HR and the approver).
- **Audit trail**
  - Records who did what, when, what changed, and why.
  - Append-only: database triggers block UPDATE and DELETE.
  - Records are SHA-256 hash-chained, and a "Verify integrity" check is available to HR and System Administrators.
- **System Administrator**
  - Change roles and activate/deactivate accounts (deactivation ends that user's sessions).
  - Reset passwords, unlock accounts, and revoke sessions.
  - View system information and reset the demo data.

## Architecture

```
src/domain/      Pure TypeScript business rules (no I/O), shared by server and browser
  workingDays    weekends + configurable holidays, monthly breakdown
  capacity       distinct-employee monthly occupancy and reservation reuse
  balance        entitlement / approved / taken / pending / planned / projected
  planRules      master plan validation
  requestRules   leave request validation
  messages       exact warning texts
src/server/      Server-only: Postgres access (db.ts, drivers.ts: pg for Neon, PGlite locally), schema, auth, repositories, services
  services/      planService, requestService, workflow (routing, permissions),
                 adminService (HR + sysadmin), reportService, queries (page data)
src/app/api/     Route Handlers: thin wrappers around services
src/app/(app)/   Pages (server components loading data, client components for interaction)
src/components/  UI: AppShell, CommandPalette, NotificationBell, LeaveCalendar, Wallchart, PlanProgress
  ui/            primitives: Toaster, BalanceBar, MonthBars, ValidationSummary, ActivityTimeline, FileDrop, EmptyState
src/theme/       design tokens and the MUI theme (light + dark colour schemes)
src/lib/         client fetch helper, deterministic date formatting, shared constants
tests/           vitest: domain rules + services against a seeded in-memory DB
e2e/             Playwright: user journeys and the screenshot sweep
```

**Capacity reservations.** Capacity is counted from a SQL view, `v_allocations`, that lists every *active* allocation:

- submitted or approved plans
- pending or approved requests

Each month's occupancy is the number of **distinct** employees in it. This gives the required behaviour without extra bookkeeping:

- An employee's plan and their requests share one slot.
- A request inside an existing reservation reuses that slot.
- A pending item that introduces a new month reserves a slot.
- A slot is released automatically when the employee's last active source for that month is rejected, returned, cancelled or superseded.

**Concurrency.** Writes take fine-grained, transaction-scoped advisory locks rather than one global lock:

- **`emp:<id>`** covers one employee's plans, requests and balance.
- **`cap:<YYYY-MM>`** covers each month whose capacity is affected.

Keys are always acquired in sorted order, so two transactions can't deadlock. Capacity is read only *after* the month locks are held, so two simultaneous attempts on the last slot can't both succeed, even from different serverless instances. Writes for different employees and different months proceed in parallel.

Audit entries are buffered during a transaction and appended to the hash chain in one insert just before COMMIT, under a short `audit-chain` lock. Routine sign-ins go to `auth_events` instead of the chain. Password hashing is asynchronous and runs before any transaction opens. Any rule failure rolls back every write in the transaction, including audit records and notifications.

**Performance.**
- **Sign-in check:** the signed-in user is resolved once per request with a single joined query.
- **Approval badge:** a single COUNT query.
- **Pages:** load their data in at most two parallel rounds and reuse one employee context.
- **Batching:** reports, HR lists and the approvals queue batch-load contexts, reading each table once rather than once per employee. Plan periods and request breakdowns are also batch-loaded.
- **On-demand loading:** "Recently decided" approvals are limited in SQL and loaded only when that tab opens. Request histories load when their drawer opens, and notifications page backwards.
- **Audit verification:** incremental from a checkpoint, with a full re-check available on demand.
- **Browser payloads:** limited to the selected year, with allocations bounded by monthly capacity rather than headcount.

**Privacy in the browser.** Employees receive capacity *counts* only. Other employees appear as anonymous ids, so the browser preview can run the same rules without revealing who is on leave. Managers see names for their own team; HR sees everyone.

## Test results

`npm test`: **61 tests passing** (21 domain, 26 service, 5 hardening, 9 performance/concurrency). They cover:

- category entitlements and annual balance enforcement
- long requests that the plan supports
- rejection of requests outside the plan
- the 5-employee monthly limit, with several requests from one employee counting once
- restricted months
- working days and public holidays, including cross-month breakdowns
- reserving and releasing capacity
- amendment versioning and amendment conflicts
- manager approval and rejection, with revalidation that blocks approval after a capacity change
- duplicate and overlapping requests
- the race for the final slot
- dashboard balance updates
- role and self-approval restrictions
- login and lockout
- audit immutability and hash-chain verification
- batched contexts giving exactly the same results as single-employee contexts
- notification deep links
- anonymised data sent to the browser
- date formatting that is the same in every timezone

`npm run test:e2e`: **8 Playwright journeys passing** in Chromium. Any browser console error, including React hydration warnings, fails the test. The journeys are:

1. sign-in, a wrong password, and role redirects
2. a plan blocked by a restricted month, then by a full month, then submitted
3. manager approval, then a 10-day March request approved and the balance updated
4. return for revision, revise, resubmit
5. an amendment with its diff, approved and superseding the old version
6. HR lowers capacity, sees the over-capacity warning, and downloads an export
7. the dark-mode choice persisting across reloads
8. no horizontal scrolling on any page at phone width (390 px)

`npm run typecheck`, `npm run lint` and `npm run build` also pass.

## Limitations of this prototype

- The audit hash chain is still a single ordered sequence. Appends are short (one insert at commit), but very high write volumes would need a partitioned or batched chain.
- Backups use Neon's built-in point-in-time restore. Retention depends on the Neon plan, so confirm it meets GRA's requirements.
- There is no email or SMS delivery; notifications are in-app only. There is no integration with GRA identity (SSO) or HR/payroll systems.
- Approval has a single step. A multi-level chain (e.g. manager then HR) would need routes extended into ordered steps.
- Only *Annual Leave* is modelled. Sick, maternity and other leave types have different rules and are out of scope.
- Leave years follow the calendar year, and a request cannot cross 31 December.
- The `middleware.ts` check only looks for a session cookie. The real session and role checks run in every page and API handler.
- "Approved leave used" counts all approved leave. The dashboard shows separately how much of it has been taken to date.
- Uploaded files are checked for type, size and file signature, but not scanned for malware.
- Native date fields display in the browser's own locale format (e.g. mm/dd/yyyy in a US-English browser). The calendar is the main way to pick dates.

## Policies requiring confirmation before production

| # | Item | Prototype setting | Status |
|---|---|---|---|
| 1 | Annual entitlement by staff category | Senior 35, junior 28 working days | Proposed |
| 2 | Staff classification rules (who is "senior" or "junior"; other grades) | Two categories | Proposed |
| 3 | Scheduling window | February – November; January and December restricted | Proposed |
| 4 | Monthly capacity | Max 5 distinct employees per month, **organisation-wide** (not per department or office) | Proposed – confirm the scope |
| 5 | Whether pending plans and requests reserve capacity | Yes | Proposed |
| 6 | Carryover of unused leave | Disabled | Assumption |
| 7 | Approval routing and delegation of authority | Line manager; managers → HR; HR → HR | Assumption |
| 8 | Single-step vs multi-level approval | Single step | Assumption |
| 9 | Whether an approved master plan is required before any leave request | Required | Proposed |
| 10 | Leave types covered (sick, maternity, study, casual, etc.) | Annual Leave only | Assumption |
| 11 | Public holidays, including moveable Eid dates and observed dates | Seeded list marked "confirm" | Assumption |
| 12 | Whether leave may cross the leave year, and the year-end rules | Not allowed | Assumption |
| 13 | Overdue approval threshold | 5 days | Assumption |
| 14 | Cancellation of approved leave already started | HR only | Assumption |
| 15 | Statutory minimums (Labour Act 2003, Act 651) and public-service requirements | Not modelled | To verify |
| 16 | Data protection (Data Protection Act 2012, Act 843): retention, access, DPIA | Synthetic data only | To assess |
| 17 | Integration with GRA identity, HR and payroll systems | None | Requires organisational approval |

HR can configure items 1, 3–7, 10, 11 and 13 under **Policy Settings**, and can record each rule's status there as confirmed, proposed or assumption.
