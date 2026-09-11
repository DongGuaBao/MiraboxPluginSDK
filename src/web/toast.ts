/** 轻量 Property Inspector 提示与剪贴板工具。 */
import { reactive, readonly } from "vue";

export type ToastVariant = "info" | "success" | "error";

export interface ToastItem {
    id: number;
    message: string;
    variant: ToastVariant;
    /** 显示时长（毫秒），`<= 0` 表示不自动消失。 */
    duration: number;
    /** 创建时间戳。 */
    createdAt: number;
}

interface ToastState {
    items: ToastItem[];
    sequence: number;
}

/**
 * **关键：state 必须在多个 SDK entry 之间共享。**
 *
 * `dist/web/property.mjs` 与 `dist/web/ui/index.mjs` 是两个独立 bundle。若各自内联
 * 一份 `reactive({ items: [] })`，则 `useToast()` 写入的 state 和 `MiToastHost`
 * 读取的 state 不是同一个对象 —— toast 会"触发了但界面不显示"。
 *
 * 通过挂在 `globalThis` 上的单一引用，保证所有 entry 共用同一份响应式 state。
 */
const STATE_KEY = "__streamDockToastState";
type GlobalWithToast = typeof globalThis & { [STATE_KEY]?: ToastState };

function getState(): ToastState {
    const scope = globalThis as GlobalWithToast;
    if (!scope[STATE_KEY]) {
        scope[STATE_KEY] = reactive<ToastState>({ items: [], sequence: 0 });
    }
    return scope[STATE_KEY]!;
}

const DEFAULT_DURATION = 1800;

function show(message: string, variant: ToastVariant = "info", duration = DEFAULT_DURATION): number {
    const state = getState();
    const id = ++state.sequence;
    state.items.push({ id, message, variant, duration, createdAt: Date.now() });
    if (duration > 0 && typeof window !== "undefined") {
        window.setTimeout(() => dismiss(id), duration);
    }
    return id;
}

function dismiss(id: number): void {
    const state = getState();
    const index = state.items.findIndex(item => item.id === id);
    if (index >= 0) state.items.splice(index, 1);
}

function clear(): void {
    const state = getState();
    state.items.splice(0, state.items.length);
}

interface ToastApi {
    /** 弹出一条提示，返回可用于 `dismiss` 的 id。 */
    (message: string, variant?: ToastVariant, duration?: number): number;
    success: (message: string, duration?: number) => number;
    error: (message: string, duration?: number) => number;
    info: (message: string, duration?: number) => number;
    dismiss: (id: number) => void;
    clear: () => void;
}

/**
 * 弹出式提示 API。需要在 `MiPanel` 内放一个 `MiToastHost` 才会渲染。
 *
 * ```ts
 * import { useToast } from "@mirabox/streamdock-sdk/ui";
 * const toast = useToast();
 * toast.success("已复制");
 * ```
 */
export function useToast(): ToastApi {
    const api = ((message: string, variant: ToastVariant = "info", duration = DEFAULT_DURATION) => show(message, variant, duration)) as ToastApi;
    api.success = (message, duration) => show(message, "success", duration);
    api.error = (message, duration) => show(message, "error", duration);
    api.info = (message, duration) => show(message, "info", duration);
    api.dismiss = id => dismiss(id);
    api.clear = () => clear();
    return api;
}

/** 当前 toast 列表的只读响应式视图，供 `MiToastHost` 渲染。 */
export function useToastState(): { items: readonly ToastItem[] } {
    const state = getState();
    return { items: readonly(state.items) as readonly ToastItem[] };
}

/**
 * 复制文本到剪贴板。优先使用 `navigator.clipboard`，不可用时降级为隐藏
 * `textarea` + `execCommand("copy")`。
 */
export async function copyText(text: string): Promise<boolean> {
    if (typeof window === "undefined") return false;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {}
    try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.top = "0";
        textarea.style.left = "0";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        return copied;
    } catch {
        return false;
    }
}
