import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EmojiPicker, { type EmojiClickData } from "emoji-picker-react";
import {
  ArrowLeft,
  Bell,
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
  Pin,
  PinOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useAuth } from "../context/auth";
import { useChatSocket } from "../context/chatSocket";
import {
  createChatApi,
  type ChatAttachmentResponse,
  type ChatMessageResponse,
  type ChatNotificationEvent,
  type ChatRoomSummaryResponse,
  type FriendResponse,
  type PresenceEvent,
  type ReadReceiptEvent,
  type UserSummaryResponse,
} from "../api/chat";
import { API_BASE, createApiRequester } from "../api/http";

type TopTab = "friends" | "chat";
type ChatTab = "dm" | "group";
type ViewMode = "list" | "room";

const APP_ICON_URL = new URL("../assets/logo.png", import.meta.url).toString();
const CHAT_FILE_BASE = API_BASE;

function formatTime(iso: string | null | undefined) {
  if (!iso) return "";

  // Z 없으면 UTC로 간주
  const normalized = iso.endsWith("Z") ? iso : iso + "Z";
  const date = new Date(normalized);

  return date.toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}


function formatDate(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

function orderRooms(rooms: ChatRoomSummaryResponse[]) {
  return [...rooms].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return bTime - aTime;
  });
}

function roomDisplayName(room: ChatRoomSummaryResponse, meId: string) {
  if (room.type === "GROUP") return room.name || "그룹 채팅";
  const other = room.members.find((m) => m.userId !== meId);
  return other?.name || "DM";
}

