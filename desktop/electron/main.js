const { app, BrowserWindow, ipcMain, Menu, Tray } = require('electron')
const { spawn, spawnSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const BACKEND_HOST = process.env.JARVIS_DESKTOP_BACKEND_HOST || '127.0.0.1'
const BACKEND_PORT = Number.parseInt(process.env.JARVIS_DESKTOP_BACKEND_PORT || '8765', 10)
const BACKEND_BASE_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`
const BACKEND_SHUTDOWN_TIMEOUT_MS = 5000
const BACKEND_SHUTDOWN_TOKEN = process.env.JARVIS_DESKTOP_SHUTDOWN_TOKEN || crypto.randomBytes(32).toString('hex')
const MINIMIZE_TO_TRAY = /^(1|true|yes)$/i.test(process.env.JARVIS_MINIMIZE_TO_TRAY || '')
const LOCAL_RUNTIME_AUTOSTART = !/^(0|false|no)$/i.test(process.env.JARVIS_LOCAL_RUNTIME_AUTOSTART || '1')
const LOCAL_RUNTIME_START_TIMEOUT_MS = Number.parseInt(process.env.JARVIS_LOCAL_RUNTIME_START_TIMEOUT_MS || '180000', 10)
const LOCAL_RUNTIME_STOP_TIMEOUT_MS = Number.parseInt(process.env.JARVIS_LOCAL_RUNTIME_STOP_TIMEOUT_MS || '10000', 10)
const REMOTE_DEBUGGING_PORT = process.env.JARVIS_REMOTE_DEBUGGING_PORT || ''
const DESKTOP_WARMUP_ENDPOINTS = [
  '/api/runtime/readiness',
  '/api/models/list',
  '/api/stats',
  '/api/souls/team',
  '/api/skills'
]
const DESKTOP_WARMUP_TIMEOUT_MS = Number.parseInt(process.env.JARVIS_DESKTOP_WARMUP_TIMEOUT_MS || '10000', 10)
const APP_USER_MODEL_ID = 'com.sethypagna.jarvis'

if (/^\d+$/.test(REMOTE_DEBUGGING_PORT)) {
  app.commandLine.appendSwitch('remote-debugging-port', REMOTE_DEBUGGING_PORT)
}

app.setAppUserModelId(APP_USER_MODEL_ID)

const HAS_SINGLE_INSTANCE_LOCK = app.requestSingleInstanceLock({ appId: APP_USER_MODEL_ID })

if (!HAS_SINGLE_INSTANCE_LOCK) {
  app.exit(0)
}

app.on('second-instance', () => {
  if (!shutdownStarted) {
    showMainWindow()
  }
})

let mainWindow = null
let backendProcess = null
let tray = null
let shutdownStarted = false
let shutdownFinished = false
let desktopLogPath = null

function appendDesktopLog(message, detail = '') {
  try {
    if (!desktopLogPath && app?.isReady?.()) {
      desktopLogPath = path.join(app.getPath('userData'), 'desktop.log')
    }
    if (!desktopLogPath) {
      return
    }
    const suffix = detail ? ` ${detail}` : ''
    fs.appendFileSync(desktopLogPath, `[${new Date().toISOString()}] ${message}${suffix}\n`, 'utf8')
  } catch {
    // Logging must never block app startup.
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function packagedBackendCandidates() {
  const binaryName = process.platform === 'win32' ? 'jarvis-backend.exe' : 'jarvis-backend'
  const resourcesPath = process.resourcesPath || ''
  return [
    path.join(resourcesPath, 'backend', binaryName),
    path.join(resourcesPath, 'backend', 'jarvis-backend', binaryName)
  ]
}

function packagedBackendPath() {
  return packagedBackendCandidates().find((candidate) => fs.existsSync(candidate)) || packagedBackendCandidates()[0]
}

function resolveBackendLaunch() {
  const packagedBackend = packagedBackendPath()

  if (app.isPackaged && fs.existsSync(packagedBackend)) {
    return {
      command: packagedBackend,
      args: ['--host', BACKEND_HOST, '--port', String(BACKEND_PORT), '--no-open'],
      preflightArgs: ['--preflight', '--host', BACKEND_HOST, '--port', String(BACKEND_PORT)],
      options: {
        cwd: path.dirname(packagedBackend),
        windowsHide: true
      }
    }
  }

  const configuredPython = process.env.JARVIS_PYTHON || process.env.PYTHON || ''
  const py311 = configuredPython
    ? null
    : spawnSync('py', ['-3.11', '-c', 'import sys; print(sys.executable)'], {
        encoding: 'utf8',
        windowsHide: true
      })
  const pythonExecutable = configuredPython || (py311 && py311.status === 0 ? 'py' : 'python')
  const pythonVersionArgs = configuredPython || !(py311 && py311.status === 0) ? [] : ['-3.11']

  return {
    command: pythonExecutable,
    args: [
      ...pythonVersionArgs,
      '-m',
      'jarvis_cli.desktop_entry',
      '--host',
      BACKEND_HOST,
      '--port',
      String(BACKEND_PORT),
      '--no-open'
    ],
    preflightArgs: [
      ...pythonVersionArgs,
      '-m',
      'jarvis_cli.desktop_entry',
      '--preflight',
      '--host',
      BACKEND_HOST,
      '--port',
      String(BACKEND_PORT)
    ],
    options: {
      // Windows equivalent of PowerShell Start-Process -WindowStyle Hidden.
      windowsHide: true
    }
  }
}

function backendEnv() {
  const resourceRoot = app.isPackaged && process.resourcesPath
    ? process.resourcesPath
    : path.resolve(__dirname, '..', '..')
  const sourceRoot = path.join(resourceRoot, 'src')
  const pythonPath = fs.existsSync(sourceRoot)
    ? `${sourceRoot}${path.delimiter}${process.env.PYTHONPATH || ''}`
    : process.env.PYTHONPATH
  const exeDir = app.isPackaged ? path.dirname(app.getPath('exe')) : path.resolve(__dirname, '..', '..')
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR
    || (process.env.PORTABLE_EXECUTABLE_FILE ? path.dirname(process.env.PORTABLE_EXECUTABLE_FILE) : '')
  const candidateModelsDirs = [
    process.env.JARVIS_MODELS_DIR,
    portableDir ? path.resolve(portableDir, 'models') : '',
    portableDir ? path.resolve(portableDir, '..', 'models') : '',
    portableDir ? path.resolve(portableDir, '..', '..', 'models') : '',
    path.resolve(exeDir, 'models'),
    path.resolve(exeDir, '..', 'models'),
    path.resolve(exeDir, '..', '..', 'models'),
    path.resolve(exeDir, '..', '..', '..', 'models'),
    path.resolve(resourceRoot, '..', 'models'),
    path.resolve(resourceRoot, '..', '..', 'models'),
    path.resolve(process.cwd(), 'models'),
    path.resolve(process.cwd(), '..', 'models')
  ].filter(Boolean)
  const defaultModelsDir = candidateModelsDirs.find((candidate) => fs.existsSync(candidate)) || candidateModelsDirs[0]
  const bundledLlamaServer = path.join(resourceRoot, 'runtime', 'llama.cpp', process.platform === 'win32' ? 'llama-server.exe' : 'llama-server')
  const llamaRuntimeDir = path.dirname(bundledLlamaServer)
  const nextPath = fs.existsSync(bundledLlamaServer)
    ? `${llamaRuntimeDir}${path.delimiter}${process.env.PATH || ''}`
    : process.env.PATH

  return {
    ...process.env,
    PATH: nextPath,
    PYTHONPATH: pythonPath,
    JARVIS_DESKTOP_EMBEDDED: '1',
    JARVIS_DESKTOP_PARENT_PID: String(process.pid),
    JARVIS_DESKTOP_SHUTDOWN_TOKEN: BACKEND_SHUTDOWN_TOKEN,
    JARVIS_DISABLE_LAZY_INSTALLS: '1',
    JARVIS_RESOURCE_ROOT: resourceRoot,
    JARVIS_MODELS_DIR: process.env.JARVIS_MODELS_DIR || defaultModelsDir,
    JARVIS_LLAMA_SERVER_PATH: process.env.JARVIS_LLAMA_SERVER_PATH || (fs.existsSync(bundledLlamaServer) ? bundledLlamaServer : '')
  }
}

function runBackendPreflight() {
  const launch = resolveBackendLaunch()
  appendDesktopLog('[jarvis-backend] preflight starting', JSON.stringify({
    command: launch.command,
    args: launch.preflightArgs,
    cwd: launch.options?.cwd || path.resolve(__dirname, '..', '..'),
    exists: fs.existsSync(launch.command)
  }))
  const result = spawnSync(launch.command, launch.preflightArgs, {
    cwd: path.resolve(__dirname, '..', '..'),
    env: backendEnv(),
    encoding: 'utf8',
    windowsHide: true,
    ...launch.options
  })

  if (result.error) {
    console.error('[jarvis-backend] backend preflight failed', result.error)
    appendDesktopLog('[jarvis-backend] backend preflight failed', result.error.stack || String(result.error))
    return false
  }

  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  if (result.status !== 0) {
    console.error(`[jarvis-backend] backend preflight failed\n${output}`)
    appendDesktopLog('[jarvis-backend] backend preflight failed', JSON.stringify({
      status: result.status,
      signal: result.signal,
      output
    }))
    return false
  }

  if (output) {
    console.log(`[jarvis-backend] preflight ${output}`)
  }
  appendDesktopLog('[jarvis-backend] preflight ok', output)
  return true
}

function startBackendProcess() {
  if (backendProcess && !backendProcess.killed) {
    return backendProcess
  }

  const launch = resolveBackendLaunch()
  appendDesktopLog('[jarvis-backend] starting', JSON.stringify({
    command: launch.command,
    args: launch.args,
    cwd: launch.options?.cwd || path.resolve(__dirname, '..', '..'),
    exists: fs.existsSync(launch.command)
  }))
  backendProcess = spawn(launch.command, launch.args, {
    cwd: path.resolve(__dirname, '..', '..'),
    env: backendEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    ...launch.options
  })

  backendProcess.stdout?.on('data', (chunk) => {
    const text = chunk.toString().trimEnd()
    console.log(`[jarvis-backend] ${text}`)
    appendDesktopLog('[jarvis-backend stdout]', text)
  })

  backendProcess.stderr?.on('data', (chunk) => {
    const text = chunk.toString().trimEnd()
    console.error(`[jarvis-backend] ${text}`)
    appendDesktopLog('[jarvis-backend stderr]', text)
  })

  backendProcess.once('error', (error) => {
    console.error('[jarvis-backend] failed to start', error)
    appendDesktopLog('[jarvis-backend] failed to start', error.stack || String(error))
    backendProcess = null
  })

  backendProcess.once('exit', (code, signal) => {
    console.log(`[jarvis-backend] exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
    appendDesktopLog('[jarvis-backend] exited', `code=${code ?? 'null'} signal=${signal ?? 'null'}`)
    backendProcess = null
  })

  return backendProcess
}

