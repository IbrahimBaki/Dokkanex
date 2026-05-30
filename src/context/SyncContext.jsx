import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fullSync, getPendingCount, getLastSync } from '../lib/syncManager';
import { useAuth } from './AuthContext';

const SyncContext = createContext({});

export function SyncProvider({ children }) {
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSync, setLastSync] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncVersion, setSyncVersion] = useState(0);
  const syncingRef = useRef(false);

  const refreshMeta = useCallback(async () => {
    setPendingCount(await getPendingCount());
    setLastSync(await getLastSync());
  }, []);

  const handleSync = useCallback(async () => {
    if (!user || syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      await fullSync(user.id);
      await refreshMeta();
      setSyncVersion(v => v + 1);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [user, refreshMeta]);

  useEffect(() => {
    if (!user) return;
    refreshMeta();
    getLastSync().then(last => {
      if (!last && navigator.onLine) handleSync();
    });
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
    <SyncContext.Provider value={{ syncing, pendingCount, lastSync, isOnline, handleSync, refreshMeta, syncVersion }}>
      {children}
    </SyncContext.Provider>
  );
}

export const useSync = () => useContext(SyncContext);
