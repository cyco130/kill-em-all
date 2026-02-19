import { ChildProcess, exec, spawn } from "node:child_process";
import { debug } from "./debug";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface KillEmAllOptions {
	/**
	 * Timeout in milliseconds to wait before giving up or force killing the process tree.
	 * @default 5000
	 */
	timeoutMs?: number;
	/**
	 * Whether to force kill the process tree after the initial timeout.
	 * @default true
	 */
	forceKillAfterTimeout?: boolean;
	/**
	 * Timeout in milliseconds to wait before force killing the process tree.
	 * @default timeoutMs
	 */
	forceKillTimeoutMs?: number;
}

/**
 * Kills the process with the given PID and all of its child processes recursively and waits for them to exit.
 *
 * @param pid The PID of the root process to kill.
 * @param signal The signal to send to the processes (e.g., 'SIGTERM', 'SIGKILL').
 * @param options Optional settings for timeouts and force killing.
 *
 * @throws Will throw an error if unable to kill the process tree within the specified timeouts.
 */
export async function killEmAll(
	pid: number,
	signal: NodeJS.Signals | number = "SIGTERM",
	options?: KillEmAllOptions,
): Promise<void> {
	const pids = await getRecursiveChildProcesses(pid);
	await killProcesses(pids, signal, options);
}

/**
 * Kills the given list of PIDs and waits for them to exit.
 *
 * @param pids The list of PIDs to kill.
 * @param signal The signal to send to the processes (e.g., 'SIGTERM', 'SIGKILL').
 * @param options Optional settings for timeouts and force killing.
 *
 * @throws Will throw an error if unable to kill the processes within the specified timeouts.
 */
export async function killProcesses(
	pids: number[],
	signal: NodeJS.Signals | number = "SIGTERM",
	options: KillEmAllOptions = {},
): Promise<void> {
	const {
		timeoutMs = 5000,
		forceKillAfterTimeout = true,
		forceKillTimeoutMs = timeoutMs,
	} = options;

	debug(`Killing processes: ${pids.join(", ")}`);

	let timeout = AbortSignal.timeout(timeoutMs);
	debug(`Set up initial timeout of ${timeoutMs} ms`);
	await Promise.all(pids.map((pid) => killProcess(pid, signal, timeout)));

	if (
		timeout.aborted &&
		forceKillAfterTimeout &&
		signal !== "SIGKILL" &&
		signal !== 9
	) {
		timeout = AbortSignal.timeout(forceKillTimeoutMs);
		debug(`Set up force kill timeout of ${forceKillTimeoutMs} ms`);
		await Promise.all(pids.map((pid) => killProcess(pid, "SIGKILL", timeout)));
	}

	if (timeout.aborted) {
		throw new Error(`Failed to kill processes within timeout`);
	}
}

async function killProcess(
	pid: number,
	signal: NodeJS.Signals | number,
	abortSignal?: AbortSignal,
): Promise<void> {
	let killed = false;

	try {
		debug(`Sending signal ${signal} to process ${pid}`);
		if (
			process.platform === "win32" &&
			(signal === "SIGKILL" || signal === 9)
		) {
			// On Windows, taskkill /F is more reliable
			await safeExec(`taskkill /PID ${pid} /F`);
		} else {
			process.kill(pid, signal);
		}
	} catch (err) {
		const nodeErr = err as NodeJS.ErrnoException;
		// Process might have already exited
		if (
			nodeErr.code === "ESRCH" ||
			(process.platform === "win32" && nodeErr.code === "EPERM")
		) {
			debug(
				`Process ${pid} does not exist or cannot be accessed, it might have already exited.`,
			);
			killed = true;
		} else {
			throw err;
		}
	}

	if (killed) {
		debug(`Process ${pid} is already dead.`);
		return;
	}

	let zombieCheckCount = 0;

	// Poll until the process exits
	for (;;) {
		if (abortSignal?.aborted) {
			debug(`Aborting kill ${pid} with ${signal}`);
			return;
		}

		if (zombieCheckCount === 0) {
			const isDefunct = await isZombie(pid);
			if (isDefunct) {
				debug(`Process ${pid} is a zombie, considering it exited.`);
				break;
			}

			zombieCheckCount = 5;
		}

		zombieCheckCount--;

		try {
			debug(`Checking if process ${pid} is still alive.`);
			process.kill(pid, 0); // Check if process is still alive
			debug(`Process ${pid} is still alive, waiting.`);

			// If no error, process is still alive, wait a bit
			await new Promise((resolve) => setTimeout(resolve, 100));
		} catch (err) {
			const nodeErr = err as NodeJS.ErrnoException;
			if (
				nodeErr.code === "ESRCH" ||
				(process.platform === "win32" && nodeErr.code === "EPERM")
			) {
				// Process does not exist anymore, break the loop
				debug(`Process ${pid} does not exist anymore, it has exited.`);
				break;
			} else {
				throw err; // Some other error occurred
			}
		}
	}

	debug(`Process ${pid} has exited.`);
}

/**
 * Gets all child processes of the given root PID recursively.
 *
 * @param rootPid The root process ID.
 */
export async function getRecursiveChildProcesses(
	rootPid: number,
): Promise<number[]> {
	const allPids: number[] = [];
	const stack: number[] = [rootPid];

	while (stack.length > 0) {
		const currentPid = stack.pop()!;
		allPids.push(currentPid);

		const childPids = await getChildProcesses(currentPid);
		stack.push(...childPids);
	}

	return allPids;
}

