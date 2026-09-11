import { defineComponent, h, onBeforeUnmount, ref, watch, type PropType } from "vue";
import { ensurePropertyUiStyles, propertyUiCss } from "./styles";
import { getCraftQtChannel, type CraftFileSelection, type QtWebChannelStore } from "../qt-web-channel";
import { useToastState, type ToastItem } from "../toast";
import { resolveSettings, resolvePropertyContext } from "../reactive";

type OptionValue = string | number | boolean;
export type MiSelectOption = { label: string; value: OptionValue; disabled?: boolean };

function useUi() { ensurePropertyUiStyles(); }
const childrenOf = (slots: any) => slots.default?.();

export const MiPanel = defineComponent({
    name: "MiPanel",
    setup(_, { slots }) { useUi(); return () => h("main", { class: "mi-panel" }, childrenOf(slots)); },
});

export const MiSection = defineComponent({
    name: "MiSection",
    props: { title: String },
    setup(props, { slots }) { useUi(); return () => h("section", { class: "mi-section" }, [
        props.title ? h("div", { class: "mi-section__title", title: props.title }, props.title) : null,
        childrenOf(slots),
    ]); },
});

export const MiGrid = defineComponent({
    name: "MiGrid",
    /** 列数支持 1~4，超出范围会被收敛到边界值。 */
    props: { columns: { type: Number as PropType<1 | 2 | 3 | 4>, default: 2 } },
    setup(props, { slots }) { useUi(); return () => h("div", { class: ["mi-grid", `mi-grid--${Math.min(4, Math.max(1, Math.round(props.columns)))}`] }, childrenOf(slots)); },
});

export const MiField = defineComponent({
    name: "MiField",
    props: { label: { type: String, required: true }, hint: String, error: String, required: Boolean },
    setup(props, { slots }) { useUi(); return () => h("div", { class: "mi-field" }, [
        h("div", { class: "mi-field__label", title: props.label }, [props.label, props.required ? h("span", { class: "mi-field__required" }, "*") : null]),
        h("div", { class: "mi-field__body" }, [childrenOf(slots), props.error ? h("div", { class: "mi-field__error" }, props.error) : props.hint ? h("div", { class: "mi-field__hint" }, props.hint) : null]),
    ]); },
});

const TEXT_INPUT_TYPES = ["text", "password", "url", "search", "tel", "email"] as const;
type TextInputType = (typeof TEXT_INPUT_TYPES)[number];
const textProps = { modelValue: { type: [String, Number] as PropType<string | number>, default: "" }, placeholder: String, disabled: Boolean };
export const MiTextInput = defineComponent({
    name: "MiTextInput", inheritAttrs: false,
    /** `type` 支持 text / password / url / search / tel / email；password 自带显隐切换。 */
    props: { ...textProps, type: { type: String as PropType<TextInputType>, default: "text" } },
    emits: ["update:modelValue"],
    setup(props, { attrs, emit }) {
        useUi();
        const revealed = ref(false);
        return () => {
            const declared: TextInputType = (TEXT_INPUT_TYPES as readonly string[]).includes(props.type) ? props.type : "text";
            const isPassword = declared === "password";
            const effective = isPassword && revealed.value ? "text" : declared;
            return h("div", { class: ["mi-text-input", isPassword && "mi-text-input--password"] }, [
                h("input", { ...attrs, class: ["mi-control", attrs.class], type: effective, value: props.modelValue, placeholder: props.placeholder, disabled: props.disabled, onInput: (e: Event) => emit("update:modelValue", (e.target as HTMLInputElement).value) }),
                isPassword ? h("button", { class: ["mi-text-input__reveal", revealed.value && "mi-text-input__reveal--on"], type: "button", tabindex: -1, disabled: props.disabled, "aria-pressed": String(revealed.value), onClick: () => { revealed.value = !revealed.value; } }) : null,
            ]);
        };
    },
});

