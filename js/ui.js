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
  let html = '';

  html += '<div class="section-header">';
  html += '<h2>プラント一覧</h2>';
  html += '<button class="btn btn-accent" onclick="showBuildModal()">+ 新規建設</button>';
  html += '</div>';

  if (state.plants.length === 0) {
    html += '<p class="empty-state">プラントがありません。<br>「新規建設」から製造プラントを建設してください。</p>';
  } else {
    for (const plant of state.plants) {
      const process = PROCESSES[plant.processId];
      const statusClass = plant.active ? 'badge-active' : 'badge-idle';
      const statusText = plant.active ? '稼働中' : '停止中';

      // 入力材料の充足チェック
      let inputStatus = '';
      if (plant.active) {
        let hasAll = true;
        for (const [chemId, amount] of Object.entries(process.inputs)) {
          if ((state.inventory[chemId] || 0) < amount) {
            hasAll = false;
            break;
          }
        }
        if (!hasAll) {
          inputStatus = '<span class="badge badge-error">原料不足</span>';
        }
      }

      html += `<div class="card">`;
      html += `<div class="card-header">`;
      html += `<h3>${process.name} #${plant.id}</h3>`;
      html += `<div><span class="badge ${statusClass}">${statusText}</span> ${inputStatus}</div>`;
      html += `</div>`;

      // 入出力
      html += `<div class="card-detail">`;
      html += `入力: ${formatIO(process.inputs)}`;
      html += `</div>`;
      html += `<div class="card-detail">`;
      html += `出力: ${formatIO(process.outputs)}`;
      html += `</div>`;
      html += `<div class="card-detail">`;
      html += `運転費: <span class="amount">¥${formatNum(process.operatingCost)}</span>/期`;
      html += `</div>`;

      // アクション
      html += `<div class="card-actions">`;
      html += `<button class="btn btn-sm" onclick="handleTogglePlant(${plant.id})">`;
      html += plant.active ? '停止' : '稼働';
      html += `</button>`;
      html += `<button class="btn btn-sm btn-danger" onclick="handleDemolish(${plant.id})">解体</button>`;
      html += `</div>`;
      html += `</div>`;
    }
  }

  container.innerHTML = html;
}

function formatIO(io) {
  return Object.entries(io)
    .map(([id, amt]) => `<span class="chem-name">${CHEMICALS[id].name}</span> <span class="amount">${amt}t</span>`)
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

  html += '<div class="section-header"><h2>研究開発</h2></div>';

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
    const amounts = [100, 500, 1000];
    for (const amt of amounts) {
      const disabled = state.money < amt ? 'disabled' : '';
      html += `<button class="btn btn-accent" onclick="handleResearch(${amt})" ${disabled}>¥${formatNum(amt)} 投資</button>`;
    }
    // 必要額ぴったり投資
    const remaining = needed - state.researchProgress;
    if (remaining > 0 && remaining <= state.money) {
      html += `<button class="btn btn-accent" onclick="handleResearch(${remaining})">¥${formatNum(remaining)} （残額全部）</button>`;
    }
    html += `</div>`;

    // 次のレベルで解放されるもの
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

  // 解放済みプロセス一覧
  html += '<div class="section-title">解放済みプロセス</div>';
  for (const [id, process] of Object.entries(PROCESSES)) {
    if (process.techRequired > state.techLevel) continue;
    html += `<div class="card">`;
    html += `<div class="card-header"><h3>${process.name}</h3><span class="badge badge-active">Lv${process.techRequired}</span></div>`;
    html += `<div class="card-detail">${process.desc}</div>`;
    html += `<div class="card-detail">入力: ${formatIO(process.inputs)}</div>`;
    html += `<div class="card-detail">出力: ${formatIO(process.outputs)}</div>`;
    html += `<div class="card-detail">建設費: <span class="amount">¥${formatNum(process.buildCost)}</span> / 運転費: <span class="amount">¥${formatNum(process.operatingCost)}</span>/期</div>`;
    html += `</div>`;
  }

  container.innerHTML = html;
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

  // 生産結果
  html += '<div class="summary-section">';
  html += '<h3>生産結果</h3>';

  if (results.productionResults.length === 0) {
    html += '<div class="summary-item"><span class="neutral">プラントなし</span></div>';
  } else {
    for (const r of results.productionResults) {
      const process = PROCESSES[r.processId];
      if (r.success) {
        const outputStr = Object.entries(r.outputs)
          .map(([id, amt]) => `${CHEMICALS[id].name} ${amt}t`)
          .join(', ');
        html += `<div class="summary-item">`;
        html += `<span>${process.name} #${r.plantId}</span>`;
        html += `<span class="pos">${outputStr} 生産</span>`;
        html += `</div>`;
      } else {
        html += `<div class="summary-item">`;
        html += `<span>${process.name} #${r.plantId}</span>`;
        html += `<span class="neg">${r.reason}</span>`;
        html += `</div>`;
      }
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
  if (result.success) {
    addLog(result.msg, 'log-info');
    hideModal();
  } else {
    addLog(result.msg, 'log-bad');
  }
  render();
}

function handleDemolish(plantId) {
  const plant = state.plants.find(p => p.id === plantId);
  if (!plant) return;
  const process = PROCESSES[plant.processId];

  // 確認モーダル
  let html = `<p>${process.name} #${plantId} を解体しますか？</p>`;
  html += `<p style="color:var(--text-secondary);font-size:0.85rem;">建設費の20%が払い戻されます。</p>`;
  html += `<div style="display:flex;gap:8px;margin-top:14px;justify-content:center;">`;
  html += `<button class="btn btn-danger" onclick="confirmDemolish(${plantId})">解体する</button>`;
  html += `<button class="btn" onclick="hideModal()">キャンセル</button>`;
  html += `</div>`;

  showModal('プラント解体', html);
}

function confirmDemolish(plantId) {
  const result = demolishPlant(plantId);
  if (result.success) {
    addLog(result.msg, 'log-warn');
  } else {
    addLog(result.msg, 'log-bad');
  }
  hideModal();
  render();
}

function handleTogglePlant(plantId) {
  togglePlant(plantId);
  const plant = state.plants.find(p => p.id === plantId);
  if (plant) {
    const process = PROCESSES[plant.processId];
    const status = plant.active ? '稼働' : '停止';
    addLog(`${process.name} #${plantId} を${status}に変更`, 'log-info');
  }
  render();
}

function handleResearch(amount) {
  const result = investResearch(amount);
  if (result.success) {
    addLog(result.msg, 'log-info');
  } else {
    addLog(result.msg, 'log-bad');
  }
  render();
}

function handleEndTurn() {
  const results = processTurn();

  // ログに生産結果を記録
  for (const r of results.productionResults) {
    const process = PROCESSES[r.processId];
    if (r.success) {
      const outputStr = Object.entries(r.outputs)
        .map(([id, amt]) => `${CHEMICALS[id].name} ${amt}t`)
        .join(', ');
      addLog(`${process.name} #${r.plantId}: ${outputStr} 生産`, 'log-good');
    } else if (r.reason !== '停止中') {
      addLog(`${process.name} #${r.plantId}: ${r.reason}`, 'log-warn');
    }
  }

  // サマリー表示
  showTurnSummary(results);
  render();
}
