import { CHEMICALS, CHEM_IDS, type ChemId } from '../data/chemicals';
import { DEVICE_TYPES, DEVICE_TYPE_IDS, type DeviceTypeId } from '../data/devices';
import { ERAS } from '../data/eras';
import { TECHS } from '../data/techs';
import { acceptContract, maxContracts } from '../sim/contracts';
import { eraGoals } from '../sim/era';
import {
  BANKRUPT_STREAK, INTEREST_RATE, LOAN_UNIT, borrow, companyValue, loanLimit, maintenanceTotal, rent, repay,
} from '../sim/finance';
import {
  DEMOLISH_REFUND, expandCost, expandSite, isUnlocked, removeDevice, setDeviceChem, setDeviceEnabled,
} from '../sim/grid';
import { basePrice, currentPrice, marketSize, rawPrice } from '../sim/market';
import { BUFFER_TURNS, findNetworks, outputPerTurn } from '../sim/network';
import { researchTech, techStatus } from '../sim/research';
import { deserialize, serialize } from '../sim/save';
import { getMods, SITE_MAX_W, total, type Contract, type Device, type GameState, type TurnReport } from '../sim/state';
import { endTurn } from '../sim/turn';
import { game, refresh, setMessage, setTool, startNewGame, ui, type Tab } from './app';
import { isFlowOpen, toggleFlowWindow } from './flow';
import { amountsText, chemName, escapeHtml, qty, yen } from './format';

// ============================================================
// パネル類の描画とボタン操作
// ============================================================

const el = (id: string) => document.getElementById(id)!;

const STATUS_LABELS: Record<Device['status'], string> = {
  new: '準備中', ok: '稼働中', partial: '一部稼働', starved: '原料不足', blocked: '出力詰まり',
  nopower: '電力不足', off: '停止中', broken: '事故停止', unset: '未設定',
};

const STATUS_CLASS: Record<Device['status'], string> = {
  new: 'muted', ok: 'good', partial: 'warn', starved: 'bad', blocked: 'bad',
  nopower: 'warn', off: 'muted', broken: 'bad', unset: 'warn',
};

function chip(chem: ChemId, active = false): string {
  return `<button class="chip${active ? ' active' : ''}" data-act="pipe" data-arg="${chem}" title="${chemName(chem)}の配管を敷く">`
    + `<span class="swatch" style="background:${CHEMICALS[chem].color}"></span>${chemName(chem)}</button>`;
}

// いま建設できる装置に関わる物質 (配管の選択肢)
function knownChems(state: GameState): ChemId[] {
  const known = new Set<ChemId>();
  for (const type of DEVICE_TYPE_IDS) {
    if (!isUnlocked(state, type)) continue;
    const def = DEVICE_TYPES[type];
    for (const c of [...Object.keys(def.inputs), ...Object.keys(def.outputs)] as ChemId[]) known.add(c);
  }
  return CHEM_IDS.filter(c => known.has(c));
}

// ── ヘッダー ──

function renderTopbar(): void {
  const s = game.state;
  const report = s.lastReport;
  const pollutionClass = s.pollution > s.regulation.threshold ? 'bad' : '';
  const power = report && (report.powerSupply > 0 || report.powerDemand > 0)
    ? `<div class="stat"><span>電力</span><b class="${report.powerDemand > report.powerSupply ? 'bad' : ''}">${qty(report.powerDemand)} / ${qty(report.powerSupply)}</b></div>`
    : '';
  el('topbar').innerHTML = `
    <h1>化学プラント経営</h1>
    <div class="stat"><span>期</span><b>第 ${s.turn} 期</b></div>
    <div class="stat"><span>時代</span><b>${ERAS[s.era].name}</b></div>
    <div class="stat"><span>資金</span><b class="${s.money < 0 ? 'bad' : 'money'}">${yen(s.money)}</b></div>
    <div class="stat"><span>前期損益</span><b class="${report && report.profit < 0 ? 'bad' : ''}">${report ? yen(report.profit) : '—'}</b></div>
    <div class="stat"><span>信用</span><b>${s.reputation}</b></div>
    <div class="stat"><span>汚染 / 許容</span><b class="${pollutionClass}">${qty(s.pollution)} / ${s.regulation.threshold}</b></div>
    <div class="stat"><span>研究</span><b>${s.rp} pt</b></div>
    ${power}
    <div class="spacer"></div>
    <button class="${isFlowOpen() ? 'active' : ''}" data-act="flow">物質フロー</button>
    <button data-act="menu">メニュー</button>
    <button data-act="next5" ${s.gameOver ? 'disabled' : ''}>5期進める</button>
    <button class="primary" data-act="next" ${s.gameOver ? 'disabled' : ''}>次の期へ</button>`;
}

