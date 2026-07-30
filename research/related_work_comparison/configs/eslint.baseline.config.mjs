// Tool 1 probe: ESLint core + typescript-eslint (no Sonar, no React plugins).
// Purpose: establish what the BASELINE ecosystem tool reports on its own.
//   - `complexity` is ESLint core's cyclomatic rule, threshold 0 so every
//     function reports (we want the metric, not violations).
//   - No eslint-plugin-react / react-hooks is installed on purpose: the
//     question is what typescript-eslint alone knows about React.
import tseslint from 'typescript-eslint';

export default [
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true }, // required for .tsx
      },
    },
    rules: {
      // threshold 1 is the lowest the schema accepts (0 is rejected:
      // "Value 0 should be >= 1"), so every function with complexity >= 1
      // reports -- i.e. every function.
      complexity: ['warn', 1],
      'max-depth': ['warn', 1],
    },
  },
];
