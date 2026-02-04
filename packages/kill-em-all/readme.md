# Kill 'em All

`kill-em-all` is a CLI utility and library for killing a process and all of its child processes and waiting for them to exit.

## The problem

In many scenarios, like end-to-end testing, you launch a process, interact with it (e.g. by sending HTTP requests to a server), and then kill it at the end of the test. However, when you spawn the command to start a process, it is often the case that you end up with the pid of a shell or intermediate process (like `npm`) instead of the actual process that does the work. Simply killing that pid may leave child processes running, leading to resource leaks like busy ports or orphaned processes, and unpredictable behavior like ugly terminal output after your program has exited.

Every other tool that I used to try to solve this problem in the past has one or more of the following issues:

- Not cross-platform
- Outdated (e.g. relies on `wmic` on Windows which is no longer available)
- Returns too early, before all processes exited
- Chokes on zombie processes (also known as defunct processes)

There are also packages that allow you to kill a process that keeps a port busy, but sometimes you have to deal with a wrapper process that simply relaunches the actual server process, rendering those tools ineffective.

`kill-em-all` aims to solve this problem in a reliable and cross-platform way.

## Installation

```bash
npm install kill-em-all
```

## Library usage:

```ts
import { killEmAll } from "kill-em-all";

await killEmAll(
  12345, // PID of the process to kill
  "SIGINT", // Optional signal, defaults to SIGTERM
  {
    // All options are optional
    timeoutMs: 5000, // Wait up to 5 seconds for processes to exit gracefully (default is 5000ms)
    forceKillAfterTimeout: true, // Kill them with SIGKILL if they don't exit in time (default is true)
    forceKillTimeoutMs: 5000, // Wait 5 more seconds after sending SIGKILL (default is timeoutMs)
  },
);
```

## CLI usage:

```bash
npx kill-em-all <pid> [--signal <signal>] [--timeout <ms>] [--force-kill-after-timeout] [--force-kill-timeout <ms>]
```

## How it works

- `kill-em-all` first identifies all child processes of the given PID recursively.
  - It uses `pgrep` on POSIX systems and `Get-CimInstance` PowerShell command on Windows to find child processes.
- It then sends the specified signal (defaulting to `SIGTERM`) to all processes in the tree.
- It polls the processes to check if they have exited or became zombies, waiting up to the specified timeout (defaulting to 5000ms).
- If any processes are still running and the `forceKillAfterTimeout` option is set, it sends `SIGKILL` to those processes and waits for them to exit for the specified `forceKillTimeoutMs` (defaulting to `timeoutMs`).
- If any processes are still running after all attempts, it throws an error.

## Debugging

You can enable debug logging via the `DEBUG` environment variable:

```bash
DEBUG=kill-em-all npx kill-em-all <pid>
```

## Credits and license

`kill-em-all` is created by Fatih Aygün and contributors. It is licensed under the [MIT License](./LICENSE).