// ── 左ツールバー ──

function deviceTitle(type: DeviceTypeId): string {
  const def = DEVICE_TYPES[type];
  const lines = [def.desc, `大きさ ${def.w}×${def.h} / 維持費 ${yen(def.maintenance)}/期`];
  if (total(def.inputs) || total(def.outputs)) {
    lines.push(`${amountsText(def.inputs) || '—'} → ${amountsText(def.outputs) || (def.powerOut ? `電力 ${def.powerOut}` : '—')}`);
  }
  if (def.power) lines.push(`消費電力 ${def.power}`);
  return lines.join('\n');
}

function renderToolbar(): void {
  const s = game.state;
  const common: string[] = [];
  const process: string[] = [];
  for (const type of DEVICE_TYPE_IDS) {
    if (!isUnlocked(s, type)) continue;
    const def = DEVICE_TYPES[type];
    const active = ui.tool === 'build' && ui.buildType === type;
    const html = `<button class="build${active ? ' active' : ''}${s.money < def.cost ? ' poor' : ''}" data-act="build" data-arg="${type}" title="${escapeHtml(deviceTitle(type))}">`
      + `<span>${def.name}</span><small>${yen(def.cost)}</small></button>`;
    (def.role === 'process' || def.role === 'power' ? process : common).push(html);
  }
  el('toolbar').innerHTML = `
    <div class="tools">
      <button class="${ui.tool === 'select' ? 'active' : ''}" data-act="tool" data-arg="select">選択</button>
      <button class="${ui.tool === 'remove' ? 'active' : ''}" data-act="tool" data-arg="remove">撤去</button>
    </div>
    <h3>配管 <small>¥100/タイル</small></h3>
    <div class="chips">${knownChems(s).map(c => chip(c, ui.tool === 'pipe' && ui.pipeChem === c)).join('')}</div>
    <h3>共通設備</h3>
    <div class="builds">${common.join('')}</div>
    <h3>反応装置</h3>
    <div class="builds">${process.join('')}</div>`;
}

// ── 右パネル: 概要 ──

function progressBar(current: number, target: number): string {
  const pct = Math.max(0, Math.min(100, (current / target) * 100));
  return `<div class="bar"><div style="width:${pct}%"></div></div>`;
}

function reportTable(r: TurnReport): string {
  const row = (label: string, value: number, sign: 1 | -1) => value
    ? `<tr><td>${label}</td><td class="num ${sign < 0 ? 'bad' : 'good'}">${yen(value * sign)}</td></tr>` : '';
  const sold = (Object.entries(r.sold) as [ChemId, number][])
    .filter(([, n]) => n > 0).map(([c, n]) => `${chemName(c)} ${qty(n)}t`).join('、');
  return `<table class="plain">
    ${row('契約納入', r.contractRevenue, 1)}${row('スポット販売', r.spotRevenue, 1)}
    ${row('原料費', r.rawCost, -1)}${row('運転費', r.opCost, -1)}${row('維持費', r.maintenance, -1)}
    ${row('地代', r.rent, -1)}${row('利息', r.interest, -1)}${row('処分費', r.dumpFee, -1)}
    ${row('汚染の罰金', r.fine, -1)}${row('違約金', r.penalty, -1)}
    <tr class="sum"><td>損益</td><td class="num ${r.profit < 0 ? 'bad' : 'good'}">${yen(r.profit)}</td></tr>
  </table>
  <p class="note">販売: ${sold || 'なし'}</p>`;
}

