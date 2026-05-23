const { app, BrowserWindow, ipcMain } = require('electron')
const { spawn, spawnSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const BACKEND_HOST = process.env.JARVIS_DESKTOP_BACKEND_HOST || '127.0.0.1'
const BACKEND_PORT = Number.parseInt(process.env.JARVIS_DESKTOP_BACKEND_PORT || '8765', 10)
const BACKEND_BASE_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`
const BACKEND_SHUTDOWN_TIMEOUT_MS = 5000
const BACKEND_SHUTDOWN_TOKEN = process.env.JARVIS_DESKTOP_SHUTDOWN_TOKEN || crypto.randomBytes(32).toString('hex')

let mainWindow = null
let backendProcess = null
let shutdownStarted = false
let shutdownFinished = false

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
      options: {}
    }
  }

  const pythonExecutable = process.env.JARVIS_PYTHON || process.env.PYTHON || 'python'

  return {
    command: pythonExecutable,
    args: [
      '-m',
      'jarvis_cli.desktop_entry',
      '--host',
      BACKEND_HOST,
      '--port',
      String(BACKEND_PORT),
      '--no-open'
    ],
    preflightArgs: [
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
  return {
    ...process.env,
    JARVIS_DESKTOP_EMBEDDED: '1',
    JARVIS_DESKTOP_SHUTDOWN_TOKEN: BACKEND_SHUTDOWN_TOKEN,
    JARVIS_DISABLE_LAZY_INSTALLS: '1'
  }
}

function runBackendPreflight() {
  const launch = resolveBackendLaunch()
  const result = spawnSync(launch.command, launch.preflightArgs, {
    cwd: path.resolve(__dirname, '..'),
    env: backendEnv(),
    encoding: 'utf8',
    windowsHide: true,
    ...launch.options
  })

  if (result.error) {
    console.error('[jarvis-backend] backend preflight failed', result.error)
    return false
  }

  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  if (result.status !== 0) {
    console.error(`[jarvis-backend] backend preflight failed\n${output}`)
    return false
  }

  if (output) {
    console.log(`[jarvis-backend] preflight ${output}`)
  }
  return true
}

function startBackendProcess() {
  if (backendProcess && !backendProcess.killed) {
    return backendProcess
  }

  const launch = resolveBackendLaunch()
  backendProcess = spawn(launch.command, launch.args, {
    cwd: path.resolve(__dirname, '..'),
    env: backendEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    ...launch.options
  })

  backendProcess.stdout?.on('data', (chunk) => {
    console.log(`[jarvis-backend] ${chunk.toString().trimEnd()}`)
  })

  backendProcess.stderr?.on('data', (chunk) => {
    console.error(`[jarvis-backend] ${chunk.toString().trimEnd()}`)
  })

  backendProcess.once('error', (error) => {
    console.error('[jarvis-backend] failed to start', error)
    backendProcess = null
  })

  backendProcess.once('exit', (code, signal) => {
    console.log(`[jarvis-backend] exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
    backendProcess = null
  })

  return backendProcess
}

async function fetchJson(endpoint, options = {}) {
  const response = await fetch(`${BACKEND_BASE_URL}${endpoint}`, options)
  if (!response.ok) {
    throw new Error(`Backend ${endpoint} returned ${response.status}`)
  }

  return response.json()
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
    path.join(__dirname, '..', 'jarvis_cli', 'web_dist', 'index.html')
  ]

  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'jarvis_cli', 'web_dist', 'index.html'))
  }

  return candidates
}

async function loadRenderer(window) {
  if (process.env.JARVIS_RENDERER_URL) {
    await window.loadURL(process.env.JARVIS_RENDERER_URL)
    return
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

  mainWindow.on('close', (event) => {
    if (shutdownFinished || shutdownStarted) {
      return
    }

    event.preventDefault()
    runAppShutdown()
  })

  loadRenderer(mainWindow).catch((error) => {
    console.error('[jarvis-desktop] failed to load renderer', error)
  })
}

async function shutdownBackend() {
  if (shutdownFinished) {
    return
  }

  try {
    await fetchJson('/api/shutdown', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Jarvis-Desktop-Shutdown-Token': BACKEND_SHUTDOWN_TOKEN
      }
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
  if (runBackendPreflight()) {
    startBackendProcess()
  } else {
    console.warn('[jarvis-desktop] backend preflight failed; opening offline-capable shell')
  }

  try {
    await waitForBackend()
  } catch (error) {
    console.warn('[jarvis-desktop] backend readiness check failed; opening offline-capable shell', error)
  }

  createMainWindow()
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
