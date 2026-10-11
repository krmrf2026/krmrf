import { prepareLayer, measureLayers } from './map-area.mjs';

export function prepareSectors(config) {
  return (config.sectors ?? []).map(({ id, label, bounds }) => {
    const [w, s, e, n] = bounds;
    const layer = prepareLayer({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'russian' },
      geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } }] });
    return { id, label, layer };
  });
}

export function measureSectors(before, after, total, sectors) {
  if (!sectors.length) return [];
  const rows = sectors.map(({ id, label, layer }) => {
    const { addedKm2, removedKm2, netKm2 } = measureLayers(before, after, layer);
    return { id, label, addedKm2, removedKm2, netKm2 };
  });
  const rest = key => {
    const value = total[key] - rows.reduce((sum, row) => sum + row[key], 0);
    if (!Number.isFinite(value) || value < -Math.max(1e-6, total[key] * 1e-10)) throw new Error('Не сошлась разбивка изменения по районам.');
    return Math.max(0, value);
  };
  const addedKm2 = rest('addedKm2'), removedKm2 = rest('removedKm2');
  rows.push({ id: 'other', label: 'Остальные участки', addedKm2, removedKm2, netKm2: addedKm2 - removedKm2 });
  if (Math.abs(rows.reduce((sum, row) => sum + row.netKm2, 0) - total.netKm2) > Math.max(1e-6, Math.abs(total.netKm2) * 1e-10)) throw new Error('Не сошёлся общий баланс районов.');
  return rows;
}
