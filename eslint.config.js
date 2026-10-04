import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/lib/**', '.firebase/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['functions/**/*.ts', 'shared/**/*.ts', '*.js', '*.config.ts'],
    languageOptions: { globals: globals.node },
  },
);
