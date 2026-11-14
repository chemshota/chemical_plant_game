import { CHEMICALS, CHEM_IDS, type ChemId } from '../data/chemicals';
import { DEVICE_TYPES } from '../data/devices';
import { findNetworks, outputPerTurn, sinkPriority } from '../sim/network';
import { getMods, type Device, type GameState } from '../sim/state';
import { game } from './app';
import { chemName, qty } from './format';

// ============================================================
// 物質フロー ウインドウ (流れ図・収支表・停止中の装置)
// ============================================================

interface Edge {
  from: number;
  to: number;
  chem: ChemId;
}

const NODE_W = 124;
const NODE_H = 36;
const GAP_X = 70;
const GAP_Y = 16;
const PAD = 16;

const STATUS_COLORS: Record<Device['status'], string> = {
  new: '#8b949e', ok: '#3fb950', partial: '#d29922', starved: '#f85149', blocked: '#f85149',
  nopower: '#d29922', off: '#6e7681', broken: '#f85149', unset: '#d29922',
};

let open = false;
let root: HTMLElement | null = null;

function supplies(d: Device, chem: ChemId): boolean {
  const def = DEVICE_TYPES[d.type];
  if (def.role === 'intake') return d.chem === chem;
  return def.outputs[chem] !== undefined;
}

function buildEdges(state: GameState): Edge[] {
  const byId = new Map(state.devices.map(d => [d.id, d]));
  const edges: Edge[] = [];
  const seen = new Set<string>();
  for (const net of findNetworks(state)) {
    const devs = net.deviceIds.map(id => byId.get(id)!);
    const sources = devs.filter(d => supplies(d, net.chem));
    const sinks = devs.filter(d => sinkPriority({ ...d, enabled: true }, net.chem) > 0);
    for (const s of sources) {
      for (const t of sinks) {
        const key = `${s.id}>${t.id}>${net.chem}`;
        if (s.id === t.id || seen.has(key)) continue;
        seen.add(key);
        edges.push({ from: s.id, to: t.id, chem: net.chem });
      }
    }
  }
  return edges;
}

// 上流から下流へ左から右に並べる。循環 (硫黄回収など) は戻りの辺として扱う
function assignLayers(devices: Device[], edges: Edge[]): { layer: Map<number, number>; back: Set<Edge> } {
  const outgoing = new Map<number, Edge[]>();
  const incoming = new Map<number, Edge[]>();
  for (const e of edges) {
    outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), e]);
    incoming.set(e.to, [...(incoming.get(e.to) ?? []), e]);
  }
  const back = new Set<Edge>();
  const mark = new Map<number, 1 | 2>();
  const visit = (id: number): void => {
    mark.set(id, 1);
    for (const e of outgoing.get(id) ?? []) {
      if (mark.get(e.to) === 1) back.add(e);
      else if (!mark.has(e.to)) visit(e.to);
    }
    mark.set(id, 2);
  };
  for (const d of devices) if (!mark.has(d.id)) visit(d.id);

  const layer = new Map<number, number>();
  const depth = (id: number): number => {
    const known = layer.get(id);
    if (known !== undefined) return known;
    layer.set(id, 0);
    let value = 0;
    for (const e of incoming.get(id) ?? []) {
      if (!back.has(e)) value = Math.max(value, depth(e.from) + 1);
    }
    layer.set(id, value);
    return value;
  };
  for (const d of devices) depth(d.id);
  return { layer, back };
}

