import { createHash, randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import net from "node:net";

const websocketGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const maxPayload = 64 * 1024 * 1024;

export class WebSocketClient extends EventEmitter {
    private socket: net.Socket;
    private input: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    private handshakeComplete = false;
    private closed = false;
    private readonly key = randomBytes(16).toString("base64");
    private fragmentOpcode = 0;
    private fragments: Buffer[] = [];

    constructor(address: string) {
        super();
        const url = new URL(address);
        if (url.protocol !== "ws:") throw new Error("Only ws:// WebSocket URLs are supported");
        const port = Number(url.port || 80);
        this.socket = net.createConnection({ host: url.hostname, port });
        this.socket.setNoDelay(true);
        this.socket.once("connect", () => {
            const target = `${url.pathname || "/"}${url.search}`;
            this.socket.write(`GET ${target} HTTP/1.1\r\nHost: ${url.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${this.key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
        });
        this.socket.on("data", (chunk) => this.receive(typeof chunk === "string" ? Buffer.from(chunk) : chunk));
        this.socket.on("error", (error) => {
            if (this.listenerCount("error")) this.emit("error", error);
            this.finishClose();
        });
        this.socket.on("close", () => this.finishClose());
    }

    send(data: string | Buffer) {
        if (!this.handshakeComplete || this.closed) throw new Error("WebSocket is not open");
        this.writeFrame(Buffer.isBuffer(data) ? data : Buffer.from(data), Buffer.isBuffer(data) ? 2 : 1);
    }

    close(code = 1000, reason = "") {
        if (this.closed) return;
        const reasonBytes = Buffer.from(reason).subarray(0, 123);
        const payload = Buffer.allocUnsafe(2 + reasonBytes.length);
        payload.writeUInt16BE(code);
        reasonBytes.copy(payload, 2);
        if (this.handshakeComplete) this.writeFrame(payload, 8);
        this.socket.end();
    }

    private receive(chunk: Buffer<ArrayBufferLike>) {
        this.input = this.input.length ? Buffer.concat([this.input, chunk]) : chunk;
        if (!this.handshakeComplete) {
            const end = this.input.indexOf("\r\n\r\n");
            if (end < 0) return;
            const header = this.input.subarray(0, end).toString("latin1");
            const expected = createHash("sha1").update(this.key + websocketGuid).digest("base64");
            const accept = header.split("\r\n").find((line) => line.toLowerCase().startsWith("sec-websocket-accept:"))?.slice(21).trim();
            if (!/^HTTP\/1\.1 101\b/.test(header) || accept !== expected) {
                this.socket.destroy(new Error("Invalid WebSocket upgrade response"));
                return;
            }
            this.handshakeComplete = true;
            this.input = this.input.subarray(end + 4);
            this.emit("open");
        }
        this.parseFrames();
    }

    private parseFrames() {
        while (this.input.length >= 2) {
            const first = this.input[0];
            const second = this.input[1];
            const final = (first & 0x80) !== 0;
            const opcode = first & 0x0f;
            if (first & 0x70) return this.fail("Unsupported WebSocket extension frame");
            const masked = (second & 0x80) !== 0;
            let length = second & 0x7f;
            let offset = 2;
            if (length === 126) {
                if (this.input.length < 4) return;
                length = this.input.readUInt16BE(2);
                offset = 4;
            } else if (length === 127) {
                if (this.input.length < 10) return;
                const wide = this.input.readBigUInt64BE(2);
                if (wide > BigInt(maxPayload)) return this.fail("WebSocket payload is too large");
                length = Number(wide);
                offset = 10;
            }
            if (length > maxPayload) return this.fail("WebSocket payload is too large");
            if (opcode >= 8 && (!final || length > 125)) return this.fail("Invalid WebSocket control frame");
            const maskOffset = offset;
            if (masked) offset += 4;
            if (this.input.length < offset + length) return;
            const payload = Buffer.from(this.input.subarray(offset, offset + length));
            if (masked) for (let index = 0; index < payload.length; ++index)
                payload[index] ^= this.input[maskOffset + (index & 3)];
            this.input = this.input.subarray(offset + length);
            this.handleFrame(opcode, final, payload);
            if (this.closed) return;
        }
    }

    private handleFrame(opcode: number, final: boolean, payload: Buffer) {
        if (opcode === 8) {
            if (!this.closed) this.writeFrame(payload, 8);
            this.socket.end();
            this.finishClose();
            return;
        }
        if (opcode === 9) { this.writeFrame(payload, 10); return; }
        if (opcode === 10) return;
        if (opcode === 1 || opcode === 2) {
            if (this.fragmentOpcode) return this.fail("Unexpected WebSocket data frame");
            if (final) { this.emit("message", payload); return; }
            this.fragmentOpcode = opcode;
            this.fragments = [payload];
            return;
        }
        if (opcode === 0 && this.fragmentOpcode) {
            this.fragments.push(payload);
            if (final) {
                const message = Buffer.concat(this.fragments);
                this.fragmentOpcode = 0;
                this.fragments = [];
                this.emit("message", message);
            }
            return;
        }
        this.fail("Unsupported WebSocket frame");
    }

    private writeFrame(payload: Buffer, opcode: number) {
        const extended = payload.length < 126 ? 0 : payload.length <= 0xffff ? 2 : 8;
        const header = Buffer.allocUnsafe(2 + extended + 4);
        header[0] = 0x80 | opcode;
        header[1] = 0x80 | (extended ? (extended === 2 ? 126 : 127) : payload.length);
        if (extended === 2) header.writeUInt16BE(payload.length, 2);
        else if (extended === 8) header.writeBigUInt64BE(BigInt(payload.length), 2);
        const maskOffset = 2 + extended;
        const mask = randomBytes(4);
        mask.copy(header, maskOffset);
        const encoded = Buffer.allocUnsafe(payload.length);
        for (let index = 0; index < payload.length; ++index) encoded[index] = payload[index] ^ mask[index & 3];
        this.socket.write(Buffer.concat([header, encoded]));
    }

    private fail(message: string) { this.socket.destroy(new Error(message)); }
    private finishClose() {
        if (this.closed) return;
        this.closed = true;
        this.emit("close");
    }
}
