import { createServer } from "node:http";

console.log("This is the C process");

const server = createServer((req, res) => {
	res.writeHead(200, { "Content-Type": "text/plain" });
	res.end("Hello from C process\n");
});

server.listen(3000, () => {
	console.log("C process server running at http://localhost:3000/");
});

function shutdown() {
	console.log("C process shutting down...");
	server.close(() => {
		console.log("C process server closed.");
		process.exit(0);
	});
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
