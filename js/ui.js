'use strict';

// ============================================================
// UI描画
// ============================================================

let activeTab = 'plants';

function render() {
  renderHeader();
  renderTab(activeTab);
  renderLog();
}

function renderHeader() {
  document.getElementById('display-money').textContent = `¥${formatNum(state.money)}`;
  document.getElementById('display-money').className =
    `value money${state.money < 0 ? ' negative' : ''}`;
  document.getElementById('display-turn').textContent = `第${state.turn}期`;
  document.getElementById('display-era').textContent = getCurrentEra().name;
  document.getElementById('display-tech').textContent = state.techLevel;
}

function renderTab(tab) {
  switch (tab) {
    case 'plants':    renderPlants(); break;
    case 'market':    renderMarket(); break;
    case 'inventory': renderInventory(); break;
    case 'research':  renderResearch(); break;
  }
}

// ============================================================
// プラントタブ
// ============================================================

function renderPlants() {
  const container = document.getElementById('tab-plants');
  let html = '<div class="section-header"><h2>プラント管理</h2></div>';
  for (const [processId, process] of Object.entries(PROCESSES)) {
    html += renderProcessGroup(processId, process);
  }
  container.innerHTML = html;
}

function renderProcessGroup(processId, process) {
  const isLocked    = process.techRequired > state.techLevel;
  const plants      = state.plants.filter(p => p.processId === processId);
  const totalCount  = plants.length;
  const activeCount = plants.filter(p => p.active).length;
  const allAutoBuy  = totalCount > 0 && plants.every(p => p.autoBuy);
  const scale       = state.processScale[processId] || 1;
  const scaleMult   = getScaleMultipliers(scale);
  const mods        = getModifiers();

  // スケール + 研究効果を反映した実効 I/O・コスト（/基）
  const inputReduction = mods.inputReduction[processId] || {};
  const outputBonus    = mods.outputBonus[processId] || {};
  const globalDisc  = mods.operatingCostDiscount;
  const processDisc = mods.processOpCostDiscount[processId] || 0;
  const totalDisc   = Math.min(1, globalDisc + processDisc);

  const effectiveInputs = {};
  for (const [c, a] of Object.entries(process.inputs))
    effectiveInputs[c] = Math.max(0, a - (inputReduction[c] || 0)) * scaleMult.input;

  const effectiveOutputs = {};
  for (const [c, a] of Object.entries(process.outputs))
    effectiveOutputs[c] = (a + (outputBonus[c] || 0)) * scaleMult.output;

  const effectiveOpCost = Math.round(process.operatingCost * (1 - totalDisc) * scaleMult.opCost);

  const inputCost = Object.entries(effectiveInputs)
    .reduce((s, [c, a]) => s + (state.market.prices[c] || 0) * a, 0);
  const revenue = Object.entries(effectiveOutputs)
    .reduce((s, [c, a]) => s + (state.market.prices[c] || 0) * a, 0);
  const profitPerUnit = Math.round(revenue - inputCost - effectiveOpCost);

  const canScaleUp  = scale < 3;
  const scaleUpCost = canScaleUp
    ? Math.round(process.buildCost * (scale === 1 ? 1.0 : 1.5) * Math.max(1, totalCount))
    : 0;

  let html = `<div class="card${isLocked ? ' card-locked' : ''}">`;

  // ── ヘッダー ──
  html += `<div class="card-header">`;
  html += `<div class="plant-group-title"><h3>${process.name}</h3>`;
  if (totalCount > 0) {
    html += `<span class="plant-count-badge">${totalCount}基</span>`;
    if (scale > 1) html += `<span class="badge badge-scale">規模Lv${scale}</span>`;
  }
  html += `</div>`;
  if (isLocked) {
    html += `<span class="badge badge-locked">技術Lv${process.techRequired}で解放</span>`;
  } else if (totalCount > 0) {
    const cls = activeCount > 0 ? 'badge-active' : 'badge-idle';
    html += `<span class="badge ${cls}">${activeCount}基稼働 / ${totalCount}基</span>`;
  }
  html += `</div>`;
  html += `<div class="card-detail">${process.desc}</div>`;

  if (!isLocked) {
    if (totalCount > 0) {
      // ── I/O（スケール適用済み / 基）──
      html += `<div class="plant-io-row">`;
      html += `<div class="plant-io-section"><span class="io-label">入力/基</span> ${formatIO(effectiveInputs)}</div>`;
      html += `<div class="plant-io-section"><span class="io-label">出力/基</span> ${formatIO(effectiveOutputs)}</div>`;
      html += `</div>`;

      // ── 運転費・推定利益 ──
      html += `<div class="plant-financials">`;
      html += `運転費: <span class="amount">¥${formatNum(effectiveOpCost)}</span>/基`;
      const pClass = profitPerUnit >= 0 ? 'profit-pos' : 'profit-neg';
      html += ` ／ 推定利益: <span class="${pClass}">${profitPerUnit >= 0 ? '+' : ''}¥${formatNum(profitPerUnit)}/基</span>`;
      html += `</div>`;

      // ── コントロール行1: 稼働/停止 + 自動購入 ──
      html += `<div class="card-actions">`;
      if (activeCount < totalCount)
        html += `<button class="btn btn-sm" onclick="handleSetGroupActive('${processId}',true)">全稼働</button>`;
      if (activeCount > 0)
        html += `<button class="btn btn-sm" onclick="handleSetGroupActive('${processId}',false)">全停止</button>`;
      const abClass = allAutoBuy ? 'btn-autobuy-on' : '';
      html += `<button class="btn btn-sm ${abClass}" onclick="handleSetGroupAutoBuy('${processId}',${!allAutoBuy})">`;
      html += `自動購入: ${allAutoBuy ? 'ON' : 'OFF'}</button>`;
      html += `</div>`;

      // ── コントロール行2: ナンバリングアップ + スケールアップ ──
      html += `<div class="card-actions" style="margin-top:4px;">`;
      const canBuild = state.money >= process.buildCost;
      html += `<button class="btn btn-sm btn-accent" onclick="handleBuild('${processId}')" ${canBuild ? '' : 'disabled'}>`;
      html += `+1基 (¥${formatNum(process.buildCost)})</button>`;
      html += `<button class="btn btn-sm btn-danger" onclick="handleDemolishOne('${processId}')">1基 解体</button>`;
      if (canScaleUp) {
        html += `<button class="btn btn-sm btn-scale" onclick="handleScaleUp('${processId}')" ${state.money >= scaleUpCost ? '' : 'disabled'}>`;
        html += `規模Lv${scale}→${scale+1} (¥${formatNum(scaleUpCost)})</button>`;
      } else {
        html += `<span class="badge badge-maxed" style="font-size:0.7rem;padding:3px 8px;">規模MAX</span>`;
      }
      html += `</div>`;

    } else {
      // ── 未建設: 初回建設 ──
      html += `<div class="card-detail">入力: ${formatIOText(process.inputs)} → 出力: ${formatIOText(process.outputs)}</div>`;
      html += `<div class="card-detail">建設費: <span class="amount">¥${formatNum(process.buildCost)}</span> / 運転費: <span class="amount">¥${formatNum(process.operatingCost)}</span>/期</div>`;
      const canBuild = state.money >= process.buildCost;
      html += `<div class="card-actions">`;
      html += `<button class="btn btn-accent" onclick="handleBuild('${processId}')" ${canBuild ? '' : 'disabled'}>`;
      html += `建設 (¥${formatNum(process.buildCost)})</button>`;
      if (!canBuild) html += `<span style="font-size:0.78rem;color:var(--red);">資金不足</span>`;
      html += `</div>`;
    }
  }

  html += `</div>`;
  return html;
}