function renderOverview(): string {
  const s = game.state;
  const era = ERAS[s.era];
  const goals = eraGoals(s).map(g => `
    <div class="goal${g.done ? ' done' : ''}">
      <div class="row"><span>${g.done ? '達成 ' : ''}${g.label}</span><span class="num">${Math.floor(g.current).toLocaleString('ja-JP')} / ${g.target.toLocaleString('ja-JP')}</span></div>
      ${progressBar(g.current, g.target)}
    </div>`).join('');
  const guide = s.devices.length ? '' : `
    <div class="card guide">
      <h3>最初の一歩</h3>
      <ol>
        <li>左の「受入設備」を敷地の外周に置き、原料 (硫黄・食塩・石灰石・石炭) を設定する</li>
        <li>「鉛室法硫酸工場」「芒硝炉」「黒灰炉」を置く</li>
        <li>装置どうしは隣り合わせに置けば直接つながる。離れた装置は、物質を選んで配管を敷いてつなぐ</li>
        <li>副生する塩化水素ガスは「煙突」、残渣は「廃棄場」へ逃がす。行き先がないと装置が止まる</li>
        <li>「出荷設備」へソーダ灰を送り、「次の期へ」で操業する</li>
      </ol>
      <p class="note">「契約」タブに最初の引き合いが届いている。</p>
    </div>`;
  const stock = (Object.entries(s.warehouse) as [ChemId, number][]).filter(([, n]) => n > 0.05)
    .map(([c, n]) => `${chemName(c)} ${qty(n)}t`).join('、');
  return `
    ${guide}
    <div class="card">
      <h3>${era.name} <small>${era.year}年代</small></h3>
      <p class="note">${era.desc}</p>
      ${s.cleared ? '<p class="good">すべての時代目標を達成済み</p>' : goals}
    </div>
    <div class="card">
      <h3>前期の決算</h3>
      ${s.lastReport ? reportTable(s.lastReport) : '<p class="note">まだ決算がありません</p>'}
    </div>
    <div class="card">
      <h3>倉庫</h3>
      <p class="note">${stock || '在庫なし'}</p>
    </div>`;
}

// ── 右パネル: 装置 ──

function connectedChems(state: GameState, d: Device): Set<ChemId> {
  const result = new Set<ChemId>();
  for (const net of findNetworks(state)) {
    if (net.deviceIds.includes(d.id)) result.add(net.chem);
  }
  return result;
}

function chemSelect(d: Device, options: ChemId[]): string {
  return `<select data-change="setchem" data-arg="${d.id}">
    <option value="">— 選択 —</option>
    ${options.map(c => `<option value="${c}"${d.chem === c ? ' selected' : ''}>${chemName(c)}</option>`).join('')}
  </select>`;
}

