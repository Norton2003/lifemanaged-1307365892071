// Local-only storage (IndexedDB on this device). Nothing here touches the network.
const DB_NAME = 'lifemanaged';
const VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then(r => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const db = {
  async allItems() { return tx('items', 'readonly', s => req2p(s.getAll())); },
  async putItem(item) { return tx('items', 'readwrite', s => { s.put(item); }); },
  async putItems(items) { return tx('items', 'readwrite', s => { for (const i of items) s.put(i); }); },
  async deleteItem(id) { return tx('items', 'readwrite', s => { s.delete(id); }); },
  async getMeta(key, fallback = null) {
    const r = await tx('meta', 'readonly', s => req2p(s.get(key)));
    return r ? r.value : fallback;
  },
  async setMeta(key, value) { return tx('meta', 'readwrite', s => { s.put({ key, value }); }); },
  async allMeta() { return tx('meta', 'readonly', s => req2p(s.getAll())); },
  async clearAll() {
    await tx('items', 'readwrite', s => { s.clear(); });
    await tx('meta', 'readwrite', s => { s.clear(); });
  },
  async replaceAll(items, meta) {
    await this.clearAll();
    await this.putItems(items);
    await tx('meta', 'readwrite', s => { for (const m of meta) s.put(m); });
  },
};

export function uid() {
  const a = new Uint8Array(9); crypto.getRandomValues(a);
  return Date.now().toString(36) + '-' + Array.from(a, b => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
}
