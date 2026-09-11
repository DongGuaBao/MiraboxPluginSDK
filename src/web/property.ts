/**
 * Property Inspector 属性检查器基类。
 *
 * 运行在 Stream Dock 内嵌浏览器中，为用户提供按键的配置 UI。
 * 基于 Vue 3，settings 通过 `ref` + `watch` 实现双向绑定和自动持久化。
 *
 * ## Settings 自动持久化
 *
 * **Property Inspector 中的 settings 变更会自动保存，不需要手动调用 setSettings。**
 *
 * `this.settings` 是一个 Vue `ref`，watch 会监听其深层变化，
 * 一旦检测到变化就自动发送 `setSettings` 命令到 Stream Dock：
 *
 * ```ts
 * this.settings = ref(window.argv[4].payload.settings);
 * watch(this.settings, () => {
 *   if (this.preventWatch) return;  // 防止外部更新时循环触发
 *   this.ws.send(JSON.stringify({
 *     event: 'setSettings',
 *     context: window.argv[1],
 *     payload: this.settings.value,
 *   }));
 * }, { deep: true });
 * ```
 *
 * 收到 `didReceiveSettings` 时 SDK 会设置 `preventWatch = true`
 * 防止外部更新触发循环保存。
 *
 * ## 环境限制
 *
 * Property Inspector 运行在 **浏览器环境**：
 * - **不能** `require()` / `import` Node 模块
 * - **不能**使用 `fs`、`path`、`ws`、`inspector` 等 Node API
 * - **不能**从 `@mirabox/streamdock-sdk/node` 导入 `log`
 *
 * ## 启动方式
 *
 * ```ts
 * import { Property } from '@mirabox/streamdock-sdk/property';
 * import PropertyPage from './Property.vue';
 *
 * Property.startProperty(PropertyPage);
 * ```
 *
 * ## RPC 通信
 *
 * Property Inspector 可以通过 `callPlugin()` 或 `getPluginProxy()` Proxy 调用 Plugin 端方法：
 *
 * ```ts
 * await property.callPlugin('doSomething', arg1, arg2);
 * // 或
 * const plugin = property.getPluginProxy()
 * await plugin.doSomething(arg1, arg2);
 * ```
 */
import "../types";
import { RpcChannel } from "../core/rpc";
import { detectHostEnvironment, type HostEnvironment } from "../core/environment";
import { ensureSDSocketPolyfill } from "./polyfill";
import { createApp, onMounted, watch, reactive, type Reactive } from "vue";

export { detectHostEnvironment, isCraft, isStreamDock } from "../core/environment";
export type { HostEnvironment, HostKind } from "../core/environment";
export { QtWebChannelStore, createCraftQtChannel, getCraftQtChannel, hasCraftQtChannel, resetCraftQtChannel, setCraftQtTransportProbe } from "./qt-web-channel";
export type { CraftFileSelection } from "./qt-web-channel";
export { useToast, useToastState, copyText } from "./toast";
export type { ToastItem, ToastVariant } from "./toast";

/** 子窗口的可序列化状态，不包含原始 Window 句柄。 */
export interface SubWindowInfo {
    id: string;
    name: string;
    openedAt: number;
}

interface SubWindowEntry {
    info: SubWindowInfo;
    window: Window | null;
}

type PropertyChildEvent =
    | "willAppear"
    | "didReceiveSettings"
    | "didReceiveGlobalSettings"
    | "sendToPropertyInspector";

