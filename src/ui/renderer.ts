import { CHEMICALS, type ChemId } from '../data/chemicals';
import { DEVICE_TYPES, type DeviceRole } from '../data/devices';
import { canPlace, deviceAt, footprint } from '../sim/grid';
import { findNetworks, handlesChem } from '../sim/network';
import { tileKey, type Device, type DeviceStatus } from '../sim/state';
import { game, ui } from './app';

// ============================================================
// 敷地の Canvas 描画
// ============================================================

export const TILE = 40;

const ROLE_COLORS: Record<DeviceRole, string> = {
  process: '#2b3a55',
  power: '#4a3a1c',
  intake: '#1f4a3a',
  shipping: '#3a2a55',
  tank: '#2a3f45',
  stack: '#3d3d3d',
  dump: '#40351f',
  lab: '#1c3f5c',
};

const STATUS_COLORS: Record<DeviceStatus, string> = {
  new: '#8b949e',
  ok: '#3fb950',
  partial: '#d29922',
  starved: '#f85149',
  blocked: '#f85149',
  nopower: '#d29922',
  off: '#6e7681',
  broken: '#f85149',
  unset: '#d29922',
};

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

export function initRenderer(el: HTMLCanvasElement): void {
  canvas = el;
  ctx = el.getContext('2d')!;
}

function resize(): void {
  const { w, h } = game.state.site;
  const ratio = window.devicePixelRatio || 1;
  const width = w * TILE;
  const height = h * TILE;
  if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawGrid(): void {
  const { w, h } = game.state.site;
  ctx.fillStyle = '#10151c';
  ctx.fillRect(0, 0, w * TILE, h * TILE);
  ctx.strokeStyle = '#1f2630';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= w; x++) { ctx.moveTo(x * TILE + 0.5, 0); ctx.lineTo(x * TILE + 0.5, h * TILE); }
  for (let y = 0; y <= h; y++) { ctx.moveTo(0, y * TILE + 0.5); ctx.lineTo(w * TILE, y * TILE + 0.5); }
  ctx.stroke();
  // 外周 (受入・出荷設備を置ける帯) を示す
  ctx.strokeStyle = '#3d4654';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, w * TILE - 3, h * TILE - 3);
}

function pipeConnects(x: number, y: number, chem: ChemId): boolean {
  const state = game.state;
  if (state.pipes[tileKey(x, y)]?.includes(chem)) return true;
  const d = deviceAt(state, x, y);
  return d !== null && handlesChem(state, d, chem);
}

