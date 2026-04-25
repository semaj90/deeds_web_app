import '../src/lib/components/yorha/ps1.css';

export const parameters = {
  actions: { argTypesRegex: '^on[A-Z].*' },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
  backgrounds: {
    default: 'dark',
    values: [
      {
        name: 'dark',
        value: '#0a0a0a',
      },
      {
        name: 'light',
        value: '#ffffff',
      },
    ],
  },
};
