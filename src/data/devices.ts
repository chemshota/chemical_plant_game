import type { Amounts } from './chemicals';

// ============================================================
// 装置データ (製法は装置ごとに1つ)
// ============================================================

export type DeviceRole =
  | 'process'   // 入力を出力に変換する反応装置
  | 'power'     // 燃料を電力に変える
  | 'intake'    // 原料を市場から買って配管へ送る
  | 'shipping'  // 製品を倉庫へ送る
  | 'tank'      // 1物質を貯める
  | 'stack'     // 気体を大気へ放出する
  | 'dump'      // 固体・液体を投棄する
  | 'lab';      // 研究ポイントを生む

export interface DeviceType {
  name: string;
  short: string;
  role: DeviceRole;
  w: number;
  h: number;
  cost: number;
  // 毎期かかる維持費
  maintenance: number;
  // 稼働率 100% のときの運転費
  opCost: number;
  // 1期あたりの入出力 (稼働率 100%)
  inputs: Amounts;
  outputs: Amounts;
  // 消費電力 / 発電量
  power: number;
  powerOut: number;
  // intake/shipping/tank/stack/dump の容量 (t)、lab の研究ポイント
  capacity: number;
  // 解禁に必要な技術 (null は最初から建設可能)
  tech: string | null;
  desc: string;
}

const base = { opCost: 0, inputs: {}, outputs: {}, power: 0, powerOut: 0, capacity: 0, tech: null };