export const MiNumberInput = defineComponent({
    name: "MiNumberInput", inheritAttrs: false,
    props: { modelValue: { type: Number as PropType<number | null>, default: null }, min: Number, max: Number, step: { type: Number, default: 1 }, suffix: String, disabled: Boolean }, emits: ["update:modelValue"],
    setup(props, { attrs, emit }) { useUi(); return () => h("div", { class: "mi-number", style: props.suffix ? { "--mi-number-suffix-space": `${Math.min(50, props.suffix.length * 8 + 14)}px` } : undefined }, [
        h("input", { ...attrs, class: ["mi-control", attrs.class], type: "number", value: props.modelValue ?? "", min: props.min, max: props.max, step: props.step, disabled: props.disabled, onWheel: (e: WheelEvent) => (e.currentTarget as HTMLInputElement).blur(), onInput: (e: Event) => { const value = (e.target as HTMLInputElement).value; emit("update:modelValue", value === "" ? null : Number(value)); } }),
        props.suffix ? h("span", { class: "mi-number__suffix" }, props.suffix) : null,
    ]); },
});

export const MiSelect = defineComponent({
    name: "MiSelect", inheritAttrs: false,
    props: { modelValue: { type: [String, Number, Boolean] as PropType<OptionValue>, required: true }, options: { type: Array as PropType<Array<MiSelectOption | OptionValue>>, default: () => [] }, disabled: Boolean }, emits: ["update:modelValue", "change"],
    setup(props, { attrs, emit }) { useUi(); return () => h("select", { ...attrs, class: ["mi-control", attrs.class], value: String(props.modelValue), disabled: props.disabled, onChange: (e: Event) => { const raw = (e.target as HTMLSelectElement).value; const option = props.options.map(item => typeof item === "object" ? item : { label: String(item), value: item }).find(item => String(item.value) === raw); const value = option?.value ?? raw; emit("update:modelValue", value); emit("change", value); } }, props.options.map(item => { const option = typeof item === "object" ? item : { label: String(item), value: item }; return h("option", { value: String(option.value), disabled: option.disabled }, option.label); })); },
});

export const MiFilePicker = defineComponent({
    name: "MiFilePicker", inheritAttrs: false,
    props: { accept: String, multiple: Boolean, disabled: Boolean, buttonText: { type: String, default: "选择文件" }, emptyText: { type: String, default: "未选择文件" } }, emits: ["select"],
    setup(props, { attrs, emit }) { useUi(); let input: HTMLInputElement | null = null; const name = ref(props.emptyText); return () => h("div", { class: "mi-file" }, [
        h("input", { ...attrs, ref: (el: any) => input = el, type: "file", accept: props.accept, multiple: props.multiple, disabled: props.disabled, style: "display:none", onChange: (e: Event) => { const files = Array.from((e.target as HTMLInputElement).files ?? []); name.value = files.map(file => file.name).join(", ") || props.emptyText; emit("select", props.multiple ? files : files[0] ?? null); } }),
        h(MiButton, { disabled: props.disabled, onClick: () => input?.click() }, () => props.buttonText),
        h("span", { class: "mi-file__name", title: name.value }, name.value),
    ]); },
});

export const MiColorInput = defineComponent({
    name: "MiColorInput", props: { modelValue: { type: String, default: "#ffffff" }, disabled: Boolean }, emits: ["update:modelValue"],
    setup(props, { emit }) { useUi(); const update = (e: Event) => emit("update:modelValue", (e.target as HTMLInputElement).value); return () => h("div", { class: "mi-color" },
        h("input", { class: ["mi-control", "mi-color__picker"], type: "color", value: props.modelValue, disabled: props.disabled, onInput: update })); },
});

export const MiSlider = defineComponent({
    name: "MiSlider", props: { modelValue: { type: Number, required: true }, min: { type: Number, default: 0 }, max: { type: Number, default: 100 }, step: { type: Number, default: 1 }, suffix: String, disabled: Boolean }, emits: ["update:modelValue"],
    setup(props, { emit }) { useUi(); return () => h("div", { class: "mi-slider" }, [
        h("input", { type: "range", value: props.modelValue, min: props.min, max: props.max, step: props.step, disabled: props.disabled, onInput: (e: Event) => emit("update:modelValue", Number((e.target as HTMLInputElement).value)) }),
        h("span", { class: "mi-slider__value" }, `${props.modelValue}${props.suffix ?? ""}`),
    ]); },
});

