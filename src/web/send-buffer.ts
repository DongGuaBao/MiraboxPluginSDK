import { SendBuffer, type SendData } from "../core/send-buffer";

export function protectWebSocket(socket: WebSocket): WebSocket & { sendImage(data: string, context: string): void } {
    const nativeSend = socket.send.bind(socket);
    const buffer = new SendBuffer({
        bufferedBytes: () => socket.bufferedAmount,
        write: data => nativeSend(data as Parameters<WebSocket["send"]>[0]),
        abort: () => socket.close(4000, "Send buffer stalled"),
    });
    const send = (data: SendData, key?: string) => {
        if (socket.readyState !== WebSocket.OPEN) throw new Error("WebSocket is not open");
        buffer.send(data, key);
    };
    socket.send = data => {
        if (typeof data === "string" || data instanceof Blob) send(data);
        else if (ArrayBuffer.isView(data)) send(new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice());
        else send(new Uint8Array(data).slice());
    };
    const protectedSocket = socket as WebSocket & { sendImage(data: string, context: string): void };
    protectedSocket.sendImage = (data, context) => send(data, context);
    socket.addEventListener("close", () => buffer.dispose(), { once: true });
    socket.addEventListener("error", () => buffer.dispose(), { once: true });
    return protectedSocket;
}
