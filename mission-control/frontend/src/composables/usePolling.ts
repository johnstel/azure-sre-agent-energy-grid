import { onScopeDispose, ref } from 'vue';

export function usePolling<T>(fetcher: () => Promise<T>, intervalMs = 5000) {
  const data = ref<T | null>(null) as { value: T | null };
  const error = ref<Error | null>(null);
  const loading = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let active = false;
  let runId = 0;

  function poll(): Promise<void> {
    if (inFlight) return inFlight;

    const request = (async () => {
      loading.value = true;
      try {
        data.value = await fetcher();
        error.value = null;
      } catch (e) {
        error.value = e instanceof Error ? e : new Error(String(e));
      } finally {
        loading.value = false;
      }
    })();
    inFlight = request;
    void request.finally(() => {
      if (inFlight === request) inFlight = null;
    });
    return request;
  }

  async function runScheduledPoll(expectedRunId: number) {
    await poll();
    if (active && runId === expectedRunId) {
      timer = setTimeout(() => runScheduledPoll(expectedRunId), intervalMs);
    }
  }

  function start() {
    if (active) return;
    active = true;
    const expectedRunId = ++runId;
    void runScheduledPoll(expectedRunId);
  }

  function stop() {
    active = false;
    runId += 1;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  onScopeDispose(stop);

  return { data, error, loading, start, stop, poll };
}
