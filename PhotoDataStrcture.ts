/**
 * @license
 * Copyright 2017
 */

import * as moment from "moment";

class PhotoDataStrcture {
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

export { PhotoDataStrcture };
