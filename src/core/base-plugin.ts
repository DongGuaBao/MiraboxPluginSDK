import "../types";
import { pluginState } from "./state";
import { detectHostEnvironment, type HostEnvironment } from "./environment";

/**
 * Action 实例的接口约束。
 * 每个 Action 实例代表画布上一个按键，拥有唯一的 `context`。
 */
export interface IActionInstance {
    /** 操作实例的唯一标识符，由 Stream Dock 分配 */
    context: string;
    /** 设备标识符 */
    device: string;
    /** 当前持久化设置 */
    settings: JsonObject;
    [key: string]: any;
}

/**
 * 插件基类 — 所有 Stream Dock 插件的入口。
 *
 * ## 单例模式
 *
 * 每个进程中只有一个 Plugin 实例。使用方式：
 * ```ts
 * class MyPlugin extends Plugin {}
 * Plugin.instance = new MyPlugin();  // 方式一
 * MyPlugin.getInstance();            // 方式二（自动创建）
 * ```
 *
 * ## 事件分发
 *
 * Plugin 通过 WebSocket 接收 Stream Dock 的 JSON 消息，
 * 调用 `dispatchAction()` 根据 `context` 将事件路由到对应的 Action 实例。
 *
 * 如果消息中存在与 Plugin 自身同名的方法（如 `deviceDidConnect`），
 * 优先调用 Plugin 上的方法，返回值 `true` 可拦截后续 Action 分发。
 *
 * ## Settings 作用域
 *
 * - `settings`: Action 级别 — 每个按键独立存储
 * - `globalSettings`: Plugin 级别 — 跨按键共享
 */
export abstract class BasePlugin {
    static hasInit: boolean = false;
    private static _instance: BasePlugin | null = null;

    /** 当前插件单例实例 */
    static get instance(): BasePlugin {
        return BasePlugin._instance!;
    }

    getGlobalSettingsFlag: boolean = true;
    /** 插件 UUID（从启动参数中获取） */
    uuid!: string;
    /** WebSocket 连接（Node 端为轻量客户端，Web 端为浏览器 WebSocket） */
    ws!: { send(data: string): void };
    /** 全局持久化设置，跨所有 Action 共享 */
    globalSettings: JsonObject = {};
    /** 当前语言代码，如 "zh_CN"、"en" */
    language: string = "";
    /** 当前宿主环境；在 onStart 调用前由 SDK 根据 application.version 设置。 */
    environment: HostEnvironment = detectHostEnvironment(undefined);
    get isCraft(): boolean {
        return this.environment.isCraft;
    }
    get isStreamDock(): boolean {
        return this.environment.isStreamDock;
    }
    /** 由 Node/Web 启动器注入解析后的宿主信息。 */
    setHostInfo(info: StreamDock.ApplicationInfo): void {
        this.environment = detectHostEnvironment(info);
    }
    /**
     * Action 类注册表。
     * key = action UUID 的最后一段（如 "action1"），
     * value = Action 构造函数。
     */
    action: Record<string, new (...args: any[]) => IActionInstance> = {};
    /** 当前活跃的 Action 实例列表，key 为 context */
    actionList: Map<string, IActionInstance> = new Map();
    /** 已连接的设备列表，key 为设备 ID */
    devices: Record<string, boolean> = {};

    /**
     * 获取/创建 Plugin 单例。
     *
     * ```ts
     * const plugin = MyPlugin.getInstance();
     * ```
     *
     * @returns Plugin 单例实例
     */
    static getInstance<T extends BasePlugin>(this: new () => T): T {
        if (!BasePlugin._instance) {
            BasePlugin._instance = new this() as unknown as BasePlugin;
        }
        return BasePlugin._instance as unknown as T;
    }

    /**
     * 建立 WebSocket 连接并注册到 Stream Dock。
     * 子类必须实现此方法。
     */
    abstract connect(): void;

    /**
     * 根据收到的 JSON 数据将事件分发给对应的 Action 实例。
     *
     * 分发逻辑：
     * 1. 如果 `context` 为 null/undefined，广播给所有 Action 实例
     * 2. 如果事件是 `willAppear` 且 context 不在 actionList 中，创建新 Action 实例
     * 3. 否则从 actionList 中查找已有 Action 实例
     * 4. 优先调用 `_<event>` 内部方法（SDK 使用），否则调用 `<event>` 公开方法
     *
     * @param data - Stream Dock 发来的 JSON 消息对象
     */
    dispatchAction(data: any) {
        const actionName = data.action?.split(".").pop();
        if (data.context == null) {
            for (const [, value] of this.actionList) {
                value[data.event]?.(data);
            }
            return;
        }
        let actionInstance: IActionInstance | undefined;
        if (data.event === "willAppear" && !this.actionList.has(data.context)) {
            const actionBuilder = actionName ? this.action[actionName] : undefined;
            if (actionBuilder) actionInstance = new actionBuilder();
        } else {
            actionInstance = this.actionList.get(data.context);
        }
        if (!actionInstance) return;

        const handler = actionInstance[`_${data.event}`];
        if (typeof handler === "function") {
            handler.call(actionInstance, data);
        } else {
            actionInstance[data.event]?.(data);
        }
    }

    /**
     * 设置按键显示的标题文字。
     *
     * @param context - 操作实例的唯一标识符
     * @param str - 要显示的标题字符串
     * @remarks 发送 `setTitle` 命令到 Stream Dock
     */
    setTitle(context: string, str: string): void {
        this.ws.send(
            JSON.stringify({
                event: "setTitle",
                context,
                payload: {
                    target: 0,
                    title: str,
                },
            }),
        );
    }

