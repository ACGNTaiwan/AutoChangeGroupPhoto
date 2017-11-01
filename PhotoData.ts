import * as moment from "moment";

let _handler: () => void | undefined;
let saver: NodeJS.Timer;

const save = () => {
    if (_handler !== undefined) {
        try {
            clearTimeout(saver);
            // let object sync back
            saver = setTimeout(() => {
                try {
                    _handler();
                } catch (e) {
                    console.error(e);
                }
            },                 100);
        } catch (e) {
            console.error(e);
        }
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

export class PhotoDataStrcture {
    public chatId: number;
    public interval: number;
    public last: number;
    public queue: string[];
    public constructor(chatId: number, interval: number = 1, last: number = +moment(), queue: string[] = []) {
        this.chatId = chatId;
        this.interval = interval ? interval : 1;
        this.last = last ? last : +moment();
        this.queue = new Proxy(queue !== null ? queue : [], autoSaver);
    }
}

export const PhotoDataStore = (initStore: PhotoDataStrcture[] = [], handler: () => void | undefined): PhotoDataStrcture[] => {
    const _photoDataStoreData: PhotoDataStrcture[] = [];
    const p = new Proxy(_photoDataStoreData, autoSaver);
    if (initStore.length !== 0) {
        initStore.map((s: PhotoDataStrcture) => p.push(new Proxy(new PhotoDataStrcture(s.chatId, s.interval, s.last, s.queue), autoSaver)));
    }
    _handler = handler;
    save();
    return p;
};
