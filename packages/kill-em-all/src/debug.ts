const debugEnv = (process.env.DEBUG ?? "")
	.toLowerCase()
	.split(",")
	.map((s) => s.trim())
	.filter((s) => s !== "");

const shouldDebug =
	debugEnv.includes("kill-em-all") ||
	debugEnv.includes("kill-em-all:*") ||
	debugEnv.includes("*");

export function debug(...args: any[]) {
	if (shouldDebug) {
		console.error("[kill-em-all]", ...args);
	}
}
