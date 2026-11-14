import type { ChemId } from '../src/data/chemicals';
import type { DeviceTypeId } from '../src/data/devices';
import { borrow } from '../src/sim/finance';
import { addPipe, placeDevice, setDeviceChem } from '../src/sim/grid';
import type { Device, GameState } from '../src/sim/state';

export function build(state: GameState, type: DeviceTypeId, x: number, y: number, chem?: ChemId): Device {
  const result = placeDevice(state, type, x, y);
  if (!result.ok) throw new Error(`${type} を (${x},${y}) に置けない: ${result.msg}`);
  const device = state.devices[state.devices.length - 1];
  if (chem) setDeviceChem(state, device.id, chem);
  return device;
}

export function pipes(state: GameState, chem: ChemId, tiles: [number, number][]): void {
  for (const [x, y] of tiles) {
    const result = addPipe(state, x, y, chem);
    if (!result.ok) throw new Error(`${chem} の配管を (${x},${y}) に敷けない: ${result.msg}`);
  }
}

// 第1時代の定石: 硫酸 → 芒硝 → ソーダ灰 を1系列。塩化水素は煙突、残渣は廃棄場へ
export function buildLeblancLine(state: GameState): Record<string, Device> {
  borrow(state, 10000);
  const devices = {
    sulfur: build(state, 'intake', 0, 0, 'sulfur'),
    salt: build(state, 'intake', 4, 0, 'salt'),
    limestone: build(state, 'intake', 9, 0, 'limestone'),
    coal: build(state, 'intake', 12, 0, 'coal'),
    chamber: build(state, 'lead_chamber', 0, 2),
    furnace: build(state, 'saltcake_furnace', 4, 2),
    blackAsh: build(state, 'black_ash_furnace', 8, 2),
    stack: build(state, 'stack', 5, 5),
    dump: build(state, 'dump', 11, 5),
    sodaShipping: build(state, 'shipping', 8, 11),
    acidShipping: build(state, 'shipping', 0, 6),
  };
  pipes(state, 'sulfur', [[0, 1]]);
  pipes(state, 'salt', [[4, 1]]);
  pipes(state, 'sulfuric_acid', [[2, 2], [3, 2], [2, 3], [2, 4], [2, 5], [2, 6]]);
  pipes(state, 'salt_cake', [[6, 2], [7, 2]]);
  pipes(state, 'limestone', [[9, 1]]);
  pipes(state, 'coal', [[12, 1], [11, 1], [11, 2]]);
  pipes(state, 'hcl_gas', [[5, 4]]);
  pipes(state, 'soda_ash', [[8, 4], [8, 5], [8, 6], [8, 7], [8, 8], [8, 9], [8, 10]]);
  pipes(state, 'cas_waste', [[10, 4], [11, 4]]);
  return devices;
}
