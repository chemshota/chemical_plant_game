'use strict';

// ============================================================
// 化学物質データ
// ============================================================

const CHEMICALS = {
  // 原料 (Raw materials) — 原料価格は低く抑え、製品との差益を確保
  salt:      { name: '食塩',     basePrice: 80,   isRaw: true  },
  limestone: { name: '石灰石',   basePrice: 50,   isRaw: true  },
  sulfur:    { name: '硫黄',     basePrice: 120,  isRaw: true  },
  coal:      { name: '石炭',     basePrice: 100,  isRaw: true  },
  // 製品 (Products) — 原料の約5〜10倍の付加価値を設定
  sulfuric_acid:     { name: '硫酸',       basePrice: 650,  isRaw: false },
  soda_ash:          { name: 'ソーダ灰',   basePrice: 1000, isRaw: false },
  hydrochloric_acid: { name: '塩酸',       basePrice: 500,  isRaw: false },
  caustic_soda:      { name: '苛性ソーダ', basePrice: 1400, isRaw: false },
  chlorine:          { name: '塩素',       basePrice: 950,  isRaw: false },
};

// ============================================================
// 製造プロセスデータ
// ============================================================

const PROCESSES = {
  contact: {
    name: '接触法',
    desc: '硫黄を触媒上で酸化し硫酸を製造する基本プロセス',
    inputs:  { sulfur: 1, coal: 1 },
    outputs: { sulfuric_acid: 2 },
    techRequired: 1,
    buildCost: 4000,
    operatingCost: 100,
  },
  leblanc: {
    name: 'ルブラン法',
    desc: '食塩と硫酸からソーダ灰と塩酸を製造する古典的手法（塩酸の供給源として有効）',
    inputs:  { salt: 2, sulfuric_acid: 1 },
    outputs: { soda_ash: 1, hydrochloric_acid: 1 },
    techRequired: 1,
    buildCost: 6000,
    operatingCost: 180,
  },
  solvay: {
    name: 'ソルベー法',
    desc: '食塩と石灰石からソーダ灰を効率的に製造する改良プロセス',
    inputs:  { salt: 2, limestone: 1 },
    outputs: { soda_ash: 2 },
    techRequired: 2,
    buildCost: 16000,
    operatingCost: 250,
  },
  chloralkali: {
    name: '電解法',
    desc: '食塩水の電気分解により苛性ソーダと塩素を同時に製造',
    inputs:  { salt: 2, coal: 2 },
    outputs: { caustic_soda: 2, chlorine: 1 },
    techRequired: 3,
    buildCost: 38000,
    operatingCost: 500,
  },
};

// ============================================================
// 時代データ
// ============================================================

const ERAS = [
  {
    name: 'ソーダ工業時代',
    desc: 'ソーダ灰・硫酸を中心とした基礎化学工業の時代',
    baseDemand: {
      sulfuric_acid: 3,
      soda_ash: 4,
      hydrochloric_acid: 2,
      caustic_soda: 1,
      chlorine: 1,
    },
  },
  {
    name: '電解工業時代',
    desc: '電解技術の発展により苛性ソーダ・塩素の需要が拡大',
    baseDemand: {
      sulfuric_acid: 3,
      soda_ash: 3,
      hydrochloric_acid: 2,
      caustic_soda: 4,
      chlorine: 4,
    },
  },
];

// ============================================================
// 技術レベルデータ
// ============================================================

const TECH_LEVELS = [
  {
    level: 1,
    researchNeeded: 0,
    unlocks: [],
    eraIndex: 0,
  },
  {
    level: 2,
    researchNeeded: 12000,
    unlocks: ['solvay'],
    eraIndex: 0,
  },
  {
    level: 3,
    researchNeeded: 30000,
    unlocks: ['chloralkali'],
    eraIndex: 1,
  },
  {
    level: 4,
    researchNeeded: 80000,
    unlocks: [],
    eraIndex: 1,
  },
];

// ============================================================
// 工程改善研究カテゴリ
// ============================================================

const RESEARCH_CATEGORIES = {
  upstream: {
    id: 'upstream',
    name: '原料調達技術',
    desc: '原料の調達・前処理を最適化し、購入コストを削減する',
    unlockTechLevel: 1,
    levels: [
      { level: 1, cost: 5000,  desc: '原料購入価格 -10%', effect: { rawPriceDiscount: 0.10 } },
      { level: 2, cost: 15000, desc: '原料購入価格 -20%', effect: { rawPriceDiscount: 0.20 } },
      { level: 3, cost: 45000, desc: '原料購入価格 -30%', effect: { rawPriceDiscount: 0.30 } },
    ],
  },
  reaction: {
    id: 'reaction',
    name: '反応工程技術',
    desc: '触媒・反応条件の最適化により、全プロセスの運転費を削減する',
    unlockTechLevel: 1,
    levels: [
      { level: 1, cost: 6000,  desc: '全プロセス運転費 -15%', effect: { operatingCostDiscount: 0.15 } },
      { level: 2, cost: 18000, desc: '全プロセス運転費 -30%', effect: { operatingCostDiscount: 0.30 } },
      { level: 3, cost: 55000, desc: '全プロセス運転費 -45%', effect: { operatingCostDiscount: 0.45 } },
    ],
  },
  separation: {
    id: 'separation',
    name: '分離・精製技術',
    desc: '製品の分離・精製プロセスを改善し、特定プロセスの収率を向上させる',
    unlockTechLevel: 1,
    levels: [
      { level: 1, cost: 10000, desc: 'ソルベー法: ソーダ灰 +1t/回', effect: { outputBonus: { solvay: { soda_ash: 1 } } } },
      { level: 2, cost: 30000, desc: '接触法: 硫酸 +1t/回',         effect: { outputBonus: { contact: { sulfuric_acid: 1 } } } },
    ],
  },
  electrochemistry: {
    id: 'electrochemistry',
    name: '電気化学技術',
    desc: '電解プロセスの省エネ化と収率向上に特化した高度技術（電解法解放後に利用可能）',
    unlockTechLevel: 3,
    levels: [
      { level: 1, cost: 20000, desc: '電解法: 運転費 -25%追加',   effect: { processOpCostDiscount: { chloralkali: 0.25 } } },
      { level: 2, cost: 55000, desc: '電解法: 石炭消費 2t → 1t', effect: { inputReduction: { chloralkali: { coal: 1 } } } },
    ],
  },
};

// ============================================================
// 需要レベル定義
// ============================================================

const DEMAND_LABELS = ['', '極低', '低', '中', '高', '極高'];
const DEMAND_MAX_SELL = [0, 3, 8, 15, 25, 40];
