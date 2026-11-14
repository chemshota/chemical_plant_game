import { describe, expect, it } from 'vitest';
import { CHEM_IDS } from '../src/data/chemicals';
import { acceptContract } from '../src/sim/contracts';
import { addPipe, canPlace, placeDevice, removePipe } from '../src/sim/grid';
import { spotUnitPrice } from '../src/sim/market';
import { distribute, findNetworks } from '../src/sim/network';
import { researchTech } from '../src/sim/research';
import { deserialize, serialize } from '../src/sim/save';
import { createInitialState, total, START_MONEY, type GameState } from '../src/sim/state';
import { endTurn } from '../src/sim/turn';
import { build, buildLeblancLine, pipes } from './helpers';

function totalOf(state: GameState, chem: (typeof CHEM_IDS)[number]): number {
  return state.devices.reduce((acc, d) => acc + (d.inBuf[chem] ?? 0) + (d.outBuf[chem] ?? 0), 0);
}

describe('敷地と配管', () => {
  it('受入設備は外周にしか置けない', () => {
    const state = createInitialState(1);
    expect(canPlace(state, 'intake', 5, 5).ok).toBe(false);
    expect(canPlace(state, 'intake', 5, 0).ok).toBe(true);
  });

  it('装置と配管は重ねられない', () => {
    const state = createInitialState(1);
    build(state, 'lead_chamber', 2, 2);
    expect(addPipe(state, 2, 2, 'sulfur').ok).toBe(false);
    pipes(state, 'sulfur', [[5, 5]]);
    expect(placeDevice(state, 'lead_chamber', 4, 4).ok).toBe(false);
  });

  it('別の物質の配管は同じタイルで交差でき、交差しても混ざらない', () => {
    const state = createInitialState(1);
    pipes(state, 'sulfur', [[4, 5], [5, 5], [6, 5]]);
    pipes(state, 'salt', [[5, 4], [5, 5], [5, 6]]);
    expect(state.pipes['5,5']).toEqual(['sulfur', 'salt']);
    expect(findNetworks(state).map(n => `${n.chem}:${n.tiles.length}`).sort()).toEqual(['salt:3', 'sulfur:3']);
    expect(addPipe(state, 5, 5, 'salt').ok).toBe(false);
    expect(addPipe(state, 5, 5, 'coal').ok).toBe(true);
    expect(addPipe(state, 5, 5, 'limestone').ok).toBe(false);
    expect(removePipe(state, 5, 5, 'salt')).toBe(true);
    expect(state.pipes['5,5']).toEqual(['sulfur', 'coal']);
  });

  it('同じ物質のつながった配管は1つの配管網になり、隣接する装置を拾う', () => {
    const state = createInitialState(1);
    const intake = build(state, 'intake', 0, 0, 'sulfur');
    const chamber = build(state, 'lead_chamber', 0, 2);
    pipes(state, 'sulfur', [[0, 1]]);
    pipes(state, 'sulfur', [[8, 8], [9, 8]]);
    pipes(state, 'salt', [[10, 8]]);
    const nets = findNetworks(state);
    expect(nets).toHaveLength(3);
    const first = nets.find(n => n.tiles.includes('0,1'))!;
    expect(first.deviceIds).toEqual([intake.id, chamber.id]);
    expect(nets.find(n => n.tiles.includes('8,8'))!.tiles).toHaveLength(2);
  });
});

describe('生産と配分', () => {
  it('配分の前後で物質の総量は変わらない', () => {
    const state = createInitialState(1);
    const intake = build(state, 'intake', 0, 0, 'sulfur');
    build(state, 'lead_chamber', 0, 2);
    build(state, 'lead_chamber', 3, 1);
    pipes(state, 'sulfur', [[0, 1], [1, 1], [2, 1]]);
    intake.outBuf.sulfur = 10;
    distribute(state);
    expect(totalOf(state, 'sulfur')).toBeCloseTo(10);
    expect(intake.outBuf.sulfur).toBeCloseTo(0);
  });

  it('副生成物の行き先がないと装置が止まる', () => {
    const state = createInitialState(1);
    const d = buildLeblancLine(state);
    removePipe(state, 5, 4);
    for (let i = 0; i < 8; i++) endTurn(state);
    expect(d.furnace.status).toBe('blocked');
    expect(d.furnace.statusNote).toContain('塩化水素ガス');
    expect(d.furnace.rate).toBe(0);
  });

  it('反応装置は出荷より優先して受け取る', () => {
    const state = createInitialState(1);
    const d = buildLeblancLine(state);
    d.chamber.outBuf.sulfuric_acid = 6;
    distribute(state);
    expect(d.furnace.inBuf.sulfuric_acid).toBeCloseTo(6);
    expect(total(d.acidShipping.inBuf)).toBeCloseTo(0);
  });

  it('貯槽は余剰を貯め、反応装置の不足時に払い出す', () => {
    const state = createInitialState(1);
    const chamber = build(state, 'lead_chamber', 0, 2);
    const tank = build(state, 'tank', 3, 2, 'sulfuric_acid');
    const furnace = build(state, 'saltcake_furnace', 5, 2);
    pipes(state, 'sulfuric_acid', [[2, 2], [2, 3], [3, 3], [4, 3]]);
    furnace.inBuf.sulfuric_acid = 12;
    chamber.outBuf.sulfuric_acid = 10;
    distribute(state);
    expect(tank.inBuf.sulfuric_acid).toBeCloseTo(10);
    furnace.inBuf.sulfuric_acid = 4;
    distribute(state);
    expect(furnace.inBuf.sulfuric_acid).toBeCloseTo(12);
    expect(tank.inBuf.sulfuric_acid).toBeCloseTo(2);
  });
});

