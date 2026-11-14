import { TECHS } from '../data/techs';
import type { Result } from './grid';
import { addLog, type GameState } from './state';

// ============================================================
// 研究
// ============================================================

export type TechStatus = 'done' | 'available' | 'locked' | 'future';

export function techStatus(state: GameState, id: string): TechStatus {
  const tech = TECHS[id];
  if (state.techs.includes(id)) return 'done';
  if (tech.era > state.era) return 'future';
  if (!tech.requires.every(r => state.techs.includes(r))) return 'locked';
  return 'available';
}

export function researchTech(state: GameState, id: string): Result {
  const tech = TECHS[id];
  if (!tech) return { ok: false, msg: '技術が見つかりません' };
  const status = techStatus(state, id);
  if (status === 'done') return { ok: false, msg: '研究済みです' };
  if (status === 'future') return { ok: false, msg: 'まだこの時代では研究できません' };
  if (status === 'locked') return { ok: false, msg: '前提となる技術が必要です' };
  if (state.rp < tech.cost) return { ok: false, msg: '研究ポイントが足りません' };
  state.rp -= tech.cost;
  state.techs.push(id);
  addLog(state, 'good', `研究完了: ${tech.name}`);
  return { ok: true, msg: `${tech.name}を研究しました` };
}
