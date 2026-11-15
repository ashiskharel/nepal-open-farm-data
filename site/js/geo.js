export function ringHas(ring, lon, lat) {
  let inside = false
  let previous = ring.length - 1
  for (let index = 0; index < ring.length; index += 1) {
    const [xi, yi] = ring[index]
    const [xj, yj] = ring[previous]
    const crosses = (yi > lat) !== (yj > lat)
    const denom = yj - yi
    if (crosses && denom !== 0 && lon < ((xj - xi) * (lat - yi)) / denom + xi) {
      inside = !inside
    }
    previous = index
  }
  return inside
}

function polygonHas(rings, lon, lat) {
  if (!rings.length || !ringHas(rings[0], lon, lat)) return false
  return rings.slice(1).every((hole) => !ringHas(hole, lon, lat))
}

export function geomHas(geom, lon, lat) {
  if (geom.type === "Polygon") return polygonHas(geom.coordinates, lon, lat)
  if (geom.type === "MultiPolygon") {
    return geom.coordinates.some((rings) => polygonHas(rings, lon, lat))
  }
  return false
}

export function findDistrict(collection, lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
  return collection.features.find((feature) => geomHas(feature.geometry, lon, lat)) || null
}
