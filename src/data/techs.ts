import type { DeviceTypeId } from './devices';

// ============================================================
// 技術ツリー
// ============================================================

export interface TechEffect {
  // 全装置の運転費倍率
  opCostMult?: number;
  // 原料の購入価格倍率
  rawPriceMult?: number;
  // スポット市場の規模倍率
  marketSizeMult?: number;
  // 維持費倍率
  maintenanceMult?: number;
  // 装置ごとの出力倍率
  yieldMult?: Partial<Record<DeviceTypeId, number>>;
  // 1タイルに通せる配管の本数
  pipeLayers?: number;
}

export interface Tech {
  name: string;
  // 研究可能になる時代 (0 始まり)
  era: number;
  cost: number;
  requires: string[];
  desc: string;
  effect?: TechEffect;
}

export const TECHS: Record<string, Tech> = {
  // ── 第1時代 ──
  hcl_absorption: {
    name: '塩化水素の吸収', era: 0, cost: 30, requires: [],
    desc: '塩酸吸収塔を建設できる。排ガスを塩酸として回収する',
  },
  bleaching: {
    name: 'さらし粉製造', era: 0, cost: 60, requires: ['hcl_absorption'],
    desc: 'さらし粉工場を建設できる。余った塩酸を高値の製品に変える',
  },
  chance_process: {
    name: '硫黄回収 (チャンス法)', era: 0, cost: 50, requires: [],
    desc: '硫黄回収装置を建設できる。残渣を硫黄に戻す',
  },
  pipe_rack: {
    name: 'パイプラック', era: 0, cost: 40, requires: [],
    desc: '1つのタイルに配管を3本まで通せる。配管を交差させられる',
    effect: { pipeLayers: 3 },
  },
  gay_lussac: {
    name: 'ゲイ=リュサック塔', era: 0, cost: 40, requires: [],
    desc: '鉛室法硫酸工場の収量 +25%',
    effect: { yieldMult: { lead_chamber: 1.25 } },
  },
  bulk_purchase: {
    name: '原料の大口調達', era: 0, cost: 40, requires: [],
    desc: '原料の購入価格 -10%',
    effect: { rawPriceMult: 0.9 },
  },

  // ── 第2時代 ──
  contact_process: {
    name: '接触法', era: 1, cost: 80, requires: [],
    desc: '接触法硫酸工場を建設できる',
  },
  solvay_process: {
    name: 'ソルベー法', era: 1, cost: 120, requires: [],
    desc: 'ソルベー塔を建設できる。ルブラン法より安くソーダ灰を作れる',
  },
  power_generation: {
    name: '火力発電', era: 1, cost: 80, requires: [],
    desc: '発電所を建設できる',
  },
  electrolysis: {
    name: '食塩電解', era: 1, cost: 150, requires: ['power_generation'],
    desc: '電解槽を建設できる',
  },
  hcl_synthesis: {
    name: '塩酸合成', era: 1, cost: 60, requires: ['electrolysis'],
    desc: '塩酸合成塔を建設できる。余剰の塩素と水素を塩酸にする',
  },
  chlorine_bleach: {
    name: '塩素式さらし粉', era: 1, cost: 60, requires: ['electrolysis'],
    desc: '塩素式さらし粉工場を建設できる',
  },
  sales_network: {
    name: '販売網の整備', era: 1, cost: 80, requires: [],
    desc: 'スポット市場の規模 +25%。値崩れしにくくなる',
    effect: { marketSizeMult: 1.25 },
  },
  maintenance_system: {
    name: '保全体制', era: 1, cost: 80, requires: [],
    desc: '全装置の維持費 -20%',
    effect: { maintenanceMult: 0.8 },
  },

  // ── 第3時代 ──
  water_gas: {
    name: '水性ガス', era: 2, cost: 100, requires: [],
    desc: '水性ガス炉を建設できる。石炭から水素を得る',
  },
  haber_bosch: {
    name: 'ハーバー・ボッシュ法', era: 2, cost: 200, requires: ['power_generation'],
    desc: 'アンモニア合成塔を建設できる',
  },
  ostwald: {
    name: 'オストワルト法', era: 2, cost: 150, requires: ['haber_bosch'],
    desc: '硝酸工場を建設できる',
  },
  ammonium_sulfate: {
    name: '硫安製造', era: 2, cost: 100, requires: ['haber_bosch'],
    desc: '硫安工場を建設できる',
  },
  ammonium_nitrate: {
    name: '硝安製造', era: 2, cost: 150, requires: ['ostwald'],
    desc: '硝安工場を建設できる',
  },
  catalyst: {
    name: '触媒の改良', era: 2, cost: 150, requires: [],
    desc: '全装置の運転費 -25%',
    effect: { opCostMult: 0.75 },
  },
};
