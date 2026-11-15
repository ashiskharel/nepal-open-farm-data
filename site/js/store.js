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

export const YIELD_KEY = "nepal-field-yields"
export const SALE_KEY = "nepal-field-sales"
export const FEED_KEY = "nepal-field-feed"

export function loadRecords(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]")
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export function saveRecords(key, rows) {
  localStorage.setItem(key, JSON.stringify(rows))
}

export function loadFeed() {
  try {
    const value = JSON.parse(localStorage.getItem(FEED_KEY) || "null")
    if (!value || typeof value.url !== "string" || !value.url) return null
    return value
  } catch {
    return null
  }
}

export function saveFeed(feed) {
  if (!feed || !feed.url) localStorage.removeItem(FEED_KEY)
  else localStorage.setItem(FEED_KEY, JSON.stringify(feed))
}
