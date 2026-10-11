// Spherical area of Boolean polygon regions, without rasterisation or clipping the
// display geometry. Vertical decomposition integrates sin(latitude) analytically.
// Coordinates are snapped only inside this numerical calculation to 1e-10 degree.
// Integer orientation predicates avoid inconsistent near-collinear intersection tests.
export const AREA_METHOD = 'krmrf-spherical-sweep-v1';
export const EARTH_RADIUS = 6371008.8;
const SCALE = 1e10;
const RAD = Math.PI / 180;
const equal = (a, b) => a[0] === b[0] && a[1] === b[1];
const point = p => {
  if (!Array.isArray(p) || p.length < 2 || !p.slice(0, 2).every(Number.isFinite)
      || Math.abs(p[0]) > 180 || Math.abs(p[1]) >= 85) throw new Error('Недопустимые координаты WGS84 (или широта за пределами метода ±85°).');
  return p.slice(0, 2).map(v => Math.round(v * SCALE) / SCALE);
};
const orient = (a, b, c) => {
  const [ax, ay, bx, by, cx, cy] = [...a, ...b, ...c].map(v => BigInt(Math.round(v * SCALE)));
  const n = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  return n > 0n ? 1 : n < 0n ? -1 : 0;
};
const on = (p, a, b) => orient(a, b, p) === 0 && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
const touches = (a, b) => {
  const x = orient(a.a, a.b, b.a), y = orient(a.a, a.b, b.b);
  const u = orient(b.a, b.b, a.a), v = orient(b.a, b.b, a.b);
  return (x * y < 0 && u * v < 0) || (!x && on(b.a, a.a, a.b)) || (!y && on(b.b, a.a, a.b)) || (!u && on(a.a, b.a, b.b)) || (!v && on(a.b, b.a, b.b));
};
const edge = (a, b, poly, ring, index, count, layer) => ({ a, b, poly, ring, index, count, layer,
  minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]), minY: Math.min(a[1], b[1]), maxY: Math.max(a[1], b[1]) });
