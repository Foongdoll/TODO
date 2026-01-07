// main/index.cjs (CommonJS 권장: Electron + preload/asar 환경에서 제일 덜 꼬임)
//
// 주의:
// - "type": "module" 이어도, electron-builder/esbuild로 CJS로 번들한 결과물을 main으로 쓰는 게 안전함.
// - 이 파일을 그대로 쓰려면 package.json의 "main"이 이 파일을 가리켜야 함.

const { app, BrowserWindow, ipcMain, nativeTheme, shell } = require("electron");
const path = require("path");
const fs = require("fs-extra");

// const isDev = !app.isPackaged;

const TODO_FILE = () => path.join(app.getPath("userData"), "todos.json");
const ATTACH_DIR = () => path.join(app.getPath("userData"), "attachments");


const defaultDB = () => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  items: [],
});

async function readDB() {
  const file = TODO_FILE();
  try {
    const exists = await fs.pathExists(file);
    if (!exists) {
      const db = defaultDB();
      await fs.outputJson(file, db, { spaces: 2 });
      return db;
    }
    const data = await fs.readJson(file);
    // 최소 방어(깨진 파일이면 초기화)
    if (!data || data.version !== 1 || !Array.isArray(data.items)) {
      const db = defaultDB();
      await fs.outputJson(file, db, { spaces: 2 });
      return db;
    }
    return data;
  } catch {
    const db = defaultDB();
    await fs.outputJson(file, db, { spaces: 2 });
    return db;
  }
}

async function writeDB(db) {
  const file = TODO_FILE();
  const next = { ...db, version: 1, updatedAt: new Date().toISOString() };
  await fs.outputJson(file, next, { spaces: 2 });
  return next;
}

function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*]+/g, "_").replace(/\s+/g, " ").trim() || "file";
}

function parseDataUrl(dataUrl) {
  const match = /^data:(.+?);base64,(.*)$/.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1], data: match[2] };
}

async function saveFromDataUrl(name, dataUrl) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new Error("잘못된 데이터 URL입니다.");

  await fs.ensureDir(ATTACH_DIR());

  const safeName = sanitizeFileName(name);
  const fileName = `${Date.now()}_${Math.random().toString(16).slice(2)}_${safeName}`;
  const targetPath = path.join(ATTACH_DIR(), fileName);
  const buffer = Buffer.from(parsed.data, "base64");
  await fs.outputFile(targetPath, buffer);
  return { path: targetPath, size: buffer.length, mime: parsed.mime };
}

let win = null;

function resolvePreloadPath() {
  const appRoot = app.getAppPath();
  const candidates = [
    // ❌ TS는 Electron이 직접 로드 못함 (여긴 남겨두되 최우선으로 잡히지 않게 하거나 제거 권장)
    path.join(appRoot, "src", "preload", "index.ts"),
    path.join(appRoot, "src", "preload", "index.js"),
    path.join(appRoot, "dist", "preload", "index.js"),
    path.join(appRoot, "preload", "index.js"),
    path.join(appRoot, "preload", "index.cjs"),
  ];
  return candidates.find((candidate) => fs.pathExistsSync(candidate)) ?? candidates[0];
}

function resolveRendererPath() {
  const appRoot = app.getAppPath();
  console.log("App Root:", appRoot);
  const candidates = [
    path.join(appRoot, "dist", "index.html"),
    path.join(appRoot, "renderer", "index.html"),
    path.join(appRoot, "index.html"),
  ];
  return candidates.find((candidate) => fs.pathExistsSync(candidate)) ?? candidates[0];
}

function createWindow() {
  const preloadPath = resolvePreloadPath();

  win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 500,
    minHeight: 750,
    show: false,

    // ✅ 커스텀 타이틀바용
    frame: false,
    titleBarStyle: process.platform === "darwin" ? "hidden" : undefined,

    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win && win.show());

  // renderer 로드
  // if (isDev) {
    win.loadURL("http://localhost:5173");
    
  // } else {
  // win.loadFile(resolveRendererPath());
  // }

  // maximize 상태 변경을 renderer에 push
  const pushMaxState = () => {
    win && win.webContents.send("window:maximized-changed", win.isMaximized());
  };
  win.on("maximize", pushMaxState);
  win.on("unmaximize", pushMaxState);
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/** -------------------------
 *  IPC: TODOS (JSON 저장)
 *  ------------------------- */
ipcMain.handle("todos:load", async () => {
  return await readDB();
});

ipcMain.handle("todos:save", async (_evt, next) => {
  return await writeDB(next);
});

ipcMain.handle("todos:revealPath", async () => {
  return TODO_FILE();
});

/** -------------------------
 *  IPC: FILES (attachments)
 *  ------------------------- */
ipcMain.handle("files:saveFromDataUrl", async (_evt, payload) => {
  if (!payload || !payload.name || !payload.dataUrl) {
    throw new Error("잘못된 요청입니다.");
  }
  return await saveFromDataUrl(payload.name, payload.dataUrl);
});

ipcMain.handle("files:open", async (_evt, filePath) => {
  if (!filePath) return { ok: false, error: "경로가 비어 있습니다." };
  const err = await shell.openPath(filePath);
  return err ? { ok: false, error: err } : { ok: true };
});

ipcMain.handle("files:delete", async (_evt, filePath) => {
  if (!filePath) return false;
  try {
    await fs.remove(filePath);
    return true;
  } catch {
    return false;
  }
});

/** -------------------------
 *  IPC: WINDOW CONTROLS
 *  ------------------------- */
ipcMain.handle("window:minimize", () => {
  win && win.minimize();
});

ipcMain.handle("window:toggleMaximize", () => {
  if (!win) return false;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return win.isMaximized();
});

ipcMain.handle("window:close", () => {
  win && win.close();
});

ipcMain.handle("window:isMaximized", () => {
  return (win && win.isMaximized()) || false;
});

ipcMain.handle("window:theme", () => {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
});