export const MiCheckbox = defineComponent({
    name: "MiCheckbox", props: { modelValue: Boolean, label: String, disabled: Boolean }, emits: ["update:modelValue"],
    setup(props, { slots, emit }) { useUi(); return () => h("label", { class: "mi-check" }, [h("input", { type: "checkbox", checked: props.modelValue, disabled: props.disabled, onChange: (e: Event) => emit("update:modelValue", (e.target as HTMLInputElement).checked) }), h("span", { class: "mi-check__text", title: props.label }, childrenOf(slots) ?? props.label)]); },
});

export const MiButton = defineComponent({
    name: "MiButton", inheritAttrs: false, props: { variant: { type: String as PropType<"default" | "primary" | "danger" | "ghost">, default: "default" }, disabled: Boolean }, emits: ["click"],
    setup(props, { attrs, slots, emit }) { useUi(); return () => h("button", { ...attrs, class: ["mi-button", `mi-button--${props.variant}`, attrs.class], type: "button", disabled: props.disabled, onClick: (e: MouseEvent) => emit("click", e) }, childrenOf(slots)); },
});

export const MiButtonGroup = defineComponent({ name: "MiButtonGroup", setup(_, { slots }) { useUi(); return () => h("div", { class: "mi-button-group" }, childrenOf(slots)); } });
export const MiHint = defineComponent({ name: "MiHint", props: { danger: Boolean }, setup(props, { slots }) { useUi(); return () => h("div", { class: ["mi-hint", props.danger && "mi-hint--danger"] }, childrenOf(slots)); } });

export const MiTextarea = defineComponent({
    name: "MiTextarea", inheritAttrs: false,
    props: { modelValue: { type: String, default: "" }, placeholder: String, disabled: Boolean, rows: { type: Number, default: 3 }, maxlength: Number, resize: Boolean }, emits: ["update:modelValue"],
    setup(props, { attrs, emit }) {
        useUi();
        return () => h("textarea", {
            ...attrs,
            class: ["mi-control", "mi-textarea", props.resize && "mi-textarea--resize", attrs.class],
            value: props.modelValue,
            placeholder: props.placeholder,
            disabled: props.disabled,
            rows: props.rows,
            maxlength: props.maxlength,
            onInput: (e: Event) => emit("update:modelValue", (e.target as HTMLTextAreaElement).value),
        });
    },
});

export const MiSwitch = defineComponent({
    name: "MiSwitch", props: { modelValue: Boolean, label: String, disabled: Boolean }, emits: ["update:modelValue"],
    setup(props, { slots, emit }) {
        useUi();
        const toggle = () => { if (!props.disabled) emit("update:modelValue", !props.modelValue); };
        return () => {
            const text = childrenOf(slots) ?? props.label;
            return h("div", { class: ["mi-switch", props.disabled && "mi-switch--disabled"], role: "switch", tabindex: props.disabled ? -1 : 0, "aria-checked": String(props.modelValue), onClick: toggle, onKeydown: (e: KeyboardEvent) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } } }, [
                h("span", { class: ["mi-switch__track", props.modelValue && "mi-switch__track--on"] }, h("span", { class: "mi-switch__thumb" })),
                text ? h("span", { class: "mi-switch__text", title: props.label }, text) : null,
            ]);
        };
    },
});

/**
 * X / Y 坐标输入，**坐标状态完全由 SDK 内部维护**。
 *
 * 最简用法——连 `v-model` 都不用传，组件自动定位到当前 PI 的 settings：
 *
 * ```vue
 * <MiCoordinate />
 * <MiCoordinate x-key="posX" y-key="posY" />
 * <MiCoordinate v-model="property.settings" />  <!-- 显式传入亦可 -->
 * ```
 *
 * 行为：
 * - 默认读写 `settings.x` / `settings.y`，可用 `xKey` / `yKey` 覆盖；
 * - Craft 环境自动接入 {@link QtWebChannelStore}，方向键微调与宿主回传都已内置；
 * - 宿主在 `didReceiveSettings` 时会把当前 X/Y 写进 settings，组件直接跟随该值显示，
 *   因此**宿主始终是坐标的事实来源**，调用方不需要写任何同步代码；
 * - 用户在输入框改值时，组件写回 settings（自动持久化）并通知 Craft 移动组件；
 * - 非 Craft 环境退化为普通 X/Y 数字输入。
 */
