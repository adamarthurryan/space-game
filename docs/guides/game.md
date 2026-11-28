# Guide to the `game/` layer

`src/game/` holds the player's actions and the rules that govern them. **Every change a player makes to the world goes through `game/actions.ts`**: spawning a ship, adding, editing, snapping or deleting a maneuver node, pausing, changing warp, setting Pause on, and warping to a node or event. `sim/` provides the mechanisms; `game/` decides what is allowed. It imports `math/`, `orbital/`, `sim/` and `content/` (the layer rules would also allow `gen/`). Actions that change the world are called only through `store/useWorld.ts`; the read-only queries (`addApsisRefusal`, `snapRefusal`, `pathWithout`) are also imported directly by `ui/panels/` and `render/NodeGizmo.ts`.

This guide describes the code as it stands after milestone 1, sprint 5b. The rule is set out in [architecture.md](../architecture.md) ("Rules that span layers live in `game/actions.ts`"); the rules themselves are in [features.md](../features.md). The code cites decisions as `S<sprint>-<n>` (S3-12 is decision 12 of `planning/sprint-3.md`).

## 1. Architecture

```
ui/ and render/input ──▶ store/useWorld  act(w => actions.X(w, …)) ──▶ game/actions.ts ──▶ sim/
                              │  bumps `version` if result.ok                │ checks rules
                              ◀──────────────── ActionResult ────────────────┘ then mutates
```

`game/` has one source file today, `actions.ts`. `architecture.md` plans `progression.ts`, `scenario.ts` (goals and failure checks during a scenario) and `rules.ts` for later milestones. Note the split with `gen/scenario.ts`, which *builds* the starting world, while `game/scenario.ts` will hold the rules that run *during* it.

### The action contract

Every action is a plain function:

```ts
(world: World, ...args) => ActionResult<T>
type ActionResult<T = void> = { ok: true; value: T } | { ok: false; error: string };
```

- **Check, then change.** An action checks everything first, and changes the world only if every check passes. A refused action leaves the world unchanged, and the tests check that for each refusal.
- **The error is for the player.** `error` is a short sentence the UI can show as it is ("The node must be in the future", "Circular orbit"). The node editor shows it under the field; the warp-to buttons use it as their tooltip.
- **Mutate in place, then refresh.** Actions mutate the world's plain data and call `refreshShip` (or `addShip`) so the trajectory and the event queue follow. They never bump a version themselves; the store does that on `ok`.
- **No React, no store.** Actions take the world as an argument. Tests call them directly on `createSandboxWorld()`.

## 2. Common patterns

- **Rules here, mechanisms in `sim/`.** For example, `sim/` lets a plan have any nodes, and `computeTrajectory` applies whatever it is given. `addNode` adds the rules: at most `MAX_NODES`, at least `MIN_NODE_LEAD` in the future, not within `MIN_NODE_SEPARATION` of another node, each Δv component at most `MAX_NODE_DV_COMPONENT` (50 km/s), and not past the end of the trajectory or at or after an impact.
- **Small guards shared across actions.** `plannable(world, shipId)` returns the ship or a failure (unknown, or destroyed); `checkTime` and `checkDv` return an error string or `null`. Actions chain them: `checkTime(…) ?? checkDv(…)`.
- **Refusal queries for the UI.** Where a menu item should be disabled before it is clicked, the action has a sibling query that returns the reason or `null`: `addApsisRefusal` for "Add node ▾ → At next Pe/Ap", and `snapRefusal` for the snap buttons. The action itself refuses with the same reason, so the menu and the action can't disagree.
- **Searching the planned path.** Passage-based actions work on the ship's current trajectory segments, segment by segment, with `orbital/passages.ts`'s closed-form times. They start after the last enabled node that is reached, or after now (`addNodeFrom`), so "At next Ap" after a burn means the apoapsis of the orbit after the burn.
- **Wrapping clock functions.** The clock actions are thin wrappers over `sim/clock.ts` (`setPaused`, `warpUp`, `startWarpTo`, …) that give them the action contract.

## 3. Core functions

### Clock

- `togglePause`, `warpUp`, `warpDown`, `setWarpIndex(i)` (refuses a non-finite step).
- `setPauseOn(type | 'all', on)`: which events pause the clock (S4-7).

