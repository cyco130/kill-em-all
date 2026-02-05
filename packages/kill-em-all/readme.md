# Kill 'em All

`kill-em-all` is yet another library and command line utility that:

- Kills a process and all of its child processes recursively
- Waits for all processes to actually exit
- Handles zombie (defunct) processes
- Is cross-platform (Windows, macOS, Linux)
- Is actively maintained

## Installation

```bash
npm install kill-em-all
```

## The problem

When running automated tasks you often capture the PID of a wrapper process like a shell or `npm start` rather than the actual process that does the work. Simply killing the wrapper process can leave the child processes running, which leads to:

- **Port conflicts:** Your next run fails because port `3000` is still held by an orphaned process.
- **Resource leaks:** Background processes continue to consume CPU and RAM.
- **Polluted logs:** Ghost processes keep writing to the terminal after your main process has stopped.

All existing solutions that I've tried -and I have tried many!- suffer from at least one of the following issues:

- Not being cross-platform
- Being outdated (e.g. relies on `wmic` on Windows which is no longer available)
- Returning too early, before all processes exited
- Waiting forever on zombie processes (also known as defunct processes)

There are also tools that kill processes by port number but sometimes you have to deal with a wrapper process that simply relaunches the actual server process, thinking it just crashed.

`kill-em-all` aims to solve this problem in a reliable and cross-platform way.

## How it works

- `kill-em-all` first identifies all child processes of the given PID recursively.
  - It uses `pgrep` on POSIX systems and `Get-CimInstance` PowerShell command on Windows to find child processes.
- It then sends the specified signal (defaulting to `SIGTERM`) to all processes in the tree.
- It polls the processes to check if they have exited or became zombies, waiting up to the specified timeout (defaulting to 5000ms).
- If any processes are still running and the `forceKillAfterTimeout` option is set, it sends `SIGKILL` to those processes and waits for them to exit for the specified `forceKillTimeoutMs` (defaulting to `timeoutMs`).
- If any processes are still running after all attempts, it throws an error.

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

## Debugging

You can enable debug logging via the `DEBUG` environment variable:

```bash
DEBUG=kill-em-all npx kill-em-all <pid>
```

## Credits and license

`kill-em-all` is created by Fatih Aygün and contributors. It is licensed under the [MIT License](./LICENSE).
