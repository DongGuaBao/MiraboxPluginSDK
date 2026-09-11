/**
 * Plugin 与 Property Inspector 之间的双向 RPC 通信通道。
 *
 * 基于 JSON 消息协议：
 * - 调用方发送 `{ __rpc_call: true, __callId, method, args }`
 * - 接收方执行方法后回复 `{ __rpc_result: true, __callId, result }` 或 `{ __rpc_result: true, __callId, error }`
 *
 * 使用方式：
 * - Property Inspector 端: `property.callPlugin('method', ...args)` 或 `property.action.method(...args)`
 */
export class RpcChannel {
    static readonly DEFAULT_CALL_TIMEOUT = 10_000;
    private _pendingCalls = new Map<
        string,
        {
            resolve: (v: any) => void;
            reject: (e: any) => void;
            timeoutTimer?: ReturnType<typeof setTimeout>;
        }
    >();
    private _callId = 0;

    /**
     * @param send - 发送 JSON 消息的回调函数
     */
    constructor(private send: (payload: any) => void) {}

    /**
     * 处理收到的 JSON 消息。
     *
     * 自动识别 `__rpc_call`（执行方法）和 `__rpc_result`（处理返回值）两种协议消息。
     * 非 RPC 消息返回 `false`，交由调用方正常处理。
     *
     * @param payload - 收到的 JSON 消息体
     * @param target - 方法执行的目标对象
     * @returns `true` 如果消息被 RPC 处理，`false` 否则
     */
    handleIncoming(payload: any, target: any): boolean {
        if (payload?.__rpc_call) {
            const { __callId, method, args = [] } = payload;
            try {
                const result = target[method]?.(...args);
                if (result instanceof Promise) {
                    result.then(
                        (res: any) => this.send({ __rpc_result: true, __callId, result: res }),
                        (err: any) => this.send({ __rpc_result: true, __callId, error: String(err) }),
                    );
                } else {
                    this.send({ __rpc_result: true, __callId, result });
                }
            } catch (err: any) {
                this.send({ __rpc_result: true, __callId, error: String(err) });
            }
            return true;
        }
        if (payload?.__rpc_result) {
            const pending = this._pendingCalls.get(payload.__callId);
            if (pending) {
                this._pendingCalls.delete(payload.__callId);
                if (pending.timeoutTimer !== undefined) clearTimeout(pending.timeoutTimer);
                if (payload.error != null) pending.reject(new Error(payload.error));
                else pending.resolve(payload.result);
            }
            return true;
        }
        return false;
    }

    /**
     * 发起 RPC 调用，调用对端对象上的方法。
     *
     * @param method - 方法名称
     * @param args - 方法参数
     * @returns Promise，resolve 为方法的返回值
     */
    call(method: string, ...args: any[]): Promise<any> {
        return this.callWithTimeout(method, RpcChannel.DEFAULT_CALL_TIMEOUT, args);
    }

    private callWithTimeout(method: string, timeout: number | undefined, args: any[]): Promise<any> {
        const callId = `${++this._callId}`;
        return new Promise((resolve, reject) => {
            const pending: {
                resolve: (v: any) => void;
                reject: (e: any) => void;
                timeoutTimer?: ReturnType<typeof setTimeout>;
            } = { resolve, reject };

            if (timeout !== undefined) {
                pending.timeoutTimer = setTimeout(() => {
                    if (!this._pendingCalls.delete(callId)) return;
                    reject(new Error(`RPC call "${method}" timed out after ${timeout}ms`));
                }, timeout);
            }

            this._pendingCalls.set(callId, pending);
            try {
                this.send({ __rpc_call: true, __callId: callId, method, args });
            } catch (error) {
                this._pendingCalls.delete(callId);
                if (pending.timeoutTimer !== undefined) clearTimeout(pending.timeoutTimer);
                reject(error);
            }
        });
    }

    /**
     * 创建一个 Proxy 对象，将任意属性访问转为 RPC 调用。
     *
     * ```ts
     * // Plugin 端
     * const pi = action.property;  // 返回此 Proxy
     * await pi.setTitle('Hello');  // 等价于 callPropertyInspector('setTitle', 'Hello')
     *
     * // Property Inspector 端
     * const plugin = property.action;  // 返回此 Proxy
     * await plugin.doSomething();  // 等价于 callPlugin('doSomething')
     * ```
     *
     * @param timeout - 每次 RPC 调用的超时时间（毫秒）；不传则不限制。
     * @returns Proxy 对象
     */
    createProxy(timeout?: number): any {
        if (timeout !== undefined && (!Number.isFinite(timeout) || timeout < 0)) {
            throw new RangeError("RPC timeout must be a finite non-negative number");
        }
        return new Proxy(
            {},
            {
                get:
                    (_, method: string) =>
                    (...args: any[]) =>
                        this.callWithTimeout(method, timeout, args),
            },
        );
    }
}
