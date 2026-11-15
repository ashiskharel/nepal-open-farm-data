import { formatNumber, yearLabel } from "./advice.js"
import { loadFeed, loadPlace, loadRecords, SALE_KEY, saveFeed, saveRecords, YIELD_KEY } from "./store.js"
import {
  PRICE_LOTS,
  atDistrictRate,
  besideWholesale,
  cleanFeedUrl,
  describeReadings,
  forecastLines,
  ledgerText,
  marketTier,
  matchLots,
  mushroomLines,
  rankMarkets,
  repeatChange,
  saleBands,
  yearbookRate,
} from "./yield.js"

const status = document.querySelector("#status")
const KALIMATI_URL = "https://kalimatimarket.gov.np/api/daily-prices/en"
const CHANNEL = { wholesale: "Wholesale yard", haat: "Local haat", shop: "Shop or store" }
const TIER = { district: "In this district", province: "In this province", other: "Another province" }

const app = {
  plants: [],
  stats: null,
  markets: [],
  marketNote: "",
  federalUrl: "",
  place: null,
  prices: null,
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

function today() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}

function selectedPlant() {
  const id = document.querySelector("#crop").value
  return app.plants.find((plant) => plant.id === id) || app.plants[0]
}

function cropYields() {
  const plant = selectedPlant()
  return loadRecords(YIELD_KEY).filter((row) => row.cropId === plant.id)
}

function cropSales() {
  const plant = selectedPlant()
  return loadRecords(SALE_KEY).filter((row) => row.cropId === plant.id)
}

