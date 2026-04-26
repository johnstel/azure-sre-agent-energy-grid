import { ref, onUnmounted } from 'vue';

type SharedSocket = {
  data: ReturnType<typeof ref<unknown>>;
  connected: ReturnType<typeof ref<boolean>>;
  connect: () => void;
  disconnect: () => void;
  send: (payload: unknown) => void;
  release: () => void;
};

const sockets = new Map<string, SharedSocket>();

export function useWebSocket(url: string) {
  const existing = sockets.get(url);
  if (existing) {
    onUnmounted(existing.release);
    return existing;
  }

  const data = ref<unknown>(null);
  const connected = ref(false);
  let ws: WebSocket | null = null;
  let consumers = 0;

  function connect() {
    consumers += 1;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    ws = new WebSocket(url);
    ws.onopen = () => { connected.value = true; };
    ws.onclose = () => { connected.value = false; };
    ws.onmessage = (event) => {
      try {
        data.value = JSON.parse(event.data);
      } catch {
        data.value = event.data;
      }
    };
  }

  function disconnect() {
    ws?.close();
    ws = null;
    connected.value = false;
  }

  function release() {
    consumers = Math.max(0, consumers - 1);
    if (consumers === 0) {
      disconnect();
      sockets.delete(url);
    }
  }

  function send(payload: unknown) {
    ws?.send(JSON.stringify(payload));
  }

  const shared = { data, connected, connect, disconnect, send, release };
  sockets.set(url, shared);

  onUnmounted(release);

  return shared;
}
