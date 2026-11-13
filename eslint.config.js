import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** `import` patterns a layer may not use (PLAN §5: features → ui, state, domain, lib · …). */
const layer = (...names) =>
  names.flatMap((name) => [`@/${name}`, `@/${name}/*`, `**/${name}/*`]);
const REACT = ['react', 'react-dom', 'react-dom/*', 'react-router', 'zustand', 'lucide-react'];

function restrictImports(files, patterns, message) {
  return {
    files,
    ignores: ['**/*.test.{ts,tsx}', 'src/test/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }] },
  };
}

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  // Dependency rule (PLAN §5). Tests may import anything to set up their data.
  restrictImports(
    ['src/domain/**'],
    [...layer('data', 'state', 'ui', 'features', 'lib'), ...REACT],
    'domain/ es lógica pura: no importa otras capas ni React.',
  ),
  restrictImports(
    ['src/data/**'],
    [...layer('state', 'ui', 'features', 'lib'), ...REACT],
    'data/ solo depende de domain/.',
  ),
  restrictImports(
    ['src/state/**'],
    layer('ui', 'features', 'lib'),
    'state/ solo depende de data/ y domain/.',
  ),
  restrictImports(
    ['src/lib/**'],
    [...layer('data', 'state', 'ui', 'features'), ...REACT],
    'lib/ son utilidades puras (puede usar tipos y textos de domain/).',
  ),
  restrictImports(
    ['src/ui/**'],
    layer('data', 'state', 'domain', 'features', 'lib'),
    'ui/ es el kit visual: sin lógica de negocio ni estado de la app.',
  ),
  restrictImports(
    ['src/features/**'],
    layer('data'),
    'features/ usa los datos a través de state/ (p. ej. state/backup.ts).',
  ),
  {
    // "Today" always comes in as a parameter; only dates.ts builds Date objects explicitly.
    files: ['src/domain/**/*.ts'],
    ignores: ['**/*.test.ts', 'src/domain/dates.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'domain/ no persiste nada.' },
        { name: 'sessionStorage', message: 'domain/ no persiste nada.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'domain/ no lee el reloj ni crea fechas: usa dates.ts y recibe `today`.',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'domain/ no lee el reloj: recibe `today` como parámetro.',
        },
      ],
    },
  },
);
