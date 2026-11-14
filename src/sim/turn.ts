import { deliverContracts, refreshOffers } from './contracts';
import { checkEraAdvance } from './era';
import { runEvents } from './events';
import { checkBankruptcy, settleFinance } from './finance';
import { sellSpot, updatePrices } from './market';
import { distribute } from './network';
import { runProduction } from './production';
import { emptyReport, type GameState, type TurnReport } from './state';

// ============================================================
// 期の進行
// ============================================================

export function endTurn(state: GameState): TurnReport {
  const report = emptyReport(state.turn);
  if (state.gameOver) return report;
  const moneyBefore = state.money;

  runProduction(state, report);
  distribute(state);
  deliverContracts(state, report);
  sellSpot(state, report);
  settleFinance(state, report);
  report.profit = Math.round(state.money - moneyBefore);

  runEvents(state, report);
  updatePrices(state);
  refreshOffers(state);
  checkEraAdvance(state, report);
  checkBankruptcy(state, report);

  state.money = Math.round(state.money);
  state.lastReport = report;
  state.turn++;
  return report;
}
