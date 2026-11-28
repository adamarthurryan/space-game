import { resolveActiveShip, shipOf } from '../../store/useView';

/** What the Fly button shows (S5b-7). */
export type FlyState =
  | { kind: 'fly'; shipId: string; name: string }
  | { kind: 'active'; name: string }
  | { kind: 'idle'; name: string | null };

/**
 * The Fly button's state (S5b-7 in planning/sprint-5b.md): "Fly Kestrel (A)" with a coasting ship
 * selected that isn't active; "★ Kestrel", pressed, with the active ship (or its node) selected;
 * otherwise the active ship's name, or "No active ship", disabled.
 */
export function flyState(
  world: { ships: Record<string, { name: string; status: string }> },
  selected: Parameters<typeof shipOf>[0],
  activeShipId: string | null,
): FlyState {
  const active = resolveActiveShip(world, activeShipId);
  const sel = shipOf(selected);
  const ship = sel !== null ? world.ships[sel] : undefined;
  if (sel !== null && ship?.status === 'coasting') {
    return sel === active
      ? { kind: 'active', name: ship.name }
      : { kind: 'fly', shipId: sel, name: ship.name };
  }
  return { kind: 'idle', name: active !== null ? (world.ships[active]?.name ?? null) : null };
}
