const { app, BrowserWindow, ipcMain, nativeTheme, shell } = require("electron");
const path = require("path");
const fs = require("fs-extra");

// const isDev = !app.isPackaged;

const ATTACH_DIR = () => path.join(app.getPath("userData"), "attachments");

const sqlite3 = require("sqlite3");
sqlite3.verbose();

const TODO_DB_FILE = () => path.join(app.getPath("userData"), "todos.db");

let db = null;
let dbInitPromise = null;

// ---------- sqlite3 promise wrappers ----------
function openSqlite(filePath) {
  return new Promise((resolve, reject) => {
    const instance = new sqlite3.Database(filePath, (err) => {
      if (err) reject(err);
      else resolve(instance);
    });
  });
}
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function safeJsonParseArray(text) {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function toJsonArray(value) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

async function initTodoStore() {
  if (db) return;
  if (dbInitPromise) {
    await dbInitPromise;
    return;
  }
  dbInitPromise = (async () => {
    const instance = await openSqlite(TODO_DB_FILE());
    instance.configure("busyTimeout", 5000);
    db = instance;

    await run("PRAGMA journal_mode=WAL;");
    await run("PRAGMA synchronous=NORMAL;");
    await run("PRAGMA busy_timeout=5000;");

    // schema
    await run(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

    await run(`
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'TODO',
      date TEXT NOT NULL,
      ord INTEGER NOT NULL DEFAULT 0,
      refs TEXT NOT NULL DEFAULT '[]',
      rels TEXT NOT NULL DEFAULT '[]',
      attachments TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);

    await run(`CREATE INDEX IF NOT EXISTS idx_todos_date_ord ON todos(date, ord);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);`);

    // meta defaults
    const v = await get(`SELECT value FROM meta WHERE key='version'`);
    if (!v) {
      await run(`INSERT INTO meta(key,value) VALUES('version','1')`);
      await run(`INSERT INTO meta(key,value) VALUES('updatedAt', ?)`, [new Date().toISOString()]);
    }
  })();

  try {
    await dbInitPromise;
  } finally {
    dbInitPromise = null;
  }
}

// ----- byDate query (selectedDate만) -----
async function loadTodosByDate(selectedDate) {
  await initTodoStore();

  const rows = await all(
    `
    SELECT
      id, title, content, status, date,
      ord AS "order",
      refs, rels, attachments,
      createdAt, updatedAt
    FROM todos
    WHERE date = ?
    ORDER BY ord ASC, updatedAt ASC
    `,
    [selectedDate]
  );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    status: r.status,
    date: r.date,
    order: r.order,
    refs: safeJsonParseArray(r.refs),
    rels: safeJsonParseArray(r.rels),
    attachments: safeJsonParseArray(r.attachments),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

// ----- summary index (lightweight list for calendar/references) -----
async function loadTodoSummaryIndex() {
  await initTodoStore();

  const rows = await all(`
    SELECT
      id, title, status, date,
      ord AS "order",
      createdAt, updatedAt
    FROM todos
    ORDER BY date ASC, ord ASC, updatedAt ASC
  `);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    date: r.date,
    order: r.order,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

async function upsertTodoRow(todo) {
  await initTodoStore();
  if (!todo || !todo.id) return false;

  const createdAt = String(todo.createdAt ?? new Date().toISOString());
  const updatedAt = String(todo.updatedAt ?? new Date().toISOString());

  await run(
    `
    INSERT INTO todos
    (id, title, content, status, date, ord, refs, rels, attachments, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,
      content=excluded.content,
      status=excluded.status,
      date=excluded.date,
      ord=excluded.ord,
      refs=excluded.refs,
      rels=excluded.rels,
      attachments=excluded.attachments,
      updatedAt=excluded.updatedAt
    `,
    [
      String(todo.id),
      String(todo.title ?? ""),
      String(todo.content ?? ""),
      String(todo.status ?? "TODO"),
      String(todo.date ?? ""),
      Number.isFinite(todo.order) ? todo.order : 0,
      toJsonArray(todo.refs),
      toJsonArray(todo.rels),
      toJsonArray(todo.attachments),
      createdAt,
      updatedAt,
    ]
  );

  await run(`INSERT OR REPLACE INTO meta(key,value) VALUES('updatedAt', ?)`, [new Date().toISOString()]);
  return true;
}

async function deleteTodoRow(id) {
  await initTodoStore();
  if (!id) return false;

  const pattern = `%\"${id}\"%`;
  const rows = await all(`SELECT id, refs, rels FROM todos WHERE refs LIKE ? OR rels LIKE ?`, [pattern, pattern]);
  const now = new Date().toISOString();

  await run("BEGIN IMMEDIATE TRANSACTION;");
  try {
    await run(`DELETE FROM todos WHERE id = ?`, [id]);

    for (const row of rows) {
      if (row.id === id) continue;
      const nextRefs = safeJsonParseArray(row.refs).filter((ref) => ref !== id);
      const nextRels = safeJsonParseArray(row.rels).filter((rel) => rel?.toId !== id);
      const refsChanged = JSON.stringify(nextRefs) !== row.refs;
      const relsChanged = JSON.stringify(nextRels) !== row.rels;
      if (!refsChanged && !relsChanged) continue;
      await run(
        `UPDATE todos SET refs = ?, rels = ?, updatedAt = ? WHERE id = ?`,
        [JSON.stringify(nextRefs), JSON.stringify(nextRels), now, row.id]
      );
    }

    await run(`INSERT OR REPLACE INTO meta(key,value) VALUES('updatedAt', ?)`, [now]);
    await run("COMMIT;");
    return true;
  } catch (e) {
    await run("ROLLBACK;");
    throw e;
  }
}

async function updateTodoOrders(updates) {
  await initTodoStore();
  if (!Array.isArray(updates) || updates.length === 0) return true;

  const now = new Date().toISOString();
  await run("BEGIN IMMEDIATE TRANSACTION;");
  try {
    for (const item of updates) {
      if (!item || !item.id) continue;
      const nextUpdatedAt = String(item.updatedAt ?? now);
      await run(`UPDATE todos SET ord = ?, updatedAt = ? WHERE id = ?`, [
        Number.isFinite(item.order) ? item.order : 0,
        nextUpdatedAt,
        String(item.id),
      ]);
    }
    await run(`INSERT OR REPLACE INTO meta(key,value) VALUES('updatedAt', ?)`, [now]);
    await run("COMMIT;");
    return true;
  } catch (e) {
    await run("ROLLBACK;");
    throw e;
  }
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
  const candidates = [
    path.join(appRoot, "dist", "index.html"),
    path.join(appRoot, "renderer", "index.html"),
    path.join(appRoot, "index.html"),
  ];
  return candidates.find((candidate) => fs.pathExistsSync(candidate)) ?? candidates[0];
}
var __dirname = path.resolve();
function createWindow() {
  const preloadPath = resolvePreloadPath();

  win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 500,
    minHeight: 750,
    show: false,
    icon: path.join(__dirname, "..", "assets", "icon.png"),
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
 *  IPC: TODOS
 *  ------------------------- */

ipcMain.handle("todos:revealPath", async () => {
  return TODO_DB_FILE();
});

// ✅ 추가: 선택 날짜만 조회
ipcMain.handle("todos:byDate", async (_evt, selectedDate) => {
  if (!selectedDate) return [];
  return await loadTodosByDate(String(selectedDate));
});

ipcMain.handle("todos:summary", async () => {
  return await loadTodoSummaryIndex();
});

ipcMain.handle("todos:upsert", async (_evt, todo) => {
  return await upsertTodoRow(todo);
});

ipcMain.handle("todos:delete", async (_evt, id) => {
  return await deleteTodoRow(String(id));
});

ipcMain.handle("todos:updateOrders", async (_evt, updates) => {
  return await updateTodoOrders(updates);
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
