# Contributing

## Setup

```sh
npm install
```

## Workflow

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm test            # vitest run
npm run build        # tsup -> dist/
```

Run all four (or `npm run test:watch` while iterating) before opening a PR —
CI runs the same checks against Node 18, 20, and 22.

## Guidelines

- Add or update tests in `test/` for any behavior change.
- Keep the README's Options/`.sidebar`/`.exclude` tables in sync with any
  option or syntax change.
- Follow the existing naming conventions (see `src/` — full descriptive
  identifiers, `is`/`to`/`get`-prefixed helpers) rather than introducing new
  patterns.

## Releasing

See the [Releasing](README.md#releasing) section of the README — maintainers
only.
