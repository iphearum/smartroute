"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SocketMessageHandler<T> = (event: MessageEvent<T>) => void;

type UseSocketOptions<T> = {
  enabled?: boolean;
  protocols?: string | string[];
  autoConnect?: boolean;
  reconnect?: boolean;
  reconnectDelayMs?: number;
  onOpen?: () => void;
  onMessage?: SocketMessageHandler<T>;
  onError?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
};

export function useSocket<T = unknown>(
  url?: string,
  options: UseSocketOptions<T> = {},
) {
  const {
    enabled = Boolean(url),
    protocols,
    autoConnect = true,
    reconnect = false,
    reconnectDelayMs = 1000,
    onOpen,
    onMessage,
    onError,
    onClose,
  } = options;

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const [readyState, setReadyState] = useState<number>(WebSocket.CLOSED);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<MessageEvent<T> | null>(null);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const disconnect = useCallback(
    (code?: number, reason?: string) => {
      clearReconnectTimer();
      if (!socketRef.current) {
        return;
      }

      socketRef.current.close(code, reason);
      socketRef.current = null;
    },
    [clearReconnectTimer],
  );

  const connect = useCallback(() => {
    if (!url || typeof window === "undefined") {
      return;
    }

    clearReconnectTimer();

    const socket = new WebSocket(url, protocols);
    socketRef.current = socket;

    const handleOpen = () => {
      setReadyState(socket.readyState);
      setIsConnected(true);
      onOpen?.();
    };

    const handleMessage = (event: MessageEvent) => {
      const messageEvent = event as MessageEvent<T>;
      setReadyState(socket.readyState);
      setLastMessage(messageEvent);
      onMessage?.(messageEvent);
    };

    const handleError = (event: Event) => {
      setReadyState(socket.readyState);
      setIsConnected(false);
      onError?.(event);
    };

    const handleClose = (event: CloseEvent) => {
      setReadyState(socket.readyState);
      setIsConnected(false);
      socketRef.current = null;
      onClose?.(event);

      if (reconnect && !event.wasClean) {
        reconnectTimerRef.current = window.setTimeout(() => {
          connect();
        }, reconnectDelayMs);
      }
    };

    socket.addEventListener("open", handleOpen);
    socket.addEventListener("message", handleMessage);
    socket.addEventListener("error", handleError);
    socket.addEventListener("close", handleClose);

    setReadyState(socket.readyState);
    setIsConnected(socket.readyState === WebSocket.OPEN);

    return () => {
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("message", handleMessage);
      socket.removeEventListener("error", handleError);
      socket.removeEventListener("close", handleClose);
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };
  }, [clearReconnectTimer, onClose, onError, onMessage, onOpen, protocols, reconnect, reconnectDelayMs, url]);

  useEffect(() => {
    if (!autoConnect || !enabled || !url || typeof window === "undefined") {
      setReadyState(WebSocket.CLOSED);
      setIsConnected(false);
      return;
    }

    const cleanup = connect();
    return () => {
      cleanup?.();
      disconnect();
    };
  }, [autoConnect, connect, disconnect, enabled, url]);

  const send = useCallback(
    (data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        return false;
      }

      socketRef.current.send(data);
      return true;
    },
    [],
  );

  return {
    socket: socketRef.current,
    readyState,
    isConnected,
    lastMessage,
    send,
    connect,
    disconnect,
  };
}
