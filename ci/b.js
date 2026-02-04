import { spawn } from "node:child_process";

console.log("This is the B process");

spawn("node ./c.js", { stdio: "inherit", shell: true });
