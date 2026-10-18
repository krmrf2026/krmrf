let timer;
try {
  window.maplibregl = await Promise.race([
    import('https://unpkg.com/maplibre-gl@6.4.1/dist/maplibre-gl.mjs'),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('MapLibre import timeout')), 8000); })
  ]);
} catch (error) {
  console.warn('MapLibre import failed; using the existing Leaflet fallback.', error);
} finally { clearTimeout(timer); }
const client = new URL('./map.js', import.meta.url);
client.search = new URL(import.meta.url).search;
await import(client.href);