function renderDevice(): string {
  const s = game.state;
  const d = s.devices.find(dev => dev.id === ui.selectedId);
  if (!d) return '<div class="card"><p class="note">敷地の装置をクリックすると、ここに詳細が出ます</p></div>';
  const def = DEVICE_TYPES[d.type];
  const mods = getMods(s);
  const connected = connectedChems(s, d);
  const link = (c: ChemId) => connected.has(c) ? '' : ' <span class="bad">未接続</span>';

  let body = '';
  if (def.role === 'process' || def.role === 'power') {
    const inputs = (Object.entries(def.inputs) as [ChemId, number][]).map(([c, n]) =>
      `<tr><td>${chip(c)}${link(c)}</td><td class="num">${qty(n)}</td><td class="num">${qty(d.inBuf[c] ?? 0)} / ${qty(n * BUFFER_TURNS)}</td></tr>`).join('');
    const outputs = (Object.keys(def.outputs) as ChemId[]).map(c => {
      const per = outputPerTurn(d, c, mods);
      return `<tr><td>${chip(c)}${link(c)}</td><td class="num">${qty(per)}</td><td class="num">${qty(d.outBuf[c] ?? 0)} / ${qty(per * BUFFER_TURNS)}</td></tr>`;
    }).join('');
    body = `
      <table class="plain">
        <tr><th>入力</th><th class="num">t/期</th><th class="num">手持ち</th></tr>${inputs || '<tr><td colspan="3">なし</td></tr>'}
        <tr><th>出力</th><th class="num">t/期</th><th class="num">滞留</th></tr>${outputs || `<tr><td colspan="3">電力 ${def.powerOut}</td></tr>`}
      </table>
      <p class="note">運転費 ${yen(def.opCost * mods.opCostMult)}/期 (稼働率に比例)${def.power ? ` / 消費電力 ${def.power}` : ''}</p>
      <p class="note">物質名を押すと、その配管を敷くモードになります</p>`;
  } else if (def.role === 'intake') {
    const raws = CHEM_IDS.filter(c => CHEMICALS[c].kind === 'raw');
    body = `<label>受け入れる原料 ${chemSelect(d, raws)}</label>
      ${d.chem ? `<p class="note">${chip(d.chem)}${link(d.chem)} 現在価格 ${yen(rawPrice(s, d.chem))}/t、最大 ${def.capacity}t/期。使われた分だけ買い足す</p>` : ''}`;
  } else if (def.role === 'tank') {
    body = `<label>貯める物質 ${chemSelect(d, knownChems(s))}</label>
      ${d.chem ? `<p class="note">${chip(d.chem)}${link(d.chem)} 貯蔵量 ${qty(total(d.inBuf))} / ${def.capacity}t</p>` : ''}`;
  } else if (def.role === 'lab') {
    body = `<p class="note">毎期 ${def.capacity} pt の研究ポイントを生む</p>`;
  } else {
    const what = def.role === 'shipping' ? '製品' : def.role === 'stack' ? '気体' : '固体・液体';
    const nets = [...connected].map(c => chemName(c)).join('、');
    body = `<p class="note">隣接する配管・装置から${what}を最大 ${def.capacity}t/期 受け入れる</p>
      <p class="note">接続中の物質: ${nets || '<span class="bad">なし</span>'}</p>
      ${def.role === 'dump' ? `<p class="note">処分費 ${yen(s.regulation.dumpFee)}/t</p>` : ''}`;
  }

  return `<div class="card">
    <h3>${def.name} <small>#${d.id}</small></h3>
    <p><span class="badge ${STATUS_CLASS[d.status]}">${STATUS_LABELS[d.status]}</span>
      ${def.role === 'process' || def.role === 'power' ? `稼働率 ${Math.round(d.rate * 100)}%` : ''}
      <span class="${STATUS_CLASS[d.status]}">${d.statusNote}</span></p>
    <p class="note">${def.desc}</p>
    ${body}
    <p class="note">維持費 ${yen(def.maintenance * mods.maintenanceMult)}/期</p>
    <div class="actions">
      <button data-act="toggle" data-arg="${d.id}">${d.enabled ? '停止する' : '再開する'}</button>
      <button class="danger" data-act="demolish" data-arg="${d.id}">撤去 (払戻 ${yen(def.cost * DEMOLISH_REFUND)})</button>
    </div>
  </div>`;
}

// ── 右パネル: 契約 ──

function contractCard(c: Contract, offer: boolean): string {
  const s = game.state;
  const full = s.contracts.length >= maxContracts(s);
  const head = `<div class="row"><b>${c.customer}</b><span>${chemName(c.chem)} ${c.qtyPerTurn}t/期</span></div>`;
  const terms = `<p class="note">単価 ${yen(c.unitPrice)} (相場 ${yen(currentPrice(s, c.chem))}) / ${c.duration}期間 / 不足の違約金 ${yen(c.penaltyPerTon)}/t</p>`;
  if (offer) {
    return `<div class="card">${head}${terms}
      <p class="note">受注から ${c.leadTime} 期後に納入開始。募集はあと ${c.offerTurnsLeft} 期</p>
      <div class="actions"><button data-act="accept" data-arg="${c.id}" ${full ? 'disabled' : ''}>受注する</button></div></div>`;
  }
  const waiting = c.leadTime - c.turnsWaited;
  const progress = waiting > 0
    ? `<p class="note">納入開始まであと ${waiting} 期</p>`
    : `<p class="note">${c.turnsDone} / ${c.duration} 期 経過、納入不足 ${c.missedTurns} 回</p>${progressBar(c.turnsDone, c.duration)}`;
  return `<div class="card">${head}${terms}${progress}</div>`;
}

