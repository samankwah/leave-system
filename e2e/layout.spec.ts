import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

for (const width of [1920, 1440, 1280, 390]) {
  test(`month strip fits its card at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await loginAs(page, "GRA-8001");
    for (const path of ["/plan", "/dashboard", "/calendar"]) {
      await page.goto(path);
      const strip = page.getByRole("button", { name: /^December 2027:/ }).first();
      const card = strip.locator("xpath=ancestor::*[contains(@class,'MuiPaper-root')][1]");
      const [s, c] = await Promise.all([strip.boundingBox(), card.boundingBox()]);
      expect(s!.x + s!.width, `${path} @${width}: Dec tile inside its card`).toBeLessThanOrEqual(c!.x + c!.width - 8);

    }
  });
}
