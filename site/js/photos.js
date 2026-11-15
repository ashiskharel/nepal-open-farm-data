import { yearLabel } from "./advice.js"

const liveUrls = []

const PLACE_LABEL = {
  bed: "Bed or tree",
  leaf: "Leaf or fruit",
  path: "Path",
  water: "Water source",
  other: "Other",
}

export function placeLabel(tag) {
  return PLACE_LABEL[tag] || "Photo"
}

export function shrinkPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const longest = Math.max(image.width, image.height)
      const scale = longest > 1280 ? 1280 / longest : 1
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext("2d")
      if (!context) {
        URL.revokeObjectURL(url)
        reject(new Error("This browser could not shrink the photo."))
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url)
          if (!blob) reject(new Error("This browser could not save the photo."))
          else resolve(blob)
        },
        "image/jpeg",
        0.72
      )
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("The photo could not be read."))
    }
    image.src = url
  })
}

export function renderGallery(container, records, handlers) {
  for (const url of liveUrls) URL.revokeObjectURL(url)
  liveUrls.length = 0
  container.replaceChildren()
  if (!records.length) {
    const empty = document.createElement("p")
    empty.textContent = "No pictures on this phone yet."
    container.append(empty)
    return
  }
  for (const record of records) {
    const card = document.createElement("article")
    card.className = "photo-card"
    const image = document.createElement("img")
    image.alt = record.note || placeLabel(record.placeTag)
    const src = URL.createObjectURL(record.blob)
    liveUrls.push(src)
    image.src = src
    card.append(image)
    const meta = document.createElement("p")
    const when = record.created ? record.created.slice(0, 16).replace("T", " ") : ""
    const sent = record.sent ? "Marked sent" : "On this phone"
    meta.textContent = `${placeLabel(record.placeTag)} · ${sent} · ${when}`
    card.append(meta)
    if (record.cropName) {
      const crop = document.createElement("p")
      crop.textContent = record.cropName
      card.append(crop)
    }
    if (record.symptomText) {
      const symptom = document.createElement("p")
      symptom.textContent = record.symptomText
      card.append(symptom)
    }
    if (record.note) {
      const note = document.createElement("p")
      note.textContent = record.note
      card.append(note)
    }
    if (handlers.onDelete) {
      const button = document.createElement("button")
      button.type = "button"
      button.textContent = "Remove from this phone"
      button.addEventListener("click", () => handlers.onDelete(record.id))
      card.append(button)
    }
    container.append(card)
  }
}

export function buildReport({ place, climate, ranked, mushroom, chemicalNote, bookText }) {
  const lines = ["Nepal field desk"]
  if (place) {
    lines.push(`Place: ${place.lat}, ${place.lon} (${place.source})`)
    if (place.districtName) {
      lines.push(`District: ${place.districtName}${place.province ? `, ${place.province}` : ""}`)
    } else {
      lines.push("District: outside the Nepal district map, or not found.")
    }
  }
  if (climate) {
    if (climate.elevation != null) lines.push(`Elevation: ${Math.round(climate.elevation)} m`)
    if (climate.temperature != null) lines.push(`Temperature now: ${climate.temperature} °C`)
    if (climate.humidityNow != null) lines.push(`Humidity now: ${climate.humidityNow}%`)
    if (climate.solarNow != null) lines.push(`Sunlight now: ${climate.solarNow} W/m²`)
    if (climate.rain != null) lines.push(`Rain over the recent year: ${Math.round(climate.rain)} mm`)
    if (climate.humidity != null) lines.push(`Mean humidity over that year: ${Math.round(climate.humidity)}%`)
    if (climate.solar != null) lines.push(`Mean sunlight over that year: ${climate.solar.toFixed(1)} MJ/m² per day`)
  }
  lines.push("")
  lines.push("Crops from the MoALD district tables, plus the elevation band used by this desk:")
  if (!ranked.length) {
    lines.push("No strong field-crop match for this point.")
  }
  for (const item of ranked) {
    lines.push(`- ${item.plant.en} (${item.plant.ne})`)
    for (const reason of item.reasons) lines.push(`  ${reason}`)
  }
  if (mushroom) {
    lines.push("")
    lines.push(`${mushroom.en} (${mushroom.ne}) can be grown under a roof. The series is national, not a district area.`)
  }
  lines.push("")
  lines.push(chemicalNote)
  lines.push("Photos stay on the phone until this pack is shared. The share sheet is the send step.")
  if (bookText) {
    lines.push("")
    lines.push(bookText)
  }
  if (place?.currentLabel) lines.push(`Yearbook year: ${place.currentLabel}`)
  return lines.join("\n")
}

export function yearLine(bs, ad) {
  return yearLabel(bs, ad)
}