function numberValue(id) {
  const text = document.querySelector(id).value.trim()
  if (!text) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

function renderPlace() {
  const line = document.querySelector("#place-line")
  const place = app.place
  if (!place || !place.districtName) {
    line.textContent = "No land is saved on this phone yet. Set it on the land page and the district yield will follow that district. Until then the national yearbook figure is shown."
    return
  }
  line.textContent = `${place.districtName}${place.province ? `, ${place.province}` : ""}. Change the land on the land page.`
}

function scopeRows(plant) {
  const districtId = app.place?.districtId
  const district = districtId ? app.stats.districts[districtId] : null
  const hasDistrict = district && (district.current[plant.id] || district.previous[plant.id])
  if (hasDistrict) {
    return {
      label: `${app.place.districtName} district yearbook figure`,
      current: district.current[plant.id] || null,
      previous: district.previous[plant.id] || null,
    }
  }
  return {
    label: "National yearbook figure. This district has no row for this crop, or no land is saved.",
    current: app.stats.national.current[plant.id] || null,
    previous: app.stats.national.previous[plant.id] || null,
  }
}

function renderForecast() {
  const card = document.querySelector("#forecast-card")
  card.replaceChildren()
  const plant = selectedPlant()
  if (!plant) return
  const mushroom = plant.id === "cultivated_mushroom"
  document.querySelector("#estimate-area").disabled = mushroom
  document.querySelector("#estimate-unit").disabled = mushroom
  if (mushroom) {
    card.append(el("h3", null, `${plant.en} · ${plant.ne}`))
    for (const line of mushroomLines(app.stats.mushroom)) card.append(el("p", null, line))
    return
  }
  const scope = scopeRows(plant)
  const rate = yearbookRate(plant.id, scope.current)
  const priorRate = yearbookRate(plant.id, scope.previous)
  const repeated = repeatChange(rate, priorRate)
  const readings = describeReadings(cropYields())
  const area = numberValue("#estimate-area")
  const areaUnit = document.querySelector("#estimate-unit").value
  const areaResult = atDistrictRate(rate, area, areaUnit)
  const areaRepeat = repeated && !repeated.belowZero
    ? atDistrictRate({ value: repeated.next, unit: repeated.unit }, area, areaUnit)
    : null
  const yearCurrent = yearLabel(app.stats.current.bs, app.stats.current.ad)
  const yearPrevious = yearLabel(app.stats.previous.bs, app.stats.previous.ad)
  const lines = forecastLines({
    crop: plant,
    placeLabel: scope.label,
    yearCurrent,
    yearPrevious,
    rate,
    priorRate,
    repeated,
    readings,
    areaResult,
    areaRepeat,
  })
  card.append(el("h3", null, lines[0]))
  for (const line of lines.slice(1)) card.append(el("p", null, line))
  if (!rate && scope.current) {
    if (scope.current.area_ha != null) addRow(card, "Total area", `${formatNumber(scope.current.area_ha)} ha`)
    if (scope.current.production != null) addRow(card, "Production", `${formatNumber(scope.current.production)} ${scope.current.production_unit || ""}`)
  }
}

function renderYields() {
  const list = document.querySelector("#yield-list")
  list.replaceChildren()
  const rows = loadRecords(YIELD_KEY)
  if (!rows.length) {
    list.append(el("p", "note", "No yield is saved on this phone."))
    return
  }
  for (const row of rows) {
    const card = el("article", "card")
    card.append(el("h3", null, row.cropName || row.cropId))
    addRow(card, "Date", row.date || "")
    addRow(card, "Amount", `${row.amount} ${row.unit}`)
    if (row.area) addRow(card, "Area", `${row.area} ${row.areaUnit === "m2" ? "m²" : "ha"}`)
    if (row.note) card.append(el("p", null, row.note))
    const button = el("button", "secondary", "Remove from this phone")
    button.type = "button"
    button.addEventListener("click", () => {
      saveRecords(YIELD_KEY, loadRecords(YIELD_KEY).filter((item) => item.id !== row.id))
      renderYields()
      renderForecast()
      say("Yield removed from this phone.")
    })
    card.append(button)
    list.append(card)
  }
}

function renderFeed() {
  const feed = loadFeed()
  const line = document.querySelector("#feed-line")
  if (!feed) {
    line.textContent = "No camera address is saved. Saving one later still does not connect the camera."
    return
  }
  line.textContent = `Address saved on this phone on ${feed.savedAt.slice(0, 10)}. This page does not open it. ${feed.url}`
}

function renderSales() {
  const list = document.querySelector("#sale-list")
  const compare = document.querySelector("#sale-compare")
  list.replaceChildren()
  compare.replaceChildren()
  const plant = selectedPlant()
  const mine = cropSales()
  compare.append(el("h3", null, plant ? `${plant.en} prices you typed` : "Prices you typed"))
  const bands = saleBands(mine)
  const labels = [["wholesale", "Your wholesale prices"], ["haat", "Your local-haat prices"], ["shop", "Your shop or store prices"]]
  let any = false
  for (const [channel, label] of labels) {
    const band = bands[channel]
    if (!band) continue
    any = true
    if (band.mixedUnits) {
      compare.append(el("p", null, `${label}: ${band.count} sales with mixed units, so no average.`))
    } else {
      compare.append(el("p", null, `${label}: ${formatNumber(band.average)} NPR per ${band.unit} across ${band.count} sale${band.count === 1 ? "" : "s"} (low ${formatNumber(band.min)}, high ${formatNumber(band.max)}).`))
    }
  }
  if (!any) compare.append(el("p", null, "No sale of this crop is saved yet. A haat price and a shop price appear here only after you type them."))
  const lots = app.prices ? matchLots(plant?.id, app.prices.prices) : []
  if (lots.length && mine.length) {
    for (const sale of mine) {
      for (const lot of lots) {
        const side = besideWholesale(sale.priceNpr, sale.unit, lot)
        if (!side) continue
        compare.append(el("p", null, `${sale.date} ${CHANNEL[sale.channel] || sale.channel}: ${formatNumber(sale.priceNpr)} NPR/kg beside Kalimati ${lot.commodityname} average ${formatNumber(side.average)} NPR/kg (${formatNumber(side.difference)} NPR). Kalimati is Kathmandu wholesale.`))
      }
    }
  }

  const rows = loadRecords(SALE_KEY)
  if (!rows.length) {
    list.append(el("p", "note", "No sale is saved on this phone."))
    return
  }
  for (const row of rows) {
    const card = el("article", "card")
    card.append(el("h3", null, row.cropName || row.cropId))
    addRow(card, "Date", row.date || "")
    addRow(card, "Channel", CHANNEL[row.channel] || row.channel)
    if (row.buyer) addRow(card, "Buyer", row.buyer)
    addRow(card, "Quantity", `${row.quantity} ${row.unit}`)
    addRow(card, "Price", `${formatNumber(row.priceNpr)} NPR per ${row.unit}`)
    const button = el("button", "secondary", "Remove from this phone")
    button.type = "button"
    button.addEventListener("click", () => {
      saveRecords(SALE_KEY, loadRecords(SALE_KEY).filter((item) => item.id !== row.id))
      renderSales()
      say("Sale removed from this phone.")
    })
    card.append(button)
    list.append(card)
  }
}

function renderPrices() {
  const box = document.querySelector("#price-list")
  box.replaceChildren()
  const plant = selectedPlant()
  if (!app.prices) {
    box.append(el("p", null, "Kalimati prices are not loaded. No price was filled in."))
    return
  }
  box.append(el("p", "note", `Kalimati wholesale on ${app.prices.date || "the date the market sent"}. Kathmandu wholesale NPR.`))
  const spec = plant ? PRICE_LOTS[plant.id] : null
  if (!spec) {
    box.append(el("p", null, "Kalimati's daily fruit and vegetable list has no row mapped to this crop. Tea, coffee, large cardamom, and turmeric are in that group. No price is filled in."))
    return
  }
  if (spec.note) box.append(el("p", null, spec.note))
  const lots = matchLots(plant.id, app.prices.prices)
  if (!lots.length) {
    box.append(el("p", null, "The market's file for this date has none of the mapped lot names."))
    return
  }
  for (const lot of lots) {
    const row = el("div", "lot")
    row.append(el("strong", null, lot.commodityname))
    row.append(el("p", null, `${formatNumber(lot.minprice)}–${formatNumber(lot.maxprice)} NPR, average ${formatNumber(lot.avgprice)}, per ${lot.commodityunit}.`))
    box.append(row)
  }
}

function renderMarkets() {
  const list = document.querySelector("#market-list")
  list.replaceChildren()
  const districtId = app.place?.districtId || ""
  const province = app.place?.province || ""
  const ranked = rankMarkets(app.markets, districtId, province)
  for (const market of ranked) {
    const card = el("article", "card")
    const tier = marketTier(market, districtId, province)
    card.append(el("h3", null, market.place))
    card.append(el("p", null, `${market.name_ne} · ${market.place_ne}`))
    addRow(card, "Where", `${TIER[tier]}. ${market.province}`)
    addRow(card, "Prices here", market.prices === "daily-wholesale" ? "Daily wholesale, shown above" : "No price feed on this page")
    if (market.note) card.append(el("p", null, market.note))
    const link = el("a", null, "Official page")
    link.href = market.source_url
    link.rel = "noopener"
    card.append(link)
    list.append(card)
  }
}

function shareText() {
  const plant = selectedPlant()
  const parts = []
  const forecast = document.querySelector("#forecast-card")
  if (forecast) {
    parts.push("Yearbook yield on screen:")
    parts.push(forecast.innerText)
  }
  if (plant && plant.id === "cultivated_mushroom") parts.push(mushroomLines(app.stats.mushroom).join("\n"))
  parts.push(ledgerText({
    place: app.place,
    yields: loadRecords(YIELD_KEY),
    sales: loadRecords(SALE_KEY),
    feed: loadFeed(),
  }))
  return parts.filter(Boolean).join("\n\n")
}

async function sendBook() {
  const text = shareText()
  try {
    if (navigator.share) {
      await navigator.share({ title: "Nepal farm book", text })
      say("Share sheet opened. The notes stay on this phone either way.")
      return
    }
  } catch (error) {
    if (error && error.name === "AbortError") {
      say("Send cancelled.")
      return
    }
  }
  const blob = new Blob([text], { type: "text/plain" })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = "farm-book.txt"
  link.click()
  URL.revokeObjectURL(link.href)
  say("This browser could not open a share sheet. The text file downloaded.")
}

function onYieldSubmit(event) {
  event.preventDefault()
  const plant = selectedPlant()
  const amount = numberValue("#yield-amount")
  const areaText = document.querySelector("#yield-area").value.trim()
  const area = areaText ? Number(areaText) : ""
  if (!(amount >= 0)) {
    say("Enter the amount you harvested.")
    return
  }
  if (areaText && !(Number(area) > 0)) {
    say("Area has to be a number above zero, or left blank.")
    return
  }
  const rows = loadRecords(YIELD_KEY)
  rows.unshift({
    id: crypto.randomUUID(),
    created: new Date().toISOString(),
    cropId: plant.id,
    cropName: `${plant.en} · ${plant.ne}`,
    date: document.querySelector("#yield-date").value,
    amount,
    unit: document.querySelector("#yield-unit").value,
    area: areaText ? Number(area) : "",
    areaUnit: document.querySelector("#yield-area-unit").value,
    note: document.querySelector("#yield-note").value.trim(),
  })
  saveRecords(YIELD_KEY, rows.slice(0, 200))
  document.querySelector("#yield-form").reset()
  document.querySelector("#yield-date").value = today()
  renderYields()
  renderForecast()
  say("Yield saved on this phone.")
}

function onSaleSubmit(event) {
  event.preventDefault()
  const plant = selectedPlant()
  const quantity = numberValue("#sale-quantity")
  const price = numberValue("#sale-price")
  if (!(quantity > 0) || !(price >= 0)) {
    say("Enter the quantity and the price you received.")
    return
  }
  const rows = loadRecords(SALE_KEY)
  rows.unshift({
    id: crypto.randomUUID(),
    created: new Date().toISOString(),
    cropId: plant.id,
    cropName: `${plant.en} · ${plant.ne}`,
    date: document.querySelector("#sale-date").value,
    channel: document.querySelector("#sale-channel").value,
    buyer: document.querySelector("#sale-buyer").value.trim(),
    quantity,
    unit: document.querySelector("#sale-unit").value,
    priceNpr: price,
  })
  saveRecords(SALE_KEY, rows.slice(0, 200))
  document.querySelector("#sale-form").reset()
  document.querySelector("#sale-date").value = today()
  renderSales()
  say("Sale saved on this phone.")
}

function onFeedSubmit(event) {
  event.preventDefault()
  const cleaned = cleanFeedUrl(document.querySelector("#feed-url").value)
  if (cleaned == null) {
    say("Use an http or https address, or leave the box blank to clear a saved address.")
    return
  }
  if (!cleaned) {
    saveFeed(null)
    renderFeed()
    say("Camera address cleared. The camera was not connected.")
    return
  }
  saveFeed({ url: cleaned, savedAt: new Date().toISOString() })
  document.querySelector("#feed-url").value = ""
  renderFeed()
  say("Address saved on this phone. The page did not open it.")
}

async function loadPrices() {
  say("Reading Kalimati wholesale prices…")
  try {
    const response = await fetch(KALIMATI_URL)
    if (!response.ok) throw new Error(String(response.status))
    const body = await response.json()
    if (!body || !Array.isArray(body.prices)) throw new Error("missing prices")
    app.prices = body
    say(`Kalimati wholesale prices for ${body.date || "the date the market sent"}.`)
  } catch {
    app.prices = null
    say("Kalimati prices could not be read. No price was invented.")
  }
  renderPrices()
  renderSales()
}

function bind() {
  document.querySelector("#crop").addEventListener("change", () => {
    renderForecast()
    renderPrices()
    renderSales()
  })
  document.querySelector("#estimate-area").addEventListener("input", renderForecast)
  document.querySelector("#estimate-unit").addEventListener("change", renderForecast)
  document.querySelector("#yield-form").addEventListener("submit", onYieldSubmit)
  document.querySelector("#sale-form").addEventListener("submit", onSaleSubmit)
  document.querySelector("#feed-form").addEventListener("submit", onFeedSubmit)
  document.querySelector("#reload-prices").addEventListener("click", loadPrices)
  document.querySelector("#send-book").addEventListener("click", sendBook)
}

async function boot() {
  say("Loading the yearbook figures…")
  document.querySelector("#yield-date").value = today()
  document.querySelector("#sale-date").value = today()
  try {
    const [crops, stats, markets] = await Promise.all([
      fetch("./data/crops.json").then((response) => response.json()),
      fetch("./data/district-crops.json").then((response) => response.json()),
      fetch("./data/markets.json").then((response) => response.json()),
    ])
    app.plants = crops.plants
    app.stats = stats
    app.markets = markets.markets
    app.place = loadPlace()
    const select = document.querySelector("#crop")
    for (const plant of app.plants) {
      const option = el("option", null, `${plant.en} · ${plant.ne}`)
      option.value = plant.id
      select.append(option)
    }
    renderPlace()
    renderForecast()
    renderYields()
    renderFeed()
    renderSales()
    renderMarkets()
    bind()
    say("Farm book ready. Prices load from Kalimati next.")
    await loadPrices()
  } catch (error) {
    say(error.message || "The farm book could not load.")
  }
}

boot()
