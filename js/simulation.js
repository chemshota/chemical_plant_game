'use strict';

// ============================================================
// ゲーム状態
// ============================================================

let state = null;
let prevPrices = {};
let nextPlantId = 1;

function createInitialState() {
  const s = {
    money: 15000,
    turn: 1,
    techLevel: 1,
    researchProgress: 0,
    techResearchBudget: 0,
    techResearchActiveTurns: 0,
    researchLevels: {
      upstream:         0,
      reaction:         0,
      separation:       0,
      electrochemistry: 0,
      high_pressure:    0,
    },
    categoryResearchProgress: {
      upstream:         0,
      reaction:         0,
      separation:       0,
      electrochemistry: 0,
      high_pressure:    0,
    },
    researchBudgets: {
      upstream:         0,
      reaction:         0,
      separation:       0,
      electrochemistry: 0,
      high_pressure:    0,
    },
    researchActiveTurns: {
      upstream:         0,
      reaction:         0,
      separation:       0,
      electrochemistry: 0,
      high_pressure:    0,
    },
    plants: [],
    processScale: {
      contact:                     1,
      leblanc:                     1,
      solvay:                      1,
      chloralkali:                 1,
      haber_bosch:                 1,
      ostwald:                     1,
      ammonium_sulfate_production: 1,
    },
    inventory: {},
    market: {
      prices: {},
      demand: {},
    },
    log: [],
    soldThisTurn: {},
  };

  // 初期市場価格を設定
  for (const [id, chem] of Object.entries(CHEMICALS)) {
    s.market.prices[id] = chem.basePrice;
  }

  // 初期需要を設定
  const era = ERAS[0];
  for (const [id, chem] of Object.entries(CHEMICALS)) {
    if (!chem.isRaw) {
      s.market.demand[id] = era.baseDemand[id] || 2;
    }
  }

  return s;
}

// ============================================================
// 市場シミュレーション
// ============================================================

function updateMarket() {
  const era = getCurrentEra();

  // 価格変動
  for (const [id, chem] of Object.entries(CHEMICALS)) {
    const currentPrice = state.market.prices[id];
    const basePrice = chem.basePrice;

    // ランダム変動 (-15% ~ +15%)
    const fluctuation = 0.85 + Math.random() * 0.30;
    // 基準価格への回帰傾向 (10%)
    const meanReversion = currentPrice + (basePrice - currentPrice) * 0.1;
    let newPrice = meanReversion * fluctuation;

    // 価格の上下限 (基準の 0.5倍 ~ 2.0倍)
    newPrice = Math.max(basePrice * 0.5, Math.min(basePrice * 2.0, newPrice));
    state.market.prices[id] = Math.round(newPrice);
  }

  // 需要変動 (製品のみ)
  for (const [id, chem] of Object.entries(CHEMICALS)) {
    if (chem.isRaw) continue;
    const baseDemand = era.baseDemand[id] || 2;
    const currentDemand = state.market.demand[id];

    // 基準需要に向かってランダムに変動
    let newDemand = currentDemand;
    const roll = Math.random();
    if (roll < 0.3) {
      newDemand = currentDemand - 1;
    } else if (roll > 0.7) {
      newDemand = currentDemand + 1;
    }

    // 基準需要への回帰（基準から離れすぎたら戻りやすい）
    if (newDemand < baseDemand && Math.random() < 0.4) newDemand++;
    if (newDemand > baseDemand && Math.random() < 0.4) newDemand--;

    // 1 ~ 5 にクランプ
    state.market.demand[id] = Math.max(1, Math.min(5, newDemand));
  }

  // 今期の売却量をリセット
  state.soldThisTurn = {};
}

function getCurrentEra() {
  // 技術レベルに基づいて時代を決定
  for (let i = TECH_LEVELS.length - 1; i >= 0; i--) {
    if (state.techLevel >= TECH_LEVELS[i].level) {
      return ERAS[TECH_LEVELS[i].eraIndex];
    }
  }
  return ERAS[0];
}

// ============================================================
// 研究モディファイア
// ============================================================

