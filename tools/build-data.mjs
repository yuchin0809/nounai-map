// 簡略化済みGeoJSON(mapshaperの出力)から、ゲーム用の js/data.js を生成する。
// 使い方: node tools/build-data.mjs <入力.geojson> js/data.js
import fs from 'node:fs';

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) {
  console.error('usage: node tools/build-data.mjs <input.geojson> <output.js>');
  process.exit(1);
}

const PAD = 24;        // 地図の外周の余白
const WIDTH = 1000;    // 余白を除いた地図の横幅(座標単位)
const KM_PER_DEG_LAT = 111.2;

const gj = JSON.parse(fs.readFileSync(inFile, 'utf8'));

const REGIONS = ['北海道', '東北', '関東', '中部', '近畿', '中国', '四国', '九州・沖縄'];
const regionOf = (id) =>
  id === 1 ? 0 : id <= 7 ? 1 : id <= 14 ? 2 : id <= 23 ? 3 : id <= 30 ? 4 : id <= 35 ? 5 : id <= 39 ? 6 : 7;

const meanLat = (ring) => ring.reduce((s, p) => s + p[1], 0) / ring.length;
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

// 東京都は小笠原諸島(南に約1000km離れている)を除き、本土側の形が分かるようにする
const feats = gj.features
  .map((f) => {
    let polys = polysOf(f.geometry);
    if (f.properties.id === 13) polys = polys.filter((p) => meanLat(p[0]) >= 32);
    return { id: f.properties.id, name: f.properties.nam_ja, polys };
  })
  .sort((a, b) => a.id - b.id);

let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
for (const f of feats) for (const p of f.polys) for (const r of p) for (const [lon, lat] of r) {
  lonMin = Math.min(lonMin, lon); lonMax = Math.max(lonMax, lon);
  latMin = Math.min(latMin, lat); latMax = Math.max(latMax, lat);
}

const lat0 = (latMin + latMax) / 2;
const k = WIDTH / ((lonMax - lonMin) * Math.cos((lat0 * Math.PI) / 180)); // 緯度1度あたりの座標単位
const proj = ([lon, lat]) => [
  PAD + (lon - lonMin) * Math.cos((lat0 * Math.PI) / 180) * k,
  PAD + (latMax - lat) * k,
];
const r1 = (n) => Math.round(n * 10) / 10;

const prefs = feats.map((f) => {
  let d = '';
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  let main = { area: -1, mx: 0, my: 0 }; // 最大の島(本体)の中心。目印や線の端点に使う
  for (const poly of f.polys) for (const ring of poly) {
    let last = '';
    const pts = [];
    for (const c of ring) {
      const [x, y] = proj(c).map(r1);
      const key = x + ',' + y;
      if (key === last) continue;
      last = key;
      pts.push([x, y]);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    if (pts.length < 3) continue;
    if (ring === poly[0]) {
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
      const area = (bx1 - bx0) * (by1 - by0);
      if (area > main.area) main = { area, mx: r1((bx0 + bx1) / 2), my: r1((by0 + by1) / 2) };
    }
    d += 'M' + pts.map((p) => p[0] + ' ' + p[1]).join('L') + 'Z';
  }
  return { id: f.id, name: f.name, region: regionOf(f.id), cx: r1((x0 + x1) / 2), cy: r1((y0 + y1) / 2), mx: main.mx, my: main.my, bw: r1(x1 - x0), bh: r1(y1 - y0), d };
});

const MAP = {
  w: r1(WIDTH + PAD * 2),
  h: r1((latMax - latMin) * k + PAD * 2),
  kmPerUnit: Math.round((KM_PER_DEG_LAT / k) * 1000) / 1000,
  regions: REGIONS,
  prefs,
};

fs.writeFileSync(outFile, '// このファイルは tools/build-data.mjs が生成します(手で編集しない)\nwindow.MAP = ' + JSON.stringify(MAP) + ';\n');
console.log(`wrote ${outFile}: ${prefs.length} prefs, ${MAP.w}x${MAP.h}, ${MAP.kmPerUnit} km/unit, ${(fs.statSync(outFile).size / 1024).toFixed(0)} KB`);