    /**
     * 设置按键显示的图片。
     *
     * @param context - 操作实例的唯一标识符
     * @param url - 图片的 base64 编码字符串，格式: `data:image/png;base64,...`
     * @remarks
     * - KeyPad 按键推荐图片尺寸: **128×128px**
     * - SecondaryScreen 副屏支持多种分辨率（如 1920×462、480×480）
     * - 发送 `setImage` 命令到 Stream Dock
     */
    setImage(context: string, url: string): void {
        this.ws.send(
            JSON.stringify({
                event: "setImage",
                context,
                payload: {
                    target: 0,
                    image: url,
                },
            }),
        );
    }

    /**
     * 切换按键的状态（用于多状态操作）。
     *
     * @param context - 操作实例的唯一标识符
     * @param state - 从 0 开始的状态索引
     * @remarks 发送 `setState` 命令到 Stream Dock
     */
    setState(context: string, state: number): void {
        this.setImage(context, "");
        this.ws.send(
            JSON.stringify({
                event: "setState",
                context,
                payload: { state },
            }),
        );
    }

    /**
     * 持久保存 Action 实例的 settings。
     *
     * @param context - 操作实例的唯一标识符
     * @param payload - 要保存的 JSON 对象
     * @remarks Property Inspector 将自动收到 `didReceiveSettings` 回调
     */
    setSettings(context: string, payload: JsonObject): void {
        this.ws.send(
            JSON.stringify({
                event: "setSettings",
                context,
                payload,
            }),
        );
    }

    /**
     * 全局保存插件的 globalSettings（跨所有 Action 共享）。
     *
     * @param payload - 要保存的 JSON 对象
     * @remarks Property Inspector 将自动收到 `didReceiveGlobalSettings` 回调
     */
    setGlobalSettings(payload: JsonObject): void {
        this.globalSettings = payload;
        this.ws.send(
            JSON.stringify({
                event: "setGlobalSettings",
                context: this.uuid,
                payload,
            }),
        );
    }

    /**
     * 请求全局持久化数据。
     *
     * @remarks Plugin 将异步收到 `didReceiveGlobalSettings` 事件
     */
    getGlobalSettings(): void {
        this.ws.send(
            JSON.stringify({
                event: "getGlobalSettings",
                context: this.uuid,
            }),
        );
    }

    /**
     * 向 Property Inspector 发送数据。
     *
     * @param payload - 要发送的 JSON 对象
     * @remarks 自动附带当前活跃的 action 和 context
     */
    sendToPropertyInspector(payload: JsonObject): void {
        this.ws.send(
            JSON.stringify({
                action: pluginState.currentAction,
                context: pluginState.currentContext,
                payload,
                event: "sendToPropertyInspector",
            }),
        );
    }

    /**
     * 在按键上临时显示警告图标。
     *
     * @param context - 操作实例的唯一标识符
     */
    showAlert(context: string): void {
        this.ws.send(
            JSON.stringify({
                event: "showAlert",
                context,
            }),
        );
    }

    /**
     * 在按键上临时显示 OK 复选标记图标。
     *
     * @param context - 操作实例的唯一标识符
     */
    showOk(context: string): void {
        this.ws.send(
            JSON.stringify({
                event: "showOk",
                context,
            }),
        );
    }

    /**
     * 在默认浏览器中打开 URL。
     *
     * @param url - 要打开的 URL 地址
     */
    openUrl(url: string): void {
        this.ws.send(
            JSON.stringify({
                event: "openUrl",
                payload: { url },
            }),
        );
    }

    /**
     * 设置设备背景图片。
     *
     * @param device - 设备标识符
     * @param img - 图片的 base64 编码
     * @param clearIcon - 是否清除现有图标
     */
    setBackground(device: string, img: string, clearIcon: boolean): void {
        this.ws.send(
            JSON.stringify({
                event: "setBackground",
                device: device,
                payload: {
                    image: img,
                    clearIcon: clearIcon,
                },
            }),
        );
    }

    /**
     * 停止设备背景效果。
     *
     * @param device - 设备标识符
     */
    sendStopBackground(device: string): void {
        this.ws.send(
            JSON.stringify({
                event: "stopBackground",
                device: device,
                payload: {
                    clearIcon: true,
                },
            }),
        );
    }

    regActionClass(actionName: string, actionClass: new (...args: any[]) => IActionInstance) {
        this.action[actionName] = actionClass;
    }
    /**
     * 注册屏幕保护事件监听。
     *
     * @param context - 操作实例的唯一标识符
     * @param device - 设备标识符
     */
    registrationScreenSaverEvent(context: string, device: string): void {
        this.ws.send(
            JSON.stringify({
                event: "registrationScreenSaverEvent",
                device: device,
                context: context,
            }),
        );
    }

    /** 停止背景事件回调（可选实现） */
    stopBackground?(data: StreamDockEvents.StopBackground): boolean | void;
    /** 按键区域坐标释放事件回调（可选实现） */
    keyUpCord?(data: StreamDockEvents.KeyUpCord): boolean | void;
    /** 按键区域坐标按下事件回调（可选实现） */
    keyDownCord?(data: StreamDockEvents.KeyDownCord): boolean | void;
    /** 屏幕锁定事件回调（可选实现） */
    lockScreen?(data: StreamDockEvents.LockScreen): boolean | void;
    /** 屏幕解锁事件回调（可选实现） */
    unLockScreen?(data: StreamDockEvents.UnLockScreen): boolean | void;
}
