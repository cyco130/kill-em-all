import type { UserConfig } from "tsdown";

const config: UserConfig[] = [
	{
		entry: ["./src/index.ts", "./src/cli.ts"],
		fixedExtension: false,
		format: ["esm"],
		platform: "node",
		target: "node22",
		sourcemap: true,
		dts: true,
	},
];

export default config;
