// Stylelint is here for one job above all: keep the CSS direction-agnostic.
// The UI is Arabic-first and flips with `dir="rtl"`, so a physical `margin-left`
// is a bug that only shows up in the mirrored layout. Logical properties mirror
// themselves, so they are the only thing allowed.
//
// Everything stylelint-config-standard says about formatting is advisory
// (`defaultSeverity: 'warning'`, which does not fail the CI gate). The two RTL
// rules below are raised back to `error` so they do.
const PHYSICAL_PROPERTIES = [
  'margin-left',
  'margin-right',
  'padding-left',
  'padding-right',
  'left',
  'right',
]

const PROPERTY_HINT =
  'RTL: physical direction. Use the logical property instead — margin-inline-start/end, padding-inline-start/end, inset-inline-start/end.'
const VALUE_HINT = 'RTL: use "start" / "end" instead of "left" / "right".'

/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  defaultSeverity: 'warning',
  ignoreFiles: [
    // 1910 lines written before the linter existed. It contains a handful of
    // deliberate physical rules: decorative keyframes, the CSS2D label offsets
    // for the three.js floor, and the `[dir='rtl']` compensation blocks that
    // exist precisely to undo a physical offset. Linting it would mean
    // rewriting it, so it stays out; new stylesheets get the full guard.
    'src/styles.css',
    'dist/**',
    'brag-output/**',
    'public/**',
    'node_modules/**',
  ],
  rules: {
    'property-disallowed-list': [PHYSICAL_PROPERTIES, { message: PROPERTY_HINT, severity: 'error' }],
    'declaration-property-value-disallowed-list': [
      {
        'text-align': ['left', 'right'],
        float: ['left', 'right'],
        clear: ['left', 'right'],
      },
      { message: VALUE_HINT, severity: 'error' },
    ],

    // Formatting opinions that would otherwise bury the RTL findings.
    'no-descending-specificity': null,
    'custom-property-pattern': null,
    'selector-class-pattern': null,
    'keyframes-name-pattern': null,
    'alpha-value-notation': null,
    'color-function-notation': null,
    'declaration-block-no-redundant-longhand-properties': null,
    'media-feature-range-notation': null,
  },
}
