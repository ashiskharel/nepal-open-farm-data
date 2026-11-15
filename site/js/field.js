import { adFromBs, climateNotes, formatNumber, rankCrops, yearLabel } from "./advice.js"
import { findDistrict } from "./geo.js"
import { buildReport, renderGallery, shrinkPhoto } from "./photos.js"
import { deletePhoto, listPhotos, loadPlace, markSent, savePhoto, savePlace } from "./store.js"

const status = document.querySelector("#status")
const placeCard = document.querySelector("#place-card")
const climateCard = document.querySelector("#climate-card")
const cropList = document.querySelector("#crops")
const indoor = document.querySelector("#indoor")
const gallery = document.querySelector("#gallery")
const photoCount = document.querySelector("#photo-count")
const mapFrame = document.querySelector("#map")
const districtInput = document.querySelector("#district-search")
const districtList = document.querySelector("#district-list")
const yearInput = document.querySelector("#year-input")
const yearResult = document.querySelector("#year-result")
const yearTable = document.querySelector("#year-table")
const photoForm = document.querySelector("#photo-form")
const photoCrop = document.querySelector("#photo-crop")
const symptomBox = document.querySelector("#symptoms")

const app = {
  boundaries: null,
  plants: null,
  symptoms: [],
  chemicalNote: "",
  stats: null,
  years: null,
  place: null,
  climate: null,
  ranked: [],
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

function addRow(parent, label, value) {
  const row = el("div", "stat")
  row.append(el("span", "stat-label", label), el("strong", null, value))
  parent.append(row)
}

async function readJson(path) {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`Could not load ${path}`)
  return response.json()
}

function mean(values) {
  const numbers = (values || []).filter((value) => Number.isFinite(value))
  if (!numbers.length) return null
  return numbers.reduce((total, value) => total + value, 0) / numbers.length
}

function total(values) {
  const numbers = (values || []).filter((value) => Number.isFinite(value))
  if (!numbers.length) return null
  return numbers.reduce((sum, value) => sum + value, 0)
}

function isoDate(date) {
  return date.toISOString().slice(0, 10)
}

async function loadClimate(lat, lon) {
  const end = new Date()
  end.setUTCDate(end.getUTCDate() - 1)
  const start = new Date(end)
  start.setUTCFullYear(start.getUTCFullYear() - 1)
  const currentUrl = new URL("https://api.open-meteo.com/v1/forecast")
  currentUrl.searchParams.set("latitude", String(lat))
  currentUrl.searchParams.set("longitude", String(lon))
  currentUrl.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,precipitation,cloud_cover,shortwave_radiation,wind_speed_10m"
  )
  currentUrl.searchParams.set("timezone", "auto")
  const archiveUrl = new URL("https://archive-api.open-meteo.com/v1/archive")
  archiveUrl.searchParams.set("latitude", String(lat))
  archiveUrl.searchParams.set("longitude", String(lon))
  archiveUrl.searchParams.set("start_date", isoDate(start))
  archiveUrl.searchParams.set("end_date", isoDate(end))
  archiveUrl.searchParams.set(
    "daily",
    "temperature_2m_mean,precipitation_sum,relative_humidity_2m_mean,shortwave_radiation_sum"
  )
  archiveUrl.searchParams.set("timezone", "auto")
  const elevationUrl = new URL("https://api.open-meteo.com/v1/elevation")
  elevationUrl.searchParams.set("latitude", String(lat))
  elevationUrl.searchParams.set("longitude", String(lon))

  const [currentRes, archiveRes, elevationRes] = await Promise.allSettled([
    fetch(currentUrl).then((response) => response.json()),
    fetch(archiveUrl).then((response) => response.json()),
    fetch(elevationUrl).then((response) => response.json()),
  ])
  const climate = {}
  if (elevationRes.status === "fulfilled") {
    const value = elevationRes.value.elevation
    climate.elevation = Array.isArray(value) ? value[0] : value
  }
  if (currentRes.status === "fulfilled" && currentRes.value.current) {
    const now = currentRes.value.current
    climate.temperature = now.temperature_2m
    climate.humidityNow = now.relative_humidity_2m
    climate.solarNow = now.shortwave_radiation
    climate.cloud = now.cloud_cover
    climate.rainNow = now.precipitation
    climate.wind = now.wind_speed_10m
  }
  if (archiveRes.status === "fulfilled" && archiveRes.value.daily) {
    const daily = archiveRes.value.daily
    climate.rain = total(daily.precipitation_sum)
    climate.humidity = mean(daily.relative_humidity_2m_mean)
    climate.solar = mean(daily.shortwave_radiation_sum)
    climate.temperatureYear = mean(daily.temperature_2m_mean)
  }
  return climate
}

