import { createHash } from "node:crypto";
import net from "node:net";
import { Plugin } from "../dist/node/index.mjs";

function serverFrame(text) {
    const payload = Buffer.from(text);
    const header = payload.length < 126 ? Buffer.from([0x81, payload.length]) :
        Buffer.from([0x81, 126, payload.length >> 8, payload.length & 255]);
    return Buffer.concat([header, payload]);
}

function clientText(buffer) {
    if (buffer.length < 6) return null;
    let length = buffer[1] & 0x7f;
    let offset = 2;
    if (length === 126) { if (buffer.length < 8) return null; length = buffer.readUInt16BE(2); offset = 4; }
    else if (length === 127) { if (buffer.length < 14) return null; length = Number(buffer.readBigUInt64BE(2)); offset = 10; }
    if (!(buffer[1] & 0x80) || buffer.length < offset + 4 + length) return null;
    const mask = buffer.subarray(offset, offset + 4);
    const payload = Buffer.from(buffer.subarray(offset + 4, offset + 4 + length));
    for (let index = 0; index < payload.length; ++index) payload[index] ^= mask[index & 3];
    return payload.toString();
}

const server = net.createServer((socket) => {
    let input = Buffer.alloc(0);
    let upgraded = false;
    socket.on("data", (chunk) => {
        input = Buffer.concat([input, chunk]);
        if (!upgraded) {
            const end = input.indexOf("\r\n\r\n");
            if (end < 0) return;
            const header = input.subarray(0, end).toString();
            const key = /^Sec-WebSocket-Key:\s*(.+)$/im.exec(header)?.[1].trim();
            if (!key) throw new Error("client handshake key missing");
            const accept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
            socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
            input = input.subarray(end + 4);
            upgraded = true;
        }
        const registration = clientText(input);
        if (!registration) return;
        const value = JSON.parse(registration);
        if (value.uuid !== "test.plugin" || value.event !== "registerPlugin") throw new Error("registration mismatch");
        socket.write(serverFrame(JSON.stringify({ event: "sdkSmoke", payload: { text: "x".repeat(200) } })));
    });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("test server address unavailable");
process.argv[3] = String(address.port);
process.argv[5] = "test.plugin";
process.argv[7] = "registerPlugin";
process.argv[9] = JSON.stringify({ application: { language: "en", version: "3.10.0" } });

const plugin = Plugin.getInstance();
plugin.onMessage = (message) => {
    if (message.event !== "sdkSmoke" || message.payload.text.length !== 200) throw new Error("message mismatch");
    console.log("lightweight WebSocket client smoke test passed");
    process.exit(0);
};
setTimeout(() => { throw new Error("WebSocket smoke test timed out"); }, 5000).unref();
await Plugin.startPlugin();
