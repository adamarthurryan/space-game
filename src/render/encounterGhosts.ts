/**
 * Encounter ghosts (decision S5b-13 in planning/sprint-5b.md): where a body will be when a ship
 * enters its SOI. Placed in the reference frame like the trajectory points, so a trajectory that
 * ends at an SOI entry meets the ghost there. Pure.
 */

import { add, type Vec3 } from '../math/vec3';
import { bodyStateIn, bodyWorldState, soiRadiusOf, getBody, type BodyId } from '../sim/body';
import type { ShipId } from '../sim/ship';
import type { World } from '../sim/world';
import { sameRef, type MapObjectRef } from '../store/useView';

export interface EncounterGhost {
  shipId: ShipId;
  /** The body entered. */
  bodyId: BodyId;
  /** The entry time. */
  t: number;
  /** frameBodyWorld(viewTime) + (body(t) − frameBody(t)), km. */
  world: Vec3;
  /** The body's SOI radius, km. */
  soiRadius: number;
}

/** Ghosts of the bodies the given ships enter after `viewTime`, in the frame of `frameBodyId`. */
export function encounterGhosts(
  world: World,
  shipIds: readonly ShipId[],
  frameBodyId: BodyId,
  viewTime: number,
): EncounterGhost[] {
  const out: EncounterGhost[] = [];
  const base = bodyWorldState(world.system, frameBodyId, viewTime).r;
  for (const shipId of shipIds) {
    for (const seg of world.derived.trajectories[shipId]?.segments ?? []) {
      if (seg.endEvent !== 'soi-enter' || !seg.endTargetId || seg.tEnd <= viewTime) continue;
      const rel = bodyStateIn(world.system, seg.endTargetId, frameBodyId, seg.tEnd).r;
      out.push({
        shipId,
        bodyId: seg.endTargetId,
        t: seg.tEnd,
        world: add(base, rel),
        soiRadius: soiRadiusOf(getBody(world.system, seg.endTargetId)),
      });
    }
  }
  return out;
}

/**
 * The ships whose encounters are drawn (S5b-13): the selected (or the selected node's), hovered,
 * focused and active ships that are drawn, without repeats.
 */
export function encounterShips(
  drawn: readonly ShipId[],
  view: {
    focus: MapObjectRef;
    selected: MapObjectRef | null;
    hovered: MapObjectRef | null;
    activeShipId: ShipId | null;
  },
): ShipId[] {
  const nodeShip = view.selected?.kind === 'node' ? view.selected.shipId : null;
  return drawn.filter((id) => {
    const ref: MapObjectRef = { kind: 'ship', id };
    return (
      id === nodeShip ||
      id === view.activeShipId ||
      sameRef(view.selected, ref) ||
      sameRef(view.hovered, ref) ||
      sameRef(view.focus, ref)
    );
  });
}
