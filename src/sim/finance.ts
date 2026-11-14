import { CHEM_IDS } from '../data/chemicals';
import { DEVICE_TYPES } from '../data/devices';
import { changeReputation } from './contracts';
import type { Result } from './grid';
import { currentPrice } from './market';
import { addLog, getMods, type GameState, type TurnReport } from './state';

// ============================================================
// 財務 (固定費・借入・汚染の罰金・企業価値)
// ============================================================

export const INTEREST_RATE = 0.015;
export const RENT_PER_TILE = 3;
export const LOAN_UNIT = 5000;
export const BANKRUPT_STREAK = 3;
const POLLUTION_DECAY = 0.7;

export function rent(state: GameState): number {
  return state.site.w * state.site.h * RENT_PER_TILE;
}

export function maintenanceTotal(state: GameState): number {
  const sum = state.devices.reduce((acc, d) => acc + DEVICE_TYPES[d.type].maintenance, 0);
  return Math.round(sum * getMods(state).maintenanceMult);
}

function deviceAssets(state: GameState): number {
  return state.devices.reduce((acc, d) => acc + DEVICE_TYPES[d.type].cost, 0);
}

export function companyValue(state: GameState): number {
  let value = state.money - state.loan + deviceAssets(state) * 0.5;
  for (const chem of CHEM_IDS) {
    value += (state.warehouse[chem] ?? 0) * currentPrice(state, chem) * 0.5;
  }
  return Math.round(value);
}

export function loanLimit(state: GameState): number {
  const byAssets = Math.floor(deviceAssets(state) * 0.6 / LOAN_UNIT) * LOAN_UNIT;
  return Math.max(20000, byAssets);
}

export function borrow(state: GameState, amount: number): Result {
  if (amount <= 0) return { ok: false, msg: '金額が不正です' };
  if (state.loan + amount > loanLimit(state)) return { ok: false, msg: '借入限度額を超えます' };
  state.loan += amount;
  state.money += amount;
  return { ok: true, msg: `¥${amount.toLocaleString('ja-JP')} を借り入れました` };
}

export function repay(state: GameState, amount: number): Result {
  const actual = Math.min(amount, state.loan);
  if (actual <= 0) return { ok: false, msg: '返済する借入がありません' };
  if (state.money < actual) return { ok: false, msg: '資金が足りません' };
  state.loan -= actual;
  state.money -= actual;
  return { ok: true, msg: `¥${actual.toLocaleString('ja-JP')} を返済しました` };
}

export function settleFinance(state: GameState, report: TurnReport): void {
  report.maintenance = maintenanceTotal(state);
  report.rent = rent(state);
  report.interest = Math.round(state.loan * INTEREST_RATE);

  state.pollution = state.pollution * POLLUTION_DECAY + report.emission;
  const excess = Math.max(0, state.pollution - state.regulation.threshold);
  report.fine = Math.round(excess * state.regulation.fineRate);
  if (state.pollution > state.regulation.threshold * 2) {
    changeReputation(state, -1);
    addLog(state, 'bad', '汚染がひどく、近隣からの苦情で信用が下がった');
  }

  state.money -= report.maintenance + report.rent + report.interest + report.fine;
}

// 期末の資金がマイナスなら連続回数を数え、限度に達したら破産
export function checkBankruptcy(state: GameState, report: TurnReport): void {
  if (state.money >= 0) {
    state.negativeStreak = 0;
    return;
  }
  state.negativeStreak++;
  if (state.negativeStreak >= BANKRUPT_STREAK) {
    state.gameOver = true;
    addLog(state, 'bad', '資金繰りに行き詰まり、会社は破産した');
    report.notices.push({ title: '破産', text: `資金のマイナスが ${BANKRUPT_STREAK} 期続き、操業を続けられなくなった` });
  } else {
    const left = BANKRUPT_STREAK - state.negativeStreak;
    addLog(state, 'bad', `資金がマイナス。あと ${left} 期続くと破産する`);
    report.notices.push({ title: '資金不足', text: `資金がマイナスになった。あと ${left} 期続くと破産する。借入か設備の整理で立て直そう` });
  }
}
