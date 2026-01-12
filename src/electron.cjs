const { app, BrowserWindow, ipcMain, nativeTheme, shell, dialog, protocol } = require("electron");
const path = require("path");
const fs = require("fs-extra");

// const isDev = !app.isPackaged;

const ATTACH_DIR = () => path.join(app.getPath("userData"), "attachments");
const ATTACHMENT_PROTOCOL = "note-attachment";

const sqlite3 = require("sqlite3");
sqlite3.verbose();

protocol.registerSchemesAsPrivileged([
  {
    scheme: ATTACHMENT_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

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

async function ensureColumn(table, column, declaration) {
  const rows = await all(`PRAGMA table_info(${table})`);
  const exists = rows.some((row) => row?.name === column);
  if (!exists) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${declaration}`);
  }
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
      isDaily INTEGER NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      ord INTEGER NOT NULL DEFAULT 0,
      refs TEXT NOT NULL DEFAULT '[]',
      rels TEXT NOT NULL DEFAULT '[]',
      attachments TEXT NOT NULL DEFAULT '[]',
      linkedNoteId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);

    await run(`CREATE INDEX IF NOT EXISTS idx_todos_date_ord ON todos(date, ord);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_todos_linked_note ON todos(linkedNoteId);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_todos_daily ON todos(isDaily);`);

    await run(`
    CREATE TABLE IF NOT EXISTS note_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parentId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);

    await run(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      contentTiptap TEXT,
      folderId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);

    await run(`
    CREATE TABLE IF NOT EXISTS note_attachments (
      id TEXT PRIMARY KEY,
      noteId TEXT NOT NULL,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      kind TEXT NOT NULL DEFAULT 'file',
      createdAt TEXT NOT NULL
    );
  `);

    await run(`
    CREATE TABLE IF NOT EXISTS note_todo_links (
      noteId TEXT NOT NULL,
      todoId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      PRIMARY KEY (noteId, todoId)
    );
  `);

    await run(`CREATE INDEX IF NOT EXISTS idx_note_folders_parent ON note_folders(parentId);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folderId);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_note_attachments_note ON note_attachments(noteId);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_note_links_todo ON note_todo_links(todoId);`);

    await ensureColumn("todos", "linkedNoteId", "linkedNoteId TEXT");
    await ensureColumn("todos", "isDaily", "isDaily INTEGER NOT NULL DEFAULT 0");
    await ensureColumn("notes", "contentTiptap", "contentTiptap TEXT");

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
      id, title, content, status, isDaily, date,
      ord AS "order",
      refs, rels, attachments, linkedNoteId,
      createdAt, updatedAt
    FROM todos
    WHERE date = ? OR isDaily = 1
    ORDER BY isDaily DESC, ord ASC, updatedAt ASC
    `,
    [selectedDate]
  );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    status: r.status,
    isDaily: Boolean(r.isDaily),
    date: r.date,
    order: r.order,
    refs: safeJsonParseArray(r.refs),
    rels: safeJsonParseArray(r.rels),
    attachments: safeJsonParseArray(r.attachments),
    linkedNoteId: r.linkedNoteId ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

// ----- summary index (lightweight list for calendar/references) -----
async function loadTodoSummaryIndex() {
  await initTodoStore();

  const rows = await all(`
    SELECT
      id, title, status, isDaily, date,
      ord AS "order",
      linkedNoteId,
      createdAt, updatedAt
    FROM todos
    ORDER BY date ASC, ord ASC, updatedAt ASC
  `);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    isDaily: Boolean(r.isDaily),
    date: r.date,
    order: r.order,
    linkedNoteId: r.linkedNoteId ?? null,
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
    (id, title, content, status, isDaily, date, ord, refs, rels, attachments, linkedNoteId, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,
      content=excluded.content,
      status=excluded.status,
      isDaily=excluded.isDaily,
      date=excluded.date,
      ord=excluded.ord,
      refs=excluded.refs,
      rels=excluded.rels,
      attachments=excluded.attachments,
      linkedNoteId=excluded.linkedNoteId,
      updatedAt=excluded.updatedAt
    `,
    [
      String(todo.id),
      String(todo.title ?? ""),
      String(todo.content ?? ""),
      String(todo.status ?? "TODO"),
      todo.isDaily ? 1 : 0,
      String(todo.date ?? ""),
      Number.isFinite(todo.order) ? todo.order : 0,
      toJsonArray(todo.refs),
      toJsonArray(todo.rels),
      toJsonArray(todo.attachments),
      todo.linkedNoteId ? String(todo.linkedNoteId) : null,
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

async function loadNoteTree() {
  await initTodoStore();
  const folders = await all(
    `
    SELECT id, name, parentId, createdAt, updatedAt
    FROM note_folders
    ORDER BY name ASC
    `
  );
  const notes = await all(
    `
    SELECT id, title, folderId, createdAt, updatedAt
    FROM notes
    ORDER BY updatedAt DESC
    `
  );
  return { folders, notes };
}

async function loadNoteDetail(noteId) {
  await initTodoStore();
  if (!noteId) return null;
  const note = await get(
    `
    SELECT id, title, content, contentTiptap, folderId, createdAt, updatedAt
    FROM notes
    WHERE id = ?
    `,
    [noteId]
  );
  if (!note) return null;
  const attachments = await all(
    `
    SELECT id, noteId, name, path, mime, size, kind, createdAt
    FROM note_attachments
    WHERE noteId = ?
    ORDER BY createdAt ASC
    `,
    [noteId]
  );
  const links = await all(
    `
    SELECT todoId
    FROM note_todo_links
    WHERE noteId = ?
    ORDER BY createdAt ASC
    `,
    [noteId]
  );
  return {
    ...note,
    attachments,
    todoLinks: links.map((row) => row.todoId),
  };
}

async function upsertNote(note) {
  await initTodoStore();
  if (!note || !note.id) return false;
  const createdAt = String(note.createdAt ?? new Date().toISOString());
  const updatedAt = String(note.updatedAt ?? new Date().toISOString());
  const contentTiptap =
    typeof note.contentTiptap === "string"
      ? note.contentTiptap
      : note.contentTiptap
        ? JSON.stringify(note.contentTiptap)
        : null;
  await run(
    `
    INSERT INTO notes (id, title, content, contentTiptap, folderId, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,
      content=excluded.content,
      contentTiptap=excluded.contentTiptap,
      folderId=excluded.folderId,
      updatedAt=excluded.updatedAt
    `,
    [
      String(note.id),
      String(note.title ?? ""),
      String(note.content ?? ""),
      contentTiptap,
      note.folderId ? String(note.folderId) : null,
      createdAt,
      updatedAt,
    ]
  );
  await run(`INSERT OR REPLACE INTO meta(key,value) VALUES('updatedAt', ?)`, [new Date().toISOString()]);
  return true;
}

async function upsertNoteFolder(folder) {
  await initTodoStore();
  if (!folder || !folder.id) return false;
  const createdAt = String(folder.createdAt ?? new Date().toISOString());
  const updatedAt = String(folder.updatedAt ?? new Date().toISOString());
  await run(
    `
    INSERT INTO note_folders (id, name, parentId, createdAt, updatedAt)
    VALUES (?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,
      parentId=excluded.parentId,
      updatedAt=excluded.updatedAt
    `,
    [
      String(folder.id),
      String(folder.name ?? ""),
      folder.parentId ? String(folder.parentId) : null,
      createdAt,
      updatedAt,
    ]
  );
  await run(`INSERT OR REPLACE INTO meta(key,value) VALUES('updatedAt', ?)`, [new Date().toISOString()]);
  return true;
}

async function deleteNote(noteId) {
  await initTodoStore();
  if (!noteId) return false;
  const attRows = await all(`SELECT path FROM note_attachments WHERE noteId = ?`, [noteId]);
  await run("BEGIN IMMEDIATE TRANSACTION;");
  try {
    await run(`DELETE FROM note_todo_links WHERE noteId = ?`, [noteId]);
    await run(`DELETE FROM note_attachments WHERE noteId = ?`, [noteId]);
    await run(`DELETE FROM notes WHERE id = ?`, [noteId]);
    await run(`INSERT OR REPLACE INTO meta(key,value) VALUES('updatedAt', ?)`, [new Date().toISOString()]);
    await run("COMMIT;");
  } catch (e) {
    await run("ROLLBACK;");
    throw e;
  }
  for (const row of attRows) {
    if (!row?.path) continue;
    try {
      await fs.remove(row.path);
    } catch {
      // ignore file delete errors
    }
  }
  return true;
}

async function deleteNoteFolder(folderId) {
  await initTodoStore();
  if (!folderId) return false;
  const folderRows = await all(`SELECT id, parentId FROM note_folders`);
  const childrenMap = new Map();
  for (const row of folderRows) {
    const key = row.parentId ?? "__root__";
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    childrenMap.get(key).push(row.id);
  }
  const collected = [];
  const stack = [folderId];
  while (stack.length) {
    const current = stack.pop();
    if (!current || collected.includes(current)) continue;
    collected.push(current);
    const kids = childrenMap.get(current) ?? [];
    for (const kid of kids) stack.push(kid);
  }
  if (collected.length === 0) return false;
  const placeholders = collected.map(() => "?").join(",");
  const noteRows = await all(
    `SELECT id FROM notes WHERE folderId IN (${placeholders})`,
    collected
  );
  const noteIds = noteRows.map((r) => r.id);
  const attPaths = [];
  if (noteIds.length) {
    const notePlaceholders = noteIds.map(() => "?").join(",");
    const attRows = await all(
      `SELECT path FROM note_attachments WHERE noteId IN (${notePlaceholders})`,
      noteIds
    );
    for (const row of attRows) {
      if (row?.path) attPaths.push(row.path);
    }
  }
  await run("BEGIN IMMEDIATE TRANSACTION;");
  try {
    if (noteIds.length) {
      const notePlaceholders = noteIds.map(() => "?").join(",");
      await run(`DELETE FROM note_todo_links WHERE noteId IN (${notePlaceholders})`, noteIds);
      await run(`DELETE FROM note_attachments WHERE noteId IN (${notePlaceholders})`, noteIds);
      await run(`DELETE FROM notes WHERE id IN (${notePlaceholders})`, noteIds);
    }
    await run(`DELETE FROM note_folders WHERE id IN (${placeholders})`, collected);
    await run(`INSERT OR REPLACE INTO meta(key,value) VALUES('updatedAt', ?)`, [new Date().toISOString()]);
    await run("COMMIT;");
  } catch (e) {
    await run("ROLLBACK;");
    throw e;
  }
  for (const filePath of attPaths) {
    try {
      await fs.remove(filePath);
    } catch {
      // ignore file delete errors
    }
  }
  return true;
}

async function addNoteAttachment(noteId, payload) {
  await initTodoStore();
  if (!noteId || !payload?.name || !payload?.dataUrl) return null;
  const saved = await saveFromDataUrl(payload.name, payload.dataUrl);
  const isImage = saved.mime?.startsWith("image/");
  const attachment = {
    id: `att_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    noteId: String(noteId),
    name: String(payload.name),
    path: saved.path,
    mime: saved.mime || "application/octet-stream",
    size: saved.size || 0,
    kind: isImage ? "image" : "file",
    createdAt: new Date().toISOString(),
  };
  await run(
    `
    INSERT INTO note_attachments (id, noteId, name, path, mime, size, kind, createdAt)
    VALUES (?,?,?,?,?,?,?,?)
    `,
    [
      attachment.id,
      attachment.noteId,
      attachment.name,
      attachment.path,
      attachment.mime,
      attachment.size,
      attachment.kind,
      attachment.createdAt,
    ]
  );
  await run(`INSERT OR REPLACE INTO meta(key,value) VALUES('updatedAt', ?)`, [new Date().toISOString()]);
  return attachment;
}

async function removeNoteAttachment(noteId, attachmentId) {
  await initTodoStore();
  if (!noteId || !attachmentId) return false;
  const row = await get(
    `SELECT path FROM note_attachments WHERE id = ? AND noteId = ?`,
    [attachmentId, noteId]
  );
  await run(`DELETE FROM note_attachments WHERE id = ? AND noteId = ?`, [attachmentId, noteId]);
  await run(`INSERT OR REPLACE INTO meta(key,value) VALUES('updatedAt', ?)`, [new Date().toISOString()]);
  if (row?.path) {
    try {
      await fs.remove(row.path);
    } catch {
      // ignore file delete errors
    }
  }
  return true;
}

async function setNoteTodoLinks(noteId, todoIds) {
  await initTodoStore();
  if (!noteId) return false;
  const normalized = Array.isArray(todoIds)
    ? Array.from(new Set(todoIds.filter(Boolean).map((v) => String(v))))
    : [];
  await run("BEGIN IMMEDIATE TRANSACTION;");
  try {
    await run(`DELETE FROM note_todo_links WHERE noteId = ?`, [noteId]);
    const now = new Date().toISOString();
    for (const todoId of normalized) {
      await run(
        `INSERT INTO note_todo_links (noteId, todoId, createdAt) VALUES (?,?,?)`,
        [String(noteId), todoId, now]
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

async function downloadAttachment(payload) {
  if (!payload?.path) return { ok: false, canceled: false };
  const safeName = sanitizeFileName(payload.name || path.basename(payload.path));
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: "첨부파일 저장",
    defaultPath: path.join(app.getPath("downloads"), safeName),
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  await fs.copy(payload.path, filePath);
  return { ok: true, path: filePath };
}

async function exportNotePdf(payload) {
  if (!payload?.html) return { ok: false, canceled: false };
  const safeName = sanitizeFileName(payload.title || "note");
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: "노트를 PDF로 내보내기",
    defaultPath: path.join(app.getPath("documents"), `${safeName}.pdf`),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };

  const html = `
    <!doctype html>
    <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <title>${safeName}</title>
        <style>
          body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; padding: 32px; }
          h1, h2, h3 { font-family: "Georgia", serif; }
          img { max-width: 100%; height: auto; }
          pre { background: #0f172a; color: #f8fafc; padding: 12px; border-radius: 12px; overflow: auto; }
          code { background: #f1f5f9; padding: 2px 4px; border-radius: 4px; }
          blockquote { border-left: 3px solid #f59e0b; padding-left: 12px; color: #475569; }
        </style>
      </head>
      <body>
        <h1>${safeName}</h1>
        <div>${payload.html}</div>
      </body>
    </html>
  `;

  const pdfWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
    },
  });

  await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  const pdfData = await pdfWindow.webContents.printToPDF({ printBackground: true });
  await fs.outputFile(filePath, pdfData);
  pdfWindow.close();
  return { ok: true, path: filePath };
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
  initTodoStore();
  protocol.registerFileProtocol(ATTACHMENT_PROTOCOL, (request, callback) => {
    const url = request.url.slice(`${ATTACHMENT_PROTOCOL}://`.length);
    const decodedPath = decodeURI(url);
    const resolved = path.resolve(decodedPath);
    const root = path.resolve(ATTACH_DIR());
    if (!resolved.toLowerCase().startsWith(root.toLowerCase())) {
      callback({ error: -10 });
      return;
    }
    callback({ path: resolved });
  });
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
 *  IPC: NOTES
 *  ------------------------- */
ipcMain.handle("notes:tree", async () => {
  return await loadNoteTree();
});

ipcMain.handle("notes:get", async (_evt, noteId) => {
  return await loadNoteDetail(String(noteId));
});

ipcMain.handle("notes:upsertNote", async (_evt, note) => {
  return await upsertNote(note);
});

ipcMain.handle("notes:upsertFolder", async (_evt, folder) => {
  return await upsertNoteFolder(folder);
});

ipcMain.handle("notes:deleteNote", async (_evt, noteId) => {
  return await deleteNote(String(noteId));
});

ipcMain.handle("notes:deleteFolder", async (_evt, folderId) => {
  return await deleteNoteFolder(String(folderId));
});

ipcMain.handle("notes:addAttachment", async (_evt, payload) => {
  if (!payload?.noteId) return null;
  return await addNoteAttachment(String(payload.noteId), payload);
});

ipcMain.handle("notes:removeAttachment", async (_evt, payload) => {
  if (!payload?.noteId || !payload?.attachmentId) return false;
  return await removeNoteAttachment(String(payload.noteId), String(payload.attachmentId));
});

ipcMain.handle("notes:updateLinks", async (_evt, payload) => {
  if (!payload?.noteId) return false;
  return await setNoteTodoLinks(String(payload.noteId), payload.todoIds ?? []);
});

ipcMain.handle("notes:downloadAttachment", async (_evt, payload) => {
  return await downloadAttachment(payload);
});

ipcMain.handle("notes:exportPdf", async (_evt, payload) => {
  return await exportNotePdf(payload);
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

ipcMain.handle("window:getOpacity", () => {
  if (!win) return 1;
  return typeof win.getOpacity === "function" ? win.getOpacity() : 1;
});

ipcMain.handle("window:setOpacity", (_evt, value) => {
  if (!win || typeof win.setOpacity !== "function") return 1;
  const next = Math.min(1, Math.max(0.6, Number(value) || 1));
  win.setOpacity(next);
  return next;
});