export const MiCoordinate = defineComponent({
    name: "MiCoordinate", props: {
        /** settings 对象；省略时自动取当前 PI 的 `property.settings`。 */
        modelValue: { type: Object as PropType<Record<string, any>>, default: null },
        xKey: { type: String, default: "x" },
        yKey: { type: String, default: "y" },
        labels: { type: Array as unknown as PropType<[string, string]>, default: () => ["X", "Y"] },
        min: Number, max: Number, step: { type: Number, default: 1 }, disabled: Boolean,
        /** 是否接入 Craft QtWebChannel（默认接入，非 Craft 环境自动忽略）。 */
        sync: { type: Boolean, default: true },
    }, emits: ["update:modelValue", "change"],
    setup(props, { emit }) {
        useUi();
        /** 未显式传 modelValue 时回退到 SDK 单例的 settings。 */
        const target = () => props.modelValue ?? resolveSettings();
        const readAxis = (key: string) => Math.round(Number(target()?.[key]) || 0);
        const displayX = ref(readAxis(props.xKey));
        const displayY = ref(readAxis(props.yKey));
        let channel: QtWebChannelStore | null = null;
        let stopChannel: (() => void) | null = null;
        let keyHandler: ((e: KeyboardEvent) => void) | null = null;

        /** 宿主写入 settings 后跟随显示——settings 是坐标的事实来源。 */
        watch(() => { const source = target(); return [source?.[props.xKey], source?.[props.yKey]]; }, () => {
            displayX.value = readAxis(props.xKey);
            displayY.value = readAxis(props.yKey);
        });

        /** 写回 settings；就地修改以触发 SDK 的自动持久化。 */
        const writeSettings = (x: number, y: number) => {
            const source = target();
            if (!source) return;
            if (source[props.xKey] !== x) source[props.xKey] = x;
            if (source[props.yKey] !== y) source[props.yKey] = y;
            emit("update:modelValue", source);
            emit("change", { x, y });
        };

        if (typeof window !== "undefined" && props.sync) {
            channel = getCraftQtChannel();
            if (channel) {
                // Craft 拖动组件或方向键微调后会回传坐标；宿主同时也会写入 settings，
                // 这里同步显示并补写 settings，保证两条链路最终一致。
                stopChannel = watch([channel.x, channel.y], ([x, y]: [number, number]) => {
                    displayX.value = x;
                    displayY.value = y;
                    writeSettings(x, y);
                });
                keyHandler = (event: KeyboardEvent) => channel?.handleKeydown(event);
                window.addEventListener("keydown", keyHandler);
            }
        }

        onBeforeUnmount(() => {
            if (keyHandler && typeof window !== "undefined") window.removeEventListener("keydown", keyHandler);
            stopChannel?.();
        });

        const update = (axis: "x" | "y") => (value: number | null) => {
            if (value == null || Number.isNaN(value)) return;
            const num = Math.round(value);
            if (axis === "x") displayX.value = num; else displayY.value = num;
            writeSettings(displayX.value, displayY.value);
            channel?.setCoordinate(displayX.value, displayY.value);
        };

        return () => h("div", { class: "mi-coordinate" }, [
            h("label", { class: "mi-coordinate__cell" }, [
                h("span", { class: "mi-coordinate__axis" }, props.labels[0]),
                h(MiNumberInput, {
                    modelValue: displayX.value, min: props.min, max: props.max, step: props.step, disabled: props.disabled,
                    "aria-label": props.labels[0],
                    "onUpdate:modelValue": update("x"),
                }),
            ]),
            h("label", { class: "mi-coordinate__cell" }, [
                h("span", { class: "mi-coordinate__axis" }, props.labels[1]),
                h(MiNumberInput, {
                    modelValue: displayY.value, min: props.min, max: props.max, step: props.step, disabled: props.disabled,
                    "aria-label": props.labels[1],
                    "onUpdate:modelValue": update("y"),
                }),
            ]),
        ]);
    },
});

