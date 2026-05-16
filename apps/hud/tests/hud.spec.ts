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
    if (route.request().url().endsWith("/api/runtime/constellation")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          constellation: {
            id: "runtime-constellation",
            localOnly: true,
            updatedAt: "2026-05-16T00:00:00.000Z",
            nodes: [
              { id: "models", label: "Models", kind: "models", status: "ready", value: "5/5", detail: "ready", tone: "cyan" },
              { id: "voice", label: "Voice", kind: "voice", status: "ready", value: "4 samples", detail: "ready", tone: "green" },
              { id: "vision", label: "Vision", kind: "vision", status: "ready-asset", value: "3 assets", detail: "ready", tone: "cyan" },
              { id: "privacy", label: "Privacy", kind: "privacy", status: "locked", value: "sealed", detail: "locked", tone: "magenta" },
              { id: "setup", label: "Setup", kind: "setup", status: "attention", value: "4 needed", detail: "needed", tone: "amber" },
            ],
            summary: { ready: 3, staged: 0, attention: 1, locked: 1 },
            note: "compact",
          },
        }),
      });
      return;
    }
    if (route.request().url().endsWith("/api/voice/readiness")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          readiness: {
            primaryStt: { id: "stt-whisper", label: "Whisper", kind: "stt", status: "ready-asset", installed: true, notes: [] },
            tts: [{ id: "tts-sapi", label: "SAPI", kind: "tts", status: "ready", installed: true, notes: [] }],
            fallbackStt: [],
            vad: { id: "vad", label: "VAD", kind: "vad", status: "staged", installed: false, notes: [] },
            wakeWord: { id: "wake", label: "Wake", kind: "wake-word", status: "missing", installed: false, notes: [] },
            identitySamples: Array.from({ length: 4 }, (_, index) => ({
              id: `sample-${index}`,
              label: `Sample ${index}`,
              kind: "identity-sample",
              status: "ready",
              installed: true,
              notes: [],
            })),
            summary: { sttReady: true, ttsReady: true, sampleCount: 4, missingRequired: 1 },
            privacy: { micCaptureActive: false, speakingActive: false, note: "test" },
          },
        }),
      });
      return;
    }
    if (route.request().url().endsWith("/api/setup/action-groups")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          groups: [
            {
              id: "setup-needed-feature-downloads",
              label: "Needed Feature Downloads",
              kind: "needed-feature-downloads",
              summary: "3 needed",
              items: [
                { id: "piper", label: "Piper", status: "needed" },
                { id: "ocr", label: "OCR", status: "needed" },
                { id: "maps", label: "Maps", status: "optional" },
              ],
            },
            {
              id: "setup-future-scaling-models",
              label: "Future Scaling Models",
              kind: "future-scaling-models",
              summary: "2 future",
              items: [
                { id: "deepseek", label: "DeepSeek", status: "future" },
                { id: "media", label: "Media Scale", status: "future" },
              ],
            },
          ],
        }),
      });
      return;
    }
    if (route.request().url().endsWith("/api/runtime/smoke-status")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          smoke: {
            ok: true,
            status: "passed",
            summaryPath: "data/smoke/runtime-smoke-latest.json",
            createdAt: "2026-05-16T00:00:00.000Z",
            checks: [
              { name: "Brain", ok: true, statusCode: 200 },
              { name: "Gateway", ok: true, statusCode: 200 },
              { name: "HUD", ok: true, statusCode: 200 },
            ],
            message: "Latest runtime smoke passed.",
          },
        }),
      });
      return;
    }
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
  await expect(panel.getByText("Model", { exact: true })).toBeVisible();
  await expect(panel.getByText("Tasks")).toBeVisible();
  await expect(panel.locator(".widget-grid")).toBeVisible();
  await expect(panel.getByLabel("Runtime constellation")).toContainText("5/5");
  await expect(panel.getByLabel("Runtime constellation")).toContainText("sealed");
  await expect(panel.getByLabel("Runtime constellation")).toContainText("4 needed");
  await expect(panel.getByLabel("Runtime smoke status")).toContainText("passed");
});

test("voice and text panels expose compact interaction states", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Jarvis controls" }).click();
  await page.getByTitle("Voice").click();

  const voicePanel = page.getByRole("dialog", { name: "Jarvis voice panel" });
  await expect(voicePanel).toBeVisible();
  await expect(voicePanel.getByText("Say a command...")).toBeVisible();
  await expect(voicePanel.getByLabel("Voice runtime readiness")).toContainText("ready-asset");
  await expect(voicePanel.getByLabel("Voice runtime readiness")).toContainText("4");
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

test("settings separates feature downloads from future scaling", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Jarvis controls" }).click();
  await page.getByTitle("Settings").click();

  const panel = page.getByRole("dialog", { name: "Jarvis settings panel" });
  await expect(panel.getByLabel("Setup action groups")).toContainText("2 needed");
  await expect(panel.getByLabel("Setup action groups")).toContainText("2 future");
});