async function getChildProcesses(pid: number): Promise<number[]> {
	let command: string;
	if (process.platform === "win32") {
		// Using PowerShell to get child process IDs on Windows
		command = `powershell -Command "Get-CimInstance Win32_Process -Filter 'ParentProcessId = ${pid}' | Select-Object -ExpandProperty ProcessId"`;
	} else {
		// Using pgrep to get child process IDs on Unix-like systems
		command = `pgrep -P ${pid}`;
	}

	debug(`Getting child processes of PID ${pid} with command: ${command}`);
	const output = await safeExec(command);

	debug(output);

	if (output.stderr) {
		throw new Error(`Failed to get child processes: ${output.stderr}`);
	}

	if (output.exitCode !== 0) {
		return [];
	}

	const childPids: number[] = [];

	const lines = output.stdout.split("\n").filter((line) => line.trim() !== "");
	for (const line of lines) {
		const childPid = parseInt(line.trim(), 10);
		if (!isNaN(childPid)) {
			childPids.push(childPid);
		}
	}

	return childPids;
}

async function isZombie(pid: number): Promise<boolean> {
	debug(`Checking if process ${pid} is a zombie...`);
	if (process.platform === "win32") {
		try {
			// We query the process; if it exists but is not running,
			// PowerShell will return the object. If it's fully gone, it returns null.
			const cmd = `powershell -Command "Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty HasExited"`;
			const { stdout } = await execAsync(cmd);

			return stdout.trim().toLowerCase() === "true";
		} catch {
			// If the process doesn't exist at all, it's definitely not a zombie
			return false;
		}
	} else {
		try {
			// -o state= suppresses the header and returns just the state code (e.g., 'Z', 'S', 'R')
			const { stdout } = await execAsync(`ps -p ${pid} -o state=`);
			return stdout.trim().includes("Z");
		} catch {
			return true;
		}
	}
}

async function safeExec(
	command: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	return await new Promise((resolve) => {
		exec(command, (error, stdout, stderr) => {
			if (error) {
				resolve({ exitCode: error.code ?? -1, stdout, stderr });
			} else {
				resolve({ exitCode: 0, stdout, stderr });
			}
		});
	});
}

export type LaunchAndTestCleanupFunction = (
	signal?: NodeJS.Signals | undefined,
	options?: KillEmAllOptions,
) => Promise<void>;

/**
 * Launches a child process and waits until it is ready by polling a URL or calling a user-defined
 * polling function. Returns a cleanup function to kill the process and its children.
 *
 * @param cpOrCommand ChildProcess instance or command string to launch the process.
 * @param urlOrPollingFunction URL string to poll or a function that returns a Promise<boolean> indicating readiness.
 * @param timeoutMs Timeout in milliseconds to wait for the process to be ready. Default is 60000 ms.
 *
 * @returns A cleanup function that kills the launched process and its children.
 *
 * @throws Will throw an error if the process exits prematurely or if the timeout is reached before readiness.
 */
export async function launchAndTest(
	cpOrCommand: ChildProcess | string,
	urlOrPollingFunction: string | (() => Promise<boolean>),
	timeoutMs = 60000,
): Promise<LaunchAndTestCleanupFunction> {
	let cp: ChildProcess;
	if (typeof cpOrCommand === "string") {
		cp = spawn(cpOrCommand, {
			shell: true,
			stdio: "inherit",
		});
	} else {
		cp = cpOrCommand;
	}

	let { pid } = cp;

	if (pid === undefined) {
		await new Promise<void>((resolve, reject) => {
			cp!.on("error", (error) => {
				reject(error);
			});

			cp!.on("spawn", () => {
				if (!cp.pid) {
					reject(new Error("Failed to get process PID"));
					return;
				}

				pid = cp.pid;
				resolve();
			});
		});
	}

	if (cp.exitCode !== null) {
		throw new Error(`Process exited prematurely with code ${cp.exitCode}`);
	}

	const timeout = AbortSignal.timeout(timeoutMs);

	let cleanupCalled = false;

	debug(`Launched process with PID ${pid}, waiting for it to be ready...`);
	// eslint-disable-next-line no-async-promise-executor
	await new Promise<void>(async (resolve, reject) => {
		function cleanup(reason: unknown) {
			if (cleanupCalled) {
				return;
			}
			cleanupCalled = true;

			debug(
				`Cleaning up process ${pid} due to: ${reason instanceof Error ? reason.message : reason}`,
			);

			killEmAll(pid!, "SIGKILL", { timeoutMs: 5000 })
				.finally(() => {
					reject(reason);
				})
				.catch((error) => {
					debug(`Failed to kill process ${pid} during cleanup: ${error}`);
				});
		}

		function onExit(code: number) {
			if (code !== 0) {
				cleanup(new Error(`Process exited prematurely with code ${code}`));
			}
		}

		cp.on("exit", onExit);

		try {
			const pollingFunction =
				typeof urlOrPollingFunction === "string"
					? async () => {
							try {
								const response = await fetch(urlOrPollingFunction);
								return response.ok;
							} catch {
								return false;
							}
						}
					: urlOrPollingFunction;

			for (;;) {
				if (cleanupCalled) {
					break;
				}

				debug(`Checking if process ${pid} is ready...`);
				const done = await pollingFunction().catch((err) => {
					cleanup(err);
					throw err;
				});
				debug(`Polling result for process ${pid}: ${done}`);

				if (done) {
					break;
				}

				if (timeout.aborted) {
					cleanup(new Error("Timeout waiting for process to be ready"));
					break;
				}

				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			if (cleanupCalled) {
				return;
			}

			resolve();
		} catch (err) {
			if (!cleanupCalled) {
				cleanup(err);
			}
		}

		cp.off("exit", onExit);
	});

	const allPids = await getRecursiveChildProcesses(pid!);

	return async function cleanup(
		signal?: NodeJS.Signals,
		options?: KillEmAllOptions,
	) {
		await killProcesses(allPids, signal, options);
	};
}
