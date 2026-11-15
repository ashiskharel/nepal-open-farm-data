export function yearLabel(bs, ad) {
  if (bs && ad) return `${bs} BS · ${ad} AD`
  if (bs) return `${bs} BS`
  if (ad) return `${ad} AD`
  return ""
}

export function adFromBs(text) {
  const raw = String(text || "").trim()
  const pair = raw.match(/^(\d{4})\s*\/\s*(\d{2,4})$/)
  if (!pair) {
    const single = raw.match(/^(\d{4})$/)
    if (!single) return null
    const year = Number(single[1])
    if (year < 1900 || year > 2200) return null
    return { bs: String(year), ad: String(year - 57), rule: true }
  }
  const left = Number(pair[1])
  let right = Number(pair[2])
  if (right < 100) {
    right = left - (left % 100) + right
    if (right < left) right += 100
  }
  const adLeft = left - 57
  const adRight = right - 57
  return {
    bs: `${left}/${String(right).slice(-2)}`,
    ad: `${adLeft}/${String(adRight % 100).padStart(2, "0")}`,
    rule: true,
  }
}

export function formatNumber(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return ""
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(number)
}

function areaReason(stats, row) {
  const unit = row.production_unit || "mt"
  return `In ${yearLabel(stats.current.bs, stats.current.ad)} this district recorded ${formatNumber(row.area_ha)} ha and ${formatNumber(row.production)} ${unit}.`
}

export function rankCrops({ elevation, districtId, plants, stats }) {
  const grown = districtId ? stats.districts[districtId] : null
  const current = grown ? grown.current : {}
  const previous = grown ? grown.previous : {}
  const ranked = []
  for (const plant of plants) {
    if (!plant.field) continue
    const row = current[plant.id]
    const prior = previous[plant.id]
    const band = plant.elevation_m
    let score = 0
    const reasons = []
    if (row && Number(row.area_ha) > 0) {
      score += 3
      reasons.push(areaReason(stats, row))
    }
    if (prior && Number(prior.area_ha) > 0) {
      const unit = prior.production_unit || "mt"
      reasons.push(
        `In ${yearLabel(stats.previous.bs, stats.previous.ad)} the same district recorded ${formatNumber(prior.area_ha)} ha and ${formatNumber(prior.production)} ${unit}.`
      )
    }
    if (elevation != null && band) {
      const [low, high] = band
      const metres = Math.round(elevation)
      if (elevation >= low && elevation <= high) {
        score += 2
        reasons.push(
          `This spot is about ${metres} m, inside ${low}–${high} m. That band is a desk guide, not a ministry zone.`
        )
      } else if (row && Number(row.area_ha) > 0) {
        reasons.push(
          `This spot is about ${metres} m, outside the ${low}–${high} m band used here. The district figure includes other land.`
        )
      }
    }
    if (score >= 2) ranked.push({ plant, row, score, reasons })
  }
  ranked.sort(
    (a, b) => b.score - a.score || Number(b.row?.area_ha || 0) - Number(a.row?.area_ha || 0)
  )
  return ranked.slice(0, 6)
}

export function climateNotes(plantId, climate) {
  if (!climate) return []
  const notes = []
  if (plantId === "large_cardamom" && climate.humidity != null && climate.humidity >= 75) {
    notes.push("The recent year was humid. Large cardamom is usually under moist shade, not on a dry open ridge.")
  }
  if (plantId === "apple" && climate.rain != null && climate.rain >= 2500) {
    notes.push("Rain in that year was heavy. Apple fruit marks and rots more readily on a wet site.")
  }
  if (plantId === "apple" && climate.solar != null && climate.solar < 12) {
    notes.push("Sunshine in that year was low. Apple wants a more open site than a shaded cardamom grove.")
  }
  if ((plantId === "coffee" || plantId === "large_cardamom") && climate.solar != null && climate.solar >= 18) {
    notes.push("Sunshine was strong. Young coffee and large cardamom usually need some shade.")
  }
  return notes
}