function renderContracts(): string {
  const s = game.state;
  return `
    <h3 class="section">受注中 <small>${s.contracts.length} / ${maxContracts(s)} 件</small></h3>
    ${s.contracts.map(c => contractCard(c, false)).join('') || '<p class="note pad">受注中の契約はありません</p>'}
    <h3 class="section">引き合い</h3>
    ${s.offers.map(c => contractCard(c, true)).join('') || '<p class="note pad">いまは引き合いがありません</p>'}
    <p class="note pad">契約は相場より高い固定単価で売れ、値崩れもしない。倉庫の製品は契約納入が先で、残りがスポット販売に回る。完遂すると信用が上がり、より大口の引き合いが来る</p>`;
}

// ── 右パネル: 市場 ──

function renderMarket(): string {
  const s = game.state;
  const known = knownChems(s);
  const trend = (c: ChemId) => {
    const pct = Math.round((currentPrice(s, c) / basePrice(s, c) - 1) * 100);
    return `<span class="${pct > 0 ? 'good' : pct < 0 ? 'bad' : ''}">${pct > 0 ? '+' : ''}${pct}%</span>`;
  };
  const products = known.filter(c => CHEMICALS[c].kind === 'product').map(c => `
    <tr><td>${chemName(c)}</td><td class="num">${yen(currentPrice(s, c))}</td><td class="num">${trend(c)}</td>
    <td class="num">${qty(marketSize(s, c))}</td><td class="num">${qty(s.warehouse[c] ?? 0)}</td>
    <td class="num"><input type="checkbox" data-change="hold" data-arg="${c}" ${s.hold[c] ? 'checked' : ''}></td></tr>`).join('');
  const raws = CHEM_IDS.filter(c => CHEMICALS[c].kind === 'raw').map(c => `
    <tr><td>${chemName(c)}</td><td class="num">${yen(rawPrice(s, c))}</td><td class="num">${trend(c)}</td></tr>`).join('');
  const mods = s.priceMods.map(m =>
    `<li>${m.label}: ${m.chem ? chemName(m.chem) : '全製品'} ×${m.mult} (残り ${m.turnsLeft} 期)</li>`).join('');
  return `
    <div class="card"><h3>製品</h3>
      <table class="plain"><tr><th>物質</th><th class="num">相場</th><th class="num">基準比</th><th class="num">市場規模</th><th class="num">倉庫</th><th class="num">留保</th></tr>${products}</table>
      <p class="note">1期に市場規模ぶん売ると、平均単価は相場の 2/3 まで下がる。「留保」にすると倉庫に貯め、契約納入だけに使う</p>
    </div>
    <div class="card"><h3>原料</h3>
      <table class="plain"><tr><th>物質</th><th class="num">価格</th><th class="num">基準比</th></tr>${raws}</table>
    </div>
    ${mods ? `<div class="card"><h3>相場の動き</h3><ul>${mods}</ul></div>` : ''}`;
}

// ── 右パネル: 研究 ──