export default function Chat() {
  const { user, token, refreshToken, refreshTokens, logout } = useAuth();
  const { connected, send, subscribe } = useChatSocket();
  const apiClient = useMemo(
    () =>
      token
        ? createApiRequester({
          getAccessToken: () => token,
          getRefreshToken: () => refreshToken,
          refreshTokens,
          onLogout: logout,
        })
        : null,
    [token, refreshToken, refreshTokens, logout]
  );
  const chatApi = useMemo(() => {
    if (!apiClient) return null;
    return createChatApi(apiClient);
  }, [apiClient]);
  const notify = useCallback((title: string, options: NotificationOptions) => {
    console.log(Notification);
    console.log(Notification.permission);

    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => undefined);
      return;
    }
    if (Notification.permission === "granted") {
      new Notification(title, options);
    }
  }, []);
  const [topTab, setTopTab] = useState<TopTab>("chat");
  const [chatTab, setChatTab] = useState<ChatTab>("dm");
  const [view, setView] = useState<ViewMode>("list");
  const [friends, setFriends] = useState<FriendResponse[]>([]);
  const [rooms, setRooms] = useState<ChatRoomSummaryResponse[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageResponse[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<UserSummaryResponse[]>([]);
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [messageText, setMessageText] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachmentResponse[]>([]);
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ src: string; name: string } | null>(null);
  const [userNotifications, setUserNotifications] = useState(user?.notificationsEnabled ?? true);
  const [groupNameOpen, setGroupNameOpen] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState("새 그룹");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  const greeting = useMemo(
    () => (user ? `${user.name}님, 환영합니다.` : "게스트"),
    [user]
  );

  const activeRoom = useMemo(
    () => rooms.find((room) => room.roomId === activeRoomId) || null,
    [rooms, activeRoomId]
  );

  const refreshRooms = useCallback(() => {
    if (!chatApi) return;
    chatApi
      .listRooms()
      .then(setRooms)
      .catch(() => undefined);
  }, [chatApi]);

  useEffect(() => {
    setUserNotifications(user?.notificationsEnabled ?? true);
  }, [user]);

  useEffect(() => {
    if (!chatApi) return;
    refreshRooms();
    chatApi.listFriends().then(setFriends).catch(() => undefined);
  }, [token, refreshRooms]);

  useEffect(() => {
    if (!chatApi) return;
    if (!searchKeyword.trim()) {
      setSearchResults([]);
      return;
    }
    const handler = window.setTimeout(() => {
      chatApi.searchUsers(searchKeyword).then(setSearchResults).catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(handler);
  }, [searchKeyword, token]);

  useEffect(() => {
    if (!user) return undefined;
    return subscribe(`/topic/presence/${user.userId}`, (payload: PresenceEvent) => {
      setFriends((prev) =>
        prev.map((friend) =>
          friend.userId === payload.userId ? { ...friend, online: payload.online } : friend
        )
      );
    });
  }, [subscribe, user]);

  useEffect(() => {
    if (!user) return undefined;
    return subscribe(`/topic/notifications/${user.userId}`, (payload: ChatNotificationEvent) => {
      const inRoom = payload.roomId === activeRoomId && view === "room";
      if (inRoom) return;
      notify("새로운 메시지", {
        body: `${payload.senderName}: ${payload.preview}`,
        icon: APP_ICON_URL,
      });
    });
  }, [subscribe, user, activeRoomId, view, notify]);

  useEffect(() => {
    if (!activeRoomId) return;
    const unsubMessage = subscribe(`/topic/rooms/${activeRoomId}`, (payload: ChatMessageResponse) => {
      setMessages((prev) => {
        const next = [...prev, payload];
        next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return next;
      });

      setRooms((prev) =>
        prev.map((room) => {
          if (room.roomId !== payload.roomId) return room;
          const isSelf = payload.senderId === user?.userId;
          const active = payload.roomId === activeRoomId && view === "room";
          return {
            ...room,
            lastMessage: payload.content || payload.type,
            lastMessageType: payload.type,
            lastMessageAt: payload.createdAt,
            unreadCount: !active && !isSelf ? room.unreadCount + 1 : room.unreadCount,
          };
        })
      );

      if (payload.roomId === activeRoomId && payload.senderId !== user?.userId) {
        sendRead([payload.messageId]);
      }
    });

    const unsubReads = subscribe(`/topic/rooms/${activeRoomId}/reads`, (payload: ReadReceiptEvent) => {
      if (!payload.messageIds?.length) return;
      setMessages((prev) =>
        prev.map((message) => {
          if (!payload.messageIds.includes(message.messageId)) return message;
          const updated = new Set(message.readUserIds ?? []);
          updated.add(payload.readerId);
          return { ...message, readUserIds: Array.from(updated) };
        })
      );
    });

    return () => {
      unsubMessage();
      unsubReads();
    };
  }, [activeRoomId, send, subscribe, user, view]);

  useEffect(() => {
    if (!activeRoomId || !user) return;
    if (!chatApi) return;
    chatApi.listMessages(activeRoomId, 60)
      .then((items) => {
        const sorted = [...items].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        setMessages(sorted);
        const unreadIds = sorted
          .filter((msg) => msg.senderId !== user.userId && !msg.readUserIds?.includes(user.userId))
          .map((msg) => msg.messageId);
        if (unreadIds.length) sendRead(unreadIds);
      })
      .catch(() => undefined);
  }, [activeRoomId, token, user]);

  const scrollToBottom = useCallback(() => {
    if (!messageListRef.current) return;
    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, []);

  useEffect(() => {
    if (view === "room") {
      scrollToBottom();
    }
  }, [messages.length, scrollToBottom, view]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImagePreview(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const sendRead = useCallback(
    (messageIds: string[]) => {
      if (!activeRoomId || !messageIds.length) return;
      const payload = { roomId: activeRoomId, messageIds };
      if (connected) {
        send("/app/chat.read", payload);
      } else if (chatApi) {
        chatApi.sendMessage({ ...payload, type: "TEXT" }).catch(() => undefined);
      }
    },
    [activeRoomId, connected, send, token]
  );

  const openRoom = useCallback(
    (roomId: string) => {
      setActiveRoomId(roomId);
      setView("room");
      setRooms((prev) =>
        prev.map((room) => (room.roomId === roomId ? { ...room, unreadCount: 0 } : room))
      );
    },
    []
  );

  const handleCreateDm = useCallback(
    async (friendId: string) => {
      if (!token) return;
      if (!chatApi) return;
      const room = await chatApi.createDm(friendId);
      setRooms((prev) => {
        const exists = prev.some((r) => r.roomId === room.roomId);
        return exists ? prev : [room, ...prev];
      });
      openRoom(room.roomId);
      refreshRooms();
    },
    [openRoom, token]
  );

  const handleCreateGroup = useCallback(() => {
    if (!token || groupMembers.length === 0) return;
    setGroupNameDraft("새 그룹");
    setGroupNameOpen(true);
  }, [groupMembers.length, token]);

  const handleConfirmCreateGroup = useCallback(async () => {
    if (!token || groupMembers.length === 0) return;
    if (!chatApi) return;
    const name = groupNameDraft.trim();
    if (!name) return;
    const room = await chatApi.createGroup(name, groupMembers);
    setRooms((prev) => [room, ...prev]);
    setGroupMembers([]);
    openRoom(room.roomId);
    refreshRooms();
    setGroupNameOpen(false);
  }, [chatApi, groupMembers, groupNameDraft, openRoom, refreshRooms, token]);

  const handleCancelCreateGroup = useCallback(() => {
    setGroupNameOpen(false);
  }, []);

  const handleTogglePin = useCallback(
    async (room: ChatRoomSummaryResponse) => {
      if (!token) return;
      if (!chatApi) return;
      await chatApi.updateRoomPin(room.roomId, !room.pinned);
      setRooms((prev) =>
        prev.map((r) => (r.roomId === room.roomId ? { ...r, pinned: !r.pinned } : r))
      );
    },
    [token]
  );

  const handleToggleRoomNotifications = useCallback(
    async (room: ChatRoomSummaryResponse) => {
      if (!token) return;
      if (!chatApi) return;
      await chatApi.updateRoomNotifications(room.roomId, !room.notificationsEnabled);
      setRooms((prev) =>
        prev.map((r) =>
          r.roomId === room.roomId ? { ...r, notificationsEnabled: !r.notificationsEnabled } : r
        )
      );
    },
    [token]
  );

  const handleToggleUserNotifications = useCallback(async () => {
    if (!chatApi) return;
    const next = !userNotifications;
    await chatApi.updateUserNotifications(next);
    setUserNotifications(next);
  }, [token, userNotifications]);

  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!token || !files?.length) return;
      setUploading(true);
      try {
        const uploaded: ChatAttachmentResponse[] = [];
        for (const file of Array.from(files)) {
          if (!chatApi) continue;
          const result = await chatApi.uploadChatFile(file);
          if (result) uploaded.push(result);
        }
        setAttachments((prev) => [...prev, ...uploaded]);
      } finally {
        setUploading(false);
      }
    },
    [token]
  );

  const handleEmojiPick = useCallback((emojiData: EmojiClickData) => {
    setMessageText((prev) => `${prev}${emojiData.emoji}`);
    setShowEmojiPicker(false);
  }, []);

  const handleSend = useCallback(async () => {
    if (!activeRoomId || !token) return;
    if (!messageText.trim() && attachments.length === 0) return;

    const payload = {
      roomId: activeRoomId,
      type: attachments.length ? "FILE" : "TEXT",
      content: messageText.trim() || null,
      payload: null,
      attachmentIds: attachments.map((att) => att.attachmentId),
    };

    if (connected) {
      send("/app/chat.send", payload);
    } else {
      if (!chatApi) return;
      await chatApi.sendMessage(payload);
    }

    setMessageText("");
    setAttachments([]);
    setShowEmojiPicker(false);
  }, [activeRoomId, attachments, connected, messageText, send, token]);

  const sortedRooms = useMemo(() => orderRooms(rooms), [rooms]);
  const filteredRooms = useMemo(
    () => sortedRooms.filter((room) => (chatTab === "dm" ? room.type === "DM" : room.type === "GROUP")),
    [sortedRooms, chatTab]
  );

  if (!user) {
    return (
      <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <MessageCircle size={22} />
        </div>
        <div className="mt-4 text-lg font-semibold text-slate-900">채팅</div>
        <p className="mt-2 text-sm text-slate-500">로그인 후 채팅 기능을 사용할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-3xl border border-slate-200/70 bg-white/80 shadow-sm">
      {groupNameOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              handleCancelCreateGroup();
            }
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
            <div className="text-sm font-semibold text-slate-900">그룹 채팅 만들기</div>
            <div className="mt-1 text-xs text-slate-500">그룹 채팅 이름을 입력하세요.</div>
            <input
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={groupNameDraft}
              onChange={(event) => setGroupNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleConfirmCreateGroup();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  handleCancelCreateGroup();
                }
              }}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
                type="button"
                onClick={handleCancelCreateGroup}
              >
                취소
              </button>
              <button
                className="rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                type="button"
                onClick={() => void handleConfirmCreateGroup()}
                disabled={!groupNameDraft.trim() || groupMembers.length === 0}
              >
                만들기
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {imagePreview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setImagePreview(null);
            }
          }}
        >
          <div className="max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <img
              src={imagePreview.src}
              alt={imagePreview.name}
              className="max-h-[90vh] max-w-[90vw] object-contain"
            />
          </div>
        </div>
      ) : null}
      {view === "list" ? (
        <aside className="flex h-full min-h-0 flex-col overflow-hidden">
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
                onClick={() => void handleToggleUserNotifications()}
                title={userNotifications ? "알림 끄기" : "알림 켜기"}
              >
                {userNotifications ? <Bell size={16} /> : <Bell size={16} className="opacity-40" />}
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
            <FriendsPanel
              friends={friends}
              searchKeyword={searchKeyword}
              onSearchChange={setSearchKeyword}
              results={searchResults}
              onAddFriend={async (friendId) => {
                if (!token || !friendId || !chatApi) return;
                const added = await chatApi.addFriend(friendId);
                setFriends((prev) => {
                  const exists = prev.some((f) => f.userId === added.userId);
                  return exists ? prev : [added, ...prev];
                });
                refreshRooms();
              }}
              onRemoveFriend={async (friendId) => {
                if (!token || !chatApi) return;
                await chatApi.removeFriend(friendId);
                setFriends((prev) => prev.filter((friend) => friend.userId !== friendId));
              }}
              onBlockFriend={async (friendId) => {
                if (!token || !chatApi) return;
                await chatApi.blockFriend(friendId);
                setFriends((prev) =>
                  prev.map((friend) =>
                    friend.userId === friendId ? { ...friend, status: "BLOCKED" } : friend
                  )
                );
              }}
              onOpenChat={(friendId) => void handleCreateDm(friendId)}
            />
          ) : (
            <ChatListPanel
              chatTab={chatTab}
              setChatTab={setChatTab}
              rooms={filteredRooms}
              userId={user.userId}
              onOpenChat={(roomId) => openRoom(roomId)}
              onTogglePin={handleTogglePin}
              onToggleNotifications={handleToggleRoomNotifications}
              friends={friends}
              groupMembers={groupMembers}
              setGroupMembers={setGroupMembers}
              onCreateGroup={handleCreateGroup}
            />
          )}
        </aside>
      ) : (
        <main className="flex h-full min-h-0 flex-col overflow-hidden">
          <header className="flex items-center justify-between gap-3 border-b border-slate-200/70 p-4">
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
                <div className="text-sm font-semibold text-slate-900">
                  {activeRoom ? roomDisplayName(activeRoom, user.userId) : "채팅"}
                </div>
                <div className="text-xs text-emerald-600">
                  {activeRoom?.type === "GROUP" ? `${activeRoom.members.length}명` : "1:1 채팅"}
                </div>
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
          </header>

          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div
              ref={messageListRef}
              className="flex-1 min-h-0 overflow-y-auto px-4 py-4"
            >
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  아직 메시지가 없습니다.
                </div>
              ) : (
                <div className="flex flex-col gap-3 overflow-auto">
                  {messages.map((message) =>
                    message.senderId === user.userId ? (
                      <MessageOut
                        key={message.messageId}
                        message={message}
                        room={activeRoom}
                        onImageClick={(src, name) => setImagePreview({ src, name })}
                      />
                    ) : (
                      <MessageIn
                        key={message.messageId}
                        message={message}
                        onImageClick={(src, name) => setImagePreview({ src, name })}
                      />
                    )
                  )}
                </div>
              )}
            </div>
          </div>
          <footer className="relative shrink-0 border-t border-slate-200/70 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <IconButton label="이모지" onClick={() => setShowEmojiPicker((prev) => !prev)}>
                <Smile size={18} />
              </IconButton>
              <IconButton label="이미지">
                <ImageIcon size={18} />
              </IconButton>
              <IconButton label="녹음 파일">
                <Mic size={18} />
              </IconButton>
              <button
                className="flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50"
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus size={16} />
                첨부
              </button>

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                onChange={(event) => {
                  void handleUpload(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
              <input
                ref={audioInputRef}
                type="file"
                className="hidden"
                accept="audio/*"
                onChange={(event) => {
                  void handleUpload(event.target.files);
                  event.currentTarget.value = "";
                }}
              />

              <input
                className="h-11 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-amber-200"
                placeholder="메시지를 입력하세요."
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
              />

              <button
                className="flex h-11 items-center gap-2 rounded-2xl bg-amber-500 px-4 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                onClick={() => void handleSend()}
                disabled={uploading}
              >
                <Send size={16} />
                보내기
              </button>
            </div>

            {showEmojiPicker ? (
              <div className="absolute bottom-full left-0 z-20 mb-3 rounded-2xl border border-slate-200 bg-white shadow-lg">
                <EmojiPicker
                  height={360}
                  width={320}
                  onEmojiClick={handleEmojiPick}
                />
              </div>
            ) : null}

            {attachments.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                {attachments.map((att) => (
                  <span key={att.attachmentId} className="rounded-full border border-slate-200 bg-white px-3 py-1">
                    {att.name}
                  </span>
                ))}
              </div>
            ) : null}
          </footer>
        </main>
      )}
    </div>
  );
}

function IconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      aria-label={label}
      title={label}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function FriendsPanel({
  friends,
  searchKeyword,
  onSearchChange,
  results,
  onAddFriend,
  onRemoveFriend,
  onBlockFriend,
  onOpenChat,
}: {
  friends: FriendResponse[];
  searchKeyword: string;
  onSearchChange: (v: string) => void;
  results: UserSummaryResponse[];
  onAddFriend: (id: string) => void;
  onRemoveFriend: (id: string) => void;
  onBlockFriend: (id: string) => void;
  onOpenChat: (id: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="space-y-3 border-b border-slate-200/70 p-4">
        <div className="text-sm font-semibold text-slate-900">친구 목록</div>

        <div className="flex gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3">
            <Search size={16} className="text-slate-400" />
            <input
              className="h-11 flex-1 bg-transparent text-sm text-slate-700 outline-none"
              placeholder="이름이나 이메일로 검색"
              value={searchKeyword}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
          <button className="flex h-11 items-center gap-1 rounded-2xl bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800">
            <Plus size={16} />
            검색
          </button>
        </div>

        {results.length > 0 ? (
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
            {results.map((result) => (
              <div key={result.userId} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-800">{result.name}</div>
                  <div className="truncate text-[11px] text-slate-500">{result.email}</div>
                </div>
                <button
                  className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                  onClick={() => onAddFriend(result.userId)}
                >
                  추가
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="text-xs text-slate-500">
          친구를 검색해 추가하거나, 친구 목록에서 삭제/차단할 수 있습니다.
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-auto p-3">
        {friends.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
            아직 친구가 없습니다.
          </div>
        ) : (
          friends.map((friend) => (
            <FriendRow
              key={friend.userId}
              friend={friend}
              onOpenChat={() => onOpenChat(friend.userId)}
              onRemove={() => onRemoveFriend(friend.userId)}
              onBlock={() => onBlockFriend(friend.userId)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function FriendRow({
  friend,
  onOpenChat,
  onRemove,
  onBlock,
}: {
  friend: FriendResponse;
  onOpenChat: () => void;
  onRemove: () => void;
  onBlock: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-200"
      onClick={onOpenChat}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenChat();
        }
      }}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <Users size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-slate-900">{friend.name}</div>
          <span
            className={[
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              friend.online ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
            ].join(" ")}
          >
            {friend.online ? "온라인" : "오프라인"}
          </span>
        </div>
        <div className="text-xs text-slate-500">
          {friend.status === "BLOCKED" ? "차단됨" : "친구"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <IconButton label="삭제">
          <Trash2
            size={14}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
          />
        </IconButton>
        <IconButton label="차단">
          <ShieldOff
            size={14}
            onClick={(event) => {
              event.stopPropagation();
              onBlock();
            }}
          />
        </IconButton>
      </div>
    </div>
  );
}

function ChatListPanel({
  chatTab,
  setChatTab,
  rooms,
  userId,
  onOpenChat,
  onTogglePin,
  onToggleNotifications,
  friends,
  groupMembers,
  setGroupMembers,
  onCreateGroup,
}: {
  chatTab: ChatTab;
  setChatTab: (v: ChatTab) => void;
  rooms: ChatRoomSummaryResponse[];
  userId: string;
  onOpenChat: (roomId: string) => void;
  onTogglePin: (room: ChatRoomSummaryResponse) => void;
  onToggleNotifications: (room: ChatRoomSummaryResponse) => void;
  friends: FriendResponse[];
  groupMembers: string[];
  setGroupMembers: (ids: string[]) => void;
  onCreateGroup: () => void;
}) {
  const [roomSearch, setRoomSearch] = useState("");

  const filteredRooms = useMemo(() => {
    if (!roomSearch.trim()) return rooms;
    return rooms.filter((room) =>
      roomDisplayName(room, userId).toLowerCase().includes(roomSearch.toLowerCase())
    );
  }, [roomSearch, rooms, userId]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="space-y-3 border-b border-slate-200/70 p-4">
        <div className="text-sm font-semibold text-slate-900">채팅 목록</div>

        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3">
          <Search size={16} className="text-slate-400" />
          <input
            className="h-11 flex-1 bg-transparent text-sm text-slate-700 outline-none"
            placeholder="채팅 검색"
            value={roomSearch}
            onChange={(event) => setRoomSearch(event.target.value)}
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

        {chatTab === "group" ? (
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
            <div className="text-xs font-semibold text-slate-800">그룹 만들기</div>
            <div className="max-h-36 space-y-2 overflow-auto">
              {friends.length === 0 ? (
                <div className="text-[11px] text-slate-400">선택할 친구가 없습니다.</div>
              ) : (
                friends.map((friend) => (
                  <label key={friend.userId} className="flex items-center gap-2 text-[11px] text-slate-600">
                    <input
                      type="checkbox"
                      checked={groupMembers.includes(friend.userId)}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...groupMembers, friend.userId]
                          : groupMembers.filter((id) => id !== friend.userId);
                        setGroupMembers(next);
                      }}
                    />
                    <span className="truncate">{friend.name}</span>
                  </label>
                ))
              )}
            </div>
            <button
              className="w-full rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              onClick={onCreateGroup}
              disabled={groupMembers.length === 0}
            >
              그룹 만들기
            </button>
          </div>
        ) : (
          <div className="text-xs text-slate-500">개인/그룹 채팅을 선택해 시작하세요.</div>
        )}
      </div>

      <div className="flex-1 space-y-2 overflow-auto p-3">
        {filteredRooms.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
            아직 채팅방이 없습니다.
          </div>
        ) : (
          filteredRooms.map((room) => (
            <ThreadRow
              key={room.roomId}
              room={room}
              userId={userId}
              onOpenChat={() => onOpenChat(room.roomId)}
              onTogglePin={() => onTogglePin(room)}
              onToggleNotifications={() => onToggleNotifications(room)}
            />
          ))
        )}
      </div>
    </div>
  );
}
function ThreadRow({
  room,
  userId,
  onOpenChat,
  onTogglePin,
  onToggleNotifications,
}: {
  room: ChatRoomSummaryResponse;
  userId: string;
  onOpenChat: () => void;
  onTogglePin: () => void;
  onToggleNotifications: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenChat}
      onKeyDown={(e) => {
        // 키보드 접근성(Enter/Space로 클릭)
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenChat();
        }
      }}
      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:bg-slate-50"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
        <MessageCircle size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-sm font-medium text-slate-900">
            {roomDisplayName(room, userId)}
          </div>
          <div className="text-xs text-slate-400">
            {room.lastMessageAt ? formatTime(room.lastMessageAt) : ""}
          </div>
        </div>

        <div className="truncate text-sm text-slate-500">
          {room.lastMessage ?? "대화가 없습니다."}
        </div>

        {room.lastMessageAt ? (
          <div className="text-[10px] text-slate-400">{formatDate(room.lastMessageAt)}</div>
        ) : null}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleNotifications();
          }}
          title={room.notificationsEnabled ? "알림 끄기" : "알림 켜기"}
        >
          {room.notificationsEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>

        <button
          type="button"
          className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onTogglePin();
          }}
          title={room.pinned ? "고정 해제" : "상단 고정"}
        >
          {room.pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>

        {room.unreadCount > 0 ? (
          <div className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
            {room.unreadCount}
          </div>
        ) : null}
      </div>
    </div>
  );
}


function MessageIn({
  message,
  onImageClick,
}: {
  message: ChatMessageResponse;
  onImageClick?: (src: string, name: string) => void;
}) {
  return (
    <div className="flex max-w-[78%] flex-col items-start">
      <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <div className="text-[11px] font-semibold text-slate-500">{message.senderName}</div>
        {message.content ? <div className="mt-1">{message.content}</div> : null}
        <AttachmentList attachments={message.attachments} onImageClick={onImageClick} />
      </div>
      <div className="mt-1 text-[11px] text-slate-400">{formatTime(message.createdAt)}</div>
    </div>
  );
}

function MessageOut({
  message,
  room,
  onImageClick,
}: {
  message: ChatMessageResponse;
  room: ChatRoomSummaryResponse | null;
  onImageClick?: (src: string, name: string) => void;
}) {
  const readCount = message.readUserIds?.length ?? 0;
  const memberCount = room?.members.length ?? 1;
  const isRead = memberCount > 1 && readCount >= memberCount - 1;

  return (
    <div className="ml-auto flex max-w-[78%] flex-col items-end">
      <div className="rounded-3xl border border-amber-200 bg-amber-100 px-4 py-3 text-sm text-amber-900">
        {message.content ? <div>{message.content}</div> : null}
        <AttachmentList attachments={message.attachments} onImageClick={onImageClick} />
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
        <span>{formatTime(message.createdAt)}</span>
        {memberCount > 1 ? <span>{isRead ? "읽음" : "전송됨"}</span> : null}
      </div>
    </div>
  );
}

function AttachmentList({
  attachments,
  onImageClick,
}: {
  attachments: ChatAttachmentResponse[];
  onImageClick?: (src: string, name: string) => void;
}) {
  if (!attachments?.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {attachments.map((att) => {
        if (att.type === "IMAGE") {
          const src = `${CHAT_FILE_BASE}${att.url}`;
          return (
            <img
              key={att.attachmentId}
              src={src}
              alt={att.name}
              className="max-h-40 cursor-zoom-in rounded-2xl border border-slate-200 object-cover"
              onClick={() => onImageClick?.(src, att.name)}
            />
          );
        }
        if (att.type === "VIDEO") {
          return (
            <video key={att.attachmentId} controls className="max-h-48 rounded-2xl border border-slate-200">
              <source src={`${CHAT_FILE_BASE}${att.url}`} />
            </video>
          );
        }
        if (att.type === "AUDIO") {
          return (
            <audio key={att.attachmentId} controls className="w-full">
              <source src={`${CHAT_FILE_BASE}${att.url}`} />
            </audio>
          );
        }
        return (
          <a
            key={att.attachmentId}
            href={`${CHAT_FILE_BASE}${att.url}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
          >
            <span className="truncate">{att.name}</span>
            <span className="text-[10px] text-slate-400">{att.type}</span>
          </a>
        );
      })}
    </div>
  );
}
