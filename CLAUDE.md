# CLAUDE.md

Project context for Claude Code and other agents. Keep this file focused on things that are **not** obvious from reading the repo — anything you can grep for in five seconds doesn't belong here.

Markdown in this repo is not manually wrapped. Write one paragraph per line and let the editor soft-wrap.

## Layout

- [packages/kill-em-all/](packages/kill-em-all/) — the published library (`kill-em-all` on npm). Built with tsdown. The package name is bare (unscoped) — an intentional exception that predates any "always scope under `@<org>/`" convention you may have seen in similar repos. Don't rename.
- [packages/kill-em-all/cli.js](packages/kill-em-all/cli.js) is a one-line stub that re-exports `./dist/cli.js`. It exists so the `bin` entry in `package.json` can point to a stable filename independent of the build output. Don't move it into `src/`.
- [ci/](ci/) — internal, non-published workspace package that holds the cross-platform e2e suite. Run via `pnpm run ci` from the root; it exercises the built library against real child-process trees on Linux/macOS/Windows.

The root [readme.md](readme.md) is a symlink into the package's readme. Edit the symlink target, not the symlink.

## Stack invariants

These are deliberate. Don't change them without a reason.

- **ESM only.** No CJS output, no `"type": "commonjs"`. tsdown is configured for `format: ["esm"]` and `platform: "node"`.
- **Strict TS** with `noUncheckedIndexedAccess` and `noImplicitOverride`. The package's [tsconfig.json](packages/kill-em-all/tsconfig.json) uses `module: "preserve"` with `customConditions: ["import"]` rather than `nodenext` — this is intentional and predates the nodenext convention; don't "fix" it without a reason.
- **Relative imports use `.ts` extensions**, not `.js`. Lint enforces this; tsconfigs allow it via `allowImportingTsExtensions`. The point is that source runs natively under Node's TS support and Deno, no transpile step required.
- **Tabs, 80 cols.** Markdown and `package.json` use 2-space indent (see [.prettierrc](.prettierrc)). Don't reformat with spaces.
- **Node**: the published source in [packages/kill-em-all/src/](packages/kill-em-all/src/) targets the lowest `engines.node` major. The support range covers every active LTS and every Current release — there is often more than one of each (right now: 22 and 24 are LTS; 25 and 26 are Current). Dev tooling, build configs, and scripts (e.g. `tsdown.config.ts`) can assume the latest minor of the most recent LTS — features that landed in recent LTS minors are fair game there; Current-only features aren't. Off-limits inside the package `src/`.
- **ESLint config** comes from `@cyco130/eslint-config/node`. Lint rules live there, not in-repo.

## Library invariants

kill-em-all-specific design choices that look like bugs or dead code if you don't know why they're there.

- **Zombie reaping.** `process.kill(pid, 0)` returns `ESRCH` only after the OS has _reaped_ the process. A defunct child whose parent hasn't called `wait()` still reports alive, so the polling loop in [src/index.ts](packages/kill-em-all/src/index.ts) periodically (every 5th iteration) runs `ps -p <pid> -o state=` on POSIX or `Get-Process | HasExited` on Windows and treats state `Z` / `HasExited=true` as exited. Without this branch, killing a process whose parent is itself under attack hangs until the force-kill timeout.
- **Windows force-kill uses `taskkill /F`, not `process.kill(pid, 'SIGKILL')`.** Plain SIGKILL on Windows handles the common case, but `taskkill /F` is more reliable against partially-detached or elevated children. Don't "simplify" it.
- **`EPERM` on Windows means "gone".** `kill(pid, 0)` on Windows can return `EPERM` for a process that exists in the OS table but can't be accessed — treated as exited. Pairs with `ESRCH` on POSIX.
- **PowerShell, not `wmic`.** Windows child-process enumeration uses `Get-CimInstance Win32_Process`. `wmic` was removed in Windows 11 24H2 / Server 2025 — replacing this with `wmic` is the kind of "modernization" that breaks the entire reason the library exists.
- **`launchAndTest` snapshots PIDs at readiness.** The cleanup function it returns captures `getRecursiveChildProcesses(rootPid)` _once_, when the URL or polling function reports ready, and signals exactly those PIDs at teardown. Processes spawned _after_ readiness are not in the set and won't be killed. This is deliberate — deterministic teardown beats racing with new spawns. If you need the dynamic version, call `killEmAll(rootPid, ...)` in your own finally block.
- **Zero runtime dependencies.** The package has no `dependencies`, only `devDependencies`. "No transitive surprises" is part of the value proposition. The custom DEBUG matching in [src/debug.ts](packages/kill-em-all/src/debug.ts) exists specifically to avoid taking on the `debug` package.

## Commands

Run from the repo root unless noted.

- `pnpm dev` — watch-build the package.
- `pnpm build` — build the package.
- `pnpm test` — runs every script matching `test:*` (uses pnpm's `/^test:/` pattern syntax). Adding a new `test:foo` script auto-joins the suite — no test runner registry to update.
- `pnpm run ci` — runs the cross-platform e2e suite in [ci/](ci/) against the **built** library. Two gotchas: (a) the script does not auto-build, so a stale or missing `packages/kill-em-all/dist/` will silently invalidate the run — `pnpm build` first; (b) must be spelled `pnpm run ci`, not `pnpm ci` — pnpm treats bare `pnpm ci` as a built-in alias for `pnpm install --frozen-lockfile`, which shadows this script.
- `pnpm format` — Prettier write across the repo.

Inside [packages/kill-em-all/](packages/kill-em-all/), `pnpm test` fans out to `test:typecheck` (`tsc --noEmit`), `test:lint` (eslint), and `test:package` (publint).

## E2E suite (ci/)

[ci/a.js](ci/a.js) → [ci/b.js](ci/b.js) → [ci/c.js](ci/c.js) form a three-level process tree: A spawns B, B spawns C, and C is an HTTP server on `:3000`. The test in [ci/ci.test.ts](ci/ci.test.ts) starts A, polls until `:3000` is up, calls `killEmAll(pidOfA)`, then verifies `:3000` is closed — proving the whole tree died, not just A. The CLI variant resolves `pnpm exec kill-em-all` against `packages/kill-em-all/dist/cli.js`, which is why the build is a prerequisite.

The `Disable AppArmor on Ubuntu` step in [.github/workflows/ci.yml](.github/workflows/ci.yml) is not boilerplate — GitHub-hosted `ubuntu-latest` enforces `kernel.apparmor_restrict_unprivileged_userns=1`, and without flipping it off, nested process spawns from this test harness fail with permission errors.

There are intentionally **no unit tests** in [packages/kill-em-all/](packages/kill-em-all/). Mocking `pgrep`/`process.kill` would just exercise the mocks — the real contract is "does this actually kill a process tree on Linux, macOS, and Windows", which only an e2e suite can answer. Don't add `vitest` as a devDep to the published package without a real reason.

## Versioning and publishing

- `./version <semver-arg>` (e.g. `./version patch`, `./version 1.2.0`) bumps the package's version. Run this from a clean tree — it edits `package.json` and the lockfile.
- Publishing is wired up in [.github/workflows/publish.yml](.github/workflows/publish.yml).

## Tooling around the edges

- **husky + lint-staged** run on pre-commit. If a commit is being blocked, fix the underlying lint/format issue rather than bypassing the hook.
- **Renovate** config lives at [.github/renovate.json](.github/renovate.json).
- **VSCode** recommended extensions and settings live in [.vscode/](.vscode/).
