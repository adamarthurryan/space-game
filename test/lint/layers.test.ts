// Proves that the layer and determinism lint rules fire (planning/sprint-0.md, "Lint rules").
// The code is linted in memory with lintText, so the bad files never exist on disk.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const eslint = new ESLint({ cwd: root });

const LAYER = 'boundaries/dependencies';
const UNKNOWN_FILE = 'boundaries/no-unknown-files';
const RESTRICTED_IMPORT = 'no-restricted-imports';
const RESTRICTED_PROPERTY = 'no-restricted-properties';
const RESTRICTED_SYNTAX = 'no-restricted-syntax';

async function ruleIds(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: resolve(root, filePath) });
  if (!result) throw new Error('ESLint returned no result');
  return result.messages.map((m) => m.ruleId ?? `(fatal) ${m.message}`).sort();
}

/**
 * Boundaries ignores imports it can't resolve, so a case whose target doesn't exist would pass
 * without testing anything. Each relative import target must exist.
 */
function expectTargetExists(fromFile: string, specifier: string): void {
  const base = resolve(root, dirname(fromFile), specifier);
  const found = ['.ts', '.tsx'].some((ext) => existsSync(base + ext));
  expect(found, `import target ${specifier} from ${fromFile} must exist`).toBe(true);
}

interface Case {
  file: string;
  code: string;
  expected: string[];
  /** The relative import in `code`, if any, whose target must exist. */
  target?: string;
}