interface PropertyInterface {
    /** 运行时配置 */
    settings: JsonObject;
    globalSettings: JsonObject;
    environment: HostEnvironment;
    isCraft: boolean;
    isStreamDock: boolean;
    /** 调用插件方法（透传 instance.callPlugin） */
    callPlugin: (...args: any[]) => void;
    /** 获取全局配置 */
    getGlobalSettings: () => void;
    /** 设置全局配置 */
    setGlobalSettings: (data: JsonObject) => void;
    getI18n: () => any;
    /** 向插件发送消息 */
    sendToPlugin: (payload: JsonObject) => void;
    /** 在默认浏览器中打开 URL */
    openUrl: (url: string) => void;
    didReceiveGlobalSettings: (data: StreamDockEvents.DidReceiveGlobalSettings) => void;
    didReceiveSettings: (data: StreamDockEvents.DidReceiveSettings) => void;
    willAppear: (data: StreamDockEvents.WillAppear) => void;
    setPreventWatch: (preventWatch: boolean) => void;
    sendToPropertyInspector: (data: StreamDockEvents.SendToPropertyInspector) => void;
    closeSubWindow: (idOrName: string) => void;
    closeSubWindowsByName: (name: string) => void;
    getSubWindow: (id: string) => SubWindowInfo | undefined;
    getSubWindows: () => SubWindowInfo[];
    openSubWindows: (name: string, width: number, height: number, left?: number | null, top?: number | null) => SubWindowInfo;
    getCurrentWindowsId: () => string;
    getPluginProxy: (timeout?: number) => any;
    onMessage: (data: JsonObject) => boolean;
    onStart: (argv: StreamDock.Argv) => void;
    currentSubWindowId: string;
    /** 当前及历史子窗口状态。 */
    subWindows: SubWindowInfo[];
}
type ExtensibleProperty<TSettings extends JsonObject = JsonObject, TGlobalSettings extends JsonObject = JsonObject> = Omit<PropertyInterface, "settings" | "globalSettings"> & {
    settings: TSettings;
    globalSettings: TGlobalSettings;
} & Record<string, unknown>;
export class Property {
    /** 全局设置缓存 */
    private getGlobalSettingsFlag: boolean = true;
    private hasDidReceiveSettings: boolean = false;
    private preventWatch: boolean = false;
    private _rpc = new RpcChannel((payload) => this.sendToPlugin(payload));
    static _instance: Property;
    static hasInit: boolean;
    /** 是否阻止 settings watch 触发保存（用于防止循环更新） */
    /** 当前语言代码 */
    public language!: string;
    public environment: HostEnvironment = detectHostEnvironment(undefined);
    get isCraft(): boolean {
        return this.environment.isCraft;
    }
    get isStreamDock(): boolean {
        return this.environment.isStreamDock;
    }
    /** `window.argv` 的引用，见 {@link StreamDock.Argv} */
    public args!: StreamDock.Argv;
    /** 注册事件名称 */
    public regEvent!: string;
    /** Property Inspector UUID */
    public uuid!: string;
    public ws!: WebSocket;
    public reactiveProperty!: Reactive<PropertyInterface>;
    private pluginProxies = new Map<number | undefined, any>();
    private subWindowEntries = new Map<string, SubWindowEntry>();
    private subWindowIdSequence = 0;
    private lastWillAppearEvent?: StreamDockEvents.WillAppear;
    private static childReactiveProperty?: Reactive<ExtensibleProperty>;
    private static childSyncingFromParent = false;
    constructor() {}

