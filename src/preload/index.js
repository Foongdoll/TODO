const { contextBridge, ipcRenderer } = require("electron");

// WindowTheme: "light" | "dark"  (runtime doesn't need TS type)

const api = {
  todos: {
    summary: () => ipcRenderer.invoke("todos:summary"),
    revealPath: () => ipcRenderer.invoke("todos:revealPath"),
    byDate: (selectedDate) => ipcRenderer.invoke("todos:byDate", selectedDate),
    upsert: (todo) => ipcRenderer.invoke("todos:upsert", todo),
    delete: (id) => ipcRenderer.invoke("todos:delete", id),
    updateOrders: (updates) => ipcRenderer.invoke("todos:updateOrders", updates),
  },
  notes: {
    tree: () => ipcRenderer.invoke("notes:tree"),
    get: (noteId) => ipcRenderer.invoke("notes:get", noteId),
    upsertNote: (note) => ipcRenderer.invoke("notes:upsertNote", note),
    upsertFolder: (folder) => ipcRenderer.invoke("notes:upsertFolder", folder),
    deleteNote: (noteId) => ipcRenderer.invoke("notes:deleteNote", noteId),
    deleteFolder: (folderId) => ipcRenderer.invoke("notes:deleteFolder", folderId),
    addAttachment: (payload) => ipcRenderer.invoke("notes:addAttachment", payload),
    removeAttachment: (payload) => ipcRenderer.invoke("notes:removeAttachment", payload),
    updateLinks: (payload) => ipcRenderer.invoke("notes:updateLinks", payload),
    downloadAttachment: (payload) => ipcRenderer.invoke("notes:downloadAttachment", payload),
    exportPdf: (payload) => ipcRenderer.invoke("notes:exportPdf", payload),
  },
  files: {
    saveFromDataUrl: (payload) => ipcRenderer.invoke("files:saveFromDataUrl", payload),
    open: (filePath) => ipcRenderer.invoke("files:open", filePath),
    delete: (filePath) => ipcRenderer.invoke("files:delete", filePath),
  },
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggleMaximize"),
    close: () => ipcRenderer.invoke("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
    theme: () => ipcRenderer.invoke("window:theme"),
    getOpacity: () => ipcRenderer.invoke("window:getOpacity"),
    setOpacity: (value) => ipcRenderer.invoke("window:setOpacity", value),
    onMaximizedChanged: (cb) => {
      const handler = (_event, isMax) => cb(isMax);
      ipcRenderer.on("window:maximized-changed", handler);

      // ✅ cleanup function (Effect destructor-safe)
      return () => {
        ipcRenderer.removeListener("window:maximized-changed", handler);
      };
    },
  },
};

contextBridge.exposeInMainWorld("api", api);
