import { formatNumber, yearLabel } from "./advice.js"

// Kalimati commodity names that correspond to a desk crop.
// Names are matched exactly. A missing crop gets no invented price.
export const PRICE_LOTS = {
  apple: {
    names: ["Apple(Fuji)", "Apple(Jumla)", "Apple(Mustang)"],
    note: "Kalimati prints these as separate apple lots. A lot name is not this farm's price.",
  },
  pear: {
    names: ["Pear(Chinese)"],
    note: "The only pear row is Pear(Chinese).",
  },
  ginger: {
    names: ["Ginger"],
    note: "",
  },
  garlic: {
    names: ["Garlic Dry Nepali", "Garlic Dry Chinese", "Garlic Green"],
    note: "Dry Nepali, dry Chinese, and green garlic are different lots.",
  },
  dry_chilli: {
    names: ["Chilli Dry"],
    note: "Green chilli rows are a different product from the yearbook dry-chilli column.",
  },
  cultivated_mushroom: {
    names: ["Mushroom(Kanya)", "Mushroom(Button)", "King Oyster", "Lentinula Edodes"],
    note: "The yearbook does not split mushroom species. These are separate wholesale lots.",
  },
}

const PRODUCTIVE = new Set(["large_cardamom", "apple", "plum", "pear", "walnut", "peach", "apricot"])

export function toHectares(area, unit) {
  const value = Number(area)
  if (!(value > 0)) return null
  if (unit === "ha") return value
  if (unit === "m2") return value / 10000
  return null
}

export function ratePerHa(entry) {
  if (!entry) return null
  const amount = Number(entry.amount)
  const hectares = toHectares(entry.area, entry.areaUnit)
  if (!(amount >= 0) || hectares == null) return null
  let kg = null
  if (entry.unit === "kg") kg = amount
  if (entry.unit === "mt") kg = amount * 1000
  if (kg == null) return null
  return { kgPerHa: kg / hectares, hectares, kg }
}

export function yearbookRate(cropId, row) {
  if (!row) return null
  if (row.yield != null && row.yield_unit && Number.isFinite(Number(row.yield))) {
    let basis = "printed yield per total hectare"
    if (PRODUCTIVE.has(cropId)) basis = "printed yield per productive hectare"
    if (cropId === "coffee") basis = "printed green-bean yield per plantation hectare"
    return {
      value: Number(row.yield),
      unit: row.yield_unit,
      basis,
      derived: false,
      yieldNote: row.yield_note || "",
      productiveAreaHa: row.productive_area_ha ?? null,
      areaHa: row.area_ha ?? null,
      production: row.production ?? null,
      productionUnit: row.production_unit || "",
    }
  }
  if (cropId === "tea" && Number(row.area_ha) > 0 && row.production != null && row.production_unit === "kg") {
    return {
      value: Number(row.production) / Number(row.area_ha),
      unit: "kg/ha",
      basis: "printed production divided by printed total area; the tea table has no yield column in this file",
      derived: true,
      yieldNote: "",
      productiveAreaHa: null,
      areaHa: Number(row.area_ha),
      production: Number(row.production),
      productionUnit: "kg",
    }
  }
  return null
}

export function toKgPerHa(rate) {
  if (!rate) return null
  if (rate.unit === "kg/ha") return rate.value
  if (rate.unit === "mt/ha") return rate.value * 1000
  return null
}

export function repeatChange(current, previous) {
  if (!current || !previous) return null
  if (current.unit !== previous.unit) return null
  if (Boolean(current.derived) !== Boolean(previous.derived)) return null
  const change = current.value - previous.value
  const next = current.value + change
  return { change, next, unit: current.unit, belowZero: next < 0 }
}

export function atDistrictRate(rate, area, areaUnit) {
  const hectares = toHectares(area, areaUnit)
  if (!rate || hectares == null) return null
  const unit = rate.unit === "kg/ha" ? "kg" : rate.unit === "mt/ha" ? "mt" : null
  if (!unit) return null
  return { quantity: rate.value * hectares, unit, hectares }
}

