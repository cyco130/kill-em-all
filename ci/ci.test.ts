import { test } from "vitest";
import { execSync, spawn } from "node:child_process";
import { killEmAll, launchAndTest } from "kill-em-all";

test.sequential(
	"works as a library",
	async () => {
		await doTest("library");
	},
	60_000,
);

test.sequential(
	"works as a CLI",
	async () => {
		await doTest("CLI");
	},
	60_000,
);

test.sequential(
	"launchAndTest",
	async () => {
		const kill = await launchAndTest("node ./a.js", "http://localhost:3000");

		try {
			const response = await fetch("http://localhost:3000");
			if (!response.ok) {
				throw new Error("Server did not respond with 200 OK");
			}
		} finally {
			await kill("SIGINT", { timeoutMs: 10_000 });
			console.log("All processes killed");
		}

		// Make sure localhost:3000 is down
		try {
			await fetch("http://localhost:3000");
			throw new Error("Server is still running after killEmAll");
		} catch {
			// Expected error, server should be down
			console.log("Server is down as expected");
		}
	},
	60_000,
);

async function doTest(mode: "library" | "CLI") {
	const pid = await spawnAndGetPid("node ./a.js");

	// Poll until localhost:3000 is up
	await new Promise<void>((resolve, reject) => {
		const checkInterval = 500;
		const maxAttempts = 60; // 30 seconds
		let attempts = 0;

		const interval = setInterval(async () => {
			attempts++;
			if (attempts > maxAttempts) {
				clearInterval(interval);
				reject(
					new Error("Server did not become ready within the expected time"),
				);
				return;
			}

			try {
				const response = await fetch("http://localhost:3000");
				if (response.ok) {
					clearInterval(interval);
					resolve();
				}
			} catch {
				// Ignore errors, server is not ready yet
			}
		}, checkInterval);
	});

	if (mode === "library") {
		await killEmAll(pid, "SIGINT", { timeoutMs: 10_000 });
	} else {
		execSync(`pnpm exec kill-em-all ${pid} --signal SIGINT --timeout 10000`, {
			stdio: "inherit",
		});
	}

	console.log("All processes killed");

	// Make sure localhost:3000 is down
	try {
		await fetch("http://localhost:3000");
		throw new Error("Server is still running after killEmAll");
	} catch {
		// Expected error, server should be down
		console.log("Server is down as expected");
	}
}

async function spawnAndGetPid(command: string): Promise<number> {
	return new Promise<number>((resolve, reject) => {
		try {
			const proc = spawn(command, { stdio: "ignore", shell: true });

			proc.on("spawn", () => {
				if (proc.pid === undefined) {
					reject(new Error("Spawned process has no PID"));
				} else {
					resolve(proc.pid);
				}
			});

			proc.on("error", (err) => {
				reject(err);
			});
		} catch (err) {
			reject(err);
		}
	});
}
