import eslint from '@eslint/js';
import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '.angular/**',
      'build/**',
      'coverage/**',
      'dist/**',
      'node_modules/**',
      'public/wasm/**',
    ],
  },
  {
    files: ['**/*.js'],
    extends: [eslint.configs.recommended],
    rules: {
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/no-inferrable-types': 'off',
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['assembly/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': 'off',
      eqeqeq: 'off',
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
);
