import { existsSync, readFileSync } from "node:fs";
import type { RuntimeSmokeStatus } from "@jarvis/core";

const DEFAULT_SMOKE_SUMMARY = "C:\\Users\\user\\Downloads\\Secretary Jarvis\\jarvis\\data\\smoke\\runtime-smoke-latest.json";

export function readRuntimeSmokeStatus(summaryPath = DEFAULT_SMOKE_SUMMARY): RuntimeSmokeStatus {
  if (!existsSync(summaryPath)) {
    return {
      ok: false,
      status: "missing",
      summaryPath,
      checks: [],
      message: "No runtime smoke summary has been written yet. Run npm run smoke:runtime.",
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(summaryPath, "utf8")) as {
      ok?: boolean;
      createdAt?: string;
      checks?: Array<{ name?: string; ok?: boolean; url?: string; statusCode?: number; error?: string }>;
    };
    const checks = (parsed.checks ?? []).map((check) => ({
      name: check.name ?? "Unnamed check",
      ok: Boolean(check.ok),
      url: check.url,
      statusCode: check.statusCode,
      error: check.error,
    }));
    const passed = Boolean(parsed.ok) && checks.every((check) => check.ok);
    return {
      ok: passed,
      status: passed ? "passed" : "failed",
      summaryPath,
      createdAt: parsed.createdAt,
      checks,
      message: passed ? "Latest runtime smoke passed." : "Latest runtime smoke summary contains a failed check.",
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      summaryPath,
      checks: [],
      message: `Could not read runtime smoke summary: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
