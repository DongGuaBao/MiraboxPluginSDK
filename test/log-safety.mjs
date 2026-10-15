import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import util from "node:util";
import vm from "node:vm";
import { EventEmitter } from "node:events";
import { stripTypeScriptTypes } from "node:module";

const source = stripTypeScriptTypes(fs.readFileSync(new URL("../src/node/log.ts", import.meta.url), "utf8"))
    .replace(/^import .*;$/gm, "")
    .replace("export const log =", "const log =") + "\nglobalThis.testLog = log;";
let time = Date.now();
class Clock extends Date { static now() { return time; } }
class Stream extends EventEmitter {
    writableLength = 0;
    writableNeedDrain = false;
    destroyed = false;
    writes = [];
    write(line, callback) { this.writes.push(line); callback?.(); return true; }
}
const stdout = new Stream();
const stderr = new Stream();
const processMock = Object.assign(new EventEmitter(), { stdout, stderr, cwd: () => "C:/test-plugin" });
let fileWrites = 0;
let fileFailure = false;
let reenter = false;
let log;
const files = [];
const fsMock = {
    existsSync: () => false,
    mkdirSync() {},
    appendFileSync(_file, line) {
        fileWrites++;
        if (fileFailure) throw new Error("disk unavailable");
        files.push(line);
        if (reenter) log.error("nested");
    },
};
const consoleCalls = [];
const consoleMock = {
    log(line) { consoleCalls.push(["log", line]); stdout.write(line + "\n"); },
    warn(line) { consoleCalls.push(["warn", line]); stderr.write(line + "\n"); },
    error(line) { consoleCalls.push(["error", line]); stderr.write(line + "\n"); },
};
const sandbox = { fs: fsMock, path, util, process: processMock, Date: Clock, Buffer, console: consoleMock };
vm.runInNewContext(source, sandbox);
log = sandbox.testLog;
log.info("normal");
assert.match(files.at(-1), /normal/);
assert.equal(stdout.writes.length, 1);
assert.equal(consoleCalls.at(-1)[0], "log");
log.warn("warning");
assert.equal(consoleCalls.at(-1)[0], "warn");
log.fatal("fatal");
assert.equal(consoleCalls.at(-1)[0], "error");

reenter = true;
assert.doesNotThrow(() => log.error("outer"));
reenter = false;
assert.equal(fileWrites, 4);
assert.equal(stderr.writes.length, 3);
assert.ok(!files.some(line => line.includes("nested")));

fileFailure = true;
assert.doesNotThrow(() => log.error("disk-failure"));
const attempts = fileWrites;
for (let index = 0; index < 100; index++) log.error("retry");
assert.equal(fileWrites, attempts);
time += 5001;
fileFailure = false;
log.info("recovered");
assert.equal(fileWrites, attempts + 1);

const throwingValue = new Proxy({}, { getPrototypeOf() { throw new Error("bad value"); } });
assert.doesNotThrow(() => log.error(throwingValue));
assert.match(files.at(-1), /unformattable/);
log.info("x".repeat(1024 * 1024));
assert.ok(Buffer.byteLength(files.at(-1)) <= 65536);
assert.match(files.at(-1), /truncated/);

stdout.writableNeedDrain = true;
const writes = stdout.writes.length;
for (let index = 0; index < 100; index++) log.info("blocked-output");
assert.equal(stdout.writes.length, writes);
stdout.writableNeedDrain = false;
log.info("drained");
assert.equal(stdout.writes.length, writes + 1);
stdout.writableLength = 256 * 1024;
log.info("over-limit");
assert.equal(stdout.writes.length, writes + 1);

stderr.write = () => { throw new Error("write failed"); };
assert.doesNotThrow(() => log.error("stderr failure"));
assert.doesNotThrow(() => stderr.emit("error", new Error("EPIPE")));
assert.doesNotThrow(() => processMock.emit("uncaughtException", new Error("application exception")));
assert.doesNotThrow(() => processMock.emit("unhandledRejection", throwingValue));
assert.match(files.at(-1), /Unhandled Rejection/);

stdout.writableLength = 0;
const normalLog = consoleMock.log;
consoleMock.log = () => { throw new Error("console hook failure"); };
assert.doesNotThrow(() => log.info("hook failure"));
consoleMock.log = normalLog;
const beforeRecovery = consoleCalls.length;
log.info("hook recovered");
assert.equal(consoleCalls.length, beforeRecovery + 1);
consoleMock.log = () => { log.error("recursive console hook"); };
const beforeRecursion = fileWrites;
assert.doesNotThrow(() => log.info("hook reentry"));
assert.equal(fileWrites, beforeRecursion + 1);
consoleMock.log = normalLog;
assert.doesNotThrow(() => stdout.emit("error", new Error("EPIPE")));
const beforeDisabled = consoleCalls.length;
assert.doesNotThrow(() => log.info("disabled output"));
assert.equal(consoleCalls.length, beforeDisabled);
console.log("logger safety tests passed (reentry, disk cooldown, formatting, bounds, pipe errors, process handlers)");
