# Contributing

Thanks for considering a contribution. For non-obvious conventions and the project's quirks, see [AGENTS.md](./AGENTS.md).

## Setup

```sh
pnpm install
```

Local development expects the latest minor of the most recent Node LTS, and a recent pnpm. The published package supports a broader range — every active LTS and every Current release — but dev/build scripts may rely on features that landed in recent LTS minors.

Concrete pins live in `engines.node` ([packages/kill-em-all/package.json](packages/kill-em-all/package.json), the published support range) and the `pnpm/action-setup` step in `.github/workflows/*.yml` (pnpm version). Renovate keeps both current.

## Layout

- [packages/kill-em-all/](packages/kill-em-all/) — the published library.
- [ci/](ci/) — internal e2e test suite, run via `pnpm run ci`.

## Common commands

```sh
pnpm dev      # watch-build the package
pnpm build    # one-off build
pnpm test     # full suite: package tests + Prettier check
pnpm run ci   # cross-platform e2e tests against the built library (pnpm ci is a builtin alias for install, not this script)
pnpm format   # write Prettier across the repo
```

Inside the package, `pnpm test` runs `test:typecheck` (tsc), `test:lint` (eslint), and `test:package` (publint).

The published package has no unit tests on purpose — the cross-platform e2e suite in [ci/](ci/) is the real test contract. See [AGENTS.md](./AGENTS.md) for the rationale before adding a `test:unit` script.

## Code style and commits

Prettier and ESLint are authoritative — running `pnpm format` and `pnpm test:lint` should leave nothing to argue about. Pre-commit hooks (husky + lint-staged) auto-format staged files.

If you'd rather run formatters by hand, opt out of the hooks per-commit with `git commit --no-verify` (or `-n`), or for the whole shell session with `export HUSKY=0`. Either is fine — just make sure CI is green before you push.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `release:`.

## Pull requests

- One logical change per PR.
- Code-quality CI ([.github/workflows/cq.yml](.github/workflows/cq.yml)) and cross-platform e2e CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) must pass.
- A maintainer will review and merge.

## Releases

Releases are cut by a maintainer via the `Publish to NPM` workflow in GitHub Actions, which runs `./version <semver>` and publishes to npm via `pnpm -r publish`.
