/** Lightweight Node logger with no runtime dependencies. */
import fs from "node:fs";
import path from "node:path";
import util from "node:util";

const maxSize = 5 * 1024 * 1024;
const backups = 3;
const now = new Date();
const logDirectory = path.resolve(process.cwd(), "log");
const logFile = path.join(logDirectory, `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}.log`);
const maxLineBytes = 64 * 1024;
const maxOutputBytes = 256 * 1024;
let writing = false;
let fileRetryAt = 0;
const failedOutputs = new WeakSet<NodeJS.WriteStream>();

// Stream errors are asynchronous; never report a logger failure through the logger.
for (const stream of [process.stdout, process.stderr]) {
    stream.on("error", () => { failedOutputs.add(stream); });
}

function rotate() {
    try {
        if (!fs.existsSync(logFile) || fs.statSync(logFile).size < maxSize) return;
        for (let index = backups; index >= 1; --index) {
            const source = index === 1 ? logFile : `${logFile}.${index - 1}`;
            const target = `${logFile}.${index}`;
            if (!fs.existsSync(source)) continue;
            if (fs.existsSync(target)) fs.unlinkSync(target);
            fs.renameSync(source, target);
        }
    } catch {}
}

function format(value: unknown): string {
    try {
        const result = value instanceof Error ? value.stack || value.message :
            typeof value === "string" ? value : util.inspect(value, {
                depth: 5, breakLength: Infinity, customInspect: false,
                getters: false, maxArrayLength: 100, maxStringLength: 4096,
            });
        return result.slice(0, maxLineBytes);
    } catch { return "[unformattable log value]"; }
}

function write(level: string, values: unknown[]) {
    if (writing) return;
    writing = true;
    try {
        const parts: string[] = [];
        let length = 0;
        for (const value of values) {
            const part = format(value);
            parts.push(part);
            length += part.length + 1;
            if (length >= maxLineBytes) break;
        }
        let line = `${new Date().toISOString()} [${level}] ${parts.join(" ")}\n`;
        if (Buffer.byteLength(line, "utf8") > maxLineBytes) {
            line = Buffer.from(line).subarray(0, maxLineBytes - 32).toString("utf8") + " ...[truncated]\n";
        }
        if (Date.now() >= fileRetryAt) {
            try {
                fs.mkdirSync(logDirectory, { recursive: true });
                rotate();
                fs.appendFileSync(logFile, line, "utf8");
            } catch { fileRetryAt = Date.now() + 5000; }
        }
        const stream = level === "ERROR" || level === "FATAL" || level === "WARN" ? process.stderr : process.stdout;
        if (!failedOutputs.has(stream) && !stream.destroyed && !stream.writableNeedDrain &&
            stream.writableLength + Buffer.byteLength(line, "utf8") <= maxOutputBytes) {
            try {
                if (level === "ERROR" || level === "FATAL") console.error(line.trimEnd());
                else if (level === "WARN") console.warn(line.trimEnd());
                else console.log(line.trimEnd());
            } catch {
                // A debugger's console hook may fail transiently; don't disable the stream.
            }
        }
    } catch {
        // No recursive fallback: unavailable logging must not crash exception handlers.
    } finally { writing = false; }
}

export const log = {
    // Keep the public methods without unexpectedly increasing file I/O.
    trace: (..._values: unknown[]) => {},
    debug: (..._values: unknown[]) => {},
    info: (...values: unknown[]) => write("INFO", values),
    warn: (...values: unknown[]) => write("WARN", values),
    error: (...values: unknown[]) => write("ERROR", values),
    fatal: (...values: unknown[]) => write("FATAL", values),
};

process.on("uncaughtException", (error) => write("ERROR", ["Uncaught Exception:", error]));
process.on("unhandledRejection", (reason) => write("ERROR", ["Unhandled Rejection:", reason]));
