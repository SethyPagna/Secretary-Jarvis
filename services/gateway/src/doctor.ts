import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readyModelAssets, type JarvisStatus, type PrivacyMode } from "@jarvis/core";

const PROJECT_PARENT = "C:\\Users\\user\\Downloads\\Secretary Jarvis";
const PROJECT_ROOT = `${PROJECT_PARENT}\\jarvis`;
const IMPORTED_VOICE_ROOT = `${PROJECT_PARENT}\\voice`;
const DEFAULT_VOICE_ROOT = `${PROJECT_ROOT}\\assets\\voice`;
const REQUIRED_VOICE_FILES = ["jarvis.mp3", "jarvis-intro-1.mp3", "jarvis-intro2.mp3", "jarvis_morning.mp3"];

export interface DoctorOptions {
  privacyMode: PrivacyMode;
  voiceAssetRoot?: string;
}

export function setupDoctor(options: DoctorOptions): Record<string, unknown> {
  const tools = detectToolStatuses();
  const toolMap = new Map(tools.map((tool) => [tool.id, tool]));
  const tauriCliPaths = [
    "node_modules/.bin/tauri.cmd",
    "../node_modules/.bin/tauri.cmd",
    "../../node_modules/.bin/tauri.cmd",
  ];
  const hasTauriCli = tauriCliPaths.some((candidate) => existsSync(candidate));
  const voiceRoot = options.voiceAssetRoot ?? DEFAULT_VOICE_ROOT;

  return {
    node: commandVersion("node", ["--version"]),
    python: commandVersion("python", ["--version"]),
    rustc: doctorEntryFromTool(toolMap.get("rustc")),
    cargo: doctorEntryFromTool(toolMap.get("cargo")),
    npm: commandVersion("cmd.exe", ["/d", "/s", "/c", "npm.cmd --version"]),
    ollama: doctorEntryFromTool(toolMap.get("ollama")),
    hf: doctorEntryFromTool(toolMap.get("hf")),
    gitXet: doctorEntryFromTool(toolMap.get("git-xet")),
    docker: commandVersion("docker", ["--version"]),
    tauriCli: {
      ok: hasTauriCli,
      output: hasTauriCli ? "local Tauri CLI installed" : "local Tauri CLI missing",
    },
    electron: {
      ok: existsSync(`${PROJECT_ROOT}\\node_modules\\electron`) || existsSync(`${PROJECT_ROOT}\\node_modules\\.bin\\electron.cmd`),
      output: existsSync(`${PROJECT_ROOT}\\node_modules\\electron`) ? "Electron package installed" : "Electron package not detected in root node_modules",
    },
    modelFolders: readyModelAssets.map((asset) => folderEntry(asset.label, asset.localPath)),
    voiceFolder: {
      primary: voiceRoot,
      imported: IMPORTED_VOICE_ROOT,
      files: REQUIRED_VOICE_FILES.map((fileName) => ({
        fileName,
        ok: existsSync(join(voiceRoot, fileName)) || existsSync(join(IMPORTED_VOICE_ROOT, fileName)),
        primaryPath: join(voiceRoot, fileName),
        importedPath: join(IMPORTED_VOICE_ROOT, fileName),
      })),
    },
    desktopRuntime: "Electron HUD primary. Tauri remains the full dashboard/fallback shell.",
    localOnly: options.privacyMode === "strict-local",
    localInstallers: {
      ollama: localInstallerPath("OllamaSetup.exe"),
      rustup: localInstallerPath("rustup-init.exe"),
      cargoArchive: localInstallerPath("cargo-master.zip"),
    },
    tools,
  };
}

