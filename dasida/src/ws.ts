import { ENV } from "./env";

export function connectTutor(sessionId: string, accessToken: string) {
  // 쿼리파라미터 토큰 전달(nginx → FastAPI)
  const ws = new WebSocket(`${ENV.WS}/ws/tutor/${sessionId}?token=${accessToken}`);
  ws.onopen = () => console.log("WS open");
  ws.onmessage = e => console.log("WS:", e.data);
  ws.onerror = e => console.log("WS error", e);
  ws.onclose = () => console.log("WS close");
  return ws;
}