function formatIO(io) {
  return Object.entries(io)
    .map(([id, amt]) => `<span class="chem-name">${CHEMICALS[id].name}</span> <span class="amount">${formatQty(amt)}t</span>`)
    .join(' + ');
}

// ============================================================
// 市場タブ
// ============================================================

function renderMarket() {
  const container = document.getElementById('tab-market');
  let html = '';

  // ---- 原料市場 ----
  html += '<div class="section-title">原料市場（購入）</div>';
  html += '<table class="data-table">';
  html += '<thead><tr><th>品名</th><th>価格/t</th><th>変動</th><th>数量</th><th></th></tr></thead>';
  html += '<tbody>';

  for (const [id, chem] of Object.entries(CHEMICALS)) {
    if (!chem.isRaw) continue;
    const price = state.market.prices[id];
    const prev = prevPrices[id] || price;
    const trend = getTrendHtml(price, prev, false);

    html += `<tr>`;
    html += `<td>${chem.name}</td>`;
    html += `<td class="price">¥${formatNum(price)}</td>`;
    html += `<td>${trend}</td>`;
    html += `<td><div class="trade-controls">`;
    html += `<button class="btn btn-qty" onclick="adjustQty('buy-${id}', -5)">-5</button>`;
    html += `<button class="btn btn-qty" onclick="adjustQty('buy-${id}', -1)">-1</button>`;
    html += `<input type="number" class="qty-input" id="buy-${id}" value="5" min="1">`;
    html += `<button class="btn btn-qty" onclick="adjustQty('buy-${id}', 1)">+1</button>`;
    html += `<button class="btn btn-qty" onclick="adjustQty('buy-${id}', 5)">+5</button>`;
    html += `</div></td>`;
    html += `<td><button class="btn btn-buy" onclick="handleBuy('${id}')">購入</button></td>`;
    html += `</tr>`;
  }

  // 硫酸も購入可能（中間品）
  for (const [id, chem] of Object.entries(CHEMICALS)) {
    if (chem.isRaw || id === 'sulfuric_acid') continue;
  }
  // 硫酸の購入行
  {
    const id = 'sulfuric_acid';
    const chem = CHEMICALS[id];
    const price = state.market.prices[id];
    const prev = prevPrices[id] || price;
    const trend = getTrendHtml(price, prev, false);

    html += `<tr>`;
    html += `<td>${chem.name} <span style="font-size:0.7rem;color:var(--text-muted)">(中間品)</span></td>`;
    html += `<td class="price">¥${formatNum(price)}</td>`;
    html += `<td>${trend}</td>`;
    html += `<td><div class="trade-controls">`;
    html += `<button class="btn btn-qty" onclick="adjustQty('buy-${id}', -5)">-5</button>`;
    html += `<button class="btn btn-qty" onclick="adjustQty('buy-${id}', -1)">-1</button>`;
    html += `<input type="number" class="qty-input" id="buy-${id}" value="5" min="1">`;
    html += `<button class="btn btn-qty" onclick="adjustQty('buy-${id}', 1)">+1</button>`;
    html += `<button class="btn btn-qty" onclick="adjustQty('buy-${id}', 5)">+5</button>`;
    html += `</div></td>`;
    html += `<td><button class="btn btn-buy" onclick="handleBuy('${id}')">購入</button></td>`;
    html += `</tr>`;
  }

  html += '</tbody></table>';

  // ---- 製品市場 ----
  html += '<div class="section-title">製品市場（売却）</div>';
  html += '<table class="data-table">';
  html += '<thead><tr><th>品名</th><th>価格/t</th><th>変動</th><th>需要</th><th>在庫</th><th>数量</th><th></th></tr></thead>';
  html += '<tbody>';

  for (const [id, chem] of Object.entries(CHEMICALS)) {
    if (chem.isRaw) continue;
    const price = state.market.prices[id];
    const prev = prevPrices[id] || price;
    const trend = getTrendHtml(price, prev, true);
    const stock = state.inventory[id] || 0;
    const demand = state.market.demand[id] || 1;
    const maxSell = DEMAND_MAX_SELL[demand];
    const sold = state.soldThisTurn[id] || 0;
    const remaining = Math.max(0, maxSell - sold);

    html += `<tr>`;
    html += `<td>${chem.name}</td>`;
    html += `<td class="price">¥${formatNum(price)}</td>`;
    html += `<td>${trend}</td>`;
    html += `<td>${renderDemandBar(demand)} <span style="font-size:0.72rem;color:var(--text-muted)">${DEMAND_LABELS[demand]}</span></td>`;
    html += `<td class="num">${formatQty(stock)}t</td>`;
    html += `<td><div class="trade-controls">`;
    html += `<button class="btn btn-qty" onclick="adjustQty('sell-${id}', -5)">-5</button>`;
    html += `<button class="btn btn-qty" onclick="adjustQty('sell-${id}', -1)">-1</button>`;
    html += `<input type="number" class="qty-input" id="sell-${id}" value="${Math.min(Math.floor(stock), remaining)}" min="0">`;
    html += `<button class="btn btn-qty" onclick="adjustQty('sell-${id}', 1)">+1</button>`;
    html += `<button class="btn btn-qty" onclick="adjustQty('sell-${id}', 5)">+5</button>`;
    html += `</div></td>`;
    html += `<td><button class="btn btn-sell" onclick="handleSell('${id}')" ${stock < 1 ? 'disabled' : ''}>売却</button></td>`;
    html += `</tr>`;
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

function getTrendHtml(current, prev, isSell) {
  if (current > prev) {
    const cls = isSell ? 'trend-up-sell' : 'trend-up';
    return `<span class="${cls}">▲</span>`;
  } else if (current < prev) {
    const cls = isSell ? 'trend-down-sell' : 'trend-down';
    return `<span class="${cls}">▼</span>`;
  }
  return '<span class="trend-flat">─</span>';
}

function renderDemandBar(level) {
  let html = '<span class="demand-bar">';
  for (let i = 1; i <= 5; i++) {
    const filled = i <= level ? `filled-${level}` : '';
    html += `<span class="demand-segment ${filled}"></span>`;
  }
  html += '</span>';
  return html;
}

function formatQty(n) {
  if (n === 0) return '0';
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(1);
}

// ============================================================
// 在庫タブ
// ============================================================

function renderInventory() {
  const container = document.getElementById('tab-inventory');
  let html = '';

  html += '<div class="section-header"><h2>在庫一覧</h2></div>';
  html += '<table class="data-table">';
  html += '<thead><tr><th>品名</th><th>在庫</th><th>単価</th><th>資産価値</th></tr></thead>';
  html += '<tbody>';

  let totalValue = 0;
  let hasItems = false;

  for (const [id, chem] of Object.entries(CHEMICALS)) {
    const qty = state.inventory[id] || 0;
    if (qty < 0.001) continue;
    hasItems = true;
    const price = state.market.prices[id];
    const value = Math.floor(price * qty);
    totalValue += value;

    html += `<tr>`;
    html += `<td>${chem.name}</td>`;
    html += `<td class="num">${formatQty(qty)}t</td>`;
    html += `<td class="price">¥${formatNum(price)}</td>`;
    html += `<td class="num">¥${formatNum(value)}</td>`;
    html += `</tr>`;
  }

  if (!hasItems) {
    html += '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">在庫なし</td></tr>';
  }

  html += '</tbody></table>';

  html += `<div class="inventory-total">`;
  html += `在庫資産価値: <span>¥${formatNum(totalValue)}</span>`;
  html += `</div>`;

  html += `<div class="inventory-total">`;
  html += `企業総資産: <span>¥${formatNum(getCompanyValue())}</span>`;
  html += `</div>`;

  container.innerHTML = html;
}

// ============================================================
// 研究開発タブ
// ============================================================

function renderResearch() {
  const container = document.getElementById('tab-research');
  let html = '';

  // ---- セクション1: プロセス解放技術 ----
  html += '<div class="section-title">プロセス解放技術</div>';
  html += renderProcessUnlockSection();

  // ---- セクション2: 工程改善研究 ----
  html += '<div class="section-title">工程改善研究</div>';
  html += renderModifierSummary();
  for (const [catId, cat] of Object.entries(RESEARCH_CATEGORIES)) {
    html += renderCategoryCard(catId, cat);
  }

  container.innerHTML = html;
}

function renderProcessUnlockSection() {
  let html = '';
  html += `<div class="card">`;
  html += `<div class="card-header"><h3>現在の技術レベル: ${state.techLevel}</h3></div>`;

  const needed = getResearchNeededForNext();
  if (needed !== null) {
    const pct = getResearchPercent();
    html += `<div class="research-progress">`;
    html += `<div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>`;
    html += `<div class="progress-text">${formatNum(state.researchProgress)} / ${formatNum(needed)} (${pct}%)</div>`;
    html += `</div>`;

    html += `<div class="research-invest-btns">`;
    for (const amt of [100, 500, 1000]) {
      const disabled = state.money < amt ? 'disabled' : '';
      html += `<button class="btn btn-accent" onclick="handleResearch(${amt})" ${disabled}>¥${formatNum(amt)}</button>`;
    }
    const remaining = needed - state.researchProgress;
    if (remaining > 0 && remaining <= state.money && remaining > 1000) {
      html += `<button class="btn btn-accent" onclick="handleResearch(${remaining})">¥${formatNum(remaining)}（全額）</button>`;
    }
    html += `</div>`;

    const nextTech = TECH_LEVELS.find(t => t.level === state.techLevel + 1);
    if (nextTech && nextTech.unlocks.length > 0) {
      html += `<div class="unlock-preview">`;
      html += `<h4>Lv${nextTech.level} で解放</h4>`;
      for (const processId of nextTech.unlocks) {
        const p = PROCESSES[processId];
        html += `<div class="unlock-item">${p.name}</div>`;
        html += `<div class="unlock-desc">${p.desc}</div>`;
        html += `<div class="unlock-desc">入力: ${formatIOText(p.inputs)} → 出力: ${formatIOText(p.outputs)}</div>`;
      }
      html += `</div>`;
    }
  } else {
    html += `<p style="color:var(--cyan);margin-top:8px;">最大技術レベルに到達しています。</p>`;
  }

  html += `</div>`;
  return html;
}

function renderModifierSummary() {
  const mods = getModifiers();
  const badges = [];

  if (mods.rawPriceDiscount > 0) {
    badges.push(`原料割引 -${Math.round(mods.rawPriceDiscount * 100)}%`);
  }
  if (mods.operatingCostDiscount > 0) {
    badges.push(`運転費割引 -${Math.round(mods.operatingCostDiscount * 100)}%`);
  }
  for (const [pid, bonus] of Object.entries(mods.outputBonus)) {
    const pname = PROCESSES[pid]?.name || pid;
    for (const [chem, amt] of Object.entries(bonus)) {
      badges.push(`${pname} ${CHEMICALS[chem].name} +${amt}t`);
    }
  }
  for (const [pid, disc] of Object.entries(mods.processOpCostDiscount)) {
    const pname = PROCESSES[pid]?.name || pid;
    badges.push(`${pname}運転費 -${Math.round(disc * 100)}%`);
  }
  for (const [pid, reductions] of Object.entries(mods.inputReduction)) {
    const pname = PROCESSES[pid]?.name || pid;
    for (const [chem, amt] of Object.entries(reductions)) {
      badges.push(`${pname} ${CHEMICALS[chem].name}消費 -${amt}t`);
    }
  }

  let html = '<div class="research-summary-bar">';
  if (badges.length === 0) {
    html += '<span class="mod-label">現在の工程改善効果なし</span>';
  } else {
    html += '<span class="mod-label">現在の効果:</span>';
    for (const b of badges) {
      html += `<span class="mod-badge">${b}</span>`;
    }
  }
  html += '</div>';
  return html;
}

function renderCategoryCard(catId, cat) {
  const currentLv = state.researchLevels[catId] || 0;
  const maxLv = cat.levels.length;
  const nextLvDef = cat.levels.find(l => l.level === currentLv + 1);
  const isLocked = state.techLevel < cat.unlockTechLevel;
  const isMaxed  = currentLv >= maxLv;
  const progress = state.categoryResearchProgress[catId] || 0;

  let html = `<div class="card${isLocked ? ' card-locked' : ''}">`;

  html += `<div class="card-header">`;
  html += `<h3>${cat.name}</h3>`;
  if (isLocked) {
    html += `<span class="badge badge-locked">技術Lv${cat.unlockTechLevel}で解放</span>`;
  } else if (isMaxed) {
    html += `<span class="badge badge-maxed">最大Lv達成</span>`;
  } else {
    html += `<span class="badge badge-research">Lv${currentLv} / ${maxLv}</span>`;
  }
  html += `</div>`;

  html += `<div class="card-detail">${cat.desc}</div>`;

  html += `<div class="research-levels-list">`;
  for (const lvDef of cat.levels) {
    const done   = lvDef.level <= currentLv;
    const isNext = lvDef.level === currentLv + 1;
    const cls    = done ? 'rlv-done' : (isNext ? 'rlv-next' : 'rlv-future');
    html += `<div class="research-level-row ${cls}">`;
    html += `<span class="rlv-label">Lv${lvDef.level}</span>`;
    html += `<span class="rlv-effect">${lvDef.desc}</span>`;
    html += `<span class="rlv-cost">${done ? '✓ 達成' : '¥' + formatNum(lvDef.cost)}</span>`;
    html += `</div>`;
  }
  html += `</div>`;

  if (!isLocked && !isMaxed && nextLvDef) {
    const pct = Math.min(100, Math.floor((progress / nextLvDef.cost) * 100));
    html += `<div class="research-progress">`;
    html += `<div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>`;
    html += `<div class="progress-text">${formatNum(progress)} / ${formatNum(nextLvDef.cost)} (${pct}%)</div>`;
    html += `</div>`;

    html += `<div class="research-invest-btns">`;
    for (const amt of [500, 1000, 3000]) {
      const disabled = state.money < amt ? 'disabled' : '';
      html += `<button class="btn btn-accent btn-sm" onclick="handleCategoryResearch('${catId}', ${amt})" ${disabled}>¥${formatNum(amt)}</button>`;
    }
    const remaining = nextLvDef.cost - progress;
    if (remaining > 0 && remaining <= state.money && remaining > 3000) {
      html += `<button class="btn btn-accent btn-sm" onclick="handleCategoryResearch('${catId}', ${remaining})">¥${formatNum(remaining)}（全額）</button>`;
    }
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

function formatIOText(io) {
  return Object.entries(io)
    .map(([id, amt]) => `${CHEMICALS[id].name} ${amt}t`)
    .join(' + ');
}

// ============================================================
// ログ
// ============================================================

function renderLog() {
  const container = document.getElementById('log-content');
  let html = '';
  // 最新のログを上に表示（最新20件）
  const entries = state.log.slice(-20).reverse();
  for (const entry of entries) {
    html += `<div class="log-entry ${entry.type || ''}">`;
    html += `<span class="log-turn">[${entry.turn}期]</span>`;
    html += entry.msg;
    html += `</div>`;
  }
  container.innerHTML = html;
}

function addLog(msg, type) {
  state.log.push({ turn: state.turn, msg, type: type || '' });
}

// ============================================================
// モーダル
// ============================================================

function showModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function hideModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function showBuildModal() {
  const available = Object.entries(PROCESSES)
    .filter(([, p]) => p.techRequired <= state.techLevel);

  let html = '';
  for (const [id, process] of available) {
    const canAfford = state.money >= process.buildCost;
    html += `<div class="process-option">`;
    html += `<h3>${process.name}</h3>`;
    html += `<div class="desc">${process.desc}</div>`;
    html += `<div class="process-io">`;
    html += `<div><div class="io-label">入力</div><div class="io-items">${formatIOText(process.inputs)}</div></div>`;
    html += `<div><div class="io-label">出力</div><div class="io-items">${formatIOText(process.outputs)}</div></div>`;
    html += `</div>`;
    html += `<div class="process-cost">建設費: <span>¥${formatNum(process.buildCost)}</span> / 運転費: <span>¥${formatNum(process.operatingCost)}</span>/期</div>`;
    html += `<button class="btn btn-accent" onclick="handleBuild('${id}')" ${canAfford ? '' : 'disabled'}>`;
    html += `建設する (¥${formatNum(process.buildCost)})`;
    html += `</button>`;
    if (!canAfford) html += ` <span style="font-size:0.78rem;color:var(--red);">資金不足</span>`;
    html += `</div>`;
  }

  if (available.length === 0) {
    html = '<p class="empty-state">利用可能なプロセスがありません。</p>';
  }

  showModal('プラント建設', html);
}

function showTurnSummary(results) {
  let html = '';

  // 自動購入結果
  if (results.autoBuyResults && results.autoBuyResults.length > 0) {
    html += '<div class="summary-section"><h3>自動購入</h3>';
    for (const r of results.autoBuyResults) {
      html += `<div class="summary-item">`;
      html += `<span>${CHEMICALS[r.chemId].name} ${r.qty}t</span>`;
      html += r.success
        ? `<span class="neutral">購入済</span>`
        : `<span class="neg">失敗: ${r.msg}</span>`;
      html += `</div>`;
    }
    html += '</div>';
  }

  // 生産結果（プロセス種別ごとに集約）
  html += '<div class="summary-section"><h3>生産結果</h3>';
  if (results.productionResults.length === 0) {
    html += '<div class="summary-item"><span class="neutral">プラントなし</span></div>';
  } else {
    // 成功分を processId 別に集約
    const successMap = {};
    for (const r of results.productionResults) {
      if (!r.success) continue;
      if (!successMap[r.processId]) successMap[r.processId] = { count: 0, outputs: {} };
      successMap[r.processId].count++;
      for (const [c, a] of Object.entries(r.outputs))
        successMap[r.processId].outputs[c] = (successMap[r.processId].outputs[c] || 0) + a;
    }
    for (const [pid, data] of Object.entries(successMap)) {
      const pname = PROCESSES[pid].name;
      const outStr = Object.entries(data.outputs)
        .map(([c, a]) => `${CHEMICALS[c].name} ${formatQty(a)}t`).join(', ');
      html += `<div class="summary-item"><span>${pname} ×${data.count}基</span><span class="pos">${outStr}</span></div>`;
    }
    // 失敗分
    const failMap = {};
    for (const r of results.productionResults) {
      if (r.success || r.reason === '停止中') continue;
      failMap[r.processId] = (failMap[r.processId] || 0) + 1;
    }
    for (const [pid, cnt] of Object.entries(failMap)) {
      html += `<div class="summary-item"><span>${PROCESSES[pid].name} ×${cnt}基</span><span class="neg">原料不足</span></div>`;
    }
  }
  html += '</div>';

  // 費用
  if (results.totalCost > 0) {
    html += '<div class="summary-section">';
    html += '<h3>運転費</h3>';
    html += `<div class="summary-item"><span>合計</span><span class="neg">-¥${formatNum(results.totalCost)}</span></div>`;
    html += '</div>';
  }

  // 資金推移
  html += '<div class="summary-section">';
  html += `<div class="summary-total">`;
  html += `<span>資金</span>`;
  const changeClass = results.moneyChange >= 0 ? 'pos' : 'neg';
  const changeSign = results.moneyChange >= 0 ? '+' : '';
  html += `<span class="${changeClass}">¥${formatNum(results.newMoney)} (${changeSign}¥${formatNum(results.moneyChange)})</span>`;
  html += `</div>`;
  html += '</div>';

  html += `<div style="text-align:center;margin-top:12px;">`;
  html += `<button class="btn btn-accent" onclick="hideModal()" style="padding:8px 30px;font-size:0.9rem;">第${state.turn}期へ</button>`;
  html += `</div>`;

  showModal(`第${state.turn - 1}期 結果`, html);
}

// ============================================================
// イベントハンドラ
// ============================================================

function adjustQty(inputId, delta) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const current = parseInt(input.value) || 0;
  input.value = Math.max(1, current + delta);
}

function handleBuy(chemId) {
  const input = document.getElementById(`buy-${chemId}`);
  const qty = parseInt(input.value) || 0;
  const result = buyChemical(chemId, qty);
  if (result.success) {
    addLog(result.msg, 'log-good');
  } else {
    addLog(result.msg, 'log-bad');
  }
  render();
}

function handleSell(chemId) {
  const input = document.getElementById(`sell-${chemId}`);
  const qty = parseInt(input.value) || 0;
  const result = sellChemical(chemId, qty);
  if (result.success) {
    addLog(result.msg, 'log-good');
  } else {
    addLog(result.msg, 'log-bad');
  }
  render();
}

function handleBuild(processId) {
  const result = buildPlant(processId);
  addLog(result.msg, result.success ? 'log-info' : 'log-bad');
  render();
}

function handleDemolishOne(processId) {
  const plants = state.plants.filter(p => p.processId === processId);
  if (plants.length === 0) return;
  const process = PROCESSES[processId];
  const refund = Math.floor(process.buildCost * 0.2);
  let html = `<p>${process.name} を1基解体しますか？</p>`;
  html += `<p style="color:var(--text-secondary);font-size:0.85rem;">建設費の20%が払い戻されます（¥${formatNum(refund)}）</p>`;
  html += `<div style="display:flex;gap:8px;margin-top:14px;justify-content:center;">`;
  html += `<button class="btn btn-danger" onclick="confirmDemolishOne('${processId}')">解体する</button>`;
  html += `<button class="btn" onclick="hideModal()">キャンセル</button>`;
  html += `</div>`;
  showModal('プラント解体', html);
}

function confirmDemolishOne(processId) {
  const plants = state.plants.filter(p => p.processId === processId);
  if (plants.length === 0) { hideModal(); render(); return; }
  const result = demolishPlant(plants[plants.length - 1].id);
  addLog(result.msg, result.success ? 'log-warn' : 'log-bad');
  hideModal();
  render();
}

function handleSetGroupActive(processId, active) {
  setGroupActive(processId, active);
  addLog(`${PROCESSES[processId].name} 全基を${active ? '稼働' : '停止'}`, 'log-info');
  render();
}

function handleSetGroupAutoBuy(processId, autoBuy) {
  setGroupAutoBuy(processId, autoBuy);
  addLog(`${PROCESSES[processId].name} 自動購入 ${autoBuy ? 'ON' : 'OFF'}`, 'log-info');
  render();
}

function handleScaleUp(processId) {
  const result = scaleUpProcess(processId);
  addLog(result.msg, result.success ? 'log-info' : 'log-bad');
  render();
}

function handleResearch(amount) {
  const result = investResearch(amount);
  addLog(result.msg, result.success ? 'log-info' : 'log-bad');
  render();
}

function handleCategoryResearch(catId, amount) {
  const result = investCategoryResearch(catId, amount);
  addLog(result.msg, result.success ? 'log-info' : 'log-bad');
  render();
}

function handleEndTurn() {
  const results = processTurn();

  // 自動購入ログ
  for (const r of results.autoBuyResults || []) {
    if (r.success) {
      addLog(`[自動購入] ${r.msg}`, 'log-info');
    } else {
      addLog(`[自動購入失敗] ${CHEMICALS[r.chemId].name} ${r.qty}t — ${r.msg}`, 'log-warn');
    }
  }

  // 生産結果ログ（プロセス種別ごとに集約）
  const logSuccess = {};
  const logFail = {};
  for (const r of results.productionResults) {
    if (r.success) {
      if (!logSuccess[r.processId]) logSuccess[r.processId] = { count: 0, outputs: {} };
      logSuccess[r.processId].count++;
      for (const [c, a] of Object.entries(r.outputs))
        logSuccess[r.processId].outputs[c] = (logSuccess[r.processId].outputs[c] || 0) + a;
    } else if (r.reason !== '停止中') {
      logFail[r.processId] = (logFail[r.processId] || 0) + 1;
    }
  }
  for (const [pid, d] of Object.entries(logSuccess)) {
    const outStr = Object.entries(d.outputs).map(([c, a]) => `${CHEMICALS[c].name} ${formatQty(a)}t`).join(', ');
    addLog(`${PROCESSES[pid].name} ×${d.count}基: ${outStr} 生産`, 'log-good');
  }
  for (const [pid, cnt] of Object.entries(logFail)) {
    addLog(`${PROCESSES[pid].name} ×${cnt}基: 原料不足`, 'log-warn');
  }

  // サマリー表示
  showTurnSummary(results);
  render();
}
