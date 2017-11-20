const convert = require("convert-units");

let _saverHandler: () => void | undefined;
let saverTimer: NodeJS.Timer;

const save = () => {
    if (_saverHandler !== undefined) {
        clearTimeout(saverTimer);
        // let object sync back
        saverTimer = setTimeout(() => {
            try {
                _saverHandler();
            } catch (e) {
                console.error(e);
            }
        },                      100);
    }
};

const autoSaver = {
    get(target: any, propName: PropertyKey) {
        const val = target[propName];
        // console.info("get", target, propName, val);
        return val;
    },
    set(target: any, propName: PropertyKey, value: any) {
        target[propName] = value;
        // console.info("set", target, propName, value);
        save();
        return true;
    },
};

export class PixivConfig {
    public account = "";
    public password = "";
    public refreshToken = "";
    public reverseProxyDomain = "";
}

export class BotConfig {
    public token = "";
    public minBotInterval = 0.5;
    public downloadMaxSize = convert(5).from("MB").to("B");
    public pixiv = new Proxy(new PixivConfig(), autoSaver);
}

export const InitialConfig = (_config: BotConfig, saverHandler: () => void | undefined) => {
    const p = new Proxy(_config, autoSaver);
    Object.keys(p).map((k) => {
        const val = (p as any)[k];
        if (typeof val === "object") {
            (p as any)[k] = new Proxy(val, autoSaver);
        }
    });
    _saverHandler = saverHandler;
    save();
    return p;
};
