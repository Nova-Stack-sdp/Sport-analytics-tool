import { useCallback, useEffect, useRef, useState } from 'react';
import { getF1News, getF1NewsStreamUrl } from '../api/client';

function newestFirst(items) {
  return [...items].sort(
    (a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
  );
}

export default function useF1NewsFeed() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState('connecting');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [newItemIds, setNewItemIds] = useState([]);
  const clearNewTimer = useRef(null);

  const applyPayload = useCallback((payload, announceNew = false) => {
    if (Array.isArray(payload?.items)) setItems(newestFirst(payload.items));
    if (payload?.lastUpdated) setLastUpdated(payload.lastUpdated);
    if (payload?.stale && payload?.error) setError(payload.error);
    else setError('');

    if (announceNew && payload?.newItems?.length) {
      setNewItemIds(payload.newItems.map((item) => item.id));
      clearTimeout(clearNewTimer.current);
      clearNewTimer.current = setTimeout(() => setNewItemIds([]), 8_000);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      applyPayload(await getF1News());
    } catch (requestError) {
      setError(requestError.body?.error || 'Could not load the F1 news feed.');
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    let disposed = false;
    load();

    if (typeof EventSource === 'undefined') {
      setConnection('unsupported');
      return () => {};
    }

    const stream = new EventSource(getF1NewsStreamUrl(), { withCredentials: true });
    stream.onopen = () => {
      if (!disposed) setConnection('live');
    };
    stream.addEventListener('news', (event) => {
      if (disposed) return;
      try {
        applyPayload(JSON.parse(event.data), true);
        setConnection('live');
      } catch {
        setError('A live news update could not be read.');
      }
    });
    stream.onerror = () => {
      if (!disposed) setConnection('reconnecting');
    };

    return () => {
      disposed = true;
      clearTimeout(clearNewTimer.current);
      stream.close();
    };
  }, [applyPayload, load]);

  return {
    items,
    loading,
    error,
    connection,
    lastUpdated,
    newItemIds,
    refresh: load,
  };
}
