export interface ApiBridge {
  todos: {
    summary: () => Promise<any[]>;
    revealPath: () => Promise<string>;
    byDate: (selectedDate: string) => Promise<any[]>;
    upsert: (todo: any) => Promise<boolean>;
    delete: (id: string) => Promise<boolean>;
    updateOrders: (updates: Array<{ id: string; order: number; updatedAt: string }>) => Promise<boolean>;
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

