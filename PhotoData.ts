import * as moment from "moment";

export class PhotoDataStrcture {
    public chatId: number;
    public interval: number;
    public last: number;
    public queue: string[];
    public constructor(chatId: number) {
        this.chatId = chatId;
        this.interval = 1;
        this.last = +moment();
        this.queue = [];
    }
}

export const PhotoDataStore = (initStore: PhotoDataStrcture[] = [], handler: () => void | undefined): PhotoDataStrcture[] => {
    let saver: NodeJS.Timer;
    let _handler: () => void | undefined;
    const _photoDataStoreData: PhotoDataStrcture[] = [];
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
    const p = new Proxy(_photoDataStoreData, {
        get(target, propName) {
            const val = (target as any)[propName];
            return val;
        },
        set(target, propName, value) {
            (target as any)[propName] = value;
            save();
            return true;
        },
    });
    if (initStore.length !== 0) {
        initStore.map((s: PhotoDataStrcture) => p.push(s));
    }
    _handler = handler;
    save();
    return p;
};
