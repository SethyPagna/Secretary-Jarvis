import { AlertTriangle, CheckCircle2, Play, Route, Save, ShieldAlert, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { WorkflowDefinition, WorkflowDryRun, WorkflowGenerationResult, WorkflowRun } from "@jarvis/core";

interface WorkflowPayload {
  workflows: WorkflowDefinition[];
  runs: WorkflowRun[];
  dryRuns: WorkflowDryRun[];
}

export function WorkflowConsole({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [payload, setPayload] = useState<WorkflowPayload>({ workflows: [], runs: [], dryRuns: [] });
  const [activeId, setActiveId] = useState<string>("");
  const [busyId, setBusyId] = useState<string>("");
  const [generationPrompt, setGenerationPrompt] = useState("");
  const [generated, setGenerated] = useState<WorkflowGenerationResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [savingGenerated, setSavingGenerated] = useState(false);
  const [executingRunId, setExecutingRunId] = useState("");

  async function load() {
    const response = await fetch(`${apiBaseUrl}/api/workflows`);
    if (!response.ok) {
      throw new Error(`Workflow API ${response.status}`);
    }
    const next = (await response.json()) as WorkflowPayload;
    setPayload(next);
    setActiveId((current) => current || next.workflows[0]?.id || "");
  }

  useEffect(() => {
    void load().catch(() => undefined);
  }, [apiBaseUrl]);

  const activeWorkflow = payload.workflows.find((workflow) => workflow.id === activeId) ?? payload.workflows[0];
  const activeDryRun = useMemo(
    () => payload.dryRuns.find((dryRun) => dryRun.workflowId === activeWorkflow?.id),
    [activeWorkflow?.id, payload.dryRuns],
  );
  const recentRuns = payload.runs.filter((run) => run.workflowId === activeWorkflow?.id).slice(0, 3);
  const activityRuns = payload.runs.slice(0, 5);

  async function startWorkflow(workflowId: string) {
    setBusyId(workflowId);
    await fetch(`${apiBaseUrl}/api/workflows/${encodeURIComponent(workflowId)}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: { source: "hud-workflow-console" } }),
    }).catch(() => undefined);
    await load().catch(() => undefined);
    setBusyId("");
  }

  async function generateWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = generationPrompt.trim();
    if (!prompt) {
      return;
    }
    setGenerating(true);
    const response = await fetch(`${apiBaseUrl}/api/workflows/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (response.ok) {
      setGenerated((await response.json()) as WorkflowGenerationResult);
    }
    setGenerating(false);
  }

  async function saveGeneratedWorkflow() {
    if (!generated) {
      return;
    }
    setSavingGenerated(true);
    const response = await fetch(`${apiBaseUrl}/api/workflows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workflow: { ...generated.workflow, owner: "generated", enabled: false } }),
    });
    if (response.ok) {
      setActiveId(generated.workflow.id);
      setGenerated(null);
      setGenerationPrompt("");
      await load().catch(() => undefined);
    }
    setSavingGenerated(false);
  }

  async function executeRun(workflowId: string, runId: string) {
    setExecutingRunId(runId);
    await fetch(`${apiBaseUrl}/api/workflows/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(runId)}/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).catch(() => undefined);
    await load().catch(() => undefined);
    setExecutingRunId("");
  }

  return (
    <div className="workflow-console">
      <header>
        <Route size={18} />
        <strong>Workflows</strong>
      </header>
      <form className="workflow-generate" onSubmit={(event) => void generateWorkflow(event)}>
        <Wand2 size={15} aria-hidden="true" />
        <input
          value={generationPrompt}
          onChange={(event) => setGenerationPrompt(event.target.value)}
          placeholder="Describe a workflow..."
          aria-label="Describe a workflow"
        />
        <button type="submit" disabled={generating || !generationPrompt.trim()}>
          {generating ? "Drafting" : "Generate"}
        </button>
      </form>
      {generated && (
        <div className="workflow-generated-card" aria-label="Generated workflow proposal">
          <span>
            <b>{generated.workflow.name}</b>
            <small>{generated.note}</small>
          </span>
          <Chip label={generated.dryRun.risk} tone={generated.dryRun.risk} />
          <span className="workflow-proposal-lock" aria-label="Generated workflow approval state">
            <small>owner approval</small>
            <b>{generated.dryRun.approvalStepIds.length} gated</b>
          </span>
          <button type="button" onClick={() => void saveGeneratedWorkflow()} disabled={savingGenerated}>
            <Save size={14} aria-hidden="true" />
            {savingGenerated ? "Saving" : "Save draft"}
          </button>
        </div>
      )}
      <div className="workflow-layout">
        <div className="workflow-list" aria-label="Workflow list">
          {payload.workflows.map((workflow) => {
            const dryRun = payload.dryRuns.find((candidate) => candidate.workflowId === workflow.id);
            return (
              <button
                key={workflow.id}
                type="button"
                className={workflow.id === activeWorkflow?.id ? "workflow-card selected" : "workflow-card"}
                onClick={() => setActiveId(workflow.id)}
              >
                <span>
                  <b>{workflow.name}</b>
                  <small>{workflow.enabled ? `${workflow.steps.length} steps` : "approval needed"}</small>
                </span>
                <RiskIcon risk={dryRun?.risk ?? "safe"} />
              </button>
            );
          })}
        </div>
        <div className="workflow-detail">
          {activeWorkflow ? (
            <>
              <div className="workflow-title-row">
                <span>
                  <b>{activeWorkflow.name}</b>
                  <small>{activeWorkflow.tags.join(" / ")}</small>
                </span>
                <button type="button" onClick={() => void startWorkflow(activeWorkflow.id)} disabled={busyId === activeWorkflow.id || !activeWorkflow.enabled}>
                  <Play size={15} />
                  {activeWorkflow.enabled ? (busyId === activeWorkflow.id ? "Queueing" : "Queue") : "Approval needed"}
                </button>
              </div>
              <div className="workflow-manager-note" aria-label="Workflow manager delegation">
                <span>
                  <small>Manager</small>
                  <strong>Jarvis</strong>
                </span>
                <span>
                  <small>Reviewer</small>
                  <strong>Sentinel</strong>
                </span>
                <span>
                  <small>State</small>
                  <strong>{activeWorkflow.enabled ? "enabled" : "draft"}</strong>
                </span>
              </div>
              <div className="workflow-risk-strip">
                <Chip label={activeDryRun?.risk ?? "safe"} tone={activeDryRun?.risk ?? "safe"} />
                <Chip label={`${activeDryRun?.approvalStepIds.length ?? 0} approvals`} tone="approval-required" />
                <Chip label={`${activeDryRun?.blockedStepIds.length ?? 0} blocked`} tone="blocked" />
              </div>
              <div className="workflow-step-map">
                {activeWorkflow.steps.map((step) => {
                  const dryStep = activeDryRun?.steps.find((candidate) => candidate.stepId === step.id);
                  return (
                    <span key={step.id} className={`workflow-step workflow-step-${dryStep?.risk ?? "safe"}`}>
                      <i />
                      <b>{step.title}</b>
                      <small>{dryStep?.decision ?? "allow"}</small>
                    </span>
                  );
                })}
              </div>
              <div className="workflow-runs">
                {recentRuns.length ? (
                  recentRuns.map((run) => (
                    <span key={run.id} className="workflow-run-row">
                      <b>{run.status}</b>
                      <small>{run.currentStepId ?? "ready"}</small>
                      {run.status === "queued" && (
                        <button type="button" onClick={() => void executeRun(run.workflowId, run.id)} disabled={executingRunId === run.id}>
                          {executingRunId === run.id ? "Running" : "Run"}
                        </button>
                      )}
                    </span>
                  ))
                ) : (
                  <span>No recent runs.</span>
                )}
              </div>
            </>
          ) : (
            <span className="workflow-empty">Workflow engine is waiting for the gateway.</span>
          )}
        </div>
      </div>
      <div className="workflow-activity-log" aria-label="Workflow activity log">
        {activityRuns.length ? (
          activityRuns.map((run) => {
            const workflow = payload.workflows.find((candidate) => candidate.id === run.workflowId);
            return (
              <span key={run.id}>
                <i className={`workflow-status-dot workflow-status-${run.status}`} />
                <b>{workflow?.name ?? run.workflowId}</b>
                <small>{run.status}</small>
              </span>
            );
          })
        ) : (
          <span>
            <i className="workflow-status-dot" />
            <b>Activity Log</b>
            <small>Waiting</small>
          </span>
        )}
      </div>
    </div>
  );
}

function RiskIcon({ risk }: { risk: WorkflowDryRun["risk"] }) {
  if (risk === "blocked") {
    return <AlertTriangle size={17} className="risk-blocked" aria-label="blocked" />;
  }
  if (risk === "approval-required") {
    return <ShieldAlert size={17} className="risk-approval" aria-label="approval required" />;
  }
  return <CheckCircle2 size={17} className="risk-safe" aria-label="safe" />;
}

function Chip({ label, tone }: { label: string; tone: WorkflowDryRun["risk"] }) {
  return <span className={`workflow-chip workflow-chip-${tone}`}>{label}</span>;
}
