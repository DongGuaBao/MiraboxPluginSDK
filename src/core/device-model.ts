/** Browser-safe MD5 used for StreamDock's hardware device identifiers. */
export function md5(value: string): string {
    const input = new TextEncoder().encode(value);
    const bitLength = input.length * 8;
    const paddedLength = (((input.length + 8) >>> 6) + 1) * 64;
    const bytes = new Uint8Array(paddedLength);
    bytes.set(input);
    bytes[input.length] = 0x80;
    const view = new DataView(bytes.buffer);
    view.setUint32(paddedLength - 8, bitLength >>> 0, true);
    view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);

    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;
    const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    const constants = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0);

    for (let offset = 0; offset < bytes.length; offset += 64) {
        let a = a0;
        let b = b0;
        let c = c0;
        let d = d0;
        for (let index = 0; index < 64; index += 1) {
            let f: number;
            let word: number;
            if (index < 16) { f = (b & c) | (~b & d); word = index; }
            else if (index < 32) { f = (d & b) | (~d & c); word = (5 * index + 1) % 16; }
            else if (index < 48) { f = b ^ c ^ d; word = (3 * index + 5) % 16; }
            else { f = c ^ (b | ~d); word = (7 * index) % 16; }
            const shift = shifts[Math.floor(index / 16) * 4 + (index % 4)];
            const sum = (a + f + constants[index] + view.getUint32(offset + word * 4, true)) >>> 0;
            const rotated = ((sum << shift) | (sum >>> (32 - shift))) >>> 0;
            [a, b, c, d] = [d, (b + rotated) >>> 0, b, c];
        }
        a0 = (a0 + a) >>> 0;
        b0 = (b0 + b) >>> 0;
        c0 = (c0 + c) >>> 0;
        d0 = (d0 + d) >>> 0;
    }
    return [a0, b0, c0, d0].map(number => [0, 8, 16, 24].map(shift => ((number >>> shift) & 0xff).toString(16).padStart(2, "0")).join("")).join("");
}

export function parseStreamDockDevices(ini: string): Map<string, string> {
    const result = new Map<string, string>();
    let inCurrentDevices = false;
    for (const rawLine of ini.replace(/^\uFEFF/, "").split(/\r?\n/)) {
        const line = rawLine.trim();
        const section = /^\[([^\]]+)]$/.exec(line);
        if (section) { inCurrentDevices = section[1] === "StreamDockCurrentDevice"; continue; }
        if (!inCurrentDevices || !line || line.startsWith(";") || line.startsWith("#")) continue;
        const entry = /^(.+?)\\SerialNumber=(.*)$/.exec(line);
        if (!entry) continue;
        const encodedModel = entry[1].trim();
        const serialNumber = entry[2].trim();
        let model = encodedModel;
        try { model = decodeURIComponent(encodedModel); } catch {}
        result.set(md5(model + serialNumber), model);
    }
    return result;
}
