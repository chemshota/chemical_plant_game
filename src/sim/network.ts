import { CHEMICALS, type ChemId } from '../data/chemicals';
import { DEVICE_TYPES } from '../data/devices';
import { add, getMods, tileKey, total, type Device, type GameState, type Mods } from './state';

// ============================================================
// 配管網の検出と物質の配分
// ============================================================

const EPS = 1e-9;

// tiles が空のものは、隣り合った装置どうしの直結
export interface Network {
  chem: ChemId;
  tiles: string[];
  deviceIds: number[];
}

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function findNetworks(state: GameState): Network[] {
  const occupied = new Map<string, number>();
  for (const d of state.devices) {
    for (let y = d.y; y < d.y + d.h; y++) {
      for (let x = d.x; x < d.x + d.w; x++) occupied.set(tileKey(x, y), d.id);
    }
  }

  const networks: Network[] = [];
  const seen = new Set<string>();
  for (const [startKey, chems] of Object.entries(state.pipes)) {
    for (const chem of chems) {
      if (seen.has(`${startKey}|${chem}`)) continue;
      const tiles: string[] = [];
      const deviceIds = new Set<number>();
      const queue = [startKey];
      seen.add(`${startKey}|${chem}`);
      while (queue.length) {
        const key = queue.pop()!;
        tiles.push(key);
        const [x, y] = key.split(',').map(Number);
        for (const [dx, dy] of NEIGHBORS) {
          const nKey = tileKey(x + dx, y + dy);
          const devId = occupied.get(nKey);
          if (devId !== undefined) {
            deviceIds.add(devId);
          } else if (state.pipes[nKey]?.includes(chem) && !seen.has(`${nKey}|${chem}`)) {
            seen.add(`${nKey}|${chem}`);
            queue.push(nKey);
          }
        }
      }
      networks.push({ chem, tiles, deviceIds: [...deviceIds].sort((a, b) => a - b) });
    }
  }
  return [...networks, ...findDirectLinks(state, occupied)];
}

function sourceChems(d: Device): ChemId[] {
  const def = DEVICE_TYPES[d.type];
  if (def.role === 'intake' || def.role === 'tank') return d.chem ? [d.chem] : [];
  return Object.keys(def.outputs) as ChemId[];
}

// 辺で接している装置の組ごとに、片方が出して片方が受ける物質を直結する
function findDirectLinks(state: GameState, occupied: Map<string, number>): Network[] {
  const byId = new Map(state.devices.map(d => [d.id, d]));
  const links: Network[] = [];
  const seen = new Set<string>();
  for (const a of state.devices) {
    for (let y = a.y; y < a.y + a.h; y++) {
      for (let x = a.x; x < a.x + a.w; x++) {
        for (const [dx, dy] of NEIGHBORS) {
          const otherId = occupied.get(tileKey(x + dx, y + dy));
          if (otherId === undefined || otherId <= a.id || seen.has(`${a.id}-${otherId}`)) continue;
          seen.add(`${a.id}-${otherId}`);
          const b = byId.get(otherId)!;
          const chems = new Set<ChemId>();
          for (const [from, to] of [[a, b], [b, a]]) {
            for (const chem of sourceChems(from)) {
              if (sinkPriority({ ...to, enabled: true }, chem) > 0) chems.add(chem);
            }
          }
          for (const chem of chems) links.push({ chem, tiles: [], deviceIds: [a.id, b.id] });
        }
      }
    }
  }
  return links;
}

// 入出力バッファは1期分の2倍まで
export const BUFFER_TURNS = 2;

export function outputPerTurn(d: Device, chem: ChemId, mods: Mods): number {
  return (DEVICE_TYPES[d.type].outputs[chem] ?? 0) * (mods.yieldMult[d.type] ?? 1);
}

// 受け入れの優先度。1: 反応装置 / 2: 貯槽 / 3: 出荷 / 4: 放出・投棄 / 0: 受け入れない
export function sinkPriority(d: Device, chem: ChemId): number {
  const def = DEVICE_TYPES[d.type];
  const info = CHEMICALS[chem];
  switch (def.role) {
    case 'process':
    case 'power':
      return def.inputs[chem] ? 1 : 0;
    case 'tank':
      return d.chem === chem ? 2 : 0;
    case 'shipping':
      return d.enabled && info.kind === 'product' ? 3 : 0;
    case 'stack':
      return d.enabled && info.phase === 'gas' ? 4 : 0;
    case 'dump':
      return d.enabled && info.phase !== 'gas' && info.kind !== 'raw' ? 4 : 0;
    default:
      return 0;
  }
}

export function sinkDemand(d: Device, chem: ChemId): number {
  const def = DEVICE_TYPES[d.type];
  if (def.role === 'process' || def.role === 'power') {
    return Math.max(0, (def.inputs[chem] ?? 0) * BUFFER_TURNS - (d.inBuf[chem] ?? 0));
  }
  return Math.max(0, def.capacity - total(d.inBuf));
}

function sourceSupply(d: Device, chem: ChemId): number {
  const role = DEVICE_TYPES[d.type].role;
  if (role !== 'process' && role !== 'intake') return 0;
  return d.outBuf[chem] ?? 0;
}

// 供給側から受け入れ側へ、それぞれの量に比例して配分する
function transfer(
  chem: ChemId,
  sources: Device[], supplyOf: (d: Device) => number, take: (d: Device, qty: number) => void,
  sinks: Device[],
): void {
  const supplies = sources.map(supplyOf);
  const demands = sinks.map(d => sinkDemand(d, chem));
  const supply = supplies.reduce((a, b) => a + b, 0);
  const demand = demands.reduce((a, b) => a + b, 0);
  if (supply <= EPS || demand <= EPS) return;
  const moved = Math.min(supply, demand);
  sources.forEach((d, i) => take(d, supplies[i] * moved / supply));
  sinks.forEach((d, i) => add(d.inBuf, chem, demands[i] * moved / demand));
}

export function distribute(state: GameState): void {
  const byId = new Map(state.devices.map(d => [d.id, d]));
  const networks = findNetworks(state).map(net => ({
    chem: net.chem,
    devs: net.deviceIds.map(id => byId.get(id)!),
  }));

  // 優先度の高い受け入れ先から、すべての配管網・直結をまたいで順に満たす
  for (const priority of [1, 2, 3, 4]) {
    for (const { chem, devs } of networks) {
      const sinks = devs.filter(d => sinkPriority(d, chem) === priority);
      if (!sinks.length) continue;
      const sources = devs.filter(d => sourceSupply(d, chem) > EPS);
      transfer(chem, sources, d => sourceSupply(d, chem), (d, qty) => add(d.outBuf, chem, -qty), sinks);
    }
    if (priority !== 1) continue;
    // 反応装置の不足分だけ貯槽から払い出す
    for (const { chem, devs } of networks) {
      const sinks = devs.filter(d => sinkPriority(d, chem) === 1);
      const tanks = devs.filter(d => DEVICE_TYPES[d.type].role === 'tank' && d.chem === chem);
      if (sinks.length && tanks.length) {
        transfer(chem, tanks, d => d.inBuf[chem] ?? 0, (d, qty) => add(d.inBuf, chem, -qty), sinks);
      }
    }
  }
}

// 装置がその物質の配管とやり取りするか (描画・案内用)
export function handlesChem(state: GameState, d: Device, chem: ChemId): boolean {
  const def = DEVICE_TYPES[d.type];
  if (def.role === 'intake') return d.chem === chem;
  if (outputPerTurn(d, chem, getMods(state)) > 0) return true;
  return sinkPriority({ ...d, enabled: true }, chem) > 0;
}
