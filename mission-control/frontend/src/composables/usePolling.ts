import { onScopeDispose, ref } from 'vue';

export function usePolling<T>(fetcher: () => Promise<T>, intervalMs = 5000) {
  const data = ref<T | null>(null) as { value: T | null };
  const error = ref<Error | null>(null);
  const loading = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active = false;

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

  async function runScheduledPoll() {
    await poll();
    if (active) {
      timer = setTimeout(runScheduledPoll, intervalMs);
    }
  }

  function start() {
    if (active) return;
    active = true;
    void runScheduledPoll();
  }

  function stop() {
    active = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  onScopeDispose(stop);

  return { data, error, loading, start, stop, poll };
}
