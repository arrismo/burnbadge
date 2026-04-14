import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';

const styleRules = {
  indent: ['error', 2, { SwitchCase: 1 }],
  semi: ['error', 'always'],
  'max-len': ['error', 100],
  'comma-dangle': ['error', 'always-multiline'],
};

const tsRecommended = tsPlugin.configs['flat/recommended'];

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    ...js.configs.recommended,
    files: ['**/*.{js,mjs,cjs}'],
    rules: {
      ...js.configs.recommended.rules,
      ...styleRules,
    },
  },
  ...tsRecommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      ...styleRules,
    },
  },
];
