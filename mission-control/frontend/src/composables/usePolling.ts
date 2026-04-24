import { ref, onUnmounted } from 'vue';

export function usePolling<T>(fetcher: () => Promise<T>, intervalMs = 5000) {
  const data = ref<T | null>(null) as { value: T | null };
  const error = ref<Error | null>(null);
  const loading = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function poll() {
    loading.value = true;
    try {
      data.value = await fetcher();
      error.value = null;
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e));
    } finally {
      loading.value = false;
    }
  }

  function start() {
    poll();
    timer = setInterval(poll, intervalMs);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  onUnmounted(stop);

  return { data, error, loading, start, stop, poll };
}
