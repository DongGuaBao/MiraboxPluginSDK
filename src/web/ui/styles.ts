const STYLE_ID = "mirabox-property-ui";

export const propertyUiCss = `
:root {
  --mi-font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
  --mi-font-size: 14px;
  --mi-font-size-small: 12px;
  --mi-text: rgba(255,255,255,.92);
  --mi-text-muted: rgba(255,255,255,.62);
  --mi-text-disabled: rgba(255,255,255,.38);
  --mi-border: rgba(255,255,255,.22);
  --mi-border-hover: rgba(255,255,255,.42);
  --mi-focus: rgb(103,98,255);
  --mi-danger: rgb(255,84,96);
  --mi-popup-bg: rgb(43,43,46);
  --mi-button-bg: rgb(76,76,82);
  --mi-button-hover-bg: rgb(94,94,102);
  --mi-radius: 4px;
  --mi-control-height: 28px;
  --mi-page-padding: 8px;
  --mi-row-gap: 10px;
  --mi-section-gap: 12px;
}
:root[data-mirabox-host="streamdock"] {
  --mi-page-padding: 6px 8px;
  --mi-row-gap: 8px;
  --mi-section-gap: 10px;
}
@media (max-height: 205px) {
  :root {
    --mi-page-padding: 6px 8px;
    --mi-row-gap: 8px;
    --mi-section-gap: 10px;
  }
}
.mi-panel,
.mi-panel * { box-sizing: border-box; min-width: 0; }
.mi-panel {
  width: 100%; max-width: 100%; height: 100vh;
  margin: 0; padding: var(--mi-page-padding);
  overflow-x: hidden; overflow-y: auto;
  overscroll-behavior-x: none;
  color: var(--mi-text); background: transparent;
  font: var(--mi-font-size)/1.35 var(--mi-font-family);
}
.mi-panel::-webkit-scrollbar { width: 6px; height: 0; }
.mi-panel::-webkit-scrollbar-track { background: transparent; }
.mi-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,.22); border-radius: 6px; }
.mi-section { display: grid; width: 100%; max-width: 100%; gap: var(--mi-row-gap); margin: 0 0 var(--mi-section-gap); }
.mi-section:last-child { margin-bottom: 0; }
.mi-section__title { overflow: hidden; color: var(--mi-text-muted); font-size: var(--mi-font-size-small); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.mi-grid { display: grid; width: 100%; max-width: 100%; gap: var(--mi-row-gap) 8px; align-items: start; }
.mi-grid--1 { grid-template-columns: minmax(0,1fr); }
.mi-grid--2 { grid-template-columns: repeat(2,minmax(0,1fr)); }
.mi-grid--3 { grid-template-columns: repeat(3,minmax(0,1fr)); }
.mi-grid--4 { grid-template-columns: repeat(4,minmax(0,1fr)); }
.mi-field { display: grid; width: 100%; max-width: 100%; grid-template-columns: minmax(0,1fr); gap: 5px; margin-top: 3px; align-items: stretch; }
.mi-field__label { overflow: hidden; color: var(--mi-text); text-overflow: ellipsis; white-space: nowrap; }
.mi-field__required { margin-left: 2px; color: var(--mi-danger); }
.mi-field__body { width: 100%; max-width: 100%; }
.mi-field__hint,.mi-hint { color: var(--mi-text-muted); font-size: var(--mi-font-size-small); overflow-wrap: anywhere; }
.mi-field__error,.mi-hint--danger { color: var(--mi-danger); }
.mi-control {
  width: 100%; max-width: 100%; height: var(--mi-control-height);
  padding: 0 7px; border: 1px solid var(--mi-border); border-radius: var(--mi-radius);
  outline: 0; color: var(--mi-text); background: transparent; font: inherit;
}
.mi-control:hover { border-color: var(--mi-border-hover); background: rgba(255,255,255,.04); }
.mi-control:focus { border-color: var(--mi-focus); box-shadow: 0 0 0 1px var(--mi-focus); }
.mi-control:disabled { color: var(--mi-text-disabled); cursor: not-allowed; opacity: .7; }
select.mi-control { background-color: transparent; }
select.mi-control option { color: white; background: var(--mi-popup-bg); }
.mi-number { position: relative; width: 100%; max-width: 100%; }
.mi-number .mi-control { padding-right: var(--mi-number-suffix-space,7px); }
.mi-number__suffix { position: absolute; right: 7px; top: 50%; max-width: 42px; transform: translateY(-50%); overflow: hidden; color: var(--mi-text-muted); text-overflow: ellipsis; pointer-events: none; }
.mi-file { display: flex; width: 100%; max-width: 100%; gap: 6px; align-items: center; }
.mi-file__name { flex: 1; overflow: hidden; color: var(--mi-text-muted); text-overflow: ellipsis; white-space: nowrap; }
.mi-color { display: block; width: 100%; max-width: 100%; }
.mi-color__picker {
  display: block; width: 100%; height: var(--mi-control-height); padding: 0;
  border: 0; border-radius: var(--mi-radius); overflow: hidden;
  background: transparent; cursor: pointer;
}
.mi-color__picker::-webkit-color-swatch-wrapper { padding: 0; }
.mi-color__picker::-webkit-color-swatch { border: 0; border-radius: var(--mi-radius); }
.mi-color__picker::-moz-color-swatch { border: 0; border-radius: var(--mi-radius); }
.mi-color__picker:focus-visible { outline: 2px solid var(--mi-focus); outline-offset: 1px; }
.mi-slider { display: grid; width: 100%; max-width: 100%; grid-template-columns: minmax(0,1fr) 48px; gap: 7px; align-items: center; }
.mi-slider input[type="range"] { width: 100%; max-width: 100%; accent-color: var(--mi-focus); }
.mi-slider__value { overflow: hidden; color: var(--mi-text-muted); text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.mi-check {
  display: grid; width: 100%; max-width: 100%; min-height: var(--mi-control-height);
  grid-template-columns: 16px minmax(0,1fr); gap: 8px; align-items: center;
  color: var(--mi-text); cursor: pointer;
}
.mi-check input {
  display: block; width: 16px; height: 16px; margin: 0;
  align-self: center; accent-color: var(--mi-focus);
}
.mi-check__text {
  display: block; overflow: hidden; line-height: 20px;
  text-overflow: ellipsis; white-space: nowrap;
}
.mi-button { min-width: 0; height: var(--mi-control-height); padding: 0 10px; border: 1px solid transparent; border-radius: var(--mi-radius); color: white; background: var(--mi-button-bg); font: inherit; cursor: pointer; }
.mi-button:hover { background: var(--mi-button-hover-bg); }
.mi-button:focus-visible { outline: 1px solid var(--mi-focus); outline-offset: 1px; }
.mi-button--primary { background: var(--mi-focus); }
.mi-button--danger { background: var(--mi-danger); }
.mi-button--ghost { border-color: var(--mi-border); background: transparent; }
.mi-button:disabled { color: var(--mi-text-disabled); cursor: not-allowed; opacity: .65; }
.mi-button-group { display: flex; width: 100%; max-width: 100%; flex-wrap: wrap; gap: 6px; }
.mi-text-input { position: relative; width: 100%; max-width: 100%; display: block; }
.mi-text-input .mi-control { padding-right: 7px; }
.mi-text-input--password .mi-control { padding-right: 32px; }
.mi-text-input__reveal {
  position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
  width: 22px; height: 22px; padding: 0; border: 0; background: transparent; color: var(--mi-text-muted); cursor: pointer; border-radius: 3px;
  display: grid; place-items: center;
}
.mi-text-input__reveal:hover { color: var(--mi-text); background: rgba(255,255,255,.06); }
.mi-text-input__reveal::before { content: ""; display: block; width: 14px; height: 14px; background: currentColor; -webkit-mask: var(--mi-icon-eye, none) center/contain no-repeat; mask: var(--mi-icon-eye, none) center/contain no-repeat; }
.mi-text-input__reveal { --mi-icon-eye: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z'/><circle cx='12' cy='12' r='3'/></svg>"); }
.mi-text-input__reveal--on { --mi-icon-eye: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24'/><line x1='1' y1='1' x2='23' y2='23'/></svg>"); }
.mi-textarea {
  height: auto; min-height: calc(var(--mi-control-height) * 2);
  padding: 5px 7px; line-height: 1.4; resize: none; overflow: auto;
}
.mi-textarea--resize { resize: vertical; }
.mi-textarea::-webkit-scrollbar { width: 6px; }
.mi-textarea::-webkit-scrollbar-thumb { background: rgba(255,255,255,.22); border-radius: 6px; }
.mi-switch {
  display: grid; width: 100%; max-width: 100%; min-height: var(--mi-control-height);
  grid-template-columns: 32px minmax(0,1fr); gap: 8px; align-items: center;
  color: var(--mi-text); cursor: pointer; outline: 0;
}
.mi-switch:focus-visible .mi-switch__track { box-shadow: 0 0 0 2px var(--mi-focus); }
.mi-switch--disabled { color: var(--mi-text-disabled); cursor: not-allowed; opacity: .65; }
.mi-switch__track {
  position: relative; display: block; width: 32px; height: 18px;
  border-radius: 9px; background: var(--mi-button-bg); transition: background .15s ease;
}
.mi-switch__track--on { background: var(--mi-focus); }
.mi-switch__thumb {
  position: absolute; top: 2px; left: 2px; width: 14px; height: 14px;
  border-radius: 50%; background: white; transition: transform .15s ease;
}
.mi-switch__track--on .mi-switch__thumb { transform: translateX(14px); }
.mi-switch__text { overflow: hidden; line-height: 20px; text-overflow: ellipsis; white-space: nowrap; }
.mi-coordinate { display: grid; width: 100%; max-width: 100%; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 6px; }
.mi-coordinate__cell { display: grid; min-width: 0; grid-template-columns: auto minmax(0,1fr); gap: 5px; align-items: center; }
.mi-coordinate__axis { color: var(--mi-text-muted); font-size: var(--mi-font-size-small); }
.mi-path { display: flex; width: 100%; max-width: 100%; gap: 6px; align-items: center; }
.mi-path__name { flex: 1; min-width: 0; overflow: hidden; color: var(--mi-text-muted); text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
.mi-toast-host {
  position: fixed; left: 50%; bottom: 10px; z-index: 9999;
  display: grid; gap: 6px; justify-items: center;
  width: max-content; max-width: calc(100% - 16px);
  transform: translateX(-50%); pointer-events: none;
}
.mi-toast {
  max-width: 100%; padding: 5px 10px; border-radius: var(--mi-radius);
  color: white; background: rgba(30,30,34,.94); box-shadow: 0 2px 8px rgba(0,0,0,.35);
  font-size: var(--mi-font-size-small); line-height: 1.4;
  overflow-wrap: anywhere; animation: mi-toast-in .16s ease;
}
.mi-toast--success { background: rgba(38,132,84,.96); }
.mi-toast--error { background: rgba(190,52,62,.96); }
@keyframes mi-toast-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
`;

export function ensurePropertyUiStyles(): void {
    if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = propertyUiCss;
    document.head.appendChild(style);
}
