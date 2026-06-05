import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { WheelEvent } from "react";
import {
  Bot,
  CalendarClock,
  Clock,
  GitBranch,
  Maximize2,
  MessageCircle,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Send,
  Trash2,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@jarvis_managed-research/ui/ui/components/badge";
import { Button } from "@jarvis_managed-research/ui/ui/components/button";
import { Select, SelectOption } from "@jarvis_managed-research/ui/ui/components/select";
import { Spinner } from "@jarvis_managed-research/ui/ui/components/spinner";
import { H2 } from "@/components/NouiTypography";
import { api } from "@/lib/api";
import type {
  CronJob,
  ProfileInfo,
  WorkflowCanvasPayload,
  WorkflowLastRun,
  WorkflowTeamState,
} from "@/lib/api";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { useToast } from "@/hooks/useToast";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { Toast } from "@/components/Toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { usePageHeader } from "@/contexts/usePageHeader";
import { useRuntimeSnapshot } from "@/contexts/RuntimeProvider";
import { PluginSlot } from "@/plugins";
import { cn, themedBody } from "@/lib/utils";

function formatTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength
    ? value.slice(0, maxLength) + "..."
    : value;
}

function getJobPrompt(job: CronJob): string {
  return asText(job.prompt);
}

function getJobName(job: CronJob): string {
  return asText(job.name).trim();
}

function getJobTitle(job: CronJob): string {
  const name = getJobName(job);
  if (name) return name;

  const prompt = getJobPrompt(job);
  if (prompt) return truncateText(prompt, 60);

  const script = asText(job.script);
  if (script) return truncateText(script, 60);

  return job.id || "Cron job";
}

function getJobScheduleDisplay(job: CronJob): string {
  return (
    asText(job.schedule_display) ||
    asText(job.schedule?.display) ||
    asText(job.schedule?.expr) ||
    "—"
  );
}

function getJobState(job: CronJob): string {
  return asText(job.state) || (job.enabled === false ? "disabled" : "scheduled");
}

function getJobProfile(job: CronJob): string {
  return asText(job.profile) || asText(job.profile_name) || "default";
}

function getJobKey(job: CronJob): string {
  return `${getJobProfile(job)}:${job.id}`;
}

function splitJobKey(key: string): { profile: string; id: string } {
  const idx = key.indexOf(":");
  if (idx === -1) return { profile: "default", id: key };
  return { profile: key.slice(0, idx) || "default", id: key.slice(idx + 1) };
}

function profileLabel(profile: string): string {
  return profile === "default" ? "default" : profile;
}

const STATUS_TONE: Record<string, "success" | "warning" | "destructive"> = {
  enabled: "success",
  scheduled: "success",
  paused: "warning",
  error: "destructive",
  completed: "destructive",
};

