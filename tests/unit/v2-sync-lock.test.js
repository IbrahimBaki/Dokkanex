import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../../src/lib/db';
import { acquireV2SyncLease, releaseV2SyncLease, renewV2SyncLease, startV2SyncLeaseHeartbeat } from '../../src/lib/v2SyncLock';

const databases = [];
async function fresh() {
  const database = createDatabase(`v2-lock-${crypto.randomUUID()}`);
  databases.push(database); await database.open(); return database;
}
afterEach(async () => Promise.all(databases.splice(0).map(async (database) => { database.close(); await database.delete(); })));

describe('V2 cross-context sync lease', () => {
  it('allows only one same-user owner, then permits the next owner after release', async () => {
    const database = await fresh();
    const [first, second] = await Promise.all([acquireV2SyncLease('a', database), acquireV2SyncLease('a', database)]);
    expect([first, second].filter((lease) => lease.acquired)).toHaveLength(1);
    const owner = first.acquired ? first : second;
    expect(first.acquired ? second : first).toEqual({ acquired: false, busy: true });
    expect(await releaseV2SyncLease('a', owner.token, database)).toBe(true);
    expect((await acquireV2SyncLease('a', database)).acquired).toBe(true);
  });

  it('does not block different users', async () => {
    const database = await fresh();
    expect((await acquireV2SyncLease('a', database)).acquired).toBe(true);
    expect((await acquireV2SyncLease('b', database)).acquired).toBe(true);
  });

  it('recovers an expired lease and prevents a non-owner from releasing the active lease', async () => {
    const database = await fresh();
    const first = await acquireV2SyncLease('a', database, { now: 100, ttlMs: 10 });
    const recovered = await acquireV2SyncLease('a', database, { now: 111, ttlMs: 10 });
    expect(recovered.acquired).toBe(true);
    expect(await renewV2SyncLease('a', first.token, database, { now: 112, ttlMs: 10 })).toBe(false);
    expect(await releaseV2SyncLease('a', first.token, database)).toBe(false);
    expect(await renewV2SyncLease('a', recovered.token, database, { now: 112, ttlMs: 10 })).toBe(true);
    expect(await releaseV2SyncLease('a', recovered.token, database)).toBe(true);
  });

  it('keeps a same-user lease alive across two database connections beyond the original TTL', async () => {
    const name = `v2-lock-shared-${crypto.randomUUID()}`;
    const firstDb = createDatabase(name); const secondDb = createDatabase(name);
    databases.push(firstDb, secondDb); await firstDb.open(); await secondDb.open();
    let clock = 100;
    const owner = await acquireV2SyncLease('a', firstDb, { now: clock, ttlMs: 30 });
    const stop = startV2SyncLeaseHeartbeat('a', owner.token, firstDb, { ttlMs: 30, intervalMs: 5, now: () => clock });
    clock = 120;
    await vi.waitFor(async () => expect((await firstDb.sync_state.get('v2:sync_lease:a')).value.expires_at).toBe(150));
    clock = 131; // The original lease expired at 130, but the renewal is live.
    expect(await acquireV2SyncLease('a', secondDb, { now: clock, ttlMs: 30 })).toEqual({ acquired: false, busy: true });
    expect((await acquireV2SyncLease('b', secondDb)).acquired).toBe(true);
    stop();
    expect(await releaseV2SyncLease('a', owner.token, firstDb)).toBe(true);
    expect((await acquireV2SyncLease('a', secondDb)).acquired).toBe(true);
  });

  it('releases after a cancelling or throwing critical-section owner', async () => {
    const database = await fresh();
    const run = async (work) => {
      const lease = await acquireV2SyncLease('a', database);
      try { return await work(); } finally { await releaseV2SyncLease('a', lease.token, database); }
    };
    await expect(run(async () => ({ cancelled: true }))).resolves.toEqual({ cancelled: true });
    await expect(run(async () => { throw new Error('failed'); })).rejects.toThrow('failed');
    expect((await acquireV2SyncLease('a', database)).acquired).toBe(true);
  });
});