export function describeReadings(entries) {
  const dated = [...(entries || [])]
    .filter((entry) => entry && entry.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.created || "").localeCompare(String(b.created || "")))
  const latest = dated[dated.length - 1]
  const latestRate = latest ? ratePerHa(latest) : null
  const result = {
    count: dated.length,
    latestDate: latest ? latest.date : "",
    latestKgPerHa: latestRate ? latestRate.kgPerHa : null,
    gap: null,
    gapReason: "",
  }
  if (dated.length < 2) return result
  const older = dated[dated.length - 2]
  const olderRate = ratePerHa(older)
  if (!olderRate || !latestRate) {
    result.gapReason = "The latest two readings both need an amount and an area before a difference per hectare can be shown."
    return result
  }
  result.gap = {
    from: older.date,
    to: latest.date,
    changeKgPerHa: latestRate.kgPerHa - olderRate.kgPerHa,
    olderKgPerHa: olderRate.kgPerHa,
    newerKgPerHa: latestRate.kgPerHa,
  }
  return result
}

export function matchLots(cropId, prices) {
  const spec = PRICE_LOTS[cropId]
  if (!spec) return []
  const wanted = new Set(spec.names)
  return (prices || []).filter((row) => row && wanted.has(row.commodityname))
}

export function marketTier(market, districtId, province) {
  if (districtId && market.district_id === districtId) return "district"
  if (province && market.province === province) return "province"
  return "other"
}

export function rankMarkets(markets, districtId, province) {
  const order = { district: 0, province: 1, other: 2 }
  return [...(markets || [])].sort((a, b) => {
    const delta = order[marketTier(a, districtId, province)] - order[marketTier(b, districtId, province)]
    if (delta) return delta
    return String(a.place).localeCompare(String(b.place))
  })
}

export function saleBands(sales) {
  const bands = {}
  for (const channel of ["wholesale", "haat", "shop"]) {
    const rows = (sales || []).filter((row) => row.channel === channel)
    const prices = rows.map((row) => Number(row.priceNpr)).filter((value) => Number.isFinite(value))
    const units = new Set(rows.map((row) => row.unit))
    if (!prices.length) {
      bands[channel] = null
      continue
    }
    if (units.size !== 1) {
      bands[channel] = { count: prices.length, average: null, min: null, max: null, unit: "", mixedUnits: true }
      continue
    }
    const sum = prices.reduce((total, value) => total + value, 0)
    bands[channel] = {
      count: prices.length,
      average: sum / prices.length,
      min: Math.min(...prices),
      max: Math.max(...prices),
      unit: [...units][0],
      mixedUnits: false,
    }
  }
  return bands
}

export function besideWholesale(priceNpr, unit, lot) {
  if (unit !== "kg" || !lot) return null
  if (String(lot.commodityunit || "").toLowerCase() !== "kg") return null
  const average = Number(lot.avgprice)
  const price = Number(priceNpr)
  if (!Number.isFinite(average) || !Number.isFinite(price)) return null
  return { difference: price - average, average }
}

export function cleanFeedUrl(text) {
  const raw = String(text || "").trim()
  if (!raw) return ""
  if (raw.length > 500) return null
  let url
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  return url.href
}

function money(value) {
  return formatNumber(value)
}