async function fetchJson(endpoint, options = {}) {
  const { timeoutMs, ...fetchOptions } = options
  let timeoutHandle = null
  let controller = null

  if (timeoutMs) {
    controller = new AbortController()
    fetchOptions.signal = controller.signal
    timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)
  }

  try {
    const response = await fetch(`${BACKEND_BASE_URL}${endpoint}`, fetchOptions)
    if (!response.ok) {
      throw new Error(`Backend ${endpoint} returned ${response.status}`)
    }

    return response.json()
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  }
}

async function waitForBackend(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  let lastError = null

  while (Date.now() < deadline) {
    try {
      return await fetchJson('/api/status')
    } catch (error) {
      lastError = error
      await delay(300)
    }
  }

  throw lastError || new Error('JARVIS backend did not become ready')
}

function rendererIndexCandidates() {
  const candidates = [
    path.join(__dirname, '..', 'web', 'dist', 'index.html'),
    path.join(__dirname, '..', '..', 'src', 'jarvis_cli', 'web_dist', 'index.html')
  ]

  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'src', 'jarvis_cli', 'web_dist', 'index.html'))
    candidates.push(path.join(process.resourcesPath, 'jarvis_cli', 'web_dist', 'index.html'))
  }

  return candidates
}

async function maybeStartLocalRuntime() {
  if (!LOCAL_RUNTIME_AUTOSTART) {
    return { skipped: true }
  }

  try {
    return await fetchJson('/api/runtime/local/start', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Jarvis-Desktop-Shutdown-Token': BACKEND_SHUTDOWN_TOKEN
      },
      timeoutMs: LOCAL_RUNTIME_START_TIMEOUT_MS
    })
  } catch (error) {
    console.warn('[jarvis-desktop] native local runtime autostart failed', error)
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function stopLocalRuntime() {
  try {
    return await fetchJson('/api/runtime/local/stop', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Jarvis-Desktop-Shutdown-Token': BACKEND_SHUTDOWN_TOKEN
      },
      timeoutMs: LOCAL_RUNTIME_STOP_TIMEOUT_MS
    })
  } catch (error) {
    console.warn('[jarvis-desktop] native local runtime stop failed', error)
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function warmBackendServices() {
  const localRuntime = await maybeStartLocalRuntime()
  const results = await Promise.allSettled(
    DESKTOP_WARMUP_ENDPOINTS.map((endpoint) => fetchJson(endpoint, { timeoutMs: DESKTOP_WARMUP_TIMEOUT_MS }))
  )
  const summary = results.map((result, index) => ({
    endpoint: DESKTOP_WARMUP_ENDPOINTS[index],
    ok: result.status === 'fulfilled',
    error: result.status === 'rejected'
      ? result.reason instanceof Error ? result.reason.message : String(result.reason)
      : ''
  }))

  appendDesktopLog('[jarvis-desktop] backend warmup complete', JSON.stringify({
    localRuntime,
    summary
  }))
  return { localRuntime, summary }
}

function trayIconCandidates() {
  const resourcesPath = process.resourcesPath || ''
  return [
    path.join(__dirname, '..', 'assets', 'icon.ico'),
    path.join(__dirname, '..', 'assets', 'icon.png'),
    path.join(resourcesPath, 'assets', 'icon.ico'),
    path.join(resourcesPath, 'assets', 'icon.png'),
    path.join(resourcesPath, 'app.asar.unpacked', 'assets', 'icon.ico'),
    path.join(resourcesPath, 'app.asar.unpacked', 'assets', 'icon.png')
  ]
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow()
  }

  mainWindow.show()
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.focus()
}

