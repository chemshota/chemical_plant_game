import { DEVICE_TYPES } from '../data/devices';
import { addPipe, deviceAt, placeDevice, removeDevice, removePipe } from '../sim/grid';
import { tileKey } from '../sim/state';
import { game, redrawBoard, refresh, setMessage, setTool, ui } from './app';
import { chemName } from './format';
import { TILE } from './renderer';

// ============================================================
// 敷地上のマウス・キーボード操作
// ============================================================

let dragging = false;
let lastTile: { x: number; y: number } | null = null;

function tileFromEvent(canvas: HTMLCanvasElement, ev: MouseEvent): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((ev.clientX - rect.left) / TILE);
  const y = Math.floor((ev.clientY - rect.top) / TILE);
  const { w, h } = game.state.site;
  return x >= 0 && y >= 0 && x < w && y < h ? { x, y } : null;
}

function describeTile(x: number, y: number): string {
  const state = game.state;
  const d = deviceAt(state, x, y);
  if (d) {
    const def = DEVICE_TYPES[d.type];
    return `${def.name}${d.statusNote ? ` — ${d.statusNote}` : ''}`;
  }
  const chems = state.pipes[tileKey(x, y)];
  if (chems?.length) return `配管: ${chems.map(chemName).join(' / ')}`;
  return '';
}

function hint(): string {
  if (ui.tool === 'build' && ui.buildType) return `${DEVICE_TYPES[ui.buildType].name}を配置 (R で回転、Esc で中止)`;
  if (ui.tool === 'pipe') return `${chemName(ui.pipeChem)}の配管を敷設 (ドラッグで連続、Esc で中止)`;
  if (ui.tool === 'remove') return '撤去するものをクリック (配管はドラッグで連続、Esc で中止)';
  return '';
}

function applyAt(x: number, y: number, first: boolean): void {
  const state = game.state;
  if (ui.tool === 'pipe') {
    const result = addPipe(state, x, y, ui.pipeChem);
    if (!result.ok && first) setMessage(result.msg);
  } else if (ui.tool === 'remove') {
    removePipe(state, x, y);
  }
}

// ドラッグ中に飛ばしたタイルを埋めながら進む
function dragTo(x: number, y: number): void {
  if (!lastTile) return;
  while (lastTile.x !== x || lastTile.y !== y) {
    if (lastTile.x !== x) lastTile.x += Math.sign(x - lastTile.x);
    else lastTile.y += Math.sign(y - lastTile.y);
    applyAt(lastTile.x, lastTile.y, false);
  }
}

function onMouseDown(tile: { x: number; y: number }): void {
  const state = game.state;
  if (state.gameOver) return;
  const { x, y } = tile;
  const target = deviceAt(state, x, y);

  if (ui.tool === 'build' && ui.buildType) {
    const result = placeDevice(state, ui.buildType, x, y, ui.rotated);
    setMessage(result.ok ? result.msg : result.msg);
    if (result.ok) {
      const placed = state.devices[state.devices.length - 1];
      const role = DEVICE_TYPES[placed.type].role;
      if (role === 'intake' || role === 'tank') {
        // 物質の設定が必要な装置は、置いたらすぐ設定画面へ
        ui.selectedId = placed.id;
        ui.tab = 'device';
        setTool('select');
      }
    }
    refresh();
    return;
  }
  if (ui.tool === 'pipe') {
    if (target) {
      setMessage('配管は空いたタイルに敷いてください。装置には隣のタイルからつながります');
      return;
    }
    dragging = true;
    lastTile = { x, y };
    applyAt(x, y, true);
    refresh();
    return;
  }
  if (ui.tool === 'remove') {
    if (target) {
      const def = DEVICE_TYPES[target.type];
      if (window.confirm(`${def.name}を撤去しますか？ (建設費の 30% が戻ります)`)) {
        if (ui.selectedId === target.id) ui.selectedId = null;
        setMessage(removeDevice(state, target.id).msg);
      }
    } else {
      dragging = true;
      lastTile = { x, y };
      applyAt(x, y, true);
    }
    refresh();
    return;
  }
  ui.selectedId = target ? target.id : null;
  if (target) ui.tab = 'device';
  else if (ui.tab === 'device') ui.tab = 'overview';
  refresh();
}

export function initInput(canvas: HTMLCanvasElement): void {
  canvas.addEventListener('mousedown', ev => {
    if (ev.button !== 0) return;
    const tile = tileFromEvent(canvas, ev);
    if (tile) onMouseDown(tile);
  });

  canvas.addEventListener('mousemove', ev => {
    const tile = tileFromEvent(canvas, ev);
    const changed = tile?.x !== ui.hover?.x || tile?.y !== ui.hover?.y;
    ui.hover = tile;
    if (!changed) return;
    if (tile && dragging) dragTo(tile.x, tile.y);
    if (tile) setMessage(describeTile(tile.x, tile.y) || hint());
    redrawBoard();
  });

  canvas.addEventListener('mouseleave', () => {
    ui.hover = null;
    redrawBoard();
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    lastTile = null;
    refresh();
  });

  canvas.addEventListener('contextmenu', ev => {
    ev.preventDefault();
    setTool('select');
    refresh();
  });

  window.addEventListener('keydown', ev => {
    const el = ev.target as HTMLElement;
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
    if (ev.key === 'Escape') {
      setTool('select');
      setMessage('');
      refresh();
    } else if (ev.key === 'r' || ev.key === 'R') {
      ui.rotated = !ui.rotated;
      redrawBoard();
    }
  });
}
