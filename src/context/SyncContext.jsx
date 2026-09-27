import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { drainLegacyQueue, getLegacyPendingCount } from '../lib/syncManager';
import { db, dbReady } from '../lib/db';
import { supabase } from '../lib/supabase';
import { createV2SyncRunner, getV2SyncStatus } from '../lib/v2Sync';
import { cleanupSucceededOutbox, recoverAbandonedSyncing } from '../lib/outbox';
import { createSyncLifecycleCoordinator } from '../lib/syncLifecycle';
import { acquireV2SyncLease, releaseV2SyncLease, startV2SyncLeaseHeartbeat } from '../lib/v2SyncLock';
import { useAuth } from './AuthContext';

const SyncContext = createContext({});

export function SyncProvider({ children }) {
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSync, setLastSync] = useState(null);
  const [v2Status, setV2Status] = useState({ pending: 0, retryable_failed: 0, conflict: 0, blocked: 0, permanent_failed: 0 });
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncVersion, setSyncVersion] = useState(0);
  const generationRef = useRef(0);
  const runnerRef = useRef(null);
  const coordinatorRef = useRef(null);
  if (!runnerRef.current) runnerRef.current = createV2SyncRunner({ client: supabase, database: db, legacyBridgeMode: 'disabled' });

  const refreshMeta = useCallback(async (userId = user?.id, isCurrent) => {
    if (!userId) return;
    const [legacyPending, status, success] = await Promise.all([
      getLegacyPendingCount(userId), getV2SyncStatus(userId, db), db.sync_state.get(`v2:lifecycle_last_success:${userId}`),
    ]);
    const current = isCurrent ?? (async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.user?.id === userId;
    });
    if (!await current()) return;
    setPendingCount(legacyPending);
    setV2Status(status);
    setLastSync(success?.value ?? null);
  }, [user?.id]);

  const executeLifecycle = useCallback(async (userId, coordinatorCurrent) => {
    const generation = generationRef.current;
    const isCurrent = async () => {
      const { data } = await supabase.auth.getSession();
      return coordinatorCurrent() && generation === generationRef.current && data.session?.user?.id === userId;
    };
    setSyncing(true);
    try {
      const legacy = await drainLegacyQueue(userId, { isCurrent });
      if (legacy?.cancelled) return legacy;
      if (!await isCurrent()) return { cancelled: true };
      const lease = await acquireV2SyncLease(userId, db);
      if (!lease.acquired) return { busy: true };
      let leaseLost = false;
      const stopHeartbeat = startV2SyncLeaseHeartbeat(userId, lease.token, db, { onLost: () => { leaseLost = true; runnerRef.current?.invalidate(); } });
      const cancelledForLeaseLoss = () => ({ cancelled: true, lease_lost: true });
      try {
        await recoverAbandonedSyncing(userId, {}, db);
        if (leaseLost) return cancelledForLeaseLoss();
        if (!await isCurrent()) return { cancelled: true };
        const v2Result = await runnerRef.current.sync(userId);
        if (leaseLost) return cancelledForLeaseLoss();
        if (v2Result?.cancelled || !await isCurrent()) return { cancelled: true };
        // Do not mutate the outbox after a heartbeat has established that this
        // context no longer owns the lease.
        if (leaseLost) return cancelledForLeaseLoss();
        await cleanupSucceededOutbox(userId, { keepRecent: 50 }, db).catch(() => {});
        if (leaseLost) return cancelledForLeaseLoss();
        if (!await isCurrent()) return { cancelled: true };
      } finally {
        stopHeartbeat();
        await releaseV2SyncLease(userId, lease.token, db);
      }
      const successAt = new Date().toISOString();
      await db.sync_state.put({ id: `v2:lifecycle_last_success:${userId}`, user_id: userId, scope: 'lifecycle_last_success', value: successAt, updated_at: successAt });
      if (!await isCurrent()) return { cancelled: true };
      await refreshMeta(userId, isCurrent);
      if (!await isCurrent()) return { cancelled: true };
      setSyncVersion(v => v + 1);
      return { succeeded: true };
    } finally {
      setSyncing(false);
    }
  }, [refreshMeta]);

  if (!coordinatorRef.current) coordinatorRef.current = createSyncLifecycleCoordinator({ run: executeLifecycle, isOnline: () => navigator.onLine });
  const handleSync = useCallback(() => coordinatorRef.current.request(user?.id), [user?.id]);

  useEffect(() => {
    generationRef.current += 1;
    runnerRef.current?.invalidate();
    coordinatorRef.current?.invalidate({ clearRequest: !user });
    setSyncing(false);
    setPendingCount(0);
    setLastSync(null);
    setV2Status({ pending: 0, retryable_failed: 0, conflict: 0, blocked: 0, permanent_failed: 0 });
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    dbReady
      .then(() => {
        refreshMeta();
        if (navigator.onLine) handleSync();
      })
      .catch(e => console.error('IndexedDB unavailable:', e));
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      if (user) handleSync();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [user, handleSync]);

  return (
    <SyncContext.Provider value={{ syncing, isSyncing: syncing, pendingCount, legacyPending: pendingCount, lastSync, lastSuccessfulSync: lastSync, isOnline, handleSync, refreshMeta, syncVersion, ...v2Status }}>
      {children}
    </SyncContext.Provider>
  );
}

export const useSync = () => useContext(SyncContext);
