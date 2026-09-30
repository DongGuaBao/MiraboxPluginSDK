import "../types";
import type { ActionSettings } from "../types";
import { BasePlugin } from "./base-plugin";
import { pluginState } from "./state";
import { RpcChannel } from "./rpc";
import { getKeypadCoordinates, type KeypadCoordinates } from "./keypad";

export type ActionType = "touchBar" | "Card" | "Knob" | "Keypad";

/**
 * Action 操作基类 — 每个实例代表画布上一个按键。
 *
 * ## 生命周期
 *
 * ```
 * willAppear → (keyDown/keyUp/dialRotate/...) → willDisappear
 * ```
 *
 * ## 内部钩子约定
 *
 * `_` 前缀方法（如 `_willAppear`、`_keyDown`）是 **SDK 内部拦截方法**，
 * 用于在调用公开钩子之前做预处理（如记录 context、更新 settings）。
 * **不要在子类中覆盖 `_` 前缀方法。**
 *
 * ## 多状态
 *
 * 如果 manifest.json 中定义了多个 States，可以通过 `setState()` 切换。
 */
export class Action {
    /** Action 类注册表（类级别，非实例），key = action 名称 → value = Plugin action 注册 key */
    static actions: Record<string, string> = {};

    private _rpc = new RpcChannel((payload) => this.sendToPropertyInspector(payload));

    actionType: ActionType = "Keypad";

    /** 操作实例的唯一标识符（由 Stream Dock 在 willAppear 时分配） */
    context!: string;
    /** 设备标识符 */
    device!: string;
    /** 探查到的 StreamDock 设备型号；未开启或未匹配时为 undefined。 */
    deviceModel?: string;
    coordinates?: KeypadCoordinates;
    /** 当前持久化设置（willAppear 或 didReceiveSettings 时更新） */
    settings: ActionSettings = {};

    /**
     * [内部] Property Inspector 出现时的预处理。
     * 更新 `pluginState` 并调用公开的 `propertyInspectorDidAppear` 钩子。
     * **不要在子类中覆盖此方法。**
     */
    _propertyInspectorDidAppear?(data: StreamDockEvents.PropertyInspectorDidAppear) {
        pluginState.currentAction = data.action || null;
        pluginState.currentContext = data.context || null;
        this.propertyInspectorDidAppear?.(data);
    }
    /**
     * [内部] Property Inspector 消失时的预处理。
     * 更新 `pluginState` 并调用公开的 `propertyInspectorDidDisappear` 钩子。
     * **不要在子类中覆盖此方法。**
     */
    _propertyInspectorDidDisappear?(data: StreamDockEvents.PropertyInspectorDidAppear) {
        pluginState.currentAction = null;
        pluginState.currentContext = null;
        this.propertyInspectorDidDisappear?.(data);
    }

    /**
     * [内部] willAppear 事件的预处理。
     * 记录 settings、context、device，注册到 Plugin 的 actionList，然后调用公开钩子。
     * **不要在子类中覆盖此方法。**
     */
    _willAppear(data: StreamDockEvents.WillAppear): void {
        this.settings = (data.payload as any)?.settings;
        const controller = data.payload.controller?.toLowerCase();
        const coordinates = data.payload.coordinates;
        this.actionType = controller === "keypad" && coordinates?.column === -1 && coordinates.row === -1 ? "touchBar" : controller === "card" ? "Card" : controller === "knob" ? "Knob" : "Keypad";
        if (data.context) {
            this.context = data.context;
            BasePlugin.instance.actionList.set(data.context, this);
        }
        this.device = data.device || "";
        this.deviceModel = BasePlugin.instance.getDeviceModel(this.device);
        data.deviceModel = this.deviceModel;
        this.coordinates = this.actionType === "Keypad" && controller !== "secondaryscreen" && coordinates ? getKeypadCoordinates(this.deviceModel, coordinates.column, coordinates.row) : undefined;
        this.willAppear?.(data);
    }

    /**
     * [内部] didReceiveSettings 事件的预处理。
     * 更新 settings 后调用公开钩子。
     * **不要在子类中覆盖此方法。**
     */
    _didReceiveSettings(data: StreamDockEvents.DidReceiveSettings): void {
        this.settings = (data.payload as any)?.settings;
        this.didReceiveSettings?.(data);
    }

    /**
     * [内部] willDisappear 事件的预处理。
     * 调用公开钩子后从 Plugin 的 actionList 移除。
     * **不要在子类中覆盖此方法。**
     */
    _willDisappear(data: StreamDockEvents.WillDisappear): void {
        this.willDisappear?.(data);
        if (data.context) BasePlugin.instance.actionList.delete(data.context);
    }

