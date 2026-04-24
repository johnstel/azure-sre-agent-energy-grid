import { ref, onUnmounted } from 'vue';

export function useWebSocket(url: string) {
  const data = ref<unknown>(null);
  const connected = ref(false);
  let ws: WebSocket | null = null;

  function connect() {
    ws = new WebSocket(url);
    ws.onopen = () => { connected.value = true; };
    ws.onclose = () => { connected.value = false; };
    ws.onmessage = (event) => { data.value = JSON.parse(event.data); };
  }

  function disconnect() {
    ws?.close();
    ws = null;
    connected.value = false;
  }

  function send(payload: unknown) {
    ws?.send(JSON.stringify(payload));
  }

  onUnmounted(disconnect);

  return { data, connected, connect, disconnect, send };
}
