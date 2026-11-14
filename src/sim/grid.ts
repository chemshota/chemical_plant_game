import { CHEMICALS, type ChemId } from '../data/chemicals';
import { DEVICE_TYPES, type DeviceTypeId } from '../data/devices';
import {
  addLog, tileKey, SITE_EXPAND_STEP, SITE_MAX_W,
  type Device, type GameState,
} from './state';

// ============================================================
// 敷地・装置配置・配管敷設
// ============================================================

export const PIPE_COST = 100;
// 1タイルに通せる配管の本数 (別の物質どうしは同じタイルで交差できる)
export const PIPE_LAYERS = 3;
export const DEMOLISH_REFUND = 0.3;

export interface Result {
  ok: boolean;
  msg: string;
}

const ok = (msg = ''): Result => ({ ok: true, msg });
const fail = (msg: string): Result => ({ ok: false, msg });

export function isUnlocked(state: GameState, type: DeviceTypeId): boolean {
  const tech = DEVICE_TYPES[type].tech;
  return tech === null || state.techs.includes(tech);
}

export function deviceAt(state: GameState, x: number, y: number): Device | null {
  for (const d of state.devices) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
  }
  return null;
}

export function footprint(type: DeviceTypeId, rotated: boolean): { w: number; h: number } {
  const t = DEVICE_TYPES[type];
  return rotated ? { w: t.h, h: t.w } : { w: t.w, h: t.h };
}

export function canPlace(state: GameState, type: DeviceTypeId, x: number, y: number, rotated = false): Result {
  const def = DEVICE_TYPES[type];
  const { w, h } = footprint(type, rotated);
  if (!isUnlocked(state, type)) return fail('まだ研究されていません');
  if (x < 0 || y < 0 || x + w > state.site.w || y + h > state.site.h) return fail('敷地の外です');
  for (let ty = y; ty < y + h; ty++) {
    for (let tx = x; tx < x + w; tx++) {
      if (deviceAt(state, tx, ty)) return fail('他の装置と重なっています');
      if (state.pipes[tileKey(tx, ty)]?.length) return fail('配管と重なっています');
    }
  }
  if (def.role === 'intake' || def.role === 'shipping') {
    const onEdge = x === 0 || y === 0 || x + w === state.site.w || y + h === state.site.h;
    if (!onEdge) return fail(`${def.name}は敷地の外周に接して置いてください`);
  }
  if (state.money < def.cost) return fail('資金が足りません');
  return ok();
}

export function placeDevice(state: GameState, type: DeviceTypeId, x: number, y: number, rotated = false): Result {
  const check = canPlace(state, type, x, y, rotated);
  if (!check.ok) return check;
  const def = DEVICE_TYPES[type];
  const { w, h } = footprint(type, rotated);
  state.money -= def.cost;
  state.devices.push({
    id: state.nextDeviceId++,
    type, x, y, w, h,
    enabled: true,
    chem: null,
    inBuf: {},
    outBuf: {},
    brokenTurns: 0,
    status: def.role === 'intake' || def.role === 'tank' ? 'unset' : 'new',
    statusNote: '',
    rate: 0,
  });
  return ok(`${def.name}を建設`);
}

export function removeDevice(state: GameState, id: number): Result {
  const index = state.devices.findIndex(d => d.id === id);
  if (index === -1) return fail('装置が見つかりません');
  const def = DEVICE_TYPES[state.devices[index].type];
  const refund = Math.floor(def.cost * DEMOLISH_REFUND);
  state.money += refund;
  state.devices.splice(index, 1);
  return ok(`${def.name}を撤去 (払戻 ¥${refund.toLocaleString('ja-JP')})`);
}

// intake は原料、tank は任意の物質を設定できる
export function setDeviceChem(state: GameState, id: number, chem: ChemId): Result {
  const d = state.devices.find(dev => dev.id === id);
  if (!d) return fail('装置が見つかりません');
  const role = DEVICE_TYPES[d.type].role;
  if (role === 'intake') {
    if (CHEMICALS[chem].kind !== 'raw') return fail('受入設備に設定できるのは原料だけです');
    d.outBuf = {};
  } else if (role === 'tank') {
    d.inBuf = {};
  } else {
    return fail('この装置には物質を設定できません');
  }
  d.chem = chem;
  d.status = 'new';
  d.statusNote = '';
  return ok();
}

export function setDeviceEnabled(state: GameState, id: number, enabled: boolean): void {
  const d = state.devices.find(dev => dev.id === id);
  if (d) d.enabled = enabled;
}

export function addPipe(state: GameState, x: number, y: number, chem: ChemId): Result {
  if (x < 0 || y < 0 || x >= state.site.w || y >= state.site.h) return fail('敷地の外です');
  if (deviceAt(state, x, y)) return fail('装置の上には敷けません');
  const key = tileKey(x, y);
  const current = state.pipes[key] ?? [];
  if (current.includes(chem)) return fail('すでに敷設済みです');
  if (current.length >= PIPE_LAYERS) return fail(`1タイルに通せる配管は ${PIPE_LAYERS} 本までです`);
  if (state.money < PIPE_COST) return fail('資金が足りません');
  state.money -= PIPE_COST;
  state.pipes[key] = [...current, chem];
  return ok();
}

// chem を省略するとそのタイルの配管をすべて撤去する
export function removePipe(state: GameState, x: number, y: number, chem?: ChemId): boolean {
  const key = tileKey(x, y);
  const current = state.pipes[key];
  if (!current?.length) return false;
  const next = chem ? current.filter(c => c !== chem) : [];
  if (next.length === current.length) return false;
  if (next.length) state.pipes[key] = next;
  else delete state.pipes[key];
  return true;
}

export function expandCost(state: GameState): number {
  return 8000 * (1 + (state.site.w - 16) / SITE_EXPAND_STEP);
}

export function expandSite(state: GameState): Result {
  if (state.site.w >= SITE_MAX_W) return fail('これ以上は拡張できません');
  const cost = expandCost(state);
  if (state.money < cost) return fail('資金が足りません');
  // 右端に接していた受入・出荷設備は外周から外れるが、既設はそのまま使える
  state.money -= cost;
  state.site.w += SITE_EXPAND_STEP;
  addLog(state, 'info', `敷地を東へ拡張 (¥${cost.toLocaleString('ja-JP')})`);
  return ok('敷地を拡張しました');
}