export function detectToolStatuses(): NonNullable<JarvisStatus["toolStatuses"]> {
  return [
    toolStatus("ollama", "Ollama", "ollama", ["OllamaSetup.exe"], ["$env:LOCALAPPDATA\\Programs\\Ollama\\ollama.exe"]),
    toolStatus("rustc", "Rust compiler", "rustc", ["rustup-init.exe"], ["$env:USERPROFILE\\.cargo\\bin\\rustc.exe"]),
    toolStatus("cargo", "Cargo", "cargo", ["cargo-master.zip"], ["$env:USERPROFILE\\.cargo\\bin\\cargo.exe"]),
    toolStatus("hf", "Hugging Face CLI", "hf", [], [
      "$env:APPDATA\\Python\\Python313\\Scripts\\hf.exe",
      "$env:USERPROFILE\\.local\\bin\\hf.exe",
    ]),
    toolStatus("git-xet", "Git Xet", "git-xet", [], [
      "$env:APPDATA\\Python\\Python313\\site-packages\\hf_xet",
      "$env:LOCALAPPDATA\\Programs\\Git LFS\\git-xet.exe",
    ]),
    toolStatus("whisper-cli", "whisper.cpp", "whisper-cli", [], []),
    toolStatus("piper", "Piper TTS", "piper", [], []),
  ];
}

export function commandVersion(command: string, args: string[]): { ok: boolean; output: string } {
  try {
    const output = execFileSync(command, args, { encoding: "utf8", timeout: 5000, windowsHide: true });
    return { ok: true, output: output.trim() };
  } catch (error) {
    return { ok: false, output: error instanceof Error ? error.message : String(error) };
  }
}

function folderEntry(label: string, folderPath: string): { label: string; path: string; ok: boolean; files?: number; sizeBytes?: number } {
  if (!existsSync(folderPath)) {
    return { label, path: folderPath, ok: false };
  }

  try {
    const files = collectFiles(folderPath);
    const sizeBytes = files.reduce((total, entry) => {
      return total + statSync(entry).size;
    }, 0);
    return { label, path: folderPath, ok: true, files: files.length, sizeBytes };
  } catch {
    return { label, path: folderPath, ok: true };
  }
}

function collectFiles(folderPath: string): string[] {
  return readdirSync(folderPath, { withFileTypes: true }).flatMap((entry) => {
    const childPath = join(folderPath, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(childPath);
    }
    return entry.isFile() ? [childPath] : [];
  });
}

function doctorEntryFromTool(tool: NonNullable<JarvisStatus["toolStatuses"]>[number] | undefined): {
  ok: boolean;
  output: string;
} {
  return {
    ok: Boolean(tool?.installed),
    output: tool?.version ?? tool?.path ?? tool?.notes ?? "not detected",
  };
}

function toolStatus(
  idValue: string,
  label: string,
  command: string,
  installerNames: string[],
  candidatePaths: string[],
): NonNullable<JarvisStatus["toolStatuses"]>[number] {
  const version = commandVersion(command, ["--version"]);
  const installedPath = version.ok ? command : firstExistingPath(candidatePaths);
  const localInstaller = installerNames.map(localInstallerPath).find((candidate) => candidate !== undefined);
  return {
    id: idValue,
    label,
    command,
    installed: Boolean(installedPath),
    version: version.ok ? version.output : undefined,
    path: installedPath,
    localInstallerPath: localInstaller,
    notes: installedPath
      ? "Tool is available or found in a common local install path."
      : localInstaller
        ? "Tool is not on PATH, but a local installer/archive exists in the project parent directory."
        : "Tool is not available on PATH and no local installer/archive was found.",
  };
}

function firstExistingPath(paths: string[]): string | undefined {
  return paths.map(expandEnvPath).find((candidate) => existsSync(candidate));
}

function localInstallerPath(fileName: string): string | undefined {
  const candidate = `${PROJECT_PARENT}\\${fileName}`;
  return existsSync(candidate) ? candidate : undefined;
}

function expandEnvPath(input: string): string {
  return input
    .replace("$env:APPDATA", process.env.APPDATA ?? "")
    .replace("$env:LOCALAPPDATA", process.env.LOCALAPPDATA ?? "")
    .replace("$env:USERPROFILE", process.env.USERPROFILE ?? "");
}
