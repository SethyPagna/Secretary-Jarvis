import { describe, expect, it } from "vitest";
import { buildArchitectureMap } from "../src/architectureMap.js";

describe("architecture map", () => {
  it("describes the local multi-language runtime hierarchy", () => {
    const map = buildArchitectureMap("2026-05-16T00:00:00.000Z");

    expect(map.localFirst).toBe(true);
    expect(map.subsystems.map((subsystem) => subsystem.id)).toEqual(
      expect.arrayContaining(["hud", "gateway", "python-brain", "native-inference", "startup"]),
    );
    expect(map.languageStrategy.find((entry) => entry.language === "TypeScript")?.bestAt).toContain("HUD");
    expect(map.languageStrategy.find((entry) => entry.language === "Python")?.avoidFor).toContain("UI animation");
    expect(map.improvementBacklog.join(" ")).toContain("code health scanner");
    expect(map.subsystems.find((subsystem) => subsystem.id === "gateway")?.hardeningNotes.join(" ")).toContain("policy");
  });
});
