import { designRoom, planSvg } from "./design.js"
import { renderGallery, shrinkPhoto } from "./photos.js"
import { deletePhoto, listPhotos, loadPlace, savePhoto, savePlace } from "./store.js"

const status = document.querySelector("#status")
const canvas = document.querySelector("#marker")
const context = canvas.getContext("2d")
const MARKS = "nepal-field-room"

const state = {
  place: null,
  image: null,
  box: { x: 0.15, y: 0.2, w: 0.7, h: 0.55 },
  drag: null,
}

function say(message) {
  status.textContent = message
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

function phonePoint() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser has no location service."))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        source: "this phone",
        detail: Number.isFinite(position.coords.accuracy) ? `about ${Math.round(position.coords.accuracy)} m` : "",
      }),
      () => reject(new Error("Location was blocked. Use the land page, or the land already saved.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    )
  })
}

async function elevationAt(lat, lon) {
  const url = new URL("https://api.open-meteo.com/v1/elevation")
  url.searchParams.set("latitude", String(lat))
  url.searchParams.set("longitude", String(lon))
  const body = await fetch(url).then((response) => response.json())
  const value = body.elevation
  const elevation = Array.isArray(value) ? value[0] : value
  return Number.isFinite(Number(elevation)) ? Number(elevation) : null
}

function renderPlace() {
  const place = state.place
  const line = document.querySelector("#place-line")
  if (!place || !Number.isFinite(Number(place.lat))) {
    line.textContent = "No room point yet. Use this phone, or save the land on the land page."
    return
  }
  const where = place.districtName ? `${place.districtName}, ${place.province || ""}`.replace(/, $/, "") : `${Number(place.lat).toFixed(4)}, ${Number(place.lon).toFixed(4)}`
  const elevation = place.elevation != null ? `, about ${Math.round(place.elevation)} m` : ""
  line.textContent = `${where}${elevation}. ${place.source || ""}`.trim()
}

async function usePoint(point) {
  say("Reading elevation…")
  let elevation = null
  try {
    elevation = await elevationAt(point.lat, point.lon)
  } catch {
    elevation = null
  }
  state.place = {
    lat: point.lat,
    lon: point.lon,
    source: point.source,
    detail: point.detail || "",
    elevation,
  }
  renderPlace()
  say(elevation != null ? `This room point is about ${Math.round(elevation)} m. The saved farm land is left as it was.` : "Room point set. Elevation could not be read.")
}

function paint() {
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = "#1a1814"
  context.fillRect(0, 0, canvas.width, canvas.height)
  if (state.image) context.drawImage(state.image, 0, 0, canvas.width, canvas.height)
  const box = pixelBox()
  context.strokeStyle = "#f3ecdf"
  context.lineWidth = 4
  context.strokeRect(box.x, box.y, box.w, box.h)
  context.fillStyle = "rgba(141, 59, 22, 0.28)"
  context.fillRect(box.x, box.y, box.w, box.h)
}

function pixelBox() {
  const box = state.box
  return {
    x: box.x * canvas.width,
    y: box.y * canvas.height,
    w: box.w * canvas.width,
    h: box.h * canvas.height,
  }
}

function pointerBox(event) {
  const rect = canvas.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height
  return {
    x: Math.min(Math.max(x, 0), canvas.width),
    y: Math.min(Math.max(y, 0), canvas.height),
  }
}

function onPointerDown(event) {
  canvas.setPointerCapture(event.pointerId)
  const point = pointerBox(event)
  state.drag = point
  state.box = {
    x: point.x / canvas.width,
    y: point.y / canvas.height,
    w: 0.02,
    h: 0.02,
  }
  paint()
}

function onPointerMove(event) {
  if (!state.drag) return
  const point = pointerBox(event)
  const x = Math.min(state.drag.x, point.x) / canvas.width
  const y = Math.min(state.drag.y, point.y) / canvas.height
  const w = Math.abs(point.x - state.drag.x) / canvas.width
  const h = Math.abs(point.y - state.drag.y) / canvas.height
  state.box = { x, y, w: Math.max(w, 0.02), h: Math.max(h, 0.02) }
  paint()
}

function onPointerUp() {
  state.drag = null
}

async function roomPhotos() {
  const records = await listPhotos()
  return records.filter((record) => record.placeTag === "marked" || record.room)
}

async function refreshGallery() {
  renderGallery(document.querySelector("#room-gallery"), await roomPhotos(), {
    onDelete: async (id) => {
      await deletePhoto(id)
      await refreshGallery()
    },
  })
}

function loadFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("The photo could not be read."))
    }
    image.src = url
  })
}

