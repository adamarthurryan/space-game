// The smoke test types a TLI found by gen/lunarMission.ts (decision S4-19 in
// planning/sprint-4.md). The constants are copied into maneuvers.mjs, which can't import
// TypeScript; this keeps the copy in step with SMOKE_TLI (whose value
// src/gen/lunarMission.test.ts checks against the scan).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(here, path), 'utf8');
const tli = (text: string, pattern: RegExp) => {
  const m = pattern.exec(text);
  return m ? { dt: Number(m[1]), dv: Number(m[2]) } : null;
};

describe('the smoke test’s TLI', () => {
  for (const file of ['maneuvers.mjs', 'timeline.mjs']) {
    it(`in ${file} matches SMOKE_TLI in src/gen/lunarMission.ts`, () => {
      const smoke = tli(read(file), /const TLI = \{ dt: ([\d.]+), dv: ([\d.]+) \}/);
      const source = tli(
        read('../../src/gen/lunarMission.ts'),
        /SMOKE_TLI = \{ dt: ([\d.]+), dv: ([\d.]+) \}/,
      );
      expect(smoke).not.toBeNull();
      expect(smoke).toEqual(source);
    });
  }
});
