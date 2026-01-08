import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  FileText,
  Inbox,
  Notebook,
  Plus,
  Search,
  Settings,
  Sparkles,
  Star,
  Users,
} from "lucide-react";

export default function Note() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_20%,_#fffaf2,_#f3eadf_55%,_#e9ddce)] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="w-64 shrink-0 border-r border-slate-200/70 bg-[#f1eadf] px-4 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-[11px] font-semibold tracking-wide">
              TDG
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">TODOONG'S</div>
              <div className="text-[11px] text-slate-500">Personal workspace</div>
            </div>
            <ChevronDown size={14} className="text-slate-500" />
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-400">
            <Search size={14} />
            Search
          </div>

          <div className="mt-4 space-y-1 text-sm">
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-600">
              <Inbox size={16} />
              Inbox
            </div>
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-600">
              <CalendarDays size={16} />
              Today
            </div>
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-600">
              <BookOpen size={16} />
              Calendar
            </div>
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-600">
              <Notebook size={16} />
              Notes
            </div>
          </div>

          <div className="mt-6">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Teamspace</div>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-slate-700 shadow-sm">
                <Users size={16} />
                TODOONG'S Home
              </div>
              <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-600">
                <FileText size={16} />
                Projects
              </div>
              <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-600">
                <Plus size={16} />
                Quick add
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Personal</div>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-600">
                <Star size={16} />
                Starred
              </div>
              <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-600">
                <FileText size={16} />
                My tasks
              </div>
              <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-600">
                <Notebook size={16} />
                Journal
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-slate-900/5 px-2 py-1.5 text-slate-900">
                <Sparkles size={16} />
                AI Note Lab @Today 5:43 PM
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">TODOONG Apps</div>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-600">
                <FileText size={16} />
                TODOONG Mail
              </div>
              <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-600">
                <CalendarDays size={16} />
                TODOONG Calendar
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-2 text-sm">
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-600">
              <Settings size={16} />
              Settings
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
              Invite teammates
              <div className="mt-1 text-slate-400">Start a space for your squad.</div>
            </div>
          </div>
        </aside>

        <main className="flex-1 bg-white/80 backdrop-blur">
          <div className="mx-auto flex w-full max-w-4xl flex-col px-10 pb-16 pt-10">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <Sparkles size={14} />
                AI Note Lab
              </div>
              <div className="flex items-center gap-3">
                <span>Editing</span>
                <span>Share</span>
                <Star size={14} className="text-slate-400" />
              </div>
            </div>

            <div className="mt-16 text-center">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                AI Note Lab
                <span className="ml-2 text-slate-400">@Today 5:43 PM</span>
              </h1>
            </div>

            <div className="mx-auto mt-10 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    Meeting
                  </span>
                  <span className="text-xs text-slate-400">@Today</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-400"
                  >
                    Start dictation
                  </button>
                  <ChevronDown size={14} className="text-slate-400" />
                </div>
              </div>

              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                    Memo
                  </span>
                  <span className="text-xs text-slate-400">TODOONG AI turns meetings into notes.</span>
                </div>
                <p className="text-xs text-slate-500">
                  Capture highlights, decisions, and next steps with a single click.
                </p>
                <p className="text-xs text-slate-400">
                  Starting this session grants consent to recording and summarization.
                </p>
              </div>

              <div className="mt-6 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white">
                    <Star size={12} />
                  </span>
                  <span>Smart prompts ready</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">Speaker 1</span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">Action items</span>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
