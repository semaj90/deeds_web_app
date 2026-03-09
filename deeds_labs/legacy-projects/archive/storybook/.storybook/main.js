import { sveltekit } from '@storybook/sveltekit';

const config = {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx|svelte)'],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-svelte-csf',
  ],
  framework: {
    name: '@storybook/sveltekit',
    options: {},
  },
  core: {
    disableTelemetry: true,
  },
};

export default config;