const defs = {
  // ── 共通設備 ──
  intake: {
    ...base, name: '受入設備', short: '受入', role: 'intake', w: 2, h: 1,
    cost: 1500, maintenance: 50, capacity: 20,
    desc: '指定した原料を市場価格で買い入れ、配管へ送る。敷地の外周に接して置く',
  },
  shipping: {
    ...base, name: '出荷設備', short: '出荷', role: 'shipping', w: 2, h: 1,
    cost: 1500, maintenance: 50, capacity: 40,
    desc: '配管から届いた製品を倉庫へ送る。倉庫の製品は契約納入とスポット販売に回る。敷地の外周に接して置く',
  },
  tank: {
    ...base, name: '貯槽', short: '貯槽', role: 'tank', w: 1, h: 1,
    cost: 800, maintenance: 20, capacity: 60,
    desc: '指定した物質を貯める。余剰を受け入れ、反応装置が不足したときに払い出す',
  },
  stack: {
    ...base, name: '煙突', short: '煙突', role: 'stack', w: 1, h: 1,
    cost: 1000, maintenance: 20, capacity: 30,
    desc: '気体を大気へ放出する。物質に応じて汚染度が上がる',
  },
  dump: {
    ...base, name: '廃棄場', short: '廃棄', role: 'dump', w: 2, h: 2,
    cost: 1200, maintenance: 30, capacity: 30,
    desc: '固体・液体を投棄する。1t ごとに処分費がかかり、汚染度も上がる',
  },
  lab: {
    ...base, name: '研究所', short: '研究所', role: 'lab', w: 2, h: 2,
    cost: 6000, maintenance: 500, capacity: 10,
    desc: '毎期、研究ポイントを生む',
  },

  // ── 第1時代 ──
  lead_chamber: {
    ...base, name: '鉛室法硫酸工場', short: '鉛室', role: 'process', w: 2, h: 2,
    cost: 5000, maintenance: 150, opCost: 300,
    inputs: { sulfur: 4 }, outputs: { sulfuric_acid: 12 },
    desc: '硫黄を燃やし、鉛張りの室内で硫酸にする',
  },
  saltcake_furnace: {
    ...base, name: '芒硝炉', short: '芒硝炉', role: 'process', w: 2, h: 2,
    cost: 6000, maintenance: 150, opCost: 300,
    inputs: { salt: 8, sulfuric_acid: 6 }, outputs: { salt_cake: 9, hcl_gas: 5 },
    desc: 'ルブラン法の第1段。食塩を硫酸で分解して芒硝を得る。塩化水素ガスが副生する',
  },
  black_ash_furnace: {
    ...base, name: '黒灰炉', short: '黒灰炉', role: 'process', w: 3, h: 2,
    cost: 8000, maintenance: 200, opCost: 400,
    inputs: { salt_cake: 9, limestone: 6, coal: 4 }, outputs: { soda_ash: 6, cas_waste: 5 },
    desc: 'ルブラン法の第2段。芒硝を石灰石・石炭と焼いてソーダ灰を得る。硫化カルシウム残渣が出る',
  },
  absorber: {
    ...base, name: '塩酸吸収塔', short: '吸収塔', role: 'process', w: 1, h: 2,
    cost: 4000, maintenance: 100, opCost: 100,
    inputs: { hcl_gas: 5 }, outputs: { hydrochloric_acid: 10 },
    tech: 'hcl_absorption',
    desc: '塩化水素ガスを水に吸収させ、塩酸として回収する',
  },
  bleach_plant: {
    ...base, name: 'さらし粉工場', short: 'さらし粉', role: 'process', w: 2, h: 2,
    cost: 9000, maintenance: 250, opCost: 400,
    inputs: { hydrochloric_acid: 10, limestone: 4 }, outputs: { bleaching_powder: 5 },
    tech: 'bleaching',
    desc: '塩酸から塩素を発生させ、石灰に吸わせてさらし粉にする',
  },
  chance_plant: {
    ...base, name: '硫黄回収装置', short: '硫黄回収', role: 'process', w: 2, h: 2,
    cost: 7000, maintenance: 150, opCost: 200,
    inputs: { cas_waste: 10 }, outputs: { sulfur: 4 },
    tech: 'chance_process',
    desc: '硫化カルシウム残渣から硫黄を取り戻す (チャンス法)',
  },

  // ── 第2時代 ──
  contact_plant: {
    ...base, name: '接触法硫酸工場', short: '接触法', role: 'process', w: 2, h: 2,
    cost: 15000, maintenance: 300, opCost: 400,
    inputs: { sulfur: 6 }, outputs: { sulfuric_acid: 20 },
    tech: 'contact_process',
    desc: '触媒で二酸化硫黄を酸化する。鉛室法より大量・高濃度の硫酸が得られる',
  },
  solvay_tower: {
    ...base, name: 'ソルベー塔', short: 'ソルベー', role: 'process', w: 3, h: 3,
    cost: 30000, maintenance: 600, opCost: 700,
    inputs: { salt: 14, limestone: 8, coal: 3 }, outputs: { soda_ash: 12, cacl2_waste: 8 },
    tech: 'solvay_process',
    desc: 'アンモニアを循環させて食塩と石灰石からソーダ灰を作る。塩化カルシウム廃液が出る',
  },
  power_plant: {
    ...base, name: '発電所', short: '発電所', role: 'power', w: 3, h: 2,
    cost: 20000, maintenance: 400, opCost: 300,
    inputs: { coal: 10 }, powerOut: 100,
    tech: 'power_generation',
    desc: '石炭を燃やして敷地全体に電力を供給する',
  },
  electrolyzer: {
    ...base, name: '電解槽', short: '電解槽', role: 'process', w: 3, h: 2,
    cost: 35000, maintenance: 600, opCost: 500, power: 60,
    inputs: { salt: 12 }, outputs: { caustic_soda: 8, chlorine: 7, hydrogen: 1 },
    tech: 'electrolysis',
    desc: '食塩水を電気分解する。苛性ソーダ・塩素・水素が決まった比で同時に出る',
  },
  hcl_synth: {
    ...base, name: '塩酸合成塔', short: '塩酸合成', role: 'process', w: 1, h: 2,
    cost: 10000, maintenance: 150, opCost: 150,
    inputs: { hydrogen: 1, chlorine: 7 }, outputs: { hydrochloric_acid: 20 },
    tech: 'hcl_synthesis',
    desc: '水素と塩素を燃焼させて高純度の塩酸を得る',
  },
  cl_bleach_plant: {
    ...base, name: '塩素式さらし粉工場', short: '塩素さらし', role: 'process', w: 2, h: 2,
    cost: 12000, maintenance: 250, opCost: 300,
    inputs: { chlorine: 7, limestone: 6 }, outputs: { bleaching_powder: 12 },
    tech: 'chlorine_bleach',
    desc: '電解の塩素を石灰に直接吸わせてさらし粉にする',
  },

  // ── 第3時代 ──
  water_gas: {
    ...base, name: '水性ガス炉', short: '水性ガス', role: 'process', w: 2, h: 2,
    cost: 30000, maintenance: 500, opCost: 400,
    inputs: { coal: 12 }, outputs: { hydrogen: 3 },
    tech: 'water_gas',
    desc: '赤熱した石炭に水蒸気を通して水素を得る',
  },
  haber_reactor: {
    ...base, name: 'アンモニア合成塔', short: '合成塔', role: 'process', w: 3, h: 3,
    cost: 90000, maintenance: 1500, opCost: 1200, power: 80,
    inputs: { hydrogen: 4 }, outputs: { ammonia: 20 },
    tech: 'haber_bosch',
    desc: 'ハーバー・ボッシュ法。高温高圧で水素と空気中の窒素からアンモニアを合成する',
  },
  ostwald_plant: {
    ...base, name: '硝酸工場', short: '硝酸', role: 'process', w: 2, h: 2,
    cost: 50000, maintenance: 800, opCost: 600,
    inputs: { ammonia: 6 }, outputs: { nitric_acid: 20 },
    tech: 'ostwald',
    desc: 'オストワルト法。アンモニアを白金触媒で酸化して硝酸にする',
  },
  amsul_plant: {
    ...base, name: '硫安工場', short: '硫安', role: 'process', w: 2, h: 2,
    cost: 35000, maintenance: 500, opCost: 400,
    inputs: { ammonia: 5, sulfuric_acid: 14 }, outputs: { ammonium_sulfate: 19 },
    tech: 'ammonium_sulfate',
    desc: 'アンモニアを硫酸で中和して肥料用の硫安にする',
  },
  amnit_plant: {
    ...base, name: '硝安工場', short: '硝安', role: 'process', w: 2, h: 2,
    cost: 45000, maintenance: 600, opCost: 500,
    inputs: { ammonia: 4, nitric_acid: 15 }, outputs: { ammonium_nitrate: 19 },
    tech: 'ammonium_nitrate',
    desc: 'アンモニアを硝酸で中和して硝安にする。肥料にも火薬原料にもなる',
  },
} satisfies Record<string, DeviceType>;

export type DeviceTypeId = keyof typeof defs;

export const DEVICE_TYPES: Record<DeviceTypeId, DeviceType> = defs;

export const DEVICE_TYPE_IDS = Object.keys(DEVICE_TYPES) as DeviceTypeId[];
