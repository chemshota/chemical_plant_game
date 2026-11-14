import type { ChemId } from '../data/chemicals';
import type { DeviceTypeId } from '../data/devices';
import { loadFrom, saveTo } from '../sim/save';
import { createInitialState, type GameState } from '../sim/state';

// ============================================================
// 画面全体で共有する状態と再描画の起点
// ============================================================

export type Tool = 'select' | 'build' | 'pipe' | 'remove';
export type Tab = 'overview' | 'device' | 'contracts' | 'market' | 'research' | 'finance' | 'log';

export interface UiState {
  tool: Tool;
  buildType: DeviceTypeId | null;
  rotated: boolean;
  pipeChem: ChemId;
  selectedId: number | null;
  hover: { x: number; y: number } | null;
  tab: Tab;
  message: string;
}

export const game: { state: GameState } = { state: createInitialState() };

export const ui: UiState = {
  tool: 'select',
  buildType: null,
  rotated: false,
  pipeChem: 'sulfur',
  selectedId: null,
  hover: null,
  tab: 'overview',
  message: '',
};

type Listener = () => void;
const boardListeners: Listener[] = [];
const panelListeners: Listener[] = [];

export function onBoardRedraw(fn: Listener): void { boardListeners.push(fn); }
export function onPanelRender(fn: Listener): void { panelListeners.push(fn); }

// 敷地だけを描き直す (マウス移動など頻繁な更新用)
export function redrawBoard(): void {
  for (const fn of boardListeners) fn();
}

// 全体を描き直して自動保存する
export function refresh(): void {
  redrawBoard();
  for (const fn of panelListeners) fn();
  autosave();
}

export function setMessage(text: string): void {
  ui.message = text;
  const bar = document.getElementById('statusbar');
  if (bar) bar.textContent = text;
}

export function setTool(tool: Tool): void {
  ui.tool = tool;
  if (tool !== 'build') ui.buildType = null;
}

function autosave(): void {
  try {
    saveTo(localStorage, game.state);
  } catch {
    // 保存できない環境 (プライベートウィンドウ等) でも遊べるようにする
  }
}

export function loadSavedGame(): boolean {
  try {
    const saved = loadFrom(localStorage);
    if (!saved) return false;
    game.state = saved;
    return true;
  } catch {
    return false;
  }
}

export function startNewGame(): void {
  game.state = createInitialState();
  ui.selectedId = null;
  ui.tab = 'overview';
  setTool('select');
}
