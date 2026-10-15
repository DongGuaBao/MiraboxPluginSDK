export type SendData = string | Uint8Array | Blob;

export interface SendTransport {
    bufferedBytes(): number;
    canWrite?(): boolean;
    write(data: SendData): void;
    abort(error: Error): void;
}

/** Bounds retained messages as well as the underlying transport buffer. */
export class SendBuffer {
    static readonly MAX_BYTES = 16 * 1024 * 1024;
    static readonly HIGH_WATER_BYTES = 1024 * 1024;
    private queue: { data: SendData; bytes: number; key?: string }[] = [];
    private queuedBytes = 0;
    private timer?: ReturnType<typeof setTimeout>;
    private blockedSince = 0;
    private stopped = false;
    private previousTransportBytes = 0;

    private transport: SendTransport;
    constructor(transport: SendTransport) { this.transport = transport; }

    get bufferedAmount(): number { return this.queuedBytes + this.transport.bufferedBytes(); }

    send(data: SendData, key?: string): void {
        if (this.stopped) throw new Error("Send buffer is closed");
        const bytes = typeof data === "string" ? new TextEncoder().encode(data).byteLength : data instanceof Uint8Array ? data.byteLength : data.size;
        // Ordinary commands are ordering barriers; merge images only after the last barrier.
        let replaceIndex = -1;
        if (key !== undefined) for (let index = this.queue.length - 1; index >= 0; index--) {
            if (this.queue[index].key === undefined) break;
            if (this.queue[index].key === key) { replaceIndex = index; break; }
        }
        const replacedBytes = replaceIndex < 0 ? 0 : this.queue[replaceIndex].bytes;
        if (bytes > SendBuffer.MAX_BYTES || this.bufferedAmount - replacedBytes + bytes > SendBuffer.MAX_BYTES || (replaceIndex < 0 && this.queue.length >= 1024)) {
            throw new Error("WebSocket send buffer limit exceeded (16 MiB / 1024 messages)");
        }
        if (replaceIndex >= 0) { this.queuedBytes -= replacedBytes; this.queue.splice(replaceIndex, 1); }
        this.queue.push({ data, bytes, key });
        this.queuedBytes += bytes;
        this.flush();
    }

    flush(): void {
        if (this.stopped) return;
        const transportBytes = this.transport.bufferedBytes();
        if (transportBytes < this.previousTransportBytes) this.blockedSince = Date.now();
        try {
            while (this.queue.length && this.transport.bufferedBytes() < SendBuffer.HIGH_WATER_BYTES && (this.transport.canWrite?.() ?? true)) {
                const item = this.queue.shift()!;
                this.queuedBytes -= item.bytes;
                this.transport.write(item.data);
                this.blockedSince = Date.now();
            }
        } catch (error) {
            this.dispose();
            this.transport.abort(error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
        this.previousTransportBytes = this.transport.bufferedBytes();
        if (this.bufferedAmount === 0) {
            this.blockedSince = 0;
            if (this.timer) clearTimeout(this.timer);
            this.timer = undefined;
            return;
        }
        if (!this.blockedSince) this.blockedSince = Date.now();
        if (Date.now() - this.blockedSince >= 10_000) {
            this.dispose();
            this.transport.abort(new Error("WebSocket send buffer made no progress for 10000ms"));
            return;
        }
        if (!this.timer) {
            this.timer = setTimeout(() => {
                this.timer = undefined;
                try { this.flush(); } catch { /* abort already notified the transport */ }
            }, 20);
        }
    }

    dispose(): void {
        this.stopped = true;
        if (this.timer) clearTimeout(this.timer);
        this.timer = undefined;
        this.queue = [];
        this.queuedBytes = 0;
    }
}
