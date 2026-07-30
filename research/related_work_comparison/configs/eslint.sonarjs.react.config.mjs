// Tool 2 probe, React-specific subset of the FREE eslint-plugin-sonarjs tier.
// Enumerating the plugin's rule names showed exactly three React/hook-aware
// rules, so this config exercises them directly against the .tsx corpus
// instead of inferring support from the rule list.
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

export default [
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    plugins: { sonarjs },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'sonarjs/jsx-no-leaked-render': 'warn',
      'sonarjs/no-hook-setter-in-body': 'warn',
      'sonarjs/no-useless-react-setstate': 'warn',
    },
  },
];
