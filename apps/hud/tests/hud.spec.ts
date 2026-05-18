import { expect, test } from "playwright/test";
import { seededStatus } from "@jarvis/core";

async function mockGateway(page: import("playwright/test").Page) {
  await page.route("http://127.0.0.1:4317/api/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...seededStatus, pendingApprovals: [] }),
    });
  });
  await page.route("http://127.0.0.1:4317/api/events", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: ": connected\n\n",
    });
  });
  await page.route("http://127.0.0.1:4317/api/**", async (route) => {
    if (route.request().url().endsWith("/api/events")) {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        body: ": connected\n\n",
      });
      return;
    }
    if (route.request().url().endsWith("/api/status")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...seededStatus, pendingApprovals: [] }),
      });
      return;
    }
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
            tts: [
              { id: "tts-kokoro-82m", label: "Kokoro-82M", kind: "tts", status: "missing", installed: false, notes: [] },
              { id: "tts-sapi", label: "SAPI", kind: "tts", status: "ready", installed: true, notes: [] },
              { id: "tts-omnivoice", label: "OmniVoice", kind: "tts", status: "missing", installed: false, notes: [] },
            ],
            ttsPreferredEngine: "tts-sapi",
            fallbackStt: [],
            vad: { id: "vad", label: "VAD", kind: "vad", status: "staged", installed: false, notes: [] },
            wakeWord: { id: "wake", label: "Wake", kind: "wake-word", status: "missing", installed: false, notes: [] },
            wakeState: "push-to-talk",
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
    if (route.request().url().endsWith("/api/voice/session")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          voiceSession: {
            id: "voice-session-ui",
            state: "listening",
            sttEngineId: "whisper-large-v3-turbo",
            ttsEngineId: "windows-sapi",
            vadEnabled: true,
            transcript: [
              {
                id: "chunk-ui",
                text: "Jarvis status",
                startMs: 0,
                endMs: 800,
                confidence: 0.9,
                engineId: "hud-manual",
                final: true,
              },
            ],
            updatedAt: "2026-05-16T00:00:00.000Z",
            message: "Transcript ready to send.",
          },
        }),
      });
      return;
    }
    if (route.request().url().endsWith("/api/voice/agent-matrix")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          matrix: {
            generatedAt: "2026-05-16T00:00:00.000Z",
            localOnly: true,
            entries: [
              { agentId: "jarvis", agentName: "Jarvis", status: "ready", enginePreference: "voice-sample", ttsRequest: { agentId: "jarvis", voiceProfileId: "voice-profile-jarvis", text: "Systems are online." } },
              { agentId: "friday", agentName: "Friday", status: "ready", enginePreference: "windows-sapi", ttsRequest: { agentId: "friday", voiceProfileId: "voice-profile-friday", text: "Your brief is ready." } },
              { agentId: "daedalus", agentName: "Daedalus", status: "ready", enginePreference: "windows-sapi", ttsRequest: { agentId: "daedalus", voiceProfileId: "voice-profile-daedalus", text: "Repository map ready." } },
              { agentId: "argus", agentName: "Argus", status: "staged", enginePreference: "future-clone", ttsRequest: { agentId: "argus", voiceProfileId: "voice-profile-argus", text: "Visual context locked." } },
              { agentId: "mnemosyne", agentName: "Mnemosyne", status: "staged", enginePreference: "future-clone", ttsRequest: { agentId: "mnemosyne", voiceProfileId: "voice-profile-mnemosyne", text: "Memory ready." } },
              { agentId: "sentinel", agentName: "Sentinel", status: "ready", enginePreference: "windows-sapi", ttsRequest: { agentId: "sentinel", voiceProfileId: "voice-profile-sentinel", text: "Approval required." } },
              { agentId: "vulcan", agentName: "Vulcan", status: "ready", enginePreference: "windows-sapi", ttsRequest: { agentId: "vulcan", voiceProfileId: "voice-profile-vulcan", text: "Systems staged." } },
              { agentId: "hermes", agentName: "Hermes", status: "staged", enginePreference: "future-clone", ttsRequest: { agentId: "hermes", voiceProfileId: "voice-profile-hermes", text: "Draft ready." } },
            ],
            summary: { agents: 8, distinctProfiles: 8, ready: 5, staged: 3, missing: 0, ttsReady: true },
            note: "distinct voices",
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
    if (route.request().url().endsWith("/api/setup/plugin-slots")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          manifest: {
            slots: [
              {
                id: "feature-piper",
                label: "Piper executable and one voice",
                status: "missing",
                expectedPath: "C:/Users/user/Downloads/Secretary Jarvis/tools/piper",
                validationHint: "Expected: piper.exe plus at least one voice.",
              },
              {
                id: "feature-vosk",
                label: "Vosk streaming STT model",
                status: "optional",
                expectedPath: "C:/Users/user/Downloads/Secretary Jarvis/models/vosk",
                validationHint: "Expected: extracted Vosk model files.",
              },
            ],
          },
        }),
      });
      return;
    }
    if (route.request().url().endsWith("/api/setup/install-plans")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          manifest: {
            plans: [
              {
                id: "install-feature-piper",
                label: "Piper executable and one voice",
                status: "missing",
                approvalRequired: true,
                commandPreview: "manual extract: place piper.exe under tools/piper",
                rollbackNote: "Remove the extracted Piper folder.",
              },
              {
                id: "install-feature-vosk",
                label: "Vosk streaming STT model",
                status: "optional",
                approvalRequired: true,
                commandPreview: "manual extract: place a Vosk model folder",
                rollbackNote: "Remove the Vosk model folder.",
              },
            ],
          },
        }),
      });
      return;
    }
    if (route.request().url().endsWith("/api/architecture/map")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          architecture: {
            stackSummary: "TypeScript gateway and HUD, Python brain, native inference, and PowerShell startup.",
            subsystems: [{ id: "hud" }, { id: "gateway" }, { id: "python-brain" }, { id: "startup" }],
            languageStrategy: [{ language: "TypeScript" }, { language: "Python" }, { language: "Native/C++" }],
            improvementBacklog: ["Split oversized gateway routes.", "Share compact HUD cards."],
          },
        }),
      });
      return;
    }
    if (route.request().url().endsWith("/api/architecture/code-health")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          codeHealth: {
            scannedFiles: 144,
            oversizedFiles: [{ path: "services/gateway/src/server.ts" }],
            duplicateBasenames: [{ name: "App.tsx" }],
            staleMarkers: [{ path: "apps/hud/src/HudApp.tsx" }],
            cleanupBacklog: ["Split oversized route/service files only after endpoint tests are in place."],
          },
        }),
      });
      return;
    }
    if (route.request().url().endsWith("/api/runtime/startup-readiness")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          startup: {
            summary: {
              startupConfigured: true,
              scriptsReady: true,
              backgroundPidFiles: 4,
              runningPidFiles: 3,
            },
            authority: { highTrustMode: "approved-admin-ready" },
          },
        }),
      });
      return;
    }
    if (route.request().url().endsWith("/api/security/authority-readiness")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authority: {
            mode: "approved-admin-ready",
            actionSummary: {
              approvalRequired: 9,
              adminApproved: 2,
              reversible: 6,
            },
            blockedCategories: ["protected-core-access"],
            guardrails: ["Protected core code, safeguards, secrets, and raw model internals are denied to runtime agents."],
          },
        }),
      });
      return;
    }
    if (route.request().url().endsWith("/api/runtime/process-visibility")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          visibility: {
            summary: { tracked: 5, alive: 3, visibleInTaskManager: 3 },
            services: [
              { id: "brain", label: "Python Brain", pidAlive: true, taskManagerGroup: "Background processes" },
              { id: "gateway", label: "Gateway", pidAlive: true, taskManagerGroup: "Background processes" },
              { id: "electron-hud", label: "Electron HUD", pidAlive: true, taskManagerGroup: "Apps" },
            ],
          },
        }),
      });
      return;
    }
    if (route.request().url().endsWith("/api/runtime/startup-registration-plans")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          manifest: {
            plans: [
              { id: "startup-shortcut", label: "Standard startup shortcut", mode: "standard", runLevel: "limited", status: "ready", approvalRequired: true },
              { id: "scheduled-task-elevated", label: "Approved-admin scheduled task", mode: "approved-admin", runLevel: "highest", status: "ready", approvalRequired: true },
            ],
          },
        }),
      });
      return;
    }
    if (route.request().url().endsWith("/api/runtime/packaging-readiness")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          packaging: {
            electron: {
              commands: ["npm.cmd run dev:hud", "npm.cmd run start:hud", "npm.cmd run package:hud", "npm.cmd run dist:hud"],
            },
            backgroundRuntime: {
              wakeMethods: [
                { id: "tray-open-hud", label: "Tray", status: "ready" },
                { id: "orb-click", label: "Orb", status: "ready" },
                { id: "hotword", label: "Hotword", status: "staged" },
              ],
            },
            summary: {
              electronShellReady: true,
              startupScriptsReady: true,
              productionCommandsReady: true,
            },
          },
        }),
      });
      return;
    }
    if (route.request().url().endsWith("/api/runtime/activation-readiness")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          activation: {
            wake: {
              summary: { ready: 3, staged: 1, approvalGated: 1 },
            },
            voice: {
              primaryStt: "ready",
              vad: "staged",
              wakeWord: "missing",
            },
            ollama: {
              status: "found-off-path",
              repairCommands: ["& \"C:\\Users\\user\\AppData\\Local\\Programs\\Ollama\\ollama.exe\" list"],
              note: "Ollama found off PATH.",
            },
            summary: {
              localModelAdaptersReady: 1,
            },
            recommendations: ["Use tray/orb wake for reliable background access today."],
          },
        }),
      });
      return;
    }
    if (route.request().url().endsWith("/api/agents/manager-readiness")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          manager: {
            manager: {
              connected: true,
              managerAgentId: "jarvis",
              workflowId: "workflow-cto-orchestrator",
            },
            agents: [
              { id: "jarvis", name: "Jarvis", voiceStatus: "ready", voiceStyle: "calm cinematic command voice" },
              { id: "friday", name: "Friday", voiceStatus: "ready", voiceStyle: "warm operations secretary" },
              { id: "daedalus", name: "Daedalus", voiceStatus: "ready", voiceStyle: "precise technical architect" },
              { id: "argus", name: "Argus", voiceStatus: "staged", voiceStyle: "quiet visual observer" },
              { id: "mnemosyne", name: "Mnemosyne", voiceStatus: "staged", voiceStyle: "soft archivist cadence" },
              { id: "sentinel", name: "Sentinel", voiceStatus: "ready", voiceStyle: "firm safety reviewer" },
              { id: "vulcan", name: "Vulcan", voiceStatus: "ready", voiceStyle: "grounded system operator" },
              { id: "hermes", name: "Hermes", voiceStatus: "staged", voiceStyle: "smooth diplomatic messenger" },
            ],
            voices: {
              totalAgents: 8,
              profiles: 8,
              coveredAgents: 8,
              distinctProfileCount: 8,
              ready: 5,
              staged: 3,
              missing: 0,
            },
            routing: [],
            workflowAutonomy: {
              workflows: 4,
              generatedWorkflows: 1,
              enabledWorkflows: 3,
              approvalGatedSteps: 3,
              blockedSteps: 0,
              managerWorkflowReady: true,
              automationNote: "Generated workflows remain approval-gated before execution.",
            },
            responseHealth: {
              runningTasks: 0,
              queuedItems: 0,
              waitingApprovals: 0,
              activeWorkflowRuns: 0,
              freezeRisk: "low",
              note: "Queue and workflow response paths are ready.",
            },
            summary: {
              agentsReady: 8,
              voicesCovered: true,
              managerConnected: true,
              workflowsApprovalGated: true,
              responsePathHealthy: true,
            },
            recommendations: [],
          },
        }),
      });
      return;
    }
    if (route.request().url().endsWith("/api/runtime/interaction-health")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          interaction: {
            generatedAt: "2026-05-16T00:00:00.000Z",
            localOnly: true,
            surfaces: [
              { id: "text", label: "Text", status: "ready", detail: "Text commands queue into Jarvis." },
              { id: "voice", label: "Voice", status: "ready", detail: "Voice sessions are wired." },
              { id: "workflow-generate", label: "Generate", status: "ready", detail: "Workflow drafts are approval-gated." },
              { id: "workflow-execute", label: "Execute", status: "ready", detail: "Enabled workflows can run with policy checks." },
              { id: "editing", label: "Editing", status: "ready", detail: "Edits are checkpointed." },
              { id: "undo", label: "Undo", status: "ready", detail: "Undo journal is ready." },
              { id: "approvals", label: "Approvals", status: "ready", detail: "No backlog." },
              { id: "emergency-stop", label: "Stop", status: "ready", detail: "Emergency stop is wired." },
            ],
            metrics: {
              runningTasks: 0,
              queuedItems: 1,
              waitingApprovals: 0,
              activeWorkflowRuns: 0,
              generatedWorkflows: 1,
              enabledWorkflows: 4,
              availableUndos: 0,
            },
            summary: {
              responsive: true,
              canTalkWhileWorking: true,
              workflowAutonomyApprovalGated: true,
              editingUndoReady: true,
              freezeRisk: "low",
            },
            recommendations: [],
          },
        }),
      });
      return;
    }
    if (route.request().url().endsWith("/api/runtime/self-test")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          selfTest: {
            generatedAt: "2026-05-16T00:00:00.000Z",
            localOnly: true,
            summary: { ready: 5, attention: 2, blocked: 0, staged: 0, connected: true, topStatus: "attention" },
            checks: [
              { id: "model-adapters", label: "Models", status: "attention", value: "1 adapter", detail: "Ollama found off PATH.", fixIds: ["fix-ollama-path"] },
              { id: "wake-voice", label: "Voice", status: "attention", value: "3/1 wake", detail: "Hotword staged.", fixIds: ["fix-hotword-enable"] },
              { id: "agent-manager", label: "Agents", status: "ready", value: "8 agents", detail: "Manager connected.", fixIds: [] },
              { id: "workflow-interaction", label: "Workflow", status: "ready", value: "0/1 queue", detail: "Queue responsive.", fixIds: [] },
              { id: "background-services", label: "Services", status: "attention", value: "3/5 online", detail: "Some services are offline.", fixIds: ["fix-start-runtime"] },
            ],
            fixes: [
              {
                id: "fix-ollama-path",
                label: "Ollama PATH",
                category: "models",
                status: "dry-run",
                detail: "Preview adding Ollama to User PATH.",
                dryRunEndpoint: "/api/runtime/adapter-repair/dry-run",
                dryRunPayload: { repair: "ollama-path" },
              },
              {
                id: "fix-hotword-enable",
                label: "Wake word",
                category: "voice",
                status: "approval-required",
                detail: "Enable continuous wake after assets validate.",
                dryRunEndpoint: "/api/runtime/adapter-repair/dry-run",
                dryRunPayload: { repair: "hotword-enable" },
              },
              {
                id: "fix-start-runtime",
                label: "Start runtime",
                category: "startup",
                status: "dry-run",
                detail: "Preview starting all runtime services.",
                dryRunEndpoint: "/api/runtime/control/dry-run",
                dryRunPayload: { control: "start", target: "all" },
              },
            ],
            recommendations: ["Review 2 attention item(s) from the compact fix strip."],
          },
        }),
      });
      return;
    }
    if (route.request().method() === "GET" && route.request().url().endsWith("/api/runtime/attention")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          attention: {
            generatedAt: "2026-05-16T00:00:00.000Z",
            localOnly: true,
            summary: { ready: 2, attention: 3, blocked: 1, staged: 2 },
            priority: [
              { id: "attention-whisper-python-runtime", category: "voice", label: "Whisper STT runtime", state: "attention" },
              { id: "attention-tts-kokoro-82m", category: "voice", label: "Kokoro neural TTS", state: "attention" },
              { id: "attention-model-ready-gemma-26b", category: "models", label: "Gemma 26B", state: "blocked" },
            ],
            note: "Runtime attention is read-only; commands are previews.",
          },
        }),
      });
      return;
    }
    if (route.request().method() === "POST" && route.request().url().includes("/api/runtime/attention/attention-tts-kokoro-82m/dry-run")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          dryRun: {
            itemId: "attention-tts-kokoro-82m",
            decision: "requires_approval",
            risk: "approval-required",
            commandPreview: "hf download hexgrad/Kokoro-82M --local-dir C:/models/hexgrad__Kokoro-82M",
            message: "Preview only; use HF_TOKEN from the environment.",
            dataTouched: ["models/huggingface/snapshots/hexgrad__Kokoro-82M"],
            localOnly: true,
          },
        }),
      });
      return;
    }
    if (route.request().method() === "GET" && route.request().url().endsWith("/api/runtime/live-test/latest")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          liveTest: {
            ok: true,
            status: "ready",
            summaryPath: "data/smoke/runtime-live-latest.json",
            createdAt: "2026-05-16T00:00:00.000Z",
            completedAt: "2026-05-16T00:00:04.000Z",
            checks: [
              { name: "Python Brain root", ok: true, detail: "HTTP heartbeat responded." },
              { name: "Gateway root", ok: true, detail: "HTTP heartbeat responded." },
              { name: "Live text chat", ok: true, detail: "Jarvis app connected." },
            ],
            message: "Jarvis production live test passed.",
          },
        }),
      });
      return;
    }
    if (route.request().method() === "POST" && route.request().url().endsWith("/api/runtime/live-test")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          liveTest: {
            ok: true,
            status: "ready",
            summaryPath: "data/smoke/runtime-live-latest.json",
            checks: [
              { name: "Python Brain root", ok: true, detail: "HTTP heartbeat responded." },
              { name: "Gateway root", ok: true, detail: "HTTP heartbeat responded." },
              { name: "Live text chat", ok: true, detail: "Jarvis app connected." },
            ],
            message: "Jarvis production live test passed.",
          },
        }),
      });
      return;
    }
    if (route.request().method() === "GET" && (route.request().url().endsWith("/api/workflows") || route.request().url().endsWith("/api/workflows/studio"))) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          workflows: [
            {
              id: "workflow-generated-ui",
              name: "Generated inbox triage",
              description: "Drafted automation proposal for local review.",
              version: 1,
              owner: "generated",
              enabled: false,
              taskProfile: "daily-assistant",
              tags: ["generated", "approval"],
              steps: [
                {
                  id: "step-review",
                  kind: "approval",
                  title: "Owner approval",
                  summary: "Review generated workflow before enabling.",
                  requiresApproval: true,
                  reversible: false,
                  expectedInputs: [],
                  expectedOutputs: ["approval"],
                },
              ],
            },
          ],
          runs: [],
          dryRuns: [
            {
              workflowId: "workflow-generated-ui",
              risk: "approval-required",
              runnable: true,
              approvalStepIds: ["step-review"],
              blockedStepIds: [],
              validationIssues: [],
              steps: [
                {
                  stepId: "step-review",
                  title: "Owner approval",
                  kind: "approval",
                  risk: "approval-required",
                  decision: "requires_approval",
                  note: "Owner approval required.",
                },
              ],
            },
          ],
          layouts: {
            "workflow-generated-ui": {
              workflowId: "workflow-generated-ui",
              zoom: 1,
              updatedAt: "2026-05-16T00:00:00.000Z",
              nodes: {
                trigger: { x: 48, y: 210 },
                "step-review": { x: 268, y: 108 },
              },
            },
          },
          palette: ["trigger", "agent", "condition", "memory", "connector", "system-action", "approval", "sub-workflow"],
        }),
      });
      return;
    }
    if (route.request().method() === "POST" && route.request().url().includes("/api/workflows/workflow-generated-ui/layout")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Workflow canvas layout saved locally." }),
      });
      return;
    }
    if (route.request().method() === "POST" && route.request().url().includes("/api/workflows/workflow-generated-ui/draft-edit")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Draft edit saved locally and disabled until owner approval." }),
      });
      return;
    }
    if (route.request().method() === "POST" && route.request().url().endsWith("/api/workflows/generate")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          workflow: {
            id: "workflow-generated-proposal",
            name: "Generated morning brief",
            description: "Jarvis drafted a brief workflow for approval.",
            version: 1,
            owner: "generated",
            enabled: false,
            taskProfile: "daily-assistant",
            tags: ["generated", "brief"],
            steps: [
              {
                id: "step-owner-approval",
                kind: "approval",
                title: "Owner approval",
                summary: "Owner reviews this automation before enabling.",
                requiresApproval: true,
                reversible: false,
                expectedInputs: [],
                expectedOutputs: ["approval"],
              },
            ],
          },
          dryRun: {
            workflowId: "workflow-generated-proposal",
            risk: "approval-required",
            runnable: true,
            approvalStepIds: ["step-owner-approval"],
            blockedStepIds: [],
            validationIssues: [],
            steps: [
              {
                stepId: "step-owner-approval",
                title: "Owner approval",
                kind: "approval",
                risk: "approval-required",
                decision: "requires_approval",
                note: "Owner approval required.",
              },
            ],
          },
          note: "Generated locally as a disabled draft until approved.",
        }),
      });
      return;
    }
    if (route.request().method() === "POST" && route.request().url().endsWith("/api/workflows")) {
      const payload = route.request().postDataJSON() as { workflow?: { enabled?: boolean; owner?: string } };
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          saved: true,
          workflow: payload.workflow,
          approvalGated: payload.workflow?.owner === "generated" && payload.workflow.enabled === false,
        }),
      });
      return;
    }
    if (route.request().method() === "POST" && route.request().url().endsWith("/api/runtime/control/dry-run")) {
      const payload = route.request().postDataJSON() as { control?: string };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          dryRun: {
            id: "runtime-control-ui",
            control: payload.control ?? "start",
            target: "all",
            commandPreview: "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-jarvis.ps1",
            reversible: true,
            action: { id: "approval-runtime", title: "Start Jarvis runtime" },
            decision: {
              decision: "requires_approval",
              risk: "approval-required",
              reasons: ["Runtime controls are approval-gated."],
            },
            dataTouched: ["local runtime process state"],
            message: "Dry-run only. Owner approval is required before changing runtime services.",
          },
        }),
      });
      return;
    }
    if (route.request().method() === "POST" && route.request().url().endsWith("/api/runtime/adapter-repair/dry-run")) {
      const payload = route.request().postDataJSON() as { repair?: string };
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          dryRun: {
            id: "adapter-repair-ui",
            repair: payload.repair ?? "ollama-path",
            label: "Repair Ollama PATH",
            commandPreview: "[Environment]::SetEnvironmentVariable('Path', $env:Path + ';C:\\Ollama', 'User')",
            reversible: true,
            action: { id: "approval-adapter-repair", title: "Repair Ollama PATH" },
            decision: {
              decision: "requires_approval",
              risk: "approval-required",
              reasons: ["run-script is approval gated"],
            },
            dataTouched: ["User PATH environment variable"],
            notes: ["Dry-run only."],
            message: "Dry-run only. Owner approval is required before repairing this runtime adapter.",
          },
        }),
      });
      return;
    }
    if (route.request().method() === "POST" && route.request().url().endsWith("/api/audio/tts")) {
      const payload = route.request().postDataJSON() as { agentId?: string };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          tts: {
            requestId: "tts-ui",
            status: "ready",
            engine: "voice-sample",
            agent: { id: payload.agentId ?? "jarvis" },
          },
        }),
      });
      return;
    }
    if (route.request().method() === "POST" && route.request().url().includes("/api/setup/install-plans/install-feature-piper/dry-run")) {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          dryRun: {
            decision: {
              decision: "requires_approval",
              risk: "approval-required",
              reasons: ["model-download is approval gated"],
            },
            notes: ["Dry-run only: no installer was launched."],
          },
        }),
      });
      return;
    }
    if (route.request().method() === "POST" && route.request().url().endsWith("/api/chat")) {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          conversation: { id: "conversation-ui", title: "Check status" },
          task: {
            id: "task-ui-command",
            title: "Check status",
            status: "queued",
            taskProfile: "daily-assistant",
          },
          queued: { kind: "queued", message: "Task queued and ready for local execution." },
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
    if (route.request().url().endsWith("/api/runtime/services")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          runtime: {
            localOnly: true,
            checkedAt: "2026-05-16T00:00:00.000Z",
            services: [
              { id: "brain", label: "Python Brain", status: "online", pidAlive: true, httpOk: true, detail: "ok" },
              { id: "gateway", label: "Gateway", status: "online", pidAlive: true, httpOk: true, detail: "ok" },
              { id: "hud-renderer", label: "HUD", status: "online", pidAlive: true, httpOk: true, detail: "ok" },
              { id: "dashboard", label: "Dashboard", status: "offline", pidAlive: false, httpOk: false, detail: "off" },
              { id: "electron-hud", label: "Electron", status: "degraded", pidAlive: true, httpOk: false, detail: "pid only" },
              { id: "ollama", label: "Ollama", status: "offline", pidAlive: false, httpOk: false, detail: "off" },
            ],
            summary: { online: 3, degraded: 1, offline: 2, unknown: 0 },
            note: "read only",
          },
        }),
      });
      return;
    }
    if (route.request().url().endsWith("/api/models/activation-plans")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plans: [
            { id: "activation-whisper", label: "Whisper", recommendedRuntime: "huggingface-local", status: "asset-ready" },
            { id: "activation-qwen", label: "Qwen 3.5", recommendedRuntime: "lmstudio", status: "needs-runtime" },
            { id: "activation-gemma", label: "Gemma", recommendedRuntime: "vllm", status: "too-heavy" },
          ],
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
  await expect(orb.locator(".orb-scan-ring")).toHaveCount(1);
  await expect(orb.locator(".orb-data-arcs")).toHaveCount(1);
  await expect(orb.locator(".orb-kinetic-frame")).toHaveCount(1);
  await expect(orb.locator(".orb-state-glyph")).toHaveCount(1);

  let orbBox = await orb.boundingBox();
  for (let attempt = 0; !orbBox && attempt < 10; attempt += 1) {
    await page.waitForTimeout(100);
    orbBox = await orb.boundingBox();
  }
  const viewport = page.viewportSize();
  expect(orbBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(Math.abs((orbBox!.x + orbBox!.width / 2) - viewport!.width / 2)).toBeLessThan(8);
  expect(Math.abs((orbBox!.y + orbBox!.height / 2) - viewport!.height / 2)).toBeLessThan(8);
  expect(consoleErrors).toEqual([]);
});

