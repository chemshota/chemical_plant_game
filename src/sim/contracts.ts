import { CHEMICALS, type ChemId } from '../data/chemicals';
import { DEVICE_TYPES, DEVICE_TYPE_IDS } from '../data/devices';
import { CUSTOMERS } from '../data/events';
import { isUnlocked, type Result } from './grid';
import { basePrice, marketSize } from './market';
import { pick, randInt, randRange, random } from './rng';
import { add, addLog, type GameState, type TurnReport } from './state';

// ============================================================
// 契約 (引き合いの生成・受注・納入)
// ============================================================

const MAX_OFFERS = 3;

export function changeReputation(state: GameState, delta: number): void {
  state.reputation = Math.max(0, Math.min(100, state.reputation + delta));
}

export function maxContracts(state: GameState): number {
  return 2 + Math.floor(state.reputation / 25);
}

// いま建設できる装置で作れる製品
export function producibleProducts(state: GameState): ChemId[] {
  const result = new Set<ChemId>();
  for (const type of DEVICE_TYPE_IDS) {
    if (!isUnlocked(state, type)) continue;
    for (const chem of Object.keys(DEVICE_TYPES[type].outputs) as ChemId[]) {
      if (CHEMICALS[chem].kind === 'product') result.add(chem);
    }
  }
  return [...result];
}

function createOffer(state: GameState): void {
  const candidates = producibleProducts(state);
  if (!candidates.length) return;
  // 市場の大きい製品ほど引き合いが来やすい
  const weights = candidates.map(c => marketSize(state, c));
  let roll = random(state) * weights.reduce((a, b) => a + b, 0);
  let chem = candidates[0];
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) { chem = candidates[i]; break; }
  }
  const scale = 0.12 + 0.4 * state.reputation / 100;
  const qty = Math.max(2, Math.round(marketSize(state, chem) * scale * randRange(state, 0.7, 1.3)));
  const unitPrice = Math.round(basePrice(state, chem) * randRange(state, 1.08, 1.3));
  state.offers.push({
    id: state.nextContractId++,
    customer: pick(state, CUSTOMERS),
    chem,
    qtyPerTurn: qty,
    duration: randInt(state, 6, 12),
    unitPrice,
    penaltyPerTon: Math.round(unitPrice * 0.5),
    leadTime: randInt(state, 3, 5),
    offerTurnsLeft: 4,
    turnsWaited: 0,
    turnsDone: 0,
    delivered: 0,
    missedTurns: 0,
  });
}

export function refreshOffers(state: GameState): void {
  for (const offer of state.offers) offer.offerTurnsLeft--;
  state.offers = state.offers.filter(o => o.offerTurnsLeft > 0);
  if (state.offers.length < MAX_OFFERS && random(state) < 0.5) createOffer(state);
}

export function acceptContract(state: GameState, id: number): Result {
  const index = state.offers.findIndex(o => o.id === id);
  if (index === -1) return { ok: false, msg: '引き合いが見つかりません' };
  if (state.contracts.length >= maxContracts(state)) {
    return { ok: false, msg: `同時に受けられる契約は ${maxContracts(state)} 件までです (信用を上げると増える)` };
  }
  const [contract] = state.offers.splice(index, 1);
  state.contracts.push(contract);
  addLog(state, 'info', `${contract.customer}と契約: ${CHEMICALS[contract.chem].name} ${contract.qtyPerTurn}t/期 × ${contract.duration}期`);
  return { ok: true, msg: '契約を受注しました' };
}

export function deliverContracts(state: GameState, report: TurnReport): void {
  const remaining: typeof state.contracts = [];
  for (const c of state.contracts) {
    if (c.turnsWaited < c.leadTime) {
      c.turnsWaited++;
      remaining.push(c);
      continue;
    }
    const name = CHEMICALS[c.chem].name;
    const delivered = Math.min(state.warehouse[c.chem] ?? 0, c.qtyPerTurn);
    const revenue = Math.round(delivered * c.unitPrice);
    add(state.warehouse, c.chem, -delivered);
    add(report.sold, c.chem, delivered);
    add(state.soldTotal, c.chem, delivered);
    state.money += revenue;
    report.contractRevenue += revenue;
    c.delivered += delivered;

    const shortfall = c.qtyPerTurn - delivered;
    if (shortfall > c.qtyPerTurn * 0.1) {
      const penalty = Math.round(shortfall * c.penaltyPerTon);
      state.money -= penalty;
      report.penalty += penalty;
      c.missedTurns++;
      changeReputation(state, -2);
      addLog(state, 'bad', `${c.customer}への${name}が ${shortfall.toFixed(1)}t 不足。違約金 ¥${penalty.toLocaleString('ja-JP')}`);
    }

    c.turnsDone++;
    if (c.turnsDone < c.duration) {
      remaining.push(c);
    } else if (c.missedTurns === 0) {
      const gain = 4 + Math.round(c.duration / 3);
      changeReputation(state, gain);
      addLog(state, 'good', `${c.customer}との契約を完遂 (信用 +${gain})`);
    } else if (c.missedTurns <= c.duration / 4) {
      changeReputation(state, 1);
      addLog(state, 'info', `${c.customer}との契約が満了 (納入不足 ${c.missedTurns} 回、信用 +1)`);
    } else {
      addLog(state, 'bad', `${c.customer}との契約が満了 (納入不足 ${c.missedTurns} 回)`);
    }
  }
  state.contracts = remaining;
}
