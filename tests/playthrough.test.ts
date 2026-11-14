import { describe, expect, it } from 'vitest';
import { acceptContract } from '../src/sim/contracts';
import { companyValue } from '../src/sim/finance';
import { removeDevice } from '../src/sim/grid';
import { researchTech } from '../src/sim/research';
import { createInitialState, type GameState } from '../src/sim/state';
import { endTurn } from '../src/sim/turn';
import { build, buildLeblancLine, pipes } from './helpers';

const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

function summary(label: string, state: GameState, before: number, after: number): void {
  console.log(`${label}: 資金 ${state.money} 企業価値 ${companyValue(state)} `
    + `規制前の平均損益 ${Math.round(before)} 規制後 ${Math.round(after)} `
    + `ソーダ灰 ${Math.round(state.soldTotal.soda_ash ?? 0)}t 信用 ${state.reputation} 汚染 ${state.pollution.toFixed(1)}`);
}

// シード固定の通しプレイで、第1時代の採算が狙いどおりかを確かめる
describe('通しプレイ (第1時代)', () => {
  for (const seed of [1, 7, 2026]) {
    it(`排ガスを放置した1系列は、規制前は黒字で規制後に赤字へ落ちる (seed ${seed})`, () => {
      const state = createInitialState(seed);
      buildLeblancLine(state);
      acceptContract(state, state.offers[0].id);

      const profits: number[] = [];
      for (let i = 0; i < 40; i++) profits.push(endTurn(state).profit);
      const before = average(profits.slice(7, 15));
      const after = average(profits.slice(25));
      summary(`放置 seed ${seed}`, state, before, after);

      expect(state.gameOver).toBe(false);
      expect(before).toBeGreaterThan(1000);
      expect(before).toBeLessThan(5000);
      expect(after).toBeLessThan(0);
      expect(state.era).toBe(0);
    });

    it(`塩酸吸収塔で排ガスを回収すれば、規制後も黒字を保てる (seed ${seed})`, () => {
      const state = createInitialState(seed);
      const d = buildLeblancLine(state);
      acceptContract(state, state.offers[0].id);

      const profits: number[] = [];
      let upgraded = false;
      for (let i = 0; i < 40; i++) {
        if (i === 8) build(state, 'lab', 13, 9);
        if (!upgraded && state.rp >= 30) {
          expect(researchTech(state, 'hcl_absorption').ok).toBe(true);
          removeDevice(state, d.stack.id);
          build(state, 'absorber', 5, 5);
          build(state, 'shipping', 4, 11);
          pipes(state, 'hydrochloric_acid', [[5, 7], [5, 8], [5, 9], [5, 10]]);
          upgraded = true;
        }
        profits.push(endTurn(state).profit);
      }
      const before = average(profits.slice(7, 15));
      const after = average(profits.slice(25));
      summary(`対策 seed ${seed}`, state, before, after);

      expect(upgraded).toBe(true);
      expect(state.gameOver).toBe(false);
      expect(after).toBeGreaterThan(1000);
      expect(state.pollution).toBeLessThan(25);
    });
  }
});
