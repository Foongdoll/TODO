const { contextBridge, ipcRenderer } = require("electron");

// WindowTheme: "light" | "dark"  (runtime doesn't need TS type)

const api = {
  todos: {
    load: () => ipcRenderer.invoke("todos:load"),
    save: (db) => ipcRenderer.invoke("todos:save", db),
    revealPath: () => ipcRenderer.invoke("todos:revealPath"),
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