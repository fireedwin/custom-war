// src/main.ts
// M0：抓一小塊維港的 OSM 資料 → 產生地形網格 → 畫出來用眼睛檢查。

import { fetchOsm, classify, type Feature } from './mapgen/overpass';
import { rasterize } from './mapgen/rasterize';
import { PALETTE, TERRAIN_NAMES, rgbToCss, type BBox, type TerrainGrid } from './mapgen/types';

// 尖沙咀至灣仔一帶，約 5 公里 × 3.3 公里
const BBOX: BBox = { west: 114.155, south: 22.278, east: 114.208, north: 22.31 };
const CELL_PX = 3; // 每格畫幾個螢幕像素

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <p id="status">準備中…</p>
  <canvas id="grid"></canvas>
  <p id="stats"></p>
  <button id="save" disabled>下載地形檔</button>
`;

const statusEl = app.querySelector<HTMLParagraphElement>('#status')!;
const statsEl = app.querySelector<HTMLParagraphElement>('#stats')!;
const canvas = app.querySelector<HTMLCanvasElement>('#grid')!;
const saveBtn = app.querySelector<HTMLButtonElement>('#save')!;

function drawGrid(grid: TerrainGrid) {
  canvas.width = grid.width * CELL_PX;
  canvas.height = grid.height * CELL_PX;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      ctx.fillStyle = rgbToCss(PALETTE[grid.cells[y * grid.width + x]]);
      ctx.fillRect(x * CELL_PX, y * CELL_PX, CELL_PX, CELL_PX);
    }
  }
}

function describe(grid: TerrainGrid, features: Feature[], tunnels: unknown[]): string {
  const counts = new Map<number, number>();
  for (const c of grid.cells) counts.set(c, (counts.get(c) ?? 0) + 1);
  const total = grid.cells.length;
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => `${TERRAIN_NAMES[code]} ${((n / total) * 100).toFixed(1)}%`);
  const metresPerCell =
    ((BBOX.east - BBOX.west) * 111320 * Math.cos((BBOX.south * Math.PI) / 180)) / grid.width;
  return [
    `網格 ${grid.width}×${grid.height}，每格約 ${metresPerCell.toFixed(1)} 米`,
    `圖徵 ${features.length} 條，隧道 ${tunnels.length} 條`,
    parts.join('、'),
  ].join(' ｜ ');
}

async function run() {
  try {
    statusEl.textContent = '正在向 Overpass 取得資料…（首次可能要等十幾秒）';
    const ways = await fetchOsm(BBOX);

    statusEl.textContent = `取得 ${ways.length} 條資料，正在產生地形…`;
    const features = ways.map(classify).filter((f): f is Feature => f !== null);
    const { grid, tunnels } = rasterize(features, BBOX, 256);

    drawGrid(grid);
    statusEl.textContent = '完成。請檢查：海底隧道有沒有變成海上陸橋、碼頭有沒有斷開。';
    statsEl.textContent = describe(grid, features, tunnels);

    saveBtn.disabled = false;
    saveBtn.onclick = () => {
      const blob = new Blob(
        [JSON.stringify({ schemaVersion: 1, ...grid, cells: Array.from(grid.cells) })],
        { type: 'application/json' },
      );
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'victoria-harbour.json';
      a.click();
      URL.revokeObjectURL(a.href);
    };
  } catch (err) {
    statusEl.textContent = `出錯了：${err instanceof Error ? err.message : String(err)}`;
  }
}

run();
