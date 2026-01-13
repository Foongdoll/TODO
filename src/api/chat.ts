const API_BASE = "http://localhost:8080";

export type FriendResponse = {
  userId: string;
  email: string;
  name: string;
  status: "ACTIVE" | "BLOCKED";
  online: boolean;
};

export type UserSummaryResponse = {
  userId: string;
  email: string;
  name: string;
};

export type RoomMemberResponse = {
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "MEMBER";
};

export type ChatRoomSummaryResponse = {
  roomId: string;
  name: string | null;
  type: "DM" | "GROUP";
  pinned: boolean;
  notificationsEnabled: boolean;
  lastMessage: string | null;
  lastMessageType: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  members: RoomMemberResponse[];
};

export type ChatAttachmentResponse = {
  attachmentId: string;
  type: "IMAGE" | "VIDEO" | "AUDIO" | "FILE" | "MAP" | "URL" | "CHART" | "TABLE" | "SELECT" | "OTHER";
  name: string;
  url: string;
  mime: string | null;
  size: number;
};

export type ChatMessageResponse = {
  messageId: string;
  roomId: string;
  senderId: string;
  senderName: string;
  type: "TEXT" | "FILE" | "SYSTEM" | "RICH";
  content: string | null;
  payload: string | null;
  attachments: ChatAttachmentResponse[];
  readUserIds: string[];
  createdAt: string;
};

export type ChatNotificationEvent = {
  roomId: string;
  messageId: string;
  senderName: string;
  preview: string;
  type: string;
  createdAt: string;
};

export type PresenceEvent = {
  userId: string;
  online: boolean;
  at: string;
};

export type ReadReceiptEvent = {
  roomId: string;
  readerId: string;
  messageIds: string[];
  readAt: string;
};

async function request<T>(token: string | null, path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.message || response.statusText || "요청에 실패했습니다.";
    throw new Error(message);
  }
  return data as T;
}

export function listFriends(token: string) {
  return request<FriendResponse[]>(token, "/api/friends");
}

export function searchUsers(token: string, keyword: string) {
  return request<UserSummaryResponse[]>(token, `/api/users/search?keyword=${encodeURIComponent(keyword)}`);
}

export function addFriend(token: string, friendId: string) {
  return request<FriendResponse>(token, `/api/friends?friendId=${encodeURIComponent(friendId)}`, { method: "POST" });
}

export function removeFriend(token: string, friendId: string) {
  return request<void>(token, `/api/friends/${encodeURIComponent(friendId)}`, { method: "DELETE" });
}

export function blockFriend(token: string, friendId: string) {
  return request<void>(token, `/api/friends/${encodeURIComponent(friendId)}/block`, { method: "POST" });
}

export function listRooms(token: string) {
  return request<ChatRoomSummaryResponse[]>(token, "/api/chat/rooms");
}

export function createDm(token: string, friendId: string) {
  return request<ChatRoomSummaryResponse>(token, "/api/chat/rooms/dm", {
    method: "POST",
    body: JSON.stringify({ friendId }),
  });
}

export function createGroup(token: string, name: string, memberIds: string[]) {
  return request<ChatRoomSummaryResponse>(token, "/api/chat/rooms/group", {
    method: "POST",
    body: JSON.stringify({ name, memberIds }),
  });
}

export function updateRoomPin(token: string, roomId: string, enabled: boolean) {
  return request<void>(token, `/api/chat/rooms/${encodeURIComponent(roomId)}/pin`, {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

export function updateRoomNotifications(token: string, roomId: string, enabled: boolean) {
  return request<void>(token, `/api/chat/rooms/${encodeURIComponent(roomId)}/notifications`, {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

export function updateUserNotifications(token: string, enabled: boolean) {
  return request<void>(token, "/api/chat/settings/notifications", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

export function listMessages(token: string, roomId: string, limit = 50) {
  return request<ChatMessageResponse[]>(token, `/api/chat/rooms/${encodeURIComponent(roomId)}/messages?limit=${limit}`);
}

export function sendMessage(token: string, payload: {
  roomId: string;
  type: string;
  content?: string | null;
  payload?: string | null;
  attachmentIds?: string[];
}) {
  return request<ChatMessageResponse>(token, "/api/chat/messages", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function markRead(token: string, roomId: string, messageIds: string[]) {
  return request<ReadReceiptEvent>(token, "/api/chat/reads", {
    method: "POST",
    body: JSON.stringify({ roomId, messageIds }),
  });
}

export async function uploadChatFile(token: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API_BASE}/api/chat/uploads`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.message || response.statusText || "업로드에 실패했습니다.";
    throw new Error(message);
  }
  return data as ChatAttachmentResponse;
}
