import { test } from "vitest";
import { spawn } from "node:child_process";
import { killEmAll } from "kill-em-all";

test("ci", async () => {
	const proc = spawn("node ./a.js", { stdio: "inherit", shell: true });

	// Wait until ready
	const pid = await new Promise<number>((resolve, reject) => {
		proc.on("spawn", () => {
			if (proc.pid === undefined) {
				reject(new Error("Spawned process has no PID"));
			} else {
				resolve(proc.pid);
			}
		});
	});

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

	await killEmAll(pid, "SIGINT");
	console.log("All processes killed");

	// Make sure localhost:3000 is down
	try {
		await fetch("http://localhost:3000");
		throw new Error("Server is still running after killEmAll");
	} catch {
		// Expected error, server should be down
		console.log("Server is down as expected");
	}
});