/**
 * 系统路径选择器。Craft 走原生 `openFileSelector`,其他环境降级为浏览器
 * `<input type="file">` 并返回文件名(原始 File 对象通过 `select` 事件)。
 *
 * - `mode: "file"` 单选文件;
 * - `mode: "dir"` 仅 Craft 支持(其它环境会回退到 `file` 并提示);
 * - `mode: "files"` 多选,`multiple` 等价;
 * - 单值模式 `v-model` 是字符串;多选 `v-model` 是字符串数组。
 */
export const MiPathPicker = defineComponent({
    name: "MiPathPicker", inheritAttrs: false, props: {
        modelValue: { type: [String, Array] as PropType<string | string[]>, default: "" },
        mode: { type: String as PropType<"file" | "dir" | "files">, default: "file" },
        accept: String, multiple: Boolean, disabled: Boolean, limit: { type: Number, default: 1 },
        placeholder: { type: String, default: "" }, buttonText: { type: String, default: "选择文件" }, emptyText: { type: String, default: "未选择文件" },
        /** Craft 模式下的多选上限,对应 `openFileSelector` 第 3 个参数。 */
    }, emits: ["update:modelValue", "select"],
    setup(props, { attrs, emit, slots }) {
        useUi();
        const channel = getCraftQtChannel();
        const fileInput = ref<HTMLInputElement | null>(null);
        const context = resolvePropertyContext();
        const cleanup: (() => void)[] = [];

        function formatDisplay(): string {
            if (props.mode === "files") {
                const arr = Array.isArray(props.modelValue) ? props.modelValue : props.modelValue ? [String(props.modelValue)] : [];
                return arr.length ? arr.join(", ") : props.emptyText;
            }
            return props.modelValue ? String(props.modelValue) : props.emptyText;
        }

        const writeModel = (value: string | string[]) => {
            emit("update:modelValue", value);
        };

        const handleFileInput = (event: Event) => {
            const target = event.target as HTMLInputElement;
            const files = Array.from(target.files ?? []);
            const paths = files.map(file => file.name);
            if (props.mode === "files") {
                writeModel(paths);
                emit("select", files);
            } else {
                writeModel(paths[0] ?? "");
                emit("select", files[0] ?? null);
            }
        };

        if (channel && context && props.mode !== "dir") {
            const off = channel.onFileSelected((selection: CraftFileSelection) => {
                if (selection.context !== context) return;
                if (props.mode === "files") {
                    const paths = selection.paths.slice(0, Math.max(1, props.limit));
                    writeModel(paths);
                    emit("select", selection);
                } else {
                    writeModel(selection.paths[0] ?? "");
                    emit("select", selection);
                }
            });
            cleanup.push(off);
        }

        onBeforeUnmount(() => {
            for (const off of cleanup) off();
        });

        const browse = () => {
            if (props.disabled) return;
            if (channel && context) {
                const multiple = props.mode === "files" || props.multiple;
                channel.openFileSelector(context, multiple, Math.max(1, props.limit));
                return;
            }
            fileInput.value?.click();
        };

        return () => h("div", { class: "mi-path" }, [
            h("input", { ref: fileInput, type: "file", accept: props.accept, multiple: props.multiple, disabled: props.disabled, style: "display:none", onChange: handleFileInput }),
            slots.button ? slots.button({ browse, disabled: props.disabled }) : h(MiButton, { disabled: props.disabled, onClick: browse }, () => props.buttonText),
            h("span", { class: "mi-path__name", title: formatDisplay() }, formatDisplay()),
        ]);
    },
});

/**
 * Toast 容器。挂在根组件里一次,`useToast()` 触发的提示会自动渲染到这里。
 */
export const MiToastHost = defineComponent({
    name: "MiToastHost", setup() {
        useUi();
        const state = useToastState();
        return () => h("div", { class: "mi-toast-host" }, state.items.map((item: ToastItem) =>
            h("div", { key: item.id, class: ["mi-toast", `mi-toast--${item.variant}`], role: "status" }, item.message),
        ));
    },
});

export { ensurePropertyUiStyles, propertyUiCss } from "./styles";
export { useToast, useToastState, copyText } from "../toast";
export type { ToastItem, ToastVariant } from "../toast";

