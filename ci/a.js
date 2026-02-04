import { spawn } from "node:child_process";

console.log("This is the A process");

spawn("node ./b.js", { stdio: "inherit", shell: true });
