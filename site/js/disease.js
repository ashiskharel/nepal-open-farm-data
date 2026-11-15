import { renderGallery, shrinkPhoto } from "./photos.js"
import { listPhotos, loadPlace, markSent, savePhoto, deletePhoto } from "./store.js"

const status = document.querySelector("#status")
const gallery = document.querySelector("#gallery")
const photoCount = document.querySelector("#photo-count")
const form = document.querySelector("#photo-form")

const app = { plants: [], symptoms: [], chemicalNote: "", place: null }

function say(message) {
  status.textContent = message
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

async function refreshGallery() {
  const records = await listPhotos()
  const sent = records.filter((record) => record.sent).length
  photoCount.textContent = `${records.length} on this phone. ${sent} marked sent.`
  renderGallery(gallery, records, {
    onDelete: async (id) => {
      await deletePhoto(id)
      await refreshGallery()
    },
  })
}

function reportText(records) {
  const lines = ["Disease check — Nepal field desk"]
  const place = app.place
  if (place?.districtName) lines.push(`Land: ${place.districtName}${place.province ? `, ${place.province}` : ""}`)
  lines.push("A disease name is not read from the photo. The ticks are what was seen.")
  lines.push(app.chemicalNote)
  if (!records.length) lines.push("No photo is saved on this phone.")
  for (const record of records) {
    lines.push(`- ${record.created?.slice(0, 10) || ""} ${record.cropName || ""} ${record.placeTag || ""}`)
    if (record.symptomText) lines.push(`  ${record.symptomText}`)
    if (record.note) lines.push(`  ${record.note}`)
  }
  lines.push("Photos stay on the phone until this pack is shared.")
  return lines.join("\n")
}

async function sendPack() {
  const records = await listPhotos()
  const pending = records.filter((record) => !record.sent)
  const shareRecords = pending.length ? pending : records
  const files = shareRecords.map((record) => new File([record.blob], `field-${record.id}.jpg`, { type: "image/jpeg" }))
  const payload = { title: "Nepal disease check", text: reportText(shareRecords) }
  const withFiles = files.length > 0 && navigator.canShare && navigator.canShare({ files })
  if (withFiles) payload.files = files
  try {
    if (navigator.share) {
      await navigator.share(payload)
      if (withFiles) await markSent(shareRecords.map((record) => record.id))
      await refreshGallery()
      say(withFiles ? "Share sheet opened. Pictures in that send are marked sent on this phone." : "Share sheet opened with the text. This browser did not attach the photos.")
      return
    }
  } catch (error) {
    if (error && error.name === "AbortError") {
      say("Send cancelled.")
      return
    }
  }
  const blob = new Blob([payload.text], { type: "text/plain" })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = "disease-check.txt"
  link.click()
  URL.revokeObjectURL(link.href)
  say("This browser could not open a share sheet. The text file downloaded.")
}

async function onSubmit(event) {
  event.preventDefault()
  const file = document.querySelector("#photo-file").files[0]
  if (!file) {
    say("Choose a photo first.")
    return
  }
  const plant = app.plants.find((item) => item.id === document.querySelector("#photo-crop").value)
  const selected = [...document.querySelectorAll("#symptoms input:checked")].map((input) => input.value)
  const texts = app.symptoms.filter((symptom) => selected.includes(symptom.id))
  say("Saving the photo on this phone…")
  try {
    const blob = await shrinkPhoto(file)
    await savePhoto({
      id: crypto.randomUUID(),
      created: new Date().toISOString(),
      lat: app.place?.lat ?? null,
      lon: app.place?.lon ?? null,
      districtId: app.place?.districtId || "",
      districtName: app.place?.districtName || "",
      elevation: app.place?.elevation ?? null,
      cropId: plant?.id || "",
      cropName: plant ? `${plant.en} · ${plant.ne}` : "",
      placeTag: document.querySelector("#photo-place").value,
      symptoms: selected,
      symptomText: texts.map((symptom) => symptom.care).join(" "),
      note: document.querySelector("#photo-note").value.trim(),
      sent: false,
      blob,
    })
  } catch (error) {
    say(error.message || "The photo was not saved.")
    return
  }
  form.reset()
  await refreshGallery()
  say("Photo saved on this phone. It is not on a server.")
}

async function boot() {
  say("Loading the field checks…")
  try {
    const crops = await fetch("./data/crops.json").then((response) => response.json())
    app.plants = crops.plants
    app.symptoms = crops.symptoms
    app.chemicalNote = crops.chemical_note
    app.place = loadPlace()
    document.querySelector("#chemical-note").textContent = crops.chemical_note
    const place = app.place
    document.querySelector("#place-line").textContent = place?.districtName
      ? `Land saved on this phone: ${place.districtName}${place.province ? `, ${place.province}` : ""}.`
      : "No land is saved yet. The land page can set it. This check still saves on the phone."
    const select = document.querySelector("#photo-crop")
    for (const plant of app.plants) {
      const option = el("option", null, `${plant.en} · ${plant.ne}`)
      option.value = plant.id
      select.append(option)
    }
    const box = document.querySelector("#symptoms")
    for (const symptom of app.symptoms) {
      const label = el("label", "check")
      const input = document.createElement("input")
      input.type = "checkbox"
      input.value = symptom.id
      label.append(input, document.createTextNode(` ${symptom.label} · ${symptom.ne}`))
      box.append(label)
    }
    form.addEventListener("submit", onSubmit)
    document.querySelector("#send-pack").addEventListener("click", sendPack)
    await refreshGallery()
    say("Tick what you see. The photo stays on this phone.")
  } catch (error) {
    say(error.message || "The disease page could not load.")
  }
}

boot()