async function saveMark() {
  if (!state.image) {
    say("Choose a photo first, then drag the box onto the floor.")
    return
  }
  if (state.box.w < 0.05 || state.box.h < 0.05) {
    say("Drag a larger box around the floor you can use.")
    return
  }
  say("Saving the marked photo on this phone…")
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("The marked photo could not be saved."))), "image/jpeg", 0.72)
  })
  const shrunk = await shrinkPhoto(new File([blob], "room.jpg", { type: "image/jpeg" }))
  await savePhoto({
    id: crypto.randomUUID(),
    created: new Date().toISOString(),
    lat: state.place?.lat ?? null,
    lon: state.place?.lon ?? null,
    districtId: state.place?.districtId || "",
    districtName: state.place?.districtName || "",
    elevation: state.place?.elevation ?? null,
    cropId: document.querySelector("#method").value,
    cropName: document.querySelector("#method").selectedOptions[0].textContent,
    placeTag: "marked",
    symptoms: [],
    symptomText: "",
    note: `Floor box ${state.box.w.toFixed(2)} by ${state.box.h.toFixed(2)} of the photo.`,
    sent: false,
    room: true,
    box: state.box,
    widthM: document.querySelector("#width-m").value.trim(),
    lengthM: document.querySelector("#length-m").value.trim(),
    blob: shrunk,
  })
  await refreshGallery()
  say("Marked photo saved on this phone. It was not uploaded.")
}

function design() {
  const card = document.querySelector("#design-card")
  card.replaceChildren()
  const result = designRoom({
    widthM: document.querySelector("#width-m").value,
    lengthM: document.querySelector("#length-m").value,
    method: document.querySelector("#method").value,
    water: document.querySelector("#water").value,
    elevation: state.place?.elevation,
    photoCount: document.querySelectorAll("#room-gallery img").length,
    marked: Boolean(state.image) || document.querySelectorAll("#room-gallery img").length > 0,
    requirement: document.querySelector("#requirement").value.trim(),
  })
  const stamp = el("p", "stamp", result.fits ? "Fits the box" : "Does not fit")
  card.append(stamp)
  if (result.shapes) {
    const holder = el("div")
    holder.innerHTML = planSvg(result)
    card.append(holder)
  }
  for (const line of result.lines) card.append(el("p", null, line))
  card.append(el("p", "note", "A hosted model is not connected. This page has no server to hold a key, and it does not send the photo anywhere."))
  localStorage.setItem(MARKS, JSON.stringify({
    widthM: document.querySelector("#width-m").value,
    lengthM: document.querySelector("#length-m").value,
    method: document.querySelector("#method").value,
    water: document.querySelector("#water").value,
    requirement: document.querySelector("#requirement").value,
  }))
  say(result.fits ? "The beds fit the box you measured." : "The sketch does not fit. The reason is on the card.")
}

function restoreForm() {
  try {
    const saved = JSON.parse(localStorage.getItem(MARKS) || "null")
    if (!saved) return
    document.querySelector("#width-m").value = saved.widthM || ""
    document.querySelector("#length-m").value = saved.lengthM || ""
    if (saved.method) document.querySelector("#method").value = saved.method
    if (saved.water) document.querySelector("#water").value = saved.water
    document.querySelector("#requirement").value = saved.requirement || ""
  } catch {
    /* an old note can be ignored */
  }
}

function bind() {
  document.querySelector("#use-phone").addEventListener("click", async () => {
    say("Asking this phone for its place…")
    try {
      await usePoint(await phonePoint())
    } catch (error) {
      say(error.message)
    }
  })
  document.querySelector("#use-saved").addEventListener("click", async () => {
    const saved = loadPlace()
    if (!saved || !Number.isFinite(Number(saved.lat))) {
      say("No land is saved yet. Set it on the land page, or use this phone.")
      return
    }
    state.place = saved
    if (saved.elevation == null) {
      try {
        state.place.elevation = await elevationAt(saved.lat, saved.lon)
        savePlace(state.place)
      } catch {
        /* elevation stays blank */
      }
    }
    renderPlace()
    say("Using the land saved on this phone.")
  })
  document.querySelector("#room-photo").addEventListener("change", async () => {
    const file = document.querySelector("#room-photo").files[0]
    if (!file) return
    try {
      state.image = await loadFile(file)
      state.box = { x: 0.15, y: 0.2, w: 0.7, h: 0.55 }
      paint()
      say("Drag the box onto the floor you can use.")
    } catch (error) {
      say(error.message)
    }
  })
  canvas.addEventListener("pointerdown", onPointerDown)
  canvas.addEventListener("pointermove", onPointerMove)
  canvas.addEventListener("pointerup", onPointerUp)
  canvas.addEventListener("pointercancel", onPointerUp)
  document.querySelector("#save-mark").addEventListener("click", () => {
    saveMark().catch((error) => say(error.message || "The marked photo was not saved."))
  })
  document.querySelector("#design").addEventListener("click", design)
}

async function boot() {
  state.place = loadPlace()
  restoreForm()
  renderPlace()
  paint()
  bind()
  await refreshGallery()
  say("Mark the floor, name the water, then design the room.")
}

boot()
