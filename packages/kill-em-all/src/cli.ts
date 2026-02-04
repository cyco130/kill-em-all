#! /usr/bin/env node

import { killEmAll, type KillEmAllOptions } from ".";

const args = process.argv.slice(2);

function printUsageAndExit(code: number): never {
	// eslint-disable-next-line no-console
	console.log(
		`Usage: kill-em-all <pid> [--signal <signal>] [--timeout <ms>] [--force-kill-after-timeout] [--force-kill-timeout <ms>]`,
	);
	process.exit(code);
}

if (args.includes("--help") || args.includes("-h") || args.length === 0) {
	printUsageAndExit(0);
}

let pid: number | undefined;
let signal: NodeJS.Signals | number = "SIGTERM";
const options: KillEmAllOptions = {
	timeoutMs: 5000,
	forceKillAfterTimeout: true,
	forceKillTimeoutMs: 5000,
};

for (let i = 0; i < args.length; i++) {
	switch (args[i]) {
		case "--signal":
		case "-s":
			{
				i++;
				if (i >= args.length) {
					console.error("Error: Missing value for --signal");
					printUsageAndExit(1);
				}

				const signalArg = args[i];
				const signalNum = Number(signalArg);
				if (!isNaN(signalNum)) {
					signal = signalNum;
				} else {
					signal = signalArg as NodeJS.Signals;
				}
			}
			break;
		case "--timeout":
		case "-t": {
			i++;
			if (i >= args.length) {
				console.error("Error: Missing value for --timeout");
				printUsageAndExit(1);
			}
			const timeoutMs = Number(args[i]);
			if (isNaN(timeoutMs) || timeoutMs < 0) {
				console.error("Error: Invalid value for --timeout");
				printUsageAndExit(1);
			}
			options.timeoutMs = timeoutMs;
			break;
		}
		case "--force-kill-after-timeout":
		case "-f": {
			options.forceKillAfterTimeout = true;
			break;
		}
		case "--force-kill-timeout":
		case "-F": {
			i++;
			if (i >= args.length) {
				console.error("Error: Missing value for --force-kill-timeout");
				printUsageAndExit(1);
			}
			const forceKillTimeoutMs = Number(args[i]);
			if (isNaN(forceKillTimeoutMs) || forceKillTimeoutMs < 0) {
				console.error("Error: Invalid value for --force-kill-timeout");
				printUsageAndExit(1);
			}
			options.forceKillTimeoutMs = forceKillTimeoutMs;
			break;
		}
		default:
			if (pid === undefined) {
				pid = Number(args[i]);
				if (isNaN(pid) || pid <= 0) {
					console.error("Error: Invalid PID");
					printUsageAndExit(1);
				}
			} else {
				console.error(`Error: Unknown argument: ${args[i]}`);
				printUsageAndExit(1);
			}
	}
}

if (pid === undefined) {
	console.error("Error: PID is required");
	printUsageAndExit(1);
}

await killEmAll(pid, signal, options);
