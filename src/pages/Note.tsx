import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type JSONContent, Node, mergeAttributes } from "@tiptap/core";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type NodeViewProps,
} from "@tiptap/react";
import { FloatingMenu } from "@tiptap/react/menus";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  Link2,
  Pencil,
  Save,
  Trash2,
  Upload,
  X,
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
  contentTiptap?: JSONContent | null;
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
const formatDateTime = (iso: string) => (iso ? iso.replace("T", " ").slice(0, 16) : "");
const DRAG_MIME = "application/x-note-item";
const ROOT_DROP_ID = "__root__";
const ATTACHMENT_PROTOCOL = "note-attachment";

function toAttachmentUrl(filePath: string) {
  if (!filePath) return "";
  const normalized = filePath.replace(/\\/g, "/");
  return `${ATTACHMENT_PROTOCOL}://${encodeURI(normalized)}`;
}

function fromFileUrl(fileUrl: string) {
  if (!fileUrl.startsWith("file://")) return fileUrl;
  const withoutScheme = decodeURI(fileUrl.replace(/^file:\/\//, ""));
  const withoutLeading = withoutScheme.replace(/^\/+/, "");
  if (/^[A-Za-z]:/.test(withoutLeading)) return withoutLeading;
  return withoutScheme;
}

function normalizeImageSrc(src: string) {
  if (!src) return src;
  if (src.startsWith(`${ATTACHMENT_PROTOCOL}://`)) return src;
  if (src.startsWith("file://")) return toAttachmentUrl(fromFileUrl(src));
  return src;
}

function normalizeDocImages(node: JSONContent): JSONContent {
  if (!node || typeof node !== "object") return node;
  const next: JSONContent = { ...node };
  if (node.type === "image" && node.attrs?.src) {
    next.attrs = { ...node.attrs, src: normalizeImageSrc(String(node.attrs.src)) };
  }
  if (Array.isArray(node.content)) {
    next.content = node.content.map((child) => normalizeDocImages(child as JSONContent));
  }
  return next;
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

type ChartDatum = { label: string; value: number };

const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

const DEFAULT_SELECT_OPTIONS = ["진행중", "완료", "보류"];

const normalizeSelectOptions = (value: unknown) =>
  Array.isArray(value) ? value.map((item) => String(item)) : DEFAULT_SELECT_OPTIONS;

const normalizeChartData = (value: unknown): ChartDatum[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      label: String(item?.label ?? ""),
      value: Number.isFinite(item?.value) ? Number(item.value) : 0,
    }))
    .filter((item) => item.label);
};

const DEFAULT_LAYOUT_ITEMS = ["Block A", "Block B", "Block C", "Block D"];
const LAYOUT_OPTIONS = [
  { value: "grid", label: "Grid" },
  { value: "list", label: "List" },
  { value: "table", label: "Table" },
  { value: "venn", label: "Venn" },
];

const normalizeLayoutItems = (value: unknown) =>
  Array.isArray(value) ? value.map((item) => String(item)) : DEFAULT_LAYOUT_ITEMS;

const toDocFromText = (text: string): JSONContent => {
  if (!text) return EMPTY_DOC;
  const lines = text.split(/\r?\n/);
  const content = lines.map((line) =>
    line
      ? { type: "paragraph", content: [{ type: "text", text: line }] }
      : { type: "paragraph" }
  );
  return { type: "doc", content };
};

const parseContentTiptap = (raw: unknown): JSONContent | null => {
  if (!raw) return null;
  if (typeof raw === "object") return raw as JSONContent;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as JSONContent;
    } catch {
      return null;
    }
  }
  return null;
};

const isPlainDoc = (doc?: JSONContent | null) => {
  if (!doc || doc.type !== "doc") return true;
  if (!Array.isArray(doc.content)) return true;
  return doc.content.every((block) => {
    if (block.type !== "paragraph") return false;
    if (!block.content) return true;
    return block.content.every((inline) => {
      if (inline.type === "hardBreak") return true;
      if (inline.type !== "text") return false;
      return !(inline.marks && inline.marks.length > 0);
    });
  });
};

const MARKDOWN_PATTERN =
  /(^\s{0,3}#{1,6}\s)|(\*\*[^*]+\*\*)|(__[^_]+__)|(`{1,3}[^`]+`{1,3})|(^\s*[-*+]\s+)|(^\s*\d+\.\s+)|(\[[^\]]+\]\([^)]+\))|(\|.+\|)|(\[(?:v|x)\])|(~[^~]+~)/mi;

const hasMarkdownSyntax = (value: string) => MARKDOWN_PATTERN.test(value);

type MdastNode = {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
    hChildren?: MdastNode[];
  };
};

const createCheckboxNode = (checked: boolean): MdastNode => ({
  type: "inlineCheckbox",
  data: {
    hName: "input",
    hProperties: {
      type: "checkbox",
      checked,
      disabled: true,
      "aria-label": checked ? "checked" : "unchecked",
    },
  },
});

const splitInlineTokens = (value: string): MdastNode[] => {
  const nodes: MdastNode[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) {
      nodes.push({ type: "text", value: buffer });
      buffer = "";
    }
  };

  let i = 0;
  while (i < value.length) {
    const char = value[i];
    if (char === "[" && value[i + 2] === "]") {
      const flag = value[i + 1]?.toLowerCase();
      if (flag === "v" || flag === "x") {
        flush();
        nodes.push(createCheckboxNode(flag === "v"));
        i += 3;
        continue;
      }
    }
    if (char === "~" && value[i - 1] !== "~" && value[i + 1] !== "~") {
      const end = value.indexOf("~", i + 1);
      if (end !== -1 && value[end + 1] !== "~") {
        const text = value.slice(i + 1, end);
        if (text) {
          flush();
          nodes.push({ type: "delete", children: [{ type: "text", value: text }] });
          i = end + 1;
          continue;
        }
      }
    }
    buffer += char;
    i += 1;
  }
  flush();
  return nodes;
};