function getModifiers() {
  const mods = {
    rawPriceDiscount:     0,
    operatingCostDiscount: 0,
    outputBonus:          {},
    processOpCostDiscount: {},
    inputReduction:       {},
  };

  for (const [catId, cat] of Object.entries(RESEARCH_CATEGORIES)) {
    const achieved = state.researchLevels[catId] || 0;
    if (achieved === 0) continue;

    for (const lvDef of cat.levels) {
      if (lvDef.level > achieved) break;
      const eff = lvDef.effect;

      if (eff.rawPriceDiscount !== undefined) {
        mods.rawPriceDiscount = Math.max(mods.rawPriceDiscount, eff.rawPriceDiscount);
      }
      if (eff.operatingCostDiscount !== undefined) {
        mods.operatingCostDiscount = Math.max(mods.operatingCostDiscount, eff.operatingCostDiscount);
      }
      if (eff.outputBonus) {
        for (const [pid, bonus] of Object.entries(eff.outputBonus)) {
          if (!mods.outputBonus[pid]) mods.outputBonus[pid] = {};
          for (const [chem, amt] of Object.entries(bonus)) {
            mods.outputBonus[pid][chem] = (mods.outputBonus[pid][chem] || 0) + amt;
          }
        }
      }
      if (eff.processOpCostDiscount) {
        for (const [pid, disc] of Object.entries(eff.processOpCostDiscount)) {
          mods.processOpCostDiscount[pid] = (mods.processOpCostDiscount[pid] || 0) + disc;
        }
      }
      if (eff.inputReduction) {
        for (const [pid, reductions] of Object.entries(eff.inputReduction)) {
          if (!mods.inputReduction[pid]) mods.inputReduction[pid] = {};
          for (const [chem, amt] of Object.entries(reductions)) {
            mods.inputReduction[pid][chem] = (mods.inputReduction[pid][chem] || 0) + amt;
          }
        }
      }
    }
  }

  return mods;
}

// スケールLvに対応する倍率を返す
// output効率ボーナスがスケールアップの利点
function getScaleMultipliers(scale) {
  if (scale === 2) return { input: 2,   output: 2.5, opCost: 1.8 };
  if (scale === 3) return { input: 3,   output: 4.0, opCost: 2.5 };
  return             { input: 1,   output: 1.0, opCost: 1.0 };
}

// ============================================================
// 生産シミュレーション
// ============================================================

function runProduction() {
  const results = [];
  const mods = getModifiers();

  for (const plant of state.plants) {
    if (!plant.active) {
      results.push({ plantId: plant.id, processId: plant.processId, success: false, reason: '停止中' });
      continue;
    }

    const process = PROCESSES[plant.processId];
    const inputReduction = mods.inputReduction[plant.processId] || {};
    const outputBonus    = mods.outputBonus[plant.processId] || {};
    const scale = state.processScale[plant.processId] || 1;
    const scaleMult = getScaleMultipliers(scale);

    // 実効入力量（inputReduction + スケール適用）
    const effectiveInputs = {};
    for (const [chemId, baseAmt] of Object.entries(process.inputs)) {
      const reduction = inputReduction[chemId] || 0;
      effectiveInputs[chemId] = Math.max(0, baseAmt - reduction) * scaleMult.input;
    }

    // 入力材料チェック
    let canProduce = true;
    const missingItems = [];
    for (const [chemId, amount] of Object.entries(effectiveInputs)) {
      if ((state.inventory[chemId] || 0) < amount) {
        canProduce = false;
        missingItems.push(CHEMICALS[chemId].name);
      }
    }

    if (canProduce) {
      // 入力材料を消費
      for (const [chemId, amount] of Object.entries(effectiveInputs)) {
        state.inventory[chemId] -= amount;
        if (state.inventory[chemId] < 0.001) state.inventory[chemId] = 0;
      }

      // 実効出力量（outputBonus + スケール適用）
      const effectiveOutputs = {};
      for (const [chemId, baseAmt] of Object.entries(process.outputs)) {
        effectiveOutputs[chemId] = (baseAmt + (outputBonus[chemId] || 0)) * scaleMult.output;
      }

      // 製品を生産
      for (const [chemId, amount] of Object.entries(effectiveOutputs)) {
        state.inventory[chemId] = (state.inventory[chemId] || 0) + amount;
      }

      // 実効運転費（研究割引 + スケール適用）
      const globalDisc  = mods.operatingCostDiscount;
      const processDisc = mods.processOpCostDiscount[plant.processId] || 0;
      const totalDisc   = Math.min(1, globalDisc + processDisc);
      const actualCost  = Math.round(process.operatingCost * (1 - totalDisc) * scaleMult.opCost);
      state.money -= actualCost;

      results.push({
        plantId: plant.id,
        processId: plant.processId,
        success: true,
        outputs: effectiveOutputs,
        cost: actualCost,
      });
    } else {
      results.push({
        plantId: plant.id,
        processId: plant.processId,
        success: false,
        reason: `原料不足 (${missingItems.join(', ')})`,
      });
    }
  }

  return results;
}

