// Flat ESLint config. Two jobs: catch real bugs (error) and nudge style (warn).
// The factory gate runs `npm run lint`, which fails on errors only, so warnings
// are a to-do list on 6k lines that were written before the linter existed.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier/flat'
import globals from 'globals'

/**
 * RTL guard. The UI is Arabic-first, so physical directions in inline styles
 * silently break the mirrored layout. Logical equivalents:
 *   marginLeft/Right  -> marginInlineStart / marginInlineEnd
 *   paddingLeft/Right -> paddingInlineStart / paddingInlineEnd
 *   left / right      -> insetInlineStart / insetInlineEnd
 *   textAlign left    -> start, right -> end
 * CSS files are covered by the matching stylelint rules in stylelint.config.js.
 */
const PHYSICAL = 'marginLeft|marginRight|paddingLeft|paddingRight|borderLeft|borderRight|left|right|float|clear'
const RTL_HINT = 'RTL: inline physical direction. Use the logical property instead (marginInlineStart/End, paddingInlineStart/End, insetInlineStart/End, borderInlineStart/End).'
const rtlSyntax = [
  {
    selector: `JSXAttribute[name.name='style'] ObjectExpression > Property[key.name=/^(${PHYSICAL})$/]`,
    message: RTL_HINT,
  },
  {
    selector: `JSXAttribute[name.name='style'] ObjectExpression > Property[key.value=/^(${PHYSICAL})$/]`,
    message: RTL_HINT,
  },
  {
    selector: `JSXAttribute[name.name='style'] Property[key.name=/^(textAlign|float|clear)$/] > Literal[value=/^(left|right)$/]`,
    message: "RTL: use 'start' / 'end' instead of 'left' / 'right'.",
  },
  {
    selector: `AssignmentExpression > MemberExpression[object.property.name='style'][property.name=/^(${PHYSICAL})$/]`,
    message: RTL_HINT,
  },
]

export default tseslint.config(
  {
    ignores: ['dist/**', 'brag-output/**', 'public/**', 'supabase/**', 'coverage/**', '.factory/**', '.vercel/**'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat['recommended-latest'],
  reactRefresh.configs.vite,
  prettier,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // --- real bugs: keep these at error ---
      'no-restricted-syntax': ['error', ...rtlSyntax],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/set-state-in-render': 'error',
      '@typescript-eslint/prefer-as-const': 'error',
      '@typescript-eslint/no-misused-new': 'error',
      '@typescript-eslint/no-array-constructor': 'error',
      '@typescript-eslint/no-duplicate-enum-values': 'error',
      '@typescript-eslint/no-unsafe-declaration-merging': 'error',
      '@typescript-eslint/triple-slash-reference': 'error',
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',

      // --- stylistic / pre-existing noise: warn so the gate stays green ---
      // src/lib/api.ts already opts out with a file-level eslint-disable; the rest
      // of the codebase gets a warning it can pay down file by file.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/no-wrapper-object-types': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-this-alias': 'warn',
      // React Compiler rule family: useful advice, but it was written after the code.
      // Warn so it reads as a backlog instead of a blocked release.
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/void-use-memo': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/incompatible-library': 'warn',
      'react-hooks/globals': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/unsupported-syntax': 'warn',
      'react-hooks/config': 'warn',
      'react-hooks/gating': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-empty': 'warn',
      'prefer-const': 'warn',
      'no-useless-escape': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Node-side config files.
    files: ['*.{js,mjs,cjs,ts}', 'vite.config.ts'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },
  {
    // Tests: console output and loose typing are fine here.
    files: ['**/*.test.{ts,tsx}'],
    rules: { 'no-console': 'off', '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    // Pre-existing, deliberate physical positioning: the three.js overlay and the
    // chart tooltips place an absolutely positioned element at a measured pixel X,
    // which is a canvas coordinate, not a text direction. Warn, do not block.
    files: ['src/components/Three3D.tsx', 'src/components/Charts.tsx'],
    rules: { 'no-restricted-syntax': ['warn', ...rtlSyntax] },
  },
)
