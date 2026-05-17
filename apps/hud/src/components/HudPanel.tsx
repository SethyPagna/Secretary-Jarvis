import { Cable, CheckCircle2, Cpu, Mic, Play, Send, Settings, Square, UserCheck, X } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import type {
  JarvisStatus,
  RuntimeConstellation,
  RuntimeControlDryRun,
  RuntimeControlKind,
  RuntimeLiveTestStatus,
  RuntimeServicesStatus,
  RuntimeSmokeStatus,
  SetupActionGroup,
  VoiceSession,
  VoiceRuntimeReadiness
} from "@jarvis/core";
import type { HudPanel as HudPanelName } from "../types";

const WorkflowConsole = lazy(() => import("./WorkflowConsole").then((module) => ({ default: module.WorkflowConsole })));

export function HudPanel({
  panel,
  status,
  apiBaseUrl,
  onCommandQueued,
  onRecognizing,
  onClose
}: {
  panel: HudPanelName;
  status: JarvisStatus | null;
  apiBaseUrl: string;
  onCommandQueued?: (capsule: { taskId?: string; state: "queued" | "running" | "completed" | "failed" | "cancelled"; title: string; detail: string }) => void;
  onRecognizing?: (message: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [constellation, setConstellation] = useState<RuntimeConstellation | null>(null);
  const [voiceReadiness, setVoiceReadiness] = useState<VoiceRuntimeReadiness | null>(null);
  const [voiceSession, setVoiceSession] = useState<VoiceSession | null>(status?.voiceSession ?? null);
  const [voiceDraft, setVoiceDraft] = useState("");
  const [agentVoiceMatrix, setAgentVoiceMatrix] = useState<AgentVoiceEntry[]>([]);
  const [agentVoiceTests, setAgentVoiceTests] = useState<Record<string, string>>({});
  const [setupGroups, setSetupGroups] = useState<SetupActionGroup[]>([]);
  const [pluginSlots, setPluginSlots] = useState<FeaturePluginSlot[]>([]);
  const [setupInstallPlans, setSetupInstallPlans] = useState<SetupInstallPlan[]>([]);
  const [setupDryRuns, setSetupDryRuns] = useState<Record<string, SetupDryRunResult>>({});
  const [activationPlans, setActivationPlans] = useState<ModelActivationPlan[]>([]);
  const [smokeStatus, setSmokeStatus] = useState<RuntimeSmokeStatus | null>(null);
  const [runtimeServices, setRuntimeServices] = useState<RuntimeServicesStatus | null>(null);
  const [architectureSummary, setArchitectureSummary] = useState<ArchitectureSummary | null>(null);
  const [codeHealth, setCodeHealth] = useState<CodeHealthSummary | null>(null);
  const [startupReadiness, setStartupReadiness] = useState<StartupReadinessSummary | null>(null);
  const [authorityReadiness, setAuthorityReadiness] = useState<AuthorityReadinessSummary | null>(null);
  const [processVisibility, setProcessVisibility] = useState<ProcessVisibilitySummary | null>(null);
  const [startupPlans, setStartupPlans] = useState<StartupPlanSummary[]>([]);
  const [packagingReadiness, setPackagingReadiness] = useState<PackagingReadinessSummary | null>(null);
  const [activationReadiness, setActivationReadiness] = useState<WakeRuntimeActivationSummary | null>(null);
  const [agentManagerReadiness, setAgentManagerReadiness] = useState<AgentManagerReadinessSummary | null>(null);
  const [interactionHealth, setInteractionHealth] = useState<InteractionHealthSummary | null>(null);
  const [runtimeSelfTest, setRuntimeSelfTest] = useState<RuntimeSelfTestSummary | null>(null);
  const [runtimeLiveTest, setRuntimeLiveTest] = useState<RuntimeLiveTestStatus | null>(null);
  const [runtimeAttention, setRuntimeAttention] = useState<RuntimeAttentionSummary | null>(null);
  const [liveTestRunning, setLiveTestRunning] = useState(false);
  const [runtimeSelfTestFixes, setRuntimeSelfTestFixes] = useState<Record<string, string>>({});
  const [runtimeAttentionDryRuns, setRuntimeAttentionDryRuns] = useState<Record<string, RuntimeAttentionDryRunSummary>>({});
  const [adapterRepairDryRuns, setAdapterRepairDryRuns] = useState<Record<string, AdapterRepairDryRunSummary>>({});
  const [runtimeDryRuns, setRuntimeDryRuns] = useState<Record<string, RuntimeDryRunSummary>>({});
  const models = status?.models ?? [];
  const activeModel = models.find((model) => model.id === status?.activeModelId) ?? models[0];
  const tasks = status?.tasks?.slice(0, 3) ?? [];
  const setupApprovals = (status?.pendingApprovals ?? []).filter(
    (approval) => approval.title.toLowerCase().includes("feature setup") || approval.target.includes("Secretary Jarvis")
  );

  useEffect(() => {
    if (panel !== "dashboard") {
      return;
    }
    let cancelled = false;
    fetch(`${apiBaseUrl}/api/runtime/constellation`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: RuntimeConstellationResponse | undefined) => {
        if (!cancelled && payload?.constellation) {
          setConstellation(payload.constellation);
        }
      })
      .catch(() => undefined);
    fetch(`${apiBaseUrl}/api/runtime/smoke-status`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: RuntimeSmokeResponse | undefined) => {
        if (!cancelled && payload?.smoke) {
          setSmokeStatus(payload.smoke);
        }
      })
      .catch(() => undefined);
    fetch(`${apiBaseUrl}/api/runtime/services`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: RuntimeServicesResponse | undefined) => {
        if (!cancelled && payload?.runtime) {
          setRuntimeServices(payload.runtime);
        }
      })
      .catch(() => undefined);
    fetch(`${apiBaseUrl}/api/models/activation-plans`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: ModelActivationPlansResponse | undefined) => {
        if (!cancelled) {
          setActivationPlans(payload?.plans ?? []);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, panel]);

  useEffect(() => {
    if (panel !== "voice") {
      return;
    }
    let cancelled = false;
    fetch(`${apiBaseUrl}/api/voice/readiness`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: VoiceReadinessResponse | undefined) => {
        if (!cancelled && payload?.readiness) {
          setVoiceReadiness(payload.readiness);
        }
      })
      .catch(() => undefined);
    fetch(`${apiBaseUrl}/api/voice/session`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: VoiceSessionResponse | undefined) => {
        if (!cancelled && payload?.voiceSession) {
          setVoiceSession(payload.voiceSession);
        }
      })
      .catch(() => undefined);
    fetch(`${apiBaseUrl}/api/voice/agent-matrix`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: AgentVoiceMatrixResponse | undefined) => {
        if (!cancelled) {
          setAgentVoiceMatrix(payload?.matrix?.entries ?? []);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, panel]);

  useEffect(() => {
    if (panel !== "voice" && panel !== "settings") {
      return;
    }
    let cancelled = false;
    fetch(`${apiBaseUrl}/api/runtime/activation-readiness`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: WakeRuntimeActivationResponse | undefined) => {
        if (!cancelled && payload?.activation) {
          setActivationReadiness({
            wakeReady: payload.activation.wake.summary.ready,
            wakeStaged: payload.activation.wake.summary.staged,
            approvalGated: payload.activation.wake.summary.approvalGated,
            hotwordStatus: payload.activation.voice.wakeWord,
            primaryStt: payload.activation.voice.primaryStt,
            vad: payload.activation.voice.vad,
            ollamaStatus: payload.activation.ollama.status,
            ollamaNote: payload.activation.ollama.note,
            adapterReady: payload.activation.summary.localModelAdaptersReady,
            repairCommand: payload.activation.ollama.repairCommands[0] ?? "No repair command staged.",
            recommendation: payload.activation.recommendations[0] ?? "Use tray/orb wake for reliable background access today."
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, panel]);

  useEffect(() => {
    if (panel !== "settings") {
      return;
    }
    let cancelled = false;
    fetch(`${apiBaseUrl}/api/setup/action-groups`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: SetupActionGroupsResponse | undefined) => {
        if (!cancelled) {
          setSetupGroups(payload?.groups ?? []);
        }
      })
      .catch(() => undefined);
    fetch(`${apiBaseUrl}/api/setup/plugin-slots`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: FeaturePluginSlotsResponse | undefined) => {
        if (!cancelled) {
          setPluginSlots(payload?.manifest?.slots ?? []);
        }
      })
      .catch(() => undefined);
    fetch(`${apiBaseUrl}/api/setup/install-plans`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: SetupInstallPlansResponse | undefined) => {
        if (!cancelled) {
          setSetupInstallPlans(payload?.manifest?.plans ?? []);
        }
      })
      .catch(() => undefined);
    fetch(`${apiBaseUrl}/api/architecture/map`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: ArchitectureMapResponse | undefined) => {
        if (!cancelled && payload?.architecture) {
          setArchitectureSummary({
            stackSummary: payload.architecture.stackSummary,
            subsystemCount: payload.architecture.subsystems.length,
            languages: [...new Set(payload.architecture.languageStrategy.map((entry) => entry.language))],
            backlogCount: payload.architecture.improvementBacklog.length
          });
        }
      })
      .catch(() => undefined);
    fetch(`${apiBaseUrl}/api/architecture/code-health`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: CodeHealthResponse | undefined) => {
        if (!cancelled && payload?.codeHealth) {
          setCodeHealth({
            scannedFiles: payload.codeHealth.scannedFiles,
            oversizedFiles: payload.codeHealth.oversizedFiles.length,
            duplicateBasenames: payload.codeHealth.duplicateBasenames.length,
            staleMarkers: payload.codeHealth.staleMarkers.length,
            cleanupBacklog: payload.codeHealth.cleanupBacklog.slice(0, 2)
          });
        }
      })
      .catch(() => undefined);
    fetch(`${apiBaseUrl}/api/runtime/startup-readiness`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: StartupReadinessResponse | undefined) => {
        if (!cancelled && payload?.startup) {
          setStartupReadiness({
            configured: payload.startup.summary.startupConfigured,
            scriptsReady: payload.startup.summary.scriptsReady,
            runningPidFiles: payload.startup.summary.runningPidFiles,
            backgroundPidFiles: payload.startup.summary.backgroundPidFiles,
            highTrustMode: payload.startup.authority.highTrustMode
          });
        }
      })
      .catch(() => undefined);
    fetch(`${apiBaseUrl}/api/security/authority-readiness`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: AuthorityReadinessResponse | undefined) => {
        if (!cancelled && payload?.authority) {
          setAuthorityReadiness({
            mode: payload.authority.mode,
            approvalRequired: payload.authority.actionSummary.approvalRequired,
            adminApproved: payload.authority.actionSummary.adminApproved,
            reversible: payload.authority.actionSummary.reversible,
            blockedCategories: payload.authority.blockedCategories.length,
            guardrail: payload.authority.guardrails[0] ?? "Protected core remains sealed."
          });
        }
      })
      .catch(() => undefined);
    fetch(`${apiBaseUrl}/api/runtime/process-visibility`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: ProcessVisibilityResponse | undefined) => {
        if (!cancelled && payload?.visibility) {
          setProcessVisibility({
            tracked: payload.visibility.summary.tracked,
            alive: payload.visibility.summary.alive,
            visibleInTaskManager: payload.visibility.summary.visibleInTaskManager,
            services: payload.visibility.services.slice(0, 3).map((service) => ({
              id: service.id,
              label: service.label,
              pidAlive: service.pidAlive,
              taskManagerGroup: service.taskManagerGroup
            }))
          });
        }
      })
      .catch(() => undefined);
    fetch(`${apiBaseUrl}/api/runtime/startup-registration-plans`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: StartupRegistrationPlansResponse | undefined) => {
        if (!cancelled) {
          setStartupPlans((payload?.manifest?.plans ?? []).map((plan) => ({
            id: plan.id,
            label: plan.label,
            mode: plan.mode,
            runLevel: plan.runLevel,
            status: plan.status,
            approvalRequired: plan.approvalRequired
          })));
        }
      })
      .catch(() => undefined);
    fetch(`${apiBaseUrl}/api/runtime/packaging-readiness`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: PackagingReadinessResponse | undefined) => {
        if (!cancelled && payload?.packaging) {
          setPackagingReadiness({
            electronShellReady: payload.packaging.summary.electronShellReady,
            startupScriptsReady: payload.packaging.summary.startupScriptsReady,
            productionCommandsReady: payload.packaging.summary.productionCommandsReady,
            wakeReady: payload.packaging.backgroundRuntime.wakeMethods.filter((method) => method.status === "ready").length,
            wakeStaged: payload.packaging.backgroundRuntime.wakeMethods.filter((method) => method.status === "staged").length,
            packageCommand: payload.packaging.electron.commands.at(-1) ?? "npm.cmd run dist:hud"
          });
        }
      })
      .catch(() => undefined);
    fetch(`${apiBaseUrl}/api/agents/manager-readiness`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: AgentManagerReadinessResponse | undefined) => {
        if (!cancelled && payload?.manager) {
          setAgentManagerReadiness({
            connected: payload.manager.manager.connected,
            agentCount: payload.manager.summary.agentsReady,
            voicesCovered: payload.manager.summary.voicesCovered,
            coveredVoices: payload.manager.voices.coveredAgents,
            totalVoices: payload.manager.voices.totalAgents,
            distinctVoices: payload.manager.voices.distinctProfileCount,
            approvalGatedSteps: payload.manager.workflowAutonomy.approvalGatedSteps,
            workflows: payload.manager.workflowAutonomy.workflows,
            managerWorkflowReady: payload.manager.workflowAutonomy.managerWorkflowReady,
            freezeRisk: payload.manager.responseHealth.freezeRisk,
            waitingApprovals: payload.manager.responseHealth.waitingApprovals,
            responseNote: payload.manager.responseHealth.note,
            agents: payload.manager.agents.slice(0, 8).map((agent) => ({
              id: agent.id,
              name: agent.name,
              voiceStatus: agent.voiceStatus,
              voiceStyle: agent.voiceStyle
            }))
          });
        }
      })
      .catch(() => undefined);
    fetch(`${apiBaseUrl}/api/runtime/interaction-health`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: InteractionHealthResponse | undefined) => {
        if (!cancelled && payload?.interaction) {
          setInteractionHealth({
            surfaces: payload.interaction.surfaces.map((surface) => ({
              id: surface.id,
              label: surface.label,
              status: surface.status
            })),
            runningTasks: payload.interaction.metrics.runningTasks,
            queuedItems: payload.interaction.metrics.queuedItems,
            waitingApprovals: payload.interaction.metrics.waitingApprovals,
            activeWorkflowRuns: payload.interaction.metrics.activeWorkflowRuns,
            generatedWorkflows: payload.interaction.metrics.generatedWorkflows,
            enabledWorkflows: payload.interaction.metrics.enabledWorkflows,
            availableUndos: payload.interaction.metrics.availableUndos,
            responsive: payload.interaction.summary.responsive,
            canTalkWhileWorking: payload.interaction.summary.canTalkWhileWorking,
            workflowAutonomyApprovalGated: payload.interaction.summary.workflowAutonomyApprovalGated,
            editingUndoReady: payload.interaction.summary.editingUndoReady,
            freezeRisk: payload.interaction.summary.freezeRisk
          });
        }
      })
      .catch(() => undefined);
    fetch(`${apiBaseUrl}/api/runtime/self-test`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: RuntimeSelfTestResponse | undefined) => {
        if (!cancelled && payload?.selfTest) {
          setRuntimeSelfTest({
            topStatus: payload.selfTest.summary.topStatus,
            connected: payload.selfTest.summary.connected,
            ready: payload.selfTest.summary.ready,
            attention: payload.selfTest.summary.attention,
            blocked: payload.selfTest.summary.blocked,
            staged: payload.selfTest.summary.staged,
            checks: payload.selfTest.checks.slice(0, 7),
            fixes: payload.selfTest.fixes.slice(0, 4),
            recommendation: payload.selfTest.recommendations[0] ?? "Runtime self-test keeps fixes dry-run or approval-gated."
          });
        }
      })
      .catch(() => undefined);
    fetch(`${apiBaseUrl}/api/runtime/live-test/latest`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: RuntimeLiveTestResponse | undefined) => {
        if (!cancelled && payload?.liveTest) {
          setRuntimeLiveTest(payload.liveTest);
        }
      })
      .catch(() => undefined);
    fetch(`${apiBaseUrl}/api/runtime/attention`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: RuntimeAttentionResponse | undefined) => {
        if (!cancelled && payload?.attention) {
          setRuntimeAttention({
            summary: payload.attention.summary,
            priority: payload.attention.priority.slice(0, 5),
            note: payload.attention.note
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, panel]);

  async function submitText(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) {
      return;
    }
    const payload = await fetch(`${apiBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: text.trim(), taskProfile: "daily-assistant" })
    })
      .then((response) => (response.ok ? response.json() : undefined))
      .catch(() => undefined) as ChatQueuedResponse | undefined;
    if (payload?.task) {
      onCommandQueued?.({
        taskId: payload.task.id,
        state: "queued",
        title: payload.task.title,
        detail: compactDetail(payload.task.title)
      });
    }
    setText("");
    onClose();
  }

  async function stopSpeaking() {
    await fetch(`${apiBaseUrl}/api/audio/tts/stop`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "HUD stop speaking" })
    }).catch(() => undefined);
  }

  async function testAgentVoice(agent: AgentVoiceEntry) {
    setAgentVoiceTests((current) => ({ ...current, [agent.agentId]: "testing" }));
    const payload = await fetch(`${apiBaseUrl}/api/audio/tts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(agent.ttsRequest)
    })
      .then((response) => (response.ok ? response.json() : undefined))
      .catch(() => undefined) as AgentTtsResponse | undefined;
    setAgentVoiceTests((current) => ({
      ...current,
      [agent.agentId]: payload?.tts?.status ?? "unavailable"
    }));
  }

  async function startVoiceListening() {
    const payload = await fetch(`${apiBaseUrl}/api/voice/listening/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resetTranscript: true })
    })
      .then((response) => (response.ok ? response.json() : undefined))
      .catch(() => undefined) as VoiceSessionResponse | undefined;
    if (payload?.voiceSession) {
      setVoiceSession(payload.voiceSession);
      if (payload.task) {
        onCommandQueued?.({
          taskId: payload.task.id,
          state: "queued",
          title: payload.task.title,
          detail: compactDetail(payload.task.title)
        });
      }
    }
  }

  async function stopVoiceListening() {
    const payload = await fetch(`${apiBaseUrl}/api/voice/listening/stop`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "HUD voice stop" })
    })
      .then((response) => (response.ok ? response.json() : undefined))
      .catch(() => undefined) as VoiceSessionResponse | undefined;
    if (payload?.voiceSession) {
      setVoiceSession(payload.voiceSession);
    }
  }

  async function submitVoiceDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = voiceDraft.trim();
    if (!text) {
      return;
    }
    const transcript = await fetch(`${apiBaseUrl}/api/voice/transcript`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, final: true, confidence: 0.9, engineId: "hud-manual" })
    })
      .then((response) => (response.ok ? response.json() : undefined))
      .catch(() => undefined) as VoiceSessionResponse | undefined;
    if (transcript?.voiceSession) {
      setVoiceSession(transcript.voiceSession);
      setVoiceDraft("");
    }
  }

  async function commitVoiceTranscript() {
    const payload = await fetch(`${apiBaseUrl}/api/voice/transcript/commit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskProfile: "daily-assistant" })
    })
      .then((response) => (response.ok ? response.json() : undefined))
      .catch(() => undefined) as VoiceSessionResponse | undefined;
    if (payload?.voiceSession) {
      setVoiceSession(payload.voiceSession);
    }
  }

  async function recognizeOwnerDryRun() {
    onRecognizing?.("Recognizing you...");
    await fetch(`${apiBaseUrl}/api/identity/recognize/dry-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "combined" })
    }).catch(() => undefined);
  }

  async function dryRunSetupPlan(plan: SetupInstallPlan) {
    const payload = await fetch(`${apiBaseUrl}/api/setup/install-plans/${encodeURIComponent(plan.id)}/dry-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "hud-settings" })
    })
      .then((response) => (response.ok ? response.json() : undefined))
      .catch(() => undefined) as SetupDryRunResponse | undefined;
    setSetupDryRuns((current) => ({
      ...current,
      [plan.id]: payload?.dryRun
        ? {
            decision: payload.dryRun.decision.decision,
            risk: payload.dryRun.decision.risk,
            note: payload.dryRun.notes?.[0] ?? "Dry-run staged."
          }
        : {
            decision: "unavailable",
            risk: "blocked",
            note: "Dry-run endpoint did not return a setup preview."
          }
    }));
  }

  async function dryRunRuntimeControl(control: RuntimeControlKind) {
    const payload = await fetch(`${apiBaseUrl}/api/runtime/control/dry-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ control, target: "all" })
    })
      .then((response) => (response.ok ? response.json() : undefined))
      .catch(() => undefined) as RuntimeControlDryRunResponse | undefined;
    setRuntimeDryRuns((current) => ({
      ...current,
      [control]: payload?.dryRun
        ? {
            decision: payload.dryRun.decision.decision,
            risk: payload.dryRun.decision.risk,
            commandPreview: payload.dryRun.commandPreview,
            message: payload.dryRun.message
          }
        : {
            decision: "unavailable",
            risk: "blocked",
            commandPreview: "runtime dry-run unavailable",
            message: "Gateway did not return a runtime control preview."
          }
    }));
  }

  async function runProductionLiveTest() {
    setLiveTestRunning(true);
    const payload = await fetch(`${apiBaseUrl}/api/runtime/live-test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "hud-settings" })
    })
      .then((response) => response.json())
      .catch(() => undefined) as RuntimeLiveTestResponse | undefined;
    if (payload?.liveTest) {
      setRuntimeLiveTest(payload.liveTest);
    }
    setLiveTestRunning(false);
  }

  async function triggerSelfTestFix(fix: RuntimeSelfTestFixSummary) {
    setRuntimeSelfTestFixes((current) => ({ ...current, [fix.id]: "checking" }));
    if (!fix.dryRunEndpoint) {
      setRuntimeSelfTestFixes((current) => ({ ...current, [fix.id]: "manual" }));
      return;
    }
    const isGet = !fix.dryRunPayload;
    const payload = await fetch(`${apiBaseUrl}${fix.dryRunEndpoint}`, {
      method: isGet ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      body: isGet ? undefined : JSON.stringify(fix.dryRunPayload)
    })
      .then((response) => (response.ok ? response.json() : undefined))
      .catch(() => undefined) as { dryRun?: { decision?: { decision?: string } }; manifest?: unknown } | undefined;
    setRuntimeSelfTestFixes((current) => ({
      ...current,
      [fix.id]: payload?.dryRun?.decision?.decision ?? (payload?.manifest ? "preview" : "unavailable")
    }));
  }

  async function dryRunRuntimeAttention(item: RuntimeAttentionItemSummary) {
    setRuntimeAttentionDryRuns((current) => ({
      ...current,
      [item.id]: {
        decision: "checking",
        risk: "approval-required",
        commandPreview: "checking",
        message: "Checking runtime attention preview."
      }
    }));
    const payload = await fetch(`${apiBaseUrl}/api/runtime/attention/${encodeURIComponent(item.id)}/dry-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "hud-settings" })
    })
      .then((response) => (response.ok ? response.json() : undefined))
      .catch(() => undefined) as RuntimeAttentionDryRunResponse | undefined;
    setRuntimeAttentionDryRuns((current) => ({
      ...current,
      [item.id]: payload?.dryRun
        ? {
            decision: payload.dryRun.decision,
            risk: payload.dryRun.risk,
            commandPreview: payload.dryRun.commandPreview,
            message: payload.dryRun.message
          }
        : {
            decision: "unavailable",
            risk: "blocked",
            commandPreview: "runtime attention dry-run unavailable",
            message: "Gateway did not return an attention preview."
          }
    }));
  }

  async function dryRunAdapterRepair(repair: RuntimeAdapterRepairKind) {
    const payload = await fetch(`${apiBaseUrl}/api/runtime/adapter-repair/dry-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repair })
    })
      .then((response) => (response.ok ? response.json() : undefined))
      .catch(() => undefined) as AdapterRepairDryRunResponse | undefined;
    setAdapterRepairDryRuns((current) => ({
      ...current,
      [repair]: payload?.dryRun
        ? {
            decision: payload.dryRun.decision.decision,
            risk: payload.dryRun.decision.risk,
            commandPreview: payload.dryRun.commandPreview,
            message: payload.dryRun.message
          }
        : {
            decision: "unavailable",
            risk: "blocked",
            commandPreview: "adapter repair dry-run unavailable",
            message: "Gateway did not return a runtime adapter repair preview."
          }
    }));
  }

  return (
    <section className={`hud-panel hud-panel-${panel}`} role="dialog" aria-label={`Jarvis ${panel} panel`}>
      <button className="panel-close" type="button" onClick={onClose} aria-label="Close panel">
        <X size={16} aria-hidden="true" />
      </button>
      {panel === "dashboard" && (
        <>
          <header><Cpu size={18} /><strong>Dashboard</strong></header>
          <div className="widget-grid">
            <Widget label="Model" value={activeModel?.label ?? "offline"} />
            <Widget label="Mode" value={status?.privacyMode ?? "strict-local"} />
            <Widget label="Tasks" value={`${tasks.length}`} />
            <Widget label="TPS" value={`${status?.performance?.tokensPerSecond ?? "--"}`} />
          </div>
          <div className="constellation-grid" aria-label="Runtime constellation">
            {(constellation?.nodes ?? []).map((node) => (
              <span key={node.id} className={`constellation-node tone-${node.tone}`} title={node.detail}>
                <i />
                <small>{node.label}</small>
                <strong>{node.value}</strong>
              </span>
            ))}
            {!constellation?.nodes?.length && ["Models", "Voice", "Vision", "Privacy", "Setup"].map((label) => (
              <span key={label} className="constellation-node">
                <i />
                <small>{label}</small>
                <strong>--</strong>
              </span>
            ))}
          </div>
          <div className={`smoke-chip smoke-${smokeStatus?.status ?? "missing"}`} aria-label="Runtime smoke status">
            <small>Smoke</small>
            <strong>{smokeStatus?.status ?? "missing"}</strong>
            <span>{smokeStatus?.checks.length ?? 0} checks</span>
          </div>
          <div className="service-pulses" aria-label="Live service heartbeats">
            {(runtimeServices?.services ?? []).slice(0, 6).map((service) => (
              <span key={service.id} className={`service-${service.status}`} title={service.detail}>
                <i />
                <small>{service.label}</small>
              </span>
            ))}
          </div>
          <div className="activation-plan-strip" aria-label="Model activation plans">
            {activationPlans.slice(0, 3).map((plan) => (
              <span key={plan.id} className={`activation-${plan.status}`}>
                <small>{plan.label}</small>
                <strong>{plan.recommendedRuntime}</strong>
                <b>{plan.status}</b>
              </span>
            ))}
          </div>
          <div className="tiny-feed">
            {tasks.length ? tasks.map((task) => <span key={task.id}>{task.status} / {task.title}</span>) : <span>Quiet. Ready.</span>}
          </div>
        </>
      )}
      {panel === "voice" && (
        <>
          <header><Mic size={18} /><strong>Voice</strong></header>
          <div className={`voice-session-card state-${voiceSession?.state ?? "idle"}`} aria-label="Live voice session">
            <div className="mic-pulse"><Mic size={30} /></div>
            <div className="voice-wave" aria-hidden="true">
              {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
            </div>
            <strong>{voiceSession?.state ?? (voiceReadiness?.summary.sttReady ? "ready" : "staged")}</strong>
            <small>{voiceSession?.transcript.at(-1)?.text ?? (voiceReadiness?.summary.sttReady ? "Say a command..." : "Voice staged")}</small>
          </div>
          <div className="voice-control-row" aria-label="Voice session controls">
            <button type="button" onClick={startVoiceListening} aria-label="Start listening"><Play size={15} /></button>
            <button type="button" onClick={stopVoiceListening} aria-label="Stop listening"><Square size={14} /></button>
            <button type="button" onClick={commitVoiceTranscript} aria-label="Commit transcript"><CheckCircle2 size={15} /></button>
          </div>
          <form className="voice-transcript-form" onSubmit={submitVoiceDraft} aria-label="Manual transcript bridge">
            <input value={voiceDraft} onChange={(event) => setVoiceDraft(event.target.value)} placeholder="Type heard command..." />
            <button type="submit" aria-label="Add transcript"><Send size={14} /></button>
          </form>
          <div className="voice-readiness-strip" aria-label="Voice runtime readiness">
            <span><small>STT</small><strong>{voiceReadiness?.primaryStt.status ?? "--"}</strong></span>
            <span><small>TTS</small><strong>{voiceReadiness?.ttsPreferredEngine ?? (voiceReadiness?.summary.ttsReady ? "ready" : "staged")}</strong></span>
            <span><small>Voice</small><strong>{voiceReadiness ? `${voiceReadiness.summary.sampleCount}` : "--"}</strong></span>
            <span><small>Needs</small><strong>{voiceReadiness?.summary.missingRequired ?? "--"}</strong></span>
          </div>
          <div className="wake-activation-strip" aria-label="Wake activation readiness">
            <span><small>Wake</small><strong>{activationReadiness ? `${activationReadiness.wakeReady}/${activationReadiness.wakeStaged}` : "--"}</strong></span>
            <span><small>Hotword</small><strong>{voiceReadiness?.wakeState ?? activationReadiness?.hotwordStatus ?? "staged"}</strong></span>
            <span><small>VAD</small><strong>{activationReadiness?.vad ?? "--"}</strong></span>
          </div>
          <div className="agent-voice-matrix" aria-label="Agent voice matrix">
            {agentVoiceMatrix.slice(0, 8).map((agent) => (
              <button key={agent.agentId} type="button" onClick={() => void testAgentVoice(agent)} aria-label={`Test ${agent.agentName} voice`}>
                <small>{agent.agentName}</small>
                <strong>{agentVoiceTests[agent.agentId] ?? agent.runtimeStatus ?? agent.status}</strong>
                <em>{agent.enginePreference}</em>
              </button>
            ))}
          </div>
          <div className="hud-identity-strip">
            <UserCheck size={16} />
            <span>{status?.identityReadiness?.voiceVerification.status ?? "staged"}</span>
            <span>{status?.identityReadiness?.faceRecognition.cameraStatus ?? "locked"}</span>
            <button type="button" onClick={recognizeOwnerDryRun}>Dry-run</button>
          </div>
          <button className="hud-secondary-action" type="button" onClick={stopSpeaking}>Stop speaking</button>
        </>
      )}
      {panel === "text" && (
        <form className="hud-input-form" onSubmit={submitText}>
          <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Ask Jarvis anything..." autoFocus />
          <button type="submit" aria-label="Send to Jarvis"><Send size={17} /></button>
        </form>
      )}
      {panel === "devices" && (
        <>
          <header><Cable size={18} /><strong>Devices</strong></header>
          <div className="device-grid">
            {(status?.connectors ?? []).slice(0, 6).map((connector) => (
              <span key={connector.id} className={connector.enabled ? "online" : ""}>
                <i />{connector.name}
              </span>
            ))}
          </div>
        </>
      )}
      {panel === "workflows" && (
        <Suspense fallback={<div className="panel-loading" aria-label="Loading workflow console">Loading workflow console...</div>}>
          <WorkflowConsole apiBaseUrl={apiBaseUrl} />
        </Suspense>
      )}
      {panel === "settings" && (
        <>
          <header><Settings size={18} /><strong>Settings</strong></header>
          <div className="setting-list">
            <span>Privacy <b>{status?.privacyMode ?? "strict-local"}</b></span>
            <span>Audio <b>local</b></span>
            <span>Theme <b>dark</b></span>
          </div>
          <div className="hardening-grid" aria-label="Architecture and runtime hardening">
            <details className="hardening-card compact-card">
              <summary>
                <UserCheck size={15} aria-hidden="true" />
                <span>Manager</span>
                <b>{agentManagerReadiness?.connected ? "online" : "check"}</b>
              </summary>
              <small>
                {agentManagerReadiness
                  ? `${agentManagerReadiness.coveredVoices}/${agentManagerReadiness.totalVoices} voices / ${agentManagerReadiness.workflows} workflows`
                  : "Loading agent manager."}
              </small>
              <em>{agentManagerReadiness?.responseNote ?? "Jarvis routes work through specialist agents and Sentinel review."}</em>
            </details>
            <details className="hardening-card compact-card">
              <summary>
                <Cpu size={15} aria-hidden="true" />
                <span>Stack</span>
                <b>{architectureSummary?.subsystemCount ?? "--"}</b>
              </summary>
              <small>{architectureSummary?.languages.join(" / ") ?? "Loading language map."}</small>
              <em>{architectureSummary?.stackSummary ?? "Checking architecture hierarchy."}</em>
            </details>
            <details className="hardening-card compact-card">
              <summary>
                <Play size={15} aria-hidden="true" />
                <span>Startup</span>
                <b>{startupReadiness?.configured ? "ready" : "manual"}</b>
              </summary>
              <small>{startupReadiness?.scriptsReady ? "scripts ready" : "scripts pending"} / {startupReadiness?.highTrustMode ?? "checking"}</small>
              <em>{startupReadiness ? `${startupReadiness.runningPidFiles}/${startupReadiness.backgroundPidFiles} runtime PID files alive` : "Checking background runtime."}</em>
            </details>
            <details className="hardening-card compact-card">
              <summary>
                <CheckCircle2 size={15} aria-hidden="true" />
                <span>Authority</span>
                <b>{authorityReadiness?.mode ?? "sealed"}</b>
              </summary>
              <small>{authorityReadiness ? `${authorityReadiness.approvalRequired} gated / ${authorityReadiness.adminApproved} admin` : "Loading approval hierarchy."}</small>
              <em>{authorityReadiness?.guardrail ?? "Sensitive actions remain policy-gated."}</em>
            </details>
            <details className="hardening-card compact-card">
              <summary>
                <Cable size={15} aria-hidden="true" />
                <span>Code health</span>
                <b>{codeHealth ? `${codeHealth.oversizedFiles}/${codeHealth.scannedFiles}` : "--"}</b>
              </summary>
              <small>{codeHealth ? `${codeHealth.duplicateBasenames} dupes / ${codeHealth.staleMarkers} markers` : "Scanning local source."}</small>
              <em>{codeHealth?.cleanupBacklog[0] ?? "Cleanup hints stay advisory until reviewed."}</em>
            </details>
          </div>
          <div className="startup-control-strip" aria-label="Startup and service manager">
            <span>
              <small>Processes</small>
              <strong>{processVisibility ? `${processVisibility.alive}/${processVisibility.tracked}` : "--"}</strong>
              <em>{processVisibility ? `${processVisibility.visibleInTaskManager} visible` : "checking"}</em>
            </span>
            <span>
              <small>Standard</small>
              <strong>{startupPlans.find((plan) => plan.mode === "standard")?.status ?? "pending"}</strong>
              <em>limited logon</em>
            </span>
            <span>
              <small>Admin</small>
              <strong>{startupPlans.find((plan) => plan.mode === "approved-admin")?.runLevel ?? "locked"}</strong>
              <em>approval still required</em>
            </span>
          </div>
          <div className="runtime-command-grid" aria-label="Runtime install start stop dry-run controls">
            {(["start", "stop", "restart", "emergency-stop"] as RuntimeControlKind[]).map((control) => (
              <button key={control} type="button" onClick={() => void dryRunRuntimeControl(control)}>
                <small>{controlLabel(control)}</small>
                <strong>{runtimeDryRuns[control]?.decision ?? "dry-run"}</strong>
              </button>
            ))}
          </div>
          <details className={`runtime-live-test-card compact-card status-${runtimeLiveTest?.status ?? "missing"}`} aria-label="Production live test">
            <summary>
              <Play size={15} aria-hidden="true" />
              <span>Live test</span>
              <b>{liveTestRunning ? "running" : runtimeLiveTest?.status ?? "missing"}</b>
            </summary>
            <small>
              {runtimeLiveTest
                ? `${runtimeLiveTest.checks.filter((check) => check.ok).length}/${runtimeLiveTest.checks.length} checks`
                : "Run a production live test from the app."}
            </small>
            <em>{runtimeLiveTest?.message ?? "Checks Brain, Gateway, live text, self-test, and Electron heartbeat."}</em>
            <button type="button" onClick={() => void runProductionLiveTest()} disabled={liveTestRunning}>
              {liveTestRunning ? "Running" : "Run live test"}
            </button>
            <div className="runtime-self-test-checks" aria-label="Production live test checks">
              {(runtimeLiveTest?.checks ?? []).slice(0, 6).map((check) => (
                <span key={check.name} className={check.ok ? "status-ready" : "status-blocked"}>
                  <small>{check.name}</small>
                  <strong>{check.ok ? "pass" : "fail"}</strong>
                </span>
              ))}
            </div>
          </details>
          <details className={`runtime-self-test-card compact-card status-${runtimeSelfTest?.topStatus ?? "staged"}`} aria-label="Runtime self-test">
            <summary>
              <CheckCircle2 size={15} aria-hidden="true" />
              <span>Self-test</span>
              <b>{runtimeSelfTest?.topStatus ?? "checking"}</b>
            </summary>
            <small>
              {runtimeSelfTest
                ? `${runtimeSelfTest.ready} ready / ${runtimeSelfTest.attention} attention / ${runtimeSelfTest.blocked} blocked`
                : "Checking connected runtime surfaces."}
            </small>
            <em>{runtimeSelfTest?.recommendation ?? "Fixes stay dry-run or approval-gated."}</em>
            <div className="runtime-self-test-checks" aria-label="Runtime self-test checks">
              {(runtimeSelfTest?.checks ?? []).map((check) => (
                <span key={check.id} className={`status-${check.status}`}>
                  <small>{check.label}</small>
                  <strong>{check.value}</strong>
                </span>
              ))}
            </div>
            <div className="runtime-self-test-fixes" aria-label="Runtime self-test fixes">
              {(runtimeSelfTest?.fixes ?? []).map((fix) => (
                <button key={fix.id} type="button" onClick={() => void triggerSelfTestFix(fix)}>
                  <small>{fix.label}</small>
                  <strong>{runtimeSelfTestFixes[fix.id] ?? fix.status}</strong>
                </button>
              ))}
            </div>
          </details>
          <details className={`runtime-attention-card compact-card status-${runtimeAttentionStatus(runtimeAttention)}`} aria-label="Runtime attention resolver">
            <summary>
              <CheckCircle2 size={15} aria-hidden="true" />
              <span>Attention</span>
              <b>{runtimeAttentionStatus(runtimeAttention)}</b>
            </summary>
            <small>
              {runtimeAttention
                ? `${runtimeAttention.summary.ready} ready / ${runtimeAttention.summary.attention} attention / ${runtimeAttention.summary.blocked} blocked`
                : "Checking runtime attention."}
            </small>
            <em>{runtimeAttention?.note ?? "Voice, model, wake, and feature gaps load here as compact next actions."}</em>
            <div className="runtime-attention-grid" aria-label="Runtime attention items">
              {(runtimeAttention?.priority ?? []).map((item) => {
                const dryRun = runtimeAttentionDryRuns[item.id];
                return (
                  <button key={item.id} type="button" className={`attention-${item.state}`} onClick={() => void dryRunRuntimeAttention(item)}>
                    <small>{item.category}</small>
                    <strong>{item.label}</strong>
                    <b>{dryRun?.decision ?? item.state}</b>
                  </button>
                );
              })}
            </div>
            {Object.entries(runtimeAttentionDryRuns).slice(-1).map(([itemId, dryRun]) => (
              <code key={itemId} className={`runtime-attention-preview risk-${dryRun.risk}`}>
                {dryRun.commandPreview}
              </code>
            ))}
          </details>
          <details className="packaging-readiness-card compact-card" aria-label="Packaging and wake readiness">
            <summary>
              <Play size={15} aria-hidden="true" />
              <span>Package</span>
              <b>{packagingReadiness?.productionCommandsReady ? "ready" : "check"}</b>
            </summary>
            <small>
              {packagingReadiness
                ? `${packagingReadiness.wakeReady} wake ready / ${packagingReadiness.wakeStaged} staged`
                : "Loading wake methods."}
            </small>
            <em>{packagingReadiness?.packageCommand ?? "Checking Electron HUD package command."}</em>
          </details>
          <details className="activation-readiness-card compact-card" aria-label="Wake and runtime activation">
            <summary>
              <Mic size={15} aria-hidden="true" />
              <span>Wake</span>
              <b>{activationReadiness ? `${activationReadiness.wakeReady}/${activationReadiness.wakeStaged}` : "--"}</b>
            </summary>
            <small>
              {activationReadiness
                ? `Ollama ${activationReadiness.ollamaStatus} / ${activationReadiness.adapterReady} adapter ready`
                : "Checking wake and runtime adapters."}
            </small>
            <em>{activationReadiness?.recommendation ?? "Reliable wake uses tray and orb today."}</em>
            <code>{activationReadiness?.repairCommand ?? "Repair previews load after readiness check."}</code>
            <div className="adapter-repair-grid" aria-label="Runtime adapter repair dry-runs">
              {(["ollama-path", "ollama-launch", "lmstudio-endpoint", "hotword-enable"] as RuntimeAdapterRepairKind[]).map((repair) => (
                <button key={repair} type="button" onClick={() => void dryRunAdapterRepair(repair)}>
                  <small>{repairLabel(repair)}</small>
                  <strong>{adapterRepairDryRuns[repair]?.decision ?? "dry-run"}</strong>
                </button>
              ))}
            </div>
            {Object.entries(adapterRepairDryRuns).slice(-1).map(([repair, dryRun]) => (
              <code key={repair} className={`adapter-repair-result risk-${dryRun.risk}`}>
                {dryRun.commandPreview}
              </code>
            ))}
          </details>
          <div className="agent-manager-strip" aria-label="Agent manager readiness">
            <span>
              <small>Agents</small>
              <strong>{agentManagerReadiness?.agentCount ?? "--"}</strong>
            </span>
            <span>
              <small>Voices</small>
              <strong>
                {agentManagerReadiness ? `${agentManagerReadiness.distinctVoices}/${agentManagerReadiness.totalVoices}` : "--"}
              </strong>
            </span>
            <span>
              <small>Approvals</small>
              <strong>{agentManagerReadiness?.approvalGatedSteps ?? "--"}</strong>
            </span>
            <span>
              <small>Flow</small>
              <strong>{agentManagerReadiness?.freezeRisk ?? "--"}</strong>
            </span>
          </div>
          <div className="agent-voice-strip" aria-label="Agent voice personalities">
            {(agentManagerReadiness?.agents ?? []).slice(0, 4).map((agent) => (
              <span key={agent.id}>
                <small>{agent.name}</small>
                <strong>{agent.voiceStatus}</strong>
                <em>{agent.voiceStyle}</em>
              </span>
            ))}
          </div>
          <div className="interaction-health-strip" aria-label="Interaction health">
            {(["text", "voice", "workflow-generate", "undo"] as const).map((surfaceId) => {
              const surface = interactionHealth?.surfaces.find((candidate) => candidate.id === surfaceId);
              return (
                <span key={surfaceId}>
                  <small>{surface?.label ?? interactionLabel(surfaceId)}</small>
                  <strong>{surface?.status ?? "--"}</strong>
                </span>
              );
            })}
          </div>
          <div className="interaction-metrics-strip" aria-label="Interaction response pressure">
            <span>
              <small>Queue</small>
              <strong>{interactionHealth ? `${interactionHealth.runningTasks}/${interactionHealth.queuedItems}` : "--"}</strong>
            </span>
            <span>
              <small>Approvals</small>
              <strong>{interactionHealth?.waitingApprovals ?? "--"}</strong>
            </span>
            <span>
              <small>Workflows</small>
              <strong>{interactionHealth ? `${interactionHealth.generatedWorkflows}/${interactionHealth.enabledWorkflows}` : "--"}</strong>
            </span>
            <span>
              <small>Freeze</small>
              <strong>{interactionHealth?.freezeRisk ?? "--"}</strong>
            </span>
          </div>
          <div className="setup-groups" aria-label="Setup action groups">
            {setupGroups.map((group) => (
              <span key={group.id}>
                <small>{group.label}</small>
                <strong>{group.kind === "needed-feature-downloads" ? `${group.items.filter((item) => item.status === "needed").length} needed` : `${group.items.length} future`}</strong>
              </span>
            ))}
          </div>
          <div className="setup-approval-summary" aria-label="Setup approval summary">
            <span>
              <small>Setup approvals</small>
              <strong>{setupApprovals.length}</strong>
            </span>
            <span>
              <small>Risk</small>
              <strong>{setupApprovals.length ? "gated" : "quiet"}</strong>
            </span>
            <em>{setupApprovals[0]?.title ?? "No setup approval waiting."}</em>
          </div>
          <div className="plugin-slot-grid" aria-label="Feature plug-in slots">
            {pluginSlots.slice(0, 6).map((slot) => (
              <details key={slot.id} className={`plugin-slot compact-card status-${slot.status}`}>
                <summary>
                  <i />
                  <span>{slot.label}</span>
                  <b>{slot.status}</b>
                </summary>
                <small>{slot.expectedPath}</small>
                <em>{slot.validationHint}</em>
              </details>
            ))}
          </div>
          <div className="setup-install-strip" aria-label="Approved setup install plans">
            {setupInstallPlans.slice(0, 4).map((plan) => (
              <details key={plan.id} className={`setup-install-card compact-card status-${plan.status}`}>
                <summary>
                  <i />
                  <span>{plan.label}</span>
                  <b>{plan.approvalRequired ? "approval" : "ready"}</b>
                </summary>
                <small>{plan.commandPreview}</small>
                <em>{plan.rollbackNote}</em>
                <button type="button" onClick={() => dryRunSetupPlan(plan)} aria-label={`Dry-run ${plan.label}`}>
                  Dry-run
                </button>
                {setupDryRuns[plan.id] && (
                  <strong className={`setup-dry-run-result risk-${setupDryRuns[plan.id].risk}`}>
                    {setupDryRuns[plan.id].decision}
                  </strong>
                )}
              </details>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

interface RuntimeConstellationResponse {
  constellation?: RuntimeConstellation;
}

interface RuntimeSmokeResponse {
  smoke?: RuntimeSmokeStatus;
}

interface RuntimeLiveTestResponse {
  liveTest?: RuntimeLiveTestStatus;
}

interface RuntimeServicesResponse {
  runtime?: RuntimeServicesStatus;
}

interface RuntimeControlDryRunResponse {
  dryRun?: RuntimeControlDryRun;
}

interface RuntimeDryRunSummary {
  decision: "allow" | "deny" | "requires_approval" | "unavailable";
  risk: "safe" | "approval-required" | "blocked";
  commandPreview: string;
  message: string;
}

interface ModelActivationPlan {
  id: string;
  label: string;
  recommendedRuntime: string;
  status: "ready-to-use" | "asset-ready" | "needs-runtime" | "too-heavy" | "missing-asset" | "disabled";
}

interface ModelActivationPlansResponse {
  plans?: ModelActivationPlan[];
}

interface VoiceReadinessResponse {
  readiness?: VoiceRuntimeReadiness;
}

interface VoiceSessionResponse {
  voiceSession?: VoiceSession;
  task?: {
    id: string;
    title: string;
  };
}

interface AgentVoiceEntry {
  agentId: string;
  agentName: string;
  status: "ready" | "staged" | "missing" | "missing-dependency";
  runtimeStatus?: "sample-fallback" | "sapi-fallback" | "kokoro-ready" | "piper-ready" | "staged-clone" | "missing";
  enginePreference: "windows-sapi" | "piper" | "voice-sample" | "future-clone" | "missing";
  ttsRequest: {
    agentId: string;
    voiceProfileId: string;
    text: string;
  };
}

interface AgentVoiceMatrixResponse {
  matrix?: {
    entries?: AgentVoiceEntry[];
  };
}

interface AgentTtsResponse {
  tts?: {
    status?: string;
  };
}

interface ChatQueuedResponse {
  task?: {
    id: string;
    title: string;
  };
}

interface SetupActionGroupsResponse {
  groups?: SetupActionGroup[];
}

interface FeaturePluginSlot {
  id: string;
  label: string;
  status: "ready" | "partial" | "missing" | "optional";
  expectedPath: string;
  validationHint: string;
}

interface FeaturePluginSlotsResponse {
  manifest?: {
    slots?: FeaturePluginSlot[];
  };
}

interface SetupInstallPlan {
  id: string;
  label: string;
  status: "ready" | "partial" | "missing" | "optional";
  approvalRequired: boolean;
  commandPreview: string;
  rollbackNote: string;
}

interface SetupInstallPlansResponse {
  manifest?: {
    plans?: SetupInstallPlan[];
  };
}

interface SetupDryRunResult {
  decision: "allow" | "deny" | "requires_approval" | "unavailable";
  risk: "safe" | "approval-required" | "blocked";
  note: string;
}

interface SetupDryRunResponse {
  dryRun?: {
    decision: {
      decision: "allow" | "deny" | "requires_approval";
      risk: "safe" | "approval-required" | "blocked";
    };
    notes?: string[];
  };
}

interface ArchitectureMapResponse {
  architecture?: {
    stackSummary: string;
    subsystems: Array<{ id: string }>;
    languageStrategy: Array<{ language: string }>;
    improvementBacklog: string[];
  };
}

interface ArchitectureSummary {
  stackSummary: string;
  subsystemCount: number;
  languages: string[];
  backlogCount: number;
}

interface CodeHealthResponse {
  codeHealth?: {
    scannedFiles: number;
    oversizedFiles: unknown[];
    duplicateBasenames: unknown[];
    staleMarkers: unknown[];
    cleanupBacklog: string[];
  };
}

interface CodeHealthSummary {
  scannedFiles: number;
  oversizedFiles: number;
  duplicateBasenames: number;
  staleMarkers: number;
  cleanupBacklog: string[];
}

interface StartupReadinessResponse {
  startup?: {
    summary: {
      startupConfigured: boolean;
      scriptsReady: boolean;
      backgroundPidFiles: number;
      runningPidFiles: number;
    };
    authority: {
      highTrustMode: "limited" | "approved-admin-ready";
    };
  };
}

interface StartupReadinessSummary {
  configured: boolean;
  scriptsReady: boolean;
  runningPidFiles: number;
  backgroundPidFiles: number;
  highTrustMode: "limited" | "approved-admin-ready";
}

interface AuthorityReadinessResponse {
  authority?: {
    mode: "limited-local" | "approved-admin-ready";
    actionSummary: {
      approvalRequired: number;
      adminApproved: number;
      reversible: number;
    };
    blockedCategories: string[];
    guardrails: string[];
  };
}

interface AuthorityReadinessSummary {
  mode: "limited-local" | "approved-admin-ready";
  approvalRequired: number;
  adminApproved: number;
  reversible: number;
  blockedCategories: number;
  guardrail: string;
}

interface ProcessVisibilityResponse {
  visibility?: {
    summary: {
      tracked: number;
      alive: number;
      visibleInTaskManager: number;
    };
    services: Array<{
      id: string;
      label: string;
      pidAlive: boolean;
      taskManagerGroup: "Apps" | "Background processes" | "Windows processes";
    }>;
  };
}

interface ProcessVisibilitySummary {
  tracked: number;
  alive: number;
  visibleInTaskManager: number;
  services: Array<{
    id: string;
    label: string;
    pidAlive: boolean;
    taskManagerGroup: "Apps" | "Background processes" | "Windows processes";
  }>;
}

interface StartupRegistrationPlansResponse {
  manifest?: {
    plans: Array<{
      id: string;
      label: string;
      mode: "standard" | "approved-admin";
      runLevel: "limited" | "highest";
      status: "ready" | "missing-script";
      approvalRequired: boolean;
    }>;
  };
}

interface StartupPlanSummary {
  id: string;
  label: string;
  mode: "standard" | "approved-admin";
  runLevel: "limited" | "highest";
  status: "ready" | "missing-script";
  approvalRequired: boolean;
}

interface PackagingReadinessResponse {
  packaging?: {
    electron: {
      commands: string[];
    };
    backgroundRuntime: {
      wakeMethods: Array<{ status: "ready" | "staged" }>;
    };
    summary: {
      electronShellReady: boolean;
      startupScriptsReady: boolean;
      productionCommandsReady: boolean;
    };
  };
}

interface PackagingReadinessSummary {
  electronShellReady: boolean;
  startupScriptsReady: boolean;
  productionCommandsReady: boolean;
  wakeReady: number;
  wakeStaged: number;
  packageCommand: string;
}

interface WakeRuntimeActivationResponse {
  activation?: {
    wake: {
      summary: {
        ready: number;
        staged: number;
        approvalGated: number;
      };
    };
    voice: {
      primaryStt: "ready" | "staged" | "repair-needed" | "missing";
      vad: "ready" | "staged" | "repair-needed" | "missing";
      wakeWord: "ready" | "staged" | "repair-needed" | "missing";
    };
    ollama: {
      status: "ready" | "staged" | "repair-needed" | "missing" | "found-off-path" | "installer-available";
      repairCommands: string[];
      note: string;
    };
    summary: {
      localModelAdaptersReady: number;
    };
    recommendations: string[];
  };
}

type RuntimeAdapterRepairKind = "ollama-path" | "ollama-launch" | "lmstudio-endpoint" | "hotword-enable";

interface AdapterRepairDryRunResponse {
  dryRun?: {
    decision: {
      decision: "allow" | "deny" | "requires_approval";
      risk: "safe" | "approval-required" | "blocked";
    };
    commandPreview: string;
    message: string;
  };
}

interface AdapterRepairDryRunSummary {
  decision: "allow" | "deny" | "requires_approval" | "unavailable";
  risk: "safe" | "approval-required" | "blocked";
  commandPreview: string;
  message: string;
}

interface WakeRuntimeActivationSummary {
  wakeReady: number;
  wakeStaged: number;
  approvalGated: number;
  hotwordStatus: "ready" | "staged" | "repair-needed" | "missing";
  primaryStt: "ready" | "staged" | "repair-needed" | "missing";
  vad: "ready" | "staged" | "repair-needed" | "missing";
  ollamaStatus: "ready" | "staged" | "repair-needed" | "missing" | "found-off-path" | "installer-available";
  ollamaNote: string;
  adapterReady: number;
  repairCommand: string;
  recommendation: string;
}

interface AgentManagerReadinessResponse {
  manager?: {
    manager: {
      connected: boolean;
    };
    agents: Array<{
      id: string;
      name: string;
      voiceStatus: "ready" | "staged" | "missing";
      voiceStyle: string;
    }>;
    voices: {
      totalAgents: number;
      coveredAgents: number;
      distinctProfileCount: number;
    };
    workflowAutonomy: {
      workflows: number;
      approvalGatedSteps: number;
      managerWorkflowReady: boolean;
    };
    responseHealth: {
      freezeRisk: "low" | "attention";
      waitingApprovals: number;
      note: string;
    };
    summary: {
      agentsReady: number;
      voicesCovered: boolean;
    };
  };
}

interface AgentManagerReadinessSummary {
  connected: boolean;
  agentCount: number;
  voicesCovered: boolean;
  coveredVoices: number;
  totalVoices: number;
  distinctVoices: number;
  approvalGatedSteps: number;
  workflows: number;
  managerWorkflowReady: boolean;
  freezeRisk: "low" | "attention";
  waitingApprovals: number;
  responseNote: string;
  agents: Array<{
    id: string;
    name: string;
    voiceStatus: "ready" | "staged" | "missing";
    voiceStyle: string;
  }>;
}

type InteractionSurfaceId = "text" | "voice" | "workflow-generate" | "workflow-execute" | "editing" | "undo" | "approvals" | "emergency-stop";
type InteractionSurfaceStatus = "ready" | "staged" | "attention" | "blocked";

interface InteractionHealthResponse {
  interaction?: {
    surfaces: Array<{
      id: InteractionSurfaceId;
      label: string;
      status: InteractionSurfaceStatus;
      detail: string;
    }>;
    metrics: {
      runningTasks: number;
      queuedItems: number;
      waitingApprovals: number;
      activeWorkflowRuns: number;
      generatedWorkflows: number;
      enabledWorkflows: number;
      availableUndos: number;
    };
    summary: {
      responsive: boolean;
      canTalkWhileWorking: boolean;
      workflowAutonomyApprovalGated: boolean;
      editingUndoReady: boolean;
      freezeRisk: "low" | "attention";
    };
  };
}

interface InteractionHealthSummary {
  surfaces: Array<{
    id: InteractionSurfaceId;
    label: string;
    status: InteractionSurfaceStatus;
  }>;
  runningTasks: number;
  queuedItems: number;
  waitingApprovals: number;
  activeWorkflowRuns: number;
  generatedWorkflows: number;
  enabledWorkflows: number;
  availableUndos: number;
  responsive: boolean;
  canTalkWhileWorking: boolean;
  workflowAutonomyApprovalGated: boolean;
  editingUndoReady: boolean;
  freezeRisk: "low" | "attention";
}

type RuntimeSelfTestStatus = "ready" | "attention" | "blocked" | "staged";

interface RuntimeSelfTestResponse {
  selfTest?: {
    summary: {
      ready: number;
      attention: number;
      blocked: number;
      staged: number;
      connected: boolean;
      topStatus: RuntimeSelfTestStatus;
    };
    checks: RuntimeSelfTestCheckSummary[];
    fixes: RuntimeSelfTestFixSummary[];
    recommendations: string[];
  };
}

interface RuntimeSelfTestCheckSummary {
  id: string;
  label: string;
  status: RuntimeSelfTestStatus;
  value: string;
  detail: string;
  fixIds: string[];
}

interface RuntimeSelfTestFixSummary {
  id: string;
  label: string;
  category: string;
  status: "dry-run" | "manual" | "approval-required";
  detail: string;
  dryRunEndpoint?: string;
  dryRunPayload?: Record<string, unknown>;
}

interface RuntimeSelfTestSummary {
  topStatus: RuntimeSelfTestStatus;
  connected: boolean;
  ready: number;
  attention: number;
  blocked: number;
  staged: number;
  checks: RuntimeSelfTestCheckSummary[];
  fixes: RuntimeSelfTestFixSummary[];
  recommendation: string;
}

type RuntimeAttentionState = "ready" | "attention" | "blocked" | "staged";

interface RuntimeAttentionItemSummary {
  id: string;
  category: string;
  label: string;
  state: RuntimeAttentionState;
}

interface RuntimeAttentionSummary {
  summary: Record<RuntimeAttentionState, number>;
  priority: RuntimeAttentionItemSummary[];
  note: string;
}

interface RuntimeAttentionResponse {
  attention?: {
    summary: Record<RuntimeAttentionState, number>;
    priority: RuntimeAttentionItemSummary[];
    note: string;
  };
}

interface RuntimeAttentionDryRunResponse {
  dryRun?: RuntimeAttentionDryRunSummary;
}

interface RuntimeAttentionDryRunSummary {
  decision: "allow" | "deny" | "requires_approval" | "unavailable" | "checking";
  risk: "safe" | "approval-required" | "blocked";
  commandPreview: string;
  message: string;
}

function Widget({ label, value }: { label: string; value: string }) {
  return (
    <span className="hud-widget">
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function compactDetail(value: string): string {
  return value.length > 64 ? `${value.slice(0, 61)}...` : value;
}

function controlLabel(control: RuntimeControlKind): string {
  if (control === "emergency-stop") {
    return "Emergency";
  }
  return `${control[0]?.toUpperCase() ?? ""}${control.slice(1)}`;
}

function repairLabel(repair: RuntimeAdapterRepairKind): string {
  const labels: Record<RuntimeAdapterRepairKind, string> = {
    "ollama-path": "Ollama PATH",
    "ollama-launch": "Launch Ollama",
    "lmstudio-endpoint": "LM Studio",
    "hotword-enable": "Hotword",
  };
  return labels[repair];
}

function interactionLabel(surfaceId: InteractionSurfaceId): string {
  const labels: Record<InteractionSurfaceId, string> = {
    text: "Text",
    voice: "Voice",
    "workflow-generate": "Generate",
    "workflow-execute": "Execute",
    editing: "Editing",
    undo: "Undo",
    approvals: "Approvals",
    "emergency-stop": "Stop",
  };
  return labels[surfaceId];
}

function runtimeAttentionStatus(attention: RuntimeAttentionSummary | null): RuntimeAttentionState {
  if (!attention) {
    return "staged";
  }
  if (attention.summary.blocked > 0) {
    return "blocked";
  }
  if (attention.summary.attention > 0) {
    return "attention";
  }
  if (attention.summary.staged > 0) {
    return "staged";
  }
  return "ready";
}