function drawPipes(): void {
  const state = game.state;
  ctx.lineCap = 'round';
  for (const [key, chems] of Object.entries(state.pipes)) {
    const [x, y] = key.split(',').map(Number);
    chems.forEach((chem, i) => {
      const offset = (i - (chems.length - 1) / 2) * 10;
      const cx = x * TILE + TILE / 2 + offset;
      const cy = y * TILE + TILE / 2 + offset;
      const color = CHEMICALS[chem].color;
      for (const pass of [{ width: 9, style: '#0d1117' }, { width: 5, style: color }]) {
        ctx.strokeStyle = pass.style;
        ctx.lineWidth = pass.width;
        ctx.beginPath();
        for (const [dx, dy] of DIRS) {
          if (!pipeConnects(x + dx, y + dy, chem)) continue;
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + dx * TILE / 2, cy + dy * TILE / 2);
        }
        ctx.stroke();
        ctx.fillStyle = pass.style;
        ctx.beginPath();
        ctx.arc(cx, cy, pass.width / 2 + 1, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
}

function drawDevice(d: Device): void {
  const def = DEVICE_TYPES[d.type];
  const x = d.x * TILE + 2;
  const y = d.y * TILE + 2;
  const w = d.w * TILE - 4;
  const h = d.h * TILE - 4;
  const statusColor = STATUS_COLORS[d.status];

  ctx.fillStyle = ROLE_COLORS[def.role];
  ctx.strokeStyle = d.id === ui.selectedId ? '#f0a500' : '#586274';
  ctx.lineWidth = d.id === ui.selectedId ? 3 : 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 5);
  ctx.fill();
  ctx.stroke();

  // 稼働率バー
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(x + 4, y + h - 7, w - 8, 3);
  ctx.fillStyle = statusColor;
  ctx.fillRect(x + 4, y + h - 7, (w - 8) * Math.max(0.04, Math.min(1, d.rate)), 3);

  ctx.beginPath();
  ctx.arc(x + w - 7, y + 7, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#e6edf3';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const small = d.w === 1 || d.h === 1;
  ctx.font = `${small ? 10 : 12}px sans-serif`;
  const sub = d.chem ? CHEMICALS[d.chem].name : '';
  const cx = x + w / 2;
  const cy = y + h / 2 - 1;
  if (sub && d.h >= 1) {
    ctx.fillText(def.short, cx, cy - 6, w - 6);
    ctx.fillStyle = CHEMICALS[d.chem!].color;
    ctx.font = '9px sans-serif';
    ctx.fillText(sub, cx, cy + 6, w - 6);
  } else {
    ctx.fillText(def.short, cx, cy, w - 6);
  }
}

// 隣り合った装置どうしの直結を、接している辺の上に物質の色の印で示す
function drawDirectLinks(): void {
  const state = game.state;
  const byId = new Map(state.devices.map(d => [d.id, d]));
  const counts = new Map<string, number>();
  for (const net of findNetworks(state)) {
    if (net.tiles.length) continue;
    const a = byId.get(net.deviceIds[0])!;
    const b = byId.get(net.deviceIds[1])!;
    const pairKey = net.deviceIds.join('-');
    const index = counts.get(pairKey) ?? 0;
    counts.set(pairKey, index + 1);
    const shift = (index % 2 ? 1 : -1) * Math.ceil(index / 2) * 11;

    let px: number;
    let py: number;
    if (a.x + a.w === b.x || b.x + b.w === a.x) {
      px = (a.x + a.w === b.x ? b.x : a.x) * TILE;
      py = (Math.max(a.y, b.y) + Math.min(a.y + a.h, b.y + b.h)) / 2 * TILE + shift;
    } else {
      px = (Math.max(a.x, b.x) + Math.min(a.x + a.w, b.x + b.w)) / 2 * TILE + shift;
      py = (a.y + a.h === b.y ? b.y : a.y) * TILE;
    }
    ctx.fillStyle = CHEMICALS[net.chem].color;
    ctx.strokeStyle = '#0d1117';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py - 6);
    ctx.lineTo(px + 6, py);
    ctx.lineTo(px, py + 6);
    ctx.lineTo(px - 6, py);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawOverlay(): void {
  const state = game.state;
  const hover = ui.hover;
  if (!hover) return;
  if (ui.tool === 'build' && ui.buildType) {
    const { w, h } = footprint(ui.buildType, ui.rotated);
    const valid = canPlace(state, ui.buildType, hover.x, hover.y, ui.rotated).ok;
    ctx.fillStyle = valid ? 'rgba(63,185,80,0.35)' : 'rgba(248,81,73,0.35)';
    ctx.strokeStyle = valid ? '#3fb950' : '#f85149';
    ctx.lineWidth = 2;
    ctx.fillRect(hover.x * TILE, hover.y * TILE, w * TILE, h * TILE);
    ctx.strokeRect(hover.x * TILE + 1, hover.y * TILE + 1, w * TILE - 2, h * TILE - 2);
    return;
  }
  if (ui.tool === 'pipe' || ui.tool === 'remove') {
    ctx.strokeStyle = ui.tool === 'pipe' ? CHEMICALS[ui.pipeChem].color : '#f85149';
    ctx.lineWidth = 2;
    ctx.strokeRect(hover.x * TILE + 2, hover.y * TILE + 2, TILE - 4, TILE - 4);
  }
}

export function drawBoard(): void {
  resize();
  drawGrid();
  drawPipes();
  for (const d of game.state.devices) drawDevice(d);
  drawDirectLinks();
  drawOverlay();
}
