import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import { createHash } from "node:crypto";
import { stripTypeScriptTypes } from "node:module";

const sourceUrl = path => "data:text/javascript;base64," + Buffer.from(stripTypeScriptTypes(fs.readFileSync(new URL(path, import.meta.url), "utf8"))).toString("base64");
const bufferUrl = sourceUrl("../src/core/send-buffer.ts");
const { SendBuffer } = await import(bufferUrl);
const importSource = (path, from) => {
    const source = stripTypeScriptTypes(fs.readFileSync(new URL(path, import.meta.url), "utf8")).replace(from, bufferUrl);
    return import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
};

let heldBytes = SendBuffer.HIGH_WATER_BYTES;
const written = [];
let aborted;
const buffer = new SendBuffer({ bufferedBytes: () => heldBytes, write: value => written.push(value), abort: error => { aborted = error; } });
try {
    for (let index = 0; index < 10000; index++) {
        buffer.send(`a-${index}`, "a");
        buffer.send(`b-${index}`, "b");
    }
    assert.equal(buffer.bufferedAmount, heldBytes + 12);
    buffer.send("state");
    buffer.send("new-a", "a");
    assert.throws(() => buffer.send(new Uint8Array(SendBuffer.MAX_BYTES)), /limit exceeded/);
    heldBytes = 0;
    buffer.flush();
    assert.deepEqual(written, ["a-9999", "b-9999", "state", "new-a"]);
    assert.equal(buffer.bufferedAmount, 0);
    heldBytes = SendBuffer.HIGH_WATER_BYTES;
    buffer.send("stalled");
    const realNow = Date.now;
    try {
        const now = Date.now();
        Date.now = () => now + 10001;
        await new Promise(resolve => setTimeout(resolve, 40));
    } finally { Date.now = realNow; }
    assert.match(aborted.message, /no progress/);
    assert.throws(() => buffer.send("after-close"), /closed/);
} finally { buffer.dispose(); }

const countBuffer = new SendBuffer({ bufferedBytes: () => SendBuffer.HIGH_WATER_BYTES, write() {}, abort() {} });
try {
    for (let index = 0; index < 1024; index++) countBuffer.send("command");
    assert.throws(() => countBuffer.send("overflow"), /1024 messages/);
} finally { countBuffer.dispose(); }

let progressingBytes = SendBuffer.HIGH_WATER_BYTES;
let progressAbort = false;
const progressing = new SendBuffer({ bufferedBytes: () => progressingBytes, write() {}, abort() { progressAbort = true; } });
try {
    progressing.send("progress");
    const now = Date.now;
    try {
        const start = now();
        Date.now = () => start + 10001;
        progressingBytes--;
        progressing.flush();
        assert.equal(progressAbort, false);
    } finally { Date.now = now; }
} finally { progressing.dispose(); }

const { protectWebSocket } = await importSource("../src/web/send-buffer.ts", "../core/send-buffer");
class FakeWebSocket extends EventTarget {
    static OPEN = 1;
    readyState = 1;
    bufferedAmount = SendBuffer.HIGH_WATER_BYTES;
    sent = [];
    send(data) { this.sent.push(data); }
    close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
}
const previousWebSocket = globalThis.WebSocket;
globalThis.WebSocket = FakeWebSocket;
try {
    const socket = protectWebSocket(new FakeWebSocket());
    for (let index = 0; index < 1000; index++) socket.sendImage(`image-${index}`, "one");
    socket.send("settings");
    socket.bufferedAmount = 0;
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.deepEqual(socket.sent, ["image-999", "settings"]);
    socket.send(new Uint8Array([1, 2, 3]));
    assert.deepEqual([...socket.sent[2]], [1, 2, 3]);
    const blob = new Blob(["blob"]);
    socket.send(blob);
    assert.equal(socket.sent[3], blob);
    socket.close();
    assert.throws(() => socket.send("closed"), /not open/);
} finally { globalThis.WebSocket = previousWebSocket; }

const { WebSocketClient } = await importSource("../src/node/websocket-client.ts", "../core/send-buffer");
let peer;
const server = net.createServer(socket => {
    peer = socket;
    socket.once("data", data => {
        const key = /Sec-WebSocket-Key: (.*)\r\n/.exec(data.toString())[1];
        const accept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
        socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
        socket.pause();
    });
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const client = new WebSocketClient(`ws://127.0.0.1:${server.address().port}`);
client.on("error", () => {});
try {
    await new Promise((resolve, reject) => { client.once("open", resolve); client.once("error", reject); });
    const image = "x".repeat(256 * 1024);
    for (let batch = 0; batch < 4; batch++) {
        for (let index = 0; index < 128; index++) client.sendImage(image, index % 2 ? "a" : "b");
        await new Promise(resolve => setTimeout(resolve, 30));
        assert.ok(client.bufferedAmount < 2 * 1024 * 1024, `unexpected growth: ${client.bufferedAmount}`);
    }
    let overflow = false;
    for (let index = 0; index < 100; index++) {
        try { client.send(image); } catch (error) { assert.match(error.message, /limit exceeded/); overflow = true; break; }
    }
    assert.equal(overflow, true);
    assert.ok(client.bufferedAmount <= SendBuffer.MAX_BYTES);
    const queued = client.bufferedAmount;
    client.socket.destroy();
    await new Promise(resolve => client.once("close", resolve));
    assert.equal(client.sender.queue.length, 0);
    assert.throws(() => client.send(image), /not open/);
    console.log(`send buffer tests passed; stalled Node buffer bounded at ${(queued / 1048576).toFixed(2)} MiB`);
} finally {
    client.socket.destroy();
    peer?.destroy();
    await new Promise(resolve => server.close(resolve));
}