test("orb visuals shift state without adding idle text", async ({ page }) => {
  await page.goto("/");
  const orb = page.getByRole("button", { name: "Open Jarvis controls" });
  await expect(orb).toHaveAttribute("data-state", "idle");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await orb.click();
  await page.getByTitle("Voice").click();
  await expect(orb).toHaveAttribute("data-state", "listening");
  await expect(orb.locator(".orb-particle-field i")).toHaveCount(12);
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
  await expect(panel.locator("header").getByText("Dashboard")).toBeVisible();
  await expect(panel.getByText("Model", { exact: true })).toBeVisible();
  await expect(panel.getByText("Tasks")).toBeVisible();
  await expect(panel.locator(".widget-grid")).toBeVisible();
  await expect(panel.getByLabel("Runtime constellation")).toContainText("5/5");
  await expect(panel.getByLabel("Runtime constellation")).toContainText("sealed");
  await expect(panel.getByLabel("Runtime constellation")).toContainText("4 needed");
  await expect(panel.getByLabel("Runtime smoke status")).toContainText("passed");
  await expect(panel.getByLabel("Live service heartbeats")).toContainText("Python Brain");
  await expect(panel.getByLabel("Live service heartbeats")).toContainText("Ollama");
  await expect(panel.getByLabel("Model activation plans")).toContainText("Whisper");
  await expect(panel.getByLabel("Model activation plans")).toContainText("asset-ready");
});

