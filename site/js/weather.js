export const WEATHER_CHECKS = {
  frostC: 0,
  heatC: 35,
  heavyRainMm: 50,
  dryDayMm: 1,
}

export function rowsFromDaily(daily) {
  if (!daily || !Array.isArray(daily.time)) return []
  return daily.time.map((date, index) => ({
    date,
    tMin: numberOrNull(daily.temperature_2m_min?.[index]),
    tMax: numberOrNull(daily.temperature_2m_max?.[index]),
    rain: numberOrNull(daily.precipitation_sum?.[index]),
  }))
}

function numberOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function summarizeDays(days) {
  const frost = []
  const heat = []
  const heavy = []
  let rain = 0
  let rainDays = 0
  let dryRun = 0
  let longestDry = 0
  for (const day of days || []) {
    if (day.tMin != null && day.tMin <= WEATHER_CHECKS.frostC) frost.push(day.date)
    if (day.tMax != null && day.tMax >= WEATHER_CHECKS.heatC) heat.push(day.date)
    if (day.rain != null) {
      rain += day.rain
      rainDays += 1
      if (day.rain >= WEATHER_CHECKS.heavyRainMm) heavy.push(day.date)
      if (day.rain < WEATHER_CHECKS.dryDayMm) {
        dryRun += 1
        if (dryRun > longestDry) longestDry = dryRun
      } else {
        dryRun = 0
      }
    }
  }
  return {
    days: (days || []).length,
    rain,
    rainDays,
    frost,
    heat,
    heavy,
    longestDry,
  }
}

export function patternSentence(days) {
  const first = (days || []).slice(0, 7)
  const second = (days || []).slice(7, 14)
  if (first.length < 7 || second.length < 7) return ""
  const rainOf = (rows) => rows.reduce((total, day) => total + (day.rain || 0), 0)
  const early = rainOf(first)
  const later = rainOf(second)
  if (later >= early + 20 && later > early * 1.5) return "The second week is wetter than the first."
  if (early >= later + 20 && early > later * 1.5) return "The first week is wetter than the second."
  return "Rain in the first week and the second week is in the same range."
}

function sampleDates(dates) {
  if (!dates.length) return "none"
  if (dates.length <= 3) return dates.join(", ")
  return `${dates.slice(0, 3).join(", ")}, and ${dates.length - 3} more`
}

function round(value) {
  return Math.round(value)
}

export function weatherLines(label, summary) {
  return [
    `${label}: ${summary.days} days, about ${round(summary.rain)} mm of rain.`,
    `Frost mornings, daily minimum at or below ${WEATHER_CHECKS.frostC} °C: ${summary.frost.length} (${sampleDates(summary.frost)}).`,
    `Hot days, daily maximum at or above ${WEATHER_CHECKS.heatC} °C: ${summary.heat.length} (${sampleDates(summary.heat)}).`,
    `Heavy-rain days, ${WEATHER_CHECKS.heavyRainMm} mm or more: ${summary.heavy.length} (${sampleDates(summary.heavy)}).`,
    `Longest run of days under ${WEATHER_CHECKS.dryDayMm} mm: ${summary.longestDry}.`,
  ]
}

export function cropChecks(cropId, summary) {
  const lines = []
  if (cropId === "apple" && summary.heavy.length) {
    lines.push("Apple desk check: after a heavy-rain day, look for marks and rot on the fruit.")
  }
  if (cropId === "large_cardamom" && summary.longestDry >= 14) {
    lines.push("Large cardamom desk check: a dry run of two weeks is a moisture check. The crop is usually in shade.")
  }
  if ((cropId === "ginger" || cropId === "turmeric") && summary.heavy.length) {
    lines.push("Ginger and turmeric desk check: if water stood in the furrow on a heavy-rain day, look at the rhizome for rot.")
  }
  if (cropId === "tea" && summary.frost.length) {
    lines.push("Tea desk check: a frost morning can burn the young shoot. Look at the plucking table.")
  }
  if (cropId === "coffee" && summary.heat.length) {
    lines.push("Coffee desk check: on a hot day, see whether the young bushes still have shade.")
  }
  if (cropId === "cultivated_mushroom" && (summary.heat.length || summary.frost.length)) {
    lines.push("Mushroom desk check: the bags are indoors. Outdoor frost or heat is a reason to check the room, not a field loss.")
  }
  return lines
}

export function yieldWeatherLines({ cropId, rateLine, past, ahead, aheadDays }) {
  const lines = [rateLine, "The weather counts do not change that figure."]
  if (past) {
    lines.push(...weatherLines("Recent year at this point", past))
    lines.push(...cropChecks(cropId, past))
  }
  if (ahead) {
    lines.push(...weatherLines("Coming days", ahead))
    const pattern = patternSentence(aheadDays || [])
    if (pattern) lines.push(pattern)
    lines.push(...cropChecks(cropId, ahead))
  }
  lines.push("Damage assessment is this list and what you see on the plants. A loss in kilograms is not calculated.")
  return lines
}
