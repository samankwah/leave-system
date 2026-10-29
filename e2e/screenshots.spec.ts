import { test } from "@playwright/test";
import { loginAs } from "./helpers";

// Visual sweep: every page per role, desktop + phone, light + dark. Run: npx playwright test screenshots
const PAGES: Record<string, string[]> = {
  "GRA-1001": ["dashboard", "plan", "requests/new", "requests", "calendar", "notifications", "account"],
  "GRA-1007": ["plan"],
  "GRA-7001": ["requests", "team"],
  "GRA-7002": ["approvals", "calendar", "requests"],
  "GRA-8001": ["approvals", "team", "requests", "calendar?view=team", "hr/employees", "hr/roster", "hr/reports", "hr/policy", "audit"],
  "GRA-9001": ["admin"],
};

for (const scheme of ["light", "dark"] as const) {
  for (const [label, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]] as const) {
    test(`screens ${scheme} ${label}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height });
      await page.goto("/login");
      await page.screenshot({ path: `e2e/screenshots/${scheme}-${label}-login.png`, fullPage: true });
      for (const [user, pages] of Object.entries(PAGES)) {
        await page.context().clearCookies();
        await loginAs(page, user);
        for (const p of pages) {
          await page.goto(`/${p}`);
          await page.waitForLoadState("networkidle");
          await page.screenshot({ path: `e2e/screenshots/${scheme}-${label}-${user}-${p.replace(/[/?=&]/g, "_")}.png`, fullPage: true });
        }
      }
    });
  }
}
