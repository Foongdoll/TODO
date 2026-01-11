import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  Link2,
  Save,
  Trash2,
  Upload,
} from "lucide-react";

type NoteFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
};

type NoteSummary = {
  id: string;
  title: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
};

type NoteAttachment = {
  id: string;
  noteId: string;
  name: string;
  path: string;
  mime: string;
  size: number;
  kind: "image" | "file";
  createdAt: string;
};

type NoteDetail = NoteSummary & {
  content: string;
  attachments: NoteAttachment[];
  todoLinks: string[];
};

type TodoSummary = {
  id: string;
  title: string;
  status: string;
  date: string;
};

type DragItem = {
  kind: "folder" | "note";
  id: string;
};

const hasNotesBridge = typeof window !== "undefined" && Boolean(window.api?.notes);
const hasTodosBridge = typeof window !== "undefined" && Boolean(window.api?.todos);
const hasFileBridge = typeof window !== "undefined" && Boolean(window.api?.files);

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
const nowIso = () => new Date().toISOString();
const DRAG_MIME = "application/x-note-item";
const ROOT_DROP_ID = "__root__";

function toFileUrl(filePath: string) {
  if (!filePath) return "";
  const normalized = filePath.replace(/\\/g, "/");
  const fileUrl = normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`;
  return encodeURI(fileUrl);
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let idx = 0;
  let value = size;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function fileKindLabel(att: NoteAttachment) {
  if (att.kind === "image") return "이미지";
  const ext = att.name.split(".").pop()?.toLowerCase();
  if (!ext) return "파일";
  if (["pdf"].includes(ext)) return "PDF";
  if (["doc", "docx"].includes(ext)) return "워드";
  if (["ppt", "pptx"].includes(ext)) return "파워포인트";
  if (["xls", "xlsx", "csv"].includes(ext)) return "스프레드시트";
  return ext.toUpperCase();
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("파일을 읽을 수 없습니다."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

export default function Note() {
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<NoteDetail | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [folderEditId, setFolderEditId] = useState<string | null>(null);
  const [folderDraftName, setFolderDraftName] = useState("");
  const [todoItems, setTodoItems] = useState<TodoSummary[]>([]);
  const [todoSearch, setTodoSearch] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<NoteDetail | null>(null);

  const foldersByParent = useMemo(() => {
    const map = new Map<string | null, NoteFolder[]>();
    for (const folder of folders) {
      const key = folder.parentId ?? null;
      const list = map.get(key) ?? [];
      list.push(folder);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [folders]);

  const notesByFolder = useMemo(() => {
    const map = new Map<string | null, NoteSummary[]>();
    for (const note of notes) {
      const key = note.folderId ?? null;
      const list = map.get(key) ?? [];
      list.push(note);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    return map;
  }, [notes]);

  const filteredTodos = useMemo(() => {
    const query = todoSearch.trim().toLowerCase();
    return todoItems.filter((item) => !query || item.title.toLowerCase().includes(query));
  }, [todoItems, todoSearch]);

  const linkedTodoIds = selectedNote?.todoLinks ?? [];
  const flashStatus = (message: string) => {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(""), 2600);
  };

  const parseDragItem = (event: React.DragEvent): DragItem | null => {
    const raw = event.dataTransfer.getData(DRAG_MIME) || event.dataTransfer.getData("text/plain");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as DragItem;
      if ((parsed.kind === "folder" || parsed.kind === "note") && parsed.id) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  };

  const isDescendantFolder = (targetId: string | null, sourceId: string) => {
    if (!targetId) return false;
    const stack = (foldersByParent.get(sourceId) ?? []).map((child) => child.id);
    while (stack.length) {
      const current = stack.pop();
      if (!current) continue;
      if (current === targetId) return true;
      const children = foldersByParent.get(current) ?? [];
      for (const child of children) stack.push(child.id);
    }
    return false;
  };

  const moveFolderTo = async (folderId: string, targetParentId: string | null) => {
    if (!hasNotesBridge) return;
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) return;
    const nextParentId = targetParentId ?? null;
    if (folder.parentId === nextParentId) return;
    if (nextParentId === folderId || isDescendantFolder(nextParentId, folderId)) {
      flashStatus("하위 폴더로는 이동할 수 없습니다.");
      return;
    }
    await window.api.notes.upsertFolder({
      ...folder,
      parentId: nextParentId,
      updatedAt: nowIso(),
    });
    setExpandedFolders((prev) => ({ ...prev, [nextParentId ?? ROOT_DROP_ID]: true }));
    await refreshTree();
    flashStatus("폴더를 이동했습니다.");
  };

  const moveNoteTo = async (noteId: string, targetFolderId: string | null) => {
    if (!hasNotesBridge) return;
    const summary = notes.find((item) => item.id === noteId);
    if (!summary) return;
    const nextFolderId = targetFolderId ?? null;
    if ((summary.folderId ?? null) === nextFolderId) return;
    const detail =
      selectedNote?.id === noteId ? selectedNote : await window.api.notes.get(noteId);
    if (!detail) return;
    const updated: NoteDetail = {
      ...detail,
      folderId: nextFolderId,
      updatedAt: nowIso(),
    };
    await window.api.notes.upsertNote(updated);
    if (selectedNote?.id === noteId) {
      setSelectedNote(updated);
      setSelectedFolderId(nextFolderId);
    }
    setExpandedFolders((prev) => ({ ...prev, [nextFolderId ?? ROOT_DROP_ID]: true }));
    await refreshTree();
    flashStatus("노트를 이동했습니다.");
  };

  const handleDropOn = async (targetFolderId: string | null, event: React.DragEvent) => {
    const types = Array.from(event.dataTransfer.types || []);
    if (!types.includes(DRAG_MIME)) return;
    event.preventDefault();
    setDragOverId(null);
    const item = parseDragItem(event);
    if (!item) return;
    if (item.kind === "folder") {
      await moveFolderTo(item.id, targetFolderId);
    } else {
      await moveNoteTo(item.id, targetFolderId);
    }
  };

  const handleDragStart =
    (item: DragItem) => (event: React.DragEvent) => {
      event.dataTransfer.setData(DRAG_MIME, JSON.stringify(item));
      event.dataTransfer.setData("text/plain", JSON.stringify(item));
      event.dataTransfer.effectAllowed = "move";
    };

  const handleDragOver =
    (targetId: string) => (event: React.DragEvent) => {
      const types = Array.from(event.dataTransfer.types || []);
      if (!types.includes(DRAG_MIME)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDragOverId(targetId);
    };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  useEffect(() => {
    if (!hasNotesBridge) return;
    window.api.notes.tree().then((result) => {
      setFolders(result?.folders ?? []);
      setNotes(result?.notes ?? []);
    });
  }, []);

  useEffect(() => {
    if (!hasTodosBridge) return;
    window.api.todos.summary().then((items) => setTodoItems(items ?? []));
  }, []);

  useEffect(() => {
    if (!selectedNoteId || !hasNotesBridge) {
      setSelectedNote(null);
      return;
    }
    window.api.notes.get(selectedNoteId).then((detail) => {
      setSelectedNote(detail);
    });
  }, [selectedNoteId]);

  useEffect(() => {
    if (selectedNoteId) return;
    if (notes.length > 0) {
      setSelectedNoteId(notes[0].id);
    }
  }, [notes, selectedNoteId]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleDragEnd = () => setDragOverId(null);
    window.addEventListener("dragend", handleDragEnd);
    return () => window.removeEventListener("dragend", handleDragEnd);
  }, []);

  useEffect(() => {
    if (!selectedFolderId) return;
    const exists = folders.some((folder) => folder.id === selectedFolderId);
    if (!exists) setSelectedFolderId(null);
  }, [folders, selectedFolderId]);

  useEffect(() => {
    if (!selectedNoteId) return;
    const exists = notes.some((note) => note.id === selectedNoteId);
    if (!exists) {
      setSelectedNoteId(null);
      setSelectedNote(null);
      flashStatus("선택한 노트가 삭제되었습니다.");
    }
  }, [notes, selectedNoteId]);

  const refreshTree = async () => {
    if (!hasNotesBridge) return;
    const result = await window.api.notes.tree();
    setFolders(result?.folders ?? []);
    setNotes(result?.notes ?? []);
  };

  const scheduleSave = (note: NoteDetail) => {
    if (!hasNotesBridge) return;
    pendingSaveRef.current = note;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      if (!pendingSaveRef.current) return;
      await window.api.notes.upsertNote(pendingSaveRef.current);
      await refreshTree();
    }, 600);
  };

  const touchNote = () => {
    setSelectedNote((prev) => {
      if (!prev) return prev;
      const next = { ...prev, updatedAt: nowIso() };
      scheduleSave(next);
      setNotes((list) =>
        list.map((note) => (note.id === next.id ? { ...note, updatedAt: next.updatedAt } : note))
      );
      return next;
    });
  };

  const updateNote = (patch: Partial<NoteDetail>) => {
    setSelectedNote((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch, updatedAt: nowIso() };
      scheduleSave(next);
      setNotes((list) =>
        list.map((note) =>
          note.id === next.id ? { ...note, title: next.title, folderId: next.folderId, updatedAt: next.updatedAt } : note
        )
      );
      return next;
    });
  };

  const handleCreateFolder = async (parentId: string | null) => {
    if (!hasNotesBridge) return;
    const id = uid();
    const createdAt = nowIso();
    await window.api.notes.upsertFolder({
      id,
      name: "새 폴더",
      parentId,
      createdAt,
      updatedAt: createdAt,
    });
    setExpandedFolders((prev) => ({ ...prev, [parentId ?? ROOT_DROP_ID]: true }));
    setFolderEditId(id);
    setFolderDraftName("새 폴더");
    await refreshTree();
  };

  const handleCreateNote = async (folderId: string | null) => {
    if (!hasNotesBridge) return;
    const id = uid();
    const createdAt = nowIso();
    await window.api.notes.upsertNote({
      id,
      title: "제목 없는 노트",
      content: "",
      folderId,
      createdAt,
      updatedAt: createdAt,
    });
    await refreshTree();
    setSelectedNoteId(id);
  };

  const handleDeleteNote = async () => {
    if (!selectedNote || !hasNotesBridge) return;
    if (!window.confirm("이 노트를 삭제할까요?")) return;
    await window.api.notes.deleteNote(selectedNote.id);
    setSelectedNoteId(null);
    setSelectedNote(null);
    await refreshTree();
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!hasNotesBridge) return;
    if (!window.confirm("이 폴더와 안의 내용을 모두 삭제할까요?")) return;
    await window.api.notes.deleteFolder(folderId);
    if (selectedFolderId === folderId) setSelectedFolderId(null);
    await refreshTree();
  };

  const handleFolderRenameCommit = async (folderId: string) => {
    if (!hasNotesBridge) return;
    const name = folderDraftName.trim() || "제목 없는 폴더";
    const existing = folders.find((folder) => folder.id === folderId);
    await window.api.notes.upsertFolder({
      id: folderId,
      name,
      parentId: existing?.parentId ?? null,
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    });
    setFolderEditId(null);
    setFolderDraftName("");
    await refreshTree();
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const insertMarkdown = (prefix: string, suffix = "") => {
    const area = editorRef.current;
    if (!area || !selectedNote) return;
    const start = area.selectionStart ?? 0;
    const end = area.selectionEnd ?? 0;
    const before = selectedNote.content.slice(0, start);
    const selected = selectedNote.content.slice(start, end) || "텍스트";
    const after = selectedNote.content.slice(end);
    const next = `${before}${prefix}${selected}${suffix}${after}`;
    updateNote({ content: next });
    requestAnimationFrame(() => {
      area.focus();
      const caret = start + prefix.length + selected.length + suffix.length;
      area.setSelectionRange(caret, caret);
    });
  };

  const handleUploadFiles = async (files: FileList | File[]) => {
    if (!selectedNote || !hasNotesBridge) return;
    const list = Array.from(files);
    let nextContent = selectedNote.content;
    for (const file of list) {
      const dataUrl = await fileToDataUrl(file);
      const attachment = await window.api.notes.addAttachment({
        noteId: selectedNote.id,
        name: file.name,
        dataUrl,
      });
      if (!attachment) continue;
      setSelectedNote((prev) => {
        if (!prev) return prev;
        return { ...prev, attachments: [...prev.attachments, attachment] };
      });
      if (attachment.kind === "image") {
        const imageTag = `\n\n![${attachment.name}](${toFileUrl(attachment.path)})\n`;
        nextContent = `${nextContent}${imageTag}`;
        updateNote({ content: nextContent });
      } else {
        touchNote();
      }
    }
  };

  const handleRemoveAttachment = async (attachmentId: string) => {
    if (!selectedNote || !hasNotesBridge) return;
    await window.api.notes.removeAttachment({ noteId: selectedNote.id, attachmentId });
    setSelectedNote((prev) => {
      if (!prev) return prev;
      return { ...prev, attachments: prev.attachments.filter((att) => att.id !== attachmentId) };
    });
    touchNote();
  };

  const handleDownloadAttachment = async (attachment: NoteAttachment) => {
    if (!hasNotesBridge) return;
    await window.api.notes.downloadAttachment({ path: attachment.path, name: attachment.name });
  };

  const handleExportPdf = async () => {
    if (!selectedNote || !hasNotesBridge) return;
    const html = previewRef.current?.innerHTML ?? "";
    const result = await window.api.notes.exportPdf({
      title: selectedNote.title || "노트",
      html,
    });
    if (result?.ok && result.path) {
      setStatusMessage(`PDF가 저장되었습니다: ${result.path}`);
      window.setTimeout(() => setStatusMessage(""), 3000);
    }
  };

  const handleTodoToggle = async (todoId: string) => {
    if (!selectedNote || !hasNotesBridge) return;
    const nextLinks = linkedTodoIds.includes(todoId)
      ? linkedTodoIds.filter((id) => id !== todoId)
      : [...linkedTodoIds, todoId];
    setSelectedNote((prev) => {
      if (!prev) return prev;
      const next = { ...prev, todoLinks: nextLinks, updatedAt: nowIso() };
      scheduleSave(next);
      setNotes((list) =>
        list.map((note) => (note.id === next.id ? { ...note, updatedAt: next.updatedAt } : note))
      );
      return next;
    });
    await window.api.notes.updateLinks({ noteId: selectedNote.id, todoIds: nextLinks });
  };

  const imageAttachments = selectedNote?.attachments.filter((att) => att.kind === "image") ?? [];
  const fileAttachments = selectedNote?.attachments.filter((att) => att.kind === "file") ?? [];

  const renderFolder = (folder: NoteFolder, depth: number) => {
    const isExpanded = expandedFolders[folder.id] ?? false;
    const childFolders = foldersByParent.get(folder.id) ?? [];
    const childNotes = notesByFolder.get(folder.id) ?? [];
    const isSelected = selectedFolderId === folder.id;
    const isDropActive = dragOverId === folder.id;
    const isEditing = folderEditId === folder.id;

    return (
      <div key={folder.id}>
        <div
          className={`group flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${isDropActive ? "bg-amber-100" : isSelected ? "bg-amber-50" : "hover:bg-slate-50"}`}
          style={{ paddingLeft: depth * 12 }}
          draggable={!isEditing}
          onDragStart={isEditing ? undefined : handleDragStart({ kind: "folder", id: folder.id })}
          onDragEnd={isEditing ? undefined : handleDragLeave}
          onDragOver={isEditing ? undefined : handleDragOver(folder.id)}
          onDragLeave={isEditing ? undefined : handleDragLeave}
          onDrop={isEditing ? undefined : (event) => handleDropOn(folder.id, event)}
        >
          <button
            className="text-slate-500"
            onClick={() => toggleFolder(folder.id)}
            title={isExpanded ? "접기" : "펼치기"}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <Folder size={14} className="text-amber-600" />
          {folderEditId === folder.id ? (
            <input
              value={folderDraftName}
              onChange={(e) => setFolderDraftName(e.target.value)}
              onInput={(e) => setFolderDraftName((e.target as HTMLInputElement).value)}
              onBlur={() => handleFolderRenameCommit(folder.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleFolderRenameCommit(folder.id);
                if (e.key === "Escape") {
                  setFolderEditId(null);
                  setFolderDraftName("");
                }
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onDragStart={(e) => e.preventDefault()}
              draggable={false}
              className="w-full rounded border border-slate-200 bg-white px-1 text-xs"
              autoFocus
            />
          ) : (
            <button
              className="min-w-0 flex-1 truncate text-left"
              onClick={() => {
                setSelectedFolderId(folder.id);
                setExpandedFolders((prev) => ({ ...prev, [folder.id]: true }));
              }}
            >
              {folder.name}
            </button>
          )}
          <div className="ml-auto flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            <button
              className="rounded border border-slate-200 bg-white px-1 text-xs"
              onClick={() => {
                setFolderEditId(folder.id);
                setFolderDraftName(folder.name);
              }}
              title="이름 변경"
            >
              수정
            </button>
            <button
              className="rounded border border-slate-200 bg-white px-1 text-xs"
              onClick={() => handleCreateFolder(folder.id)}
              title="새 하위 폴더"
            >
              추가
            </button>
            <button
              className="rounded border border-rose-200 bg-rose-50 px-1 text-xs text-rose-700"
              onClick={() => handleDeleteFolder(folder.id)}
              title="폴더 삭제"
            >
              삭제
            </button>
          </div>
        </div>
        {isExpanded ? (
          <div className="mt-1 space-y-1">
            {childFolders.map((child) => renderFolder(child, depth + 1))}
            {childNotes.map((note) => (
              <button
                key={note.id}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm ${selectedNoteId === note.id ? "bg-slate-900 text-white" : "hover:bg-slate-50"}`}
                style={{ paddingLeft: (depth + 1) * 12 }}
                draggable
                onDragStart={handleDragStart({ kind: "note", id: note.id })}
                onDragEnd={handleDragLeave}
                onClick={() => {
                  setSelectedNoteId(note.id);
                  setSelectedFolderId(folder.id);
                }}
                title="드래그해서 이동"
              >
                <FileText size={14} />
                <span className="truncate">{note.title || "제목 없는 노트"}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const rootFolders = foldersByParent.get(null) ?? [];
  const rootNotes = notesByFolder.get(null) ?? [];
  const rootDropActive = dragOverId === ROOT_DROP_ID;

  return (
    <div className="min-h-full p-4 text-slate-900">
      <div className="flex flex-col gap-4 lg:flex-row">
        <aside className="w-full rounded-2xl border border-slate-200 bg-white/80 p-3 lg:w-72">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">노트</div>
            <div className="flex items-center gap-2">
              <button
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                onClick={() => handleCreateFolder(selectedFolderId)}
                title="새 폴더"
              >
                <FolderPlus size={14} />
                폴더
              </button>
              <button
                className="inline-flex items-center gap-1 rounded-lg border border-slate-900/20 bg-slate-900 px-2 py-1 text-xs text-white"
                onClick={() => handleCreateNote(selectedFolderId)}
                title="새 노트"
              >
                <FilePlus size={14} />
                노트
              </button>
            </div>
          </div>

          <div className="mt-3 max-h-[60vh] space-y-1 overflow-y-auto pr-1">
            <button
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm ${rootDropActive ? "bg-amber-100" : selectedFolderId === null ? "bg-amber-50" : "hover:bg-slate-50"}`}
              onClick={() => setSelectedFolderId(null)}
              onDragOver={handleDragOver(ROOT_DROP_ID)}
              onDragLeave={handleDragLeave}
              onDrop={(event) => handleDropOn(null, event)}
            >
              <Folder size={14} className="text-amber-600" />
              전체 노트
            </button>

            {rootFolders.map((folder) => renderFolder(folder, 1))}

            {rootNotes.map((note) => (
              <button
                key={note.id}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm ${selectedNoteId === note.id ? "bg-slate-900 text-white" : "hover:bg-slate-50"}`}
                draggable
                onDragStart={handleDragStart({ kind: "note", id: note.id })}
                onDragEnd={handleDragLeave}
                onClick={() => {
                  setSelectedNoteId(note.id);
                  setSelectedFolderId(null);
                }}
                title="드래그해서 이동"
              >
                <FileText size={14} />
                <span className="truncate">{note.title || "제목 없는 노트"}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 rounded-2xl border border-slate-200 bg-white/80 p-4">
          {!selectedNote ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-slate-500">
              <Folder size={24} />
              <div>노트를 선택하거나 새로 만들어 주세요.</div>
              {statusMessage ? <div className="text-xs text-emerald-600">{statusMessage}</div> : null}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={selectedNote.title}
                  onChange={(e) => updateNote({ title: e.target.value })}
                  className="min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="노트 제목"
                />
                <select
                  value={selectedNote.folderId ?? ""}
                  onChange={(e) => updateNote({ folderId: e.target.value || null })}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">최상위</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                  onClick={() => selectedNote && window.api?.notes?.upsertNote(selectedNote)}
                >
                  <Save size={14} />
                  저장
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                  onClick={handleExportPdf}
                >
                  <Download size={14} />
                  PDF 내보내기
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 hover:bg-rose-100"
                  onClick={handleDeleteNote}
                >
                  <Trash2 size={14} />
                  삭제
                </button>
                {statusMessage ? <span className="text-xs text-emerald-600">{statusMessage}</span> : null}
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">에디터</span>
                    <button
                      className="rounded border border-slate-200 bg-white px-2 py-1"
                      onClick={() => insertMarkdown("**", "**")}
                    >
                      굵게
                    </button>
                    <button
                      className="rounded border border-slate-200 bg-white px-2 py-1"
                      onClick={() => insertMarkdown("*", "*")}
                    >
                      기울임
                    </button>
                    <button
                      className="rounded border border-slate-200 bg-white px-2 py-1"
                      onClick={() => insertMarkdown("# ")}
                    >
                      제목
                    </button>
                    <button
                      className="rounded border border-slate-200 bg-white px-2 py-1"
                      onClick={() => insertMarkdown("- ")}
                    >
                      목록
                    </button>
                    <button
                      className="rounded border border-slate-200 bg-white px-2 py-1"
                      onClick={() => insertMarkdown("```\n", "\n```")}
                    >
                      코드
                    </button>
                  </div>
                  <textarea
                    ref={editorRef}
                    value={selectedNote.content}
                    onChange={(e) => updateNote({ content: e.target.value })}
                    className="h-72 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm"
                    placeholder="마크다운으로 노트를 작성하세요..."
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-700">미리보기</div>
                  <div className="h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3">
                    <div ref={previewRef} className="markdown">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {selectedNote.content || "아직 작성된 내용이 없습니다."}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-slate-700">첨부파일</div>
                    <button
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={12} />
                      업로드
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      multiple
                      onChange={(e) => {
                        if (e.target.files?.length) handleUploadFiles(e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />
                  </div>

                  <div
                    className={`rounded-2xl border border-dashed p-4 text-center text-sm ${isDragging ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-slate-50"}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      if (e.dataTransfer.files?.length) handleUploadFiles(e.dataTransfer.files);
                    }}
                  >
                    파일을 끌어다 놓거나 업로드 버튼을 사용하세요.
                  </div>

                  {imageAttachments.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-slate-700">이미지</div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {imageAttachments.map((att) => (
                          <div key={att.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            <img src={toFileUrl(att.path)} alt={att.name} className="h-32 w-full object-cover" />
                            <div className="flex items-center justify-between gap-2 p-2 text-xs">
                              <div className="min-w-0">
                                <div className="truncate font-medium text-slate-700">{att.name}</div>
                                <div className="text-[11px] text-slate-400">{formatFileSize(att.size)}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1"
                                  onClick={() => handleDownloadAttachment(att)}
                                >
                                  다운로드
                                </button>
                                <button
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1"
                                  onClick={() => handleRemoveAttachment(att.id)}
                                >
                                  삭제
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {fileAttachments.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-slate-700">파일</div>
                      <div className="space-y-2">
                        {fileAttachments.map((att) => (
                          <div
                            key={att.id}
                            className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-500">
                                <FileText size={16} />
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-slate-800">{att.name}</div>
                                <div className="text-[11px] text-slate-400">
                                  {formatFileSize(att.size)} · {fileKindLabel(att)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                                onClick={() => hasFileBridge && window.api.files.open(att.path)}
                              >
                                열기
                              </button>
                              <button
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                                onClick={() => handleDownloadAttachment(att)}
                              >
                                다운로드
                              </button>
                              <button
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                                onClick={() => handleRemoveAttachment(att.id)}
                              >
                                삭제
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-slate-700">연결된 업무</div>
                    <div className="text-xs text-slate-400">
                      {linkedTodoIds.length ? `${linkedTodoIds.length}개 연결됨` : "연결 없음"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center gap-2">
                      <Link2 size={14} className="text-slate-400" />
                      <input
                        value={todoSearch}
                        onChange={(e) => setTodoSearch(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                        placeholder="업무 검색"
                      />
                    </div>
                    <div className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1 text-sm">
                      {filteredTodos.length === 0 ? (
                        <div className="text-xs text-slate-500">표시할 업무가 없습니다.</div>
                      ) : (
                        filteredTodos.map((todo) => {
                          const checked = linkedTodoIds.includes(todo.id);
                          return (
                            <label key={todo.id} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleTodoToggle(todo.id)}
                              />
                              <span className="min-w-0 flex-1 truncate">{todo.title || "제목 없는 업무"}</span>
                              <span className="text-xs text-slate-400">{todo.date}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
                    업무 목록과 노트를 연결해 정리하세요.
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
