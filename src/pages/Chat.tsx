import React, { useMemo, useState } from "react";
import {
  Bell,
  ArrowLeft,
  Image as ImageIcon,
  Info,
  MessageCircle,
  Mic,
  Phone,
  Plus,
  Search,
  Send,
  Smile,
  Users,
  ShieldOff,
  Trash2,
  Video,
} from "lucide-react";
import { useAuth } from "../context/auth";

type TopTab = "friends" | "chat";
type ChatTab = "dm" | "group";
type ViewMode = "list" | "room";

export default function Chat() {
  const { user } = useAuth();
  const [topTab, setTopTab] = useState<TopTab>("chat");
  const [chatTab, setChatTab] = useState<ChatTab>("dm");
  const [view, setView] = useState<ViewMode>("list");

  const greeting = useMemo(() => (user ? `${user.name}님, 환영합니다.` : "게스트"), [user]);

  if (!user) {
    return (
      <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <MessageCircle size={22} />
        </div>
        <div className="mt-4 text-lg font-semibold text-slate-900">채팅</div>
        <p className="mt-2 text-sm text-slate-500">로그인 후 채팅 기능을 사용할 수 있어요.</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white/80 shadow-sm">
      {view === "list" ? (
        <aside className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-slate-200/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <Users size={20} />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">Todoongs 채팅</div>
                <div className="text-xs text-slate-500">{greeting}</div>
              </div>
            </div>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              aria-label="알림"
            >
              <Bell size={16} />
            </button>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setTopTab("friends")}
              className={[
                "flex-1 rounded-2xl px-3 py-2 text-sm font-semibold transition",
                topTab === "friends"
                  ? "border border-slate-200 bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              ].join(" ")}
            >
              친구
            </button>
            <button
              onClick={() => setTopTab("chat")}
              className={[
                "flex-1 rounded-2xl px-3 py-2 text-sm font-semibold transition",
                topTab === "chat"
                  ? "border border-slate-200 bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              ].join(" ")}
            >
              채팅
            </button>
          </div>
        </div>

        {topTab === "friends" ? (
          <FriendsPanel onOpenChat={() => setView("room")} />
        ) : (
          <ChatListPanel chatTab={chatTab} setChatTab={setChatTab} onOpenChat={() => setView("room")} />
        )}
      </aside>
      ) : (
        <main className="flex h-full flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 p-4">
          <div className="flex items-center gap-3">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              onClick={() => setView("list")}
              aria-label="목록으로"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <MessageCircle size={20} />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Debra Nguyen</div>
              <div className="text-xs text-emerald-600">온라인</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <IconButton label="음성 통화">
              <Phone size={16} />
            </IconButton>
            <IconButton label="영상 통화">
              <Video size={16} />
            </IconButton>
            <IconButton label="방 정보">
              <Info size={16} />
            </IconButton>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-auto p-4">
          <MessageIn text="오늘 일정은 어떻게 돼?" time="오후 9:15" />
          <MessageOut text="미팅 하나 끝나면 공유할게." time="오후 9:16" />
          <MessageIn text="좋아! 자료 보내주면 정리해둘게." time="오후 9:21" />
          <MessageOut text="고마워요 😊" time="오후 10:10" />
        </div>

        <div className="border-t border-slate-200/70 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <IconButton label="이모지">
              <Smile size={18} />
            </IconButton>
            <IconButton label="이미지">
              <ImageIcon size={18} />
            </IconButton>
            <IconButton label="음성">
              <Mic size={18} />
            </IconButton>
            <button className="flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50">
              <Plus size={16} />
              첨부
            </button>

            <input
              className="h-11 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-amber-200"
              placeholder="메시지를 입력하세요"
            />

            <button className="flex h-11 items-center gap-2 rounded-2xl bg-amber-500 px-4 text-sm font-semibold text-white hover:bg-amber-600">
              <Send size={16} />
              보내기
            </button>
          </div>

          <div className="mt-2 text-[11px] text-slate-400">
            Enter로 전송, Shift+Enter로 줄바꿈. 이모지와 첨부 기능은 추후 연결 예정입니다.
          </div>
        </div>
      </main>
      )}
    </div>
  );
}

function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function FriendsPanel({ onOpenChat }: { onOpenChat: () => void }) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="space-y-3 border-b border-slate-200/70 p-4">
        <div className="text-sm font-semibold text-slate-900">친구 목록</div>

        <div className="flex gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3">
            <Search size={16} className="text-slate-400" />
            <input
              className="h-11 flex-1 bg-transparent text-sm text-slate-700 outline-none"
              placeholder="이름으로 검색"
            />
          </div>
          <button className="flex h-11 items-center gap-1 rounded-2xl bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800">
            <Plus size={16} />
            추가
          </button>
        </div>

        <div className="text-xs text-slate-500">
          친구를 검색해 추가하거나 목록에서 삭제/차단할 수 있어요.
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-auto p-3">
        <FriendRow name="Carmen Myers" subtitle="온라인" onOpenChat={onOpenChat} />
        <FriendRow name="Enrique Perkins" subtitle="어제 접속" onOpenChat={onOpenChat} />
        <FriendRow name="Christina Pearson" subtitle="자리 비움" onOpenChat={onOpenChat} />
      </div>
    </div>
  );
}

function FriendRow({
  name,
  subtitle,
  onOpenChat,
}: {
  name: string;
  subtitle: string;
  onOpenChat: () => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:bg-slate-50"
      onClick={onOpenChat}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <Users size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-900">{name}</div>
        <div className="text-xs text-slate-500">{subtitle}</div>
      </div>
      <div className="flex items-center gap-2">
        <IconButton label="삭제">
          <Trash2 size={14} />
        </IconButton>
        <IconButton label="차단">
          <ShieldOff size={14} />
        </IconButton>
      </div>
    </button>
  );
}

function ChatListPanel({
  chatTab,
  setChatTab,
  onOpenChat,
}: {
  chatTab: ChatTab;
  setChatTab: (v: ChatTab) => void;
  onOpenChat: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="space-y-3 border-b border-slate-200/70 p-4">
        <div className="text-sm font-semibold text-slate-900">채팅 목록</div>

        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3">
          <Search size={16} className="text-slate-400" />
          <input
            className="h-11 flex-1 bg-transparent text-sm text-slate-700 outline-none"
            placeholder="채팅 검색"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setChatTab("dm")}
            className={[
              "flex-1 rounded-2xl px-3 py-2 text-sm font-semibold transition",
              chatTab === "dm"
                ? "border border-slate-200 bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            ].join(" ")}
          >
            개인
          </button>
          <button
            onClick={() => setChatTab("group")}
            className={[
              "flex-1 rounded-2xl px-3 py-2 text-sm font-semibold transition",
              chatTab === "group"
                ? "border border-slate-200 bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            ].join(" ")}
          >
            그룹
          </button>
        </div>

        <div className="text-xs text-slate-500">개인/그룹 채팅을 선택해 대화를 시작하세요.</div>
      </div>

      <div className="flex-1 space-y-2 overflow-auto p-3">
        <ThreadRow
          active
          name="Debra Nguyen"
          preview="오늘 일정 어때? 바로 공유해줘."
          time="9:41"
          badge="2"
          onOpenChat={onOpenChat}
        />
        <ThreadRow name="Judy Kuhn" preview="아이디어가 좋아 보여요." time="어제" onOpenChat={onOpenChat} />
        <ThreadRow name="Byron Kuhn" preview="사용자에 따라 분기해야 해요." time="어제" onOpenChat={onOpenChat} />
      </div>
    </div>
  );
}

function ThreadRow({
  active,
  name,
  preview,
  time,
  badge,
  onOpenChat,
}: {
  active?: boolean;
  name: string;
  preview: string;
  time: string;
  badge?: string;
  onOpenChat: () => void;
}) {
  return (
    <button
      onClick={onOpenChat}
      className={[
        "flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition",
        active ? "ring-2 ring-amber-100" : "hover:bg-slate-50",
      ].join(" ")}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
        <MessageCircle size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-sm font-medium text-slate-900">{name}</div>
          <div className="text-xs text-slate-400">{time}</div>
        </div>
        <div className="truncate text-sm text-slate-500">{preview}</div>
      </div>
      {badge ? (
        <div className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
          {badge}
        </div>
      ) : null}
    </button>
  );
}

function MessageIn({ text, time }: { text: string; time: string }) {
  return (
    <div className="flex max-w-[78%] flex-col items-start">
      <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        {text}
      </div>
      <div className="mt-1 text-[11px] text-slate-400">{time}</div>
    </div>
  );
}

function MessageOut({ text, time }: { text: string; time: string }) {
  return (
    <div className="ml-auto flex max-w-[78%] flex-col items-end">
      <div className="rounded-3xl border border-amber-200 bg-amber-100 px-4 py-3 text-sm text-amber-900">
        {text}
      </div>
      <div className="mt-1 text-[11px] text-slate-400">{time}</div>
    </div>
  );
}