    /**
     * 初始化 Property Inspector 环境。
     *
     * 注入 `window.PropertyClass`、`window.PropertyApp`、`window.startProperty`。
     *
     * @param mountApp - Vue 根组件（Property Inspector 的 UI 组件）
     */
    static async initProperty(mountApp: any) {
        window.PropertyClass = this;
        window.PropertyApp = mountApp;
        if (window.opener != null) {
            window.i18n = window.opener.i18n;
            const url = new URL(window.location.href);
            window.currentActionName = url.searchParams.get("name");
            window.currentWindowsId = url.searchParams.get("windowId") || "main";
            createApp(window.PropertyApp).mount("#app");
        } else {
            window.startProperty = async function () {
                const instance = window.PropertyClass.getInstance() as Property;
                instance.setHostInfo(window.argv[3]);
                try {
                    window.PropertyClass.getReactiveInstance().onStart([window.argv[0], window.argv[1], window.argv[2], window.argv[3], window.argv.length >= 5 ? window.argv[4] : null]);
                } catch {}

                let response: any;
                try {
                    response = await new Promise((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        xhr.open("GET", `./${window.argv[3].application.language}.json`);
                        xhr.onreadystatechange = () => {
                            if (xhr.readyState === 4) {
                                resolve(JSON.parse(xhr.responseText));
                            }
                        };
                        xhr.onerror = () => reject(new Error("Network error"));
                        xhr.send();
                    });
                    window._i18n = response["Localization"] || {};
                } catch {
                    window._i18n = {};
                }
                window.currentActionName = window.argv[4]?.action.split(".").pop() || "";
                window.currentWindowsId = "main";
                window.PropertyClass.getReactiveInstance();
                window.PropertyClass.getInstance().connect();
                createApp(window.PropertyApp).mount("#app");
            };
            ensureSDSocketPolyfill();
        }
    }
    /**
     * 启动 Property Inspector（如果尚未初始化则自动调用 initProperty）。
     *
     * @param mountApp - Vue 根组件（可选，如已在 initProperty 中设置可省略）
     */
    static async startProperty(mountApp: any = null) {
        if (!this.hasInit) {
            await this.initProperty(mountApp);
        }
    }
    /**
     * 获取/创建 Property 单例。
     *
     * @returns Property 单例实例
     */
    static getInstance<T extends Property>(this: new () => T): T {
        if (window.opener != null) {
            return window.opener.PropertyClass.getInstance();
        }
        if (!Property._instance) {
            Property._instance = new this() as unknown as Property;
        }
        return Property._instance as unknown as T;
    }
    static getI18n(): any {
        return window.i18n;
    }
    static getReactiveInstance<TSettings extends JsonObject = JsonObject, TGlobalSettings extends JsonObject = JsonObject>(): Reactive<ExtensibleProperty<TSettings, TGlobalSettings>> {
        if (window.opener != null) {
            if (this.childReactiveProperty) {
                return this.childReactiveProperty as unknown as Reactive<ExtensibleProperty<TSettings, TGlobalSettings>>;
            }

            const parentReactive = window.opener.PropertyClass.getReactiveInstance() as unknown as Reactive<ExtensibleProperty<TSettings, TGlobalSettings>>;
            const currentSubWindowId = window.currentWindowsId;
            const clone = <T>(value: T): T => {
                // settings/globalSettings 按 SDK 协议必须是 JSON；JSON 快照也能安全
                // 穿过不同窗口、不同 Vue runtime 创建的 Reactive Proxy。
                return JSON.parse(JSON.stringify(value)) as T;
            };
            const defaultChildHandlers: Record<PropertyChildEvent, (data: any) => void> = {
                willAppear: () => {},
                didReceiveSettings: () => {},
                didReceiveGlobalSettings: () => {},
                sendToPropertyInspector: () => {},
            };
            let childWillAppear = defaultChildHandlers.willAppear;
            let childMountScheduled = false;
            const localSource: ExtensibleProperty = {
                ...parentReactive,
                settings: clone(parentReactive.settings ?? {}),
                globalSettings: clone(parentReactive.globalSettings ?? {}),
                currentSubWindowId,
                getCurrentWindowsId: () => currentSubWindowId,
                // 子窗口必须有自己的回调槽，不能从父 Property 副制回调，
                // 否则子窗口组件尚未挂载时会错调父窗口处理函数。
                ...defaultChildHandlers,
            };
            Object.defineProperty(localSource, "willAppear", {
                configurable: true,
                enumerable: true,
                get: () => childWillAppear,
                set: (handler: (data: StreamDockEvents.WillAppear) => void) => {
                    childWillAppear = handler;
                    if (childMountScheduled || handler === defaultChildHandlers.willAppear) return;
                    childMountScheduled = true;
                    // setter 在业务子组件 setup() 期间执行，所以此处的
                    // onMounted 绑定的是真正的异步子组件，而不是外层壳。
                    onMounted(() => {
                        const appearance = window.opener?.PropertyClass.getInstance()
                            .attachSubWindowProperty(currentSubWindowId, window);
                        if (appearance) handler(appearance);
                    });
                },
            });
            const local = reactive(localSource) as Reactive<ExtensibleProperty>;
            this.childReactiveProperty = local;

            window.__streamDockSyncProperty = (state) => {
                this.childSyncingFromParent = true;
                try {
                    local.settings = clone(state.settings ?? {});
                    local.globalSettings = clone(state.globalSettings ?? {});
                    local.environment = state.environment as HostEnvironment;
                    local.isCraft = state.isCraft;
                    local.isStreamDock = state.isStreamDock;
                } finally {
                    this.childSyncingFromParent = false;
                }
            };

            window.__streamDockDispatchPropertyEvent = (event: PropertyChildEvent, data: any) => {
                const handler = local[event] as ((value: any) => void) | undefined;
                if (handler && handler !== defaultChildHandlers[event]) handler(data);
            };

            watch(
                () => local.settings,
                (value) => {
                    if (this.childSyncingFromParent || !window.opener) return;
                    window.opener.PropertyClass.getInstance().updateSettingsFromSubWindow(clone(value));
                },
                { deep: true, flush: "sync" },
            );
            watch(
                () => local.globalSettings,
                (value) => {
                    if (this.childSyncingFromParent || !window.opener) return;
                    window.opener.PropertyClass.getInstance().setGlobalSettings(clone(value));
                },
                { deep: true, flush: "sync" },
            );
            return local as unknown as Reactive<ExtensibleProperty<TSettings, TGlobalSettings>>;
        }
        const property = this.getInstance();
        if (!property.reactiveProperty) {
            property.reactiveProperty = reactive({
                settings: {},
                globalSettings: {},
                environment: property.environment,
                isCraft: property.isCraft,
                isStreamDock: property.isStreamDock,
                currentSubWindowId: "main",
                callPlugin: (method: string, ...args: any[]) => property.callPlugin(method, ...args),
                getGlobalSettings: () => property.getGlobalSettings(),
                setGlobalSettings: (data: JsonObject) => property.setGlobalSettings(data),
                sendToPlugin: (payload: JsonObject) => property.sendToPlugin(payload),
                openUrl: (url: string) => property.openUrl(url),
                didReceiveGlobalSettings: (data: StreamDockEvents.DidReceiveGlobalSettings) => {},
                didReceiveSettings: (data: StreamDockEvents.DidReceiveSettings) => {},
                setPreventWatch: (preventWatch: boolean) => property.setPreventWatch(preventWatch),
                sendToPropertyInspector: (data: StreamDockEvents.SendToPropertyInspector) => {},
                getI18n: () => window.i18n,
                getCurrentWindowsId: () => "main",
                closeSubWindow: (idOrName: string) => property.closeSubWindow(idOrName),
                closeSubWindowsByName: (name: string) => property.closeSubWindowsByName(name),
                getSubWindow: (id: string) => property.getSubWindow(id),
                getSubWindows: () => property.getSubWindows(),
                willAppear: (data: StreamDockEvents.WillAppear) => {},
                onMessage: (data: JsonObject) => false,
                onStart: (data: StreamDock.Argv) => {},
                getPluginProxy: (timeout?: number) => property.getPluginProxy(timeout),
                openSubWindows: (name: string, width: number, height: number, left: number | null = null, top: number | null = null) => property.openSubWindows(name, width, height, left, top),
                subWindows: [],
            });
        }
        return property.reactiveProperty as unknown as Reactive<ExtensibleProperty<TSettings, TGlobalSettings>>;
    }
    /**
     * 建立 WebSocket 连接并注册 Property Inspector 到 Stream Dock。
     *
     * 关键初始化：
     * - `this.settings = ref(window.argv[4].payload.settings)` — 创建响应式 settings
     * - `watch(settings, ..., { deep: true })` — 自动持久化变更
     */
    connect() {
        this.ws = new WebSocket("ws://127.0.0.1:" + window.argv[0]);
        this.ws.onopen = () => this.ws.send(JSON.stringify({ event: window.argv[2], uuid: window.argv[1] }));
        this.ws.onmessage = this.onmessage.bind(this);
        this.regEvent = window.argv[2];
        this.uuid = window.argv[1];
        this.language = window.argv[3].application.language;
        this.args = window.argv;
        this.setHostInfo(window.argv[3]);
        this.reactiveProperty.settings = window.argv[4]?.payload.settings;
        watch(
            () => this.reactiveProperty.settings,
            (newVal) => {
                if (this.preventWatch) {
                    return;
                }
                this.ws.send(
                    JSON.stringify({
                        event: "setSettings",
                        context: window.argv[1],
                        payload: newVal,
                    }),
                );
                this.syncSubWindows();
            },
            { deep: true, flush: "sync" },
        );
    }
    setHostInfo(info: StreamDock.ApplicationInfo) {
        this.environment = detectHostEnvironment(info);
        if (typeof document !== "undefined") {
            document.documentElement.dataset.miraboxHost = this.environment.kind;
            document.documentElement.dataset.miraboxDensity = window.innerHeight <= 205 ? "compact" : "comfortable";
        }
        if (this.reactiveProperty) {
            this.reactiveProperty.environment = this.environment;
            this.reactiveProperty.isCraft = this.isCraft;
            this.reactiveProperty.isStreamDock = this.isStreamDock;
        }
    }
    /**
     * 获取 Plugin RPC Proxy。
     *
     * 相同超时时间会复用同一个 Proxy；不传超时时间时复用默认的无超时 Proxy。
     */
    getPluginProxy(timeout?: number) {
        if (!this.pluginProxies.has(timeout)) {
            this.pluginProxies.set(timeout, this._rpc.createProxy(timeout));
        }
        return this.pluginProxies.get(timeout);
    }
    /**
     * 打开并记录一个子窗口。
     *
     * **仅 StreamDock 宿主支持。** Craft(`5.*`)不支持 PI 子窗口，调用时会输出
     * 警告；请改用同一 PI 内的分区渲染，或用 `property.isStreamDock` 做能力分支。
     *
     * @returns 包含唯一 ID 和当前状态的子窗口信息。
     */
    openSubWindows(name: string, width: number, height: number, left: number | null = null, top: number | null = null): SubWindowInfo {
        if (this.isCraft) {
            console.warn("[streamdock-sdk] Craft 宿主不支持 PI 子窗口，openSubWindows 可能无效。请用 property.isStreamDock 做能力分支。");
        }
        const ratio = window.devicePixelRatio || 1;
        const popupWidth = width * ratio;
        const popupHeight = height * ratio;
        const screenWidth = window.screen.width;
        const screenHeight = window.screen.height;
        const popupLeft = left ?? (screenWidth - popupWidth) / 2;
        const popupTop = top ?? (screenHeight - popupHeight) / 2;
        const id = this.createSubWindowId();
        const now = Date.now();
        const info: SubWindowInfo = {
            id,
            name,
            openedAt: now,
        };

        // StreamDock 的 window.open 可能在返回前就同步挂载子窗口。
        // 先登记占位项，避免子窗口初始化/RPC 引发的插件消息找不到 ID。
        this.subWindowEntries.set(id, { info, window: null });
        const childWindow = window.open(
            `./index.html?name=${encodeURIComponent(name)}&windowId=${encodeURIComponent(id)}`,
            "_blank",
            `width=${popupWidth},height=${popupHeight},top=${popupTop},left=${popupLeft}`,
        );
        const entry = this.subWindowEntries.get(id);
        if (entry && !entry.window) entry.window = childWindow;
        return { ...info };
    }
    /**
     * 按 ID 或名称关闭子窗口。
     *
     * 优先精确匹配 ID；不存在该 ID 时，关闭所有同名且仍处于打开状态的窗口。
     */
    closeSubWindow(idOrName: string) {
        const entry = this.subWindowEntries.get(idOrName);
        if (entry) {
            if (entry.window != null && !entry.window?.closed) entry.window?.close();
            this.subWindowEntries.delete(idOrName);
        } else {
            this.closeSubWindowsByName(idOrName);
        }
    }
    /** 关闭指定名称的所有仍处于打开状态的子窗口。 */
    closeSubWindowsByName(name: string) {
        for (const entry of this.subWindowEntries.values()) {
            if (entry.info.name === name) {
                if (entry.window != null && !entry.window?.closed) entry.window?.close();
                this.subWindowEntries.delete(entry.info.id);
            }
        }
    }
    /** 获取一个子窗口的最新状态快照。 */
    getSubWindow(id: string): SubWindowInfo | undefined {
        const info = this.subWindowEntries.get(id)?.info;
        return info ? { ...info } : undefined;
    }
    /** 获取所有子窗口（包含已关闭和被拦截窗口）的状态快照。 */
    getSubWindows(): SubWindowInfo[] {
        return Array.from(this.subWindowEntries.values(), ({ info }) => ({ ...info }));
    }
    private createSubWindowId(): string {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
        }
        this.subWindowIdSequence++;
        return `subwindow-${Date.now()}-${this.subWindowIdSequence}`;
    }
    getI18n(): any {
        return window.i18n;
    }

    /** WebSocket 消息处理 */
    async onmessage(a: MessageEvent) {
        let e = a.data;

        const data = JSON.parse(e.toString());
        try {
            if (this.reactiveProperty.onMessage(data)) return;
        } catch {}
        if (this.getGlobalSettingsFlag) {
            this.getGlobalSettingsFlag = false;
            this.getGlobalSettings();
        }
        if (data.event === "didReceiveGlobalSettings") {
            this.reactiveProperty.globalSettings = data.payload.settings;
            this.syncSubWindows();
            this.didReceiveGlobalSettings?.(data);
            this.reactiveProperty.didReceiveGlobalSettings(data);
            this.dispatchToSubWindows("didReceiveGlobalSettings", data);
        }
        if (data.event === "didReceiveSettings") {
            if (this.hasDidReceiveSettings) {
                this.preventWatch = true;
                this.reactiveProperty.settings = data.payload.settings;
                this.syncSubWindows();
                this.didReceiveSettings?.(data);
                this.reactiveProperty.didReceiveSettings(data);
                this.dispatchToSubWindows("didReceiveSettings", data);
                this.preventWatch = false;
            } else {
                this.hasDidReceiveSettings = true;
                this.lastWillAppearEvent = data;
                this.willAppear?.(data);
                this.reactiveProperty.willAppear(data);
                this.dispatchToSubWindows("willAppear", data);
            }
        }
        if (data.event === "sendToPropertyInspector") {
            this.sendToPropertyInspectorEvent(data);
        }
    }

    /**
     * 全局保存数据（跨所有 Property Inspector 实例共享）。
     *
     * @param data - 要保存的键值对
     */
    setGlobalSettings(data: JsonObject) {
        this.reactiveProperty.globalSettings = data;
        this.syncSubWindows();
        this.ws.send(
            JSON.stringify({
                event: "setGlobalSettings",
                context: this.uuid,
                payload: data,
            }),
        );
    }

    /** SDK 内部：接收子窗口 settings 修改，交由父窗口统一持久化。 */
    updateSettingsFromSubWindow(data: JsonObject) {
        this.reactiveProperty.settings = data;
    }

    /**
     * 子窗口 Vue 完成 mount 后注册自己的 Property 副本。
     * 子窗口通常在主 PI willAppear 之后才打开，所以需要补发最近一次
     * willAppear，否则子窗口中依赖 RPC/会话的初始化永远不会执行。
     */
    attachSubWindowProperty(id: string, childWindow?: Window): StreamDockEvents.WillAppear | undefined {
        const entry = this.subWindowEntries.get(id);
        if (!entry) return undefined;
        // window.open 还没返回时，子窗口使用自身 window 反向完成注册。
        if (childWindow) entry.window = childWindow;
        if (!entry.window || entry.window.closed) return undefined;
        this.syncSubWindows();
        return this.lastWillAppearEvent;
    }

    /** 将父窗口状态显式推送到每个子窗口自己的 Vue reactive 镜像。 */
    private syncSubWindows() {
        const state = {
            settings: this.reactiveProperty.settings ?? {},
            globalSettings: this.reactiveProperty.globalSettings ?? {},
            environment: this.reactiveProperty.environment,
            isCraft: this.reactiveProperty.isCraft,
            isStreamDock: this.reactiveProperty.isStreamDock,
        };
        for (const [id, entry] of this.subWindowEntries) {
            // null 表示 window.open 尚未返回/子窗口尚未反向注册，
            // 这是正常的短暂状态，不能当成已关闭而删除。
            if (!entry.window) continue;
            if (entry.window.closed) {
                this.subWindowEntries.delete(id);
                continue;
            }
            try {
                entry.window.__streamDockSyncProperty?.(state);
            } catch {}
        }
    }

    /** 把主 PI 收到的事件分发给每个子窗口独立的 Property 副本。 */
    private dispatchToSubWindows(event: PropertyChildEvent, data: any) {
        for (const [id, entry] of this.subWindowEntries) {
            if (!entry.window) continue;
            if (entry.window.closed) {
                this.subWindowEntries.delete(id);
                continue;
            }
            try {
                entry.window.__streamDockDispatchPropertyEvent?.(event, data);
            } catch {}
        }
    }

    /** 获取当前 action 名称 */
    static getCurrentActionName(): string {
        return window.currentActionName || "";
    }

    /** 请求全局持久化数据 */
    getGlobalSettings() {
        this.ws.send(
            JSON.stringify({
                event: "getGlobalSettings",
                context: this.uuid,
            }),
        );
    }

    /**
     * 向 Plugin 发送数据。
     *
     * @param payload - 要发送的 JSON 对象
     */
    sendToPlugin(payload: JsonObject) {
        this.ws.send(
            JSON.stringify({
                event: "sendToPlugin",
                action: this.args[4]?.action,
                context: this.args[1],
                payload,
            }),
        );
    }

    /**
     * 在默认浏览器中打开 URL。
     *
     * 适用于教程、开发者文档等外部链接；内部 Vue 子窗口请使用 openSubWindows。
     */
    openUrl(url: string) {
        this.ws.send(
            JSON.stringify({
                event: "openUrl",
                payload: { url },
            }),
        );
    }

    /** [内部] 处理 sendToPropertyInspector 事件，检查 RPC 消息 */
    sendToPropertyInspectorEvent(data: any) {
        const payload = data.payload;
        if (this._rpc.handleIncoming(payload, this)) return;
        this.reactiveProperty.sendToPropertyInspector(data);
        this.sendToPropertyInspector?.(data);
        this.dispatchToSubWindows("sendToPropertyInspector", data);
    }

    /**
     * 调用 Plugin 端的方法（RPC）。
     *
     * ```ts
     * const result = await property.callPlugin('refreshData');
     * ```
     *
     * @param method - Plugin 端的方法名
     * @param args - 方法参数
     * @returns Promise，resolve 为方法的返回值
     */
    callPlugin(method: string, ...args: any[]): Promise<any> {
        return this._rpc.call(method, ...args);
    }
    setPreventWatch(preventWatch: boolean) {
        this.preventWatch = preventWatch;
    }
    /** settings 改变后触发（可选实现） */
    didReceiveSettings?(data: StreamDockEvents.DidReceiveSettings): void;
    willAppear?(data: StreamDockEvents.WillAppear): void;
    didReceiveGlobalSettings?: (data: StreamDockEvents.DidReceiveGlobalSettings) => void;
    sendToPropertyInspector?: (data: StreamDockEvents.SendToPropertyInspector) => void;
}