function createTray() {
  if (!MINIMIZE_TO_TRAY || tray) {
    return
  }

  const iconPath = trayIconCandidates().find((candidate) => fs.existsSync(candidate))
  if (!iconPath) {
    console.warn('[jarvis-desktop] tray requested but no tray icon was found')
    return
  }

  tray = new Tray(iconPath)
  tray.setToolTip('JARVIS')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show JARVIS', click: () => showMainWindow() },
    { type: 'separator' },
    { label: 'Quit JARVIS', click: () => runAppShutdown() }
  ]))
  tray.on('click', () => showMainWindow())
}

function startupShellHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JARVIS</title>
  <style>
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #080b10; }
    body {
      display: grid;
      place-items: center;
      color: #e8f6ff;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 50% 42%, rgba(151, 239, 255, 0.28), transparent 18rem),
        radial-gradient(circle at 72% 30%, rgba(164, 106, 255, 0.18), transparent 22rem),
        linear-gradient(135deg, #080b10, #101827 52%, #17162a);
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      opacity: 0.26;
      background-image:
        radial-gradient(circle, rgba(232, 246, 255, 0.7) 0 1px, transparent 1.4px),
        radial-gradient(circle, rgba(0, 212, 255, 0.5) 0 1px, transparent 1.3px);
      background-position: 0 0, 34px 21px;
      background-size: 88px 88px, 131px 131px;
    }
    main {
      position: relative;
      display: grid;
      gap: 1rem;
      min-width: min(25rem, calc(100vw - 3rem));
      padding: 2rem;
      border: 1px solid rgba(232, 246, 255, 0.16);
      border-radius: 1.2rem;
      background: rgba(8, 11, 16, 0.56);
      box-shadow: 0 2rem 6rem rgba(0, 0, 0, 0.42);
      backdrop-filter: blur(24px);
    }
    .orb {
      width: 4.75rem;
      aspect-ratio: 1;
      border-radius: 999px;
      background: radial-gradient(circle at 35% 30%, #ffffff 0 8%, #aaf7ff 17%, #4cc9d9 44%, #132534 76%);
      box-shadow: 0 0 1rem rgba(170, 247, 255, 0.8), 0 0 4rem rgba(0, 212, 255, 0.38);
      animation: pulse 1.35s ease-in-out infinite alternate;
    }
    h1 { margin: 0; font-size: 1.65rem; letter-spacing: 0.16em; }
    p { margin: 0; color: rgba(232, 246, 255, 0.72); font-size: 0.95rem; }
    @keyframes pulse {
      from { transform: scale(0.96); filter: saturate(0.9); }
      to { transform: scale(1.04); filter: saturate(1.25); }
    }
  </style>
</head>
<body>
  <main role="status" aria-live="polite">
    <div class="orb" aria-hidden="true"></div>
    <h1>JARVIS</h1>
    <p>Starting local models, voice, skills, and workspace services...</p>
  </main>
</body>
</html>`
}

async function loadStartupShell(window) {
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(startupShellHtml())}`)
}