test("voice and text panels expose compact interaction states", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Jarvis controls" }).click();
  await page.getByTitle("Voice").click();

  const voicePanel = page.getByRole("dialog", { name: "Jarvis voice panel" });
  await expect(voicePanel).toBeVisible();
  await expect(voicePanel.getByLabel("Live voice session")).toContainText("listening");
  await expect(voicePanel.getByLabel("Live voice session")).toContainText("Jarvis status");
  await expect(voicePanel.getByLabel("Voice status legend")).toContainText("listening");
  await expect(voicePanel.getByLabel("Voice status legend")).toContainText("processing");
  await expect(voicePanel.getByLabel("Voice status legend")).toContainText("error");
  await expect(voicePanel.getByLabel("Voice session controls")).toBeVisible();
  await voicePanel.getByText("Runtime details").click();
  await expect(voicePanel.getByLabel("Voice runtime readiness")).toContainText("ready-asset");
  await expect(voicePanel.getByLabel("Voice runtime readiness")).toContainText("4");
  await expect(voicePanel.getByLabel("Wake activation readiness")).toContainText("3/1");
  await expect(voicePanel.getByLabel("Wake activation readiness")).toContainText("push-to-talk");
  await expect(voicePanel.getByLabel("Agent voice matrix")).toContainText("Jarvis");
  await expect(voicePanel.getByLabel("Agent voice matrix")).toContainText("Sentinel");
  await expect(voicePanel.getByLabel("Agent voice matrix")).toContainText("future-clone");
  await page.getByRole("button", { name: "Test Sentinel voice" }).click();
  await expect(voicePanel.getByLabel("Agent voice matrix")).toContainText("ready");
  await expect(voicePanel.getByLabel("Manual transcript bridge")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop speaking" })).toBeVisible();

  await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Open Jarvis controls" }).click();
  await page.getByTitle("Text").click();
  await expect(page.getByPlaceholder("Ask Jarvis anything...")).toBeFocused();
});

