const MIN_AISLE = 0.7
const MIN_BED = 0.6

const METHODS = {
  mushroom: "Mushroom bags on shelves along the bed. Keep the room at bag temperature. This sketch is not for wild fungi.",
  nursery: "Seedling trays on a bench. If the roof is clear, shade the bench. The yearbook has no seedling yield.",
  trays: "Leafy trays on benches. They want water on days the surface dries.",
  racks: "Pots on racks. Leave the path wide enough to turn around.",
}

export function designRoom(input) {
  const width = Number(input.widthM)
  const length = Number(input.lengthM)
  if (!(width >= 0.5) || !(length >= 0.5) || width > 40 || length > 40) {
    return { fits: false, lines: ["Enter a width and a length from 0.5 m to 40 m."] }
  }
  const area = width * length
  const method = METHODS[input.method] ? input.method : "mushroom"
  const water = input.water || "none"
  const lines = [`Box ${round(width)} m by ${round(length)} m, about ${round(area)} m².`]
  if (width < MIN_AISLE + MIN_BED || length < 1) {
    lines.push(`A ${MIN_BED} m bed and a ${MIN_AISLE} m path need ${MIN_AISLE + MIN_BED} m of width, and the length needs to reach 1 m.`)
    lines.push("This box does not fit a bed and a path. Mark a larger floor, or use the space for tools.")
    return { fits: false, area, width, length, lines }
  }
  let beds = 1
  let bedDepth = Math.min(1, width - MIN_AISLE)
  let aisle = width - bedDepth
  if (width >= MIN_AISLE + 2 * MIN_BED) {
    beds = 2
    aisle = MIN_AISLE
    bedDepth = (width - aisle) / 2
  }
  const tank = water === "none" || water === "rain" || water === "carry" ? 0.8 : 0
  const bedLength = Math.max(0.4, length - tank)
  const shapes = []
  if (beds === 1) {
    shapes.push({ x: 0, y: tank, w: bedDepth, h: bedLength, kind: "bed" })
    shapes.push({ x: bedDepth, y: tank, w: aisle, h: bedLength, kind: "path" })
  } else {
    shapes.push({ x: 0, y: tank, w: bedDepth, h: bedLength, kind: "bed" })
    shapes.push({ x: bedDepth, y: tank, w: aisle, h: bedLength, kind: "path" })
    shapes.push({ x: bedDepth + aisle, y: tank, w: bedDepth, h: bedLength, kind: "bed" })
  }
  if (tank > 0) shapes.push({ x: 0, y: 0, w: Math.min(0.8, width), h: tank, kind: "tank" })
  lines.push(beds === 1
    ? `One bed along the length, about ${round(bedDepth)} m deep and ${round(bedLength)} m long. Path about ${round(aisle)} m.`
    : `Two beds with a path between them. Each bed is about ${round(bedDepth)} m deep and ${round(bedLength)} m long. Path about ${round(aisle)} m.`)
  lines.push(waterLine(water))
  if (input.elevation != null && Number.isFinite(Number(input.elevation))) {
    const elevation = Math.round(Number(input.elevation))
    lines.push(`The phone point is about ${elevation} m. The room is indoors, so the outdoor district rank is only a hint.`)
    if (method === "mushroom" && elevation >= 2500) {
      lines.push("At this elevation a mushroom room needs heat so the bags do not follow the outdoor night temperature.")
    }
  }
  lines.push(METHODS[method])
  if (input.marked) lines.push("The box drawn on the photo is the floor you marked. The metres you typed are the size used here.")
  if ((input.photoCount || 0) < 2) lines.push("A second photo, of the water, gives you something to compare with this sketch.")
  if (input.requirement) lines.push(`You asked: ${String(input.requirement).slice(0, 200)}`)
  lines.push("The photos stay on this phone. No model looked at them. The beds and the path are fitted to the box you measured.")
  if (method === "trays" && (water === "none" || water === "carry")) {
    lines.push("Leafy trays need water in the room. This sketch does not pass until a tap, a tank, or a rain store is real.")
    return { fits: false, area, width, length, beds, bedDepth, aisle, bedLength, tank, shapes, lines }
  }
  return { fits: true, area, width, length, beds, bedDepth, aisle, bedLength, tank, shapes, lines }
}

function waterLine(water) {
  if (water === "tap") return "Put the tap on the short wall by the door so the path stays dry."
  if (water === "tank") return "Put the storage tank by the door. The beds start after it."
  if (water === "rain") return "Leave the first 0.8 m for a drum under the rain inlet."
  if (water === "stream") return "Keep the stream outside. Bring a pipe or a bucket to the door. Do not run water across the floor."
  if (water === "carry") return "No piped water. Leave the first 0.8 m for a drum you fill by carrying water."
  return "No water source was chosen. Leave the first 0.8 m for a drum."
}

function round(value) {
  return Math.round(value * 10) / 10
}

export function planSvg(design) {
  if (!design || !design.shapes) return ""
  const width = design.width
  const length = design.length
  const parts = [`<svg class="plan" viewBox="0 0 ${width} ${length}" role="img" aria-label="Room sketch">`]
  parts.push(`<rect x="0" y="0" width="${width}" height="${length}" fill="#efe6d6" stroke="#1a1814" stroke-width="${Math.max(width, length) / 80}"/>`)
  for (const shape of design.shapes) {
    const fill = shape.kind === "bed" ? "#1d6b3a" : shape.kind === "path" ? "#d9cbb6" : "#8d3b16"
    parts.push(`<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" fill="${fill}" opacity="0.9"/>`)
  }
  parts.push("</svg>")
  return parts.join("")
}
