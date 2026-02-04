import { exec, spawn } from "node:child_process";
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
	let killed = false;

	try {
		debug(`Sending signal ${signal} to process ${pid}`);
		process.kill(pid, signal);
	} catch (err) {
		// Process might have already exited
		if ((err as NodeJS.ErrnoException).code !== "ESRCH") {
			throw err;
		}

		killed = true;
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
			process.kill(pid, 0); // Check if process is still alive
			// debug(`Process ${pid} is still alive, waiting...`);

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

	const pgrep = spawn(command, {
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

async function isZombie(pid: number): Promise<boolean> {
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
