import { ERAS, type EraGoal } from '../data/eras';
import { companyValue } from './finance';
import { addLog, type GameState, type TurnReport } from './state';

// ============================================================
// 時代目標と時代の進行
// ============================================================

export interface GoalProgress {
  label: string;
  current: number;
  target: number;
  done: boolean;
}

export function goalProgress(state: GameState, goal: EraGoal): GoalProgress {
  let current = 0;
  if (goal.kind === 'sold') {
    current = goal.chems.reduce((acc, c) => acc + (state.soldTotal[c] ?? 0), 0);
  } else if (goal.kind === 'reputation') {
    current = state.reputation;
  } else {
    current = companyValue(state);
  }
  return { label: goal.label, current, target: goal.amount, done: current >= goal.amount };
}

export function eraGoals(state: GameState): GoalProgress[] {
  return ERAS[state.era].goals.map(g => goalProgress(state, g));
}

export function checkEraAdvance(state: GameState, report: TurnReport): void {
  if (state.cleared || !eraGoals(state).every(g => g.done)) return;

  if (state.era >= ERAS.length - 1) {
    state.cleared = true;
    addLog(state, 'good', 'すべての時代目標を達成した');
    report.notices.push({
      title: 'キャンペーン達成',
      text: `すべての時代目標を達成した。最終的な企業価値は ¥${companyValue(state).toLocaleString('ja-JP')}。このまま操業を続けることもできる`,
    });
    return;
  }

  state.era++;
  state.eraStartTurn = state.turn + 1;
  const era = ERAS[state.era];
  // 規制は緩むことはない
  state.regulation = {
    threshold: Math.min(state.regulation.threshold, era.regulation.threshold),
    fineRate: Math.max(state.regulation.fineRate, era.regulation.fineRate),
    dumpFee: Math.max(state.regulation.dumpFee, era.regulation.dumpFee),
  };
  addLog(state, 'event', `時代が「${era.name}」に移った`);
  report.notices.push({
    title: `${era.name} (${era.year}年代)`,
    text: `${era.desc}。相場と規制が変わり、新しい技術を研究できるようになった`,
  });
}
