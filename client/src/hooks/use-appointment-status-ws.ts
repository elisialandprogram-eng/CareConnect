import { useEffect, useRef, useState, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";
import { QK } from "@/lib/query-keys";
import { useAuth } from "@/lib/auth";

export interface StatusUpdate {
  id: string;
  appointmentId: string;
  appointmentNumber: string | null;
  status: string;
  providerName: string;
  date: string;
  startTime: string;
  arrivedAt: number;
}

export function useAppointmentStatusWS(enabled = true) {
  const { user } = useAuth();
  const socketRef = useRef<WebSocket | null>(null);
  const [updates, setUpdates] = useState<StatusUpdate[]>([]);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const dismiss = useCallback((id: string) => {
    setUpdates(prev => prev.filter(u => u.id !== id));
  }, []);

  const dismissAll = useCallback(() => setUpdates([]), []);

  useEffect(() => {
    if (!user || !enabled) return;
    let closedByUs = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoff = 2000;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);
      socketRef.current = socket;

      let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

      socket.onopen = () => {
        backoff = 2000;
        keepAliveTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            try { socket.send(JSON.stringify({ type: "ping" })); } catch {}
          }
        }, 25000);
      };

      socket.onmessage = (event) => {
        let data: any;
        try { data = JSON.parse(event.data); } catch { return; }
        if (data.type !== "appointment_status_update") return;
        const payload = data.data;
        if (!payload?.appointmentId || !payload?.status) return;

        queryClient.invalidateQueries({ queryKey: QK.patientAppointments() });

        const update: StatusUpdate = {
          id: `${payload.appointmentId}-${Date.now()}`,
          appointmentId: payload.appointmentId,
          appointmentNumber: payload.appointmentNumber ?? null,
          status: payload.status,
          providerName: payload.providerName ?? "Your provider",
          date: payload.date ?? "",
          startTime: payload.startTime ?? "",
          arrivedAt: Date.now(),
        };
        setUpdates(prev => [update, ...prev].slice(0, 4));
      };

      socket.onclose = () => {
        if (keepAliveTimer) clearInterval(keepAliveTimer);
        socketRef.current = null;
        if (!closedByUs && enabledRef.current) {
          reconnectTimer = setTimeout(connect, backoff);
          backoff = Math.min(backoff * 2, 30000);
        }
      };

      socket.onerror = () => { try { socket.close(); } catch {} };
    };

    connect();

    return () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { socketRef.current?.close(); } catch {}
      socketRef.current = null;
    };
  }, [user?.id, enabled]);

  useEffect(() => {
    if (!updates.length) return;
    const timer = setTimeout(() => {
      const cutoff = Date.now() - 12000;
      setUpdates(prev => prev.filter(u => u.arrivedAt > cutoff));
    }, 12000);
    return () => clearTimeout(timer);
  }, [updates]);

  return { updates, dismiss, dismissAll };
}
