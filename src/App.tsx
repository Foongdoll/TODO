import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  FileArchive,
  FileCode,
  FileImage,
  FileMusic,
  FileSpreadsheet,
  FileType,
  FileVideoCamera,
  GripVertical,
  ListChecks,
  Minus,
  Plus,
  Square,
  Trash2,
  X,
  Save,
  Settings,
  MessageCircle,
  Notebook,
} from "lucide-react";
import logo from "./assets/logo.png";
import Calendar, { addMonths, startOfMonth, type TodoSummary } from "./pages/Calendar";
import Note from "./pages/Note";
import Chat from "./pages/Chat";
import SettingPanel from "./pages/SettingPanel";

export type TodoStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";
export type TabKey = "LIST" | "CALENDAR" | "CHAT" | "SETTINGS" | "NOTE";

type TodoRel = { toId: string; type: "blocks" | "relates" | "depends" };
type LegacyImage = { id: string; name: string; dataUrl: string; createdAt: string; path?: string };
type TodoAttachment = {
  id: string;
  name: string;
  path: string;
  mime: string;
  size: number;
  createdAt: string;
  kind: "image" | "file";
  dataUrl?: string;
};

type Todo = {
  id: string;
  title: string;
  content: string; // markdown
  status: TodoStatus;
  date: string; // YYYY-MM-DD
  order: number;
  refs: string[];
  rels: TodoRel[];
  attachments: TodoAttachment[];
  images?: LegacyImage[];
  createdAt: string;
  updatedAt: string;
};


const pad2 = (n: number) => String(n).padStart(2, "0");
const toYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const nowIso = () => new Date().toISOString();
const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;

const STATUS_META: Record<TodoStatus, { label: string; badge: string }> = {
  TODO: { label: "할 일", badge: "bg-amber-50 text-amber-800 border-amber-200" },
  IN_PROGRESS: { label: "진행 중", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  BLOCKED: { label: "막힘", badge: "bg-rose-50 text-rose-700 border-rose-200" },
  DONE: { label: "완료", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

const REL_LABEL: Record<TodoRel["type"], string> = {
  depends: "의존",
  blocks: "차단",
  relates: "연관",
};

function clampText(s: string, max = 40) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 3)}...`;
}

export function cn(...args: Array<string | false | null | undefined>) {
  return args.filter(Boolean).join(" ");
}

function formatDateTime(iso: string) {
  if (!iso) return "";
  return iso.replace("T", " ").slice(0, 19);
}

function extractMimeFromDataUrl(dataUrl: string) {
  const match = /^data:(.+?);base64,/.exec(dataUrl);
  return match?.[1] ?? "";
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0바이트";
  const units = ["바이트", "킬로바이트", "메가바이트", "기가바이트"];
  let idx = 0;
  let value = size;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)}${units[idx]}`;
}

