import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/lib/**', '.firebase/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Firestore should keep rejecting `undefined` fields rather than silently dropping them. Do not remove this rule.
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