// ============================================================
// ターン処理
// ============================================================

function processTurn() {
  const prevMoney = state.money;

  // 1. 自動購入
  const autoBuyResults = runAutoBuy();

  // 2. 生産実行
  const productionResults = runProduction();

  // 3. 研究処理
  const researchResults = processResearchTurn();

  // 4. 市場更新（次ターンの価格・需要）
  prevPrices = { ...state.market.prices };
  updateMarket();

  // 5. ターン進行
  state.turn++;

  // 6. 結果サマリー作成
  const totalCost = productionResults
    .filter(r => r.success)
    .reduce((sum, r) => sum + r.cost, 0);

  return {
    autoBuyResults,
    productionResults,
    researchResults,
    prevMoney,
    newMoney: state.money,
    totalCost,
    moneyChange: state.money - prevMoney,
  };
}

// ============================================================
// プレイヤーアクション
// ============================================================

function buyChemical(chemId, qty) {
  if (qty <= 0) return { success: false, msg: '数量が不正です' };

  const chem = CHEMICALS[chemId];
  const basePrice = state.market.prices[chemId];
  const discount = chem.isRaw ? getModifiers().rawPriceDiscount : 0;
  const effectivePrice = Math.round(basePrice * (1 - discount));
  const totalCost = effectivePrice * qty;

  if (state.money < totalCost) {
    return { success: false, msg: '資金不足です' };
  }

  state.money -= totalCost;
  state.inventory[chemId] = (state.inventory[chemId] || 0) + qty;

  let msg = `${chem.name} ${qty}t を ¥${formatNum(totalCost)} で購入`;
  if (discount > 0) msg += ` (調達割引 -${Math.round(discount * 100)}%)`;
  return { success: true, msg };
}

function sellChemical(chemId, qty) {
  if (qty <= 0) return { success: false, msg: '数量が不正です' };

  const stock = state.inventory[chemId] || 0;
  if (stock < qty) {
    return { success: false, msg: '在庫不足です' };
  }

  // 需要上限チェック
  const demand = state.market.demand[chemId] || 1;
  const maxSell = DEMAND_MAX_SELL[demand];
  const alreadySold = state.soldThisTurn[chemId] || 0;
  const canSell = Math.min(qty, maxSell - alreadySold);

  if (canSell <= 0) {
    return { success: false, msg: `需要上限に達しています（今期最大 ${maxSell}t）` };
  }

  const actualQty = canSell;
  const price = state.market.prices[chemId];
  const revenue = price * actualQty;

  state.inventory[chemId] -= actualQty;
  if (state.inventory[chemId] < 0.001) state.inventory[chemId] = 0;
  state.money += revenue;
  state.soldThisTurn[chemId] = alreadySold + actualQty;

  let msg = `${CHEMICALS[chemId].name} ${actualQty}t を ¥${formatNum(revenue)} で売却`;
  if (actualQty < qty) {
    msg += `（需要上限のため ${qty - actualQty}t 未売却）`;
  }

  return { success: true, msg };
}

function buildPlant(processId) {
  const process = PROCESSES[processId];
  if (!process) return { success: false, msg: 'プロセスが見つかりません' };
  if (process.techRequired > state.techLevel) {
    return { success: false, msg: '技術レベルが不足しています' };
  }
  if (state.money < process.buildCost) {
    return { success: false, msg: '資金不足です' };
  }

  state.money -= process.buildCost;
  const plant = {
    id: nextPlantId++,
    processId,
    active: true,
    autoBuy: false,
    builtTurn: state.turn,
  };
  state.plants.push(plant);

  return {
    success: true,
    msg: `${process.name}プラント #${plant.id} を ¥${formatNum(process.buildCost)} で建設`,
  };
}

