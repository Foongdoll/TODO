export interface ApiBridge {
  todos: {
    summary: () => Promise<any[]>;
    revealPath: () => Promise<string>;
    byDate: (selectedDate: string) => Promise<any[]>;
    upsert: (todo: any) => Promise<boolean>;
    delete: (id: string) => Promise<boolean>;
    updateOrders: (updates: Array<{ id: string; order: number; updatedAt: string }>) => Promise<boolean>;
  };
  notes: {
    tree: () => Promise<{ folders: any[]; notes: any[] }>;
    get: (noteId: string) => Promise<any | null>;
    upsertNote: (note: any) => Promise<boolean>;
    upsertFolder: (folder: any) => Promise<boolean>;
    deleteNote: (noteId: string) => Promise<boolean>;
    deleteFolder: (folderId: string) => Promise<boolean>;
    addAttachment: (payload: { noteId: string; name: string; dataUrl: string }) => Promise<any | null>;
    removeAttachment: (payload: { noteId: string; attachmentId: string }) => Promise<boolean>;
    updateLinks: (payload: { noteId: string; todoIds: string[] }) => Promise<boolean>;
    downloadAttachment: (payload: { path: string; name?: string }) => Promise<{ ok: boolean; canceled?: boolean; path?: string }>;
    exportPdf: (payload: { title: string; html: string }) => Promise<{ ok: boolean; canceled?: boolean; path?: string }>;
  };
  files: {
    saveFromDataUrl: (payload: { name: string; dataUrl: string }) => Promise<{ path: string; size: number; mime: string }>;
    open: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
    delete: (filePath: string) => Promise<boolean>;
  };
  window: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<boolean>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    theme: () => Promise<string>;
    onMaximizedChanged: (cb: (isMax: boolean) => void) => () => void;
  };
}

