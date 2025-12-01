import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

const tsconfigRootDir = new URL('.', import.meta.url).pathname;

const tsRecommended = tseslint.configs['flat/recommended'];
const tsTypeChecked = tseslint.configs['flat/recommended-type-checked'];

export default [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      'sweph/**',
      'dist/**',
      'bun.lock',
      '**/*.d.ts',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
        sourceType: 'module',
        ecmaVersion: 'latest',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...(tsRecommended[1]?.rules ?? {}),
      ...(tsRecommended[2]?.rules ?? {}),
      ...(tsTypeChecked[1]?.rules ?? {}),
      ...(tsTypeChecked[2]?.rules ?? {}),
      'no-console': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
];
