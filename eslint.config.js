// ESLint flat config. The layer and determinism rules here enforce the dependency rule in
// docs/architecture.md (decisions S0-1 and S0-4 in planning/sprint-0.md).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

/** Layers, lowest first. A layer may import only the layers before it in this list (S0-1). */
const LAYERS = [
  'math',
  'orbital',
  'sim',
  'planning',
  'knowledge',
  'economy',
  'gen',
  'game',
  'store',
  'render',
  'ui',
];

/** Layers below `store/`, plus `content/`: no frameworks, no nondeterminism. */
const PURE_FOLDERS = [
  'math',
  'orbital',
  'sim',
  'planning',
  'knowledge',
  'economy',
  'gen',
  'game',
  'content',
];
const PURE_FILES = PURE_FOLDERS.map((f) => `src/${f}/**/*.{ts,tsx}`);

const DEPENDENCY_RULE = 'see "Dependency rule" in docs/architecture.md';

const layerPolicies = LAYERS.map((layer, i) => ({
  from: { element: { type: layer } },
  allow: { to: { element: { types: [...LAYERS.slice(0, i), 'content'] } } },
}));

export default defineConfig(
  globalIgnores(['dist', 'coverage', 'test/smoke/out']),

  // 1. Base rule sets
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
  },
  {
    files: ['**/*.tsx'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
  },
  {
    files: ['*.{js,ts}', 'test/**/*.{ts,mjs}'],
    languageOptions: { globals: globals.node },
  },

  // 2. Layer rule
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { node: { extensions: ['.ts', '.tsx', '.js'] } },
      'boundaries/elements': [
        ...LAYERS.map((layer) => ({ type: layer, pattern: `src/${layer}`, partialMatch: false })),
        { type: 'content', pattern: 'src/content', partialMatch: false },
      ],
      // The entry point may import anything, so it's left out of the layer rules.
      'boundaries/ignore': ['src/main.tsx'],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          message: `{{ from.element.types.[0] }} may not import {{ to.element.types.[0] }}: ${DEPENDENCY_RULE}`,
          policies: layerPolicies,
        },
      ],
      'boundaries/no-unknown-files': 'error',
    },
  },

  // 3 and 4. Below store/: no frameworks, no nondeterminism (S0-4)
  {
    files: PURE_FILES,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-dom',
                'react/*',
                'three',
                'three/*',
                '@react-three/*',
                'zustand',
              ],
              message: `Framework imports are not allowed below store/: ${DEPENDENCY_RULE}`,
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use math/rng.ts, seeded from the world.' },
        { object: 'Date', property: 'now', message: 'Sim time comes from the clock.' },
        { object: 'performance', property: 'now', message: 'Sim time comes from the clock.' },
        {
          object: 'crypto',
          property: 'getRandomValues',
          message: 'Use math/rng.ts, seeded from the world.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'Sim time comes from the clock.',
        },
        {
          selector: "CallExpression[callee.name='Date']",
          message: 'Sim time comes from the clock.',
        },
      ],
    },
  },

  prettier,
);
