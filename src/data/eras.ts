import type { ChemId } from './chemicals';

// ============================================================
// 時代データ
// ============================================================

export type EraGoal =
  | { kind: 'sold'; chems: ChemId[]; amount: number; label: string }
  | { kind: 'reputation'; amount: number; label: string }
  | { kind: 'value'; amount: number; label: string };

export interface Regulation {
  // 汚染度がこの値を超えた分に罰金がかかる
  threshold: number;
  // 超過1ポイントあたりの罰金 (¥/期)
  fineRate: number;
  // 廃棄場の処分費 (¥/t)
  dumpFee: number;
}

export interface Era {
  name: string;
  year: number;
  desc: string;
  // 基準価格・市場規模への倍率 (未指定は 1)
  priceMult: Partial<Record<ChemId, number>>;
  sizeMult: Partial<Record<ChemId, number>>;
  regulation: Regulation;
  goals: EraGoal[];
}

export const ERAS: Era[] = [
  {
    name: 'ソーダ工業時代',
    year: 1860,
    desc: 'ガラス・石けん・繊維産業がソーダ灰を求めている。ルブラン法で応えよう',
    priceMult: {},
    sizeMult: {},
    regulation: { threshold: 40, fineRate: 20, dumpFee: 20 },
    goals: [
      { kind: 'sold', chems: ['soda_ash'], amount: 300, label: 'ソーダ灰を累計 300t 販売' },
      { kind: 'reputation', amount: 30, label: '信用 30 以上' },
      { kind: 'value', amount: 80000, label: '企業価値 ¥80,000 以上' },
    ],
  },
  {
    name: '電解工業時代',
    year: 1890,
    desc: 'ソルベー法の普及でソーダ灰が値崩れした。電力を使う新しい化学が立ち上がる',
    priceMult: { soda_ash: 0.65, bleaching_powder: 0.85, sulfuric_acid: 0.9 },
    sizeMult: { soda_ash: 1.5, sulfuric_acid: 2, hydrochloric_acid: 3, bleaching_powder: 2 },
    regulation: { threshold: 12, fineRate: 80, dumpFee: 40 },
    goals: [
      { kind: 'sold', chems: ['caustic_soda'], amount: 500, label: '苛性ソーダを累計 500t 販売' },
      { kind: 'reputation', amount: 55, label: '信用 55 以上' },
      { kind: 'value', amount: 400000, label: '企業価値 ¥400,000 以上' },
    ],
  },
  {
    name: 'アンモニア工業時代',
    year: 1913,
    desc: '空気から肥料を作る時代。アンモニアを起点に長い製品連鎖を組み上げよう',
    priceMult: { soda_ash: 0.6, bleaching_powder: 0.7, sulfuric_acid: 0.9, caustic_soda: 0.85 },
    sizeMult: {
      soda_ash: 2, sulfuric_acid: 3, hydrochloric_acid: 3, bleaching_powder: 2,
      caustic_soda: 1.5, chlorine: 3, hydrogen: 2,
    },
    regulation: { threshold: 10, fineRate: 120, dumpFee: 120 },
    goals: [
      { kind: 'sold', chems: ['ammonium_sulfate', 'ammonium_nitrate'], amount: 1000, label: '硫安・硝安を累計 1,000t 販売' },
      { kind: 'reputation', amount: 80, label: '信用 80 以上' },
      { kind: 'value', amount: 1500000, label: '企業価値 ¥1,500,000 以上' },
    ],
  },
];
