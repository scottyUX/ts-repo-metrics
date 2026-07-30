// Tool 2 probe (FREE TIER ONLY): eslint-plugin-sonarjs.
// This is the open-source ESLint plugin, NOT SonarQube/SonarCloud's full
// analyzer. cognitive-complexity threshold 0 so every function reports its
// score rather than only threshold violations.
// NOTE: deliberately NOT using type-aware parsing here (no `project`), because
// the corpus repos' node_modules are not installed. Sonar rules that require
// type information are therefore not exercised -- see ambiguities.md.
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
      'sonarjs/cognitive-complexity': ['warn', 0],
    },
  },
];
