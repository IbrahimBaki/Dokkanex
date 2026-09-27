const leaseId = (userId) => `v2:sync_lease:${userId}`;
const token = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const resolveNow = (now) => typeof now === 'function' ? now() : now;

export async function acquireV2SyncLease(userId, database, { now = Date.now(), ttlMs = 60_000 } = {}) {
  now = resolveNow(now);
  const id = leaseId(userId);
  const owner = token();
  return database.transaction('rw', database.sync_state, async () => {
    const existing = await database.sync_state.get(id);
    if (existing?.value?.expires_at > now) return { acquired: false, busy: true };
    await database.sync_state.put({ id, user_id: userId, scope: 'sync_lease', value: { token: owner, expires_at: now + ttlMs }, updated_at: new Date(now).toISOString() });
    return { acquired: true, token: owner };
  });
}

export async function releaseV2SyncLease(userId, owner, database) {
  const id = leaseId(userId);
  return database.transaction('rw', database.sync_state, async () => {
    const existing = await database.sync_state.get(id);
    if (existing?.value?.token !== owner) return false;
    await database.sync_state.delete(id);
    return true;
  });
}

export async function renewV2SyncLease(userId, owner, database, { now = Date.now(), ttlMs = 60_000 } = {}) {
  now = resolveNow(now);
  const id = leaseId(userId);
  return database.transaction('rw', database.sync_state, async () => {
    const existing = await database.sync_state.get(id);
    if (existing?.value?.token !== owner) return false;
    await database.sync_state.put({ ...existing, value: { ...existing.value, expires_at: now + ttlMs }, updated_at: new Date(now).toISOString() });
    return true;
  });
}

export function startV2SyncLeaseHeartbeat(userId, owner, database, {
  ttlMs = 60_000, intervalMs = 20_000, now = () => Date.now(), onLost = () => {},
} = {}) {
  let stopped = false;
  let renewing = false;
  const heartbeat = async () => {
    if (stopped || renewing) return;
    renewing = true;
    try {
      const renewed = await renewV2SyncLease(userId, owner, database, { now, ttlMs });
      if (stopped || renewed) return;
      stopped = true;
      clearInterval(timer);
      onLost();
    } catch {
      // A context that cannot prove ownership must no longer run the V2 section.
      if (!stopped) {
        stopped = true;
        clearInterval(timer);
        onLost();
      }
    } finally {
      renewing = false;
    }
  };
  const timer = setInterval(heartbeat, intervalMs);
  return () => { stopped = true; clearInterval(timer); };
}