function renderResearch(): string {
  const s = game.state;
  const labs = s.devices.filter(d => d.type === 'lab' && d.enabled).length;
  const sections = ERAS.map((era, index) => {
    const items = Object.entries(TECHS).filter(([, t]) => t.era === index).map(([id, t]) => {
      const status = techStatus(s, id);
      const requires = t.requires.length ? `<p class="note">前提: ${t.requires.map(r => TECHS[r].name).join('、')}</p>` : '';
      const action = status === 'done' ? '<span class="badge good">研究済み</span>'
        : status === 'available' ? `<button data-act="research" data-arg="${id}" ${s.rp < t.cost ? 'disabled' : ''}>研究 (${t.cost} pt)</button>`
        : `<span class="badge muted">${status === 'future' ? '次の時代' : '前提が必要'} (${t.cost} pt)</span>`;
      return `<div class="card tech ${status}"><div class="row"><b>${t.name}</b>${action}</div><p class="note">${t.desc}</p>${requires}</div>`;
    }).join('');
    return `<h3 class="section">${era.name}</h3>${items}`;
  }).join('');
  return `<p class="note pad">研究ポイント <b>${s.rp} pt</b> (研究所 ${labs} 棟、毎期 +${labs * DEVICE_TYPES.lab.capacity} pt)${labs ? '' : '。研究所を建てるとポイントが貯まる'}</p>${sections}`;
}

// ── 右パネル: 財務 ──

function renderFinance(): string {
  const s = game.state;
  const limit = loanLimit(s);
  const canExpand = s.site.w < SITE_MAX_W;
  return `
    <div class="card"><h3>資金</h3>
      <table class="plain">
        <tr><td>資金</td><td class="num">${yen(s.money)}</td></tr>
        <tr><td>借入 / 限度額</td><td class="num">${yen(s.loan)} / ${yen(limit)}</td></tr>
        <tr><td>利息 (毎期 ${(INTEREST_RATE * 100).toFixed(1)}%)</td><td class="num">${yen(s.loan * INTEREST_RATE)}</td></tr>
        <tr><td>維持費</td><td class="num">${yen(maintenanceTotal(s))}/期</td></tr>
        <tr><td>地代</td><td class="num">${yen(rent(s))}/期</td></tr>
        <tr class="sum"><td>企業価値</td><td class="num">${yen(companyValue(s))}</td></tr>
      </table>
      <div class="actions">
        <button data-act="borrow" ${s.loan + LOAN_UNIT > limit ? 'disabled' : ''}>${yen(LOAN_UNIT)} 借りる</button>
        <button data-act="repay" ${s.loan <= 0 || s.money < Math.min(LOAN_UNIT, s.loan) ? 'disabled' : ''}>${yen(LOAN_UNIT)} 返す</button>
      </div>
      <p class="note">期末の資金マイナスが ${BANKRUPT_STREAK} 期続くと破産する${s.negativeStreak ? ` <span class="bad">(現在 ${s.negativeStreak} 期連続)</span>` : ''}</p>
    </div>
    <div class="card"><h3>敷地</h3>
      <p class="note">現在 ${s.site.w}×${s.site.h} タイル</p>
      <div class="actions"><button data-act="expand" ${!canExpand || s.money < expandCost(s) ? 'disabled' : ''}>
        ${canExpand ? `東へ4列拡張 (${yen(expandCost(s))})` : 'これ以上は拡張できません'}</button></div>
    </div>
    <div class="card"><h3>環境規制</h3>
      <table class="plain">
        <tr><td>汚染度 / 許容値</td><td class="num">${qty(s.pollution)} / ${s.regulation.threshold}</td></tr>
        <tr><td>超過1ポイントの罰金</td><td class="num">${yen(s.regulation.fineRate)}/期</td></tr>
        <tr><td>廃棄場の処分費</td><td class="num">${yen(s.regulation.dumpFee)}/t</td></tr>
      </table>
      <p class="note">汚染度は毎期 3 割ずつ薄まり、煙突・廃棄場からの排出で積み上がる</p>
    </div>`;
}

function renderLog(): string {
  const items = [...game.state.log].reverse().map(l =>
    `<li class="${l.kind}"><span>第${l.turn}期</span>${escapeHtml(l.text)}</li>`).join('');
  return `<ul class="log">${items}</ul>`;
}

const TABS: [Tab, string][] = [
  ['overview', '概要'], ['device', '装置'], ['contracts', '契約'], ['market', '市場'],
  ['research', '研究'], ['finance', '財務'], ['log', '記録'],
];