test("text command closes into a compact command capsule", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Jarvis controls" }).click();
  await page.getByTitle("Text").click();

  await page.getByPlaceholder("Ask Jarvis anything...").fill("Check status");
  await page.getByRole("button", { name: "Send to Jarvis" }).click();

  const capsule = page.getByLabel("Jarvis command capsule");
  await expect(capsule).toBeVisible();
  await expect(capsule).toContainText("Queued");
  await expect(capsule).toContainText("Check status");
  await expect(page.getByRole("dialog", { name: "Jarvis text panel" })).toHaveCount(0);
});

test("workflow console keeps generated automations approval-gated", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Jarvis controls" }).click();
  await page.getByTitle("Workflows").click();

  const panel = page.getByRole("dialog", { name: "Jarvis workflows panel" });
  await expect(panel.getByLabel("Workflow list")).toContainText("Generated inbox triage");
  await expect(panel.getByLabel("Workflow canvas")).toBeVisible();
  await expect(panel.getByLabel("Workflow node Owner approval")).toBeVisible();
  await panel.getByLabel("Workflow node Owner approval").click();
  await expect(panel.getByLabel("Workflow node details")).toContainText("Owner approval");
  await expect(panel.getByLabel("Workflow variables")).toContainText("approval");
  await expect(panel.getByLabel("Workflow node editor")).toBeVisible();
  await panel.getByLabel("Workflow node editor").locator("input").fill("Owner approval reviewed");
  await panel.getByRole("button", { name: "Save disabled draft" }).click();
  await expect(panel.getByLabel("Workflow manager delegation")).toContainText("Jarvis");
  await expect(panel.getByLabel("Workflow manager delegation")).toContainText("Sentinel");
  await panel.getByRole("button", { name: "Layout" }).click();
  await expect(panel.getByRole("button", { name: "Saved" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Approval needed", exact: true })).toBeDisabled();

  await panel.getByLabel("Describe a workflow").fill("Create my morning brief");
  await panel.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(panel.getByLabel("Generated workflow proposal")).toContainText("Generated morning brief");
  await expect(panel.getByLabel("Generated workflow approval state")).toContainText("owner approval");
  await expect(panel.getByLabel("Generated workflow approval state")).toContainText("1 gated");
  await panel.getByRole("button", { name: "Save draft" }).click();
  await expect(panel.getByLabel("Workflow list")).toContainText("Generated inbox triage");
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

test("desktop icon rail expands and shifts the usable stage cleanly", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop rail exists only in desktop shell.");
  await page.goto("/?shell=desktop");

  const rail = page.getByLabel("Jarvis desktop shell");
  const orb = page.getByRole("button", { name: "Open Jarvis controls" });
  await expect(rail).toBeVisible();
  await expect(rail).toHaveAttribute("data-expanded", "false");
  await expect(orb.locator("canvas")).toBeVisible();

  const collapsedWidth = await rail.evaluate((element) => element.getBoundingClientRect().width);
  const collapsedButton = await page.getByRole("button", { name: "Open Home panel" }).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  const orbBefore = await orb.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });

  expect(collapsedWidth).toBeLessThanOrEqual(58);
  expect(collapsedButton.width).toBeLessThanOrEqual(44);
  expect(collapsedButton.height).toBe(48);

  await rail.hover();
  await expect(rail).toHaveAttribute("data-expanded", "true");
  await expect.poll(() => rail.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(150);
  const expandedWidth = await rail.evaluate((element) => element.getBoundingClientRect().width);
  const orbAfter = await orb.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });

  expect(expandedWidth).toBeGreaterThan(150);
  expect(orbAfter.x - orbBefore.x).toBeGreaterThan(50);
  expect(Math.abs(orbAfter.y - orbBefore.y)).toBeLessThanOrEqual(1);
});

