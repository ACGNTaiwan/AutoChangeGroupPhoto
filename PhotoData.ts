import * as moment from "moment";

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

export class PixivIllustStructure {
    public illustId = -1;
    public title = "";
    public caption = "";
    public userName = "";
    public tags: string[] = [];
    public originalUrl = "";
    public squareMediumUrl = "";
    public referralUrl = "";
    public constructor(
        illustId: number,
        title: string,
        caption: string,
        userName: string,
        tags: string[],
        originalUrl: string,
        squareMediumUrl: string,
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

export class PhotoDataStrcture {
    public chatId: number;
    public chatName: string;
    public interval: number;
    public last: number;
    public queue: string[];
    public history: string[];
    public banList: string[];
    public constructor(
        chatId: number | object | PhotoDataStrcture,
        chatName: string = "",
        interval: number = 1,
        last: number = +moment(),
        queue: string[] = [],
        history: string[] = [],
        banList: string[] = [],
    ) {
        if (typeof chatId === "number") {
            this.chatId = chatId;
            this.chatName = chatName;
            this.interval = interval ? interval : 1;
            this.last = last ? last : +moment();
            this.queue = new Proxy((queue !== null && queue !== undefined) ? queue : [], autoSaver);
            this.history = new Proxy((history !== null && history !== undefined) ? history : [], autoSaver);
            this.banList = new Proxy((banList !== null && banList !== undefined) ? banList : [], autoSaver);
        } else {
            this.from(chatId as PhotoDataStrcture);
        }
    }
    private from(pds: PhotoDataStrcture) {
        this.chatId = pds.chatId;
        this.chatName = pds.chatName;
        this.interval = pds.interval ? pds.interval : 1;
        this.last = pds.last ? pds.last : +moment();
        this.queue = new Proxy((pds.queue !== null && pds.queue !== undefined) ? pds.queue : [], autoSaver);
        this.history = new Proxy((pds.history !== null && pds.history !== undefined) ? pds.history : [], autoSaver);
        this.banList = new Proxy((pds.banList !== null && pds.banList !== undefined) ? pds.banList : [], autoSaver);
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
