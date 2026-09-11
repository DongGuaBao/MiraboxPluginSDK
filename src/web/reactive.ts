/**
 * 在 SDK 任意 web 子模块里安全拿到 Property 的 settings 对象。
 *
 * 直接 `import { Property }` 会在 tsdown 的不同 entry 之间产生**孤立的 Property 类副本**,
 * 副本的 `_instance` 静态字段与主入口的 Property 各自维护,settings 拿不到。
 *
 * 因此 UI 组件、QtWebChannel、toast 等辅助模块统一通过 `window.PropertyClass`
 * 这个**真正的单例引用**访问 settings(由 `initProperty()` 注入)。
 *
 * 子窗口会自动代理到 `opener.PropertyClass`,与主窗口共享同一 reactive 对象。
 */

export interface ReactiveLike {
    settings: Record<string, any>;
    [key: string]: any;
}

/** 解析当前的 Property reactive 实例,不可用时返回 null。 */
export function resolveReactiveProperty(): ReactiveLike | null {
    if (typeof window === "undefined") return null;
    const klass = (window as any).PropertyClass as { getReactiveInstance?: () => ReactiveLike } | undefined;
    if (klass?.getReactiveInstance) {
        try {
            return klass.getReactiveInstance() ?? null;
        } catch {
            return null;
        }
    }
    return null;
}

/** 解析当前 settings 对象,不可用时返回 null。 */
export function resolveSettings(): Record<string, any> | null {
    const reactive = resolveReactiveProperty();
    if (!reactive) return null;
    const settings = reactive.settings;
    if (settings && typeof settings === "object") return settings as Record<string, any>;
    return null;
}

/** 解析当前 PI 的 action context（来自 `window.argv[1]`）。 */
export function resolvePropertyContext(): string | null {
    if (typeof window === "undefined") return null;
    const argv = (window as any).argv;
    const context = argv?.[1];
    return typeof context === "string" ? context : null;
}
