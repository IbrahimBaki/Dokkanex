import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React, { useEffect } from 'react';

const mocks = vi.hoisted(() => ({
  user: { id: 'a' }, events: [], fullSync: vi.fn(), legacyPending: vi.fn(), recover: vi.fn(), cleanup: vi.fn(),
  v2Sync: vi.fn(), v2Status: vi.fn(), getState: vi.fn(), putState: vi.fn(), getSession: vi.fn(), invalidate: vi.fn(),
  acquireLease: vi.fn(), releaseLease: vi.fn(), heartbeat: vi.fn(),
}));

vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../../src/lib/syncManager', () => ({ drainLegacyQueue: (...args) => mocks.fullSync(...args), getLegacyPendingCount: (...args) => mocks.legacyPending(...args) }));
vi.mock('../../src/lib/outbox', () => ({ recoverAbandonedSyncing: (...args) => mocks.recover(...args), cleanupSucceededOutbox: (...args) => mocks.cleanup(...args) }));
vi.mock('../../src/lib/v2Sync', () => ({ createV2SyncRunner: () => ({ invalidate: mocks.invalidate, sync: (...args) => mocks.v2Sync(...args) }), getV2SyncStatus: (...args) => mocks.v2Status(...args) }));
vi.mock('../../src/lib/v2SyncLock', () => ({ acquireV2SyncLease: (...args) => mocks.acquireLease(...args), releaseV2SyncLease: (...args) => mocks.releaseLease(...args), startV2SyncLeaseHeartbeat: (...args) => mocks.heartbeat(...args) }));
vi.mock('../../src/lib/supabase', () => ({ supabase: { auth: { getSession: (...args) => mocks.getSession(...args) } } }));
vi.mock('../../src/lib/db', () => ({ dbReady: Promise.resolve(), db: { sync_state: { get: (...args) => mocks.getState(...args), put: (...args) => mocks.putState(...args) } } }));

import { SyncProvider, useSync } from '../../src/context/SyncContext';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const status = (pending) => ({ pending, retryable_failed: 0, conflict: 0, blocked: 0, permanent_failed: 0 });

function Probe() {
  const sync = useSync();
  useEffect(() => {
    if (sync.syncVersion === 0 && sync.legacyPending === 7 && sync.pending === 8 && sync.lastSuccessfulSync === 'A-success') mocks.events.push('status applied');
    if (sync.syncVersion === 1) mocks.events.push('version incremented');
  }, [sync.legacyPending, sync.pending, sync.lastSuccessfulSync, sync.syncVersion]);
  return <><button onClick={sync.handleSync}>{JSON.stringify({ legacy: sync.legacyPending, pending: sync.pending, retryable: sync.retryable_failed, conflict: sync.conflict, blocked: sync.blocked, permanent: sync.permanent_failed, last: sync.lastSuccessfulSync, version: sync.syncVersion })}</button><button aria-label="refresh" onClick={() => sync.refreshMeta()}>refresh</button></>;
}