test("settings separates feature downloads from future scaling", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Jarvis controls" }).click();
  await page.getByTitle("Settings").click();

  const panel = page.getByRole("dialog", { name: "Jarvis settings panel" });
  await expect(panel.getByLabel("Setup action groups")).toContainText("2 needed");
  await expect(panel.getByLabel("Setup action groups")).toContainText("2 future");
  await expect(panel.getByLabel("Setup approval summary")).toContainText("0");
  await expect(panel.getByLabel("Setup approval summary")).toContainText("quiet");
  await expect(panel.getByLabel("Feature plug-in slots")).toContainText("Piper");
  await expect(panel.getByLabel("Feature plug-in slots")).toContainText("missing");
  await expect(panel.getByLabel("Approved setup install plans")).toContainText("Piper");
  await expect(panel.getByLabel("Approved setup install plans")).toContainText("approval");
  await panel.locator(".setup-install-card", { hasText: "Piper executable and one voice" }).locator("summary").click();
  await page.getByRole("button", { name: "Dry-run Piper executable and one voice" }).click();
  await expect(panel.getByLabel("Approved setup install plans")).toContainText("requires_approval");
});

test("settings shows compact architecture and authority hardening summaries", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Jarvis controls" }).click();
  await page.getByTitle("Settings").click();

  const panel = page.getByRole("dialog", { name: "Jarvis settings panel" });
  const hardening = page.getByLabel("Architecture and runtime hardening");
  await expect(hardening).toContainText("Manager");
  await expect(hardening).toContainText("online");
  await expect(hardening).toContainText("Stack");
  await expect(hardening).toContainText("4");
  await expect(hardening).toContainText("Startup");
  await expect(hardening).toContainText("ready");
  await expect(hardening).toContainText("Authority");
  await expect(hardening).toContainText("approved-admin-ready");
  await expect(hardening).toContainText("Code health");
  await expect(panel.getByLabel("Startup and service manager")).toContainText("3/5");
  await expect(panel.getByLabel("Startup and service manager")).toContainText("highest");
  await expect(panel.getByLabel("Runtime install start stop dry-run controls")).toContainText("Start");
  await page.getByRole("button", { name: "Start dry-run", exact: true }).click();
  await expect(panel.getByLabel("Runtime install start stop dry-run controls")).toContainText("requires_approval");
  const liveTest = panel.getByRole("group", { name: "Production live test" });
  await expect(liveTest).toContainText("ready");
  await liveTest.locator("summary").click();
  await expect(liveTest.getByLabel("Production live test checks")).toContainText("Live text chat");
  await liveTest.getByRole("button", { name: "Run live test" }).click();
  await expect(liveTest).toContainText("Jarvis production live test passed.");
  const selfTest = panel.getByRole("group", { name: "Runtime self-test" });
  await expect(selfTest).toContainText("attention");
  await selfTest.locator("summary").click();
  await expect(selfTest.getByLabel("Runtime self-test checks")).toContainText("Models");
  await expect(selfTest.getByLabel("Runtime self-test checks")).toContainText("Services");
  await expect(selfTest.getByLabel("Runtime self-test fixes")).toContainText("Ollama PATH");
  await selfTest.getByLabel("Runtime self-test fixes").getByRole("button", { name: "Ollama PATH dry-run", exact: true }).click();
  await expect(selfTest.getByLabel("Runtime self-test fixes")).toContainText("requires_approval");
  const attention = panel.getByRole("group", { name: "Runtime attention resolver" });
  await expect(attention).toContainText("blocked");
  await attention.locator("summary").click();
  await expect(attention.getByLabel("Runtime attention items")).toContainText("Whisper STT runtime");
  await expect(attention.getByLabel("Runtime attention items")).toContainText("Kokoro neural TTS");
  await attention.getByLabel("Runtime attention items").getByRole("button", { name: /Kokoro neural TTS/i }).click();
  await expect(attention).toContainText("hf download hexgrad/Kokoro-82M");
  await expect(panel.getByLabel("Packaging and wake readiness")).toContainText("ready");
  await panel.getByLabel("Packaging and wake readiness").locator("summary").click();
  await expect(panel.getByLabel("Packaging and wake readiness")).toContainText("2 wake ready / 1 staged");
  await expect(panel.getByLabel("Wake and runtime activation")).toContainText("3/1");
  await panel.getByLabel("Wake and runtime activation").locator("summary").click();
  await expect(panel.getByLabel("Wake and runtime activation")).toContainText("Ollama found-off-path");
  await expect(panel.getByLabel("Runtime adapter repair dry-runs")).toContainText("Ollama PATH");
  await page.getByRole("button", { name: "Ollama PATH dry-run", exact: true }).click();
  await expect(panel.getByLabel("Runtime adapter repair dry-runs")).toContainText("requires_approval");
  await expect(panel.getByLabel("Wake and runtime activation")).toContainText("SetEnvironmentVariable");
  await expect(panel.getByLabel("Agent manager readiness")).toContainText("8/8");
  await expect(panel.getByLabel("Agent manager readiness")).toContainText("low");
  await expect(panel.getByLabel("Agent voice personalities")).toContainText("Jarvis");
  await expect(panel.getByLabel("Agent voice personalities")).toContainText("Friday");
  await expect(panel.getByLabel("Agent voice personalities")).toContainText("ready");
  await expect(panel.getByLabel("Interaction health")).toContainText("Text");
  await expect(panel.getByLabel("Interaction health")).toContainText("Voice");
  await expect(panel.getByLabel("Interaction health")).toContainText("Generate");
  await expect(panel.getByLabel("Interaction health")).toContainText("Undo");
  await expect(panel.getByLabel("Interaction response pressure")).toContainText("0/1");
  await expect(panel.getByLabel("Interaction response pressure")).toContainText("1/4");
  await expect(panel.getByLabel("Interaction response pressure")).toContainText("low");
  await hardening.locator(".hardening-card", { hasText: "Authority" }).locator("summary").click();
  await expect(hardening).toContainText("9 gated");
  await hardening.locator(".hardening-card", { hasText: "Code health" }).locator("summary").click();
  await expect(hardening).toContainText("1 dupes");
});