const cases: Case[] = [
  {
    file: 'src/math/bad.ts',
    code: "import { useView } from '../store/useView';\nexport const x = useView;\n",
    target: '../store/useView',
    expected: [LAYER],
  },
  {
    file: 'src/math/bad.ts',
    code: "import * as THREE from 'three';\nexport const x = THREE;\n",
    expected: [RESTRICTED_IMPORT],
  },
  {
    file: 'src/math/bad.ts',
    code: "import { useState } from 'react';\nexport const x = useState;\n",
    expected: [RESTRICTED_IMPORT],
  },
  {
    file: 'src/math/bad.ts',
    code: 'export const x = Math.random();\n',
    expected: [RESTRICTED_PROPERTY],
  },
  {
    file: 'src/math/bad.ts',
    code: 'export const x = Date.now();\n',
    expected: [RESTRICTED_PROPERTY],
  },
  {
    file: 'src/math/bad.ts',
    code: 'export const x = new Date();\n',
    expected: [RESTRICTED_SYNTAX],
  },
  {
    file: 'src/render/bad.tsx',
    code: "import { AppShell } from '../ui/layout/AppShell';\nexport const x = AppShell;\n",
    target: '../ui/layout/AppShell',
    expected: [LAYER],
  },
  {
    file: 'src/ui/ok.tsx',
    code: "import { Scene } from '../render/Scene';\nexport const x = Scene;\n",
    target: '../render/Scene',
    expected: [],
  },
  {
    file: 'src/render/ok.tsx',
    code: "import { useView } from '../store/useView';\nexport const x = useView;\n",
    target: '../store/useView',
    expected: [],
  },
  {
    file: 'src/render/ok.tsx',
    code: 'export const x = Math.random();\n',
    expected: [],
  },
  // Sprint 1: the layers below sim (planning/sprint-1.md, "Lint rules").
  {
    file: 'src/orbital/bad.ts',
    code: "import { getBody } from '../sim/body';\nexport const x = getBody;\n",
    target: '../sim/body',
    expected: [LAYER],
  },
  {
    file: 'src/sim/bad.ts',
    code: "import { generateRealSystem } from '../gen/realSystem';\nexport const x = generateRealSystem;\n",
    target: '../gen/realSystem',
    expected: [LAYER],
  },
  {
    file: 'src/orbital/bad.ts',
    code: 'export const x = Math.random();\n',
    expected: [RESTRICTED_PROPERTY],
  },
  {
    file: 'src/sim/ok.ts',
    code: "import { propagate } from '../orbital/propagate';\nexport const x = propagate;\n",
    target: '../orbital/propagate',
    expected: [],
  },
  {
    file: 'src/gen/ok.ts',
    code: "import { buildBodySystem } from '../sim/body';\nexport const x = buildBodySystem;\n",
    target: '../sim/body',
    expected: [],
  },
  {
    file: 'src/orbital/ok.ts',
    code: "import { brent } from '../math/roots';\nexport const x = brent;\n",
    target: '../math/roots',
    expected: [],
  },
  // Sprint 2 (planning/sprint-2.md, "Lint rules").
  {
    file: 'src/sim/bad.ts',
    code: "import { useWorld } from '../store/useWorld';\nexport const x = useWorld;\n",
    target: '../store/useWorld',
    expected: [LAYER],
  },
  {
    file: 'src/sim/bad.ts',
    code: 'export const x = performance.now();\n',
    expected: [RESTRICTED_PROPERTY],
  },
  {
    file: 'src/store/ok.ts',
    code: "import { createSandboxWorld } from '../gen/scenario';\nexport const x = createSandboxWorld;\n",
    target: '../gen/scenario',
    expected: [],
  },
  {
    file: 'src/render/bad.ts',
    code: "import { formatDistance } from '../ui/format';\nexport const x = formatDistance;\n",
    target: '../ui/format',
    expected: [LAYER],
  },
  {
    file: 'src/render/ok.ts',
    code: "import { bodyOrder } from '../sim/body';\nexport const x = bodyOrder;\n",
    target: '../sim/body',
    expected: [],
  },
  {
    file: 'src/ui/ok.ts',
    code: "import { pick } from '../render/picking';\nexport const x = pick;\n",
    target: '../render/picking',
    expected: [],
  },
  // Sprint 3 (planning/sprint-3.md, "Lint rules").
  {
    file: 'src/content/bad.ts',
    code: "import { G0 } from '../math/units';\nexport const x = G0;\n",
    target: '../math/units',
    expected: [LAYER],
  },
  {
    file: 'src/sim/bad.ts',
    code: "import { spawnShip } from '../game/actions';\nexport const x = spawnShip;\n",
    target: '../game/actions',
    expected: [LAYER],
  },
  {
    file: 'src/game/bad.ts',
    code: "import { useWorld } from '../store/useWorld';\nexport const x = useWorld;\n",
    target: '../store/useWorld',
    expected: [LAYER],
  },
  {
    file: 'src/game/bad.ts',
    code: 'export const x = Date.now();\n',
    expected: [RESTRICTED_PROPERTY],
  },
  {
    file: 'src/sim/ok.ts',
    code: "import { registry } from '../content/registry';\nexport const x = registry;\n",
    target: '../content/registry',
    expected: [],
  },
  {
    file: 'src/store/ok.ts',
    code: "import { spawnShip } from '../game/actions';\nexport const x = spawnShip;\n",
    target: '../game/actions',
    expected: [],
  },
  // Sprint 4 (planning/sprint-4.md, "Lint rules").
  {
    file: 'src/orbital/bad.ts',
    code: "import { applyNode } from '../sim/maneuver';\nexport const x = applyNode;\n",
    target: '../sim/maneuver',
    expected: [LAYER],
  },
  {
    file: 'src/sim/bad.ts',
    code: "import { useView } from '../store/useView';\nexport const x = useView;\n",
    target: '../store/useView',
    expected: [LAYER],
  },
  {
    file: 'src/sim/bad.ts',
    code: "import { Raycaster } from 'three';\nexport const x = Raycaster;\n",
    expected: [RESTRICTED_IMPORT],
  },
  {
    file: 'src/game/ok.ts',
    code: "import { planBudget } from '../sim/maneuver';\nexport const x = planBudget;\n",
    target: '../sim/maneuver',
    expected: [],
  },
  // Sprint 5: warp-to and upcoming events (S5-2 to S5-5).
  {
    file: 'src/sim/bad.ts',
    code: "import { warpToNode } from '../game/actions';\nexport const x = warpToNode;\n",
    target: '../game/actions',
    expected: [LAYER],
  },
  {
    file: 'src/game/ok.ts',
    code: "import { nextWarpStop } from '../sim/upcoming';\nexport const x = nextWarpStop;\n",
    target: '../sim/upcoming',
    expected: [],
  },
  {
    file: 'src/ui/ok.ts',
    code: "import { upcomingEvents } from '../sim/upcoming';\nexport const x = upcomingEvents;\n",
    target: '../sim/upcoming',
    expected: [],
  },
  {
    file: 'src/render/ok.ts',
    code: "import { useWorld } from '../store/useWorld';\nexport const x = useWorld;\n",
    target: '../store/useWorld',
    expected: [],
  },
  // Sprint 5b: the apsides predicate is shared below the UI; the reference frame and the active
  // ship are view state, which must not reach game/ (S5b-1 to S5b-9, S5b-18, S5b-20).
  {
    file: 'src/render/ok.ts',
    code: "import { hasApsides } from '../orbital/passages';\nexport const x = hasApsides;\n",
    target: '../orbital/passages',
    expected: [],
  },
  {
    file: 'src/game/ok.ts',
    code: "import { hasApsides } from '../orbital/passages';\nexport const x = hasApsides;\n",
    target: '../orbital/passages',
    expected: [],
  },
  {
    file: 'src/render/bad.ts',
    code: "import { formatDv } from '../ui/format';\nexport const x = formatDv;\n",
    target: '../ui/format',
    expected: [LAYER],
  },
  {
    file: 'src/game/bad.ts',
    code: "import { useView } from '../store/useView';\nexport const x = useView;\n",
    target: '../store/useView',
    expected: [LAYER],
  },
  {
    file: 'src/misc/bad.ts',
    code: 'export const x = 1;\n',
    expected: [UNKNOWN_FILE],
  },
];

// The first case cold-starts ESLint, which can pass 5 s while the other test files run.
describe('layer and determinism lint rules', { timeout: 30_000 }, () => {
  for (const c of cases) {
    const firstLine = c.code.split('\n')[0];
    const verdict = c.expected.length ? c.expected.join(', ') : 'no errors';
    it(`${c.file}: ${firstLine} → ${verdict}`, async () => {
      if (c.target) expectTargetExists(c.file, c.target);
      expect(await ruleIds(c.file, c.code)).toEqual([...c.expected].sort());
    });
  }

  // Becomes active when sprint 0 step 3 adds math/vec3.ts.
  it.skipIf(!existsSync(resolve(root, 'src/math/vec3.ts')))(
    "src/store/ok.ts: import { vec3 } from '../math/vec3' → no errors",
    async () => {
      const code = "import { vec3 } from '../math/vec3';\nexport const x = vec3;\n";
      expect(await ruleIds('src/store/ok.ts', code)).toEqual([]);
    },
  );
});
