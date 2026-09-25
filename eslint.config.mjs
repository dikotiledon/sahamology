// Minimal ESLint flat config for the Sahamology migration.
// Next 16 removed `next lint`; this keeps a working `npm run lint` gate with
// TypeScript-aware parsing and a conservative rule set (no stylistic noise).

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      '**/*.mjs',
      '**/*.example',
      'scripts/run-migrations.js',
      'scripts/start-standalone.js',
      // Built extension artifact — lint only the .example sources.
      'stockbit-token-extension/dist/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  }
);
