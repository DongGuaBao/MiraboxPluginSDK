import { ref } from "vue";

const QWebChannelMessageTypes = {
    signal: 1,
    propertyUpdate: 2,
    init: 3,
    idle: 4,
    debug: 5,
    invokeMethod: 6,
    connectToSignal: 7,
    disconnectFromSignal: 8,
    setProperty: 9,
    response: 10,
};

class QWebChannel {
    transport: any;
    objects: any;
    execId: any;
    execCallbacks: any;
    _transportSend: any;
    constructor(transport: any, initCallback: any) {
        this.transport = transport;
        this._transportSend = transport.send.bind(transport);

        this.transport.onmessage = (message: any) => {
            const rawData = message.data;
            const data = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
            switch (data.type) {
                case QWebChannelMessageTypes.signal:
                    this.handleSignal(data);
                    break;
                case QWebChannelMessageTypes.response:
                    this.handleResponse(data);
                    break;
                case QWebChannelMessageTypes.propertyUpdate:
                    this.handlePropertyUpdate(data);
                    break;
                default:
                    console.error("invalid message received:", message.data);
                    break;
            }
        };

        this.execCallbacks = {};
        this.execId = 0;

        this.objects = {};

        this.exec({ type: QWebChannelMessageTypes.init }, (data: any) => {
            for (let objectName in data) {
                let object = new QObject(objectName, data[objectName], this);
            }
            for (let objectName in this.objects) {
                this.objects[objectName].unwrapProperties();
            }
            if (initCallback) {
                initCallback(this);
            }
            this.exec({ type: QWebChannelMessageTypes.idle });
        });
    }
    exec(data: any, callback: any = null) {
        if (!callback) {
            // if no callback is given, send directly
            this.send(data);
            return;
        }
        if (this.execId >= Number.MAX_SAFE_INTEGER) {
            this.execId = 0;
        }
        if (data.hasOwnProperty("id")) {
            console.error("Cannot exec message with property id: " + JSON.stringify(data));
            return;
        }
        data.id = this.execId++;
        this.execCallbacks[data.id] = callback;
        this.send(data);
    }
    send(data: any) {
        if (typeof data !== "string") {
            data = JSON.stringify(data);
        }
        this._transportSend(data);
    }
    handleSignal(message: any) {
        let object = this.objects[message.object];
        if (object) {
            object.signalEmitted(message.signal, message.args);
        } else {
            console.warn("Unhandled signal: " + message.object + "::" + message.signal);
        }
    }

    handleResponse(message: any) {
        if (!Object.prototype.hasOwnProperty.call(message, "id")) {
            console.error("Invalid response message received: ", JSON.stringify(message));
            return;
        }
        const callback = this.execCallbacks[message.id];
        if (callback) {
            delete this.execCallbacks[message.id];
            callback(message.data);
        }
    }

    handlePropertyUpdate(message: any) {
        for (let i in message.data) {
            let data = message.data[i];
            let object = this.objects[data.object];
            if (object) {
                object.propertyUpdate(data.signals, data.properties);
            } else {
                console.warn("Unhandled property update: " + data.object + "::" + data.signal);
            }
        }
        this.exec({ type: QWebChannelMessageTypes.idle });
    }

    debug(message: any) {
        this.send({ type: QWebChannelMessageTypes.debug, data: message });
    }
}

class QObject {
    __id__: any;
    __objectSignals__: any;
    __propertyCache__: any;
    webChannel: any;
    constructor(name: any, data: any, webChannel: any) {
        this.__id__ = name;
        webChannel.objects[name] = this;
        this.webChannel = webChannel;
        // List of callbacks that get invoked upon signal emission
        this.__objectSignals__ = {};

        // Cache of all properties, updated when a notify signal is emitted
        this.__propertyCache__ = {};
        // ----------------------------------------------------------------------

        // ----------------------------------------------------------------------

        data.methods.forEach(this.addMethod.bind(this));

        data.properties.forEach(this.bindGetterSetter.bind(this));

        data.signals.forEach((signal: any) => {
            this.addSignal(signal, false);
        });

        for (let name in data.enums) {
            (this as any)[name] = data.enums[name];
        }
    }
    unwrapQObject(response: any) {
        if (response instanceof Array) {
            // support list of objects
            let ret = new Array(response.length);
            for (let i = 0; i < response.length; ++i) {
                ret[i] = this.unwrapQObject(response[i]);
            }
            return ret;
        }
        if (!response || !response["__QObject*__"] || response.id === undefined) {
            return response;
        }

        let objectId = response.id;
        if (this.webChannel.objects[objectId]) return this.webChannel.objects[objectId];

        if (!response.data) {
            console.error("Cannot unwrap unknown QObject " + objectId + " without data.");
            return;
        }

        let qObject: any = new QObject(objectId, response.data, this.webChannel);
        qObject.destroyed.connect(function () {
            if (qObject.webChannel.objects[objectId] === qObject) {
                delete qObject.webChannel.objects[objectId];
                // reset the now deleted QObject to an empty {} object
                // just assigning {} though would not have the desired effect, but the
                // below also ensures all external references will see the empty map
                // NOTE: this detour is necessary to workaround QTBUG-40021
                let propertyNames = [];
                for (let propertyName in qObject) {
                    propertyNames.push(propertyName);
                }
                for (let idx in propertyNames) {
                    delete qObject[propertyNames[idx]];
                }
            }
        });
        // here we are already initialized, and thus must directly unwrap the properties
        qObject.unwrapProperties();
        return qObject;
    }

