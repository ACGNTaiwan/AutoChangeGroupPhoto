import * as fs from "fs";
import * as yaml from "js-yaml";
import * as moment from "moment";

import { AutoSaver } from "./autoSaver";
import * as CONSTS from "./consts";

const tracer = require("tracer");
const logger = tracer.colorConsole({ level: process.env.DEBUG !== undefined ? process.env.DEBUG : "info" });

const autoSaver = new AutoSaver();

export class PixivIllustStructure {
    public illustId = -1;
    public title = "";
    public caption = "";
    public userName = "";
    public tags: string[] = [];
    public originalUrl: string[] = [];
    public squareMediumUrl: string[] = [];
    public referralUrl = "";
    public constructor(
        illustId: number,
        title: string,
        caption: string,
        userName: string,
        tags: string[],
        originalUrl: string[],
        squareMediumUrl: string[],
        referralUrl: string,
    ) {
        this.illustId = illustId;
        this.title = title;
        this.caption = caption;
        this.userName = userName;
        this.tags = tags;
        this.originalUrl = originalUrl;
        this.squareMediumUrl = squareMediumUrl;
        this.referralUrl = referralUrl;
    }
}

export class RetryDataStructure {
    public fileName: string;
    public retryTimes = 1;
    public constructor(filename: string) {
        this.fileName = filename;
    }
}

export class PhotoDataStructure {
    public chatId!: number;
    public chatName!: string;
    public paused = false;
    public disabled = false;
    public interval!: number;
    public last!: number;
    public queue!: string[];
    public history!: string[];
    public banList!: string[];
    public retryList!: RetryDataStructure[];

    /**
     * Read PhotoDataStructure Datas into PhotoDataStore which contains Chat's data stores
     */
    public static readData(): any {
        let _data;
        try {
            _data = (fs.existsSync(CONSTS.DATA_FILE_PATH)) ?
                yaml.load(fs.readFileSync(CONSTS.DATA_FILE_PATH)
                    .toString()) :
                JSON.parse(fs.readFileSync(CONSTS.DATA_FILE_JSON_PATH)
                    .toString());
        } catch (e) {
            logger.warn(e);
            _data = [];
        } finally {
            if (_data instanceof Object && !(_data instanceof Array) && _data !== undefined) {
                _data = PhotoDataStructure.doCompatibleConvert(_data);
            }
        }
        return _data;
    }

    /**
     * Save PhotoDataStore to data file
     */
    public static saveData(data: PhotoDataStructure[]) {
        const _data = JSON.parse(JSON.stringify(data)); // to prevent Proxy dump undefined
        fs.writeFile(CONSTS.DATA_FILE_PATH, yaml.safeDump(_data), () => void (0));
    }

    /**
     * Convert Data from old structure
     * @param d PhotoDataStructure Data Array
     */
    private static doCompatibleConvert(d: object): PhotoDataStructure[] {
        return Object.keys(d)
            .map<PhotoDataStructure>(
                (chatId: string) => {
                    const pds = (d as any)[chatId] as PhotoDataStructure;
                    pds.chatId = Number(chatId);
                    return new PhotoDataStructure(pds);
                },
            );
    }

    public constructor(
        chatId: number | object | PhotoDataStructure,
        chatName: string = "",
        paused = false,
        disabled = false,
        interval: number = 1,
        last: number = +moment(),
        queue: string[] = [],
        history: string[] = [],
        banList: string[] = [],
        retryList: RetryDataStructure[] = [],
    ) {
        if (typeof chatId === "number") {
            this.chatId = chatId;
            this.chatName = chatName;
            this.paused = paused;
            this.disabled = disabled;
            this.interval = interval ? interval : 1;
            this.last = last ? last : +moment();
            this.queue = new Proxy((queue !== null && queue !== undefined) ? queue : [], autoSaver.Saver);
            this.history = new Proxy((history !== null && history !== undefined) ? history : [], autoSaver.Saver);
            this.banList = new Proxy((banList !== null && banList !== undefined) ? banList : [], autoSaver.Saver);
            this.retryList = new Proxy((retryList !== null && retryList !== undefined) ? retryList : [], autoSaver.Saver);
        } else {
            this.from(chatId as PhotoDataStructure);
        }
    }

    public getRetryQueue(fileLink: string) {
        let retry = this.retryList.filter((r) => r.fileName === fileLink)
            .pop();
        if (retry === undefined) {
            retry = new RetryDataStructure(fileLink);
            this.retryList.push(new Proxy(retry, autoSaver.Saver));
        } else {
            retry.retryTimes += 1;
        }
        return retry;
    }

    public pruneQueue(fileLink: string) {
        this.queue = this.queue.filter((q) => q !== fileLink);
        this.history = this.history.filter((h) => h !== fileLink);
        this.retryList = this.retryList.filter((r) => r.fileName !== fileLink);
    }

    /**
     * For random output a file id and push the result to last
     * @param chatData PhotoDataStructure
     */
    public randomHistory() {
        // prevent last photo out of random queue
        const idx = Math.floor(Math.random() * (this.history.length - 1));
        const fileLink = this.history[idx];
        // make next photo to last
        this.history = this.history.map<string>((h) => h !== fileLink ? h : "")
            .filter((h) => h)
            .concat([fileLink]);
        return fileLink;
    }

    private from(pds: PhotoDataStructure) {
        this.chatId = pds.chatId;
        this.chatName = pds.chatName;
        this.paused = pds.paused;
        this.disabled = pds.disabled;
        this.interval = pds.interval ? pds.interval : 1;
        this.last = pds.last ? pds.last : +moment();
        this.queue = new Proxy((pds.queue !== null && pds.queue !== undefined) ? pds.queue : [], autoSaver.Saver);
        this.history = new Proxy((pds.history !== null && pds.history !== undefined) ? pds.history : [], autoSaver.Saver);
        this.banList = new Proxy((pds.banList !== null && pds.banList !== undefined) ? pds.banList : [], autoSaver.Saver);
        this.retryList = new Proxy((pds.retryList !== null && pds.retryList !== undefined)
            ? pds.retryList.map((r) => new Proxy(r, autoSaver.Saver))
            : [],                  autoSaver.Saver);
    }
}

export const PhotoDataStore = (initStore: PhotoDataStructure[] = [], saverHandler: (() => void) | undefined): PhotoDataStructure[] => {
    const _photoDataStoreData: PhotoDataStructure[] = [];
    const p = new Proxy(_photoDataStoreData, autoSaver.Saver);
    if (initStore.length !== 0) {
        initStore.map((s: PhotoDataStructure) => p.push(new Proxy(new PhotoDataStructure(s), autoSaver.Saver)));
    }
    autoSaver._saverHandler = saverHandler;
    autoSaver.Save();
    return p;
};
