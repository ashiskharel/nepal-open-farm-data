const DB_NAME = "nepal-field-desk"
const STORE = "photos"
const PLACE_KEY = "nepal-field-place"

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function finish(db, mode, run) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const result = run(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
  })
}

export async function savePhoto(record) {
  const db = await openDb()
  await finish(db, "readwrite", (store) => {
    store.put(record)
  })
  db.close()
}

export async function listPhotos() {
  const db = await openDb()
  const rows = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly")
    const request = tx.objectStore(STORE).getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
  db.close()
  return rows.sort((a, b) => String(b.created).localeCompare(String(a.created)))
}

export async function deletePhoto(id) {
  const db = await openDb()
  await finish(db, "readwrite", (store) => {
    store.delete(id)
  })
  db.close()
}

export async function markSent(ids) {
  const wanted = new Set(ids)
  const rows = await listPhotos()
  const db = await openDb()
  await finish(db, "readwrite", (store) => {
    for (const row of rows) {
      if (!wanted.has(row.id)) continue
      row.sent = true
      store.put(row)
    }
  })
  db.close()
}

export function loadPlace() {
  try {
    return JSON.parse(localStorage.getItem(PLACE_KEY) || "null")
  } catch {
    return null
  }
}

export function savePlace(place) {
  localStorage.setItem(PLACE_KEY, JSON.stringify(place))
}

export function loadFlag(key) {
  return localStorage.getItem(key) === "yes"
}

export function saveFlag(key, on) {
  localStorage.setItem(key, on ? "yes" : "no")
}