function renderDiagram(state: GameState, edges: Edge[]): string {
  const linked = new Set<number>();
  for (const e of edges) { linked.add(e.from); linked.add(e.to); }
  const devices = state.devices.filter(d => linked.has(d.id));
  if (!devices.length) return '<p class="note">配管でつながった装置がまだありません</p>';

  const { layer, back } = assignLayers(devices, edges);
  const columns: Device[][] = [];
  for (const d of devices) (columns[layer.get(d.id)!] ??= []).push(d);
  const pos = new Map<number, { x: number; y: number }>();
  let height = 0;
  columns.forEach((col, i) => {
    col.sort((a, b) => a.y - b.y || a.x - b.x);
    col.forEach((d, j) => pos.set(d.id, { x: PAD + i * (NODE_W + GAP_X), y: PAD + j * (NODE_H + GAP_Y) }));
    height = Math.max(height, PAD * 2 + col.length * (NODE_H + GAP_Y));
  });
  const width = PAD * 2 + columns.length * (NODE_W + GAP_X) - GAP_X;

  // 同じ装置から出る辺・入る辺が重ならないよう、端点を上下にずらす
  const outCount = new Map<number, number>();
  const inCount = new Map<number, number>();
  const slot = (counter: Map<number, number>, id: number, sizeOf: number): number => {
    const index = counter.get(id) ?? 0;
    counter.set(id, index + 1);
    return NODE_H * (index + 1) / (sizeOf + 1);
  };
  const outTotal = new Map<number, number>();
  const inTotal = new Map<number, number>();
  for (const e of edges) {
    outTotal.set(e.from, (outTotal.get(e.from) ?? 0) + 1);
    inTotal.set(e.to, (inTotal.get(e.to) ?? 0) + 1);
  }

  const paths = edges.map(e => {
    const a = pos.get(e.from)!;
    const b = pos.get(e.to)!;
    const x1 = a.x + NODE_W;
    const y1 = a.y + slot(outCount, e.from, outTotal.get(e.from)!);
    const x2 = b.x;
    const y2 = b.y + slot(inCount, e.to, inTotal.get(e.to)!);
    const bend = Math.max(30, Math.abs(x2 - x1) / 2);
    const color = CHEMICALS[e.chem].color;
    const dash = back.has(e) ? ' stroke-dasharray="5 4"' : '';
    return `<path d="M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}" fill="none" stroke="${color}" stroke-width="2.5"${dash}><title>${chemName(e.chem)}</title></path>`
      + `<circle cx="${x2}" cy="${y2}" r="3.5" fill="${color}"/>`;
  }).join('');

  const nodes = devices.map(d => {
    const def = DEVICE_TYPES[d.type];
    const p = pos.get(d.id)!;
    const sub = d.chem ? chemName(d.chem) : d.statusNote || `#${d.id}`;
    return `<g><title>${def.name} #${d.id}${d.statusNote ? `\n${d.statusNote}` : ''}</title>
      <rect x="${p.x}" y="${p.y}" width="${NODE_W}" height="${NODE_H}" rx="5" fill="#21262d" stroke="${STATUS_COLORS[d.status]}" stroke-width="1.5"/>
      <text x="${p.x + NODE_W / 2}" y="${p.y + 15}" text-anchor="middle" fill="#e6edf3" font-size="12">${def.short}</text>
      <text x="${p.x + NODE_W / 2}" y="${p.y + 29}" text-anchor="middle" fill="#8b949e" font-size="10">${sub.slice(0, 12)}</text></g>`;
  }).join('');

  const used = CHEM_IDS.filter(c => edges.some(e => e.chem === c));
  const legend = used.map(c =>
    `<span class="flow-legend"><span class="swatch" style="background:${CHEMICALS[c].color}"></span>${chemName(c)}</span>`).join('');

  return `<div class="flow-legends">${legend}</div>
    <div class="flow-diagram"><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${paths}${nodes}</svg></div>
    <p class="note">左が上流、右が下流。枠の色は稼働状況 (緑: 稼働、黄: 一部、赤: 停止)。破線は上流へ戻る流れ</p>`;
}