function renderSide(): void {
  const s = game.state;
  const body = {
    overview: renderOverview, device: renderDevice, contracts: renderContracts, market: renderMarket,
    research: renderResearch, finance: renderFinance, log: renderLog,
  }[ui.tab]();
  const badge = (tab: Tab) => tab === 'contracts' && s.offers.length ? ` <i>${s.offers.length}</i>` : '';
  const side = el('side');
  const scroll = side.querySelector('.tab-body')?.scrollTop ?? 0;
  side.innerHTML = `
    <nav class="tabs">${TABS.map(([tab, label]) =>
      `<button class="${ui.tab === tab ? 'active' : ''}" data-act="tab" data-arg="${tab}">${label}${badge(tab)}</button>`).join('')}</nav>
    <div class="tab-body" data-tab="${ui.tab}">${body}</div>`;
  const next = side.querySelector<HTMLElement>('.tab-body')!;
  if (side.dataset.tab === ui.tab) next.scrollTop = scroll;
  side.dataset.tab = ui.tab;
}

export function renderPanels(): void {
  renderTopbar();
  renderToolbar();
  renderSide();
}

// ============================================================
// モーダル
// ============================================================

function showModal(title: string, html: string, buttons = '<button class="primary" data-act="close-modal">閉じる</button>'): void {
  el('modal-root').innerHTML = `<div class="modal-back"><div class="modal">
    <h2>${title}</h2><div class="modal-body">${html}</div><div class="actions">${buttons}</div></div></div>`;
}

function closeModal(): void {
  el('modal-root').innerHTML = '';
}

export function showHelp(): void {
  showModal('遊び方', `
    <p>敷地に装置を置き、配管でつないで化学製品を作る。1期は1か月。「次の期へ」を押すと、生産・輸送・販売・決算がまとめて進む。</p>
    <ul>
      <li><b>配管</b>は物質ごとに敷く。同じ物質の配管はつながって1つの配管網になり、隣接する装置が出し入れする</li>
      <li>装置どうしを<b>隣り合わせに置く</b>と、配管なしで直接受け渡す (接した辺にひし形の印が出る)。離れた装置だけ配管でつなげばよい</li>
      <li><b>受入設備</b>が原料を買い、<b>出荷設備</b>が製品を倉庫へ送る。どちらも敷地の外周に置く</li>
      <li>装置は<b>出力の行き先がないと止まる</b>。副生成物は、売るか、次の反応に使うか、煙突・廃棄場に捨てる</li>
      <li>捨てると<b>汚染度</b>が上がり、許容値を超えると罰金がかかる。規制は時代とともに厳しくなる</li>
      <li>配管網では、反応装置 → 貯槽 → 出荷 → 放出・投棄 の順に優先して配られる。余った分だけが売られ、捨てられる</li>
      <li><b>契約</b>は高い固定単価で売れるが、納入できないと違約金と信用低下が待っている</li>
      <li><b>時代目標</b>をすべて満たすと次の時代へ進む。資金のマイナスが3期続くと破産する</li>
    </ul>
    <p class="note">操作: 左のボタンで道具を選び、敷地をクリック。配管と撤去はドラッグで連続。R で装置を回転、Esc か右クリックで選択に戻る。進行は毎期自動で保存される。</p>`);
}

function showMenu(): void {
  showModal('メニュー', `
    <div class="menu">
      <button data-act="help">遊び方</button>
      <button data-act="export">セーブデータを書き出す</button>
      <button data-act="import">セーブデータを読み込む</button>
      <button class="danger" data-act="newgame">最初からやり直す</button>
    </div>
    <input type="file" id="import-file" accept="application/json,.json" hidden>`);
}

function showNotices(report: TurnReport): void {
  if (!report.notices.length) return;
  const html = report.notices.map(n => `<h3>${n.title}</h3><p>${escapeHtml(n.text)}</p>`).join('');
  const s = game.state;
  const buttons = s.gameOver
    ? '<button class="primary" data-act="newgame">最初からやり直す</button><button data-act="close-modal">敷地を見る</button>'
    : undefined;
  showModal(`第 ${report.turn} 期の知らせ`, html, buttons);
}

