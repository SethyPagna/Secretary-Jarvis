import { AlertTriangle, Bot, CheckCircle2, GitBranch, Play, Route, Save, ShieldAlert, SlidersHorizontal, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type PointerEvent } from "react";
import type { WorkflowDefinition, WorkflowDryRun, WorkflowGenerationResult, WorkflowRun, WorkflowStep } from "@jarvis/core";

interface WorkflowPayload {
  workflows: WorkflowDefinition[];
  runs: WorkflowRun[];
  dryRuns: WorkflowDryRun[];
}

interface CanvasNode {
  id: string;
  title: string;
  subtitle: string;
  kind: "trigger" | WorkflowStep["kind"];
  x: number;
  y: number;
  step?: WorkflowStep;
  risk: WorkflowDryRun["risk"];
  decision: "allow" | "requires_approval" | "deny";
}

interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
}

type NodePositions = Record<string, { x: number; y: number }>;

const canvasWidth = 1120;
const canvasHeight = 560;

export function WorkflowConsole({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [payload, setPayload] = useState<WorkflowPayload>({ workflows: [], runs: [], dryRuns: [] });
  const [activeId, setActiveId] = useState<string>("");
  const [busyId, setBusyId] = useState<string>("");
  const [generationPrompt, setGenerationPrompt] = useState("");
  const [generated, setGenerated] = useState<WorkflowGenerationResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [savingGenerated, setSavingGenerated] = useState(false);
  const [executingRunId, setExecutingRunId] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState("trigger");
  const [positions, setPositions] = useState<NodePositions>({});
  const [drag, setDrag] = useState<{ id: string; clientX: number; clientY: number; originX: number; originY: number } | null>(null);

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
  const { nodes, edges } = useMemo(() => buildCanvas(activeWorkflow, activeDryRun, positions), [activeDryRun, activeWorkflow, positions]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];
  const recentRuns = payload.runs.filter((run) => run.workflowId === activeWorkflow?.id).slice(0, 3);
  const activityRuns = payload.runs.slice(0, 5);

  useEffect(() => {
    if (!activeWorkflow) {
      return;
    }
    setSelectedNodeId("trigger");
    setPositions((current) => seedMissingPositions(activeWorkflow, current));
  }, [activeWorkflow?.id]);

  useEffect(() => {
    if (!drag) {
      return;
    }
    const activeDrag = drag;
    function onPointerMove(event: globalThis.PointerEvent) {
      const nextX = clamp(activeDrag.originX + event.clientX - activeDrag.clientX, 24, canvasWidth - 190);
      const nextY = clamp(activeDrag.originY + event.clientY - activeDrag.clientY, 30, canvasHeight - 130);
      setPositions((current) => ({ ...current, [activeDrag.id]: { x: nextX, y: nextY } }));
    }
    function onPointerUp() {
      setDrag(null);
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [drag]);

  async function startWorkflow(workflowId: string) {
    setBusyId(workflowId);
    await fetch(`${apiBaseUrl}/api/workflows/${encodeURIComponent(workflowId)}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: { source: "hud-workflow-canvas" } }),
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

  function resetLayout() {
    if (!activeWorkflow) {
      return;
    }
    setPositions(createDefaultPositions(activeWorkflow));
    setSelectedNodeId("trigger");
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, node: CanvasNode) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedNodeId(node.id);
    setDrag({ id: node.id, clientX: event.clientX, clientY: event.clientY, originX: node.x, originY: node.y });
  }

  return (
    <div className="workflow-console">
      <header className="workflow-console-header">
        <span>
          <Route size={18} />
          <strong>Workflow Gateway</strong>
        </span>
        <small>Drag nodes, inspect variables, queue runs, and keep generated automations approval-gated.</small>
      </header>

      <form className="workflow-generate" onSubmit={(event) => void generateWorkflow(event)}>
        <Wand2 size={15} aria-hidden="true" />
        <input value={generationPrompt} onChange={(event) => setGenerationPrompt(event.target.value)} placeholder="Describe a workflow..." aria-label="Describe a workflow" />
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

      <div className="workflow-topology">
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
                  <small>{workflow.enabled ? `${workflow.steps.length} nodes` : "approval needed"}</small>
                </span>
                <RiskIcon risk={dryRun?.risk ?? "safe"} />
              </button>
            );
          })}
        </div>

        <section className="workflow-canvas-shell" aria-label="Workflow canvas">
          <div className="workflow-canvas-toolbar">
            <span>
              <b>{activeWorkflow?.name ?? "No workflow"}</b>
              <small>{activeWorkflow ? activeWorkflow.tags.join(" / ") : "gateway waiting"}</small>
            </span>
            <div>
              <button type="button" onClick={resetLayout}>
                <SlidersHorizontal size={14} aria-hidden="true" />
                Layout
              </button>
              <button type="button" onClick={() => activeWorkflow && void startWorkflow(activeWorkflow.id)} disabled={!activeWorkflow?.enabled || busyId === activeWorkflow?.id}>
                <Play size={14} aria-hidden="true" />
                {activeWorkflow?.enabled ? (busyId === activeWorkflow.id ? "Queueing" : "Queue") : "Approval needed"}
              </button>
            </div>
          </div>

          <div className="workflow-canvas-scroll">
            <div className="workflow-canvas" style={{ width: canvasWidth, height: canvasHeight }}>
              <svg className="workflow-link-layer" viewBox={`0 0 ${canvasWidth} ${canvasHeight}`} aria-hidden="true">
                <defs>
                  <marker id="workflow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                    <path d="M 0 0 L 8 4 L 0 8 z" />
                  </marker>
                </defs>
                {edges.map((edge) => {
                  const from = nodes.find((node) => node.id === edge.from);
                  const to = nodes.find((node) => node.id === edge.to);
                  if (!from || !to) {
                    return null;
                  }
                  const startX = from.x + 166;
                  const startY = from.y + 56;
                  const endX = to.x;
                  const endY = to.y + 56;
                  const mid = Math.max(80, Math.abs(endX - startX) * 0.42);
                  const path = `M ${startX} ${startY} C ${startX + mid} ${startY}, ${endX - mid} ${endY}, ${endX} ${endY}`;
                  return <path key={edge.id} className={edge.dashed ? "workflow-link dashed" : "workflow-link"} d={path} markerEnd="url(#workflow-arrow)" />;
                })}
              </svg>

              {nodes.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  className={`workflow-node workflow-node-${node.risk} ${selectedNode?.id === node.id ? "selected" : ""}`}
                  style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
                  onPointerDown={(event) => startDrag(event, node)}
                  onClick={() => setSelectedNodeId(node.id)}
                  aria-label={`Workflow node ${node.title}`}
                >
                  <i className="workflow-port workflow-port-in" />
                  <NodeIcon kind={node.kind} />
                  <span>
                    <b>{node.title}</b>
                    <small>{node.subtitle}</small>
                  </span>
                  <i className="workflow-port workflow-port-out" />
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="workflow-node-detail" aria-label="Workflow node details">
          {selectedNode ? (
            <>
              <span className="workflow-detail-title">
                <b>{selectedNode.title}</b>
                <small>{selectedNode.kind} / {selectedNode.decision}</small>
              </span>
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
                  <strong>{activeWorkflow?.enabled ? "enabled" : "draft"}</strong>
                </span>
              </div>
              <div className="workflow-risk-strip">
                <Chip label={selectedNode.risk} tone={selectedNode.risk} />
                <Chip label={`${activeDryRun?.approvalStepIds.length ?? 0} approvals`} tone="approval-required" />
                <Chip label={`${activeDryRun?.blockedStepIds.length ?? 0} blocked`} tone="blocked" />
              </div>
              <div className="workflow-variable-grid" aria-label="Workflow variables">
                <span>
                  <small>Inputs</small>
                  <b>{selectedNode.step?.expectedInputs.join(", ") || "wake / manual"}</b>
                </span>
                <span>
                  <small>Outputs</small>
                  <b>{selectedNode.step?.expectedOutputs.join(", ") || "workflow run"}</b>
                </span>
                <span>
                  <small>Agent</small>
                  <b>{selectedNode.step?.agentId ?? selectedNode.step?.connectorId ?? selectedNode.step?.subWorkflowId ?? "Jarvis"}</b>
                </span>
                <span>
                  <small>Undo</small>
                  <b>{selectedNode.step?.reversible ? "20 min" : "not reversible"}</b>
                </span>
              </div>
            </>
          ) : (
            <span className="workflow-empty">Select a node.</span>
          )}
        </aside>
      </div>

      <div className="workflow-runs" aria-label="Workflow run queue">
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

function buildCanvas(workflow: WorkflowDefinition | undefined, dryRun: WorkflowDryRun | undefined, positions: NodePositions) {
  if (!workflow) {
    return { nodes: [], edges: [] as CanvasEdge[] };
  }
  const defaults = createDefaultPositions(workflow);
  const nodes: CanvasNode[] = [
    {
      id: "trigger",
      title: "Start",
      subtitle: workflow.taskProfile,
      kind: "trigger",
      x: positions.trigger?.x ?? defaults.trigger.x,
      y: positions.trigger?.y ?? defaults.trigger.y,
      risk: "safe",
      decision: "allow",
    },
    ...workflow.steps.map((step, index) => {
      const dryStep = dryRun?.steps.find((candidate) => candidate.stepId === step.id);
      const fallback = defaults[step.id] ?? { x: 260 + index * 220, y: index % 2 ? 252 : 122 };
      return {
        id: step.id,
        title: step.title,
        subtitle: step.agentId ?? step.connectorId ?? step.subWorkflowId ?? step.kind,
        kind: step.kind,
        x: positions[step.id]?.x ?? fallback.x,
        y: positions[step.id]?.y ?? fallback.y,
        step,
        risk: dryStep?.risk ?? "safe",
        decision: dryStep?.decision ?? "allow",
      };
    }),
  ];
  const edges: CanvasEdge[] = [];
  if (workflow.steps[0]) {
    edges.push({ id: "trigger-edge", from: "trigger", to: workflow.steps[0].id });
  }
  workflow.steps.slice(0, -1).forEach((step, index) => {
    const next = workflow.steps[index + 1];
    edges.push({ id: `${step.id}-${next.id}`, from: step.id, to: next.id, dashed: step.requiresApproval });
  });
  return { nodes, edges };
}

function createDefaultPositions(workflow: WorkflowDefinition): NodePositions {
  const positions: NodePositions = { trigger: { x: 48, y: 210 } };
  workflow.steps.forEach((step, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    positions[step.id] = {
      x: 268 + column * 214,
      y: 108 + row * 154 + (column % 2 ? 58 : 0),
    };
  });
  return positions;
}

function seedMissingPositions(workflow: WorkflowDefinition, current: NodePositions): NodePositions {
  const defaults = createDefaultPositions(workflow);
  return Object.fromEntries(Object.entries(defaults).map(([id, position]) => [id, current[id] ?? position]));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function NodeIcon({ kind }: { kind: CanvasNode["kind"] }) {
  if (kind === "approval") {
    return <ShieldAlert size={20} aria-hidden="true" />;
  }
  if (kind === "connector-action" || kind === "sub-workflow") {
    return <GitBranch size={20} aria-hidden="true" />;
  }
  return <Bot size={20} aria-hidden="true" />;
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