function demolishPlant(plantId) {
  const index = state.plants.findIndex(p => p.id === plantId);
  if (index === -1) return { success: false, msg: 'プラントが見つかりません' };

  const plant = state.plants[index];
  const process = PROCESSES[plant.processId];
  // 解体すると建設費の20%が戻る
  const refund = Math.floor(process.buildCost * 0.2);
  state.money += refund;
  state.plants.splice(index, 1);

  return {
    success: true,
    msg: `${process.name}プラント #${plantId} を解体（払戻 ¥${formatNum(refund)}）`,
  };
}

function togglePlant(plantId) {
  const plant = state.plants.find(p => p.id === plantId);
  if (!plant) return;
  plant.active = !plant.active;
}

function toggleAutoBuy(plantId) {
  const plant = state.plants.find(p => p.id === plantId);
  if (!plant) return;
  plant.autoBuy = !plant.autoBuy;
}

function runAutoBuy() {
  const results = [];
  const mods = getModifiers();

  // 全auto-buyプラントの化学品別必要量を先に集計してから一括購入する
  // (プラント単位でループすると、1基目の購入後に在庫が増え
  //  2基目が「足りてる」と誤判定するバグを防ぐ)
  const totalNeeded = {};
  for (const plant of state.plants) {
    if (!plant.active || !plant.autoBuy) continue;
    const process = PROCESSES[plant.processId];
    const inputReduction = mods.inputReduction[plant.processId] || {};
    const scale = state.processScale[plant.processId] || 1;
    const scaleMult = getScaleMultipliers(scale);

    for (const [chemId, baseAmt] of Object.entries(process.inputs)) {
      const reduction = inputReduction[chemId] || 0;
      const needed = Math.max(0, baseAmt - reduction) * scaleMult.input;
      totalNeeded[chemId] = (totalNeeded[chemId] || 0) + needed;
    }
  }

  // 不足分を一括購入
  for (const [chemId, needed] of Object.entries(totalNeeded)) {
    const shortage = Math.ceil(needed) - (state.inventory[chemId] || 0);
    if (shortage <= 0) continue;
    const buyResult = buyChemical(chemId, shortage);
    results.push({ chemId, qty: shortage, success: buyResult.success, msg: buyResult.msg });
  }

  return results;
}

function setGroupActive(processId, active) {
  for (const plant of state.plants) {
    if (plant.processId === processId) plant.active = active;
  }
}

function setGroupAutoBuy(processId, autoBuy) {
  for (const plant of state.plants) {
    if (plant.processId === processId) plant.autoBuy = autoBuy;
  }
}

function scaleUpProcess(processId) {
  const process = PROCESSES[processId];
  if (!process) return { success: false, msg: 'プロセスが見つかりません' };

  const currentScale = state.processScale[processId] || 1;
  if (currentScale >= 3) return { success: false, msg: '最大規模に達しています' };

  const unitCount = state.plants.filter(p => p.processId === processId).length;
  if (unitCount === 0) return { success: false, msg: 'まずプラントを建設してください' };

  // Lv1→2: buildCost×1.0×基数、Lv2→3: buildCost×1.5×基数
  const costPerUnit = process.buildCost * (currentScale === 1 ? 1.0 : 1.5);
  const totalCost = Math.round(costPerUnit * unitCount);

  if (state.money < totalCost) return { success: false, msg: '資金不足です' };

  state.money -= totalCost;
  state.processScale[processId] = currentScale + 1;

  return {
    success: true,
    msg: `${process.name} 規模 Lv${currentScale}→Lv${currentScale + 1} 拡大 (¥${formatNum(totalCost)})`,
  };
}

function setTechResearchBudget(amount) {
  if (amount < 0) return { success: false, msg: '金額が不正です' };
  state.techResearchBudget = amount;
  if (amount === 0) {
    return { success: true, msg: '技術研究を停止しました' };
  }
  return { success: true, msg: `技術研究予算: 毎期 ¥${formatNum(amount)}` };
}