    unwrapProperties() {
        for (let propertyIdx in this.__propertyCache__) {
            this.__propertyCache__[propertyIdx] = this.unwrapQObject(this.__propertyCache__[propertyIdx]);
        }
    }

    addSignal(signalData: any, isPropertyNotifySignal: any) {
        let signalName = signalData[0];
        let signalIndex = signalData[1];
        (this as any)[signalName] = {
            connect: (callback: any) => {
                if (typeof callback !== "function") {
                    console.error("Bad callback given to connect to signal " + signalName);
                    return;
                }

                this.__objectSignals__[signalIndex] = this.__objectSignals__[signalIndex] || [];
                this.__objectSignals__[signalIndex].push(callback);

                if (!isPropertyNotifySignal && signalName !== "destroyed") {
                    this.webChannel.exec({
                        type: QWebChannelMessageTypes.connectToSignal,
                        object: this.__id__,
                        signal: signalIndex,
                    });
                }
            },
            disconnect: (callback: any) => {
                if (typeof callback !== "function") {
                    console.error("Bad callback given to disconnect from signal " + signalName);
                    return;
                }
                this.__objectSignals__[signalIndex] = this.__objectSignals__[signalIndex] || [];
                let idx = this.__objectSignals__[signalIndex].indexOf(callback);
                if (idx === -1) {
                    console.error("Cannot find connection of signal " + signalName + " to " + callback.name);
                    return;
                }
                this.__objectSignals__[signalIndex].splice(idx, 1);
                if (!isPropertyNotifySignal && this.__objectSignals__[signalIndex].length === 0) {
                    this.webChannel.exec({
                        type: QWebChannelMessageTypes.disconnectFromSignal,
                        object: this.__id__,
                        signal: signalIndex,
                    });
                }
            },
        };
    }

    /**
     * Invokes all callbacks for the given signalname. Also works for property notify callbacks.
     */
    invokeSignalCallbacks(signalName: any, signalArgs: any) {
        let connections = this.__objectSignals__[signalName];
        if (connections) {
            connections.forEach(function (callback: any) {
                callback.apply(callback, signalArgs);
            });
        }
    }

    propertyUpdate(signals: any, propertyMap: any) {
        // update property cache
        for (let propertyIndex in propertyMap) {
            let propertyValue = propertyMap[propertyIndex];
            this.__propertyCache__[propertyIndex] = propertyValue;
        }

        for (let signalName in signals) {
            // Invoke all callbacks, as signalEmitted() does not. This ensures the
            // property cache is updated before the callbacks are invoked.
            this.invokeSignalCallbacks(signalName, signals[signalName]);
        }
    }

    signalEmitted(signalName: any, signalArgs: any) {
        this.invokeSignalCallbacks(signalName, signalArgs);
    }

    addMethod(methodData: any) {
        let methodName = methodData[0];
        let methodIdx = methodData[1];
        (this as any)[methodName] = function (this: any, ...args: any[]) {
            let callback: any;
            const methodArgs: any[] = [];
            for (let i = 0; i < args.length; ++i) {
                if (typeof args[i] === "function") callback = args[i];
                else methodArgs.push(args[i]);
            }

            this.webChannel.exec(
                {
                    type: QWebChannelMessageTypes.invokeMethod,
                    object: this.__id__,
                    method: methodIdx,
                    args: methodArgs,
                },
                (response: any) => {
                    if (response !== undefined) {
                        let result = this.unwrapQObject(response);
                        if (callback) {
                            callback(result);
                        }
                    }
                },
            );
        };
    }

