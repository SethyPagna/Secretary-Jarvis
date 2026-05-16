import { describe, expect, it } from "vitest";
import {
  agentProfilesFromSouls,
  agentsWithMemoryScope,
  agentsWithPermission,
  defaultAgentSouls,
  findAgentSoul,
  routeTaskToAgents,
} from "../src/agents.js";

describe("AgentOS souls", () => {
  it("defines the eight named Jarvis agent souls", () => {
    expect(defaultAgentSouls.map((soul) => soul.id)).toEqual([
      "jarvis",
      "friday",
      "daedalus",
      "argus",
      "mnemosyne",
      "sentinel",
      "vulcan",
      "hermes",
    ]);
  });

  it("creates runtime agent profiles from souls", () => {
    const profiles = agentProfilesFromSouls();
    expect(profiles).toHaveLength(8);
    expect(profiles.find((agent) => agent.id === "planner")?.name).toBe("Daedalus");
    expect(profiles.find((agent) => agent.id === "safety")?.name).toBe("Sentinel");
  });

  it("looks up souls by soul id, name, or runtime profile id", () => {
    expect(findAgentSoul("daedalus")?.name).toBe("Daedalus");
    expect(findAgentSoul("Sentinel")?.id).toBe("sentinel");
    expect(findAgentSoul("memory-curator")?.name).toBe("Mnemosyne");
  });

  it("filters by permissions and memory scope", () => {
    expect(agentsWithPermission("sensor-capture").map((agent) => agent.id)).toContain("argus");
    expect(agentsWithMemoryScope("identity").map((agent) => agent.id)).toContain("mnemosyne");
  });

  it("routes coding and vision work through specialist agents with Sentinel review", () => {
    expect(routeTaskToAgents("coding")).toMatchObject({
      primaryAgentId: "daedalus",
      reviewerAgentId: "sentinel",
    });
    expect(routeTaskToAgents("screen-vision")).toMatchObject({
      primaryAgentId: "argus",
      reviewerAgentId: "sentinel",
    });
  });
});