function setCategoryResearchBudget(catId, amount) {
  if (amount < 0) return { success: false, msg: '金額が不正です' };
  const cat = RESEARCH_CATEGORIES[catId];
  if (!cat) return { success: false, msg: 'カテゴリが見つかりません' };
  state.researchBudgets[catId] = amount;
  if (amount === 0) {
    return { success: true, msg: `[${cat.name}] 研究を停止しました` };
  }
  return { success: true, msg: `[${cat.name}] 毎期予算: ¥${formatNum(amount)}` };
}

function processResearchTurn() {
  const results = [];

  // 技術研究
  if (state.techResearchBudget > 0) {
    const nextLevel = TECH_LEVELS.find(t => t.level === state.techLevel + 1);
    if (nextLevel) {
      const actualBudget = Math.min(state.techResearchBudget, state.money);
      if (actualBudget > 0) {
        state.money -= actualBudget;
        state.researchProgress += actualBudget;
        state.techResearchActiveTurns++;

        let leveled = false;
        const unlocks = [];
        if (state.researchProgress >= nextLevel.researchNeeded &&
            state.techResearchActiveTurns >= nextLevel.turnsRequired) {
          const prevTechLevel = state.techLevel;
          state.techLevel++;
          state.researchProgress = 0;
          state.techResearchActiveTurns = 0;
          leveled = true;

          for (const processId of nextLevel.unlocks) {
            if (PROCESSES[processId]) unlocks.push(processId);
          }

          // 時代遷移チェック
          const newEra = getCurrentEra();
          const prevEra = ERAS[TECH_LEVELS.find(t => t.level === prevTechLevel)?.eraIndex || 0];
          if (newEra !== prevEra) unlocks.push('__era__' + newEra.name);
        }

        results.push({ type: 'tech', budget: actualBudget, leveled, newLevel: leveled ? state.techLevel : null, unlocks });
      }
    }
  }

  // カテゴリ研究
  for (const catId of Object.keys(RESEARCH_CATEGORIES)) {
    const budget = state.researchBudgets[catId] || 0;
    if (budget <= 0) continue;

    const cat = RESEARCH_CATEGORIES[catId];
    if (state.techLevel < cat.unlockTechLevel) continue;

    const currentLv = state.researchLevels[catId] || 0;
    const nextLvDef = cat.levels.find(l => l.level === currentLv + 1);
    if (!nextLvDef) continue;

    const actualBudget = Math.min(budget, state.money);
    if (actualBudget <= 0) continue;

    state.money -= actualBudget;
    state.categoryResearchProgress[catId] = (state.categoryResearchProgress[catId] || 0) + actualBudget;
    state.researchActiveTurns[catId] = (state.researchActiveTurns[catId] || 0) + 1;

    let leveled = false;
    if (state.categoryResearchProgress[catId] >= nextLvDef.cost &&
        state.researchActiveTurns[catId] >= nextLvDef.turnsRequired) {
      state.researchLevels[catId] = currentLv + 1;
      state.categoryResearchProgress[catId] = 0;
      state.researchActiveTurns[catId] = 0;
      leveled = true;
    }

    results.push({
      type: 'category',
      catId,
      catName: cat.name,
      budget: actualBudget,
      leveled,
      newLevel: leveled ? state.researchLevels[catId] : null,
      desc: leveled ? nextLvDef.desc : null,
    });
  }

  return results;
}

// ============================================================
// ユーティリティ
// ============================================================

function formatNum(n) {
  return n.toLocaleString('ja-JP');
}

function getResearchNeededForNext() {
  const nextLevel = TECH_LEVELS.find(t => t.level === state.techLevel + 1);
  if (!nextLevel) return null;
  return nextLevel.researchNeeded;
}

function getResearchPercent() {
  const needed = getResearchNeededForNext();
  if (!needed) return 100;
  return Math.min(100, Math.floor((state.researchProgress / needed) * 100));
}

function getCompanyValue() {
  let value = state.money;
  // 在庫価値
  for (const [id, qty] of Object.entries(state.inventory)) {
    if (qty > 0) {
      value += (state.market.prices[id] || 0) * qty;
    }
  }
  // プラント価値（建設費の50%）
  for (const plant of state.plants) {
    const process = PROCESSES[plant.processId];
    value += Math.floor(process.buildCost * 0.5);
  }
  return value;
}
