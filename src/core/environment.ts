import "../types";

export type HostKind = "streamdock" | "craft" | "unknown";

export interface HostEnvironment {
    kind: HostKind;
    version: string;
    majorVersion: number | null;
    isStreamDock: boolean;
    isCraft: boolean;
}

type HostVersionSource = string | StreamDock.Argv | StreamDock.ApplicationInfo | null | undefined;

function readVersion(source: HostVersionSource): string {
    if (typeof source === "string") return source.trim();
    if (Array.isArray(source)) return String(source[3]?.application?.version ?? "").trim();
    return String(source?.application?.version ?? "").trim();
}

/** 按宿主启动参数中的 application.version 识别 StreamDock 或 Craft。 */
export function detectHostEnvironment(source: HostVersionSource): HostEnvironment {
    const version = readVersion(source);
    const match = /^(\d+)/.exec(version);
    const majorVersion = match ? Number(match[1]) : 3;
    const kind: HostKind = majorVersion <= 4 ? "streamdock" : "craft";
    return {
        kind,
        version,
        majorVersion,
        isStreamDock: kind === "streamdock",
        isCraft: kind === "craft",
    };
}

export function isCraft(source: HostVersionSource): boolean {
    return detectHostEnvironment(source).isCraft;
}

export function isStreamDock(source: HostVersionSource): boolean {
    return detectHostEnvironment(source).isStreamDock;
}
