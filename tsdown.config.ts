import { defineConfig } from "tsdown";

export default defineConfig([
    {
        entry: { types: "src/types.ts" },
        format: ["esm"],
        dts: true,
        outDir: "dist",
    },
    {
        entry: ["src/index.ts"],
        format: ["esm", "cjs"],
        dts: true,
        sourcemap: true,
        minify: false,
        target: "es2022",
        outDir: "dist",
    },
    {
        entry: ["src/node/index.ts"],
        format: ["esm", "cjs"],
        dts: true,
        sourcemap: true,
        deps: { neverBundle: ["ws", "log4js", "inspector", "fs", "path"] },
        minify: false,
        target: "es2022",
        outDir: "dist/node",
    },
    {
        entry: ["src/web/index.ts"],
        format: ["esm"],
        dts: true,
        sourcemap: true,
        deps: { neverBundle: ["vue"] },
        minify: false,
        target: "es2020",
        outDir: "dist/web",
    },
    {
        entry: ["src/web/property.ts"],
        format: ["esm"],
        dts: true,
        sourcemap: true,
        deps: {
            neverBundle: ["vue"],
        },
        minify: false,
        target: "es2020",
        outDir: "dist/web",
    },
    {
        entry: ["src/web/ui/index.ts"],
        format: ["esm"],
        dts: true,
        sourcemap: true,
        deps: {
            neverBundle: ["vue"],
        },
        minify: false,
        target: "es2020",
        outDir: "dist/web/ui",
    },
]);