export default function CronPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [selectedProfile, setSelectedProfile] = useState("all");
  const [loading, setLoading] = useState(true);
  const { toast, showToast } = useToast();
  const { t } = useI18n();
  const { setEnd } = usePageHeader();

  // New job modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [schedule, setSchedule] = useState("");
  const [name, setName] = useState("");
  const closeCreateModal = useCallback(() => setCreateModalOpen(false), []);
  const createModalRef = useModalBehavior({
    open: createModalOpen,
    onClose: closeCreateModal,
  });
  const [deliver, setDeliver] = useState("local");
  const [creating, setCreating] = useState(false);
  const createProfile = selectedProfile === "all" ? "default" : selectedProfile;

  const loadJobs = useCallback(() => {
    api
      .getCronJobs(selectedProfile)
      .then(setJobs)
      .catch(() => showToast(t.common.loading, "error"))
      .finally(() => setLoading(false));
  }, [selectedProfile, showToast, t.common.loading]);

  useEffect(() => {
    api
      .getProfiles()
      .then((res) => setProfiles(res.profiles))
      .catch(() => setProfiles([]));
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const handleCreate = async () => {
    if (!prompt.trim() || !schedule.trim()) {
      showToast(`${t.cron.prompt} & ${t.cron.schedule} required`, "error");
      return;
    }
    setCreating(true);
    try {
      await api.createCronJob(
        {
          prompt: prompt.trim(),
          schedule: schedule.trim(),
          name: name.trim() || undefined,
          deliver,
        },
        createProfile,
      );
      showToast(t.common.create + " ✓", "success");
      setPrompt("");
      setSchedule("");
      setName("");
      setDeliver("local");
      setCreateModalOpen(false);
      loadJobs();
    } catch (e) {
      showToast(`${t.config.failedToSave}: ${e}`, "error");
    } finally {
      setCreating(false);
    }
  };

  const handlePauseResume = async (job: CronJob) => {
    try {
      const isPaused = getJobState(job) === "paused";
      const profile = getJobProfile(job);
      if (isPaused) {
        await api.resumeCronJob(job.id, profile);
        showToast(
          `${t.cron.resume}: "${truncateText(getJobTitle(job), 30)}"`,
          "success",
        );
      } else {
        await api.pauseCronJob(job.id, profile);
        showToast(
          `${t.cron.pause}: "${truncateText(getJobTitle(job), 30)}"`,
          "success",
        );
      }
      loadJobs();
    } catch (e) {
      showToast(`${t.status.error}: ${e}`, "error");
    }
  };

  const handleTrigger = async (job: CronJob) => {
    try {
      await api.triggerCronJob(job.id, getJobProfile(job));
      showToast(
        `${t.cron.triggerNow}: "${truncateText(getJobTitle(job), 30)}"`,
        "success",
      );
      loadJobs();
    } catch (e) {
      showToast(`${t.status.error}: ${e}`, "error");
    }
  };

  const jobDelete = useConfirmDelete({
    onDelete: useCallback(
      async (key: string) => {
        const { profile, id } = splitJobKey(key);
        const job = jobs.find((j) => getJobKey(j) === key);
        try {
          await api.deleteCronJob(id, profile);
          showToast(
            `${t.common.delete}: "${job ? truncateText(getJobTitle(job), 30) : id}"`,
            "success",
          );
          loadJobs();
        } catch (e) {
          showToast(`${t.status.error}: ${e}`, "error");
          throw e;
        }
      },
      [jobs, loadJobs, showToast, t.common.delete, t.status.error],
    ),
  });

  // Put "Create" button in page header
  useLayoutEffect(() => {
    setEnd(
      <Button
        className="uppercase"
        size="sm"
        onClick={() => setCreateModalOpen(true)}
      >
        {t.common.create}
      </Button>,
    );
    return () => {
      setEnd(null);
    };
  }, [setEnd, t.common.create, loading]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="text-2xl text-primary" />
      </div>
    );
  }

  const pendingJob = jobDelete.pendingId
    ? jobs.find((j) => getJobKey(j) === jobDelete.pendingId)
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PluginSlot name="cron:top" />
      <Toast toast={toast} />
      <WorkflowCanvasOverview onCreate={() => setCreateModalOpen(true)} />

      <DeleteConfirmDialog
        open={jobDelete.isOpen}
        onCancel={jobDelete.cancel}
        onConfirm={jobDelete.confirm}
        title={t.cron.confirmDeleteTitle}
        description={
          pendingJob
            ? `"${truncateText(getJobTitle(pendingJob), 40)}" — ${
                t.cron.confirmDeleteMessage
              }`
            : t.cron.confirmDeleteMessage
        }
        loading={jobDelete.isDeleting}
      />

      {/* Create job modal */}
      {createModalOpen && (
        <div
          ref={createModalRef}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/85 backdrop-blur-sm p-4"
          onClick={(e) => e.target === e.currentTarget && setCreateModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-cron-title"
        >
          <div className={cn(themedBody, "relative w-full max-w-lg border border-border bg-card shadow-2xl flex flex-col")}>
            <Button
              ghost
              size="icon"
              onClick={() => setCreateModalOpen(false)}
              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X />
            </Button>

            <header className="p-5 pb-3 border-b border-border">
              <h2
                id="create-cron-title"
                className="font-mondwest text-display text-base tracking-wider"
              >
                {t.cron.newJob}
              </h2>
            </header>

            <div className="p-5 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="cron-profile">Profile</Label>
                <Select
                  id="cron-profile"
                  value={createProfile}
                  onValueChange={(v) => setSelectedProfile(v)}
                >
                  {profiles.map((profile) => (
                    <SelectOption key={profile.name} value={profile.name}>
                      {profileLabel(profile.name)}
                    </SelectOption>
                  ))}
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cron-name">{t.cron.nameOptional}</Label>
                <Input
                  id="cron-name"
                  autoFocus
                  placeholder={t.cron.namePlaceholder}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cron-prompt">{t.cron.prompt}</Label>
                <textarea
                  id="cron-prompt"
                  className="flex min-h-[80px] w-full border border-border bg-background/40 px-3 py-2 text-sm font-courier shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30 focus-visible:border-foreground/25"
                  placeholder={t.cron.promptPlaceholder}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="cron-schedule">{t.cron.schedule}</Label>
                  <Input
                    id="cron-schedule"
                    placeholder={t.cron.schedulePlaceholder}
                    value={schedule}
                    onChange={(e) => setSchedule(e.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="cron-deliver">{t.cron.deliverTo}</Label>
                  <Select
                    id="cron-deliver"
                    value={deliver}
                    onValueChange={(v) => setDeliver(v)}
                  >
                    <SelectOption value="local">
                      {t.cron.delivery.local}
                    </SelectOption>
                    <SelectOption value="telegram">
                      {t.cron.delivery.telegram}
                    </SelectOption>
                    <SelectOption value="discord">
                      {t.cron.delivery.discord}
                    </SelectOption>
                    <SelectOption value="slack">
                      {t.cron.delivery.slack}
                    </SelectOption>
                    <SelectOption value="email">
                      {t.cron.delivery.email}
                    </SelectOption>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  className="uppercase"
                  size="sm"
                  onClick={handleCreate}
                  disabled={creating}
                  prefix={creating ? <Spinner /> : undefined}
                >
                  {creating ? t.common.creating : t.common.create}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <H2
            variant="sm"
            className="flex items-center gap-2 text-muted-foreground"
          >
            <Clock className="h-4 w-4" />
            {t.cron.scheduledJobs} ({jobs.length})
          </H2>

          <div className="grid gap-1 min-w-[220px]">
            <Label htmlFor="cron-profile-filter">Profile</Label>
            <Select
              id="cron-profile-filter"
              value={selectedProfile}
              onValueChange={(v) => setSelectedProfile(v)}
            >
              <SelectOption value="all">All profiles</SelectOption>
              {profiles.map((profile) => (
                <SelectOption key={profile.name} value={profile.name}>
                  {profileLabel(profile.name)}
                </SelectOption>
              ))}
            </Select>
          </div>
        </div>

        {jobs.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {t.cron.noJobs}
            </CardContent>
          </Card>
        )}

        {jobs.map((job) => {
          const state = getJobState(job);
          const promptText = getJobPrompt(job);
          const title = getJobTitle(job);
          const hasName = Boolean(getJobName(job));
          const deliver = asText(job.deliver);
          const profile = getJobProfile(job);
          const jobKey = getJobKey(job);

          return (
            <Card key={jobKey}>
              <CardContent className="flex items-start gap-4 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm truncate">
                      {title}
                    </span>
                    <Badge tone={STATUS_TONE[state] ?? "secondary"}>
                      {state}
                    </Badge>
                    <Badge tone="outline">{profileLabel(profile)}</Badge>
                    {deliver && deliver !== "local" && (
                      <Badge tone="outline">{deliver}</Badge>
                    )}
                  </div>
                  {hasName && promptText && (
                    <p className="text-xs text-muted-foreground truncate mb-1">
                      {truncateText(promptText, 100)}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="font-mono">{getJobScheduleDisplay(job)}</span>
                    <span>
                      {t.cron.last}: {formatTime(job.last_run_at)}
                    </span>
                    <span>
                      {t.cron.next}: {formatTime(job.next_run_at)}
                    </span>
                  </div>
                  {job.last_error && (
                    <p className="text-xs text-destructive mt-1">
                      {job.last_error}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    ghost
                    size="icon"
                    title={state === "paused" ? t.cron.resume : t.cron.pause}
                    aria-label={
                      state === "paused" ? t.cron.resume : t.cron.pause
                    }
                    onClick={() => handlePauseResume(job)}
                    className={
                      state === "paused" ? "text-success" : "text-warning"
                    }
                  >
                    {state === "paused" ? <Play /> : <Pause />}
                  </Button>

                  <Button
                    ghost
                    size="icon"
                    title={t.cron.triggerNow}
                    aria-label={t.cron.triggerNow}
                    onClick={() => handleTrigger(job)}
                  >
                    <Zap />
                  </Button>

                  <Button
                    ghost
                    destructive
                    size="icon"
                    title={t.common.delete}
                    aria-label={t.common.delete}
                    onClick={() => jobDelete.requestDelete(jobKey)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <PluginSlot name="cron:bottom" />
    </div>
  );
}

function WorkflowCanvasOverview({ onCreate }: { onCreate: () => void }) {
  const [initialCanvas] = useState(loadWorkflowCanvasState);
  const [zoom, setZoom] = useState(initialCanvas.zoom);
  const [selectedNodeId, setSelectedNodeId] = useState(initialCanvas.selectedNodeId);
  const [nodes, setNodes] = useState<WorkflowNode[]>(initialCanvas.nodes);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [syncState, setSyncState] = useState<"local" | "loading" | "saved" | "error">("loading");
  const [lastRun, setLastRun] = useState<WorkflowLastRun | null>(null);
  const [lastTeamState, setLastTeamState] = useState<WorkflowTeamState | null>(null);
  const [lastMessage, setLastMessage] = useState("");
  const { refreshRuntime } = useRuntimeSnapshot();
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];
  const executedNodeById = useMemo(
    () => new Map((lastRun?.executed_nodes ?? []).map((node) => [node.id, node])),
    [lastRun?.executed_nodes],
  );
  const selectedNodeRun = selectedNode ? executedNodeById.get(selectedNode.id) : undefined;
  const palette = ["Trigger", "LLM", "Soul", "Skill", "HTTP", "File", "TTS", "Approval"];

  const canvasPayload = useCallback((): WorkflowCanvasPayload => ({
    id: "desktop-canvas",
    nodes: nodes.map(({ id, label, title, tone }) => ({ id, label, title, tone })),
    selectedNodeId: selectedNode?.id ?? selectedNodeId,
    zoom,
  }), [nodes, selectedNode?.id, selectedNodeId, zoom]);

  useEffect(() => {
    let cancelled = false;
    api
      .getWorkflowCanvas("desktop-canvas")
      .then((canvas) => {
        if (cancelled) return;
        const backendNodes = canvas.nodes
          .map(normalizeStoredWorkflowNode)
          .filter((node): node is WorkflowNode => Boolean(node));
        if (backendNodes.length) {
          setNodes(backendNodes);
          setSelectedNodeId(canvas.selectedNodeId);
          setZoom(clampWorkflowZoom(canvas.zoom));
          setLastRun(canvas.last_run);
          setSyncState("saved");
        } else {
          setSyncState("local");
        }
      })
      .catch(() => {
        if (!cancelled) setSyncState("local");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const serializableNodes: StoredWorkflowNode[] = nodes.map(({ id, label, title, tone }) => ({
      id,
      label,
      title,
      tone,
    }));
    window.localStorage.setItem(
      WORKFLOW_CANVAS_STORAGE_KEY,
      JSON.stringify({
        nodes: serializableNodes,
        selectedNodeId: selectedNode?.id ?? selectedNodeId,
        zoom,
      }),
    );
  }, [nodes, selectedNode?.id, selectedNodeId, zoom]);

  const addNode = (label: string) => {
    const id = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
    setSyncState("local");
    setNodes((current) => [
      ...current,
      {
        id,
        icon: workflowIconForLabel(label),
        label,
        title: `${label} node`,
        tone: "cyan",
      },
    ]);
    setSelectedNodeId(id);
  };
  const updateSelectedNode = (patch: Partial<Pick<WorkflowNode, "label" | "title" | "tone">>) => {
    if (!selectedNode) return;
    setSyncState("local");
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              ...patch,
            }
          : node,
      ),
    );
  };
  const saveWorkflow = async () => {
    setSaving(true);
    setSyncState("loading");
    try {
      const saved = await api.saveWorkflowCanvas("desktop-canvas", canvasPayload());
      setLastRun(saved.last_run);
      setSyncState("saved");
      setLastMessage("Workflow saved to JARVIS.");
      await refreshRuntime();
    } catch (error) {
      setSyncState("error");
      setLastMessage(error instanceof Error ? error.message : "Workflow save failed.");
    } finally {
      setSaving(false);
    }
  };
  const runWorkflow = async () => {
    setRunning(true);
    setSyncState("loading");
    try {
      const result = await api.runWorkflowCanvas("desktop-canvas", canvasPayload());
      setLastRun(result.canvas.last_run);
      setLastTeamState(result.team_state ?? null);
      setSyncState("saved");
      setLastMessage(result.message);
      await refreshRuntime();
    } catch (error) {
      setSyncState("error");
      setLastMessage(error instanceof Error ? error.message : "Workflow run failed.");
    } finally {
      setRunning(false);
    }
  };
  const removeSelectedNode = () => {
    if (!selectedNode || nodes.length <= 1) return;
    setSyncState("local");
    const nextNodes = nodes.filter((node) => node.id !== selectedNode.id);
    setNodes(nextNodes);
    setSelectedNodeId(nextNodes[0]?.id ?? "");
  };
  const zoomWorkflow = (step: number) => {
    setSyncState("local");
    setZoom((value) => clampWorkflowZoom(Number((value + step).toFixed(2))));
  };
  const fitWorkflowView = () => {
    setSyncState("local");
    const fittedZoom = nodes.length > 8 ? 0.72 : nodes.length > 5 ? 0.82 : 1;
    setZoom(clampWorkflowZoom(fittedZoom));
  };
  const resetWorkflowView = () => {
    setSyncState("local");
    setZoom(1);
  };
  const handleWorkflowWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoomWorkflow(event.deltaY > 0 ? -0.08 : 0.08);
  };
  const canvasColumns = Math.max(4, nodes.length);
  const canvasMinWidth = Math.max(720, canvasColumns * 180);
  const canvasMinHeight = Math.max(260, Math.ceil(nodes.length / 4) * 150);

  return (
    <section className="overflow-hidden rounded-md border border-white/10 bg-[#10151d]/88 shadow-[0_20px_70px_rgba(0,0,0,0.22)]">
      <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.1em] text-white">
            <Zap className="h-4 w-4 text-cyan-200" />
            Workflow Builder
          </div>
          <p className="mt-1 text-sm text-slate-300/72">
            Build automations from inputs, JARVIS reasoning, skills, approvals, and replies.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={saveWorkflow}
            disabled={saving}
            className="inline-flex h-9 items-center justify-center gap-2 border border-cyan-200/20 bg-cyan-200/10 px-3 text-xs font-semibold uppercase tracking-[0.08em] text-cyan-50 transition hover:border-cyan-200/40 hover:bg-cyan-200/16 disabled:cursor-wait disabled:opacity-55"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving" : "Save"}
          </button>
          <button
            type="button"
            onClick={runWorkflow}
            disabled={running}
            className="inline-flex h-9 items-center justify-center gap-2 border border-emerald-200/22 bg-emerald-200/10 px-3 text-xs font-semibold uppercase tracking-[0.08em] text-emerald-50 transition hover:border-emerald-200/42 hover:bg-emerald-200/16 disabled:cursor-wait disabled:opacity-55"
          >
            <Play className="h-4 w-4" />
            {running ? "Running" : "Run"}
          </button>
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex h-9 items-center justify-center gap-2 border border-cyan-200/20 bg-cyan-200/10 px-3 text-xs font-semibold uppercase tracking-[0.08em] text-cyan-50 transition hover:border-cyan-200/40 hover:bg-cyan-200/16"
          >
            <CalendarClock className="h-4 w-4" />
            Schedule
          </button>
        </div>
      </div>

      <div className="grid min-h-[310px] gap-3 p-4 lg:grid-cols-[11rem_minmax(0,1fr)_14rem]">
        <aside className="rounded-md border border-white/10 bg-black/22 p-3">
          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Nodes
          </div>
          <div className="mt-3 grid gap-1.5">
            {palette.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => addNode(item)}
                className="flex h-8 items-center justify-between rounded-sm border border-white/8 bg-white/5 px-2 text-left text-xs text-slate-200/82 transition hover:border-cyan-200/28 hover:bg-cyan-200/10 hover:text-white"
                title={`Add ${item} node`}
              >
                <span>{item}</span>
                <span className="text-cyan-100/36">+</span>
              </button>
            ))}
          </div>
        </aside>

        <div
          className="relative overflow-auto rounded-md border border-white/10 bg-[radial-gradient(circle_at_50%_38%,rgba(0,212,255,0.12),transparent_22rem),linear-gradient(135deg,rgba(0,0,0,0.32),rgba(255,255,255,0.03))] p-4"
          onWheel={handleWorkflowWheel}
        >
          <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-md border border-white/10 bg-black/42 p-1 backdrop-blur">
            <button
              type="button"
              className="grid h-7 w-7 place-items-center rounded-sm text-slate-200/78 transition hover:bg-cyan-200/12 hover:text-white disabled:opacity-35"
              onClick={() => zoomWorkflow(-0.1)}
              disabled={zoom <= WORKFLOW_ZOOM_MIN}
              aria-label="Zoom workflow out"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-10 text-center font-mono text-[0.68rem] text-slate-300/80">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              className="grid h-7 w-7 place-items-center rounded-sm text-slate-200/78 transition hover:bg-cyan-200/12 hover:text-white disabled:opacity-35"
              onClick={() => zoomWorkflow(0.1)}
              disabled={zoom >= WORKFLOW_ZOOM_MAX}
              aria-label="Zoom workflow in"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="grid h-7 w-7 place-items-center rounded-sm text-slate-200/78 transition hover:bg-cyan-200/12 hover:text-white"
              onClick={fitWorkflowView}
              aria-label="Fit workflow view"
              title="Fit workflow view"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="grid h-7 w-7 place-items-center rounded-sm text-slate-200/78 transition hover:bg-cyan-200/12 hover:text-white disabled:opacity-35"
              onClick={resetWorkflowView}
              disabled={zoom === 1}
              aria-label="Reset workflow zoom"
              title="Reset workflow zoom"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
          <div
            className="relative grid origin-top-left items-center gap-3 md:grid-flow-col md:auto-cols-[minmax(150px,1fr)]"
            style={{
              minHeight: canvasMinHeight,
              minWidth: canvasMinWidth,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
            }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute left-8 right-8 top-1/2 hidden h-px bg-gradient-to-r from-cyan-300/10 via-cyan-200/42 to-amber-200/10 md:block"
            />
            {nodes.map((node, index) => {
              const Icon = node.icon;
              const selected = node.id === selectedNode?.id;
              const executed = executedNodeById.get(node.id);
              return (
                <button
                  type="button"
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
                  className={cn(
                    "relative z-10 min-h-[122px] rounded-md border bg-black/42 p-3 text-left shadow-[0_12px_32px_rgba(0,0,0,0.2)] backdrop-blur transition",
                    selected
                      ? "border-cyan-200/70 ring-1 ring-cyan-200/40"
                      : "border-white/12 hover:border-cyan-200/38",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={cn(
                        "grid h-9 w-9 place-items-center rounded-md border",
                        node.tone === "cyan" && "border-cyan-200/30 bg-cyan-200/10 text-cyan-100",
                        node.tone === "violet" && "border-violet-200/30 bg-violet-200/10 text-violet-100",
                        node.tone === "emerald" && "border-emerald-200/30 bg-emerald-200/10 text-emerald-100",
                        node.tone === "amber" && "border-amber-200/30 bg-amber-200/10 text-amber-100",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="font-mono text-xs text-slate-400">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {node.label}
                  </div>
                  <div className="mt-1 text-sm font-medium text-white">{node.title}</div>
                  {executed ? (
                    <div className="mt-3 inline-flex max-w-full items-center gap-1 rounded-sm border border-emerald-200/18 bg-emerald-200/10 px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-emerald-100">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-200" />
                      <span className="truncate">{executed.status}</span>
                    </div>
                  ) : null}
                  {index < nodes.length - 1 ? (
                    <span className="absolute -right-3 top-1/2 hidden h-2 w-2 -translate-y-1/2 rounded-full bg-cyan-100 shadow-[0_0_14px_rgba(125,249,255,0.8)] md:block" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <aside className="rounded-md border border-white/10 bg-black/22 p-3">
          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Inspector
          </div>
          {selectedNode ? (
            <div className="mt-3 space-y-3 text-xs text-slate-300/76">
              <label className="grid gap-1">
                <span className="text-[0.62rem] uppercase tracking-[0.12em] text-slate-400">
                  Node name
                </span>
                <input
                  value={selectedNode.label}
                  onChange={(event) => updateSelectedNode({ label: event.target.value })}
                  className="h-8 rounded-sm border border-white/10 bg-white/6 px-2 text-slate-100 outline-none focus:border-cyan-200/50"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[0.62rem] uppercase tracking-[0.12em] text-slate-400">
                  Purpose
                </span>
                <textarea
                  value={selectedNode.title}
                  onChange={(event) => updateSelectedNode({ title: event.target.value })}
                  rows={3}
                  className="resize-none rounded-sm border border-white/10 bg-white/6 px-2 py-1.5 text-slate-100 outline-none focus:border-cyan-200/50"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[0.62rem] uppercase tracking-[0.12em] text-slate-400">
                  Color
                </span>
                <select
                  value={selectedNode.tone}
                  onChange={(event) =>
                    updateSelectedNode({ tone: event.target.value as WorkflowTone })
                  }
                  className="h-8 rounded-sm border border-white/10 bg-[#121923] px-2 text-slate-100 outline-none focus:border-cyan-200/50"
                >
                  <option value="cyan">Cyan</option>
                  <option value="violet">Violet</option>
                  <option value="emerald">Emerald</option>
                  <option value="amber">Amber</option>
                </select>
              </label>
              <div className="grid gap-1.5 rounded-sm border border-cyan-200/14 bg-cyan-200/8 p-2">
                <span>Sync: {syncState === "saved" ? "saved" : syncState === "loading" ? "working" : syncState}</span>
                {selectedNodeRun ? (
                  <span>Node run: {selectedNodeRun.status}</span>
                ) : null}
                <span>Run: manual, scheduled, platform trigger</span>
                {lastRun?.active_soul ? (
                  <span>Routed: {lastRun.active_soul.name}</span>
                ) : null}
                {lastTeamState?.delegate_souls?.length ? (
                  <span>Team: {lastTeamState.delegate_souls.join(", ")}</span>
                ) : null}
                {lastTeamState?.workflow_id ? (
                  <span>Workflow: {lastTeamState.workflow_id}</span>
                ) : null}
                {lastMessage ? (
                  <span className="text-cyan-50/82">{lastMessage}</span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={removeSelectedNode}
                disabled={nodes.length <= 1}
                className="h-8 w-full rounded-sm border border-red-200/18 bg-red-300/8 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-red-100 transition hover:border-red-200/34 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Remove node
              </button>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

const WORKFLOW_CANVAS_STORAGE_KEY = "jarvis.workflow.canvas.v1";
const WORKFLOW_ZOOM_MIN = 0.6;
const WORKFLOW_ZOOM_MAX = 1.5;

function clampWorkflowZoom(value: number): number {
  return Math.max(WORKFLOW_ZOOM_MIN, Math.min(WORKFLOW_ZOOM_MAX, value));
}

type WorkflowTone = "cyan" | "violet" | "emerald" | "amber";

type WorkflowNode = {
  id: string;
  icon: LucideIcon;
  label: string;
  title: string;
  tone: WorkflowTone;
};

type StoredWorkflowNode = Pick<WorkflowNode, "id" | "label" | "title" | "tone">;

interface WorkflowCanvasState {
  nodes: WorkflowNode[];
  selectedNodeId: string;
  zoom: number;
}

function workflowIconForLabel(label: string): LucideIcon {
  const normalized = label.toLowerCase();
  if (normalized.includes("trigger") || normalized.includes("voice") || normalized.includes("message")) {
    return MessageCircle;
  }
  if (normalized.includes("decision") || normalized.includes("approval") || normalized.includes("branch")) {
    return GitBranch;
  }
  if (normalized.includes("output") || normalized.includes("send") || normalized.includes("reply")) {
    return Send;
  }
  return Bot;
}

function defaultWorkflowNodes(): WorkflowNode[] {
  return [
    {
      id: "trigger",
      icon: MessageCircle,
      label: "Trigger",
      title: "Voice, chat, WhatsApp, Telegram, schedule",
      tone: "cyan",
    },
    {
      id: "router",
      icon: Bot,
      label: "JARVIS Router",
      title: "Chooses model, soul, memory, and tools",
      tone: "violet",
    },
    {
      id: "decision",
      icon: GitBranch,
      label: "Decision",
      title: "Approvals, branches, retries, safety",
      tone: "emerald",
    },
    {
      id: "output",
      icon: Send,
      label: "Output",
      title: "Voice, text, files, platform replies",
      tone: "amber",
    },
  ];
}

function normalizeStoredWorkflowNode(node: unknown): WorkflowNode | null {
  if (!node || typeof node !== "object") return null;
  const record = node as Partial<StoredWorkflowNode>;
  if (
    typeof record.id !== "string" ||
    typeof record.label !== "string" ||
    typeof record.title !== "string" ||
    !["cyan", "violet", "emerald", "amber"].includes(String(record.tone))
  ) {
    return null;
  }
  return {
    id: record.id,
    icon: workflowIconForLabel(record.label),
    label: record.label,
    title: record.title,
    tone: record.tone as WorkflowTone,
  };
}

function loadWorkflowCanvasState(): WorkflowCanvasState {
  const fallbackNodes = defaultWorkflowNodes();
  if (typeof window === "undefined") {
    return { nodes: fallbackNodes, selectedNodeId: "router", zoom: 1 };
  }

  try {
    const raw = window.localStorage.getItem(WORKFLOW_CANVAS_STORAGE_KEY);
    if (!raw) return { nodes: fallbackNodes, selectedNodeId: "router", zoom: 1 };
    const parsed = JSON.parse(raw) as {
      nodes?: unknown[];
      selectedNodeId?: unknown;
      zoom?: unknown;
    };
    const nodes = Array.isArray(parsed.nodes)
      ? parsed.nodes.map(normalizeStoredWorkflowNode).filter((node): node is WorkflowNode => Boolean(node))
      : [];
    const selectedNodeId =
      typeof parsed.selectedNodeId === "string" && nodes.some((node) => node.id === parsed.selectedNodeId)
        ? parsed.selectedNodeId
        : nodes[0]?.id ?? "router";
    const parsedZoom = typeof parsed.zoom === "number" ? parsed.zoom : 1;
    const zoom = clampWorkflowZoom(Number(parsedZoom.toFixed(2)));
    return {
      nodes: nodes.length ? nodes : fallbackNodes,
      selectedNodeId,
      zoom,
    };
  } catch {
    return { nodes: fallbackNodes, selectedNodeId: "router", zoom: 1 };
  }
}
