// ============================================================
// 化学物質データ
// ============================================================

export type Phase = 'solid' | 'liquid' | 'gas';
export type ChemKind = 'raw' | 'product' | 'waste';

export interface Chemical {
  name: string;
  kind: ChemKind;
  phase: Phase;
  // 基準価格 (¥/t)。廃棄物は 0
  basePrice: number;
  // スポット市場の規模 (t/期)。この量を売ると単価が約 2/3 まで下がる
  marketSize: number;
  // 煙突・廃棄場に捨てたときの汚染量 (/t)
  pollution: number;
  color: string;
}

const defs = {
  // 原料
  salt:      { name: '食塩',   kind: 'raw', phase: 'solid', basePrice: 60,  marketSize: 0, pollution: 0.2, color: '#d8dee9' },
  limestone: { name: '石灰石', kind: 'raw', phase: 'solid', basePrice: 40,  marketSize: 0, pollution: 0.2, color: '#b8a98a' },
  sulfur:    { name: '硫黄',   kind: 'raw', phase: 'solid', basePrice: 120, marketSize: 0, pollution: 1,   color: '#e6d94c' },
  coal:      { name: '石炭',   kind: 'raw', phase: 'solid', basePrice: 90,  marketSize: 0, pollution: 0.5, color: '#6e7681' },

  // 第1時代
  sulfuric_acid:     { name: '硫酸',     kind: 'product', phase: 'liquid', basePrice: 220,  marketSize: 20, pollution: 2,   color: '#f0a500' },
  salt_cake:         { name: '芒硝',     kind: 'product', phase: 'solid',  basePrice: 260,  marketSize: 10, pollution: 0.3, color: '#c9b8e8' },
  hcl_gas:           { name: '塩化水素ガス', kind: 'waste', phase: 'gas',  basePrice: 0,    marketSize: 0,  pollution: 3,   color: '#9be36b' },
  hydrochloric_acid: { name: '塩酸',     kind: 'product', phase: 'liquid', basePrice: 180,  marketSize: 8,  pollution: 2,   color: '#7ee787' },
  soda_ash:          { name: 'ソーダ灰', kind: 'product', phase: 'solid',  basePrice: 1100, marketSize: 30, pollution: 0.3, color: '#58a6ff' },
  cas_waste:         { name: '硫化カルシウム残渣', kind: 'waste', phase: 'solid', basePrice: 0, marketSize: 0, pollution: 1, color: '#8a7f4d' },
  bleaching_powder:  { name: 'さらし粉', kind: 'product', phase: 'solid',  basePrice: 900,  marketSize: 12, pollution: 1,   color: '#f6f8fa' },

  // 第2時代
  caustic_soda: { name: '苛性ソーダ', kind: 'product', phase: 'liquid', basePrice: 1400, marketSize: 40, pollution: 2,   color: '#bc8cff' },
  chlorine:     { name: '塩素',       kind: 'product', phase: 'gas',    basePrice: 600,  marketSize: 8,  pollution: 4,   color: '#d4e157' },
  hydrogen:     { name: '水素',       kind: 'product', phase: 'gas',    basePrice: 500,  marketSize: 2,  pollution: 0,   color: '#f78fb3' },
  cacl2_waste:  { name: '塩化カルシウム廃液', kind: 'waste', phase: 'liquid', basePrice: 0, marketSize: 0, pollution: 0.5, color: '#5f9ea0' },

  // 第3時代
  ammonia:          { name: 'アンモニア', kind: 'product', phase: 'gas',    basePrice: 900,  marketSize: 30, pollution: 2,   color: '#39d2c0' },
  nitric_acid:      { name: '硝酸',       kind: 'product', phase: 'liquid', basePrice: 700,  marketSize: 30, pollution: 2,   color: '#ff7b72' },
  ammonium_sulfate: { name: '硫安',       kind: 'product', phase: 'solid',  basePrice: 800,  marketSize: 80, pollution: 0.3, color: '#ffa657' },
  ammonium_nitrate: { name: '硝安',       kind: 'product', phase: 'solid',  basePrice: 1100, marketSize: 60, pollution: 0.3, color: '#ffd1a8' },
} satisfies Record<string, Chemical>;

export type ChemId = keyof typeof defs;

export const CHEMICALS: Record<ChemId, Chemical> = defs;

export const CHEM_IDS = Object.keys(CHEMICALS) as ChemId[];

export type Amounts = Partial<Record<ChemId, number>>;