describe('SyncContext lifecycle gates', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    mocks.user = { id: 'a' }; mocks.events.length = 0; vi.clearAllMocks();
    mocks.fullSync.mockImplementation(async () => { mocks.events.push('V1 fullSync'); });
    mocks.recover.mockImplementation(async () => { mocks.events.push('recoverAbandonedSyncing'); });
    mocks.v2Sync.mockImplementation(async () => { mocks.events.push('V2 sync'); return {}; });
    mocks.cleanup.mockImplementation(async () => { mocks.events.push('cleanupSucceededOutbox'); });
    mocks.putState.mockImplementation(async () => { mocks.events.push('lifecycle success timestamp persistence'); });
    mocks.legacyPending.mockResolvedValue(0); mocks.v2Status.mockResolvedValue(status(0)); mocks.getState.mockResolvedValue(null);
    mocks.getSession.mockImplementation(async () => ({ data: { session: { user: mocks.user } } }));
    mocks.acquireLease.mockResolvedValue({ acquired: true, token: 'lease' }); mocks.releaseLease.mockResolvedValue(true);
    mocks.heartbeat.mockReturnValue(vi.fn());
  });

  async function renderReady() {
    const view = render(<SyncProvider><Probe /></SyncProvider>);
    await waitFor(() => expect(mocks.legacyPending).toHaveBeenCalledWith('a'));
    vi.clearAllMocks(); mocks.events.length = 0;
    return view;
  }
  async function startLifecycle(view) {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    act(() => { view.container.querySelector('button').click(); });
  }

  it('does not finish a lifecycle when V2 reports cancellation', async () => {
    const view = await renderReady(); mocks.v2Sync.mockResolvedValueOnce({ cancelled: true });
    await startLifecycle(view);
    await waitFor(() => expect(mocks.v2Sync).toHaveBeenCalledWith('a'));
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect(mocks.putState).not.toHaveBeenCalled();
    expect(mocks.legacyPending).not.toHaveBeenCalled();
    expect(view.container.querySelector('button')).toHaveTextContent('"version":0');
  });

  it('does not enter the V2 critical section when another context owns the lease', async () => {
    const view = await renderReady();
    mocks.acquireLease.mockResolvedValueOnce({ acquired: false, busy: true });
    await startLifecycle(view);
    await waitFor(() => expect(mocks.acquireLease).toHaveBeenCalledWith('a', expect.anything()));
    expect(mocks.recover).not.toHaveBeenCalled();
    expect(mocks.v2Sync).not.toHaveBeenCalled();
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect(mocks.putState).not.toHaveBeenCalled();
    expect(view.container.querySelector('button')).toHaveTextContent('"version":0');
  });

  it('exposes legacy and every V2 status for only the active user', async () => {
    mocks.legacyPending.mockImplementation(async (id) => id === 'a' ? 1 : 2);
    mocks.v2Status.mockImplementation(async (id) => id === 'a'
      ? { pending: 3, retryable_failed: 4, conflict: 5, blocked: 6, permanent_failed: 7 }
      : { pending: 8, retryable_failed: 9, conflict: 10, blocked: 11, permanent_failed: 12 });
    const view = render(<SyncProvider><Probe /></SyncProvider>);
    await waitFor(() => expect(view.container.querySelector('button')).toHaveTextContent('"legacy":1'));
    expect(view.container.querySelector('button')).toHaveTextContent('"retryable":4');
    expect(view.container.querySelector('button')).toHaveTextContent('"conflict":5');
    expect(view.container.querySelector('button')).toHaveTextContent('"blocked":6');
    expect(view.container.querySelector('button')).toHaveTextContent('"permanent":7');
    mocks.user = { id: 'b' }; view.rerender(<SyncProvider><Probe /></SyncProvider>);
    await waitFor(() => expect(view.container.querySelector('button')).toHaveTextContent('"legacy":2'));
    expect(view.container.querySelector('button')).toHaveTextContent('"pending":8');
    expect(view.container.querySelector('button')).toHaveTextContent('"retryable":9');
    expect(view.container.querySelector('button')).toHaveTextContent('"conflict":10');
    expect(view.container.querySelector('button')).toHaveTextContent('"blocked":11');
    expect(view.container.querySelector('button')).toHaveTextContent('"permanent":12');
  });

  it('does not apply an ordinary stale User A refresh after an account switch', async () => {
    const view = await renderReady();
    const aLegacy = deferred(), aStatus = deferred(), aSuccess = deferred();
    mocks.legacyPending.mockImplementation((id) => id === 'a' ? aLegacy.promise : Promise.resolve(2));
    mocks.v2Status.mockImplementation((id) => id === 'a' ? aStatus.promise : Promise.resolve(status(3)));
    mocks.getState.mockImplementation((id) => id.includes(':a') ? aSuccess.promise : Promise.resolve({ value: 'B-success' }));
    act(() => { view.container.querySelector('[aria-label="refresh"]').click(); });
    await waitFor(() => expect(mocks.legacyPending).toHaveBeenCalledWith('a'));
    mocks.user = { id: 'b' }; view.rerender(<SyncProvider><Probe /></SyncProvider>);
    aLegacy.resolve(7); aStatus.resolve(status(8)); aSuccess.resolve({ value: 'A-success' });
    await waitFor(() => expect(view.container.querySelector('button')).toHaveTextContent('"legacy":2'));
    expect(view.container.querySelector('button')).not.toHaveTextContent('A-success');
  });

  it('clears every visible user-scoped status immediately on logout', async () => {
    mocks.legacyPending.mockResolvedValue(1);
    mocks.v2Status.mockResolvedValue({ pending: 2, retryable_failed: 3, conflict: 4, blocked: 5, permanent_failed: 6 });
    mocks.getState.mockResolvedValue({ value: 'A-success' });
    const view = render(<SyncProvider><Probe /></SyncProvider>);
    await waitFor(() => expect(view.container.querySelector('button')).toHaveTextContent('"permanent":6'));
    mocks.user = null; view.rerender(<SyncProvider><Probe /></SyncProvider>);
    await waitFor(() => expect(view.container.querySelector('button')).toHaveTextContent('"legacy":0'));
    expect(view.container.querySelector('button')).toHaveTextContent('"pending":0');
    expect(view.container.querySelector('button')).toHaveTextContent('"retryable":0');
    expect(view.container.querySelector('button')).toHaveTextContent('"conflict":0');
    expect(view.container.querySelector('button')).toHaveTextContent('"blocked":0');
    expect(view.container.querySelector('button')).toHaveTextContent('"permanent":0');
    expect(view.container.querySelector('button')).toHaveTextContent('"last":null');
  });

  it('does not apply stale scoped status reads after switching accounts', async () => {
    const view = await renderReady();
    const aLegacy = deferred(), aStatus = deferred(), aSuccess = deferred();
    mocks.legacyPending.mockImplementation((id) => id === 'a' ? aLegacy.promise : Promise.resolve(2));
    mocks.v2Status.mockImplementation((id) => id === 'a' ? aStatus.promise : Promise.resolve(status(3)));
    mocks.getState.mockImplementation((id) => id.includes(':a') ? aSuccess.promise : Promise.resolve({ value: 'B-success' }));
    await startLifecycle(view);
    await waitFor(() => expect(mocks.legacyPending).toHaveBeenCalledWith('a'));
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    mocks.user = { id: 'b' }; view.rerender(<SyncProvider><Probe /></SyncProvider>);
    await waitFor(() => expect(mocks.legacyPending).toHaveBeenCalledWith('b'));
    aLegacy.resolve(7); aStatus.resolve(status(8)); aSuccess.resolve({ value: 'A-success' });
    await waitFor(() => expect(view.container.querySelector('button')).toHaveTextContent('"last":"B-success"'));
    expect(view.container.querySelector('button')).toHaveTextContent('"legacy":2');
    expect(view.container.querySelector('button')).toHaveTextContent('"pending":3');
    expect(view.container.querySelector('button')).toHaveTextContent('"version":0');
  });

  it('runs a successful lifecycle in the exact observable order', async () => {
    const view = await renderReady();
    mocks.legacyPending.mockResolvedValueOnce(7); mocks.v2Status.mockResolvedValueOnce(status(8)); mocks.getState.mockResolvedValueOnce({ value: 'A-success' });
    await startLifecycle(view);
    await waitFor(() => expect(view.container.querySelector('button')).toHaveTextContent('"version":1'));
    expect(mocks.events).toEqual(['V1 fullSync', 'recoverAbandonedSyncing', 'V2 sync', 'cleanupSucceededOutbox', 'lifecycle success timestamp persistence', 'status applied', 'version incremented']);
  });

  it('does not apply User A status or version after timestamp persistence and an auth switch', async () => {
    const view = await renderReady();
    const aLegacy = deferred(), aStatus = deferred(), aSuccess = deferred();
    mocks.legacyPending.mockImplementation((id) => id === 'a' ? aLegacy.promise : Promise.resolve(2));
    mocks.v2Status.mockImplementation((id) => id === 'a' ? aStatus.promise : Promise.resolve(status(3)));
    mocks.getState.mockImplementation((id) => id.includes(':a') ? aSuccess.promise : Promise.resolve({ value: 'B-success' }));
    await startLifecycle(view);
    await waitFor(() => expect(mocks.putState).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'a' })));
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    mocks.user = { id: 'b' }; view.rerender(<SyncProvider><Probe /></SyncProvider>);
    await waitFor(() => expect(mocks.legacyPending).toHaveBeenCalledWith('b'));
    aLegacy.resolve(7); aStatus.resolve(status(8)); aSuccess.resolve({ value: 'A-success' });
    await waitFor(() => expect(view.container.querySelector('button')).toHaveTextContent('"last":"B-success"'));
    expect(view.container.querySelector('button')).toHaveTextContent('"legacy":2');
    expect(view.container.querySelector('button')).toHaveTextContent('"pending":3');
    expect(view.container.querySelector('button')).toHaveTextContent('"version":0');
  });
});
