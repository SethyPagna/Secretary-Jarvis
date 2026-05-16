import { describe, expect, it } from "vitest";
import { seededStatus } from "@jarvis/core";
import { tryHandleSecurityCatalogRoute } from "../src/routes/securityCatalogRoutes.js";

describe("security catalog routes", () => {
  it("handles read-only security status and system actions", () => {
    const sent: Array<{ statusCode: number; body: unknown }> = [];
    const params = {
      method: "GET",
      status: seededStatus,
      sendJson: (statusCode: number, body: unknown) => sent.push({ statusCode, body }),
    };

    expect(tryHandleSecurityCatalogRoute({ ...params, pathname: "/api/security/status" })).toBe(true);
    expect(tryHandleSecurityCatalogRoute({ ...params, pathname: "/api/system/actions" })).toBe(true);
    expect(tryHandleSecurityCatalogRoute({ ...params, method: "POST", pathname: "/api/security/status" })).toBe(false);

    expect(sent[0]).toMatchObject({
      statusCode: 200,
      body: { privacyMode: "strict-local" },
    });
    expect(JSON.stringify(sent[0]?.body)).toContain("protected-core-access");
    expect(JSON.stringify(sent[1]?.body)).toContain("approved-admin");
    expect(JSON.stringify(sent[1]?.body)).toContain("undoWindowMinutes");
  });
});
