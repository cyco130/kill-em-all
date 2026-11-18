import { parseArgs } from "node:util";
import { killEmAll, type KillEmAllOptions } from "./index.ts";

const args = process.argv.slice(2);

function printUsageAndExit(code: number): never {
	// eslint-disable-next-line no-console
	console.log(
		`Usage: kill-em-all <pid> [--signal <signal>] [--timeout <ms>] [--force-kill-after-timeout] [--force-kill-timeout <ms>]`,
	);
	process.exit(code);
}

function fail(message: string): never {
	console.error(`Error: ${message}`);
	printUsageAndExit(1);
}

const optionsConfig = {
	signal: { type: "string", short: "s" },
	timeout: { type: "string", short: "t" },
	"force-kill-after-timeout": { type: "boolean", short: "f" },
	"force-kill-timeout": { type: "string", short: "F" },
	help: { type: "boolean", short: "h" },
} as const;

// Not strict: the error messages are part of the CLI's public contract, so
// invalid input is reported below instead of by parseArgs.
const { values, tokens } = parseArgs({
	args,
	options: optionsConfig,
	allowPositionals: true,
	strict: false,
	tokens: true,
});

// The `includes` checks also catch a help flag that was consumed as the value
// of another option, e.g. `--signal --help`.
if (
	args.length === 0 ||
	values.help ||
	args.includes("--help") ||
	args.includes("-h")
) {
	printUsageAndExit(0);
}

// A boolean option with an inline value (`--force-kill-after-timeout=false`)
// would be silently treated as set, so it counts as unknown.
function isKnownOption(name: string, value: string | undefined): boolean {
	const config: Record<string, { type: string }> = optionsConfig;
	return (
		Object.hasOwn(config, name) &&
		(config[name]?.type === "string" || value === undefined)
	);
}

// Everything that isn't a known option is a candidate for the PID, unknown
// options included. Only the first one can be the PID.
const [pidArg, unknownArg] = tokens
	.filter(
		(token) =>
			token.kind === "positional" ||
			(token.kind === "option" && !isKnownOption(token.name, token.value)),
	)
	.map((token) => args[token.index]);

const pid = pidArg === undefined ? undefined : Number(pidArg);
if (pid !== undefined && (isNaN(pid) || pid <= 0)) {
	fail("Invalid PID");
}

if (unknownArg !== undefined) {
	fail(`Unknown argument: ${unknownArg}`);
}

type ValueOption = "signal" | "timeout" | "force-kill-timeout";

function stringOption(name: ValueOption): string | undefined {
	const value = values[name];
	// A string option with nothing after it is parsed as `true`
	if (typeof value === "boolean") {
		fail(`Missing value for --${name}`);
	}

	return value;
}

function timeoutOption(name: ValueOption, defaultValue: number): number {
	const value = stringOption(name);
	if (value === undefined) {
		return defaultValue;
	}

	const timeoutMs = Number(value);
	if (isNaN(timeoutMs) || timeoutMs < 0) {
		fail(`Invalid value for --${name}`);
	}

	return timeoutMs;
}

const signalArg = stringOption("signal") ?? "SIGTERM";
const signalNum = Number(signalArg);
const signal = isNaN(signalNum) ? (signalArg as NodeJS.Signals) : signalNum;

const options: KillEmAllOptions = {
	timeoutMs: timeoutOption("timeout", 5000),
	forceKillAfterTimeout: true,
	forceKillTimeoutMs: timeoutOption("force-kill-timeout", 5000),
};

if (pid === undefined) {
	fail("PID is required");
}

await killEmAll(pid, signal, options);
