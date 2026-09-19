/** Lightweight Node logger with no runtime dependencies. */
import fs from "node:fs";
import path from "node:path";
import util from "node:util";

const maxSize = 5 * 1024 * 1024;
const backups = 3;
const now = new Date();
const logDirectory = path.resolve(process.cwd(), "log");
const logFile = path.join(logDirectory, `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}.log`);

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
    if (value instanceof Error) return value.stack || value.message;
    return typeof value === "string" ? value : util.inspect(value, { depth: 5, breakLength: Infinity });
}

function write(level: string, values: unknown[]) {
    const line = `${new Date().toISOString()} [${level}] ${values.map(format).join(" ")}\n`;
    try {
        fs.mkdirSync(logDirectory, { recursive: true });
        rotate();
        fs.appendFileSync(logFile, line, "utf8");
    } catch {}
    const output = level === "ERROR" || level === "FATAL" ? console.error :
        level === "WARN" ? console.warn : console.log;
    output(line.trimEnd());
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

process.on("uncaughtException", (error) => log.error("Uncaught Exception:", error));
process.on("unhandledRejection", (reason) => log.error("Unhandled Rejection:", reason));
