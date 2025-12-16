// src/localAudio.js
// Utility for saving and loading audio blobs in IndexedDB

const DB_NAME = 'audio-recording-db';
const STORE_NAME = 'audioChunks';

export function saveChunk(chunk, id) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.add({ id, chunk });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    };
    request.onerror = (e) => reject(e);
  });
}

export function getAllChunks() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getAll = store.getAll();
      getAll.onsuccess = () => resolve(getAll.result);
      getAll.onerror = (e) => reject(e);
    };
    request.onerror = (e) => reject(e);
  });
}

export function clearChunks() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    };
    request.onerror = (e) => reject(e);
  });
}
