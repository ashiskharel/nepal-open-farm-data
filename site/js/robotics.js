import { renderGallery } from "./photos.js"
import { listPhotos, loadFlag, loadPlace, saveFlag } from "./store.js"

const STOP_KEY = "field-desk-person-can-stop"

function requirement(done, text) {
  const item = document.createElement("li")
  item.className = done ? "ready" : "needed"
  item.textContent = `${done ? "Ready" : "Still needed"} — ${text}`
  return item
}

async function draw() {
  const place = loadPlace()
  const photos = await listPhotos()
  const beds = photos.filter((photo) => photo.placeTag === "bed" || photo.placeTag === "leaf").length
  const paths = photos.filter((photo) => photo.placeTag === "path").length
  const water = photos.filter((photo) => photo.placeTag === "water").length
  const named = photos.some((photo) => photo.cropId)
  const sent = photos.filter((photo) => photo.sent).length
  const elevationKnown = Number.isFinite(place?.elevation) || photos.some((photo) => photo.elevation != null)
  const landKnown = Number.isFinite(place?.lat) && Number.isFinite(place?.lon)
  const stopBox = document.querySelector("#can-stop")

  const list = document.querySelector("#requirements")
  list.replaceChildren(
    requirement(landKnown, "A land point is saved on this phone."),
    requirement(elevationKnown, "Elevation has been read for that land."),
    requirement(named, "At least one picture names the crop."),
    requirement(beds >= 3, `Three bed or leaf pictures. ${beds} saved.`),
    requirement(paths >= 1, `One path picture. ${paths} saved.`),
    requirement(water >= 1, `One water-source picture. ${water} saved.`),
    requirement(sent >= 1, `Pictures marked sent from this phone. ${sent} marked.`),
    requirement(stopBox.checked, "A person on the farm can stop a machine by hand.")
  )

  document.querySelector("#photo-count").textContent =
    `${photos.length} pictures on this phone. ${sent} marked sent. None of these machines can see them yet.`
  renderGallery(document.querySelector("#gallery"), photos, {})
}

const stopBox = document.querySelector("#can-stop")
stopBox.checked = loadFlag(STOP_KEY)
stopBox.addEventListener("change", () => {
  saveFlag(STOP_KEY, stopBox.checked)
  draw()
})
draw()
