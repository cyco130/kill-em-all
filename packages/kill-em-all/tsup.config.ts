import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: ["./src/index.ts", "./src/cli.ts"],
		format: ["esm"],
		platform: "node",
		target: "node20",
		sourcemap: true,
		dts: { entry: ["./src/index.ts"] },
	},
]);
