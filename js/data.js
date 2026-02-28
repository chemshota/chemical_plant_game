'use strict';

// ============================================================
// 化学物質データ
// ============================================================

const CHEMICALS = {
  // 原料 (Raw materials)
  salt:      { name: '食塩',     basePrice: 8,   isRaw: true  },
  limestone: { name: '石灰石',   basePrice: 5,   isRaw: true  },
  sulfur:    { name: '硫黄',     basePrice: 12,  isRaw: true  },
  coal:      { name: '石炭',     basePrice: 10,  isRaw: true  },
  // 製品 (Products)
  sulfuric_acid:     { name: '硫酸',       basePrice: 40,  isRaw: false },
  soda_ash:          { name: 'ソーダ灰',   basePrice: 65,  isRaw: false },
  hydrochloric_acid: { name: '塩酸',       basePrice: 30,  isRaw: false },
  caustic_soda:      { name: '苛性ソーダ', basePrice: 90,  isRaw: false },
  chlorine:          { name: '塩素',       basePrice: 65,  isRaw: false },
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
    buildCost: 500,
    operatingCost: 15,
  },
  leblanc: {
    name: 'ルブラン法',
    desc: '食塩と硫酸からソーダ灰と塩酸を製造する古典的手法',
    inputs:  { salt: 2, sulfuric_acid: 1 },
    outputs: { soda_ash: 1, hydrochloric_acid: 1 },
    techRequired: 1,
    buildCost: 800,
    operatingCost: 25,
  },
  solvay: {
    name: 'ソルベー法',
    desc: '食塩と石灰石からソーダ灰を効率的に製造する改良プロセス',
    inputs:  { salt: 2, limestone: 1 },
    outputs: { soda_ash: 2 },
    techRequired: 2,
    buildCost: 2000,
    operatingCost: 35,
  },
  chloralkali: {
    name: '電解法',
    desc: '食塩水の電気分解により苛性ソーダと塩素を同時に製造',
    inputs:  { salt: 2, coal: 2 },
    outputs: { caustic_soda: 2, chlorine: 1 },
    techRequired: 3,
    buildCost: 5000,
    operatingCost: 70,
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
    researchNeeded: 1500,
    unlocks: ['solvay'],
    eraIndex: 0,
  },
  {
    level: 3,
    researchNeeded: 4000,
    unlocks: ['chloralkali'],
    eraIndex: 1,
  },
  {
    level: 4,
    researchNeeded: 10000,
    unlocks: [],
    eraIndex: 1,
  },
];

// ============================================================
// 需要レベル定義
// ============================================================

const DEMAND_LABELS = ['', '極低', '低', '中', '高', '極高'];
const DEMAND_MAX_SELL = [0, 3, 8, 15, 25, 40];