    bindGetterSetter(propertyInfo: any) {
        let propertyIndex = propertyInfo[0];
        let propertyName = propertyInfo[1];
        let notifySignalData = propertyInfo[2];
        // initialize property cache with current value
        // NOTE: if this is an object, it is not directly unwrapped as it might
        // reference other QObject that we do not know yet
        this.__propertyCache__[propertyIndex] = propertyInfo[3];

        if (notifySignalData) {
            if (notifySignalData[0] === 1) {
                // signal name is optimized away, reconstruct the actual name
                notifySignalData[0] = propertyName + "Changed";
            }
            this.addSignal(notifySignalData, true);
        }

        Object.defineProperty(this, propertyName, {
            configurable: true,
            get: function () {
                let propertyValue = this.__propertyCache__[propertyIndex];
                if (propertyValue === undefined) {
                    // This shouldn't happen
                    console.warn('Undefined value in property cache for property "' + propertyName + '" in object ' + this.__id__);
                }

                return propertyValue;
            },
            set: function (value) {
                if (value === undefined) {
                    console.warn("Property setter for " + propertyName + " called with undefined value!");
                    return;
                }
                this.__propertyCache__[propertyIndex] = value;
                this.webChannel.exec({
                    type: QWebChannelMessageTypes.setProperty,
                    object: this.__id__,
                    property: propertyIndex,
                    value: value,
                });
            },
        });
    }
}
/** Craft 通过 `qmlMessage` 信号回传的文件选择结果。 */
export interface CraftFileSelection {
    /** 触发本次选择的 action context，用于多按键并发时对号入座。 */
    context: string;
    /** Craft 回传的原始 filePath 字符串（通常是 JSON 数组）。 */
    raw: string;
    /** 解析后的绝对路径数组；无法解析时退化为 `[raw]`。 */
    paths: string[];
}

export class QtWebChannelStore {
    qtObject: any;
    x: any;
    y: any;
    flag: any;
    /** qtObject 是否已就绪（响应式）。 */
    ready: any;
    callbackPromise!: Promise<void>;
    private fileListeners = new Set<(selection: CraftFileSelection) => void>();
    private qmlBound = false;
    constructor(transport: any) {
        this.qtObject = ref();
        this.x = ref(0);
        this.y = ref(0);
        this.flag = ref(true);
        this.ready = ref(false);
        this.callbackPromise = new Promise<void>((resolve, reject) => {
            new QWebChannel(transport, (channel: any) => {
                this.qtObject.value = channel.objects.channelqtObject;
                this.qtObject.value.sigDidReceiveCoordinate?.connect((xx: number, yy: number) => {
                    this.x.value = Math.round(xx);
                    this.y.value = Math.round(yy);
                    this.flag.value = true;
                });
                this.bindQmlMessage();
                this.ready.value = true;
                resolve();
            });
        });
    }
    async waitUtilInit(): Promise<void> {
        return await this.callbackPromise;
    }

    /** 只绑定一次 qmlMessage，避免重复 connect 导致回调多次触发。 */
    private bindQmlMessage() {
        if (this.qmlBound) return;
        const target = this.qtObject.value;
        if (!target?.qmlMessage?.connect) return;
        this.qmlBound = true;
        target.qmlMessage.connect((context: string, filePath: string) => {
            let paths: string[];
            try {
                const parsed = JSON.parse(filePath);
                paths = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
            } catch {
                paths = filePath ? [filePath] : [];
            }
            const selection: CraftFileSelection = { context, raw: filePath, paths };
            for (const listener of this.fileListeners) {
                try {
                    listener(selection);
                } catch {}
            }
        });
    }

    /**
     * 监听 Craft 文件选择结果。
     *
     * @returns 取消监听函数，组件卸载时务必调用。
     */
    onFileSelected(listener: (selection: CraftFileSelection) => void): () => void {
        this.fileListeners.add(listener);
        this.bindQmlMessage();
        return () => {
            this.fileListeners.delete(listener);
        };
    }

    /**
     * 打开 Craft 原生文件选择器。结果通过 {@link onFileSelected} 异步回传。
     *
     * @param context - 当前 action 的 context（`window.argv[1]` 或事件里的 context）
     * @param multiple - 是否允许多选
     * @param limit - 多选时的最大数量
     * @returns qtObject 未就绪时返回 false
     */
    openFileSelector(context: string, multiple = false, limit = 1): boolean {
        const target = this.qtObject.value;
        if (!target?.openFileSelector) return false;
        target.openFileSelector(context, multiple, limit);
        return true;
    }

    /** 请求 Craft 删除一个已选文件（用于相册类插件移除条目）。 */
    deleteFile(path: string): boolean {
        const target = this.qtObject.value;
        if (!target?.deleteFile) return false;
        target.deleteFile(path);
        return true;
    }
    setLocalCoordinate(x: number, y: number) {
        this.x.value = Math.round(x);
        this.y.value = Math.round(y);
    }

