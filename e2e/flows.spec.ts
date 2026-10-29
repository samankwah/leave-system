import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, loginAs, trackConsole } from "./helpers";

// Journeys share one fresh database (see scripts/e2e-server.mjs), so they run in order.
test.describe.configure({ mode: "serial" });

// Calendar day cells are labelled "1 Mar 2027. Available" / "8 Mar 2027, Independence Day…".
const day = (page: Page, label: string) => page.getByRole("button", { name: new RegExp(`^${label}[.,]`) }).first();
const monthTile = (page: Page, month: string) => page.getByRole("button", { name: new RegExp(`^${month} 2027:`) }).first();

async function signIn(page: Page, id: string) {
  await page.context().clearCookies();
  await loginAs(page, id);
}

async function confirmDecision(page: Page, button: RegExp, reason?: string) {
  await page.getByRole("button", { name: button }).first().click();
  const dialog = page.getByRole("dialog");
  if (reason) await dialog.getByRole("textbox").fill(reason);
  await dialog.getByRole("button", { name: button }).click();
  await expect(dialog).toBeHidden();
}

test("sign in with a demo persona, wrong password, and role redirects", async ({ page }) => {
  const done = trackConsole(page);
  await page.goto("/login");
  await page.getByLabel("Employee ID or email").fill("GRA-1001");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Invalid" })).toContainText("Invalid Employee ID/email or password");

  await page.getByRole("button", { name: /Use demo account Kofi Adjei/ }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back, Kofi" })).toBeVisible();

  await page.goto("/hr/policy");
  await expect(page).toHaveURL(/dashboard\?denied=1/);
  await expect(page.locator("#main").getByText("You don't have access to that page")).toBeVisible();

  const res = await page.request.post("/api/requests/1/decision", { data: { decision: "approve" } });
  expect(res.status()).toBe(403);
  done();
});

test("annual plan: restricted month, full month, then a valid plan is submitted", async ({ page }) => {
  const done = trackConsole(page);
  await signIn(page, "GRA-1007");
  await page.goto("/plan");
  await expect(page.getByRole("heading", { name: "2027 leave plan" })).toBeVisible();

  await monthTile(page, "January").click();
  await day(page, "11 Jan 2027").click();
  await expect(page.getByText("Leave Scheduling Restricted").first()).toBeVisible();
  await expect(page.getByText("Leave scheduling is available from February through November only. Please select an available period.").first()).toBeVisible();

  await monthTile(page, "April").click();
  await day(page, "5 Apr 2027").click();
  await day(page, "9 Apr 2027").click();
  await expect(page.getByText("⚠️ April Leave Limit Reached!")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to plan" })).toBeDisabled();

  await monthTile(page, "March").click();
  await day(page, "1 Mar 2027").click();
  await day(page, "12 Mar 2027").click();
  await page.getByRole("button", { name: "Add to plan" }).click();
  await monthTile(page, "May").click();
  await day(page, "4 May 2027").click();
  await day(page, "14 May 2027").click();
  await page.getByRole("button", { name: "Add to plan" }).click();

  await expect(page.getByText("All scheduling rules pass")).toBeVisible();
  await expect(page.getByText("● Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Submit plan" }).click();
  await expect(page.getByText("Plan submitted for approval.")).toBeVisible();
  await expect(page.getByText(/awaiting approval/i).first()).toBeVisible();
  done();
});

test("manager approves the plan; a 10-day March request is approved and the balance updates", async ({ page }) => {
  const done = trackConsole(page);
  await signIn(page, "GRA-7001");
  await page.goto("/approvals");
  await page.getByRole("option", { name: /Ama Darko/ }).click();
  await expect(page.getByText("All mandatory rules pass")).toBeVisible();
  await confirmDecision(page, /^Approve/);
  await expect(page.getByText(/Approve: Ama Darko's annual plan/)).toBeVisible();

  await signIn(page, "GRA-1001");
  await page.goto("/requests/new");
  await day(page, "1 Mar 2027").click();
  await day(page, "16 Mar 2027").click();
  await expect(page.getByText("1 Mar 2027 – 16 Mar 2027").first()).toBeVisible();
  await expect(page.getByText(/10 working days/).first()).toBeVisible();
  await page.getByRole("button", { name: "Review request" }).click();
  await expect(page.getByText("Validated on the server")).toBeVisible();
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/requests$/);
  await expect(page.getByText("Leave request submitted for approval.")).toBeVisible();

  await signIn(page, "GRA-7001");
  await page.goto("/approvals");
  await page.getByRole("option", { name: /Kofi Adjei/ }).click();
  await confirmDecision(page, /^Approve/);

  await signIn(page, "GRA-1001");
  await page.goto("/dashboard");
  await expect(page.locator("#main").getByText("Approved leave").locator("..").getByText("10", { exact: true })).toBeVisible();
  await expect(page.locator("#main").getByText("Available to book in 2027").locator("..").getByText("25", { exact: true })).toBeVisible();
  done();
});

test("return for revision, then revise and resubmit", async ({ page }) => {
  const done = trackConsole(page);
  await signIn(page, "GRA-7001");
  await page.goto("/approvals");
  await page.getByRole("option", { name: /Adwoa Sarpong/ }).click();
  await confirmDecision(page, /^Return/, "Please start on Tuesday 20 April instead.");

  await signIn(page, "GRA-1006");
  await page.goto("/requests");
  await page.getByRole("button", { name: /19 Apr 2027 – 23 Apr 2027/ }).click();
  await expect(page.getByText("Please start on Tuesday 20 April instead.")).toBeVisible();
  await page.getByRole("link", { name: "Revise and resubmit" }).click();
  await expect(page.getByRole("heading", { name: "Revise leave request" })).toBeVisible();
  await day(page, "20 Apr 2027").click();
  await day(page, "23 Apr 2027").click();
  await page.getByRole("button", { name: "Review request" }).click();
  await page.getByRole("button", { name: "Resubmit request" }).click();
  await expect(page.getByText("Request revised and resubmitted.")).toBeVisible();
  done();
});

test("plan amendment shows a diff and supersedes the approved version", async ({ page }) => {
  const done = trackConsole(page);
  await signIn(page, "GRA-1001");
  await page.goto("/plan");
  await page.getByRole("button", { name: "Request amendment" }).click();
  await expect(page.getByText("Amendment started")).toBeVisible();
  await page.getByRole("button", { name: "Remove 11 Oct 2027 – 22 Oct 2027" }).click();
  await expect(page.getByText("Removed")).toBeVisible();
  await monthTile(page, "November").click();
  await day(page, "8 Nov 2027").click();
  await day(page, "19 Nov 2027").click();
  await page.getByRole("button", { name: "Add to plan" }).click();
  await expect(page.getByText("New", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Submit amendment" }).click();
  await expect(page.getByText("Amendment submitted for approval.")).toBeVisible();

  await signIn(page, "GRA-7001");
  await page.goto("/approvals");
  await page.getByRole("option", { name: /Kofi Adjei.*Plan amendment/ }).click();
  await expect(page.getByText("Removed")).toBeVisible();
  await confirmDecision(page, /^Approve/);

  await signIn(page, "GRA-1001");
  await page.goto("/plan");
  await expect(page.getByText("Superseded").first()).toBeVisible();
  await expect(page.getByText("8 Nov 2027 – 19 Nov 2027").first()).toBeVisible();
  done();
});

test("HR: lowering capacity flags over-capacity months; exports download", async ({ page }) => {
  const done = trackConsole(page);
  await signIn(page, "GRA-8001");
  await page.goto("/hr/policy");
  const card = page.getByRole("region", { name: "Maximum distinct employees on leave per month" });
  await card.getByRole("spinbutton").fill("4");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Saved “Maximum distinct employees/)).toBeVisible();

  await page.goto("/hr/roster");
  await expect(page.locator("#main").getByText(/Over capacity after a policy change/)).toBeVisible();

  await page.goto("/hr/reports");
  await page.getByRole("button", { name: "Export" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /CSV/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/gra-leave-balances-2027\.csv/);

  // Restore the proposed default.
  await page.goto("/hr/policy");
  await card.getByRole("spinbutton").fill("5");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Saved “Maximum distinct employees/)).toBeVisible();
  done();
});

test("requests show their workflow; managers and HR see their team's leave", async ({ page }) => {
  const done = trackConsole(page);
  await signIn(page, "GRA-7001");
  await page.goto("/requests");
  const main = page.locator("#main");
  await expect(main.getByRole("img", { name: /^Request progress: Submitted, With HR, Decision \(to do\)/ })).toBeVisible();

  await page.goto("/team");
  await expect(main.getByRole("heading", { name: "Team leave" })).toBeVisible();
  await expect(main.getByRole("button", { name: /^Kwesi Appiah/ })).toHaveCount(0); // Customs reports to another manager
  await main.getByRole("button", { name: /^Akosua Boakye, 15 Mar/ }).click();
  const drawer = page.locator(".MuiDrawer-paper");
  await expect(drawer.getByText("Workflow")).toBeVisible();
  await expect(drawer.getByRole("list", { name: /^Request progress/ })).toContainText("Reviewed by Kwame Mensah");
  await expect(drawer.getByText(/Submitted Annual Leave/)).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/drawer-team-request.png" });
  await drawer.getByRole("button", { name: "Close" }).click();
  await main.getByRole("tab", { name: /Annual plans/ }).click();
  await expect(main.getByText("Kwabena Owusu")).toBeVisible();

  await signIn(page, "GRA-8001");
  await page.goto("/team");
  await expect(main.getByRole("button", { name: /^Kwesi Appiah/ })).toBeVisible();
  await main.getByRole("button", { name: /^Kwame Mensah/ }).click();
  await expect(page.locator(".MuiDrawer-paper").getByRole("link", { name: "Review in Approvals" })).toBeVisible();
  await page.goto("/requests");
  await expect(main.getByRole("img", { name: /Reviewed by Comfort Owusu-Ansah, Approved/ })).toBeVisible();
  done();
});

test("dark mode choice persists across reloads", async ({ page }) => {
  await signIn(page, "GRA-1002");
  await page.goto("/account");
  await page.getByRole("button", { name: "Dark theme" }).first().click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Light theme" }).first().click();
  await expect(page.locator("html")).toHaveClass(/light/);
});

test("top bar stays pinned while the page scrolls", async ({ page }) => {
  await signIn(page, "GRA-8001");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto("/hr/employees");
    // Keep scrolling until the page has moved (a single wheel can land before the table has laid out).
    await expect.poll(async () => { await page.mouse.wheel(0, 600); return page.evaluate(() => window.scrollY); }).toBeGreaterThan(300);
    const top = await page.locator("header").first().evaluate((el) => el.getBoundingClientRect().top);
    expect(top, `top bar at ${width}px`).toBe(0);
  }
});

test("phone width: no page scrolls horizontally", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const pages: Record<string, string[]> = {
    "GRA-1001": ["/dashboard", "/plan", "/requests/new", "/requests", "/calendar", "/notifications", "/account"],
    "GRA-7001": ["/team", "/requests"],
    "GRA-8001": ["/approvals", "/team", "/hr/employees", "/hr/roster", "/hr/reports", "/hr/policy", "/audit", "/calendar?view=team"],
    "GRA-9001": ["/admin"],
  };
  for (const [id, paths] of Object.entries(pages)) {
    await signIn(page, id);
    for (const p of paths) {
      await page.goto(p);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${p} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  }
  expect(PASSWORD).toBeTruthy();
});
