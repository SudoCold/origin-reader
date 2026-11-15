const DB = 'origin-reader';
let connection;
function open() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return connection;
}
async function transaction(mode, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', mode);
    const request = action(tx.objectStore('documents'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export const listDocuments = () => transaction('readonly', store => store.getAll());
export const saveDocument = document => transaction('readwrite', store => store.put(document));
export const deleteDocument = id => transaction('readwrite', store => store.delete(id));
