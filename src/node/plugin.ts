/**
 * Node 端 Plugin 实现。
 *
 * 使用内置轻量 WebSocket 客户端建立连接，支持：
 * - 零依赖轻量日志
 * - Node inspector 调试（`-dev` 参数）
 * - 从 `process.argv` 读取启动参数
 * - `fs`、`path` 等 Node API
 *
 * ## 启动方式
 *
 * ```ts
 * import { Plugin, Action, log } from '@mirabox/streamdock-sdk/node';
 *
 * class MyPlugin extends Plugin {}
 * class MyAction extends Action {
 *   keyDown(data) { log.info('Key pressed'); }
 * }
 *
 * Plugin.instance = new MyPlugin();
 * Plugin.instance.action['action1'] = MyAction;
 * MyPlugin.startPlugin();
 * ```
 *
 * ## 调试
 *
 * 启动时加 `-dev` 参数可开启 Node inspector（默认端口 9229，可通过
 * `STREAMDOCK_DEBUG_PORT` 环境变量自定义）。
 */
import "../types";
import { BasePlugin } from "../core/base-plugin";
import { Action } from "../core/action";
import { log } from "./log";
import { WebSocketClient } from "./websocket-client";
import inspector from "inspector";
import fs from "fs";
import path from "path";

export { Action, log };

function parseHostJson<T>(raw: string, label: string): T {
    const value = raw.trim();
    const normalized = value.startsWith("'") && value.endsWith("'") ? value.slice(1, -1) : value;
    try {
        return JSON.parse(normalized) as T;
    } catch (error) {
        throw new Error(`Invalid ${label} JSON in plugin startup arguments`);
    }
}

function summarizePayload(payload: any) {
    const settings = payload?.settings ?? payload ?? {};
    const clientId = typeof settings?.clientId === "string" ? settings.clientId : "";
    const clientSecret = typeof settings?.clientSecret === "string" ? settings.clientSecret : "";
    const accessToken = typeof settings?.accessToken === "string" ? settings.accessToken : "";
    return {
        payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : [],
        settingsKeys: settings && typeof settings === "object" ? Object.keys(settings) : [],
        hasClientId: Boolean(clientId),
        clientIdPreview: clientId ? `${clientId.slice(0, 4)}...${clientId.slice(-4)}` : "",
        hasClientSecret: Boolean(clientSecret),
        clientSecretLength: clientSecret.length,
        hasAccessToken: Boolean(accessToken),
    };
}

export class Plugin extends BasePlugin {
    declare ws: WebSocketClient;
    static devWaitForInspector() {
        if (process.argv.some((ele) => ele == "-dev")) {
            try {
                const port = parseInt(process.env.STREAMDOCK_DEBUG_PORT || "9229", 10);
                inspector.open(port, "127.0.0.1", true);
                log.info("Inspector listening at:", inspector.url());
            } catch (e) {
                log.info("Failed to open inspector:", e);
            }
        }
    }
    /**
     * 启动插件：初始化语言/i18n，建立 WebSocket 连接。
     *
     * @remarks
     * - 必须先设置 `Plugin.instance` 和 `Plugin.instance.action` 再调用
     * - 如果命令行含 `-dev`，开启 Node inspector 调试
     */
    static async startPlugin() {
        this.hasInit = true;
        const application = parseHostJson<StreamDock.ApplicationInfo>(process.argv[9], "application info");
        const instance = this.getInstance();
        instance.setHostInfo(application);

        if (process.argv.some((ele) => ele == "-dev")) {
            global.language = application.application.language;
            global.i18n = JSON.parse(fs.readFileSync(path.join(process.cwd(), `language/${language}.json`)).toString());
        } else {
            const pluginTemp = process.argv.length >= 12 ? parseHostJson<StreamDock.Argv[4]>(process.argv[11], "action info") : null;
            try {
                instance.onStart([process.argv[3], process.argv[5], process.argv[7], application, pluginTemp]);
            } catch {}

            try {
                global.language = application.application.language;
                global.i18n = JSON.parse(fs.readFileSync(path.join(process.cwd(), `${language}.json`)).toString());
            } catch {}
        }

        log.info("start plugin");
        instance.connect();
    }
    onStart(argv: StreamDock.Argv) {}
    onExit(): boolean {
        return false;
    }
    onMessage(message: any): boolean {
        return false;
    }
    /**
     * 建立 WebSocket 连接并注册到 Stream Dock。
     *
     * 连接参数从 `process.argv` 中读取（由 Stream Dock 传入）：
     * - `process.argv[3]` — WebSocket 端口
     * - `process.argv[5]` — 插件 UUID
     * - `process.argv[7]` — 注册事件名称
     */
    connect() {
        this.language = global.language;
        this.uuid = process.argv[5];
        this.ws = new WebSocketClient("ws://127.0.0.1:" + process.argv[3]);

        this.ws.on("open", () => {
            this.ws.send(JSON.stringify({ uuid: process.argv[5], event: process.argv[7] }));
        });
        this.ws.on("close", () => {
            try {
                if (!this.onExit()) process.exit();
            } catch {
                process.exit();
            }
        });
        this.ws.on("error", (error) => log.error("WebSocket error:", error));
        this.ws.on("message", (e) => {
            const data: any = JSON.parse(e.toString());
            if (data.event === "didReceiveGlobalSettings") {
                log.info("SDK received didReceiveGlobalSettings", summarizePayload(data.payload));
            } else if (data.event === "sendToPlugin" && data.payload?.__authDebug) {
                log.info("SDK received auth debug sendToPlugin", data.payload);
            }
            if (this.onMessage(data)) return;
            if (this.getGlobalSettingsFlag) {
                this.getGlobalSettingsFlag = false;
                this.getGlobalSettings();
            }
            if (data.event === "didReceiveGlobalSettings") {
                this.globalSettings = (data.payload?.settings ?? data.payload ?? {}) as JsonObject;
            }
            if ((this as any)[data.event]) {
                if ((this as any)[data.event](data)) return;
            }

            this.dispatchAction(data);
        });
    }
}