function renderBalance(state: GameState, edges: Edge[]): string {
  const mods = getMods(state);
  const byId = new Map(state.devices.map(d => [d.id, d]));
  const rows = CHEM_IDS.map(chem => {
    let made = 0;
    let rated = 0;
    let used = 0;
    let usedRated = 0;
    for (const d of state.devices) {
      const def = DEVICE_TYPES[d.type];
      if (def.role === 'intake' && d.chem === chem) {
        made += def.capacity * d.rate;
        rated += def.capacity;
      }
      const out = outputPerTurn(d, chem, mods);
      made += out * d.rate;
      rated += out;
      const need = def.inputs[chem] ?? 0;
      used += need * d.rate;
      usedRated += need;
    }
    if (rated === 0 && usedRated === 0) return '';

    const outlets = new Set<string>();
    let piped = false;
    for (const e of edges) {
      if (e.chem !== chem) continue;
      piped = true;
      const role = DEVICE_TYPES[byId.get(e.to)!.type].role;
      if (role !== 'process' && role !== 'power') outlets.add(DEVICE_TYPES[byId.get(e.to)!.type].name);
    }
    const isIntakeOnly = CHEMICALS[chem].kind === 'raw' && !state.devices.some(d => outputPerTurn(d, chem, mods) > 0);
    const surplus = rated - usedRated;
    let outlet = [...outlets].join('、');
    if (!outlet) {
      if (rated > 0 && !piped) outlet = '<span class="bad">接続なし</span>';
      else if (!isIntakeOnly && surplus > 0.05) outlet = '<span class="bad">余剰の行き先なし</span>';
      else if (rated === 0) outlet = '<span class="bad">供給なし</span>';
      else outlet = '—';
    }
    const diff = made - used;
    return `<tr><td><span class="swatch" style="background:${CHEMICALS[chem].color}"></span> ${chemName(chem)}</td>
      <td class="num">${qty(made)} <small>/ ${qty(rated)}</small></td>
      <td class="num">${qty(used)} <small>/ ${qty(usedRated)}</small></td>
      <td class="num ${usedRated > rated + 0.05 ? 'bad' : ''}">${diff > 0 ? '+' : ''}${qty(diff)}</td>
      <td>${outlet}</td></tr>`;
  }).join('');
  if (!rows) return '';
  return `<h3>物質ごとの収支 <small>前期の実績 / 定格 (t/期)</small></h3>
    <table class="plain"><tr><th>物質</th><th class="num">受入・生産</th><th class="num">反応で消費</th><th class="num">差引</th><th>余剰の行き先</th></tr>${rows}</table>
    <p class="note">受入設備は使われた分だけ買い足すので、原料の差引は 0 に近づく。消費の定格が生産の定格を上回る物質 (赤字) は供給が足りない</p>`;
}

function renderIssues(state: GameState): string {
  const troubled = state.devices.filter(d => !['ok', 'new'].includes(d.status));
  if (!troubled.length) return '<h3>止まっている装置</h3><p class="note">ありません</p>';
  const items = troubled.map(d =>
    `<li><b>${DEVICE_TYPES[d.type].name} #${d.id}</b> <span style="color:${STATUS_COLORS[d.status]}">${d.statusNote || '停止'}</span></li>`).join('');
  return `<h3>止まっている・絞られている装置</h3><ul>${items}</ul>`;
}

function ensureRoot(): HTMLElement {
  if (root) return root;
  root = document.createElement('div');
  root.id = 'flow-window';
  root.innerHTML = `<div class="flow-title"><b>物質フロー</b><button data-act="flow">閉じる</button></div><div class="flow-body"></div>`;
  document.body.appendChild(root);

  // タイトルバーをつかんで動かす
  const title = root.querySelector<HTMLElement>('.flow-title')!;
  title.addEventListener('mousedown', ev => {
    if ((ev.target as HTMLElement).tagName === 'BUTTON') return;
    const rect = root!.getBoundingClientRect();
    const dx = ev.clientX - rect.left;
    const dy = ev.clientY - rect.top;
    const move = (e: MouseEvent) => {
      root!.style.left = `${Math.max(0, Math.min(window.innerWidth - 80, e.clientX - dx))}px`;
      root!.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dy))}px`;
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    ev.preventDefault();
  });
  return root;
}

export function isFlowOpen(): boolean {
  return open;
}

export function toggleFlowWindow(): void {
  open = !open;
  renderFlowWindow();
}

export function renderFlowWindow(): void {
  if (!open) {
    if (root) root.style.display = 'none';
    return;
  }
  const el = ensureRoot();
  el.style.display = 'flex';
  const body = el.querySelector<HTMLElement>('.flow-body')!;
  const scroll = body.scrollTop;
  const state = game.state;
  const edges = buildEdges(state);
  body.innerHTML = renderDiagram(state, edges) + renderBalance(state, edges) + renderIssues(state);
  body.scrollTop = scroll;
}
