import { spawn } from "node:child_process";

console.log("This is the A process", process.pid);

spawn("node ./b.js", { stdio: "inherit", shell: true });

setInterval(() => {
	console.log("A is still alive", process.pid);
}, 1000);

process.on("exit", (code) => {
	console.log(`A process exit event with code: ${code}, pid: ${process.pid}`);
});

process.on("SIGINT", () => {
	console.log("A process received SIGINT, exiting...");
	process.exit(0);
});

process.on("SIGTERM", () => {
	console.log("A process received SIGTERM, exiting...");
	process.exit(0);
});
