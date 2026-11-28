import { ancestors, type BodyId } from '../../sim/body';
import { shipBodyAt, type World } from '../../sim/world';
import type { FocusRef, MapObjectRef } from '../../store/useView';

/** The body a ref stands for in Frame ▾: a body itself, or a ship's (or node's) parent at t. */
function bodyOfRef(world: World, ref: MapObjectRef, t: number): BodyId {
  if (ref.kind === 'body') return ref.id;
  return shipBodyAt(world, ref.kind === 'ship' ? ref.id : ref.shipId, t);
}

/**
 * The bodies Frame ▾ offers (S5b-4 in planning/sprint-5b.md): the focus body (a focused ship's
 * parent) and each of its parents up to the root, then the selected body (a selected ship's or
 * node's parent), if it isn't already listed.
 */
export function frameOptions(
  world: World,
  focus: FocusRef,
  selected: MapObjectRef | null,
  t: number,
): BodyId[] {
  const focusBody = bodyOfRef(world, focus, t);
  const out = [focusBody, ...ancestors(world.system, focusBody)];
  if (selected) {
    const b = bodyOfRef(world, selected, t);
    if (!out.includes(b)) out.push(b);
  }
  return out;
}
