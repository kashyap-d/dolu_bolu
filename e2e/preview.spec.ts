import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

async function send(page: Page, message: string) {
  await page.getByLabel("Describe a Job Drive update").fill(message);
  await page.getByRole("button", { name: "Prepare update" }).click();
}

test("records an application, then merges an OA into the same drive", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Keep every hiring process moving." })).toBeVisible();

  await send(page, "I applied to Linear for Frontend Engineer yesterday.");
  const review = page.getByRole("heading", { name: "Move Linear · Frontend Engineer to Applied" });
  await expect(review).toBeVisible();
  await expect(page.getByText("“Linear”")).toBeVisible();
  await page.getByRole("button", { name: "Confirm update" }).click();
  await expect(page.getByText("Linear saved from your confirmed proposal.")).toBeVisible();
  await expect(review).toBeHidden();

  await send(page, "OA at Linear for Frontend Engineer tomorrow.");
  await page.getByRole("button", { name: "Confirm update" }).click();
  await expect(page.getByText("Linear saved from your confirmed proposal.")).toBeVisible();

  // The agenda groups it under tomorrow, in the viewer's own time zone.
  const agenda = page.locator("section", { hasText: "What needs you" });
  await expect(agenda.getByText("Tomorrow")).toBeVisible();
  await expect(agenda.getByRole("button", { name: /OA opens · Linear/ })).toBeVisible();

  await page.getByRole("button", { name: "View Drives" }).click();
  await expect(page.getByRole("heading", { name: "Job Drives" })).toBeVisible();
  await expect(page.getByText("1 hiring process")).toBeVisible();
  await page.getByRole("button", { name: /Linear/ }).click();

  await expect(page.getByRole("heading", { name: "Linear" })).toBeVisible();
  await expect(page.getByText("Applied → Assessment / OA")).toBeVisible();
  await expect(page.getByText("Created at Applied")).toBeVisible();
});

test("asks for clarification instead of guessing", async ({ page }) => {
  await page.goto("/");
  // Account settings only exist for a signed-in, stored workspace.
  await expect(page.getByRole("button", { name: "Your data" })).toHaveCount(0);
  await send(page, "I reached the next round.");
  await expect(page.getByText("One detail first")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm update" })).toHaveCount(0);
});

test("refuses autonomous actions", async ({ page }) => {
  await page.goto("/");
  await send(page, "Apply automatically to Acme for Backend Engineer.");
  await expect(page.getByText(/cannot delete data, send messages, or apply autonomously/)).toBeVisible();
});

test("adds a drive manually and records a backward move as a correction", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add manually" }).click();
  await page.getByLabel("Company").fill("Globex");
  await page.getByLabel("Role", { exact: true }).fill("SDE 1");
  await page.getByRole("button", { name: /Interview/ }).first().click();
  // Choosing the interview stage starts a first round to fill in.
  await page.getByLabel("Round", { exact: true }).fill("Technical 1");
  await page.getByLabel("Kind").selectOption("technical");
  await page.getByRole("button", { name: "Add round" }).click();
  await page.getByLabel("Round", { exact: true }).nth(1).fill("HR");
  await page.getByLabel(/Applied on/).fill("2026-10-01");
  // A date-only value shown in the list: it must render the same on server and client.
  await page.getByLabel(/Apply by/).fill("2026-12-01");
  await page.getByRole("button", { name: "Save Job Drive" }).click();
  await expect(page.getByText("Globex added.")).toBeVisible();

  await page.getByRole("button", { name: "View Drives" }).click();
  await expect(page.getByText("Apply by")).toBeVisible();
  await page.getByRole("button", { name: /Globex/ }).click();
  // A date-only value must not move a day in any time zone.
  await expect(page.locator("p", { hasText: "Applied:" })).toContainText(/1 Oct 2026|Oct 1, 2026/);
  const rounds = page.getByRole("region", { name: "Interview rounds" }).or(page.locator("section", { hasText: "Interview rounds" }));
  await expect(rounds.getByText("Technical 1")).toBeVisible();
  await expect(rounds.getByText("HR", { exact: true })).toBeVisible();

  await page.getByRole("group", { name: "Hiring stage" }).getByRole("button", { name: /Applied/ }).click();
  await expect(page.getByText("This will be recorded as an explicit correction.")).toBeVisible();
  await page.getByRole("button", { name: "Save audited correction" }).click();
  await expect(page.getByText("Correction saved and recorded in the activity history.")).toBeVisible();
  await expect(page.getByText("Interview → Applied")).toBeVisible();
});

test("shows field errors without losing input", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add manually" }).click();
  await page.getByLabel("Company").fill("Initech");
  await page.getByLabel(/Job posting URL/).fill("not a url");
  await page.getByRole("button", { name: "Save Job Drive" }).click();
  await expect(page.getByText("Please correct the highlighted fields.")).toBeVisible();
  await expect(page.getByLabel("Company")).toHaveValue("Initech");
});