export function forecastLines({
  crop,
  placeLabel,
  yearCurrent,
  yearPrevious,
  rate,
  priorRate,
  repeated,
  readings,
  areaResult,
  areaRepeat,
}) {
  const lines = [`${crop.en} · ${crop.ne}`, placeLabel]
  if (crop.id === "cultivated_mushroom") {
    lines.push("Cultivated mushroom in the yearbook is a national fresh-production series, not a yield per room.")
    return lines
  }
  if (!rate) {
    lines.push(`No yield cell for ${yearCurrent}. Area and production are shown when the yearbook printed them.`)
    return lines
  }
  lines.push(`${yearCurrent}: ${formatNumber(rate.value)} ${rate.unit}. ${rate.basis}.`)
  if (rate.areaHa != null) lines.push(`Total area: ${formatNumber(rate.areaHa)} ha. Production: ${formatNumber(rate.production)} ${rate.productionUnit}.`)
  if (rate.productiveAreaHa != null) lines.push(`Productive area printed beside it: ${formatNumber(rate.productiveAreaHa)} ha.`)
  if (rate.yieldNote) lines.push(rate.yieldNote)
  if (priorRate) lines.push(`${yearPrevious}: ${formatNumber(priorRate.value)} ${priorRate.unit}.`)
  if (repeated && repeated.belowZero) {
    lines.push("Repeating the printed drop once more would go below zero. No next figure is shown.")
  } else if (repeated) {
    lines.push(`If the printed change repeats once: ${formatNumber(repeated.next)} ${repeated.unit}. Desk arithmetic on the two yearbook years. Weather is not an input.`)
  } else {
    lines.push("Only one comparable yearbook rate is on file, so no repeated-change figure.")
  }
  if (readings && readings.count === 1 && readings.latestKgPerHa != null) {
    const districtKg = toKgPerHa(rate)
    lines.push(`Your latest measured rate on ${readings.latestDate}: ${formatNumber(readings.latestKgPerHa)} kg/ha.`)
    if (districtKg != null) lines.push(`The yearbook rate beside it is ${formatNumber(districtKg)} kg/ha. One measurement does not become a future farm yield.`)
  } else if (readings && readings.count === 1) {
    lines.push("One measurement is saved without an area, so there is no rate per hectare yet.")
  }
  if (readings && readings.gap) {
    lines.push(`From ${readings.gap.from} to ${readings.gap.to} the measured rate changed by ${formatNumber(readings.gap.changeKgPerHa)} kg/ha.`)
  } else if (readings && readings.gapReason) {
    lines.push(readings.gapReason)
  }
  if (areaResult) {
    lines.push(`On ${formatNumber(areaResult.hectares)} ha at the ${yearCurrent} rate: ${formatNumber(areaResult.quantity)} ${areaResult.unit}.`)
    if (rate.basis.includes("productive")) lines.push("That yield is per productive hectare, so this treats the typed area as productive area.")
  }
  if (areaRepeat && !(repeated && repeated.belowZero)) {
    lines.push(`On that same area, if the printed change repeats: ${formatNumber(areaRepeat.quantity)} ${areaRepeat.unit}.`)
  }
  return lines
}

export function mushroomLines(series) {
  const rows = [...(series || [])].sort((a, b) => String(a.ad).localeCompare(String(b.ad)))
  if (!rows.length) return ["No mushroom series is in the file."]
  const latest = rows[rows.length - 1]
  const prior = rows.length > 1 ? rows[rows.length - 2] : null
  const lines = [
    `National fresh production ${formatNumber(latest.fresh_mt)} mt in ${yearLabel(latest.bs, latest.ad)}.`,
    "The mushroom table prints the AD year. The BS pair is the same fiscal year. This is not a yield per room.",
  ]
  if (prior && latest.fresh_mt != null && prior.fresh_mt != null) {
    lines.push(`Change from ${yearLabel(prior.bs, prior.ad)}: ${formatNumber(latest.fresh_mt - prior.fresh_mt)} mt. The national change is not extended into next year.`)
  }
  return lines
}

export function ledgerText({ place, yields, sales, feed }) {
  const lines = ["Farm book on this phone"]
  if (place && place.districtName) {
    lines.push(`Land district: ${place.districtName}${place.province ? `, ${place.province}` : ""}`)
  } else {
    lines.push("Land district: not set on this phone.")
  }
  lines.push("Measured yields:")
  if (!yields || !yields.length) lines.push("None saved.")
  for (const row of yields || []) {
    const area = row.area ? `${row.area} ${row.areaUnit || ""}` : "area not entered"
    lines.push(`- ${row.date || ""} ${row.cropName || row.cropId}: ${row.amount} ${row.unit} from ${area}`)
  }
  lines.push("Sales:")
  if (!sales || !sales.length) lines.push("None saved.")
  for (const row of sales || []) {
    const buyer = row.buyer ? ` to ${row.buyer}` : ""
    lines.push(`- ${row.date || ""} ${row.cropName || row.cropId}: ${row.quantity} ${row.unit} at NPR ${row.priceNpr} per ${row.unit} via ${row.channel}${buyer}`)
  }
  if (feed && feed.url) {
    lines.push("Bed camera address saved on this phone. This page does not open it. No model is running.")
    lines.push(feed.url)
  } else {
    lines.push("Bed camera: not attached. No address saved. No model is running.")
  }
  lines.push("Full farm management and an on-phone model are not running. These notes stay in this browser until you share them.")
  return lines.join("\n")
}
