import fs from "fs";
import path from "path";

export type I18nDictionary = Record<string, string>;

interface NodeStartupState {
    applicationInfo?: StreamDock.ApplicationInfo;
    language: string;
    translations: I18nDictionary;
    i18n: I18nDictionary;
}

function fallbackProxy(translations: I18nDictionary): I18nDictionary {
    return new Proxy(translations, {
        get(target, property, receiver) {
            if (typeof property === "symbol") return Reflect.get(target, property, receiver);
            return Object.prototype.hasOwnProperty.call(target, property) ? target[property] : property;
        },
    });
}

function parseJson<T>(raw: string | undefined): T | undefined {
    if (!raw) return undefined;
    const value = raw.trim();
    const normalized = value.startsWith("'") && value.endsWith("'") ? value.slice(1, -1) : value;
    try { return JSON.parse(normalized) as T; }
    catch { return undefined; }
}

function optionValue(name: string): string | undefined {
    const exact = `-${name}`;
    const long = `--${name}`;
    for (let index = 0; index < process.argv.length; index += 1) {
        const current = process.argv[index];
        if (current === exact || current === long) return process.argv[index + 1];
        if (current.startsWith(`${long}=`)) return current.slice(long.length + 1);
    }
    return undefined;
}

/** Parse both SDK positional startup arguments and native-helper named arguments. */
export function parseNodeApplicationInfo(): StreamDock.ApplicationInfo | undefined {
    return parseJson<StreamDock.ApplicationInfo>(optionValue("info"))
        ?? parseJson<StreamDock.ApplicationInfo>(process.argv[9]);
}

function languageCandidates(language: string): string[] {
    if (!language) return [];
    return [path.join(process.cwd(), `${language}.json`), path.join(process.cwd(), "language", `${language}.json`)];
}

function loadTranslations(language: string): I18nDictionary {
    for (const file of languageCandidates(language)) {
        try {
            const document = JSON.parse(fs.readFileSync(file, "utf8")) as { Localization?: unknown };
            if (!document.Localization || typeof document.Localization !== "object" || Array.isArray(document.Localization)) continue;
            return Object.fromEntries(Object.entries(document.Localization).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
        } catch {
            // Missing or malformed localization must not prevent plugin startup.
        }
    }
    return {};
}

function createState(applicationInfo = parseNodeApplicationInfo()): NodeStartupState {
    const language = applicationInfo?.application?.language ?? "";
    const translations = loadTranslations(language);
    return { applicationInfo, language, translations, i18n: fallbackProxy(translations) };
}

let state = createState();

function publishGlobals(): void {
    global.language = state.language;
    global._i18n = state.translations;
    global.i18n = state.i18n;
}

publishGlobals();

/** Return import-time startup state, optionally refreshing if argv became available later. */
export function getNodeStartupState(refresh = false): Readonly<NodeStartupState> {
    const latest = refresh ? parseNodeApplicationInfo() : undefined;
    if (latest && (!state.applicationInfo || latest.application.language !== state.language)) {
        state = createState(latest);
        publishGlobals();
    }
    return state;
}

export function getNodeI18n(): I18nDictionary {
    return state.i18n;
}
