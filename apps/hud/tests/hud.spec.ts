import { expect, test } from "playwright/test";
import { seededStatus } from "@jarvis/core";

async function mockGateway(page: import("playwright/test").Page) {
  await page.route("http://127.0.0.1:4317/api/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(seededStatus),
    });
  });
  await page.route("http://127.0.0.1:4317/api/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockGateway(page);
});

test("idle HUD renders a centered orb without opening panels", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/");

  const stage = page.getByLabel("Jarvis centered HUD");
  const orb = page.getByRole("button", { name: "Open Jarvis controls" });
  await expect(stage).toBeVisible();
  await expect(orb).toBeVisible();
  await expect(page.getByRole("dialog", { name: /Jarvis dashboard panel/i })).toHaveCount(0);

  const orbBox = await orb.boundingBox();
  const viewport = page.viewportSize();
  expect(orbBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(Math.abs((orbBox!.x + orbBox!.width / 2) - viewport!.width / 2)).toBeLessThan(8);
  expect(Math.abs((orbBox!.y + orbBox!.height / 2) - viewport!.height / 2)).toBeLessThan(8);
  expect(consoleErrors).toEqual([]);
});

test("orb click opens radial controls and dashboard stays grouped", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Jarvis controls" }).click();

  for (const title of ["Dashboard", "Voice", "Text", "Workflows", "Devices", "Settings"]) {
    await expect(page.getByTitle(title)).toBeVisible();
  }

  await page.getByTitle("Dashboard").click();
  const panel = page.getByRole("dialog", { name: "Jarvis dashboard panel" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Dashboard")).toBeVisible();
  await expect(panel.getByText("Model")).toBeVisible();
  await expect(panel.getByText("Tasks")).toBeVisible();
  await expect(panel.locator(".widget-grid")).toBeVisible();
});

test("voice and text panels expose compact interaction states", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Jarvis controls" }).click();
  await page.getByTitle("Voice").click();

  const voicePanel = page.getByRole("dialog", { name: "Jarvis voice panel" });
  await expect(voicePanel).toBeVisible();
  await expect(voicePanel.getByText("Say a command...")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop speaking" })).toBeVisible();

  await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Open Jarvis controls" }).click();
  await page.getByTitle("Text").click();
  await expect(page.getByPlaceholder("Ask Jarvis anything...")).toBeFocused();
});

test("mobile HUD avoids horizontal overflow with open radial menu and panel", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Jarvis controls" }).click();
  await expect(page.getByTitle("Dashboard")).toBeVisible();

  const radialOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(radialOverflow).toBeLessThanOrEqual(1);

  await page.getByTitle("Devices").click();
  await expect(page.getByRole("dialog", { name: "Jarvis devices panel" })).toBeVisible();
  const panelOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(panelOverflow).toBeLessThanOrEqual(1);
});