// ============================================================
// 操作
// ============================================================

function advance(turns: number): void {
  const s = game.state;
  for (let i = 0; i < turns && !s.gameOver; i++) {
    const report = endTurn(s);
    if (report.notices.length) {
      showNotices(report);
      break;
    }
  }
  setMessage('');
  refresh();
}

function exportSave(): void {
  const blob = new Blob([serialize(game.state)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `chemical-plant-turn${game.state.turn}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importSave(file: File): void {
  file.text().then(text => {
    const loaded = deserialize(text);
    if (!loaded) {
      window.alert('このファイルは読み込めません (壊れているか、版が違います)');
      return;
    }
    game.state = loaded;
    ui.selectedId = null;
    closeModal();
    refresh();
  });
}

function handleAction(act: string, arg: string): void {
  const s = game.state;
  const show = (result: { ok: boolean; msg: string }) => setMessage(result.msg);
  switch (act) {
    case 'tool': setTool(arg as 'select' | 'remove'); break;
    case 'pipe':
      ui.pipeChem = arg as ChemId;
      setTool('pipe');
      setMessage(`${chemName(ui.pipeChem)}の配管を敷設 (ドラッグで連続、Esc で中止)`);
      break;
    case 'build':
      setTool('build');
      ui.buildType = arg as DeviceTypeId;
      setMessage(`${DEVICE_TYPES[ui.buildType].name}を配置 (R で回転、Esc で中止)`);
      break;
    case 'tab': ui.tab = arg as Tab; break;
    case 'next': advance(1); return;
    case 'next5': advance(5); return;
    case 'accept': show(acceptContract(s, Number(arg))); break;
    case 'research': show(researchTech(s, arg)); break;
    case 'borrow': show(borrow(s, LOAN_UNIT)); break;
    case 'repay': show(repay(s, LOAN_UNIT)); break;
    case 'expand': show(expandSite(s)); break;
    case 'toggle': {
      const d = s.devices.find(dev => dev.id === Number(arg));
      if (d) setDeviceEnabled(s, d.id, !d.enabled);
      break;
    }
    case 'demolish': {
      const d = s.devices.find(dev => dev.id === Number(arg));
      if (d && window.confirm(`${DEVICE_TYPES[d.type].name}を撤去しますか？`)) {
        show(removeDevice(s, d.id));
        ui.selectedId = null;
        ui.tab = 'overview';
      }
      break;
    }
    case 'flow': toggleFlowWindow(); break;
    case 'menu': showMenu(); return;
    case 'help': showHelp(); return;
    case 'export': exportSave(); return;
    case 'import': (el('import-file') as HTMLInputElement).click(); return;
    case 'newgame':
      if (!window.confirm('いまの進行を捨てて最初からやり直しますか？')) return;
      startNewGame();
      closeModal();
      showHelp();
      break;
    case 'close-modal': closeModal(); return;
  }
  refresh();
}

export function initPanels(): void {
  document.addEventListener('click', ev => {
    const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!target || (target as HTMLButtonElement).disabled) return;
    handleAction(target.dataset.act!, target.dataset.arg ?? '');
  });

  document.addEventListener('change', ev => {
    const target = ev.target as HTMLInputElement | HTMLSelectElement;
    const s = game.state;
    if (target.id === 'import-file') {
      const file = (target as HTMLInputElement).files?.[0];
      if (file) importSave(file);
      return;
    }
    const kind = target.dataset.change;
    const arg = target.dataset.arg ?? '';
    if (kind === 'setchem' && target.value) {
      setMessage(setDeviceChem(s, Number(arg), target.value as ChemId).msg);
    } else if (kind === 'hold') {
      s.hold[arg as ChemId] = (target as HTMLInputElement).checked;
    } else {
      return;
    }
    refresh();
  });
}
