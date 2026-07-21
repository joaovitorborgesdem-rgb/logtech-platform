import { io, Socket } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export function createRealtimeSocket(token: string): Socket {
  return io(`${API_URL}/realtime`, {
    auth: { token },
    transports: ["websocket"],
  });
}
