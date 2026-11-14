// ============================================================
// 顧客名とイベントの定義
// ============================================================

export const CUSTOMERS = [
  '山城ガラス製造所', '浪速石鹸', '東洋紡績', '関東製紙', '三河染料',
  '北海製紙', '帝国肥料', '筑紫農業組合', '相模火薬製造所', '越後精油',
];

// 1期あたりの突発イベント発生率 (創業直後は起きない)
export const RANDOM_EVENT_CHANCE = 0.12;
export const RANDOM_EVENT_START_TURN = 8;

export interface ScriptedEvent {
  id: string;
  era: number;
  // その時代に入ってからの経過期数
  afterTurns: number;
  title: string;
  text: string;
}

export const SCRIPTED_EVENTS: ScriptedEvent[] = [
  {
    id: 'alkali_warning', era: 0, afterTurns: 10,
    title: 'アルカリ法案の審議',
    text: '工場周辺の酸性ガス被害が議会で問題になっている。数期のうちに排出規制が強まる見込み。塩化水素ガスを煙突から出しているなら対策を急ごう',
  },
  {
    id: 'alkali_act', era: 0, afterTurns: 16,
    title: 'アルカリ法の施行',
    text: '排出規制が施行された。汚染度の許容値が 15 に下がり、超過分の罰金が 1 ポイントあたり ¥60 に上がった',
  },
  {
    id: 'waste_regulation', era: 1, afterTurns: 10,
    title: '廃棄物規制の強化',
    text: '投棄への監視が厳しくなり、廃棄場の処分費が 1t あたり ¥100 に上がった',
  },
  {
    id: 'war_demand', era: 2, afterTurns: 12,
    title: '火薬原料の特需',
    text: '国際情勢の緊迫で硝酸と硝安の相場が跳ね上がった (10期のあいだ +40%)',
  },
];
