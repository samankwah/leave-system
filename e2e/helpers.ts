import { expect, type Page } from "@playwright/test";

export const PASSWORD = "Demo@2026";

/** Signs in through the API so tests start on an authenticated page quickly. */
export async function loginAs(page: Page, employeeId: string) {
  const res = await page.request.post("/api/auth/login", { data: { login: employeeId, password: PASSWORD } });
  expect(res.ok()).toBeTruthy();
}

/** Fails the test on any browser console error (including React hydration warnings). */
export function trackConsole(page: Page) {
  const errors: string[] = [];
  // Handled 4xx API responses (e.g. a deliberately wrong password or a rule violation) are expected, not errors.
  const expected = /Failed to load resource: the server responded with a status of 4(01|03|22)/;
  page.on("console", (m) => { if (m.type() === "error" && !expected.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  return () => expect(errors, errors.join("\n")).toEqual([]);
}
