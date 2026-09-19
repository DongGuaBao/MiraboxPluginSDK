/**
 * Web 端 Plugin 实现。
 *
 * 使用浏览器原生 WebSocket 连接，运行在 Stream Dock 内嵌的浏览器环境中。
 *
 * ## 与 Node 端的区别
 *
 * | 特性 | Node 端 | Web 端 |
 * |------|---------|--------|
 * | WebSocket | `ws` 库 | 浏览器原生 |
 * | 日志 | 轻量文件日志 (`log`) | 不可用 |
 * | Node API | fs, path, inspector | 不可用 |
 * | 启动入口 | `process.argv` | `window.argv` |
 * | 语言文件 | 本地 fs 读取 | `fetch('./<lang>.json')` |
 *
 * ## 启动方式
 *
 * ```ts
 * import { Plugin, Action } from '@mirabox/streamdock-sdk/web';
 *
 * class MyPlugin extends Plugin {}
 * class MyAction extends Action {
 *   keyDown(data) { console.log('Key pressed'); }
 * }
 *
 * Plugin.instance = new MyPlugin();
 * Plugin.instance.action['action1'] = MyAction;
 * Plugin.startPlugin();
 * ```
 *
 * @remarks
 * 不能在 Web 端使用 `require()`、`fs`、`path`、`inspector` 等 Node API。
 * 不能从 `@mirabox/streamdock-sdk/node` 导入 `log`。
 */
import "../types";
import { BasePlugin } from "../core/base-plugin";
import { Action } from "../core/action";
import { ensureSDSocketPolyfill } from "./polyfill";

export { Action };

export class Plugin extends BasePlugin {
    declare ws: WebSocket;

    /**
     * 初始化插件：加载语言文件、注入 polyfill、延迟启动。
     *
     * @remarks
     * 将 `window.startPlugin` 赋值为实际的启动函数，
     * 真正的连接在 `connectElgatoStreamDeckSocket` 调用 `startPlugin()` 时触发。
     */
    static async initPlugin() {
        this.hasInit = true;
        const Self = this;
        window.startPlugin = async function () {
            const instance = Self.getInstance();
            instance.setHostInfo(window.argv[3]);
            try {
                instance.onStart([window.argv[0], window.argv[1], window.argv[2], window.argv[3], window.argv.length >= 5 ? window.argv[4] : null]);
            } catch {}
            let response: any;
            try {
                response = await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open("GET", `./${window.argv[3].application.language}.json`);
                    xhr.onload = () => {
                        try {
                            if (xhr.status === 200) {
                                resolve(JSON.parse(xhr.responseText));
                            } else {
                                reject(new Error(`HTTP ${xhr.status}`));
                            }
                        } catch (error) {
                            reject(error);
                        }
                    };
                    xhr.onerror = () => reject(new Error("Network error"));
                    xhr.send();
                });
                window._i18n = response["Localization"] || {};
            } catch {
                window._i18n = {};
            }
            instance.connect();
        };

        ensureSDSocketPolyfill();
    }
    onStart(argv: StreamDock.Argv) {}
    onMessage(message: any): boolean {
        return false;
    }
    onExit() {}
    /**
     * 启动插件（如果尚未初始化则自动调用 initPlugin）。
     */
    static async startPlugin() {
        if (!this.hasInit) {
            await this.initPlugin();
        }
    }

    /**
     * 建立 WebSocket 连接并注册到 Stream Dock。
     *
     * 连接参数从 `window.argv` 中读取：
     * - `window.argv[0]` — WebSocket 端口
     * - `window.argv[1]` — 插件 UUID
     * - `window.argv[2]` — 注册事件名称
     */
    connect() {
        this.language = window.argv[3].application.language;
        this.uuid = window.argv[1];
        this.ws = new WebSocket("ws://127.0.0.1:" + window.argv[0]);
        this.ws.onopen = () => this.ws.send(JSON.stringify({ event: window.argv[2], uuid: window.argv[1] }));
        this.ws.onclose = () => this.onExit();
        this.ws.onerror = () => this.onExit();
        this.ws.onmessage = this.onmessage.bind(this);
    }

    /** WebSocket 消息处理 */
    onmessage(a: MessageEvent) {
        let e = a.data;

        const data: any = JSON.parse(e.toString());
        try {
            if (this.onMessage(data)) return;
        } catch {}
        if (this.getGlobalSettingsFlag) {
            this.getGlobalSettingsFlag = false;
            this.getGlobalSettings();
        }
        if ((this as any)[data.event]) {
            if ((this as any)[data.event](data)) return;
        }
        if (data.event === "didReceiveGlobalSettings") {
            this.globalSettings = (data.payload?.settings ?? data.payload ?? {}) as JsonObject;
        }
        if (data.event == "deviceDidConnect") {
            this.devices[(data as any).device] = true;
        }
        if (data.event == "deviceDidDisconnect") {
            this.devices[(data as any).device] = false;
        }
        this.dispatchAction(data);
    }
}