function toFileUrl(filePath: string) {
  if (!filePath) return "";
  if (filePath.startsWith("data:")) return filePath;
  const normalized = filePath.replace(/\\/g, "/");
  const fileUrl = normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`;
  return encodeURI(fileUrl);
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
const UPLOAD_EXTENSIONS = ["pdf", "hwp", "hwpx", "doc", "docx", "xls", "xlsx", "ppt", "pptx"];
const SUPPORTED_UPLOAD_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...UPLOAD_EXTENSIONS]);
const UPLOAD_ACCEPT = ["image/*", ...UPLOAD_EXTENSIONS.map((ext) => `.${ext}`)].join(",");
const REF_PAGE_SIZE = 24;

function getFileExt(name: string) {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

function isSupportedUploadFile(file: File) {
  if (file.type?.startsWith("image/")) return true;
  const ext = getFileExt(file.name);
  return Boolean(ext) && SUPPORTED_UPLOAD_EXTENSIONS.has(ext);
}

function fileKindLabel(file: TodoAttachment) {
  const ext = getFileExt(file.name);
  const map: Record<string, string> = {
    pdf: "PDF 문서",
    hwp: "한글 문서",
    hwpx: "한글 문서",
    doc: "워드 문서",
    docx: "워드 문서",
    xls: "엑셀 문서",
    xlsx: "엑셀 문서",
    ppt: "파워포인트",
    pptx: "파워포인트",
    png: "이미지",
    jpg: "이미지",
    jpeg: "이미지",
    gif: "이미지",
    webp: "이미지",
    bmp: "이미지",
  };
  return map[ext] ?? "일반 파일";
}

function pickFileIcon(file: TodoAttachment) {
  const ext = getFileExt(file.name);
  const mime = file.mime || "";
  const isImage = file.kind === "image" || mime.startsWith("image/") || IMAGE_EXTENSIONS.includes(ext);
  if (isImage) return FileImage;
  if (["xls", "xlsx", "csv"].includes(ext)) return FileSpreadsheet;
  if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz"].includes(ext)) return FileArchive;
  if (["mp3", "wav", "flac", "m4a", "aac", "ogg"].includes(ext)) return FileMusic;
  if (["mp4", "mov", "avi", "mkv", "webm", "wmv"].includes(ext)) return FileVideoCamera;
  if (["js", "ts", "tsx", "jsx", "json", "css", "html", "xml", "yml", "yaml", "md", "c", "cpp", "rs", "py", "go", "java", "kt", "swift", "php", "rb", "sh", "bat", "ps1", "sql"].includes(ext)) {
    return FileCode;
  }
  if (["pdf", "hwp", "hwpx", "doc", "docx", "ppt", "pptx", "txt", "rtf"].includes(ext)) return FileText;
  return FileType;
}

const hasBridge = typeof window !== "undefined" && Boolean(window.api?.todos);
const hasWindowBridge = typeof window !== "undefined" && Boolean(window.api?.window);
const hasFileBridge = typeof window !== "undefined" && Boolean(window.api?.files);

async function loadTodoSummaries(): Promise<TodoSummary[]> {
  if (hasBridge && window.api.todos.summary) {
    const items = await window.api.todos.summary();
    return (items ?? []).map((item: TodoSummary) => normalizeSummary(item));
  }
  return [];
}

async function loadTodosByDate(selectedDate: string): Promise<Todo[]> {
  if (hasBridge && window.api.todos.byDate) {
    const items = await window.api.todos.byDate(selectedDate);
    return (items ?? []).map((item: Todo) => normalizeTodo(item));
  }
  return [];
}

async function upsertTodo(nextTodo: Todo): Promise<void> {
  if (hasBridge && window.api.todos.upsert) {
    await window.api.todos.upsert(nextTodo);
  }
}

async function deleteTodoById(id: string): Promise<void> {
  if (hasBridge && window.api.todos.delete) {
    await window.api.todos.delete(id);
  }
}

async function updateTodoOrders(updates: Array<{ id: string; order: number; updatedAt: string }>): Promise<void> {
  if (hasBridge && window.api.todos.updateOrders) {
    await window.api.todos.updateOrders(updates);
  }
}

async function revealStoragePath(): Promise<string> {
  if (hasBridge) {
    return window.api.todos.revealPath();
  }
  return "Bridge unavailable";
}

function normalizeAttachment(raw: Partial<TodoAttachment> & { dataUrl?: string }): TodoAttachment | null {
  if (!raw) return null;
  const dataUrl = typeof raw.dataUrl === "string" ? raw.dataUrl : undefined;
  const mimeFromData = dataUrl ? extractMimeFromDataUrl(dataUrl) : "";
  const mime = raw.mime || mimeFromData || "application/octet-stream";
  const kind = raw.kind ?? (mime.startsWith("image/") || Boolean(dataUrl) ? "image" : "file");
  return {
    id: raw.id ?? uid(),
    name: raw.name ?? "첨부파일",
    path: raw.path ?? dataUrl ?? "",
    mime,
    size: raw.size ?? 0,
    createdAt: raw.createdAt ?? nowIso(),
    kind,
    dataUrl: kind === "image" ? dataUrl : undefined,
  };
}

function normalizeTodo(raw: Todo): Todo {
  const legacyImages = Array.isArray(raw.images) ? raw.images : [];
  const rawAttachments = Array.isArray(raw.attachments) ? raw.attachments : [];
  const seen = new Set(rawAttachments.map((att) => att.id));
  const normalizedAttachments = rawAttachments
    .map((att) => normalizeAttachment(att))
    .filter((att): att is TodoAttachment => Boolean(att));
  const legacyAttachments = legacyImages
    .filter((img) => !seen.has(img.id))
    .map((img) =>
      normalizeAttachment({
        id: img.id,
        name: img.name,
        path: img.path ?? "",
        dataUrl: img.dataUrl,
        createdAt: img.createdAt,
        kind: "image",
      })
    )
    .filter((att): att is TodoAttachment => Boolean(att));
  const { images: _ignore, ...rest } = raw;
  return {
    ...rest,
    refs: Array.isArray(raw.refs) ? raw.refs : [],
    rels: Array.isArray(raw.rels) ? raw.rels : [],
    attachments: [...normalizedAttachments, ...legacyAttachments],
  };
}

function toSummary(todo: Todo): TodoSummary {
  return {
    id: todo.id,
    title: todo.title,
    status: todo.status,
    date: todo.date,
    order: todo.order,
    createdAt: todo.createdAt,
    updatedAt: todo.updatedAt,
  };
}

function normalizeSummary(raw: TodoSummary): TodoSummary {
  const status = (raw.status === "TODO" || raw.status === "IN_PROGRESS" || raw.status === "BLOCKED" || raw.status === "DONE")
    ? raw.status
    : "TODO";
  return {
    id: String(raw.id ?? uid()),
    title: String(raw.title ?? ""),
    status,
    date: String(raw.date ?? ""),
    order: Number.isFinite(raw.order) ? raw.order : 0,
    createdAt: String(raw.createdAt ?? nowIso()),
    updatedAt: String(raw.updatedAt ?? nowIso()),
  };
}

function SortableTodoRow({
  todo,
  isSelected,
  onClick,
}: {
  todo: Todo;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: todo.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-3 rounded-2xl border p-3 transition",
        isSelected ? "border-slate-900/30 bg-white shadow-sm" : "border-slate-200/70 bg-white/80",
        isDragging && "ring-2 ring-slate-300"
      )}
    >
      <button
        className="cursor-grab select-none rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
        title="드래그로 순서 변경"
        aria-label="드래그로 순서 변경"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>

      <button className="min-w-0 flex-1 text-left" onClick={onClick} title="상세 열기">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-slate-900">{todo.title || "제목 없음"}</span>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
              STATUS_META[todo.status].badge
            )}
          >
            {STATUS_META[todo.status].label}
          </span>
        </div>
        <div className="mt-1 truncate text-xs text-slate-500">
          {clampText(todo.content || "내용 없음", 60)}
        </div>
      </button>

      <div className="shrink-0 text-xs text-slate-500">{todo.date}</div>
      <div className="shrink-0 text-xs text-slate-400">
        {todo.attachments.length ? `첨부 ${todo.attachments.length}개` : ""}
      </div>
    </div>
  );
}


function TitleBar() {
  const [isMax, setIsMax] = React.useState(false);

  React.useEffect(() => {
    if (!hasWindowBridge) return;
    let active = true;
    (async () => {
      const next = await window.api.window.isMaximized();
      if (active) setIsMax(next);
    })();
    const off = window.api.window.onMaximizedChanged((next: any) => {
      if (active) setIsMax(next);
    });
    return () => {
      active = false;
      off?.();
    };
  }, []);

  return (
    <div className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className="titlebar-drag flex h-11 items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <img src={logo} alt="Logo" className="rounded-2xl" />
          </div>
          <div className="text-sm font-semibold text-slate-900">TODOONG 'S</div>
        </div>

        <div className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <button
            className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-50"
            onClick={() => window.api?.window.minimize()}
            disabled={!hasWindowBridge}
            title="최소화"
          >
            <Minus size={14} />
          </button>
          <button
            className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-50"
            onClick={async () => {
              if (!hasWindowBridge) return;
              const next = await window.api.window.toggleMaximize();
              setIsMax(next);
            }}
            disabled={!hasWindowBridge}
            title={isMax ? "복원" : "최대화"}
          >
            <Square size={14} />
          </button>
          <button
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-sm text-rose-700 hover:bg-rose-100 disabled:opacity-50"
            onClick={() => window.api?.window.close()}
            disabled={!hasWindowBridge}
            title="닫기"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <style>{`
        .titlebar-drag {
          -webkit-app-region: drag;
          user-select: none;
        }
      `}</style>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("LIST");
  const [selectedDate, setSelectedDate] = useState<string>(toYMD(new Date()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [dayTodos, setDayTodos] = useState<Todo[]>([]);
  const [summaryTodos, setSummaryTodos] = useState<TodoSummary[]>([]);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState<string>("");
  const [storageNotice, setStorageNotice] = useState<string>("");
  const [uploadNotice, setUploadNotice] = useState<string>("");
  const [refSearch, setRefSearch] = useState<string>("");
  const [refPage, setRefPage] = useState(1);
  const [relType, setRelType] = useState<TodoRel["type"]>("depends");
  const [relTargetId, setRelTargetId] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dayTodosRef = useRef<Todo[]>([]);
  const pendingSavesRef = useRef<Map<string, Todo>>(new Map());
  const saveTimersRef = useRef<Map<string, number>>(new Map());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const selectedTodo = useMemo(() => dayTodos.find((t) => t.id === selectedId) ?? null, [dayTodos, selectedId]);
  const selectedAttachments = selectedTodo?.attachments ?? [];
  const imageAttachments = selectedAttachments.filter((att) => att.kind === "image");
  const fileAttachments = selectedAttachments.filter((att) => att.kind === "file");

  const todosForDay = useMemo(() => {
    return dayTodos
      .filter((t) => t.date === selectedDate)
      .slice()
      .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
  }, [dayTodos, selectedDate]);

  const todosByDate = useMemo(() => {
    const m = new Map<string, TodoSummary[]>();
    for (const t of summaryTodos) {
      const arr = m.get(t.date) ?? [];
      arr.push(t);
      m.set(t.date, arr);
    }
    return m;
  }, [summaryTodos]);

  const dayCounts = useMemo(() => {
    const counts: Record<TodoStatus, number> = {
      TODO: 0,
      IN_PROGRESS: 0,
      BLOCKED: 0,
      DONE: 0,
    };
    for (const t of todosForDay) counts[t.status] += 1;
    return counts;
  }, [todosForDay]);

  const candidatesSameDay = useMemo(() => {
    return todosForDay.filter((t) => t.id !== selectedId);
  }, [todosForDay, selectedId]);

  const referenceCandidates = useMemo(() => {
    const query = refSearch.trim().toLowerCase();
    return summaryTodos
      .filter((t) => t.id !== selectedId)
      .filter((t) => !query || (t.title || "").toLowerCase().includes(query))
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || a.order - b.order || a.createdAt.localeCompare(b.createdAt));
  }, [summaryTodos, selectedId, refSearch]);

  const visibleReferenceCandidates = useMemo(() => {
    return referenceCandidates.slice(0, refPage * REF_PAGE_SIZE);
  }, [referenceCandidates, refPage]);

  const hasMoreReferences = visibleReferenceCandidates.length < referenceCandidates.length;

  useEffect(() => {
    dayTodosRef.current = dayTodos;
  }, [dayTodos]);

  useEffect(() => {
    let active = true;
    (async () => {
      const items = await loadTodoSummaries();
      if (!active) return;
      setSummaryTodos(items);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await flushPendingSaves();
      } catch {
        // ignore save flush failures
      }
      const items = await loadTodosByDate(selectedDate);
      if (!active) return;
      setDayTodos(items);
    })();
    return () => {
      active = false;
    };
  }, [selectedDate]);

  useEffect(() => {
    setCalendarMonth(startOfMonth(new Date(selectedDate)));
  }, [selectedDate]);

  useEffect(() => {
    setRefPage(1);
  }, [refSearch, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const match = dayTodos.find((t) => t.id === selectedId);
    if (!match || match.date !== selectedDate) {
      setSelectedId(null);
      setPanelOpen(false);
    }
  }, [selectedDate, selectedId, dayTodos]);

  useEffect(() => {
    setRelType("depends");
    setRelTargetId(candidatesSameDay[0]?.id ?? "");
  }, [selectedId, candidatesSameDay]);

  const handleReferenceScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 16;
    if (!nearBottom) return;
    setRefPage((prev) => (prev * REF_PAGE_SIZE < referenceCandidates.length ? prev + 1 : prev));
  };

  const getTodoById = (id: string) =>
    dayTodosRef.current.find((t) => t.id === id) ?? (selectedTodo?.id === id ? selectedTodo : null);

  const scheduleUpsert = (todo: Todo) => {
    pendingSavesRef.current.set(todo.id, todo);
    const timers = saveTimersRef.current;
    const existing = timers.get(todo.id);
    if (existing) window.clearTimeout(existing);
    const handle = window.setTimeout(() => {
      timers.delete(todo.id);
      const latest = pendingSavesRef.current.get(todo.id);
      if (!latest) return;
      pendingSavesRef.current.delete(todo.id);
      void upsertTodo(latest).catch(() => { });
    }, 500);
    timers.set(todo.id, handle);
  };

  const clearPendingSave = (id: string) => {
    pendingSavesRef.current.delete(id);
    const timers = saveTimersRef.current;
    const existing = timers.get(id);
    if (existing) {
      window.clearTimeout(existing);
      timers.delete(id);
    }
  };

  const flushPendingSaves = async () => {
    const timers = saveTimersRef.current;
    for (const handle of timers.values()) {
      window.clearTimeout(handle);
    }
    timers.clear();

    const pending = Array.from(pendingSavesRef.current.values());
    pendingSavesRef.current.clear();
    if (!pending.length) return;
    await Promise.all(pending.map((todo) => upsertTodo(todo)));
  };

  const upsertSummary = (todo: Todo) => {
    const summary = toSummary(todo);
    setSummaryTodos((prev) => {
      const idx = prev.findIndex((t) => t.id === summary.id);
      if (idx === -1) return [...prev, summary];
      const next = prev.slice();
      next[idx] = { ...next[idx], ...summary };
      return next;
    });
  };

  const applyTodoUpdate = (todo: Todo) => {
    setDayTodos((prev) => {
      const next = prev.map((t) => (t.id === todo.id ? todo : t));
      return next.filter((t) => t.date === selectedDate);
    });
    upsertSummary(todo);
    scheduleUpsert(todo);
  };

  const openPanel = (id: string) => {
    setSelectedId(id);
    setPanelOpen(true);
  };

  const shiftSelectedDate = (diff: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + diff);
    setSelectedDate(toYMD(d));
  };

  const pickDateFromCalendar = (ymd: string) => {
    setSelectedDate(ymd);
    setTab("LIST");
    setSelectedId(null);
    setPanelOpen(false);
  };

  const createTodo = () => {
    const maxOrder = todosForDay.length ? Math.max(...todosForDay.map((t) => t.order)) : -1;
    const t: Todo = {
      id: uid(),
      title: "",
      content: "",
      status: "TODO",
      date: selectedDate,
      order: maxOrder + 1,
      refs: [],
      rels: [],
      attachments: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    setDayTodos((prev) => [...prev, t]);
    setSummaryTodos((prev) => [...prev, toSummary(t)]);
    scheduleUpsert(t);
    setSelectedId(t.id);
    setPanelOpen(true);
  };

  const patchTodo = (id: string, patch: Partial<Todo>) => {
    const current = getTodoById(id);
    if (!current) return;
    const updated = { ...current, ...patch, updatedAt: nowIso() };
    applyTodoUpdate(updated);
    if (patch.date && patch.date !== selectedDate) {
      setSelectedId(null);
      setPanelOpen(false);
    }
  };

  const deleteTodo = (id: string) => {

    if (!confirm("해당 할 일을 삭제하시겠습니까?")) return;

    clearPendingSave(id);
    const target = getTodoById(id);
    if (target) {
      void purgeAttachments(target.attachments);
    }
    setDayTodos((prev) => {
      const filtered = prev.filter((t) => t.id !== id);
      return filtered.map((t) => ({
        ...t,
        refs: t.refs.filter((x) => x !== id),
        rels: t.rels.filter((r) => r.toId !== id),
      }));
    });
    setSummaryTodos((prev) => prev.filter((t) => t.id !== id));
    void deleteTodoById(id).catch(() => { });
    setSelectedId(null);
    setPanelOpen(false);
  };
  const onDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const dayIds = todosForDay.map((t) => t.id);
    if (!dayIds.includes(activeId) || !dayIds.includes(overId)) return;

    const oldIndex = dayIds.indexOf(activeId);
    const newIndex = dayIds.indexOf(overId);
    const movedIds = arrayMove(dayIds, oldIndex, newIndex);
    const updatedAt = nowIso();
    const map = new Map<string, number>();
    movedIds.forEach((id, idx) => map.set(id, idx));
    setDayTodos((prev) =>
      prev.map((t) => (map.has(t.id) ? { ...t, order: map.get(t.id)!, updatedAt } : t))
    );
    setSummaryTodos((prev) =>
      prev.map((t) => (map.has(t.id) ? { ...t, order: map.get(t.id)!, updatedAt } : t))
    );
    const updates = movedIds.map((id) => ({ id, order: map.get(id)!, updatedAt }));
    void updateTodoOrders(updates).catch(() => { });
  };

  const updateAttachment = (todoId: string, attachmentId: string, patch: Partial<TodoAttachment>) => {
    const current = getTodoById(todoId);
    if (!current) return;
    const updated = {
      ...current,
      attachments: current.attachments.map((att) => (att.id === attachmentId ? { ...att, ...patch } : att)),
      updatedAt: nowIso(),
    };
    applyTodoUpdate(updated);
  };

  const removeAttachment = async (todoId: string, attachment: TodoAttachment) => {
    if (hasFileBridge && attachment.path && !attachment.path.startsWith("data:")) {
      await window.api.files.delete(attachment.path);
    }
    const current = getTodoById(todoId);
    if (!current) return;
    const updated = {
      ...current,
      attachments: current.attachments.filter((att) => att.id !== attachment.id),
      updatedAt: nowIso(),
    };
    applyTodoUpdate(updated);
  };

  const openAttachment = async (todoId: string, attachment: TodoAttachment) => {
    if (hasFileBridge) {
      let targetPath = attachment.path;
      if ((!targetPath || targetPath.startsWith("data:")) && attachment.dataUrl) {
        const saved = await window.api.files.saveFromDataUrl({
          name: attachment.name,
          dataUrl: attachment.dataUrl,
        });
        targetPath = saved.path;
        updateAttachment(todoId, attachment.id, {
          path: saved.path,
          mime: saved.mime,
          size: saved.size,
        });
      }
      if (!targetPath) return;
      const result = await window.api.files.open(targetPath);
      if (!result.ok) {
        setStorageNotice("파일을 열 수 없습니다");
        window.setTimeout(() => setStorageNotice(""), 2200);
      }
      return;
    }
    if (attachment.path) {
      window.open(attachment.path, "_blank", "noopener,noreferrer");
    }
  };

  const purgeAttachments = async (attachments: TodoAttachment[]) => {
    if (!hasFileBridge || !attachments.length) return;
    await Promise.all(
      attachments.map((att) => {
        if (!att.path || att.path.startsWith("data:")) return Promise.resolve(true);
        return window.api.files.delete(att.path);
      })
    );
  };

  const handleUploadFiles = async (files: FileList | File[], todoId: string) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    const supported: File[] = [];
    const unsupported: File[] = [];
    for (const file of arr) {
      if (isSupportedUploadFile(file)) supported.push(file);
      else unsupported.push(file);
    }
    if (unsupported.length) {
      const names = unsupported.map((file) => file.name || "이름 없음").join(", ");
      setUploadNotice(`지원하지 않는 파일: ${names}`);
      window.setTimeout(() => setUploadNotice(""), 2400);
    }
    if (!supported.length) return;

    const readAsDataUrl = (f: File) =>
      new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(f);
      });

    const nextAttachments = await Promise.all(
      supported.map(async (f) => {
        const dataUrl = await readAsDataUrl(f);
        const kind: TodoAttachment["kind"] = f.type.startsWith("image/") ? "image" : "file";
        let path = dataUrl;
        let mime = f.type || extractMimeFromDataUrl(dataUrl) || "application/octet-stream";
        let size = f.size;
        if (hasFileBridge) {
          const saved = await window.api.files.saveFromDataUrl({ name: f.name, dataUrl });
          path = saved.path;
          mime = saved.mime || mime;
          size = saved.size || size;
        }
        return {
          id: uid(),
          name: f.name || "첨부파일",
          path,
          mime,
          size,
          createdAt: nowIso(),
          kind,
          dataUrl: kind === "image" ? dataUrl : undefined,
        } as TodoAttachment;
      })
    );

    const current = getTodoById(todoId);
    if (!current) return;
    const updated = {
      ...current,
      attachments: [...current.attachments, ...nextAttachments],
      updatedAt: nowIso(),
    };
    applyTodoUpdate(updated);
  };

  const handleRevealStorage = async () => {
    var path = "";
    if (storagePath) {
      setStoragePath("");
      return;
    } else {
      path = await revealStoragePath();
      setStoragePath(path);
    }

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(path);
        setStorageNotice("경로가 복사되었습니다");
      } catch {
        setStorageNotice("복사에 실패했습니다");
      }
    } else {
      setStorageNotice("복사를 사용할 수 없습니다");
    }
    window.setTimeout(() => setStorageNotice(""), 2200);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-amber-50 via-white to-slate-50 text-slate-900">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 top-10 h-64 w-64 rounded-full bg-rose-200/40 blur-3xl" />
        <div className="absolute right-0 top-32 h-72 w-72 rounded-full bg-amber-200/50 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-sky-200/40 blur-3xl" />
      </div>

      <TitleBar />

      <div className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl border border-slate-200 bg-white shadow-sm">
              <img src={logo} alt="Logo" className="rounded-2xl" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">TODOONG 'S</div>
              <div className="text-xs text-slate-500">TODO, 캘린더, 노트, 채팅을 한번에 활용해보세요.</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setTab("LIST")}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm",
                tab === "LIST"
                  ? "border-slate-900/30 bg-slate-900 text-white"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              )}
            >
              <ListChecks size={16} />
              목록
            </button>
            <button
              onClick={() => setTab("CALENDAR")}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm",
                tab === "CALENDAR"
                  ? "border-slate-900/30 bg-slate-900 text-white"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              )}
            >
              <CalendarDays size={16} />
              캘린더
            </button>
            <button
              onClick={() => setTab("NOTE")}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm",
                tab === "NOTE"
                  ? "border-slate-900/30 bg-slate-900 text-white"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              )}
            >
              <Notebook size={16} />
              노트
            </button>
            <button
              onClick={() => setTab("CHAT")}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm",
                tab === "CHAT"
                  ? "border-slate-900/30 bg-slate-900 text-white"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              )}
            >
              <MessageCircle size={16} />
              채팅
            </button>
            <button
              onClick={() => setTab("SETTINGS")}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm",
                tab === "SETTINGS"
                  ? "border-slate-900/30 bg-slate-900 text-white"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              )}
            >
              <Settings size={16} />
              설정
            </button>
          </div>
        </div>
        {storagePath ? (
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pb-3 text-xs text-slate-500">
            <div className="truncate">{storagePath}</div>
            <div className="flex items-center gap-2">
              {storageNotice ? <span className="text-slate-400">{storageNotice}</span> : null}
              <button
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] hover:bg-slate-50"
                onClick={handleRevealStorage}
              >
                <Copy size={12} />
                복사
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 pb-10 pt-6">
        <div className="space-y-6">
          {tab === "LIST" && (
            <div className="rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{selectedDate} 목록</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {Object.entries(dayCounts).map(([status, count]) => (
                      <span
                        key={status}
                        className={cn("rounded-full border px-2 py-0.5", STATUS_META[status as TodoStatus].badge)}
                      >
                        {STATUS_META[status as TodoStatus].label}: {count}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm hover:bg-slate-50"
                    onClick={() => shiftSelectedDate(-1)}
                    title="이전 날"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                  <button
                    className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm hover:bg-slate-50"
                    onClick={() => shiftSelectedDate(1)}
                    title="다음 날"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <button
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                    onClick={() => setSelectedDate(toYMD(new Date()))}
                  >
                    오늘
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-900/20 bg-slate-900 px-3 py-2 text-sm text-white hover:opacity-90"
                    onClick={createTodo}
                  >
                    <Plus size={16} />
                    새 할 일
                  </button>
                </div>
              </div>

              <div className="p-4">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                >
                  <SortableContext items={todosForDay.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {todosForDay.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                          {selectedDate}에 등록된 할 일이 없습니다. 새로 추가하세요.
                        </div>
                      ) : (
                        todosForDay.map((t) => (
                          <SortableTodoRow
                            key={t.id}
                            todo={t}
                            isSelected={t.id === selectedId}
                            onClick={() => openPanel(t.id)}
                          />
                        ))
                      )}
                    </div>
                  </SortableContext>

                  <DragOverlay>
                    {activeDragId ? (
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow">
                        {dayTodos.find((t) => t.id === activeDragId)?.title || "드래그 중"}
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>

                <div className="mt-3 text-xs text-slate-500">같은 날짜 안에서 드래그로 순서를 변경할 수 있어요.</div>
              </div>
            </div>
          )}

          {tab === "CALENDAR" && (
            <Calendar
              month={calendarMonth}
              selectedDate={selectedDate}
              todosByDate={todosByDate}
              onPickDate={pickDateFromCalendar}
              onPrevMonth={() => setCalendarMonth((m) => addMonths(m, -1))}
              onNextMonth={() => setCalendarMonth((m) => addMonths(m, +1))}
            />
          )}

          {tab === "NOTE" && (
            <Note />
          )}

          {tab === "CHAT" && (
            <Chat />
          )}
          {tab === "SETTINGS" && (
            <SettingPanel />
          )}
        </div>
        <div className="relative">
          <div
            className={cn(
              "fixed inset-0 z-30 bg-slate-900/30 transition-opacity duration-300",
              panelOpen ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
            onClick={() => setPanelOpen(false)}
            aria-hidden={!panelOpen}
          />
          <div
            className={cn(
              "fixed right-0 top-11 z-40 h-[calc(100%-44px)] w-full transition-transform duration-300 ease-out sm:w-[520px] md:w-[580px]",
              panelOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
            )}
            aria-hidden={!panelOpen}
          >
            <div className="flex h-full flex-col rounded-l-2xl border border-slate-200/70 bg-white/95 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between border-b border-slate-200/70 p-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">상세</div>
                  <div className="text-xs text-slate-500">목록에서 할 일을 선택하세요.</div>
                </div>
                <button
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
                  onClick={() => setPanelOpen((v) => !v)}
                  title="접기"
                >
                  {panelOpen ? "접기" : "펼치기"}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {!selectedTodo ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                    목록에서 할 일을 선택하면 상세를 편집할 수 있어요.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-700">제목</label>
                      <input
                        value={selectedTodo.title}
                        onChange={(e) => patchTodo(selectedTodo.id, { title: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder="제목을 입력하세요"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-700">상태</label>
                        <select
                          value={selectedTodo.status}
                          onChange={(e) => patchTodo(selectedTodo.id, { status: e.target.value as TodoStatus })}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                          {Object.keys(STATUS_META).map((k) => (
                            <option key={k} value={k}>
                              {STATUS_META[k as TodoStatus].label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-700">날짜</label>
                        <input
                          type="date"
                          value={selectedTodo.date}
                          onChange={(e) => patchTodo(selectedTodo.id, { date: e.target.value })}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-slate-700">내용</label>
                      </div>

                      <textarea
                        value={selectedTodo.content}
                        onChange={(e) => patchTodo(selectedTodo.id, { content: e.target.value })}
                        className="h-32 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder="내용을 입력하세요."
                      />
                      <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="mb-2 text-xs font-medium text-slate-700">미리보기</div>
                        <div className="markdown max-w-none text-sm whitespace-pre-wrap">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {selectedTodo.content || "_(내용 없음)_"}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-slate-700">첨부 파일 (이미지, PDF, HWP 등)</label>
                        <div className="text-[11px] text-slate-500">작업과 함께 저장됩니다.</div>
                      </div>

                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleUploadFiles(e.dataTransfer.files, selectedTodo.id);
                        }}
                        className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-600"
                        title="여기에 파일을 끌어다 놓으세요"
                      >
                        파일을 끌어다 놓으세요
                        <div className="mt-2">
                          <button
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            파일 선택
                          </button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept={UPLOAD_ACCEPT}
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files?.length) handleUploadFiles(e.target.files, selectedTodo.id);
                              e.currentTarget.value = "";
                            }}
                          />
                        </div>
                      </div>

                      {uploadNotice ? <div className="text-xs text-rose-600">{uploadNotice}</div> : null}

                      {selectedAttachments.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
                          첨부된 파일이 없습니다.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {imageAttachments.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-medium text-slate-700">이미지</div>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {imageAttachments.map((img) => (
                                  <div key={img.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                                    <button
                                      type="button"
                                      className="block w-full"
                                      onClick={() => openAttachment(selectedTodo.id, img)}
                                      title="파일 열기"
                                    >
                                      <img
                                        src={img.dataUrl || toFileUrl(img.path)}
                                        alt={img.name}
                                        className="h-28 w-full object-cover"
                                      />
                                    </button>
                                    <div className="flex items-center justify-between gap-2 p-2">
                                      <div className="min-w-0">
                                        <div className="truncate text-xs font-medium text-slate-700">{img.name}</div>
                                        <div className="text-[11px] text-slate-400">{formatDateTime(img.createdAt)}</div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <button
                                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                                          onClick={() => openAttachment(selectedTodo.id, img)}
                                        >
                                          열기
                                        </button>
                                        <button
                                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                                          onClick={() => removeAttachment(selectedTodo.id, img)}
                                        >
                                          삭제
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {fileAttachments.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-medium text-slate-700">파일</div>
                              <div className="space-y-2">
                                {fileAttachments.map((file) => (
                                  <div
                                    key={file.id}
                                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2"
                                  >
                                    <div className="flex min-w-0 items-center gap-2">
                                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-500">
                                        {React.createElement(pickFileIcon(file), { size: 16 })}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="truncate text-sm font-medium text-slate-800">{file.name}</div>
                                        <div className="text-[11px] text-slate-400">
                                          {formatFileSize(file.size)} · {fileKindLabel(file)}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                                        onClick={() => openAttachment(selectedTodo.id, file)}
                                      >
                                        <ExternalLink size={12} />
                                        열기
                                      </button>
                                      <button
                                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                                        onClick={() => removeAttachment(selectedTodo.id, file)}
                                      >
                                        삭제
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {fileAttachments.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-slate-700">파일</div>
                        <div className="space-y-2">
                          {fileAttachments.map((file) => (
                            <div
                              key={file.id}
                              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-500">
                                  {React.createElement(pickFileIcon(file), { size: 16 })}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium text-slate-800">{file.name}</div>
                                  <div className="text-[11px] text-slate-400">
                                    {formatFileSize(file.size)} · {fileKindLabel(file)}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                                  onClick={() => openAttachment(selectedTodo.id, file)}
                                >
                                  <ExternalLink size={12} />
                                  열기
                                </button>
                                <button
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                                  onClick={() => removeAttachment(selectedTodo.id, file)}
                                >
                                  삭제
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-700">참조 (References)</label>
                    <div className="text-[11px] text-slate-500">다른 TODO를 참조로 연결해 맥락을 남겨요.</div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <input
                        value={refSearch}
                        onChange={(e) => setRefSearch(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder="제목으로 검색 (예: 회의, 설계, 배포)"
                      />
                      <div className="text-[11px] text-slate-500">
                        {referenceCandidates.length ? `검색 결과 ${referenceCandidates.length}개` : "검색 결과 없음"}
                      </div>
                    </div>

                    <div
                      className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1"
                      onScroll={handleReferenceScroll}
                    >
                      {visibleReferenceCandidates.length === 0 ? (
                        <div className="text-xs text-slate-500">참조할 TODO가 없습니다.</div>
                      ) : (
                        visibleReferenceCandidates.map((c) => {
                          const checked = selectedTodo?.refs.includes(c.id) ?? false;

                          return (
                            <label key={c.id} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (!selectedTodo) return;

                                  const next = e.target.checked
                                    ? [...selectedTodo.refs, c.id]
                                    : selectedTodo.refs.filter((x) => x !== c.id);

                                  patchTodo(selectedTodo.id, { refs: next });
                                }}
                              />
                              <span className="min-w-0 flex-1 truncate text-slate-800">{c.title || "제목 없음"}</span>
                              <span className="text-xs text-slate-400">{c.date}</span>
                              <span className="text-xs text-slate-400">{STATUS_META[c.status].label}</span>
                            </label>
                          );
                        })
                      )}
                    </div>

                    {hasMoreReferences ? (
                      <div className="mt-2 text-center text-[11px] text-slate-400">아래로 스크롤하면 더 불러옵니다</div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="mb-2 text-xs font-medium text-slate-700">관계</div>
                    <div className="text-xs text-slate-500">같은 날짜의 의존/차단 관계를 기록합니다.</div>

                    <div className="mt-3 space-y-2">
                      {(selectedTodo?.rels ?? []).length === 0 ? (
                        <div className="text-xs text-slate-500">아직 관계가 없습니다.</div>
                      ) : (
                        selectedTodo?.rels.map((r, idx) => {
                          const target = summaryTodos.find((t) => t.id === r.toId);
                          return (
                            <div
                              key={`${r.toId}_${idx}`}
                              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2"
                            >
                              <span className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
                                {REL_LABEL[r.type]}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                                {target?.title || "대상 없음"}
                              </span>
                              <button
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                                onClick={() =>
                                  patchTodo(selectedTodo.id, {
                                    rels: selectedTodo.rels.filter((_, i) => i !== idx),
                                  })
                                }
                              >
                                삭제
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="mt-3 flex flex-col gap-2 md:flex-row">
                      <select
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        value={relType}
                        onChange={(e) => setRelType(e.target.value as TodoRel["type"])}
                      >
                        <option value="depends">의존</option>
                        <option value="blocks">차단</option>
                        <option value="relates">연관</option>
                      </select>

                      <select
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        value={relTargetId}
                        onChange={(e) => setRelTargetId(e.target.value)}
                      >
                        <option value="" disabled>
                          대상 선택
                        </option>
                        {candidatesSameDay.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title || "제목 없음"} [{STATUS_META[c.status].label}]
                          </option>
                        ))}
                      </select>

                      <button
                        className="rounded-xl border border-slate-900/20 bg-slate-900 px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
                        onClick={() => {
                          if (!relTargetId || !selectedTodo) return;
                          patchTodo(selectedTodo.id, { rels: [...selectedTodo?.rels, { toId: relTargetId, type: relType }] });
                        }}
                        disabled={!relTargetId}
                      >
                        Add relation
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2">
                  <div className="text-[11px] text-slate-400">
                    생성: {selectedTodo && formatDateTime(selectedTodo.createdAt)}
                    <br />
                    수정: {selectedTodo && formatDateTime(selectedTodo.updatedAt)}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                      onClick={() => {
                        setSelectedId(null);
                        setPanelOpen(false);
                      }}
                    >
                      닫기
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-100"
                      onClick={() => selectedTodo && patchTodo(selectedTodo.id, { title: selectedTodo.title, content: selectedTodo.content, date: selectedTodo.date, status: selectedTodo.status, refs: selectedTodo.refs, rels: selectedTodo.rels, attachments: selectedTodo.attachments, updatedAt: nowIso() })}
                    >
                      <Save size={14} />
                      저장
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 hover:bg-rose-100"
                      onClick={() => selectedTodo && deleteTodo(selectedTodo.id)}
                    >
                      <Trash2 size={14} />
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