describe('経済', () => {
  it('スポット市場は売るほど単価が下がる', () => {
    const state = createInitialState(1);
    expect(spotUnitPrice(state, 'soda_ash', 30)).toBeLessThan(spotUnitPrice(state, 'soda_ash', 5));
    expect(spotUnitPrice(state, 'soda_ash', 30)).toBeCloseTo(1100 / 1.5);
  });

  it('契約を納入できないと違約金と信用低下が発生する', () => {
    const state = createInitialState(1);
    const offer = state.offers[0];
    offer.leadTime = 0;
    expect(acceptContract(state, offer.id).ok).toBe(true);
    const report = endTurn(state);
    expect(report.penalty).toBe(offer.qtyPerTurn * offer.penaltyPerTon);
    expect(state.reputation).toBe(8);
  });

  it('資金のマイナスが3期続くと破産する', () => {
    const state = createInitialState(1);
    state.money = -100000;
    endTurn(state);
    endTurn(state);
    expect(state.gameOver).toBe(false);
    endTurn(state);
    expect(state.gameOver).toBe(true);
  });

  it('何も建てなければ地代で資金が減り続ける', () => {
    const state = createInitialState(1);
    for (let i = 0; i < 10; i++) endTurn(state);
    expect(state.money).toBe(START_MONEY - 576 * 10);
  });
});

describe('セーブ', () => {
  it('保存して読み込むと同じ状態に戻り、その後の進行も一致する', () => {
    const state = createInitialState(42);
    buildLeblancLine(state);
    for (let i = 0; i < 5; i++) endTurn(state);
    const copy = deserialize(serialize(state))!;
    expect(copy).toEqual(state);
    for (let i = 0; i < 5; i++) { endTurn(state); endTurn(copy); }
    expect(copy).toEqual(state);
  });

  it('壊れたデータは読み込まない', () => {
    expect(deserialize('{')).toBeNull();
    expect(deserialize('{"version":999}')).toBeNull();
  });
});

describe('時代の進行と電力', () => {
  it('電力が足りないと、電力を使う装置の稼働率が一律に下がる', () => {
    const state = createInitialState(1);
    state.money = 500000;
    state.techs.push('power_generation', 'electrolysis');
    const plant = build(state, 'power_plant', 0, 2);
    const cells = [build(state, 'electrolyzer', 4, 2), build(state, 'electrolyzer', 8, 2)];
    plant.inBuf.coal = 10;
    for (const cell of cells) cell.inBuf.salt = 12;
    const report = endTurn(state);
    expect(report.powerSupply).toBe(100);
    expect(report.powerDemand).toBe(120);
    expect(cells[0].status).toBe('nopower');
    expect(cells[0].rate).toBeCloseTo(100 / 120);
    expect(cells[0].outBuf.caustic_soda).toBeCloseTo(8 * 100 / 120);
  });

  it('時代目標をすべて満たすと次の時代へ進み、規制と相場が変わる', () => {
    const state = createInitialState(1);
    state.soldTotal.soda_ash = 300;
    state.reputation = 30;
    state.money = 100000;
    const report = endTurn(state);
    expect(state.era).toBe(1);
    expect(state.regulation.threshold).toBe(12);
    expect(report.notices.some(n => n.title.includes('電解工業時代'))).toBe(true);
    for (let i = 0; i < 30; i++) endTurn(state);
    expect(state.prices.soda_ash).toBeLessThan(1100 * 0.65 * 1.5 + 1);
    expect(researchTech(state, 'haber_bosch').ok).toBe(false);
  });
});

describe('隣り合った装置の直結', () => {
  it('配管がなくても、隣り合った装置どうしで物質が渡る', () => {
    const state = createInitialState(1);
    const intake = build(state, 'intake', 0, 0, 'sulfur');
    const chamber = build(state, 'lead_chamber', 0, 1);
    const furnace = build(state, 'saltcake_furnace', 2, 1);
    const stack = build(state, 'stack', 4, 1);
    const links = findNetworks(state);
    expect(links.every(n => n.tiles.length === 0)).toBe(true);
    expect(links.map(n => `${n.chem}:${n.deviceIds.join('-')}`).sort()).toEqual([
      `hcl_gas:${furnace.id}-${stack.id}`,
      `sulfur:${intake.id}-${chamber.id}`,
      `sulfuric_acid:${chamber.id}-${furnace.id}`,
    ]);
    for (let i = 0; i < 3; i++) endTurn(state);
    expect(chamber.status).toBe('ok');
    expect(furnace.inBuf.sulfuric_acid).toBeGreaterThan(0);
  });

  it('受け渡す物質のない装置どうしは、隣り合ってもつながらない', () => {
    const state = createInitialState(1);
    build(state, 'lead_chamber', 0, 1);
    build(state, 'black_ash_furnace', 2, 1);
    expect(findNetworks(state)).toHaveLength(0);
  });

  it('直結した出荷より、配管でつないだ反応装置が優先される', () => {
    const state = createInitialState(1);
    const shipping = build(state, 'shipping', 0, 0);
    const chamber = build(state, 'lead_chamber', 0, 1);
    const furnace = build(state, 'saltcake_furnace', 5, 1);
    pipes(state, 'sulfuric_acid', [[2, 1], [3, 1], [4, 1]]);
    chamber.outBuf.sulfuric_acid = 6;
    distribute(state);
    expect(furnace.inBuf.sulfuric_acid).toBeCloseTo(6);
    expect(total(shipping.inBuf)).toBeCloseTo(0);
  });
});
