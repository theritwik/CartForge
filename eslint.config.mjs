import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

const webFiles = ['apps/web/**/*.{ts,tsx}'];
const scopeToWeb = (configs) => configs.map((config) => ({ ...config, files: webFiles }));

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/.next/',
    '**/.next-e2e/',
    'e2e/test-results/',
    'e2e/playwright-report/',
    '**/next-env.d.ts',
    'packages/db/src/generated/',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  ...scopeToWeb(nextCoreWebVitals),
  ...scopeToWeb(nextTypescript),
  {
    files: webFiles,
    settings: { next: { rootDir: 'apps/web' } },
  },
  prettier,
]);
