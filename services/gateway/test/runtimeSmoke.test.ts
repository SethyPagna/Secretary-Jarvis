import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readRuntimeSmokeStatus } from "../src/runtimeSmoke.js";

describe("runtime smoke status", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "jarvis-smoke-status-"));
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("reports missing before a smoke summary exists", () => {
    const status = readRuntimeSmokeStatus(join(tempRoot, "missing.json"));

    expect(status.status).toBe("missing");
    expect(status.ok).toBe(false);
  });

  it("parses the latest smoke summary", () => {
    const summaryPath = join(tempRoot, "runtime-smoke-latest.json");
    writeFileSync(
      summaryPath,
      JSON.stringify({
        ok: true,
        createdAt: "2026-05-16T00:00:00.000Z",
        checks: [
          { name: "Gateway status", ok: true, url: "http://127.0.0.1:5317/api/status", statusCode: 200 },
          { name: "HUD renderer", ok: true, url: "http://127.0.0.1:5176/", statusCode: 200 },
        ],
      }),
    );

    const status = readRuntimeSmokeStatus(summaryPath);

    expect(status.status).toBe("passed");
    expect(status.checks).toHaveLength(2);
    expect(status.message).toContain("passed");
  });
});