### Ships

- **`spawnShip(world, { designId, name?, orbit })`** returns `ActionResult<ShipId>`. It refuses an unknown design or body, a minor body as parent (no SOI), a non-finite state, and a start outside the parent's SOI. The ship gets `ship-<seq>` and, without a name, `<Design> <seq>`.

### Maneuver nodes (S4-1, S4-15 to S4-18)

- **`addNode(world, shipId, { t, dv? })`** returns the new `NodeId` (`node-<n>`, numbered across ships) and keeps the plan sorted.
- **`addNodeAt(world, shipId, at)`**: `at` is a `PassageKind` (`'periapsis' | 'apoapsis' | 'ascending-node' | 'descending-node'`) or `{ t }`. It finds the next passage on the planned path after the last reached node. Nodes are measured against the parent's equator, or the ecliptic when the parent has no pole. Pe and Ap are refused on a circular orbit (`CIRCULAR_ORBIT`, S5b-20).
- **`editNode(world, shipId, nodeId, { t?, dv?, enabled? })`**: `dv` is a partial, merged into the node's. It refuses to edit a node about to execute (within `MIN_NODE_LEAD`) and re-sorts the plan.
- `deleteNode(world, shipId, nodeId)`.
- **`snapNode(world, shipId, nodeId, 'periapsis' | 'apoapsis')`**: moves the node to the nearest Pe or Ap of the path it sits on, which is the path *without* the node (`pathWithout`). It considers the nearest passage, earlier or later, and the next one, keeps those on the same segment and in the future, and takes the closest.
- `pathWithout(world, ship, nodeId)`: the trajectory with one node left out. `render/NodeGizmo.ts` uses it too, to slide a node along its path during a time drag.
- `addApsisRefusal(world, shipId, kind)` and `snapRefusal(world, shipId, nodeId)`: the refusal queries above.

### Warp-to (S5-3 to S5-5)

- **`warpToNode(world, shipId, nodeId)`**: starts a warp-to that stops `WARP_TO_NODE_LEAD` (60 s) before the node, paused, so the node can still be edited. It refuses a disabled or unreached node, or one less than a minute away.
- **`warpToNextEvent(world, shipId | null)`** returns the `UpcomingEvent` it is heading for. With a ship, its next event; with `null`, the earliest event of any ship. A node stops a minute before; any other event stops just after it is handled. It refuses when there are none.
- `cancelWarpTo(world)`: refuses when no warp-to is running.

## 4. Testing

Tests run the actions on `createSandboxWorld()` and check both outcomes:

- `actions.test.ts`: spawning (the new ship gets a trajectory and one queued event) and each refusal leaving the world unchanged; the clock actions.
- `nodeActions.test.ts`: numbering across ships, sorting, clashes, nodes after an impact, a full plan, re-sorting on edit, nodes about to execute, deletion, `addNodeAt` at each passage kind (including an escape's apoapsis in the Sun's frame), circular-orbit refusals, snapping, and `setPauseOn`.
- `timeActions.test.ts`: warp to node and to next event, stepping through a trans-lunar injection (before the node, then exactly at the Moon SOI entry), and every refusal.
- `lunarFlight.test.ts`: the acceptance test of sprint 4. It flies a trans-lunar injection and a lunar orbit insertion through the actions and checks that they execute as predicted.

## 5. Recipes

**A new player action:**

1. Write `export function doThing(world: World, …): ActionResult<T>` in `actions.ts`. Check everything first, using `plannable` and the other guards, and return `fail('A sentence for the player')` on refusal.
2. Mutate the world's plain data, then call `refreshShip(world, id)` for each ship whose orbit, plan, propellant or status changed.
3. Add a wrapper to `store/useWorld.ts`: `doThing: (…) => act((w) => actions.doThing(w, …))`.
4. Test the success and every refusal, including that a refusal changes nothing.

**A menu item that may be unavailable:** write a `…Refusal(world, …)` query that returns the reason or `null`, use it in the action's own refusal, and have the UI call it to disable the item with the reason as its title.

**A new rule on an existing action:** add the check to the action (or to a shared guard such as `checkTime`), with a refusal test. Don't move the check into `sim/`, which must stay a mechanism usable without the rules.
