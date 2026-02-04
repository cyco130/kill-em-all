import { spawn } from "node:child_process";
import { debug } from "./debug";

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
	options: KillEmAllOptions = {},
): Promise<void> {
	const {
		timeoutMs = 5000,
		forceKillAfterTimeout = true,
		forceKillTimeoutMs = timeoutMs,
	} = options;

	const pids = await getChildProcessesRecursive(pid);
	debug(`Killing processes: ${pids.join(", ")}`);

	let timeout = AbortSignal.timeout(timeoutMs);
	await Promise.all(pids.map((pid) => killProcess(pid, signal, timeout)));

	if (
		timeout.aborted &&
		forceKillAfterTimeout &&
		signal !== "SIGKILL" &&
		signal !== 9
	) {
		timeout = AbortSignal.timeout(forceKillTimeoutMs);
		await Promise.all(pids.map((pid) => killProcess(pid, "SIGKILL", timeout)));
	}

	if (timeout.aborted) {
		throw new Error(
			`Failed to kill process tree with root PID ${pid} within timeout.`,
		);
	}
}

async function killProcess(
	pid: number,
	signal: NodeJS.Signals | number,
	abortSignal?: AbortSignal,
): Promise<void> {
	try {
		debug(`Sending signal ${signal} to process ${pid}`);
		process.kill(pid, signal);
	} catch (err) {
		// Process might have already exited
		if ((err as NodeJS.ErrnoException).code !== "ESRCH") {
			throw err;
		}
	}

	// Poll until the process exits
	for (;;) {
		if (abortSignal?.aborted) {
			debug(`Aborting kill ${pid} with ${signal}`);
			return;
		}

		try {
			process.kill(pid, 0); // Check if process is still alive
			// If no error, process is still alive, wait a bit
			await new Promise((resolve) => setTimeout(resolve, 100));
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ESRCH") {
				// Process does not exist anymore
				break;
			} else {
				throw err; // Some other error occurred
			}
		}
	}

	debug(`Process ${pid} has exited.`);
}

async function getChildProcessesRecursive(rootPid: number): Promise<number[]> {
	// Use @vscode/windows-process-tree on Windows
	if (process.platform === "win32") {
		const { getProcessList } = await import("@vscode/windows-process-tree");
		return await new Promise<number[]>((resolve) => {
			getProcessList(rootPid, (processList) => {
				resolve((processList ?? []).map((p) => p.pid));
			});
		});
	} else {
		return await getChildProcessesRecursivePosix(rootPid);
	}
}

async function getChildProcessesRecursivePosix(
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
	const pgrep = spawn(`pgrep -P ${pid}`, {
		shell: true,
		stdio: ["ignore", "pipe", "pipe"],
	});

	pgrep.stdout.setEncoding("utf-8");
	pgrep.stderr.setEncoding("utf-8");

	const childPids: number[] = [];
	pgrep.stdout.on("data", (data: string) => {
		const lines = data.split("\n").filter((line) => line.trim() !== "");
		for (const line of lines) {
			const childPid = parseInt(line, 10);
			if (!isNaN(childPid)) {
				childPids.push(childPid);
			}
		}
	});

	let stderrData = "";
	pgrep.stderr.on("data", (data: string) => {
		stderrData += data;
	});

	await new Promise<void>((resolve, reject) => {
		pgrep.on("error", (err) => {
			reject(new Error(`Failed to start pgrep: ${err.message}`));
		});

		pgrep.on("close", () => {
			resolve();
		});
	});

	if (stderrData) {
		throw new Error(`pgrep failed with error: ${stderrData}`);
	}

	return childPids;
}