test("sensor approval chip uses generic approval endpoint and clears after success", async ({ page }) => {
  const calls: string[] = [];
  await page.route("http://127.0.0.1:4317/api/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...seededStatus,
        pendingApprovals: [
          {
            id: "approval-001",
            title: "Enable continuous screen timeline capture",
            category: "sensor-capture",
            target: "screen timeline",
            reason: "Required for rewind views.",
            connectorId: "filesystem",
            agentId: "jarvis",
            dataTouched: ["screen content", "timeline"],
          },
        ],
      }),
    });
  });
  await page.route("http://127.0.0.1:4317/api/system/actions/approval-001/approve", async (route) => {
    calls.push(route.request().url());
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "wrong endpoint" }) });
  });
  await page.route("http://127.0.0.1:4317/api/approvals/approval-001/approve", async (route) => {
    calls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        approval: { id: "approval-001", category: "sensor-capture", target: "screen timeline" },
        memoryWrite: { id: "memory-approval", content: "Approval approved", tags: ["approval", "approved", "sensor-capture"] },
      }),
    });
  });

  await page.goto("/");
  await expect(page.getByText("screen timeline")).toBeVisible();
  await page.getByRole("button", { name: "Approve action" }).click();

  await expect(page.getByLabel("Jarvis command capsule")).toContainText("Approved.");
  await expect(page.getByText("screen timeline")).toHaveCount(0);
  expect(calls).toEqual(["http://127.0.0.1:4317/api/approvals/approval-001/approve"]);
});
