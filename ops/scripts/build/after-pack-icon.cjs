const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

module.exports = async function afterPack(context) {
  if (process.platform !== "win32" || context.electronPlatformName !== "win32") {
    return;
  }

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const productFilename =
    context.packager?.appInfo?.productFilename ||
    context.packager?.appInfo?.productName ||
    "JARVIS";
  const exePath = path.join(context.appOutDir, `${productFilename}.exe`);
  const iconPath = path.join(repoRoot, "desktop", "assets", "icon.ico");
  const rceditPath =
    process.env.JARVIS_RCEDIT ||
    path.join(repoRoot, "desktop", "vendor", "rcedit", "win32", "rcedit-x64.exe");

  for (const requiredPath of [exePath, iconPath, rceditPath]) {
    if (!fs.existsSync(requiredPath)) {
      throw new Error(`Missing desktop packaging resource: ${requiredPath}`);
    }
  }

  const args = [
    exePath,
    "--set-icon",
    iconPath,
    "--set-version-string",
    "FileDescription",
    "JARVIS",
    "--set-version-string",
    "ProductName",
    "JARVIS",
  ];

  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      execFileSync(rceditPath, args, { stdio: ["ignore", "pipe", "pipe"] });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 5) {
        sleep(750 * attempt);
      }
    }
  }

  throw lastError;
};
