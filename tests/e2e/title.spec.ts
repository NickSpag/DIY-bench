import { expect, test } from "@playwright/test";

test("page shows the title", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "DIY-bench" })).toBeVisible();
});
