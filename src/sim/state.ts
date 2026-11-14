import { CHEMICALS, CHEM_IDS, type Amounts, type ChemId } from '../data/chemicals';
import type { DeviceTypeId } from '../data/devices';
import { ERAS, type Regulation } from '../data/eras';
import { TECHS } from '../data/techs';

// ============================================================
// ゲーム状態
// ============================================================

export const SAVE_VERSION = 1;

export type DeviceStatus =
  | 'new'       // 建設直後
  | 'ok'        // 全力で稼働
  | 'partial'   // 一部稼働
  | 'starved'   // 原料不足で停止
  | 'blocked'   // 出力詰まりで停止
  | 'nopower'   // 電力不足
  | 'off'       // 手動停止
  | 'broken'    // 事故で停止中
  | 'unset';    // 物質が未設定

export interface Device {
  id: number;
  type: DeviceTypeId;
  x: number;
  y: number;
  w: number;
  h: number;
  enabled: boolean;
  // intake / tank が扱う物質
  chem: ChemId | null;
  inBuf: Amounts;
  outBuf: Amounts;
  // 事故による残り停止期数
  brokenTurns: number;
  status: DeviceStatus;
  statusNote: string;
  rate: number;
}

export interface Contract {
  id: number;
  customer: string;
  chem: ChemId;
  qtyPerTurn: number;
  duration: number;
  unitPrice: number;
  penaltyPerTon: number;
  // 受注してから納入開始までの猶予 (期)
  leadTime: number;
  // 募集の残り期数 (未受注のときだけ使う)
  offerTurnsLeft: number;
  // 受注後の進行
  turnsWaited: number;
  turnsDone: number;
  delivered: number;
  missedTurns: number;
}

export interface PriceMod {
  // null は全製品
  chem: ChemId | null;
  mult: number;
  turnsLeft: number;
  label: string;
}

export interface LogEntry {
  turn: number;
  kind: 'info' | 'good' | 'bad' | 'event';
  text: string;
}

export interface TurnReport {
  turn: number;
  rawCost: number;
  opCost: number;
  maintenance: number;
  rent: number;
  interest: number;
  dumpFee: number;
  fine: number;
  contractRevenue: number;
  spotRevenue: number;
  penalty: number;
  profit: number;
  emission: number;
  sold: Amounts;
  powerSupply: number;
  powerDemand: number;
  // プレイヤーに必ず見せる通知
  notices: { title: string; text: string }[];
}

export interface GameState {
  version: number;
  rngState: number;
  turn: number;
  era: number;
  eraStartTurn: number;
  money: number;
  loan: number;
  negativeStreak: number;
  gameOver: boolean;
  cleared: boolean;
  site: { w: number; h: number };
  devices: Device[];
  nextDeviceId: number;
  // タイル 'x,y' ごとの配管 (流す物質の一覧)
  pipes: Record<string, ChemId[]>;
  warehouse: Amounts;
  // スポット販売せず倉庫に留める物質
  hold: Partial<Record<ChemId, boolean>>;
  prices: Record<ChemId, number>;
  priceMods: PriceMod[];
  offers: Contract[];
  contracts: Contract[];
  nextContractId: number;
  reputation: number;
  pollution: number;
  regulation: Regulation;
  rp: number;
  techs: string[];
  soldTotal: Amounts;
  firedEvents: string[];
  log: LogEntry[];
  lastReport: TurnReport | null;
}

export const SITE_INITIAL = { w: 16, h: 12 };
export const SITE_MAX_W = 32;
export const SITE_EXPAND_STEP = 4;
export const START_MONEY = 40000;

export function createInitialState(seed = Date.now()): GameState {
  const prices = {} as Record<ChemId, number>;
  for (const id of CHEM_IDS) prices[id] = CHEMICALS[id].basePrice;

  const state: GameState = {
    version: SAVE_VERSION,
    rngState: seed >>> 0,
    turn: 1,
    era: 0,
    eraStartTurn: 1,
    money: START_MONEY,
    loan: 0,
    negativeStreak: 0,
    gameOver: false,
    cleared: false,
    site: { ...SITE_INITIAL },
    devices: [],
    nextDeviceId: 1,
    pipes: {},
    warehouse: {},
    hold: {},
    prices,
    priceMods: [],
    offers: [],
    contracts: [],
    nextContractId: 1,
    reputation: 10,
    pollution: 0,
    regulation: { ...ERAS[0].regulation },
    rp: 0,
    techs: [],
    soldTotal: {},
    firedEvents: [],
    log: [],
    lastReport: null,
  };

  // 最初の一歩になる固定の引き合い
  state.offers.push({
    id: state.nextContractId++,
    customer: '山城ガラス製造所',
    chem: 'soda_ash',
    qtyPerTurn: 4,
    duration: 10,
    unitPrice: 1250,
    penaltyPerTon: 500,
    leadTime: 8,
    offerTurnsLeft: 12,
    turnsWaited: 0,
    turnsDone: 0,
    delivered: 0,
    missedTurns: 0,
  });

  addLog(state, 'info', '創業。敷地に装置を置き、配管でつないで操業を始めよう');
  return state;
}

export function addLog(state: GameState, kind: LogEntry['kind'], text: string): void {
  state.log.push({ turn: state.turn, kind, text });
  if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
}

export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

// ============================================================
// 技術による補正
// ============================================================

export interface Mods {
  opCostMult: number;
  rawPriceMult: number;
  marketSizeMult: number;
  maintenanceMult: number;
  yieldMult: Partial<Record<DeviceTypeId, number>>;
}

export function getMods(state: GameState): Mods {
  const mods: Mods = {
    opCostMult: 1,
    rawPriceMult: 1,
    marketSizeMult: 1,
    maintenanceMult: 1,
    yieldMult: {},
  };
  for (const id of state.techs) {
    const eff = TECHS[id]?.effect;
    if (!eff) continue;
    if (eff.opCostMult) mods.opCostMult *= eff.opCostMult;
    if (eff.rawPriceMult) mods.rawPriceMult *= eff.rawPriceMult;
    if (eff.marketSizeMult) mods.marketSizeMult *= eff.marketSizeMult;
    if (eff.maintenanceMult) mods.maintenanceMult *= eff.maintenanceMult;
    if (eff.yieldMult) {
      for (const [dev, mult] of Object.entries(eff.yieldMult)) {
        const key = dev as DeviceTypeId;
        mods.yieldMult[key] = (mods.yieldMult[key] ?? 1) * mult;
      }
    }
  }
  return mods;
}

export function emptyReport(turn: number): TurnReport {
  return {
    turn,
    rawCost: 0, opCost: 0, maintenance: 0, rent: 0, interest: 0, dumpFee: 0, fine: 0,
    contractRevenue: 0, spotRevenue: 0, penalty: 0, profit: 0, emission: 0,
    sold: {}, powerSupply: 0, powerDemand: 0, notices: [],
  };
}

export function add(amounts: Amounts, chem: ChemId, qty: number): void {
  const next = (amounts[chem] ?? 0) + qty;
  amounts[chem] = Math.abs(next) < 1e-9 ? 0 : next;
}

export function total(amounts: Amounts): number {
  let sum = 0;
  for (const v of Object.values(amounts)) sum += v ?? 0;
  return sum;
}