const candidates = (edges, callback) => {
  const sorted = [...edges].sort((a, b) => a.minX - b.minX || a.minY - b.minY);
  let active = [];
  for (const e of sorted) {
    active = active.filter(f => f.maxX >= e.minX);
    for (const f of active) if (f.maxY >= e.minY && e.maxY >= f.minY) callback(e, f);
    active.push(e);
  }
};
const inRing = (p, ring) => {
  let inside = false;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    if (on(p, a, b)) return null;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < a[0] + (p[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1])) inside = !inside;
  }
  return inside;
};
export function prepareLayer(zones) {
  if (zones?.type !== 'FeatureCollection' || !Array.isArray(zones.features) || !zones.features.length) throw new Error('Пустой или повреждённый срез карты.');
  const polygons = [], edges = [];
  for (const f of zones.features) {
    const name = String(f?.properties?.name || '').trim().toLowerCase();
    if (!['russian', 'rf', 'россия', 'рф'].includes(name)) continue;
    const g = f?.geometry;
    if (!['Polygon', 'MultiPolygon'].includes(g?.type)) throw new Error('Российский слой должен содержать Polygon/MultiPolygon.');
    const parts = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    if (!Array.isArray(parts) || !parts.length) throw new Error('Геометрия российского слоя пуста.');
    for (const part of parts) {
      if (!Array.isArray(part) || !part.length) throw new Error('Полигон без внешнего кольца.');
      const id = polygons.length;
      const rings = part.map((raw, r) => {
        if (!Array.isArray(raw) || raw.length < 4) throw new Error(`Полигон ${id}, кольцо ${r}: менее четырёх точек.`);
        const pts = raw.map(point);
        if (!equal(pts[0], pts.at(-1))) throw new Error(`Полигон ${id}, кольцо ${r}: кольцо не замкнуто.`);
        const clean = pts.filter((p, i) => !i || !equal(p, pts[i - 1]));
        if (new Set(clean.slice(0, -1).map(p => p.join(','))).size < 3) throw new Error(`Полигон ${id}: вырожденное кольцо.`);
        for (let i = 0; i < clean.length - 1; i++) {
          if (Math.abs(clean[i][0] - clean[i + 1][0]) >= 180) throw new Error('Пересечение антимеридиана не поддерживается; задайте другую область расчёта.');
          edges.push(edge(clean[i], clean[i + 1], id, r, i, clean.length - 1, 0));
        }
        return clean;
      });
      for (let r = 1; r < rings.length; r++) {
        if (inRing(rings[r][0], rings[0]) !== true) throw new Error(`Полигон ${id}: отверстие вне внешнего кольца.`);
        for (let s = 1; s < r; s++) if (inRing(rings[r][0], rings[s]) !== false || inRing(rings[s][0], rings[r]) !== false) throw new Error(`Полигон ${id}: перекрывающиеся отверстия.`);
      }
      polygons.push(rings);
    }
  }
  if (!polygons.length) throw new Error('Не найден непустой российский слой; отсутствие слоя не означает нулевой контроль.');
  candidates(edges, (a, b) => {
    if (a.poly !== b.poly) return; // Overlap between polygons is handled by union.
    if (a.ring === b.ring && (Math.abs(a.index - b.index) === 1 || Math.abs(a.index - b.index) === a.count - 1)) {
      // Adjacent edges may share exactly their vertex, never retrace an edge.
      const shared = [a.a, a.b].find(p => equal(p, b.a) || equal(p, b.b));
      const otherA = equal(a.a, shared) ? a.b : a.a;
      const otherB = equal(b.a, shared) ? b.b : b.a;
      if (on(otherA, shared, otherB) || on(otherB, shared, otherA)) throw new Error(`Полигон ${a.poly}: ребро проходит назад по самому себе.`);
      return;
    }
    if (touches(a, b)) throw new Error(`Полигон ${a.poly}: пересечение/самокасание колец у рёбер ${a.index} и ${b.index}.`);
  });
  return { polygons, edges };
}
const sinc = x => Math.abs(x) < 1e-7 ? 1 - x * x / 6 : Math.sin(x) / x;
const yAt = (e, x) => e.a[1] + (x - e.a[0]) * (e.b[1] - e.a[1]) / (e.b[0] - e.a[0]);
const averageSin = (e, x0, x1) => {
  const p = yAt(e, x0) * RAD, q = yAt(e, x1) * RAD;
  return Math.sin((p + q) / 2) * sinc((q - p) / 2);
};
// Integrating every arrangement cell rather than subtracting two total areas
// preserves simultaneous additions/removals and counts overlaps exactly once.
export function measureLayers(before, after = { edges: [], polygons: [] }, mask = null) {
  if (mask && !mask.edges?.length) throw new Error('Пустая область локального расчёта.');
  const west = mask ? Math.min(...mask.edges.map(e => e.minX)) : -Infinity;
  const east = mask ? Math.max(...mask.edges.map(e => e.maxX)) : Infinity;
  const sources = mask ? [before, after, mask] : [before, after];
  // Restrict sweep cuts to the mask's longitude range. Keep all crossings at
  // those longitudes, including rings north/south of the mask: they determine
  // whether a containing polygon is inside, even when its boundary is far away.
  const edges = sources.flatMap((source, layer) => source.edges
    .filter(e => e.maxX > west && e.minX < east).map(e => ({ ...e, layer })));
  const cuts = new Set(mask ? [west, east] : []);
  for (const e of edges) for (const x of [e.minX, e.maxX]) if (x >= west && x <= east) cuts.add(x);
  candidates(edges, (a, b) => {
    if (orient(a.a, a.b, b.a) * orient(a.a, a.b, b.b) >= 0 || orient(b.a, b.b, a.a) * orient(b.a, b.b, a.b) >= 0) return;
    const ax = a.b[0] - a.a[0], ay = a.b[1] - a.a[1], bx = b.b[0] - b.a[0], by = b.b[1] - b.a[1];
    const denominator = ax * by - ay * bx;
    const t = ((b.a[0] - a.a[0]) * by - (b.a[1] - a.a[1]) * bx) / denominator;
    const x = a.a[0] + t * ax;
    if (!Number.isFinite(x)) throw new Error('Не удалось вычислить пересечение границ.');
    const cut = Math.min(a.maxX, b.maxX, Math.max(a.minX, b.minX, x));
    if (cut >= west && cut <= east) cuts.add(cut);
  });
  const xs = [...cuts].sort((a, b) => a - b), sums = [0, 0, 0], corrections = [0, 0, 0];
  const sorted = [...edges].sort((a, b) => a.minX - b.minX);
  let active = [], cursor = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1], mid = (x0 + x1) / 2;
    if (!(mid > x0 && mid < x1)) continue;
    while (cursor < sorted.length && sorted[cursor].minX < mid) active.push(sorted[cursor++]);
    active = active.filter(e => e.maxX > mid);
    const crossings = active.map(e => ({ e, y: yAt(e, mid) })).sort((a, b) => a.y - b.y);
    const inside = sources.map(() => new Set());
    for (let j = 0; j < crossings.length;) {
      const lower = crossings[j];
      let k = j;
      while (k < crossings.length && Math.abs(crossings[k].y - lower.y) <= 1e-12) {
        const { e } = crossings[k++], set = inside[e.layer];
        if (set.has(e.poly)) set.delete(e.poly); else set.add(e.poly);
      }
      if (k < crossings.length && (inside[0].size || inside[1].size) && (!mask || inside[2].size)) {
        const category = inside[0].size ? (inside[1].size ? 2 : 0) : 1;
        const value = (averageSin(crossings[k].e, x0, x1) - averageSin(lower.e, x0, x1)) * (x1 - x0) * RAD * EARTH_RADIUS ** 2 / 1e6;
        if (!Number.isFinite(value) || value < -1e-6) throw new Error('Некорректная площадь ячейки разбиения.');
        const corrected = Math.max(0, value) - corrections[category], total = sums[category] + corrected;
        corrections[category] = (total - sums[category]) - corrected; sums[category] = total;
      }
      j = k;
    }
    if (inside.some(set => set.size)) throw new Error('Незамкнутая область при расчёте площади.');
  }
  return { beforeKm2: sums[0] + sums[2], afterKm2: sums[1] + sums[2], addedKm2: sums[1], removedKm2: sums[0], netKm2: sums[1] - sums[0] };
}
export const layerArea = layer => measureLayers(layer).beforeKm2;
