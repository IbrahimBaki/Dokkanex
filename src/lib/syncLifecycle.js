// In-memory coordinator: AuthContext remains the only source of user identity.
export function createSyncLifecycleCoordinator({ run, isOnline = () => true }) {
  let active = null;
  let requestedUserId = null;
  let generation = 0;
  let runId = 0;
  let rerunRequested = false;
  const request = (userId) => {
    requestedUserId = userId ?? null;
    if (!userId || !isOnline()) return active ?? Promise.resolve({ skipped: true });
    if (active) { rerunRequested = true; return active; }
    const id = ++runId;
    const expectedGeneration = generation;
    active = (async () => {
      const result = await run(userId, () => generation === expectedGeneration && requestedUserId === userId);
      return result;
    })().finally(() => {
      if (runId === id) active = null;
      const next = requestedUserId;
      const rerun = rerunRequested;
      rerunRequested = false;
      if (next && rerun && isOnline()) queueMicrotask(() => request(next));
    });
    return active;
  };
  return {
    request,
    invalidate({ clearRequest = false } = {}) {
      generation += 1;
      if (clearRequest) { requestedUserId = null; rerunRequested = false; }
    },
    get active() { return active; },
  };
}
