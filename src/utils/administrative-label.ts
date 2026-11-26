/** 在面内部选取水平截线的最长区间，避开内环。 */
export function polygonLabelPoint(rings: number[][][]): [number, number] | undefined {
  const outer = rings[0]
  if (!outer || outer.length < 4) return undefined
  const ys = outer.map(point => point[1]!).filter(Number.isFinite)
  if (!ys.length) return undefined
  const min = Math.min(...ys), max = Math.max(...ys)
  let best: { width: number; point: [number, number] } | undefined
  for (const fraction of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    const y = min + (max - min) * fraction
    const intersections: number[] = []
    for (const ring of rings) for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!, b = ring[(i + 1) % ring.length]!
      if ((a[1]! > y) !== (b[1]! > y)) intersections.push(a[0]! + (y - a[1]!) * (b[0]! - a[0]!) / (b[1]! - a[1]!))
    }
    intersections.sort((a,b) => a-b)
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const left = intersections[i]!, right = intersections[i+1]!
      if (!best || right-left > best.width) best = { width: right-left, point: [(left+right)/2,y] }
    }
  }
  return best?.point
}
