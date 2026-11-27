/** Bounds of real WGS84 coordinates; never invent a location for missing geometry. */
export function geometryLocation(value: unknown) {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity
  const coordinates = (data: unknown): void => {
    if (!Array.isArray(data)) return
    if (data.length >= 2 && typeof data[0] === 'number' && typeof data[1] === 'number') {
      const [lng, lat] = data as [number, number]
      if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) return
      west = Math.min(west, lng); east = Math.max(east, lng); south = Math.min(south, lat); north = Math.max(north, lat)
    } else data.forEach(coordinates)
  }
  const visit = (item: unknown): void => {
    if (!item || typeof item !== 'object') return
    const data = item as Record<string, unknown>
    if (data.type === 'FeatureCollection' && Array.isArray(data.features)) data.features.forEach(visit)
    else if (data.type === 'GeometryCollection' && Array.isArray(data.geometries)) data.geometries.forEach(visit)
    else if (data.type === 'Feature') visit(data.geometry)
    else coordinates(data.coordinates)
  }
  visit(value)
  return Number.isFinite(west) ? { west, south, east, north, lng: (west + east) / 2, lat: (south + north) / 2 } : undefined
}
