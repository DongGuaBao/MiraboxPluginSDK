import { FONT_WIDTH_PAGE_DATA, FONT_WIDTH_QUANTUM, FONT_WIDTH_TABLES, type PackedFontWidth } from "./generated/font-widths";

export interface MeasureSvgTextOptions {
    family?: string;
    fontSize: number;
    letterSpacing?: number;
}

const decodedPages = new Map<string, Uint8Array>();

function decode(value: string): Uint8Array {
    const binary = globalThis.atob(value);
    const output = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; ++index) output[index] = binary.charCodeAt(index);
    return output;
}

function selectFont(familyList = "Segoe UI"): [string, PackedFontWidth] {
    for (const candidate of familyList.split(',')) {
        const family = candidate.trim().replace(/^['"]|['"]$/g, "");
        const exact = FONT_WIDTH_TABLES[family];
        if (exact) return [family, exact];
        const key = Object.keys(FONT_WIDTH_TABLES).find((name) => name.toLowerCase() === family.toLowerCase());
        if (key) return [key, FONT_WIDTH_TABLES[key]];
    }
    return ["Segoe UI", FONT_WIDTH_TABLES["Segoe UI"]];
}

function widthFor(fontName: string, font: PackedFontWidth, codePoint: number): number {
    if (codePoint === 9) return font.spaceWidth * 4;
    if (codePoint > 0xffff) return FONT_WIDTH_QUANTUM;
    const page = codePoint >>> 8;
    const offset = codePoint & 255;
    const dense = font.densePages[page];
    if (dense !== undefined) {
        const key = `${fontName}:d:${page}`;
        let values = decodedPages.get(key);
        if (!values) { values = decode(FONT_WIDTH_PAGE_DATA[dense]); decodedPages.set(key, values); }
        return values[offset];
    }
    const sparse = font.sparsePages[page];
    if (sparse !== undefined) {
        const key = `${fontName}:s:${page}`;
        let values = decodedPages.get(key);
        if (!values) {
            values = new Uint8Array(256);
            values.fill(sparse[0]);
            const exceptions = decode(FONT_WIDTH_PAGE_DATA[sparse[1]]);
            for (let index = 0; index < exceptions.length; index += 2)
                values[exceptions[index]] = exceptions[index + 1];
            decodedPages.set(key, values);
        }
        return values[offset];
    }
    for (const [first, last, width] of font.constantRanges)
        if (page >= first && page <= last) return width;
    return font.defaultWidth;
}

export function measureSvgText(text: string, options: MeasureSvgTextOptions): number {
    const fontSize = Number.isFinite(options.fontSize) ? Math.max(0, options.fontSize) : 0;
    const letterSpacing = Number.isFinite(options.letterSpacing) ? options.letterSpacing ?? 0 : 0;
    const [fontName, font] = selectFont(options.family);
    let current = 0;
    let widest = 0;
    let visible = 0;
    for (const character of text) {
        if (character === '\n') {
            widest = Math.max(widest, current + Math.max(0, visible - 1) * letterSpacing);
            current = 0;
            visible = 0;
            continue;
        }
        const width = widthFor(fontName, font, character.codePointAt(0)!);
        current += width / FONT_WIDTH_QUANTUM * fontSize;
        if (width) ++visible;
    }
    return Math.max(widest, current + Math.max(0, visible - 1) * letterSpacing);
}

export function supportedSvgFonts(): readonly string[] {
    return Object.keys(FONT_WIDTH_TABLES);
}
