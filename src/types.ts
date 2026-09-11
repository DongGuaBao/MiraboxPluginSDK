/**
 * Stream Dock SDK 全局类型定义。
 *
 * 本文件定义：
 * - JSON 基础类型 (`JsonValue`, `JsonObject`)
 * - 事件类型辅助泛型 (`EventPlugin`, `EventAction`, `EventActionWithPayload` 等)
 * - 命令类型辅助泛型 (`CommandPlugin`, `CommandAction`, `CommandPluginWithPayload` 等)
 * - {@link StreamDock.Argv} — `connectElgatoStreamDeckSocket` 接收的启动参数
 * - {@link StreamDockEvents} — 插件从 Stream Dock 接收的事件类型
 * - {@link StreamDockCommands} — 插件发送给 Stream Dock 的命令类型
 * - `Window` 接口扩展 — Stream Dock 注入到全局 window 上的函数和属性
 */

declare global {
    // ============ 基础 JSON 类型 ============

    /** JSON 兼容的值类型：字符串、数字、布尔、null、嵌套对象或数组 */
    type JsonValue = string | number | boolean | JsonObject | JsonValue[];

    /** JSON 兼容的对象类型，键为字符串，值为 {@link JsonValue} */
    type JsonObject = {
        [k: string]: JsonValue;
    };

    // ============ 事件基础类型 ============

    /** 插件级事件（无 action/context/device） */
    type EventPlugin<TEvent> = {
        event: TEvent;
    };

    /** Action 级事件（含 action、context、device） */
    type EventAction<TEvent> = EventPlugin<TEvent> & {
        action?: string;
        context: string;
        device: string;
    };

    /** Action 级事件 + payload */
    type EventActionWithPayload<TEvent, TPayload> = EventAction<TEvent> & {
        payload: TPayload;
    };

    /** 插件级事件 + payload */
    type EventPluginWithPayload<TEvent, TPayload> = EventPlugin<TEvent> & {
        payload: TPayload;
    };

    // ============ 命令基础类型 ============

    /** 插件级命令 */
    type CommandPlugin<TCommand> = {
        event: TCommand;
    };

    /** Action 级命令（含 context） */
    type CommandAction<TCommand> = EventPlugin<TCommand> & {
        context: string;
    };

    /** 插件级命令 + payload */
    type CommandPluginWithPayload<TCommand, TPayload> = CommandPlugin<TCommand> & {
        payload: TPayload;
    };

    /** Action 级命令 + payload */
    type CommandActionWithPayload<TCommand, TPayload> = CommandAction<TCommand> & {
        payload: TPayload;
    };

    /** 国际化翻译函数，根据 key 返回对应语言的文本 */
    var i18n: any;

    /** 国际化翻译字典，key 为原文，value 为翻译后文本 */
    var _i18n: { [k: string]: string };

    /** 当前语言代码，如 "zh_CN"、"en" */
    var language: string;

    /**
     * Stream Dock 注入到全局 Window 上的属性和函数。
     *
     * 核心入口 `connectElgatoStreamDeckSocket`（兼容 Elgato 命名）在页面加载时
     * 由 Stream Dock 应用调用，传入 WebSocket 端口、UUID、注册事件和 info。
     */
    interface Window {
        /** `connectElgatoStreamDeckSocket` 传入的启动参数数组，见 {@link StreamDock.Argv} */
        argv: StreamDock.Argv;

        /** 由 polyfill 注入，连接 Stream Dock WebSocket 的入口函数 */
        connectSDSocket(port: string, uuid: string, registerEvent: string, info: string, actionInfo?: string): void | Promise<void>;

        /** Web 端延迟启动 Plugin 的函数，由 polyfill 赋值 */
        startPlugin(): Promise<void>;

        /** Web 端延迟启动 Property Inspector 的函数，由 polyfill 赋值 */
        startProperty(): Promise<void>;

        /** 国际化翻译函数代理 */
        i18n: any;

        /** 国际化翻译字典 */
        _i18n: { [k: string]: string };

        /** 预留的动画/特效引用 */
        fx: any;

        /** 兼容 MiraBox 旧版命名 */
        connectMiraBoxSDSocket(port: string, uuid: string, registerEvent: string, info: string, actionInfo?: string): void | Promise<void>;

        /** 兼容旧版命名 */
        connectSocket(port: string, uuid: string, registerEvent: string, info: string, actionInfo?: string): void | Promise<void>;
        currentActionName: string | null;
        currentWindowsId: string;
        /** SDK 内部：父 Property Inspector 向子窗口同步响应式状态。 */
        __streamDockSyncProperty?: (state: { settings: JsonObject; globalSettings: JsonObject; environment: unknown; isCraft: boolean; isStreamDock: boolean }) => void;
        /** SDK 内部：父 Property Inspector 向子窗口自己的 Property 副本分发生命周期和插件消息。 */
        __streamDockDispatchPropertyEvent?: (
            event: "willAppear" | "didReceiveSettings" | "didReceiveGlobalSettings" | "sendToPropertyInspector",
            data: any,
        ) => void;
        /**
         * Stream Dock / Elgato 通用入口函数。
         * 对于 Property Inspector：接收 5 个参数（最后一个是 inActionInfo）。
         * 对于 Plugin：接收 4 个参数。
         *
         * @param port - WebSocket 端口号（字符串）
         * @param uuid - 插件或属性检查器的唯一标识符
         * @param registerEvent - 注册事件名称
         * @param info - 应用和插件信息的 JSON 字符串
         * @param actionInfo - (仅 Property Inspector) action 信息的 JSON 字符串
         */
        connectElgatoStreamDeckSocket(port: string, uuid: string, registerEvent: string, info: string, actionInfo?: string): void;

        /** 文件选择器回调，用户选择文件后调用 */
        onFilePickerReturn(files: string): void;

        /** Property Inspector 的 Vue 组件类（由 initProperty 注入） */
        PropertyClass: any;

        /** Property Inspector 的 Vue 根组件（由 initProperty 注入） */
        PropertyApp: any;

        /** Plugin 的 Vue 根组件 */
        PluginApp: any;
    }

    // ============ StreamDock 命名空间 ============

    /**
     * Stream Dock 启动参数相关类型。
     *
     * `Argv` 是 `connectElgatoStreamDeckSocket` 收到参数后
     * 经 polyfill 解析存储到 `window.argv` 的数组：
     *
     * ```
     * [port, uuid, registerEvent, info, actionInfo?]
     * ```
     */
    namespace StreamDock {
        type ApplicationInfo = {
            application: {
                font: string;
                language: string;
                platform: string;
                platformVersion: string;
                version: string;
            };
            plugin: {
                uuid: string;
                version: string;
            };
            [key: string]: any;
        };

        /**
         * `window.argv` 的类型 —— `connectElgatoStreamDeckSocket` 参数
         * 经 JSON 解析后的数组。
         *
         * - 索引 0: WebSocket 端口号 (string)
         * - 索引 1: 插件/属性检查器 UUID (string)
         * - 索引 2: 注册事件名称 (string)
         * - 索引 3: 应用和插件信息对象
         * - 索引 4: (仅 Property Inspector) action 信息对象
         */
        type Argv = [
            /** WebSocket 端口号 */
            string,
            /** 插件或属性检查器的 UUID */
            string,
            /** 注册事件名称 */
            string,
            /** 应用信息 */
            ApplicationInfo,
            /** (仅 Property Inspector) action 信息 */
            {
                action: string;
                context: string;
                payload: {
                    controller: string;
                    coordinates: {
                        column: number;
                        row: number;
                    };
                    isInMultiAction: boolean;
                    settings: any;
                    state: number;
                };
            } | null,
        ];
    }

    // ============ 事件类型 ============

    /**
     * Stream Dock 发送给插件的事件类型。
     *
     * 事件分为三类：
     * - **Action 级事件** — 针对单个按键实例，含 `action`、`context`、`device`
     * - **Plugin 级事件** — 针对整个插件，如 `deviceDidConnect`、`systemDidWakeUp`
     * - **系统事件** — 如 `applicationDidLaunch`、`applicationDidTerminate`
     *
     * 每个事件在 Plugin/Property Inspector 中对应一个同名的可选方法声明，
     * 实现该方法即可处理该事件。
     */
    namespace StreamDockEvents {
        /** 按键在画布上的坐标 */
        type Coordinates = {
            /** 列索引 (0-based) */
            column: number;
            /** 行索引 (0-based) */
            row: number;
        };

        /** 绝对像素坐标 */
        type CoordinatesXY = {
            x: number;
            y: number;
        };

        /** 设备信息 */
        type DeviceInfo = {
            /** 设备名称 */
            name: string;
            /** 设备类型编号 */
            type: number;
            /** 设备按键矩阵尺寸 */
            size: {
                columns: number;
                rows: number;
            };
        };

        /** 标题显示参数 */
        type TitleParameters = {
            fontFamily: string;
            fontSize: number;
            fontStyle: string;
            fontUnderline: boolean;
            showTitle: boolean;
            titleAlignment: string;
            titleColor: string;
        };

        /** Action 事件的通用 payload 字段 */
        type BasePayload<TSettings = JsonObject> = {
            settings: TSettings;
            coordinates: Coordinates;
            isInMultiAction: boolean;
        };

        // ============ Action 相关事件 ============

        /** settings 改变后收到 */
        type DidReceiveSettings = EventActionWithPayload<
            "didReceiveSettings",
            {
                settings: JsonObject;
                coordinates: Coordinates;
                isInMultiAction: boolean;
            }
        >;

        /** globalSettings 改变后收到 */
        type DidReceiveGlobalSettings = EventPluginWithPayload<
            "didReceiveGlobalSettings",
            {
                settings: JsonObject;
            }
        >;

        /** 用户按下按键时触发 */
        type KeyDown = EventActionWithPayload<
            "keyDown",
            {
                settings: JsonObject;
                coordinates: Coordinates;
                state: number;
                userDesiredState: number;
                isInMultiAction: boolean;
            }
        >;

        /** 用户释放按键时触发 */
        type KeyUp = KeyDown;

        /** 触摸点击事件（结构同 KeyDown） */
        type TouchTap = KeyDown;

        /**
         * 按键实例即将出现在 Stream Dock 上时触发。
         *
         * 触发场景：
         * - Stream Dock 应用启动
         * - 用户在配置文件间切换
         * - 用户拖放操作到画布上
         */
        type WillAppear = EventActionWithPayload<
            "willAppear",
            {
                controller: string;
                settings: JsonObject;
                coordinates: Coordinates;
                state: number;
                isInMultiAction: boolean;
            }
        >;

        /** 按键实例即将从 Stream Dock 上消失时触发 */
        type WillDisappear = WillAppear;

        /** 用户更改按键标题或标题参数时触发 */
        type TitleParametersDidChange = EventActionWithPayload<
            "titleParametersDidChange",
            {
                coordinates: Coordinates;
                settings: JsonObject;
                state: number;
                title: string;
                titleParameters: TitleParameters;
            }
        >;

        /** Property Inspector 显示时触发（Plugin 端收到） */
        type PropertyInspectorDidAppear = EventAction<"propertyInspectorDidAppear">;

        /** Property Inspector 销毁时触发 */
        type PropertyInspectorDidDisappear = EventAction<"propertyInspectorDidDisappear">;

        /** Property Inspector 向 Plugin 发送数据 */
        type SendToPlugin = EventActionWithPayload<"sendToPlugin", JsonObject>;

        /** Plugin 向 Property Inspector 发送数据 */
        type SendToPropertyInspector = EventActionWithPayload<"sendToPropertyInspector", JsonObject>;

        /** 用户从画布上删除操作时触发 */
        type DeleteAction = EventAction<"deleteAction">;

        // ============ 旋钮/刻度盘事件 ============

        /** 用户按下旋钮时触发 */
        type DialDown = EventActionWithPayload<
            "dialDown",
            {
                controller: "Knob";
                isInMultiAction: boolean;
                coordinates: Coordinates;
                userDesiredState: number;
                setting: JsonObject;
                state: number;
            }
        >;

        /** 用户释放旋钮时触发 */
        type DialUp = DialDown;

        /**
         * 用户旋转旋钮时触发。
         * `payload.ticks` 正值 = 顺时针，负值 = 逆时针。
         */
        type DialRotate = EventActionWithPayload<
            "dialRotate",
            {
                pressed: boolean;
                coordinates: Coordinates;
                setting: JsonObject;
                ticks: number;
            }
        >;

        // ============ 设备相关事件 ============

        /** 设备插入时触发 */
        type DeviceDidConnect = EventPlugin<"deviceDidConnect"> & {
            device: string;
            deviceInfo: DeviceInfo;
        };

        /** 设备拔出时触发 */
        type DeviceDidDisconnect = DeviceDidConnect;

        // ============ 系统相关事件 ============

        /** 被监控的应用程序启动时触发 */
        type ApplicationDidLaunch = EventPluginWithPayload<
            "applicationDidLaunch",
            {
                application: string;
            }
        >;

        /** 被监控的应用程序终止时触发 */
        type ApplicationDidTerminate = ApplicationDidLaunch;

        /** 计算机从睡眠中唤醒时触发 */
        type SystemDidWakeUp = EventPlugin<"systemDidWakeUp">;

        // ============ 屏幕保护相关事件 ============

        /** 取消注册屏幕保护事件 */
        type UnRegistrationScreenSaver = EventAction<"unRegistrationScreenSaver">;

        /** 停止背景动画 */
        type StopBackground = EventAction<"stopBackground"> & {
            source?: string;
        };

        /** 按键区域坐标按下事件 */
        type KeyDownCord = EventPluginWithPayload<
            "keyDownCord",
            {
                coordinates: CoordinatesXY;
                size: {
                    width: number;
                    height: number;
                };
            }
        > & {
            device: string;
            isInMultiAction: boolean;
        };

        /** 按键区域坐标释放事件 */
        type KeyUpCord = KeyDownCord;

        /** 屏幕锁定事件 */
        type LockScreen = EventPlugin<"lockScreen"> & {
            device: string;
        };

        /** 屏幕解锁事件 */
        type UnLockScreen = EventPlugin<"unLockScreen"> & {
            device: string;
        };
    }

    // ============ 命令类型 ============

    /**
     * 插件/属性检查器发送给 Stream Dock 的命令类型。
     *
     * 每个命令对应 BasePlugin/Action 上的一个方法（如 `setTitle`、`setImage`）。
     * 这些命令通过 WebSocket JSON 消息发送给 Stream Dock 应用。
     */
    namespace StreamDockCommands {
        /** 持久保存操作实例的 settings */
        type SetSettings = CommandActionWithPayload<"setSettings", JsonObject>;

        /** 请求操作实例的持久化 settings */
        type GetSettings = CommandAction<"getSettings">;

        /** 全局保存插件的 globalSettings */
        type SetGlobalSettings = CommandPluginWithPayload<"setGlobalSettings", JsonObject> & {
            context: string;
        };

        /** 请求全局持久化数据 */
        type GetGlobalSettings = CommandPlugin<"getGlobalSettings"> & {
            context: string;
        };

        /** 设置按键标题文字 */
        type SetTitle = CommandActionWithPayload<
            "setTitle",
            {
                title: string;
                target?: number;
                state?: number;
            }
        >;

        /** 设置按键图片（base64 编码） */
        type SetImage = CommandActionWithPayload<
            "setImage",
            {
                /** base64 编码的图片数据，格式: `data:image/png;base64,...` */
                image: string;
                target?: number;
                state?: number;
            }
        >;

        /** 切换按键状态（用于多状态操作） */
        type SetState = CommandActionWithPayload<
            "setState",
            {
                state: number;
            }
        >;

        /** 显示临时警告图标 */
        type ShowAlert = CommandAction<"showAlert">;

        /** 显示临时 OK 复选标记图标 */
        type ShowOk = CommandAction<"showOk">;

        /** 在默认浏览器中打开 URL */
        type OpenURL = CommandActionWithPayload<
            "openUrl",
            {
                url: string;
            }
        >;

        /** 将调试消息写入日志 */
        type LogMessage = CommandPluginWithPayload<
            "logMessage",
            {
                message: string;
            }
        >;

        /** 向 Property Inspector 发送数据 */
        type SendToPropertyInspector = CommandActionWithPayload<"sendToPropertyInspector", JsonObject> & {
            action: string;
        };

        /** 向 Plugin 发送数据 */
        type SendToPlugin = CommandPluginWithPayload<"sendToPlugin", JsonObject> & {
            action: string;
            context: string;
        };
    }
}

export {};
