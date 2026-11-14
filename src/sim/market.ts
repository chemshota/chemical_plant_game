import { CHEMICALS, CHEM_IDS, type ChemId } from '../data/chemicals';
import { ERAS } from '../data/eras';
import { randRange } from './rng';
import { add, getMods, type GameState, type TurnReport } from './state';

// ============================================================
// 市場 (価格変動とスポット販売)
// ============================================================

// 時代補正を含む基準価格
export function basePrice(state: GameState, chem: ChemId): number {
  return CHEMICALS[chem].basePrice * (ERAS[state.era].priceMult[chem] ?? 1);
}

// イベント補正を含む現在価格
export function currentPrice(state: GameState, chem: ChemId): number {
  let price = state.prices[chem];
  for (const mod of state.priceMods) {
    const applies = mod.chem === chem || (mod.chem === null && CHEMICALS[chem].kind === 'product');
    if (applies) price *= mod.mult;
  }
  return price;
}

export function rawPrice(state: GameState, chem: ChemId): number {
  return currentPrice(state, chem) * getMods(state).rawPriceMult;
}

export function marketSize(state: GameState, chem: ChemId): number {
  return CHEMICALS[chem].marketSize * (ERAS[state.era].sizeMult[chem] ?? 1) * getMods(state).marketSizeMult;
}

// qty を一度に売ったときの平均単価。市場規模ぶん売ると 2/3 まで下がる
export function spotUnitPrice(state: GameState, chem: ChemId, qty: number): number {
  const size = marketSize(state, chem);
  if (size <= 0) return 0;
  return currentPrice(state, chem) / (1 + qty / (2 * size));
}

export function updatePrices(state: GameState): void {
  for (const chem of CHEM_IDS) {
    const base = basePrice(state, chem);
    if (base <= 0) continue;
    const reverted = state.prices[chem] + (base - state.prices[chem]) * 0.2;
    const next = reverted * randRange(state, 0.93, 1.07);
    state.prices[chem] = Math.round(Math.max(base * 0.65, Math.min(base * 1.5, next)));
  }
  for (const mod of state.priceMods) mod.turnsLeft--;
  state.priceMods = state.priceMods.filter(mod => mod.turnsLeft > 0);
}

// 契約納入後に残った倉庫の製品をスポット市場で売る
export function sellSpot(state: GameState, report: TurnReport): void {
  for (const chem of CHEM_IDS) {
    const qty = state.warehouse[chem] ?? 0;
    if (qty <= 1e-9 || state.hold[chem]) continue;
    const revenue = Math.round(spotUnitPrice(state, chem, qty) * qty);
    state.warehouse[chem] = 0;
    state.money += revenue;
    report.spotRevenue += revenue;
    add(report.sold, chem, qty);
    add(state.soldTotal, chem, qty);
  }
}
