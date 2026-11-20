import { GameMode, PolygonSides, RecordedMove } from '@gyrogon/game-core';

export interface PendingReplayRecord {
  id: string;
  sessionId: string;
  signature: string;
  mode: GameMode;
  sides?: PolygonSides;
  seed: string;
  claimedScore: number;
  moves: RecordedMove[];
  playerName: string;
  offline: boolean;
  createdAt: string;
}

const DB_NAME = 'gyrogon_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'pending_replays';

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function enqueuePendingReplay(record: PendingReplayRecord): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

export async function listPendingReplays(): Promise<PendingReplayRecord[]> {
  const db = await openDb();
  if (!db) return [];
  const rows = await new Promise<PendingReplayRecord[]>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result as PendingReplayRecord[]) ?? []);
    req.onerror = () => resolve([]);
  });
  db.close();
  return rows;
}

export async function removePendingReplay(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

export async function getPendingReplayCount(): Promise<number> {
  const list = await listPendingReplays();
  return list.length;
}