    setCoordinate(x: number, y: number): boolean {
        const target = this.qtObject.value;
        if (!target?.uDidReceiveCoordinate) return false;
        this.setLocalCoordinate(x, y);
        this.flag.value = false;
        target.uDidReceiveCoordinate(this.x.value, this.y.value);
        return true;
    }

    handleKeydown = (event: any) => {
        // 判断当前焦点是否是输入框
        const activeElement = document.activeElement;
        const isInputFocused = activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA");

        // 如果输入框获取了焦点或者没有返回值，直接返回
        if (isInputFocused || !this.flag.value) {
            return;
        }

        this.flag.value = false;
        switch (event.key) {
            case "ArrowUp":
                this.y.value -= 1;
                event.preventDefault();
                break;
            case "ArrowDown":
                this.y.value += 1;
                event.preventDefault();
                break;
            case "ArrowLeft":
                this.x.value -= 1;
                event.preventDefault();
                break;
            case "ArrowRight":
                this.x.value += 1;
                event.preventDefault();
                break;
        }
        if (!this.setCoordinate(this.x.value, this.y.value)) {
            this.flag.value = true;
        }
    };
}

/**
 * 仅在 Craft 嵌入式页面提供 Qt transport 时创建适配器。
 * 普通 StreamDock PI、浏览器调试页和 Node 后端会安全返回 null。
 *
 * @deprecated 请使用 {@link getCraftQtChannel}。QWebChannel 会独占
 * `transport.onmessage`，重复构造会让先前的实例静默失效，因此本函数现在
 * 直接复用同一个单例。
 */
export function createCraftQtChannel(): QtWebChannelStore | null {
    return getCraftQtChannel();
}

/**
 * 单例必须跨 SDK entry 共享。`property.mjs` 和 `ui/index.mjs` 各自打包，
 * 各自的模块级 `let singleton = null` 会让两份 bundle 各自构造 QWebChannel，
 * 第二次构造覆盖 `transport.onmessage` 会让先前的实例静默失效。
 * 因此通过 `globalThis` 共享同一引用。
 */
const SINGLETON_KEY = "__streamDockCraftQtChannel";
type GlobalWithChannel = typeof globalThis & { [SINGLETON_KEY]?: QtWebChannelStore | null };

function getSingleton(): QtWebChannelStore | null {
    const g = globalThis as GlobalWithChannel;
    return g[SINGLETON_KEY] ?? null;
}

function setSingleton(value: QtWebChannelStore | null): void {
    (globalThis as GlobalWithChannel)[SINGLETON_KEY] = value;
}

/** 探测函数，可被外部替换以支持宿主注入的假 transport（测试 / Storybook）。 */
type TransportProbe = () => any;

let transportProbe: TransportProbe = () => (typeof window === "undefined" ? null : (window as any).qt?.webChannelTransport);

/** 自定义 Qt transport 探测（仅在浏览器环境下生效）。 */
export function setCraftQtTransportProbe(probe: TransportProbe | null): void {
    if (probe) {
        transportProbe = probe;
    } else {
        transportProbe = () => (typeof window === "undefined" ? null : (window as any).qt?.webChannelTransport);
    }
}

/** 探测当前是否处于 Craft 嵌入式页面且 Qt transport 可用。 */
export function hasCraftQtChannel(): boolean {
    if (typeof window === "undefined") return false;
    return Boolean((window as any).qt?.webChannelTransport?.send);
}

/** 强制重新创建单例（极少使用，主要用于测试）。 */
export function resetCraftQtChannel(): void {
    setSingleton(null);
}

/**
 * 获取 Craft QtWebChannel 唯一实例。**首次调用**会自动检测并初始化。
 *
 * - 非 Craft 环境（普通 StreamDock、浏览器调试、子窗口无 transport）始终返回 `null`；
 * - 多次调用、跨 SDK entry 调用都复用同一个实例（通过 globalThis 共享）；
 * - 构造失败不会抛错；
 * - 配合 `Property.startProperty()` 之后可安全在 `onMounted`/`willAppear` 任意时机调用。
 */
export function getCraftQtChannel(): QtWebChannelStore | null {
    if (typeof window === "undefined") return null;
    const existing = getSingleton();
    if (existing) return existing;
    const transport = transportProbe();
    if (!transport?.send) return null;
    try {
        const instance = new QtWebChannelStore(transport);
        setSingleton(instance);
        return instance;
    } catch {
        return null;
    }
}
