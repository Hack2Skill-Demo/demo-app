import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/lib/**', '.firebase/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Part of the baseline, never a fault: Firestore must keep rejecting `undefined` fields, so a fix that
    // switches ignoreUndefinedProperties on globally has to fail `pnpm run verify`. Do not remove this rule.
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Identifier[name='ignoreUndefinedProperties'], Literal[value='ignoreUndefinedProperties']",
          message: 'ignoreUndefinedProperties is banned. Leave an undefined field out of the document instead.',
        },
      ],
    },
  },
  {
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['functions/**/*.{ts,mjs}', 'pdf-renderer/**/*.ts', 'shared/**/*.ts', '*.js', '*.config.ts'],
    languageOptions: { globals: globals.node },
  },
);
