import { SAVE_VERSION, type GameState } from './state';

// ============================================================
// セーブ・ロード
// ============================================================

export const SAVE_KEY = 'chemical-plant-game/save';

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

// 壊れたデータや版の違うデータは null を返す
export function deserialize(text: string): GameState | null {
  try {
    const data = JSON.parse(text) as GameState;
    if (!data || data.version !== SAVE_VERSION) return null;
    if (!Array.isArray(data.devices) || typeof data.pipes !== 'object' || typeof data.money !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function saveTo(storage: Pick<Storage, 'setItem'>, state: GameState): void {
  storage.setItem(SAVE_KEY, serialize(state));
}

export function loadFrom(storage: Pick<Storage, 'getItem'>): GameState | null {
  const text = storage.getItem(SAVE_KEY);
  return text ? deserialize(text) : null;
}
