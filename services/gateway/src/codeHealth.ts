import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, basename, extname } from "node:path";
import { tmpdir } from "node:os";

const EXCLUDED_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", "test-results", "playwright-report", "data"]);
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".ps1", ".rs"]);
const SCAN_EXTENSIONS = new Set([...CODE_EXTENSIONS, ".md", ".json"]);

export interface CodeHealthReport {
  generatedAt: string;
  root: string;
  scannedFiles: number;
  oversizedFiles: Array<{ path: string; lines: number; recommendation: string }>;
  duplicateBasenames: Array<{ name: string; paths: string[] }>;
  repeatedRouteLiterals: Array<{ route: string; count: number }>;
  staleMarkers: Array<{ path: string; marker: string; count: number }>;
  possibleUnreferencedSourceFiles: Array<{ path: string; reason: string }>;
  cleanupBacklog: string[];
}

export function buildCodeHealthReport(params: { root: string; generatedAt: string }): CodeHealthReport {
  const files = collectFiles(params.root);
  const textFiles = files.filter((file) => SCAN_EXTENSIONS.has(extname(file).toLowerCase()));
  const sourceFiles = textFiles.filter((file) => CODE_EXTENSIONS.has(extname(file).toLowerCase()));
  const fileTexts = new Map(textFiles.map((file) => [file, safeRead(file)]));

  return {
    generatedAt: params.generatedAt,
    root: params.root,
    scannedFiles: textFiles.length,
    oversizedFiles: oversizedFiles(fileTexts, params.root),
    duplicateBasenames: duplicateBasenames(textFiles, params.root),
    repeatedRouteLiterals: repeatedRouteLiterals(fileTexts),
    staleMarkers: staleMarkers(fileTexts, params.root),
    possibleUnreferencedSourceFiles: possibleUnreferencedSourceFiles(sourceFiles, fileTexts, params.root),
    cleanupBacklog: [
      "Split oversized route/service files only after endpoint tests are in place.",
      "Replace repeated CSS card patterns with shared compact-card classes.",
      "Keep old reference/vendor code isolated; do not copy shell architecture from references.",
      "Prefer TypeScript for contracts/UI/gateway, Python for AI sidecars, native runtimes for inference, and PowerShell only for Windows bootstrap.",
    ],
  };
}

export function withTempCodeHealthFixture(callback: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "jarvis-code-health-"));
  try {
    writeFileSync(join(root, "big.ts"), Array.from({ length: 820 }, (_, index) => `export const value${index} = ${index};`).join("\n"));
    writeFileSync(join(root, "copy.ts"), "export const copied = true;\n// TODO remove duplicate\n");
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, "nested", "copy.ts"), "export const copiedNested = true;\n");
    writeFileSync(join(root, "routes.ts"), 'const a = "/api/test";\nconst b = "/api/test";\n');
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function collectFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return EXCLUDED_DIRS.has(entry.name) ? [] : collectFiles(path);
    }
    return entry.isFile() ? [path] : [];
  });
}

function safeRead(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function oversizedFiles(fileTexts: Map<string, string>, root: string): CodeHealthReport["oversizedFiles"] {
  return [...fileTexts.entries()]
    .map(([path, text]) => ({ path: relative(root, path), lines: text.split(/\r?\n/).length }))
    .filter((entry) => entry.lines > 750)
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 12)
    .map((entry) => ({
      ...entry,
      recommendation: "Consider splitting by route/domain after tests cover the current behavior.",
    }));
}

function duplicateBasenames(files: string[], root: string): CodeHealthReport["duplicateBasenames"] {
  const groups = new Map<string, string[]>();
  for (const file of files) {
    const name = basename(file).toLowerCase();
    groups.set(name, [...(groups.get(name) ?? []), relative(root, file)]);
  }
  return [...groups.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([name, paths]) => ({ name, paths }))
    .slice(0, 20);
}

function repeatedRouteLiterals(fileTexts: Map<string, string>): CodeHealthReport["repeatedRouteLiterals"] {
  const counts = new Map<string, number>();
  for (const text of fileTexts.values()) {
    for (const match of text.matchAll(/["'`](\/api\/[a-z0-9/:-]+)["'`]/gi)) {
      const route = match[1] ?? "";
      if (!route) {
        continue;
      }
      counts.set(route, (counts.get(route) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([route, count]) => ({ route, count }));
}

function staleMarkers(fileTexts: Map<string, string>, root: string): CodeHealthReport["staleMarkers"] {
  const markers = ["TODO", "FIXME", "placeholder", "planned", "mockup"];
  const result: CodeHealthReport["staleMarkers"] = [];
  for (const [path, text] of fileTexts.entries()) {
    for (const marker of markers) {
      const count = text.match(new RegExp(`\\b${marker}\\b`, "gi"))?.length ?? 0;
      if (count > 0) {
        result.push({ path: relative(root, path), marker, count });
      }
    }
  }
  return result.sort((a, b) => b.count - a.count).slice(0, 30);
}

function possibleUnreferencedSourceFiles(
  sourceFiles: string[],
  fileTexts: Map<string, string>,
  root: string,
): CodeHealthReport["possibleUnreferencedSourceFiles"] {
  const allText = [...fileTexts.entries()].map(([path, text]) => `${relative(root, path)}\n${text}`).join("\n");
  return sourceFiles
    .filter((file) => {
      const name = basename(file, extname(file));
      if (/^(index|main|server|seed|types|.*\.test|.*\.spec)$/i.test(name)) {
        return false;
      }
      const occurrences = allText.match(new RegExp(`\\b${escapeRegExp(name)}\\b`, "g"))?.length ?? 0;
      return occurrences <= 1;
    })
    .slice(0, 20)
    .map((file) => ({
      path: relative(root, file),
      reason: "Filename appears rarely in scanned source text; review before deleting.",
    }));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
