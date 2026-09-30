import { parseStreamDockDevices } from "../core/device-model";

export interface WebDeviceModelDiscoveryOptions {
    /** Relative URL resolved from the plugin directory. */
    configPath?: string;
}

let enabled = false;
let configPath = "../../config/StreamDockConfig.ini";
let deviceModels = new Map<string, string>();

export function enableWebDeviceModelDiscovery(options: WebDeviceModelDiscoveryOptions = {}): void {
    enabled = true;
    configPath = options.configPath || "../../config/StreamDockConfig.ini";
}

export async function initializeWebDeviceModelDiscovery(): Promise<void> {
    if (!enabled) return;
    try {
        const response = await fetch(configPath, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        deviceModels = parseStreamDockDevices(await response.text());
    } catch {
        deviceModels = new Map();
    }
}

export function getWebDeviceModel(deviceId: string): string | undefined {
    return enabled ? deviceModels.get(deviceId.toLowerCase()) : undefined;
}
