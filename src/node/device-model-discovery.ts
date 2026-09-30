import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseStreamDockDevices } from "../core/device-model";

export { parseStreamDockDevices } from "../core/device-model";

export interface DeviceModelDiscoveryOptions {
    /** Override the StreamDock INI path, primarily for portable installations and tests. */
    configPath?: string;
}

let enabled = false;
let options: DeviceModelDiscoveryOptions = {};
let deviceModels = new Map<string, string>();

export function enableDeviceModelDiscovery(next: DeviceModelDiscoveryOptions = {}): void {
    enabled = true;
    options = { ...next };
}

export function isDeviceModelDiscoveryEnabled(): boolean {
    return enabled;
}

export function defaultStreamDockConfigPath(): string {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "HotSpot", "StreamDock", "config", "StreamDockConfig.ini");
}

export function initializeDeviceModelDiscovery(): ReadonlyMap<string, string> {
    if (!enabled) return deviceModels;
    try {
        deviceModels = parseStreamDockDevices(fs.readFileSync(options.configPath || defaultStreamDockConfigPath(), "utf8"));
    } catch {
        deviceModels = new Map();
    }
    return deviceModels;
}

export function getDeviceModel(deviceId: string): string | undefined {
    return enabled ? deviceModels.get(deviceId.toLowerCase()) : undefined;
}

