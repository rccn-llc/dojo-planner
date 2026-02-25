import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  // Files to exclude from Knip analysis
  ignore: [
    'checkly.config.ts',
    'src/components/ui/**',
    'src/features/landing/LogoCloud.tsx',
    'src/libs/I18n.ts',
    'src/templates/**', // Template files export types for consumption by other components
    'src/types/Auth.ts',
    'src/types/I18n.ts',
    'src/types/Table.ts',
    'src/utils/Helpers.ts',
    'tests/**/*.ts',
    '.storybook/vitest.setup.ts', // Knip false positive with vitest setupFiles
    '.storybook/vitest.config.mts', // Knip false positive with vitest setupFiles
  ],
  // Dependencies to ignore during analysis
  ignoreDependencies: [
    '@clerk/testing',
    '@commitlint/types',
    '@clerk/types',
    '@semantic-release/npm',
    '@swc/helpers',
    'conventional-changelog-conventionalcommits',
    '@dojo-planner/iqpro-client',
    'vite',
  ],
  // Binaries to ignore during analysis
  ignoreBinaries: [
    'production', // False positive raised with dotenv-cli
    'stripe', // False positive
  ],
  compilers: {
    css: (text: string) => [...text.matchAll(/(?<=@)import[^;]+/g)].join('\n'),
  },
};

export default config;
