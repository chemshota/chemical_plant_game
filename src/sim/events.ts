import { CHEMICALS, CHEM_IDS, type ChemId } from '../data/chemicals';
import { DEVICE_TYPES } from '../data/devices';
import { RANDOM_EVENT_CHANCE, RANDOM_EVENT_START_TURN, SCRIPTED_EVENTS } from '../data/events';
import { producibleProducts } from './contracts';
import { pick, random } from './rng';
import { addLog, type GameState, type TurnReport } from './state';

// ============================================================
// イベント (史実に沿った固定イベントと突発イベント)
// ============================================================

function notify(state: GameState, report: TurnReport, title: string, text: string): void {
  addLog(state, 'event', `${title}: ${text}`);
  report.notices.push({ title, text });
}

function applyScripted(state: GameState, id: string): void {
  switch (id) {
    case 'alkali_act':
      state.regulation.threshold = Math.min(state.regulation.threshold, 15);
      state.regulation.fineRate = Math.max(state.regulation.fineRate, 60);
      break;
    case 'waste_regulation':
      state.regulation.dumpFee = Math.max(state.regulation.dumpFee, 100);
      break;
    case 'war_demand':
      for (const chem of ['nitric_acid', 'ammonium_nitrate'] as ChemId[]) {
        state.priceMods.push({ chem, mult: 1.4, turnsLeft: 10, label: '火薬原料の特需' });
      }
      break;
  }
}

function randomEvent(state: GameState, report: TurnReport): void {
  const roll = random(state);
  if (roll < 0.3) {
    const chem = pick(state, CHEM_IDS.filter(c => CHEMICALS[c].kind === 'raw'));
    state.priceMods.push({ chem, mult: 1.6, turnsLeft: 4, label: '原料高騰' });
    notify(state, report, '原料高騰', `${CHEMICALS[chem].name}の産地で供給が滞り、4期のあいだ価格が 60% 上がる`);
  } else if (roll < 0.55) {
    const products = producibleProducts(state);
    if (!products.length) return;
    const chem = pick(state, products);
    state.priceMods.push({ chem, mult: 1.4, turnsLeft: 4, label: '需要急増' });
    notify(state, report, '需要急増', `${CHEMICALS[chem].name}の引き合いが強まり、4期のあいだ相場が 40% 上がる`);
  } else if (roll < 0.75) {
    state.priceMods.push({ chem: null, mult: 0.8, turnsLeft: 3, label: '不況' });
    notify(state, report, '不況', '景気が冷え込み、3期のあいだ全製品の相場が 20% 下がる');
  } else {
    const targets = state.devices.filter(d =>
      ['process', 'power'].includes(DEVICE_TYPES[d.type].role) && d.brokenTurns === 0);
    if (!targets.length) return;
    const d = pick(state, targets);
    const def = DEVICE_TYPES[d.type];
    const repair = Math.round(def.cost * 0.1);
    d.brokenTurns = 2;
    state.money -= repair;
    notify(state, report, '設備事故', `${def.name}で事故が起き、2期のあいだ停止する。修理費 ¥${repair.toLocaleString('ja-JP')}`);
  }
}

export function runEvents(state: GameState, report: TurnReport): void {
  const eraTurns = state.turn - state.eraStartTurn;
  for (const ev of SCRIPTED_EVENTS) {
    if (ev.era !== state.era || eraTurns < ev.afterTurns || state.firedEvents.includes(ev.id)) continue;
    state.firedEvents.push(ev.id);
    applyScripted(state, ev.id);
    notify(state, report, ev.title, ev.text);
  }
  if (state.turn >= RANDOM_EVENT_START_TURN && random(state) < RANDOM_EVENT_CHANCE) {
    randomEvent(state, report);
  }
}