async function networkPoint() {
  try {
    const geo = await fetch("https://get.geojs.io/v1/ip/geo.json").then((response) => response.json())
    const lat = Number(geo.latitude)
    const lon = Number(geo.longitude)
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return {
        lat,
        lon,
        source: "network address",
        detail: [geo.city, geo.country].filter(Boolean).join(", "),
      }
    }
  } catch {
    /* try the second service */
  }
  const who = await fetch("https://ipwho.is/").then((response) => response.json())
  if (!who.success) throw new Error("The network address did not return a place.")
  return {
    lat: Number(who.latitude),
    lon: Number(who.longitude),
    source: "network address",
    detail: [who.city, who.country].filter(Boolean).join(", "),
  }
}

function phonePoint() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser has no location service."))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const accuracy = position.coords.accuracy
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          source: "this phone",
          detail: Number.isFinite(accuracy) ? `about ${Math.round(accuracy)} m` : "",
        })
      },
      () => reject(new Error("Location was blocked. Choose a district, or type the coordinates.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    )
  })
}

function showMap(lat, lon) {
  const pad = 0.06
  const box = [lon - pad, lat - pad, lon + pad, lat + pad].map((value) => value.toFixed(4)).join(",")
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(box)}&layer=mapnik&marker=${lat}%2C${lon}`
  mapFrame.src = src
  mapFrame.hidden = false
}

function renderPlace() {
  const place = app.place
  placeCard.replaceChildren()
  if (!place) return
  placeCard.append(el("h2", null, "The land"))
  const feature = place.districtId
    ? app.boundaries.features.find((item) => item.properties.id === place.districtId)
    : null
  if (feature) {
    addRow(placeCard, "District", `${feature.properties.name}, ${feature.properties.province}`)
  } else {
    placeCard.append(el("p", null, "This point is outside the Nepal district map. The crop tables cover Nepal."))
  }
  addRow(placeCard, "Coordinates", `${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}`)
  const source = place.detail ? `${place.source} (${place.detail})` : place.source
  addRow(placeCard, "From", source)
  if (place.source === "network address") {
    placeCard.append(el("p", null, "A network address is often the town, not the plot. Stand on the land and use the phone's place when you can."))
  }
  if (place.source === "district list") {
    placeCard.append(el("p", null, "This is a point inside the district, not a surveyed boundary of one farm."))
  }
}

function renderClimate() {
  const climate = app.climate
  climateCard.replaceChildren()
  climateCard.append(el("h2", null, "Elevation, sun, and humidity"))
  if (!climate || (climate.elevation == null && climate.temperature == null && climate.rain == null)) {
    climateCard.append(el("p", null, "Weather did not load. The district crop figures can still be used."))
    return
  }
  if (climate.elevation != null) addRow(climateCard, "Elevation", `${Math.round(climate.elevation)} m`)
  if (climate.temperature != null) addRow(climateCard, "Temperature now", `${climate.temperature} °C`)
  if (climate.humidityNow != null) addRow(climateCard, "Humidity now", `${Math.round(climate.humidityNow)}%`)
  if (climate.solarNow != null) addRow(climateCard, "Sunlight now", `${Math.round(climate.solarNow)} W/m²`)
  if (climate.cloud != null) addRow(climateCard, "Cloud now", `${Math.round(climate.cloud)}%`)
  if (climate.rainNow != null) addRow(climateCard, "Rain now", `${climate.rainNow} mm`)
  if (climate.wind != null) addRow(climateCard, "Wind now", `${climate.wind} km/h`)
  if (climate.temperatureYear != null) {
    addRow(climateCard, "Mean temperature, last year", `${climate.temperatureYear.toFixed(1)} °C`)
  }
  if (climate.humidity != null) addRow(climateCard, "Mean humidity, last year", `${Math.round(climate.humidity)}%`)
  if (climate.solar != null) addRow(climateCard, "Mean sunlight, last year", `${climate.solar.toFixed(1)} MJ/m² a day`)
  if (climate.rain != null) addRow(climateCard, "Rain, last year", `${Math.round(climate.rain)} mm`)
  climateCard.append(el("p", "note", "Weather and elevation are from Open-Meteo. They describe this point, not a ministry station."))
}

function renderCrops() {
  cropList.replaceChildren()
  indoor.replaceChildren()
  const place = app.place
  if (!place) return
  app.ranked = place.districtId
    ? rankCrops({
        elevation: app.climate?.elevation ?? null,
        districtId: place.districtId,
        plants: app.plants,
        stats: app.stats,
      })
    : []
  if (!place.districtId) {
    cropList.append(el("p", null, "Pick a Nepal district to see what the yearbook records there."))
  } else if (!app.ranked.length) {
    cropList.append(
      el(
        "p",
        null,
        "No yearbook field crop is a strong match for this elevation. If the phone is not on the land, choose the district."
      )
    )
  }
  for (const item of app.ranked) {
    const card = el("article", "card")
    card.append(el("h3", null, `${item.plant.en} · ${item.plant.ne}`))
    if (item.plant.scientific) card.append(el("p", "latin", item.plant.scientific))
    for (const reason of item.reasons) card.append(el("p", null, reason))
    for (const note of climateNotes(item.plant.id, app.climate)) card.append(el("p", null, note))
    const care = document.createElement("details")
    care.append(el("summary", null, "How to keep it"))
    for (const line of item.plant.care) care.append(el("p", null, line))
    card.append(care)
    cropList.append(card)
  }

  const mushroom = app.plants.find((plant) => plant.indoor)
  if (!mushroom) return
  const card = el("article", "card")
  card.append(el("h3", null, `${mushroom.en} · ${mushroom.ne}`))
  card.append(el("p", null, "Under a roof. The land's elevation does not decide this crop. The yearbook series is national."))
  const latest = app.stats.mushroom[app.stats.mushroom.length - 1]
  if (latest) {
    card.append(
      el(
        "p",
        null,
        `Fresh production ${formatNumber(latest.fresh_mt)} mt in ${yearLabel(latest.bs, latest.ad)}. The table prints the AD year. The BS pair is the same fiscal year.`
      )
    )
  }
  const care = document.createElement("details")
  care.append(el("summary", null, "How to keep it"))
  for (const line of mushroom.care) care.append(el("p", null, line))
  card.append(care)
  indoor.append(card)
}

async function applyPoint(point) {
  const feature = findDistrict(app.boundaries, point.lon, point.lat)
  app.place = {
    lat: point.lat,
    lon: point.lon,
    source: point.source,
    detail: point.detail || "",
    districtId: feature ? feature.properties.id : "",
    districtName: feature ? feature.properties.name : "",
    province: feature ? feature.properties.province : "",
    currentLabel: yearLabel(app.stats.current.bs, app.stats.current.ad),
  }
  savePlace(app.place)
  showMap(point.lat, point.lon)
  renderPlace()
  say("Reading elevation, humidity, and sunlight…")
  try {
    app.climate = await loadClimate(point.lat, point.lon)
  } catch {
    app.climate = {}
  }
  renderClimate()
  renderCrops()
  app.place.elevation = app.climate?.elevation ?? null
  savePlace(app.place)
  const where = app.place.districtName || "a point outside the district map"
  say(`Showing ${where}.`)
}

function fillDistricts() {
  const features = [...app.boundaries.features].sort((a, b) =>
    a.properties.name.localeCompare(b.properties.name)
  )
  for (const feature of features) {
    const option = document.createElement("option")
    option.value = feature.properties.name
    districtList.append(option)
  }
}

function useDistrictName(name) {
  const feature = app.boundaries.features.find(
    (item) => item.properties.name.toLowerCase() === name.trim().toLowerCase()
  )
  if (!feature) {
    say("That district is not in the list. Pick one of the 77 names.")
    return
  }
  const [lon, lat] = feature.properties.point
  applyPoint({ lat, lon, source: "district list", detail: feature.properties.name })
}

function fillCrops() {
  for (const plant of app.plants) {
    const option = document.createElement("option")
    option.value = plant.id
    option.textContent = `${plant.en} · ${plant.ne}`
    photoCrop.append(option)
  }
  for (const symptom of app.symptoms) {
    const label = document.createElement("label")
    label.className = "check"
    const input = document.createElement("input")
    input.type = "checkbox"
    input.value = symptom.id
    label.append(input, document.createTextNode(` ${symptom.label} · ${symptom.ne}`))
    symptomBox.append(label)
  }
}

function renderYearTable() {
  yearTable.replaceChildren()
  for (const row of app.years.years) {
    if (row.kind !== "printed_fiscal" && row.kind !== "mushroom_series") continue
    const item = document.createElement("li")
    const kind = row.kind === "printed_fiscal" ? "Yearbook tables" : "Mushroom series"
    item.textContent = `${yearLabel(row.bs, row.ad)} — ${kind}`
    yearTable.append(item)
  }
}

function convertYear() {
  const text = yearInput.value.trim()
  if (!text) {
    yearResult.textContent = ""
    return
  }
  const compact = text.replace(/\s+/g, "")
  const known = app.years.years.find((row) => row.bs === compact || row.ad === compact)
  if (known) {
    yearResult.textContent = `${yearLabel(known.bs, known.ad)}. ${known.note}`
    return
  }
  const converted = adFromBs(compact)
  if (!converted) {
    yearResult.textContent = "Use a fiscal pair such as 2081/82."
    return
  }
  yearResult.textContent = `${yearLabel(converted.bs, converted.ad)}. ${app.years.rule}`
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

async function onPhotoSubmit(event) {
  event.preventDefault()
  const file = document.querySelector("#photo-file").files[0]
  if (!file) {
    say("Choose a photo first.")
    return
  }
  const plant = app.plants.find((item) => item.id === photoCrop.value)
  const selected = [...symptomBox.querySelectorAll("input:checked")].map((input) => input.value)
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
      elevation: app.climate?.elevation ?? null,
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
  photoForm.reset()
  await refreshGallery()
  say("Photo saved on this phone. It is not on a server until you send the field pack.")
}

async function sendPack() {
  const records = await listPhotos()
  const pending = records.filter((record) => !record.sent)
  const shareRecords = pending.length ? pending : records
  const mushroom = app.plants.find((plant) => plant.indoor)
  const report = buildReport({
    place: app.place,
    climate: app.climate,
    ranked: app.ranked,
    mushroom,
    chemicalNote: app.chemicalNote,
  })
  const files = shareRecords.map(
    (record) => new File([record.blob], `field-${record.id}.jpg`, { type: "image/jpeg" })
  )
  const payload = { title: "Nepal field pack", text: report }
  const withFiles = files.length > 0 && navigator.canShare && navigator.canShare({ files })
  if (withFiles) payload.files = files
  try {
    if (navigator.share) {
      await navigator.share(payload)
      if (withFiles) await markSent(shareRecords.map((record) => record.id))
      await refreshGallery()
      say(withFiles
        ? "Share sheet opened. Pictures included in that send are marked sent on this phone."
        : "Share sheet opened with the text pack. This browser did not attach the photos.")
      return
    }
  } catch (error) {
    if (error && error.name === "AbortError") {
      say("Send cancelled.")
      return
    }
  }
  const blob = new Blob([report], { type: "text/plain" })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = "field-pack.txt"
  link.click()
  URL.revokeObjectURL(link.href)
  say("This browser could not open a share sheet. The text pack downloaded. Send the photos from the gallery yourself.")
}

function bind() {
  document.querySelector("#use-phone").addEventListener("click", async () => {
    say("Asking this phone for its place…")
    try {
      await applyPoint(await phonePoint())
    } catch (error) {
      say(error.message)
    }
  })
  document.querySelector("#use-network").addEventListener("click", async () => {
    say("Reading the network address…")
    try {
      await applyPoint(await networkPoint())
    } catch (error) {
      say(error.message || "The network address could not be read.")
    }
  })
  document.querySelector("#use-district").addEventListener("click", () => useDistrictName(districtInput.value))
  districtInput.addEventListener("change", () => useDistrictName(districtInput.value))
  document.querySelector("#use-coordinates").addEventListener("click", () => {
    const lat = Number(document.querySelector("#lat").value)
    const lon = Number(document.querySelector("#lon").value)
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      say("Enter latitude and longitude as decimal degrees.")
      return
    }
    applyPoint({ lat, lon, source: "typed coordinates", detail: "" })
  })
  yearInput.addEventListener("input", convertYear)
  photoForm.addEventListener("submit", onPhotoSubmit)
  document.querySelector("#send-pack").addEventListener("click", sendPack)
}

async function boot() {
  say("Loading district boundaries and yearbook figures…")
  try {
    const [boundaries, crops, stats, years] = await Promise.all([
      readJson("./data/districts.geojson"),
      readJson("./data/crops.json"),
      readJson("./data/district-crops.json"),
      readJson("./data/years.json"),
    ])
    app.boundaries = boundaries
    app.plants = crops.plants
    app.symptoms = crops.symptoms
    app.chemicalNote = crops.chemical_note
    app.stats = stats
    app.years = years
    document.querySelector("#bands-note").textContent = crops.bands_note
    document.querySelector("#chemical-note").textContent = crops.chemical_note
    fillDistricts()
    fillCrops()
    renderYearTable()
    bind()
    await refreshGallery()
    const saved = loadPlace()
    if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) {
      await applyPoint({
        lat: saved.lat,
        lon: saved.lon,
        source: saved.source || "saved on this phone",
        detail: saved.detail || "",
      })
    } else {
      say("Choose the land to begin. Photos you add stay on this phone.")
    }
  } catch (error) {
    say(error.message || "The desk could not load its data.")
  }
}

boot()
