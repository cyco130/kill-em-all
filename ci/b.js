import { spawn } from "node:child_process";

console.log("This is the B process", process.pid);

spawn("node ./c.js", { stdio: "inherit", shell: true });

setInterval(() => {
	console.log("B is still alive", process.pid);
}, 1000);

process.on("exit", (code) => {
	console.log(`B process exit event with code: ${code}, pid: ${process.pid}`);
});

process.on("SIGINT", () => {
	console.log("A process received SIGINT, exiting...");
	process.exit(0);
});

process.on("SIGTERM", () => {
	console.log("A process received SIGTERM, exiting...");
	process.exit(0);
});
