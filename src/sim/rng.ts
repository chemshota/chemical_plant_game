import type { GameState } from './state';

// ============================================================
// シード付き乱数 (mulberry32)。状態は GameState に持たせて再現可能にする
// ============================================================

export function random(state: GameState): number {
  state.rngState = (state.rngState + 0x6d2b79f5) >>> 0;
  let t = state.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(state: GameState, min: number, max: number): number {
  return min + random(state) * (max - min);
}

export function randInt(state: GameState, min: number, max: number): number {
  return Math.floor(randRange(state, min, max + 1));
}

export function pick<T>(state: GameState, items: T[]): T {
  return items[Math.floor(random(state) * items.length)];
}
