import {
    _saverHandler,
    saverTimer,
    save,
    autoSaver,
} from "./AutoSaver";

const convert = require("convert-units");
const prompt = require("prompt");

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

export const BotConfigGenerator = {
    async AskForInputCredentials() {
        return new Promise<object>((resolve, reject) => {
            const config = new BotConfig();
            prompt.message = "Config";
            prompt.delimiter = ">";
            prompt.start();
            return prompt.get({
                properties: {
                    TelegramBotKey: {
                        message: "Telegram Bot API Key",
                    },
                    pixivAcct: {
                        message: "pixiv Account",
                    },
                    pixivPass: {
                        message: "pixiv Password",
                    },
                    pixivProxy: {
                        message: "pixiv Proxy hostname",
                    },
                },
            },                (err: any, result: any) => {
                config.token = result.TelegramBotKey;
                config.pixiv.account = result.pixivAcct;
                config.pixiv.password = result.pixivPass;
                config.pixiv.reverseProxyDomain = result.pixivProxy;
                resolve(config);
            });
        });
    },
};

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
