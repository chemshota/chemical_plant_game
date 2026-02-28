'use strict';

// ============================================================
// ゲーム状態
// ============================================================

let state = null;
let prevPrices = {};
let nextPlantId = 1;

function createInitialState() {
  const s = {
    money: 5000,
    turn: 1,
    techLevel: 1,
    researchProgress: 0,
    plants: [],
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
// 生産シミュレーション
// ============================================================

function runProduction() {
  const results = [];

  for (const plant of state.plants) {
    if (!plant.active) {
      results.push({ plantId: plant.id, processId: plant.processId, success: false, reason: '停止中' });
      continue;
    }

    const process = PROCESSES[plant.processId];

    // 入力材料チェック
    let canProduce = true;
    let missingItems = [];
    for (const [chemId, amount] of Object.entries(process.inputs)) {
      if ((state.inventory[chemId] || 0) < amount) {
        canProduce = false;
        missingItems.push(CHEMICALS[chemId].name);
      }
    }

    if (canProduce) {
      // 入力材料を消費
      for (const [chemId, amount] of Object.entries(process.inputs)) {
        state.inventory[chemId] -= amount;
        if (state.inventory[chemId] < 0.001) state.inventory[chemId] = 0;
      }
      // 製品を生産
      for (const [chemId, amount] of Object.entries(process.outputs)) {
        state.inventory[chemId] = (state.inventory[chemId] || 0) + amount;
      }
      // 運転費
      state.money -= process.operatingCost;

      results.push({
        plantId: plant.id,
        processId: plant.processId,
        success: true,
        outputs: { ...process.outputs },
        cost: process.operatingCost,
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

  // 1. 生産実行
  const productionResults = runProduction();

  // 2. 市場更新（次ターンの価格・需要）
  prevPrices = { ...state.market.prices };
  updateMarket();

  // 3. ターン進行
  state.turn++;

  // 4. 結果サマリー作成
  const totalCost = productionResults
    .filter(r => r.success)
    .reduce((sum, r) => sum + r.cost, 0);

  return {
    productionResults,
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
  const price = state.market.prices[chemId];
  const totalCost = price * qty;

  if (state.money < totalCost) {
    return { success: false, msg: '資金不足です' };
  }

  state.money -= totalCost;
  state.inventory[chemId] = (state.inventory[chemId] || 0) + qty;

  return {
    success: true,
    msg: `${CHEMICALS[chemId].name} ${qty}t を ¥${formatNum(totalCost)} で購入`,
  };
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

function investResearch(amount) {
  if (amount <= 0) return { success: false, msg: '金額が不正です' };
  if (state.money < amount) {
    return { success: false, msg: '資金不足です' };
  }

  // 次のレベルの要件を取得
  const nextLevel = TECH_LEVELS.find(t => t.level === state.techLevel + 1);
  if (!nextLevel) {
    return { success: false, msg: '最大技術レベルに到達しています' };
  }

  state.money -= amount;
  state.researchProgress += amount;

  let msg = `¥${formatNum(amount)} を研究開発に投資`;

  // レベルアップチェック
  if (state.researchProgress >= nextLevel.researchNeeded) {
    state.techLevel++;
    state.researchProgress = 0;
    msg += ` → 技術レベル ${state.techLevel} に到達！`;

    // 新プロセス解放ログ
    for (const processId of nextLevel.unlocks) {
      const p = PROCESSES[processId];
      if (p) {
        msg += ` 【${p.name}】が解放されました`;
      }
    }

    // 時代遷移チェック
    const newEra = getCurrentEra();
    if (newEra.name !== ERAS[TECH_LEVELS.find(t => t.level === state.techLevel - 1)?.eraIndex || 0]?.name) {
      msg += ` ＊時代が【${newEra.name}】に移行しました`;
    }
  }

  return { success: true, msg };
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
