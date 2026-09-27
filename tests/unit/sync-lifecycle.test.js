import { describe, expect, it } from 'vitest';
import { createSyncLifecycleCoordinator } from '../../src/lib/syncLifecycle';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('sync lifecycle coordinator', () => {
  it('runs one active lifecycle and one queued rerun', async () => {
    const calls = []; let release;
    const held = new Promise((resolve) => { release = resolve; });
    const coordinator = createSyncLifecycleCoordinator({ run: async (user) => { calls.push(user); if (calls.length === 1) await held; } });
    const first = coordinator.request('a');
    coordinator.request('a'); coordinator.request('a');
    expect(calls).toEqual(['a']);
    release(); await first; await tick(); await tick();
    expect(calls).toEqual(['a', 'a']);
  });

  it('queues a switched account after the stale run settles', async () => {
    const calls = []; let release;
    const held = new Promise((resolve) => { release = resolve; });
    const coordinator = createSyncLifecycleCoordinator({ run: async (user, current) => { calls.push(user); if (user === 'a') { await held; expect(current()).toBe(false); } } });
    const first = coordinator.request('a'); coordinator.invalidate(); coordinator.request('b');
    release(); await first; await tick(); await tick();
    expect(calls).toEqual(['a', 'b']);
  });

  it('clears queued reruns on logout without releasing the active run', async () => {
    const calls = []; let release;
    const held = new Promise((resolve) => { release = resolve; });
    const coordinator = createSyncLifecycleCoordinator({ run: async (user) => { calls.push(user); await held; } });
    const first = coordinator.request('a'); coordinator.request('a'); coordinator.invalidate({ clearRequest: true });
    release(); await first; await tick();
    expect(calls).toEqual(['a']);
  });
});
