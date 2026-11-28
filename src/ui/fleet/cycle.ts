/**
 * Cycling the active ship (decision S6-8 in planning/sprint-6.md): the Fleets tab's order
 * (fleets by seq, Unassigned last, ships by seq), over coasting ships only, wrapping. Pure.
 */

import { fleetShips, groupOrder } from '../../sim/fleet';
import type { ShipId } from '../../sim/ship';
import { shipStatus } from '../../sim/shipStatus';
import type { World } from '../../sim/world';

export type CycleMode = 'next' | 'previous' | 'next-in-fleet' | 'previous-in-fleet' | 'next-idle';

/** Coasting ships in the Fleets tab's order. */
export function cycleOrder(world: World): ShipId[] {
  return groupOrder(world)
    .flatMap((f) => fleetShips(world, f))
    .filter((id) => world.ships[id]?.status === 'coasting');
}

/**
 * The ship a cycling key makes active, or null if there is none. With no active ship, next and
 * next idle start at the first ship and previous at the last; in-fleet modes need one.
 */
export function cycleShip(world: World, activeId: ShipId | null, mode: CycleMode): ShipId | null {
  let order = cycleOrder(world);
  const active =
    activeId !== null && world.ships[activeId]?.status === 'coasting' ? activeId : null;
  if (mode === 'next-in-fleet' || mode === 'previous-in-fleet') {
    if (active === null) return null;
    const fleet = world.ships[active]!.fleetId;
    order = order.filter((id) => world.ships[id]!.fleetId === fleet);
  }
  if (mode === 'next-idle') {
    const idle = new Set(order.filter((id) => shipStatus(world, id).idle));
    if (idle.size === 0) return null;
    const start = active === null ? -1 : order.indexOf(active);
    for (let k = 1; k <= order.length; k++) {
      const id = order[(start + k + order.length) % order.length]!;
      if (idle.has(id)) return id;
    }
    return null;
  }
  if (order.length === 0) return null;
  const back = mode === 'previous' || mode === 'previous-in-fleet';
  const i = active === null ? -1 : order.indexOf(active);
  if (i < 0) return back ? order[order.length - 1]! : order[0]!;
  return order[(i + (back ? -1 : 1) + order.length) % order.length]!;
}
