import {
    _saverHandler,
    saverTimer,
    save,
    autoSaver,
} from "./AutoSaver";
import * as moment from "moment";

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

export class PhotoDataStrcture {
    public chatId: number;
    public chatName: string;
    public paused = false;
    public disabled = false;
    public interval: number;
    public last: number;
    public queue: string[];
    public history: string[];
    public banList: string[];
    public retryList: RetryDataStructure[];
    public constructor(
        chatId: number | object | PhotoDataStrcture,
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
            this.queue = new Proxy((queue !== null && queue !== undefined) ? queue : [], autoSaver);
            this.history = new Proxy((history !== null && history !== undefined) ? history : [], autoSaver);
            this.banList = new Proxy((banList !== null && banList !== undefined) ? banList : [], autoSaver);
            this.retryList = new Proxy((retryList !== null && retryList !== undefined) ? retryList : [], autoSaver);
        } else {
            this.from(chatId as PhotoDataStrcture);
        }
    }

    public getRetryQueue(fileLink: string) {
        let retry = this.retryList.filter((r) => r.fileName === fileLink).pop();
        if (retry === undefined) {
            retry = new RetryDataStructure(fileLink);
            this.retryList.push(new Proxy(retry, autoSaver));
        } else {
            retry.retryTimes++;
        }
        return retry;
    }

    public pruneQueue(fileLink: string) {
        this.queue = this.queue.filter((q) => q !== fileLink);
        this.history = this.history.filter((h) => h !== fileLink);
        this.retryList = this.retryList.filter((r) => r.fileName !== fileLink);
    }

    private from(pds: PhotoDataStrcture) {
        this.chatId = pds.chatId;
        this.chatName = pds.chatName;
        this.paused = pds.paused;
        this.disabled = pds.disabled;
        this.interval = pds.interval ? pds.interval : 1;
        this.last = pds.last ? pds.last : +moment();
        this.queue = new Proxy((pds.queue !== null && pds.queue !== undefined) ? pds.queue : [], autoSaver);
        this.history = new Proxy((pds.history !== null && pds.history !== undefined) ? pds.history : [], autoSaver);
        this.banList = new Proxy((pds.banList !== null && pds.banList !== undefined) ? pds.banList : [], autoSaver);
        this.retryList = new Proxy((pds.retryList !== null && pds.retryList !== undefined) ? pds.retryList.map((r) => new Proxy(r, autoSaver)) : [], autoSaver);
    }
}

export const PhotoDataStore = (initStore: PhotoDataStrcture[] = [], saverHandler: () => void | undefined): PhotoDataStrcture[] => {
    const _photoDataStoreData: PhotoDataStrcture[] = [];
    const p = new Proxy(_photoDataStoreData, autoSaver);
    if (initStore.length !== 0) {
        initStore.map((s: PhotoDataStrcture) => p.push(new Proxy(new PhotoDataStrcture(s), autoSaver)));
    }
    _saverHandler = saverHandler;
    save();
    return p;
};
