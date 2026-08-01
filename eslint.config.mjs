import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import antfu from '@antfu/eslint-config';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import playwright from 'eslint-plugin-playwright';
import storybook from 'eslint-plugin-storybook';
import tailwind from 'eslint-plugin-tailwindcss';

export default antfu(
  {
    react: true,
    nextjs: true,
    typescript: true,

    // Configuration preferences
    lessOpinionated: true,
    isInEditor: false,

    // Code style
    stylistic: {
      semi: true,
    },

    // Format settings
    formatters: {
      css: true,
    },

    // Ignored paths
    ignores: [
      'migrations/**/*',
    ],
  },
  // --- Accessibility Rules ---
  jsxA11y.flatConfigs.recommended,
  // --- Tailwind CSS Rules ---
  // Note: v4 exports a single flat-config object as `configs.recommended`
  // (the former `configs['flat/recommended']` array was removed), and it
  // carries its own `files` scoping — so the settings must live on the same
  // config object rather than in a separate unscoped one.
  {
    ...tailwind.configs.recommended,
    settings: {
      tailwindcss: {
        cssConfigPath: `${dirname(fileURLToPath(import.meta.url))}/src/styles/global.css`,
      },
    },
  },
  // `cn(...inputs: ClassValue[])` in src/utils/Helpers.ts forwards its rest
  // parameter to clsx. The plugin parses clsx arguments and reads the
  // identifier `inputs` as a literal class name, which it is not.
  {
    files: ['src/utils/Helpers.ts'],
    rules: {
      'tailwindcss/no-custom-classname': 'off',
    },
  },
  // --- E2E Testing Rules ---
  {
    files: [
      '**/*.spec.ts',
      '**/*.e2e.ts',
    ],
    ...playwright.configs['flat/recommended'],
  },
  // --- Storybook Rules ---
  ...storybook.configs['flat/recommended'],
  // --- Custom Rule Overrides ---
  {
    rules: {
      'antfu/no-top-level-await': 'off', // Allow top-level await
      'style/brace-style': ['error', '1tbs'], // Use the default brace style
      'ts/consistent-type-definitions': ['error', 'type'], // Use `type` instead of `interface`
      'react/prefer-destructuring-assignment': 'off', // Vscode doesn't support automatically destructuring, it's a pain to add a new variable
      'react-hooks/incompatible-library': 'off', // Disable warning for compilation skipped
      'react/no-implicit-key': 'off', // Requires type-aware linting not available for all files
      'node/prefer-global/process': 'off', // Allow using `process.env`
      'test/padding-around-all': 'error', // Add padding in test files
      'test/prefer-lowercase-title': 'off', // Allow using uppercase titles in test titles
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }], // Allow info for development logging
    },
  },
  // --- Test Fixture Rules ---
  {
    files: ['**/tests/fixtures.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off', // Playwright fixtures use use() which is not a React Hook
    },
  },
);
