'use strict'

const { app, BrowserWindow, shell, dialog } = require('electron')
const path = require('path')

const IS_PACKAGED = app.isPackaged

// Dev server URL (Vite)
const DEV_URL = 'http://localhost:5173'

// Icon: from resources/ in packaged builds, from public/ in dev
const ICON_PATH = IS_PACKAGED
  ? path.join(process.resourcesPath, 'icon-512.png')
  : path.join(__dirname, '..', 'public', 'icons', 'icon-512.png')

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'دكانكس',
    icon: ICON_PATH,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  win.setMenuBarVisibility(false)
  win.center()

  if (IS_PACKAGED) {
    // Load the compiled React app from dist/
    win.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
  } else {
    // Load the Vite dev server (started separately via npm run dev)
    win.loadURL(DEV_URL)
  }

  win.webContents.on('did-finish-load', () => win.show())

  // Handle load failure (e.g. dev server not running yet)
  win.webContents.on('did-fail-load', (_event, errorCode, _desc, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return // -3 = aborted redirect, ignore
    win.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8"/>
  <title>دكانكس</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#0f172a;color:#f8fafc;
      display:flex;align-items:center;justify-content:center;min-height:100vh}
    .card{text-align:center;padding:3rem 2rem;background:#1e293b;border-radius:1rem;
      border:1px solid #334155;max-width:420px;width:90%}
    .icon{font-size:4rem;margin-bottom:1.5rem}
    h2{font-size:1.4rem;margin-bottom:.75rem;color:#f1f5f9}
    p{color:#94a3b8;font-size:.9rem;line-height:1.7;margin-bottom:2rem}
    code{background:#0f172a;padding:.2rem .5rem;border-radius:.3rem;font-size:.8rem;color:#a5b4fc}
    button{background:#6366f1;color:#fff;border:none;padding:.75rem 2.5rem;
      border-radius:.6rem;font-size:1rem;cursor:pointer;font-family:inherit}
    button:hover{background:#4f46e5}
  </style>
</head>
<body>
<div class="card">
  <div class="icon">📡</div>
  <h2>تحقق من اتصالك بالإنترنت</h2>
  <p>
    دكانكس بيحتاج إنترنت عشان يشتغل.<br/>
    تأكد من الاتصال وحاول تاني.
    ${!IS_PACKAGED ? '<br/><br/>في وضع التطوير تأكد إن <code>npm run dev</code> شغّال.' : ''}
  </p>
  <button onclick="window.location.reload()">حاول تاني</button>
</div>
</body>
</html>`)}`)
    win.show()
  })

  // Open DevTools only in dev mode (detached so it doesn't dock inside window)
  if (!IS_PACKAGED) {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  // Route external links to the system browser instead of a new Electron window
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  return win
}

// ─── Auto-updater ─────────────────────────────────────────────────────────────
// Only active in packaged builds. Silent check; prompts user only when ready.
function setupAutoUpdater(win) {
  if (!IS_PACKAGED) return
  try {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.checkForUpdates().catch(() => {
      // No release configured or no internet — fail silently
    })

    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox(win, {
        type: 'info',
        title: 'تحديث جاهز',
        message: 'تم تنزيل تحديث جديد لدكانكس.',
        detail: 'سيتم تثبيته تلقائياً عند الإغلاق، أو اضغط "الآن" لإعادة التشغيل دلوقتي.',
        buttons: ['الآن', 'لاحقاً'],
        defaultId: 0,
        cancelId: 1,
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall(false, true)
      })
    })
  } catch {
    // electron-updater not available or not configured — skip silently
  }
}

// ─── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  const win = createWindow()
  setupAutoUpdater(win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