    /**
     * [内部] sendToPlugin 事件的预处理。
     * 先检查是否是 RPC 消息，不是则调用公开钩子。
     * **不要在子类中覆盖此方法。**
     */
    _sendToPlugin(data: StreamDockEvents.SendToPlugin) {
        const payload: any = data.payload;
        if (this._rpc.handleIncoming(payload, this)) return;
        this.sendToPlugin?.(data);
    }

    /**
     * 设置按键显示的标题文字。
     * @param str - 要显示的标题字符串
     * @remarks 等价于 `BasePlugin.instance.setTitle(this.context, str)`
     */
    setTitle(str: string): void {
        BasePlugin.instance.setTitle(this.context, str);
    }

    /**
     * 设置设备背景图片。
     * @param img - 图片的 base64 编码
     * @param clearIcon - 是否清除现有图标
     */
    setBackground(img: string, clearIcon: boolean): void {
        BasePlugin.instance.setBackground(this.device, img, clearIcon);
    }

    /**
     * 设置按键显示的图片。
     * @param url - 图片的 base64 编码字符串
     * @remarks KeyPad 按键图片推荐 128×128px
     */
    setImage(url: string): void {
        BasePlugin.instance.setImage(this.context, url);
    }

    /**
     * 切换按键状态（用于多状态操作）。
     * @param state - 从 0 开始的状态索引
     */
    setState(state: number): void {
        BasePlugin.instance.setState(this.context, state);
    }

    /**
     * 持久保存指定 settings。
     * @param payload - 要保存的 JSON 对象
     */
    setSettings(payload: JsonObject): void {
        BasePlugin.instance.setSettings(this.context, payload);
    }

    /**
     * 持久保存在 `this.settings` 中的所有变更到 Stream Dock。
     *
     * ```ts
     * this.settings.count = 5;
     * this.saveSettings();  // 等价于 this.setSettings(this.settings)
     * ```
     *
     * @remarks 等价于 `BasePlugin.instance.setSettings(this.context, this.settings)`
     */
    saveSettings(): void {
        BasePlugin.instance.setSettings(this.context, this.settings);
    }

    /** 在按键上临时显示警告图标 */
    showAlert(): void {
        BasePlugin.instance.showAlert(this.context);
    }

    /** 在按键上临时显示 OK 复选标记图标 */
    showOk(): void {
        BasePlugin.instance.showOk(this.context);
    }

    /**
     * 向 Property Inspector 发送数据。
     * @param payload - 要发送的 JSON 对象
     */
    sendToPropertyInspector(payload: JsonObject): void {
        BasePlugin.instance.sendToPropertyInspector(payload);
    }

    /** 注册屏幕保护事件监听 */
    registrationScreenSaverEvent(): void {
        BasePlugin.instance.registrationScreenSaverEvent(this.context, this.device);
    }

    // ============ 生命周期钩子（可选实现） ============

    /** 按键即将从 Stream Dock 上消失时触发 */
    willDisappear?(data: StreamDockEvents.WillDisappear): void;

    /** Property Inspector 向 Plugin 发送数据时触发（非 RPC 消息） */
    sendToPlugin?(data: StreamDockEvents.SendToPlugin): void;

    /** settings 改变后触发 */
    didReceiveSettings?(data: StreamDockEvents.DidReceiveSettings): void;

    /** 用户释放按键时触发 */
    keyUp?(data: StreamDockEvents.KeyUp): void;

    /** 用户按下按键时触发 */
    keyDown?(data: StreamDockEvents.KeyDown): void;

    touchTap?(data: StreamDockEvents.TouchTap): void;

    /** 用户旋转旋钮时触发（正值 = 顺时针，负值 = 逆时针） */
    dialRotate?(data: StreamDockEvents.DialRotate): void;

    /**
     * 按键实例出现在 Stream Dock 上时触发。
     *
     * 触发场景：应用启动、切换配置文件、用户拖放 action 到画布。
     * 在此方法中可进行初始化操作（设置初始标题、图片等）。
     */
    willAppear?(data: StreamDockEvents.WillAppear): void;

    /** 用户从画布上删除操作时触发 */
    deleteAction?(data: StreamDockEvents.DeleteAction): void;

    /** Property Inspector 在 Stream Dock UI 中显示时触发 */
    propertyInspectorDidAppear?(data: StreamDockEvents.PropertyInspectorDidAppear): void;
    propertyInspectorDidDisappear?(data: StreamDockEvents.PropertyInspectorDidAppear): void;

    /** 取消注册屏幕保护事件时触发 */
    unRegistrationScreenSaverEvent?(data: StreamDockEvents.UnRegistrationScreenSaver): void;
}
