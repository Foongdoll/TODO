import { type ApiRequester } from "./http";

// 한글 주석: 채팅 관련 API 요청을 모아두는 모듈입니다.

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

export type ChatApi = ReturnType<typeof createChatApi>;

// chat API 객체를 생성합니다. 로그인 토큰은 내부 requester가 자동으로 붙입니다.
export function createChatApi(client: ApiRequester) {
  return {
    // 친구 목록 조회 및 관리
    listFriends: () => client.request<FriendResponse[]>("/api/friends"),
    searchUsers: (keyword: string) =>
      client.request<UserSummaryResponse[]>(`/api/users/search?keyword=${encodeURIComponent(keyword)}`),
    addFriend: (friendId: string) =>
      client.request<FriendResponse>(`/api/friends?friendId=${encodeURIComponent(friendId)}`, {
        method: "POST",
      }),
    removeFriend: (friendId: string) =>
      client.request<void>(`/api/friends/${encodeURIComponent(friendId)}`, { method: "DELETE" }),
    blockFriend: (friendId: string) =>
      client.request<void>(`/api/friends/${encodeURIComponent(friendId)}/block`, { method: "POST" }),
    // 채팅방 목록 및 설정
    listRooms: () => client.request<ChatRoomSummaryResponse[]>("/api/chat/rooms"),
    createDm: (friendId: string) =>
      client.request<ChatRoomSummaryResponse>("/api/chat/rooms/dm", {
        method: "POST",
        body: JSON.stringify({ friendId }),
      }),
    createGroup: (name: string, memberIds: string[]) =>
      client.request<ChatRoomSummaryResponse>("/api/chat/rooms/group", {
        method: "POST",
        body: JSON.stringify({ name, memberIds }),
      }),
    updateRoomPin: (roomId: string, enabled: boolean) =>
      client.request<void>(`/api/chat/rooms/${encodeURIComponent(roomId)}/pin`, {
        method: "POST",
        body: JSON.stringify({ enabled }),
      }),
    updateRoomNotifications: (roomId: string, enabled: boolean) =>
      client.request<void>(`/api/chat/rooms/${encodeURIComponent(roomId)}/notifications`, {
        method: "POST",
        body: JSON.stringify({ enabled }),
      }),
    updateUserNotifications: (enabled: boolean) =>
      client.request<void>("/api/chat/settings/notifications", {
        method: "POST",
        body: JSON.stringify({ enabled }),
      }),
    // 메시지 송수신
    listMessages: (roomId: string, limit = 50) =>
      client.request<ChatMessageResponse[]>(`/api/chat/rooms/${encodeURIComponent(roomId)}/messages?limit=${limit}`),
    sendMessage: (payload: {
      roomId: string;
      type: string;
      content?: string | null;
      payload?: string | null;
      attachmentIds?: string[];
    }) =>
      client.request<ChatMessageResponse>("/api/chat/messages", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    markRead: (roomId: string, messageIds: string[]) =>
      client.request<ReadReceiptEvent>("/api/chat/reads", {
        method: "POST",
        body: JSON.stringify({ roomId, messageIds }),
      }),
    // 첨부파일 업로드
    uploadChatFile: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return client.fetch("/api/chat/uploads", {
        method: "POST",
        body: form,
      }).then(async (response) => {
        if (!response.ok) {
          const text = await response.text();
          const message = text ? JSON.parse(text).message : response.statusText;
          throw new Error(message || "업로드에 실패했습니다.");
        }
        const bodyText = await response.text();
        return bodyText ? (JSON.parse(bodyText) as ChatAttachmentResponse) : null;
      });
    },
  };
}
