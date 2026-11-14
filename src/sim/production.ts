import { CHEMICALS, type ChemId } from '../data/chemicals';
import { DEVICE_TYPES } from '../data/devices';
import { rawPrice } from './market';
import { BUFFER_TURNS, outputPerTurn } from './network';
import { add, getMods, total, type Device, type GameState, type Mods, type TurnReport } from './state';

// ============================================================
// 生産 (受入・反応・出荷・放出)
// ============================================================

const entries = (amounts: Partial<Record<ChemId, number>>) =>
  Object.entries(amounts) as [ChemId, number][];

function setStatus(d: Device, status: Device['status'], note = '', rate = 0): void {
  d.status = status;
  d.statusNote = note;
  d.rate = rate;
}

function runIntake(state: GameState, d: Device, report: TurnReport): void {
  if (!d.chem) return setStatus(d, 'unset', '受け入れる原料を設定してください');
  const capacity = DEVICE_TYPES[d.type].capacity;
  const qty = Math.max(0, capacity - (d.outBuf[d.chem] ?? 0));
  const cost = Math.round(qty * rawPrice(state, d.chem));
  state.money -= cost;
  report.rawCost += cost;
  add(d.outBuf, d.chem, qty);
  setStatus(d, 'ok', '', qty / capacity);
}

function runSink(state: GameState, d: Device, report: TurnReport): void {
  const def = DEVICE_TYPES[d.type];
  const qty = total(d.inBuf);
  for (const [chem, amount] of entries(d.inBuf)) {
    if (amount <= 0) continue;
    if (def.role === 'shipping') {
      add(state.warehouse, chem, amount);
    } else {
      report.emission += amount * CHEMICALS[chem].pollution;
      if (def.role === 'dump') {
        const fee = amount * state.regulation.dumpFee;
        report.dumpFee += fee;
        state.money -= fee;
      }
    }
  }
  d.inBuf = {};
  setStatus(d, 'ok', '', qty / def.capacity);
}

// 電力を考慮する前の稼働率と、その制約理由を求める
function desiredRate(d: Device, mods: Mods): { rate: number; status: Device['status']; note: string } {
  const def = DEVICE_TYPES[d.type];
  let rate = 1;
  let status: Device['status'] = 'ok';
  let note = '';
  for (const [chem, need] of entries(def.inputs)) {
    const possible = (d.inBuf[chem] ?? 0) / need;
    if (possible < rate) {
      rate = possible;
      status = 'starved';
      note = `原料不足: ${CHEMICALS[chem].name}`;
    }
  }
  for (const chem of Object.keys(def.outputs) as ChemId[]) {
    const perTurn = outputPerTurn(d, chem, mods);
    const possible = (perTurn * BUFFER_TURNS - (d.outBuf[chem] ?? 0)) / perTurn;
    if (possible < rate) {
      rate = possible;
      status = 'blocked';
      note = `出力詰まり: ${CHEMICALS[chem].name}`;
    }
  }
  return { rate: Math.max(0, Math.min(1, rate)), status, note };
}

export function runProduction(state: GameState, report: TurnReport): void {
  const mods = getMods(state);
  const plans = new Map<number, ReturnType<typeof desiredRate>>();

  for (const d of state.devices) {
    const def = DEVICE_TYPES[d.type];
    if (d.brokenTurns > 0) {
      setStatus(d, 'broken', `事故で停止中 (残り ${d.brokenTurns} 期)`);
      d.brokenTurns--;
      continue;
    }
    if (!d.enabled) {
      setStatus(d, 'off', '手動で停止中');
      continue;
    }
    switch (def.role) {
      case 'intake': runIntake(state, d, report); break;
      case 'shipping':
      case 'stack':
      case 'dump': runSink(state, d, report); break;
      case 'tank':
        if (d.chem) setStatus(d, 'ok', '', total(d.inBuf) / def.capacity);
        else setStatus(d, 'unset', '貯める物質を設定してください');
        break;
      case 'lab':
        state.rp += def.capacity;
        setStatus(d, 'ok', '', 1);
        break;
      case 'process':
      case 'power':
        plans.set(d.id, desiredRate(d, mods));
        break;
    }
  }

  for (const d of state.devices) {
    const plan = plans.get(d.id);
    if (!plan) continue;
    report.powerSupply += DEVICE_TYPES[d.type].powerOut * plan.rate;
    report.powerDemand += DEVICE_TYPES[d.type].power * plan.rate;
  }
  const powerRatio = report.powerDemand > 0 ? Math.min(1, report.powerSupply / report.powerDemand) : 1;

  for (const d of state.devices) {
    const plan = plans.get(d.id);
    if (!plan) continue;
    const def = DEVICE_TYPES[d.type];
    let { rate, status, note } = plan;
    if (def.power > 0 && powerRatio < 1 && rate > 0) {
      rate *= powerRatio;
      status = 'nopower';
      note = `電力不足 (供給 ${Math.round(powerRatio * 100)}%)`;
    }
    for (const [chem, need] of entries(def.inputs)) add(d.inBuf, chem, -need * rate);
    for (const chem of Object.keys(def.outputs) as ChemId[]) {
      add(d.outBuf, chem, outputPerTurn(d, chem, mods) * rate);
    }
    const cost = Math.round(def.opCost * mods.opCostMult * rate);
    state.money -= cost;
    report.opCost += cost;

    if (rate >= 0.999) setStatus(d, 'ok', '', rate);
    else if (rate > 0.001) setStatus(d, status === 'nopower' ? 'nopower' : 'partial', note, rate);
    else setStatus(d, status === 'ok' ? 'starved' : status, note, 0);
  }
}
