import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, type TodoStatus } from "../App";

export type TodoSummary = {
  id: string;
  title: string;
  status: TodoStatus;
  date: string;
  order: number;
  createdAt: string;
  updatedAt: string;
};

const STATUS_META: Record<TodoStatus, { label: string; badge: string }> = {
  TODO: { label: "할 일", badge: "bg-amber-50 text-amber-800 border-amber-200" },
  IN_PROGRESS: { label: "진행 중", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  BLOCKED: { label: "막힘", badge: "bg-rose-50 text-rose-700 border-rose-200" },
  DONE: { label: "완료", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};
const dayNames = ["일", "월", "화", "수", "목", "금", "토"];

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
export function addMonths(date: Date, diff: number) {
  return new Date(date.getFullYear(), date.getMonth() + diff, 1);
}
function dayLabel(date: Date) {
  return dayNames[date.getDay()];
}


const pad2 = (n: number) => String(n).padStart(2, "0");
const toYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const nowIso = () => new Date().toISOString();
const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;


export default function Calendar({
  month,
  selectedDate,
  todosByDate,
  onPickDate,
  onPrevMonth,
  onNextMonth,
}: {
  month: Date;
  selectedDate: string;
  todosByDate: Map<string, TodoSummary[]>;
  onPickDate: (ymd: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const first = startOfMonth(month);
  const last = endOfMonth(month);

  const startPad = first.getDay();
  const totalDays = last.getDate();

  const cells: Array<{ ymd: string; day: number; inMonth: boolean }> = [];

  for (let i = 0; i < startPad; i++) {
    const d = new Date(first);
    d.setDate(d.getDate() - (startPad - i));
    cells.push({ ymd: toYMD(d), day: d.getDate(), inMonth: false });
  }
  for (let day = 1; day <= totalDays; day++) {
    const d = new Date(first.getFullYear(), first.getMonth(), day);
    cells.push({ ymd: toYMD(d), day, inMonth: true });
  }
  while (cells.length < 42) {
    const d = new Date(last);
    d.setDate(d.getDate() + (cells.length - (startPad + totalDays) + 1));
    cells.push({ ymd: toYMD(d), day: d.getDate(), inMonth: false });
  }

  const monthTitle = `${month.getFullYear()}-${pad2(month.getMonth() + 1)}`;

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">캘린더</div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm hover:bg-slate-50"
            onClick={onPrevMonth}
          >
            <ChevronLeft size={16} />
          </button>
          <div className="min-w-[90px] text-center text-sm font-medium text-slate-700">{monthTitle}</div>
          <button
            className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm hover:bg-slate-50"
            onClick={onNextMonth}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 text-xs text-slate-500">
        {dayNames.map((w) => (
          <div key={w} className="px-2 py-1 text-center font-medium">
            {w}
          </div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-2">
        {cells.map((c) => {
          const list = todosByDate.get(c.ymd) ?? [];
          const top = list
            .slice()
            .sort((a, b) => a.order - b.order)
            .slice(0, 3);

          const isSelected = c.ymd === selectedDate;
          const isToday = c.ymd === toYMD(new Date());
          const isSunday = dayLabel(new Date(c.ymd)) === "일";
          const isSaturday = dayLabel(new Date(c.ymd)) === "토";

          return (
            <button
              key={c.ymd}
              onClick={() => onPickDate(c.ymd)}
              className={cn(
                "rounded-xl border p-2 text-left transition",
                c.inMonth ? "border-slate-200 bg-white hover:bg-slate-50" : "border-slate-100 bg-slate-50/60",
                isSelected && "ring-2 ring-slate-300",
                isToday && "border-slate-300",
              )}
              title={`${c.ymd} (${dayLabel(new Date(c.ymd))})`}
            >
              <div
                className={cn(
                  "flex items-center justify-between text-xs",
                  c.inMonth ? "text-slate-700" : "text-slate-400"
                )}
              >
                <span className={`font-medium ${c.inMonth && isSunday && "text-rose-600"} ${c.inMonth && isSaturday && "text-blue-600"}`}>{c.day}</span>
                <span className="text-[10px] text-slate-400">{list.length ? `${list.length}건` : ""}</span>
              </div>

              <div className="mt-2 space-y-1">
                {top.map((t) => (
                  <div
                    key={t.id}
                    className={cn("truncate rounded-lg border px-2 py-1 text-[11px]", STATUS_META[t.status].badge)}
                    title={t.title}
                  >
                    {t.title || "제목 없음"}
                  </div>
                ))}
                {list.length > 3 && <div className="text-[11px] text-slate-400">+ {list.length - 3}건</div>}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 text-xs text-slate-500">날짜를 클릭하면 해당 목록으로 이동합니다.</div>
    </div>
  );
}