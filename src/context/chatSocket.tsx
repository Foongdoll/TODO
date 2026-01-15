import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Client, type IMessage, type StompSubscription } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { useAuth } from "./auth";
import { API_BASE } from "../api/http";

const WS_ENDPOINT = `${API_BASE}/ws`;

type SubscriptionEntry = {
  destination: string;
  handler: (payload: any) => void;
};

type ChatSocketContextValue = {
  connected: boolean;
  send: (destination: string, body: unknown) => void;
  subscribe: (destination: string, handler: (payload: any) => void) => () => void;
};

const ChatSocketContext = createContext<ChatSocketContextValue | undefined>(undefined);

function parseBody(message: IMessage) {
  try {
    return JSON.parse(message.body);
  } catch {
    return message.body;
  }
}

export const ChatSocketProvider = ({ children }: { children: React.ReactNode }) => {
  const { token } = useAuth();
  const clientRef = useRef<Client | null>(null);
  const subscriptionsRef = useRef<Map<string, StompSubscription>>(new Map());
  const pendingRef = useRef<SubscriptionEntry[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      clientRef.current?.deactivate();
      clientRef.current = null;
      subscriptionsRef.current.clear();
      pendingRef.current = [];
      setConnected(false);
      return;
    }

    const client = new Client({
      webSocketFactory: () => new SockJS(WS_ENDPOINT),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,
      onConnect: () => {
        setConnected(true);

        console.log("WebSocket connected");

        pendingRef.current.forEach((entry) => {
          const subscription = client.subscribe(entry.destination, (message: IMessage) => entry.handler(parseBody(message)));
          subscriptionsRef.current.set(entry.destination, subscription);
        });
        pendingRef.current = [];
      },
      onDisconnect: () => {
        setConnected(false);
      },
      onStompError: () => {
        setConnected(false);
      },
    });

    client.activate();
    clientRef.current = client;

    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => undefined);
    }

    return () => {
      client.deactivate();
      clientRef.current = null;
      subscriptionsRef.current.clear();
      pendingRef.current = [];
      setConnected(false);
    };
  }, [token]);

  const send = useCallback((destination: string, body: unknown) => {
    if (!clientRef.current || !connected) return;
    clientRef.current.publish({
      destination,
      body: JSON.stringify(body ?? {}),
    });
  }, [connected]);

  const subscribe = useCallback((destination: string, handler: (payload: any) => void) => {
    const client = clientRef.current;
    if (!client || !connected) {
      pendingRef.current.push({ destination, handler });
      return () => {
        pendingRef.current = pendingRef.current.filter((entry) => entry.destination !== destination);
      };
    }

    const subscription = client.subscribe(destination, (message: IMessage) => handler(parseBody(message)));
    subscriptionsRef.current.set(destination, subscription);
    return () => {
      subscriptionsRef.current.get(destination)?.unsubscribe();
      subscriptionsRef.current.delete(destination);
    };
  }, [connected]);

  const value = useMemo(() => ({ connected, send, subscribe }), [connected, send, subscribe]);
  return <ChatSocketContext.Provider value={value}>{children}</ChatSocketContext.Provider>;
};

export const useChatSocket = () => {
  const context = useContext(ChatSocketContext);
  if (!context) {
    throw new Error("useChatSocket must be used within ChatSocketProvider");
  }
  return context;
};