const remarkInlineTokens = () => {
  const walk = (node: MdastNode) => {
    if (!node || !Array.isArray(node.children)) return;
    const nextChildren: MdastNode[] = [];
    for (const child of node.children) {
      if (
        child.type === "text" &&
        typeof child.value === "string" &&
        node.type !== "code" &&
        node.type !== "inlineCode"
      ) {
        nextChildren.push(...splitInlineTokens(child.value));
        continue;
      }
      walk(child);
      nextChildren.push(child);
    }
    node.children = nextChildren;
  };

  return (tree: MdastNode) => {
    walk(tree);
  };
};

const stopInteractiveEvent = (event: any) => {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("button, input, select, textarea"));
};

function SelectBlockView({ node, updateAttributes }: NodeViewProps) {
  const label = String(node.attrs.label ?? "상태");
  const options = normalizeSelectOptions(node.attrs.options);
  const value = String(node.attrs.value ?? options[0] ?? "");
  const optionsText = options.join("\n");
  const [isEditing, setIsEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(label);
  const [draftOptions, setDraftOptions] = useState(optionsText);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraftLabel(label);
    setDraftOptions(optionsText);
    setError("");
  }, [label, optionsText]);

  const handleApply = () => {
    const cleaned = draftOptions
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item, index, list) => list.indexOf(item) === index);
    if (cleaned.length === 0) {
      setError("옵션을 최소 1개 입력하세요.");
      return;
    }
    const nextLabel = draftLabel.trim() || "상태";
    const nextValue = cleaned.includes(value) ? value : cleaned[0];
    updateAttributes({
      label: nextLabel,
      options: cleaned,
      value: nextValue,
    });
    setIsEditing(false);
    setError("");
  };

  return (
    <NodeViewWrapper className="rounded-2xl border border-slate-200 bg-white p-3" contentEditable={false}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
        <button
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"
          onClick={() => setIsEditing((prev) => !prev)}
        >
          {isEditing ? "닫기" : "편집"}
        </button>
      </div>
      {isEditing ? (
        <div className="mt-3 space-y-2">
          <input
            value={draftLabel}
            onChange={(event) => setDraftLabel(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder="라벨"
          />
          <textarea
            value={draftOptions}
            onChange={(event) => setDraftOptions(event.target.value)}
            className="h-28 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
            placeholder="옵션을 줄바꿈으로 입력하세요."
          />
          {error ? <div className="text-xs text-rose-600">{error}</div> : null}
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
              onClick={handleApply}
            >
              적용
            </button>
            <button
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
              onClick={() => {
                setIsEditing(false);
                setDraftLabel(label);
                setDraftOptions(optionsText);
                setError("");
              }}
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <select
          value={value}
          onChange={(event) => updateAttributes({ value: event.target.value })}
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}
    </NodeViewWrapper>
  );
}

const SelectBlock = Node.create({
  name: "selectBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      label: { default: "상태" },
      value: { default: "진행중" },
      options: { default: DEFAULT_SELECT_OPTIONS },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-select-block]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-select-block": "true" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(SelectBlockView, { stopEvent: stopInteractiveEvent });
  },
});

function ChartBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(String(node.attrs.title ?? "차트"));
  const [draftData, setDraftData] = useState(
    JSON.stringify(normalizeChartData(node.attrs.data), null, 2)
  );
  const [error, setError] = useState("");
  const data = normalizeChartData(node.attrs.data);
  const max = Math.max(...data.map((item) => item.value), 1);

  useEffect(() => {
    setTitle(String(node.attrs.title ?? "차트"));
    setDraftData(JSON.stringify(normalizeChartData(node.attrs.data), null, 2));
    setError("");
  }, [node.attrs.title, node.attrs.data]);

  const handleApply = () => {
    try {
      const parsed = JSON.parse(draftData);
      const normalized = normalizeChartData(parsed);
      updateAttributes({
        title: title.trim() || "차트",
        data: normalized,
      });
      setIsEditing(false);
      setError("");
    } catch {
      setError("JSON 형식이 올바르지 않습니다.");
    }
  };

  return (
    <NodeViewWrapper className="rounded-2xl border border-slate-200 bg-white p-3" contentEditable={false}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Chart</div>
        {editor.isEditable ? (
          <button
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"
            onClick={() => setIsEditing((prev) => !prev)}
          >
            {isEditing ? "닫기" : "편집"}
          </button>
        ) : null}
      </div>

      {isEditing ? (
        <div className="mt-3 space-y-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder="차트 제목"
          />
          <textarea
            value={draftData}
            onChange={(event) => setDraftData(event.target.value)}
            className="h-32 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
            placeholder='[{ "label": "A", "value": 10 }]'
          />
          {error ? <div className="text-xs text-rose-600">{error}</div> : null}
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
              onClick={handleApply}
            >
              적용
            </button>
            <button
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
              onClick={() => {
                setIsEditing(false);
                setDraftData(JSON.stringify(normalizeChartData(node.attrs.data), null, 2));
                setError("");
              }}
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="text-sm font-semibold text-slate-800">{title}</div>
          {data.length === 0 ? (
            <div className="text-xs text-slate-400">표시할 데이터가 없습니다.</div>
          ) : (
            data.map((item) => (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>{item.label}</span>
                  <span>{item.value}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-amber-300"
                    style={{ width: `${Math.max(6, (item.value / max) * 100)}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
}

const ChartBlock = Node.create({
  name: "chartBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      title: { default: "차트" },
      data: {
        default: [
          { label: "A", value: 30 },
          { label: "B", value: 55 },
          { label: "C", value: 20 },
        ],
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-chart-block]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-chart-block": "true" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ChartBlockView, { stopEvent: stopInteractiveEvent });
  },
});

const CALLOUT_TONES: Record<
  string,
  { label: string; containerClass: string; badgeClass: string; bodyClass: string }
> = {
  note: {
    label: "노트",
    containerClass: "border-slate-200 bg-slate-50",
    badgeClass: "bg-slate-200 text-slate-700",
    bodyClass: "text-slate-700",
  },
  info: {
    label: "정보",
    containerClass: "border-sky-200 bg-sky-50",
    badgeClass: "bg-sky-200 text-sky-700",
    bodyClass: "text-sky-800",
  },
  success: {
    label: "완료",
    containerClass: "border-emerald-200 bg-emerald-50",
    badgeClass: "bg-emerald-200 text-emerald-700",
    bodyClass: "text-emerald-800",
  },
  warning: {
    label: "주의",
    containerClass: "border-amber-200 bg-amber-50",
    badgeClass: "bg-amber-200 text-amber-700",
    bodyClass: "text-amber-900",
  },
};

function CalloutBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const tone = String(node.attrs.tone ?? "note");
  const title = String(node.attrs.title ?? "콜아웃");
  const body = String(node.attrs.body ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [draftTone, setDraftTone] = useState(tone);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftBody, setDraftBody] = useState(body);
  const activeTone = isEditing ? draftTone : tone;
  const toneMeta = CALLOUT_TONES[activeTone] ?? CALLOUT_TONES.note;

  useEffect(() => {
    setDraftTone(tone);
    setDraftTitle(title);
    setDraftBody(body);
  }, [tone, title, body]);

  const handleApply = () => {
    updateAttributes({
      tone: draftTone,
      title: draftTitle.trim() || "콜아웃",
      body: draftBody.trim(),
    });
    setIsEditing(false);
  };

  return (
    <NodeViewWrapper
      className={`rounded-2xl border p-3 ${toneMeta.containerClass}`}
      contentEditable={false}
    >
      <div className="flex items-center justify-between">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneMeta.badgeClass}`}>
          {toneMeta.label}
        </span>
        {editor.isEditable ? (
          <button
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"
            onClick={() => setIsEditing((prev) => !prev)}
          >
            {isEditing ? "닫기" : "편집"}
          </button>
        ) : null}
      </div>
      {isEditing ? (
        <div className="mt-3 space-y-2">
          <select
            value={draftTone}
            onChange={(event) => setDraftTone(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {Object.entries(CALLOUT_TONES).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.label}
              </option>
            ))}
          </select>
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder="제목"
          />
          <textarea
            value={draftBody}
            onChange={(event) => setDraftBody(event.target.value)}
            className="h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
            placeholder="내용"
          />
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
              onClick={handleApply}
            >
              적용
            </button>
            <button
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
              onClick={() => {
                setIsEditing(false);
                setDraftTone(tone);
                setDraftTitle(title);
                setDraftBody(body);
              }}
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-1">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          {body ? (
            <p className={`whitespace-pre-line text-sm ${toneMeta.bodyClass}`}>{body}</p>
          ) : (
            <div className="text-xs text-slate-400">내용이 없습니다.</div>
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
}

const CalloutBlock = Node.create({
  name: "calloutBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      tone: { default: "note" },
      title: { default: "콜아웃" },
      body: { default: "핵심 내용을 정리하세요." },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-callout-block]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-callout-block": "true" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutBlockView, { stopEvent: stopInteractiveEvent });
  },
});

function LayoutBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const layout = String(node.attrs.layout ?? "grid");
  const items = normalizeLayoutItems(node.attrs.items);
  const itemsText = items.join("\n");
  const [isEditing, setIsEditing] = useState(false);
  const [draftLayout, setDraftLayout] = useState(layout);
  const [draftItems, setDraftItems] = useState(itemsText);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraftLayout(layout);
    setDraftItems(itemsText);
    setError("");
  }, [layout, itemsText]);

  const handleApply = () => {
    const cleaned = draftItems
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item, index, list) => list.indexOf(item) === index);
    if (cleaned.length === 0) {
      setError("아이템을 최소 1개 입력하세요.");
      return;
    }
    updateAttributes({
      layout: draftLayout,
      items: cleaned,
    });
    setIsEditing(false);
    setError("");
  };

  const activeLayout = LAYOUT_OPTIONS.some((option) => option.value === layout) ? layout : "grid";
  const previewItems = items.length ? items : DEFAULT_LAYOUT_ITEMS;

  const renderPreview = () => {
    if (activeLayout === "list") {
      return (
        <ul className="list-disc pl-5 text-xs text-slate-700">
          {previewItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    }
    if (activeLayout === "table") {
      const rows: Array<[string, string | undefined]> = [];
      for (let i = 0; i < previewItems.length; i += 2) {
        rows.push([previewItems[i], previewItems[i + 1]]);
      }
      return (
        <table className="w-full border-collapse text-xs">
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`row-${idx}`}>
                <td className="border border-slate-200 px-2 py-1">{row[0]}</td>
                <td className="border border-slate-200 px-2 py-1">{row[1] ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    if (activeLayout === "venn") {
      const leftLabel = previewItems[0] ?? "A";
      const rightLabel = previewItems[1] ?? "B";
      const overlapLabel = previewItems[2] ?? "A&B";
      return (
        <div className="relative h-32">
          <div className="absolute left-2 top-2 flex h-24 w-24 items-center justify-center rounded-full border border-slate-300 bg-amber-100/70 text-[10px] text-slate-700">
            <span className="px-2 text-center">{leftLabel}</span>
          </div>
          <div className="absolute right-2 top-2 flex h-24 w-24 items-center justify-center rounded-full border border-slate-300 bg-sky-100/70 text-[10px] text-slate-700">
            <span className="px-2 text-center">{rightLabel}</span>
          </div>
          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-slate-700">
            {overlapLabel}
          </div>
        </div>
      );
    }
    const gridCols = previewItems.length >= 6 ? "grid-cols-3" : "grid-cols-2";
    return (
      <div className={`grid gap-2 ${gridCols}`}>
        {previewItems.map((item) => (
          <div
            key={item}
            className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
          >
            {item}
          </div>
        ))}
      </div>
    );
  };

  return (
    <NodeViewWrapper className="rounded-2xl border border-slate-200 bg-white p-3" contentEditable={false}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Layout</div>
        {editor.isEditable ? (
          <button
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"
            onClick={() => setIsEditing((prev) => !prev)}
          >
            {isEditing ? "닫기" : "편집"}
          </button>
        ) : null}
      </div>
      {isEditing ? (
        <div className="mt-3 space-y-2">
          <select
            value={draftLayout}
            onChange={(event) => setDraftLayout(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {LAYOUT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <textarea
            value={draftItems}
            onChange={(event) => setDraftItems(event.target.value)}
            className="h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
            placeholder="아이템을 줄바꿈으로 입력하세요."
          />
          {error ? <div className="text-xs text-rose-600">{error}</div> : null}
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
              onClick={handleApply}
            >
              적용
            </button>
            <button
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
              onClick={() => {
                setIsEditing(false);
                setDraftLayout(layout);
                setDraftItems(itemsText);
                setError("");
              }}
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="text-sm font-semibold text-slate-800">
            {LAYOUT_OPTIONS.find((option) => option.value === activeLayout)?.label ?? "Grid"}
          </div>
          {renderPreview()}
        </div>
      )}
    </NodeViewWrapper>
  );
}

const LayoutBlock = Node.create({
  name: "layoutBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      layout: { default: "grid" },
      items: { default: DEFAULT_LAYOUT_ITEMS },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-layout-block]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-layout-block": "true" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(LayoutBlockView, { stopEvent: stopInteractiveEvent });
  },
});

export default function Note({
  focusNoteId,
  onFocusHandled,
  onOpenTodo,
}: {
  focusNoteId?: string | null;
  onFocusHandled?: () => void;
  onOpenTodo?: (todoId: string) => void;
}) {
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
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftFolderId, setDraftFolderId] = useState<string | null>(null);
  const [linkPromptOpen, setLinkPromptOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedNoteRef = useRef<NoteDetail | null>(null);
  const isEditingRef = useRef(false);
  const isFolderComposingRef = useRef(false);
  const isTitleComposingRef = useRef(false);

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

  const editorExtensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      Placeholder.configure({ placeholder: "노트 내용을 입력하세요..." }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      SelectBlock,
      ChartBlock,
      CalloutBlock,
      LayoutBlock,
    ],
    []
  );

  const editor = useEditor({
    extensions: editorExtensions,
    content: EMPTY_DOC,
    editable: isEditing,
  });

  const handleEditorImageFiles = useCallback(async (files: File[]) => {
    if (!editor || !isEditingRef.current) return false;
    const note = selectedNoteRef.current;
    if (!note || !hasNotesBridge) return false;
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return false;
    for (const file of images) {
      const dataUrl = await fileToDataUrl(file);
      const attachment = await window.api.notes.addAttachment({
        noteId: note.id,
        name: file.name,
        dataUrl,
      });
      if (!attachment) continue;
      setSelectedNote((prev) => {
        if (!prev) return prev;
        return { ...prev, attachments: [...prev.attachments, attachment] };
      });
      if (attachment.kind === "image") {
        editor.chain().focus().setImage({ src: toAttachmentUrl(attachment.path), alt: attachment.name }).run();
      }
    }
    return true;
  }, [editor]);

  useEffect(() => {
    selectedNoteRef.current = selectedNote;
  }, [selectedNote]);

  useEffect(() => {
    isEditingRef.current = isEditing;
    if (editor) editor.setEditable(isEditing);
  }, [isEditing, editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: {
        attributes: { class: "tiptap" },
        handleDrop: (_view, event) => {
          if (!isEditingRef.current) return false;
          const files = Array.from(event.dataTransfer?.files ?? []);
          if (files.length === 0) return false;
          const hasImages = files.some((file) => file.type.startsWith("image/"));
          if (!hasImages) return false;
          void handleEditorImageFiles(files);
          return true;
        },
        handlePaste: (_view, event) => {
          if (!isEditingRef.current) return false;
          const files = Array.from(event.clipboardData?.files ?? []);
          if (files.length === 0) return false;
          const hasImages = files.some((file) => file.type.startsWith("image/"));
          if (!hasImages) return false;
          void handleEditorImageFiles(files);
          return true;
        },
      },
    });
  }, [editor, handleEditorImageFiles]);

  useEffect(() => {
    if (!editor) return;

    const nextContent =
      selectedNote?.contentTiptap
        ? parseContentTiptap(selectedNote.contentTiptap) ?? EMPTY_DOC
        : toDocFromText(selectedNote?.content ?? "");

    queueMicrotask(() => {
      editor.commands.setContent(normalizeDocImages(nextContent), { emitUpdate: false });
    });
  }, [editor, selectedNote?.id]);


  useEffect(() => {
    if (!selectedNote) return;
    setDraftTitle(selectedNote.title ?? "");
    setDraftFolderId(selectedNote.folderId ?? null);
    setIsEditing(false);
  }, [selectedNote?.id]);

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
      if (!detail) {
        setSelectedNote(null);
        return;
      }
      const parsed = parseContentTiptap(detail.contentTiptap);
      setSelectedNote({ ...detail, contentTiptap: parsed ?? detail.contentTiptap ?? null });
    });
  }, [selectedNoteId]);

  useEffect(() => {
    if (selectedNoteId) return;
    if (notes.length > 0) {
      setSelectedNoteId(notes[0].id);
    }
  }, [notes, selectedNoteId]);

  useEffect(() => {
    if (!focusNoteId) return;
    setSelectedNoteId(focusNoteId);
    const match = notes.find((note) => note.id === focusNoteId);
    if (match) {
      setSelectedFolderId(match.folderId ?? null);
      if (match.folderId) {
        setExpandedFolders((prev) => ({ ...prev, [match.folderId ?? ROOT_DROP_ID]: true }));
      }
    }
    onFocusHandled?.();
  }, [focusNoteId, notes, onFocusHandled]);

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

  const bumpNoteUpdatedAt = async (note?: NoteDetail) => {
    const current = note ?? selectedNoteRef.current;
    if (!current || !hasNotesBridge) return;
    const updated = { ...current, updatedAt: nowIso() };
    await window.api.notes.upsertNote(updated);
    setSelectedNote(updated);
    await refreshTree();
  };

  const handleStartEdit = () => {
    if (!selectedNote) return;
    setDraftTitle(selectedNote.title ?? "");
    setDraftFolderId(selectedNote.folderId ?? null);
    setIsEditing(true);
    editor?.commands.focus("end");
  };

  const handleCancelEdit = () => {
    if (!selectedNote || !editor) return;
    setDraftTitle(selectedNote.title ?? "");
    setDraftFolderId(selectedNote.folderId ?? null);
    setIsEditing(false);
    const nextContent =
      selectedNote?.contentTiptap
        ? parseContentTiptap(selectedNote.contentTiptap) ?? EMPTY_DOC
        : toDocFromText(selectedNote?.content ?? "");
    editor.commands.setContent(normalizeDocImages(nextContent), { emitUpdate: false });
  };

  const handleSaveEdit = async () => {
    if (!selectedNote || !editor || !hasNotesBridge) return;
    const updated: NoteDetail = {
      ...selectedNote,
      title: draftTitle.trim() || "제목 없는 노트",
      folderId: draftFolderId ?? null,
      content: editor.getText({ blockSeparator: "\n" }),
      contentTiptap: editor.getJSON(),
      updatedAt: nowIso(),
    };
    await window.api.notes.upsertNote(updated);
    setSelectedNote(updated);
    setSelectedFolderId(updated.folderId ?? null);
    await refreshTree();
    setIsEditing(false);
    // flashStatus("노트를 저장했습니다.");
  };

  const handleSetLink = () => {
    if (!editor || !isEditingRef.current) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    setLinkDraft(previous ?? "");
    setLinkPromptOpen(true);
  };

  const handleConfirmLink = useCallback(() => {
    if (!editor) return;
    const url = linkDraft.trim();
    if (!url) {
      editor.chain().focus().unsetLink().run();
      setLinkPromptOpen(false);
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setLinkPromptOpen(false);
  }, [editor, linkDraft]);

  const handleCancelLink = useCallback(() => {
    setLinkPromptOpen(false);
  }, []);

  const clearSlash = () => {
    if (!editor) return;
    const { $from } = editor.state.selection;
    const parent = $from.parent;
    if (parent.type.name !== "paragraph" || parent.textContent !== "/") return;
    const from = $from.start();
    editor.commands.deleteRange({ from, to: from + 1 });
  };

  const runSlashCommand = (action: () => void) => {
    if (!editor) return;
    clearSlash();
    action();
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
      contentTiptap: EMPTY_DOC,
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

  const handleUploadFiles = async (files: FileList | File[]) => {
    if (!selectedNote || !hasNotesBridge) return;
    const list = Array.from(files);
    let didAttach = false;
    for (const file of list) {
      const dataUrl = await fileToDataUrl(file);
      const attachment = await window.api.notes.addAttachment({
        noteId: selectedNote.id,
        name: file.name,
        dataUrl,
      });
      if (!attachment) continue;
      didAttach = true;
      setSelectedNote((prev) => {
        if (!prev) return prev;
        return { ...prev, attachments: [...prev.attachments, attachment] };
      });
      if (attachment.kind === "image" && editor && isEditingRef.current) {
        editor.chain().focus().setImage({ src: toAttachmentUrl(attachment.path), alt: attachment.name }).run();
      }
    }
    if (didAttach) {
      await bumpNoteUpdatedAt();
    }
  };

  const handleRemoveAttachment = async (attachmentId: string) => {
    if (!selectedNote || !hasNotesBridge) return;
    await window.api.notes.removeAttachment({ noteId: selectedNote.id, attachmentId });
    setSelectedNote((prev) => {
      if (!prev) return prev;
      return { ...prev, attachments: prev.attachments.filter((att) => att.id !== attachmentId) };
    });
    await bumpNoteUpdatedAt();
  };

  const handleDownloadAttachment = async (attachment: NoteAttachment) => {
    if (!hasNotesBridge) return;
    await window.api.notes.downloadAttachment({ path: attachment.path, name: attachment.name });
  };

  const handleExportPdf = async () => {
    if (!selectedNote || !hasNotesBridge) return;
    const html = editor?.getHTML() ?? "";
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
    const next = { ...selectedNote, todoLinks: nextLinks };
    setSelectedNote(next);
    await window.api.notes.updateLinks({ noteId: selectedNote.id, todoIds: nextLinks });
    await bumpNoteUpdatedAt(next);
  };

  const imageAttachments = selectedNote?.attachments.filter((att) => att.kind === "image") ?? [];
  const fileAttachments = selectedNote?.attachments.filter((att) => att.kind === "file") ?? [];
  const attachmentCount = selectedNote?.attachments.length ?? 0;
  const selectedFolderName = selectedNote?.folderId
    ? folders.find((folder) => folder.id === selectedNote.folderId)?.name ?? "폴더 없음"
    : "최상위";
  const linkedTodos = todoItems.filter((todo) => linkedTodoIds.includes(todo.id));
  const canEdit = Boolean(editor && isEditing);
  const editorBodyClass =
    "min-h-[360px] flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4";
  const markdownSource = selectedNote?.content ?? "";
  const shouldRenderMarkdown =
    !isEditing && isPlainDoc(selectedNote?.contentTiptap) && hasMarkdownSyntax(markdownSource);
  const toolbarGroupClass =
    "flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm";
  const toolbarLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-slate-400";
  const toolbarDividerClass = "mx-1 h-4 w-px bg-slate-200";
  const toolbarButtonClass = (active = false) =>
    `rounded-lg border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:bg-slate-50"}`;
  const slashMenuItems = editor
    ? [
      {
        label: "Heading 1",
        action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      },
      {
        label: "Heading 2",
        action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        label: "Heading 3",
        action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      },
      {
        label: "Bullet List",
        action: () => editor.chain().focus().toggleBulletList().run(),
      },
      {
        label: "Ordered List",
        action: () => editor.chain().focus().toggleOrderedList().run(),
      },
      {
        label: "Task List",
        action: () => editor.chain().focus().toggleTaskList().run(),
      },
      {
        label: "Table",
        action: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      },
      {
        label: "Code Block",
        action: () => editor.chain().focus().toggleCodeBlock().run(),
      },
      {
        label: "Divider",
        action: () => editor.chain().focus().setHorizontalRule().run(),
      },
      {
        label: "Blockquote",
        action: () => editor.chain().focus().toggleBlockquote().run(),
      },
      {
        label: "Select Block",
        action: () => editor.chain().focus().insertContent({ type: "selectBlock" }).run(),
      },
      {
        label: "Chart Block",
        action: () => editor.chain().focus().insertContent({ type: "chartBlock" }).run(),
      },
      {
        label: "Callout Block",
        action: () => editor.chain().focus().insertContent({ type: "calloutBlock" }).run(),
      },
      {
        label: "Layout Block",
        action: () => editor.chain().focus().insertContent({ type: "layoutBlock" }).run(),
      },
    ]
    : [];

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
              onCompositionStart={() => {
                isFolderComposingRef.current = true;
              }}
              onCompositionEnd={(event) => {
                isFolderComposingRef.current = false;
                setFolderDraftName(event.currentTarget.value);
              }}
              onBlur={() => handleFolderRenameCommit(folder.id)}
              onKeyDown={(e) => {
                if (isFolderComposingRef.current) return;
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

        <main className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white/80 p-4">
          {!selectedNote ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-slate-500">
              <Folder size={24} />
              <div>노트를 선택하거나 새로 만들어 주세요.</div>
              {statusMessage ? <div className="text-xs text-emerald-600">{statusMessage}</div> : null}
            </div>
          ) : (
            <div className="flex h-full flex-col gap-5">
              <section className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {isEditing ? "편집 모드" : "상세 보기"}
                    </div>
                    {isEditing ? (
                      <input
                        value={draftTitle}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        onCompositionStart={() => {
                          isTitleComposingRef.current = true;
                        }}
                        onCompositionEnd={(event) => {
                          isTitleComposingRef.current = false;
                          setDraftTitle(event.currentTarget.value);
                        }}
                        className="w-full min-w-[240px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder="노트 제목"
                      />
                    ) : (
                      <div className="text-xl font-semibold text-slate-900">
                        {selectedNote.title || "제목 없는 노트"}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>생성 {formatDateTime(selectedNote.createdAt)}</span>
                      <span>수정 {formatDateTime(selectedNote.updatedAt)}</span>
                      <span>{attachmentCount ? `첨부 ${attachmentCount}개` : "첨부 없음"}</span>
                      <span>{linkedTodoIds.length ? `업무 ${linkedTodoIds.length}개` : "업무 연결 없음"}</span>
                    </div>
                    {isEditing ? (
                      <select
                        value={draftFolderId ?? ""}
                        onChange={(event) => setDraftFolderId(event.target.value || null)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">최상위</option>
                        {folders.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-xs text-slate-500">폴더: {selectedFolderName}</div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!isEditing ? (
                      <>
                        <button
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                          onClick={handleStartEdit}
                        >
                          <Pencil size={14} />
                          수정
                        </button>
                        <button
                          className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 hover:bg-rose-100"
                          onClick={handleDeleteNote}
                        >
                          <Trash2 size={14} />
                          삭제
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                          onClick={handleSaveEdit}
                        >
                          <Save size={14} />
                          저장
                        </button>
                        <button
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                          onClick={handleCancelEdit}
                        >
                          <X size={14} />
                          취소
                        </button>
                      </>
                    )}
                    <button
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                      onClick={handleExportPdf}
                    >
                      <Download size={14} />
                      PDF
                    </button>
                    {statusMessage ? <span className="text-xs text-emerald-600">{statusMessage}</span> : null}
                  </div>
                </div>
              </section>

              <div className="flex flex-col gap-4">
                <section className="flex min-h-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4">
                  {canEdit && editor ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2 text-xs text-slate-600">
                      <div className={toolbarGroupClass}>
                        <span className={toolbarLabelClass}>텍스트</span>
                        <span className={toolbarDividerClass} />
                        <button
                          className={toolbarButtonClass(editor.isActive("bold"))}
                          onClick={() => editor.chain().focus().toggleBold().run()}
                        >
                          굵게
                        </button>
                        <button
                          className={toolbarButtonClass(editor.isActive("italic"))}
                          onClick={() => editor.chain().focus().toggleItalic().run()}
                        >
                          기울임
                        </button>
                        <button
                          className={toolbarButtonClass(editor.isActive("strike"))}
                          onClick={() => editor.chain().focus().toggleStrike().run()}
                        >
                          취소선
                        </button>
                        <button className={toolbarButtonClass(editor.isActive("link"))} onClick={handleSetLink}>
                          링크
                        </button>
                        <button
                          className={toolbarButtonClass()}
                          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
                        >
                          초기화
                        </button>
                      </div>
                      <div className={toolbarGroupClass}>
                        <span className={toolbarLabelClass}>헤딩</span>
                        <span className={toolbarDividerClass} />
                        <button
                          className={toolbarButtonClass(editor.isActive("heading", { level: 1 }))}
                          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                        >
                          H1
                        </button>
                        <button
                          className={toolbarButtonClass(editor.isActive("heading", { level: 2 }))}
                          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        >
                          H2
                        </button>
                        <button
                          className={toolbarButtonClass(editor.isActive("heading", { level: 3 }))}
                          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                        >
                          H3
                        </button>
                      </div>
                      <div className={toolbarGroupClass}>
                        <span className={toolbarLabelClass}>목록</span>
                        <span className={toolbarDividerClass} />
                        <button
                          className={toolbarButtonClass(editor.isActive("bulletList"))}
                          onClick={() => editor.chain().focus().toggleBulletList().run()}
                        >
                          목록
                        </button>
                        <button
                          className={toolbarButtonClass(editor.isActive("orderedList"))}
                          onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        >
                          번호
                        </button>
                        <button
                          className={toolbarButtonClass(editor.isActive("taskList"))}
                          onClick={() => editor.chain().focus().toggleTaskList().run()}
                        >
                          체크
                        </button>
                      </div>
                      <div className={toolbarGroupClass}>
                        <span className={toolbarLabelClass}>블록</span>
                        <span className={toolbarDividerClass} />
                        <button
                          className={toolbarButtonClass(editor.isActive("blockquote"))}
                          onClick={() => editor.chain().focus().toggleBlockquote().run()}
                        >
                          인용
                        </button>
                        <button
                          className={toolbarButtonClass(editor.isActive("codeBlock"))}
                          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                        >
                          코드
                        </button>
                        <button
                          className={toolbarButtonClass()}
                          onClick={() => editor.chain().focus().setHorizontalRule().run()}
                        >
                          구분선
                        </button>
                      </div>
                      <div className={toolbarGroupClass}>
                        <span className={toolbarLabelClass}>정렬</span>
                        <span className={toolbarDividerClass} />
                        <button
                          className={toolbarButtonClass(editor.isActive({ textAlign: "left" }))}
                          onClick={() => editor.chain().focus().setTextAlign("left").run()}
                        >
                          좌
                        </button>
                        <button
                          className={toolbarButtonClass(editor.isActive({ textAlign: "center" }))}
                          onClick={() => editor.chain().focus().setTextAlign("center").run()}
                        >
                          중
                        </button>
                        <button
                          className={toolbarButtonClass(editor.isActive({ textAlign: "right" }))}
                          onClick={() => editor.chain().focus().setTextAlign("right").run()}
                        >
                          우
                        </button>
                      </div>
                      <div className={toolbarGroupClass}>
                        <span className={toolbarLabelClass}>표</span>
                        <span className={toolbarDividerClass} />
                        <button
                          className={toolbarButtonClass()}
                          onClick={() =>
                            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
                          }
                        >
                          표
                        </button>
                        <button
                          className={toolbarButtonClass()}
                          onClick={() => editor.chain().focus().addRowAfter().run()}
                          disabled={!editor.isActive("table")}
                        >
                          행+
                        </button>
                        <button
                          className={toolbarButtonClass()}
                          onClick={() => editor.chain().focus().addColumnAfter().run()}
                          disabled={!editor.isActive("table")}
                        >
                          열+
                        </button>
                        <button
                          className={toolbarButtonClass()}
                          onClick={() => editor.chain().focus().deleteTable().run()}
                          disabled={!editor.isActive("table")}
                        >
                          표 삭제
                        </button>
                      </div>
                      <div className={toolbarGroupClass}>
                        <span className={toolbarLabelClass}>확장</span>
                        <span className={toolbarDividerClass} />
                        <button
                          className={toolbarButtonClass()}
                          onClick={() => editor.chain().focus().insertContent({ type: "selectBlock" }).run()}
                        >
                          Select
                        </button>
                        <button
                          className={toolbarButtonClass()}
                          onClick={() => editor.chain().focus().insertContent({ type: "chartBlock" }).run()}
                        >
                          Chart
                        </button>
                        <button
                          className={toolbarButtonClass()}
                          onClick={() => editor.chain().focus().insertContent({ type: "calloutBlock" }).run()}
                        >
                          Callout
                        </button>
                        <button
                          className={toolbarButtonClass()}
                          onClick={() => editor.chain().focus().insertContent({ type: "layoutBlock" }).run()}
                        >
                          Layout
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {linkPromptOpen && canEdit ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-sm">
                      <div className="text-xs font-semibold text-slate-700">링크</div>
                      <input
                        className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                        placeholder="https://"
                        value={linkDraft}
                        onChange={(event) => setLinkDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleConfirmLink();
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            handleCancelLink();
                          }
                        }}
                        autoFocus
                      />
                      <div className="mt-1 text-[11px] text-slate-400">비워두면 링크가 제거됩니다.</div>
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
                          type="button"
                          onClick={handleCancelLink}
                        >
                          취소
                        </button>
                        <button
                          className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                          type="button"
                          onClick={handleConfirmLink}
                        >
                          적용
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {editor ? (
                    shouldRenderMarkdown ? (
                      <div className={`${editorBodyClass} markdown`}>
                        {markdownSource.trim() ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkInlineTokens]}>
                            {markdownSource}
                          </ReactMarkdown>
                        ) : (
                          <div className="text-sm text-slate-400">내용이 없습니다.</div>
                        )}
                      </div>
                    ) : (
                      <EditorContent editor={editor} className={`tiptap ${editorBodyClass}`} />
                    )
                  ) : (
                    <div className={`${editorBodyClass} text-sm text-slate-400`}>에디터를 불러오는 중...</div>
                  )}

                  {editor ? (
                    <FloatingMenu
                      editor={editor}
                      options={{ placement: "bottom-start" }}
                      shouldShow={({ editor: menuEditor }) => {
                        if (!isEditingRef.current) return false;
                        const { $from } = menuEditor.state.selection;
                        return $from.parent.type.name === "paragraph" && $from.parent.textContent === "/";
                      }}
                    >
                      <div className="flex w-52 flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-2 text-xs shadow-lg">
                        {slashMenuItems.map((item) => (
                          <button
                            key={item.label}
                            className="rounded-lg px-2 py-1 text-left hover:bg-slate-100"
                            onClick={() => runSlashCommand(item.action)}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </FloatingMenu>
                  ) : null}
                </section>

                <aside className="space-y-4">
                  {linkedTodos.length > 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="text-xs font-medium text-slate-700">연결된 업무</div>
                      <div className="mt-2 space-y-2">
                        {linkedTodos.map((todo) => (
                          <div key={todo.id} className="flex items-center gap-2">
                            <button
                              className="min-w-0 flex-1 truncate text-left text-sm text-slate-800"
                              onClick={() => onOpenTodo?.(todo.id)}
                            >
                              {todo.title || "제목 없는 업무"}
                            </button>
                            <button
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"
                              onClick={() => onOpenTodo?.(todo.id)}
                            >
                              열기
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-slate-700">첨부파일</div>
                      <button
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] disabled:opacity-40"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={!isEditing}
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
                      className={`mt-2 rounded-xl border border-dashed p-3 text-center text-xs ${isDragging ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-slate-50"}`}
                      onDragOver={(e) => {
                        if (!isEditing) return;
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        if (!isEditing) return;
                        e.preventDefault();
                        setIsDragging(false);
                        if (e.dataTransfer.files?.length) handleUploadFiles(e.dataTransfer.files);
                      }}
                    >
                      {isEditing
                        ? "파일을 끌어다 놓거나 업로드 버튼을 사용하세요."
                        : "편집 모드에서 업로드할 수 있습니다."}
                    </div>

                    {imageAttachments.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        <div className="text-[11px] font-medium text-slate-700">이미지</div>
                        <div className="grid grid-cols-1 gap-2">
                          {imageAttachments.map((att) => (
                            <div key={att.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                              <img
                                src={toAttachmentUrl(att.path)}
                                alt={att.name}
                                className="h-28 w-full object-cover"
                              />
                              <div className="flex items-center justify-between gap-2 p-2 text-[11px]">
                                <div className="min-w-0">
                                  <div className="truncate font-medium text-slate-700">{att.name}</div>
                                  <div className="text-[10px] text-slate-400">{formatFileSize(att.size)}</div>
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
                      <div className="mt-3 space-y-2">
                        <div className="text-[11px] font-medium text-slate-700">파일</div>
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
                                  <div className="truncate text-xs font-medium text-slate-800">{att.name}</div>
                                  <div className="text-[10px] text-slate-400">
                                    {formatFileSize(att.size)} · {fileKindLabel(att)}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] hover:bg-slate-50"
                                  onClick={() => hasFileBridge && window.api.files.open(att.path)}
                                >
                                  열기
                                </button>
                                <button
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] hover:bg-slate-50"
                                  onClick={() => handleDownloadAttachment(att)}
                                >
                                  다운로드
                                </button>
                                <button
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] hover:bg-slate-50"
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

                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-slate-700">업무 연결</div>
                      <div className="text-[11px] text-slate-400">
                        {linkedTodoIds.length ? `${linkedTodoIds.length}개 연결됨` : "연결 없음"}
                      </div>
                    </div>
                    <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2">
                      <div className="flex items-center gap-2">
                        <Link2 size={14} className="text-slate-400" />
                        <input
                          value={todoSearch}
                          onChange={(e) => setTodoSearch(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                          placeholder="업무 검색"
                        />
                      </div>
                      <div className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1 text-xs">
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
                                <span className="text-[11px] text-slate-400">{todo.date}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
                    업무 목록과 노트를 연결해 정리하세요.
                  </div>
                </aside>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