async function loadRenderer(window) {
  if (process.env.JARVIS_RENDERER_URL) {
    await window.loadURL(process.env.JARVIS_RENDERER_URL)
    return
  }

  try {
    await window.loadURL(BACKEND_BASE_URL)
    return
  } catch (error) {
    console.warn('[jarvis-desktop] backend renderer load failed; falling back to bundled file', error)
  }

  const indexPath = rendererIndexCandidates().find((candidate) => fs.existsSync(candidate))
  if (indexPath) {
    await window.loadFile(indexPath)
    return
  }

  await window.loadURL(BACKEND_BASE_URL)
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0f',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[jarvis-renderer] load failed ${errorCode}: ${errorDescription} (${validatedURL})`)
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[jarvis-renderer] process gone reason=${details.reason} exitCode=${details.exitCode}`)
  })

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.warn(`[jarvis-renderer] ${sourceId}:${line} ${message}`)
    }
  })

  mainWindow.on('close', (event) => {
    if (shutdownFinished || shutdownStarted) {
      return
    }

    if (MINIMIZE_TO_TRAY) {
      event.preventDefault()
      mainWindow.hide()
      return
    }

    event.preventDefault()
    runAppShutdown()
  })

  loadStartupShell(mainWindow).catch((error) => {
    console.error('[jarvis-desktop] failed to load startup shell', error)
  })
}

async function shutdownBackend() {
  if (shutdownFinished) {
    return
  }

  await stopLocalRuntime()

  try {
    await fetchJson('/api/shutdown', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Jarvis-Desktop-Shutdown-Token': BACKEND_SHUTDOWN_TOKEN
      },
      timeoutMs: BACKEND_SHUTDOWN_TIMEOUT_MS
    })
  } catch (error) {
    console.warn('[jarvis-desktop] backend shutdown endpoint failed', error)
  }

  const processToStop = backendProcess
  if (!processToStop || processToStop.killed) {
    shutdownFinished = true
    return
  }

  await new Promise((resolve) => {
    let resolved = false
    let exited = false
    const finish = () => {
      if (!resolved) {
        resolved = true
        resolve()
      }
    }

    processToStop.once('exit', () => {
      exited = true
      finish()
    })
    processToStop.kill('SIGTERM')

    setTimeout(() => {
      if (!exited) {
        processToStop.kill('SIGKILL')
      }
      finish()
    }, BACKEND_SHUTDOWN_TIMEOUT_MS)
  })

  shutdownFinished = true
}

async function runAppShutdown() {
  if (shutdownStarted) {
    return
  }

  shutdownStarted = true
  await shutdownBackend()

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy()
  }

  tray?.destroy()
  tray = null

  app.quit()
}

ipcMain.handle('jarvis:backend-status', async () => {
  try {
    const status = await fetchJson('/api/status')
    return {
      ok: true,
      baseUrl: BACKEND_BASE_URL,
      status
    }
  } catch (error) {
    return {
      ok: false,
      baseUrl: BACKEND_BASE_URL,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})

ipcMain.handle('jarvis:window-control', (_event, action) => {
  const targetWindow = BrowserWindow.getFocusedWindow() || mainWindow
  if (!targetWindow) {
    return { ok: false, error: 'No active JARVIS window' }
  }

  if (action === 'minimize') {
    targetWindow.minimize()
    return { ok: true }
  }

  if (action === 'maximize' || action === 'toggle-maximize') {
    if (targetWindow.isMaximized()) {
      targetWindow.unmaximize()
    } else {
      targetWindow.maximize()
    }
    return { ok: true, maximized: targetWindow.isMaximized() }
  }

  if (action === 'close') {
    targetWindow.close()
    return { ok: true }
  }

  return { ok: false, error: `Unsupported window action: ${action}` }
})

app.whenReady().then(async () => {
  desktopLogPath = path.join(app.getPath('userData'), 'desktop.log')
  appendDesktopLog('[jarvis-desktop] ready', JSON.stringify({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    exePath: app.getPath('exe'),
    backendPort: BACKEND_PORT
  }))
  if (runBackendPreflight()) {
    startBackendProcess()
  } else {
    console.warn('[jarvis-desktop] backend preflight failed; opening offline-capable shell')
    appendDesktopLog('[jarvis-desktop] backend preflight failed; opening offline-capable shell')
  }

  createMainWindow()
  createTray()

  if (process.env.JARVIS_RENDERER_URL) {
    loadRenderer(mainWindow).catch((error) => {
      console.error('[jarvis-desktop] failed to load renderer', error)
    })
    return
  }

  let backendReady = false
  try {
    await waitForBackend()
    backendReady = true
    appendDesktopLog('[jarvis-desktop] backend ready')
  } catch (error) {
    console.warn('[jarvis-desktop] backend readiness check failed; opening offline-capable shell', error)
    appendDesktopLog('[jarvis-desktop] backend readiness check failed', error.stack || String(error))
  }

  loadRenderer(mainWindow).catch((error) => {
    console.error('[jarvis-desktop] failed to load renderer', error)
  })

  if (backendReady) {
    void warmBackendServices()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    runAppShutdown()
  }
})

app.on('before-quit', (event) => {
  if (shutdownFinished || shutdownStarted) {
    return
  }

  event.preventDefault()
  runAppShutdown()
})
