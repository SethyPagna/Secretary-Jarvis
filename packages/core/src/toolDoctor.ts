import type { ToolStatus } from "./types.js";

export function resolveToolStatus(params: {
  id: string;
  label: string;
  command: string;
  installedPath?: string;
  version?: string;
  localInstallerPath?: string;
}): ToolStatus {
  const installed = Boolean(params.installedPath);
  const hasInstaller = Boolean(params.localInstallerPath);

  return {
    id: params.id,
    label: params.label,
    command: params.command,
    installed,
    version: params.version,
    path: params.installedPath,
    localInstallerPath: params.localInstallerPath,
    notes: installed
      ? "Tool is available on PATH."
      : hasInstaller
        ? "Tool is missing from PATH, but a local installer/archive was found."
        : "Tool is missing and no local installer/archive was found.",
  };
}
