import * as fs from "fs";
import * as jimp from "jimp";
import * as yaml from "js-yaml";
import * as moment from "moment";
import * as schedule from "node-schedule";
import * as TelegramBot from "node-telegram-bot-api";
const ogs = require("open-graph-scraper");
import * as request from "request";
import { BotConfig } from "./BotConfig";
import * as CONSTS from "./consts";
import * as PhotoData from "./PhotoData";

moment.locale("zh-tw");

export
/**
 * The Telegram Bot for Auto Change Group Photo Icon
 * @class AutoChangeGroupPhotoBot
 */
class AutoChangeGroupPhotoBot {
    private static _instance?: AutoChangeGroupPhotoBot;
    private config: BotConfig;
    private bot: TelegramBot;
    private data: PhotoData.PhotoDataStrcture[];
    private uploadQueue: Promise<any> = Promise.resolve();

    /**
     * Singleton of AutoChangeGroupPhotoBot
     * @param _config Telegram Bot config object
     */
    public static getInstance(_config: any = {}) {
        return (this._instance) ? this._instance : (this._instance = new this(_config));
    }

    /**
     * AutoChangeGroupPhotoBot constructor
     * @param _config Telegram Bot config object
     */
    private constructor(_config: any = {}) {
        this.config = Object.assign(new BotConfig(), _config);
        if (this.config.token) {
            this.data = PhotoData.PhotoDataStore(this.readData(), () => { this.saveData(); });
            // if has bot token, then start the main program
            this.bot = new TelegramBot(this.config.token, {polling: {interval: 0, params: {timeout: 60}}});

            this.registerEvent().then(() => { /* no-op */ }).catch(() => { /* no-op */ });
        } else {
            throw Error(CONSTS.NEED_TELEGRAM_BOT_TOKEN);
        }
    }

    /**
     * Register Bot events and cronjob
     */
    private async registerEvent() {
        schedule.scheduleJob("0 * * * * *", () => { this.doUpdate(); });

        this.bot.onText(CONSTS.REGEXP_MATCH_TAG_COMMAND, async (msg) => {
            if (msg.reply_to_message && (msg.reply_to_message.photo || msg.reply_to_message.document)) {
                console.info(CONSTS.QUEUE_TEXT("Text", `${msg.chat.title}(${msg.chat.id})`));
                await this.addPhoto(msg.reply_to_message);
            } else if (msg.reply_to_message && msg.reply_to_message.entities) {
                this.doAddPhotoByUrl(msg.reply_to_message);
            }
        });

        this.bot.on("photo", async (msg: TelegramBot.Message) => {
            if (msg.caption && msg.caption.match(CONSTS.REGEXP_MATCH_TAG_COMMAND)) {
                console.info(CONSTS.QUEUE_TEXT("Photo", `${msg.chat.title}(${msg.chat.id})`));
                await this.addPhoto(msg);
            }
        });

        this.bot.on("document", async (msg: TelegramBot.Message) => {
            if (msg.caption && msg.caption.match(CONSTS.REGEXP_MATCH_TAG_COMMAND)) {
                console.info(CONSTS.QUEUE_TEXT("Document", `${msg.chat.title}(${msg.chat.id})`));
                await this.addPhoto(msg);
            }
        });

        this.bot.on("message", async (msg: TelegramBot.Message) => {
            if (msg.text !== undefined && msg.text.match(CONSTS.REGEXP_MATCH_TAG_COMMAND) !== null) {
                if (msg.entities) {
                    this.doAddPhotoByUrl(msg);
                }
            }
        });

        await this.bot.getMe().then((me) => {
            if (me instanceof Error) {
                return;
            }

            this.bot.onText(/^\/(\w+)@?(\w*)/i, async (msg, regex) => {
                if (regex) {
                    if (regex[2] && regex[2] !== me.username) {
                        return;
                    }

                    const chatId = msg.chat.id;
                    const chatData = this.getData(chatId);

                    await this.bot.getChatAdministrators(chatId).then(async (members) => {
                        if (members instanceof Error) {
                            return;
                        }

                        switch (regex[1].toLowerCase()) {
                            case "setinterval":
                                if (msg.text) {
                                    if (msg.from) {
                                        if (members.map((member) => member.user.id).indexOf(msg.from.id) === -1) {
                                            break;
                                        }
                                    }
                                    const args = msg.text.replace(regex[0], "").trim();
                                    if (args.length === 0) {
                                        await this.bot.sendMessage(chatId, CONSTS.NOW_INTERVAL(chatData.interval.toString()));
                                        break;
                                    }
                                    if (args.length > 0 && Number(args) >= this.config.minBotInterval) {
                                        chatData.interval = Number(args);
                                        await this.bot.sendMessage(chatId, CONSTS.SET_INTERVAL(chatData.interval.toString()));
                                    } else {
                                        await this.bot.sendMessage(chatId, CONSTS.INVALID_VALUE);
                                    }
                                }
                                break;
                            case "next":
                                if (msg.from) {
                                    if (members.map((member) => member.user.id).indexOf(msg.from.id) === -1) {
                                        break;
                                    }
                                }
                                await this.nextPhoto(chatData);
                                break;
                            // TODO
                            // case 'setloop':
                            //     if (members.map((member) => member.user.id).indexOf(msg.from.id) === -1) break;
                            //     if (msg.text.split(' ').length === 1) bot.sendMessage(chatId, '目前')
                            // case 'block':
                            //     if (members.map((member) => member.user.id).indexOf(msg.from.id) === -1) break;
                            case "queue":
                                await this.bot.sendMessage(chatId,
                                                           CONSTS.WAITING_PHOTOS(chatData.queue.length,
                                                                                 chatData.history.length,
                                                                                 moment(chatData.last)
                                                                                    .add(chatData.interval, "h")
                                                                                    .format("LLL"),
                                                ),
                                );
                                break;
                            // TODO
                            // case 'votenext':
                            //     break;
                            default:
                                // no-op
                        }
                    });
                }
            });
        });
    }

    /**
     * Convert Data from old structure
     * @param d PhotoDataStrcture Data Array
     */
    private doCompatibleConvert(d: object): PhotoData.PhotoDataStrcture[] {
        return Object.keys(d)
            .map<PhotoData.PhotoDataStrcture>(
                (chatId: string) =>
                    new PhotoData.PhotoDataStrcture((d as any)[chatId]),
            );
    }

    /**
     * Read PhotoDataStrcture Datas into PhotoDataStore which contains Chat's data stores
     */
    private readData() {
        let _data;
        try {
            _data = (fs.existsSync(CONSTS.DATA_FILE_PATH)) ?
                yaml.load(fs.readFileSync(CONSTS.DATA_FILE_PATH).toString()) :
                JSON.parse(fs.readFileSync(CONSTS.DATA_FILE_JSON_PATH).toString());
        } catch (e) {
            console.warn(e);
            _data = [];
        } finally {
            if (_data instanceof Object && !(_data instanceof Array) && _data !== undefined) {
                _data = this.doCompatibleConvert(_data);
            }
        }
        return _data;
    }

    /**
     * Save PhotoDataStore to data file
     */
    private saveData() {
        const _data = JSON.parse(JSON.stringify(this.data)); // to prevent Proxy dump undefined
        fs.writeFile(CONSTS.DATA_FILE_PATH, yaml.safeDump(_data), () => void(0));
    }

    /**
     * Get Chat Data Store by Chat ID
     * @param chatId Telegram Chat ID aka. Group ID
     */
    private getData(chatId: number): PhotoData.PhotoDataStrcture {
        const chatData = this.data.filter((d) => d.chatId === chatId).shift();
        if (chatData instanceof PhotoData.PhotoDataStrcture) {
            return chatData;
        } else {
            const d = new PhotoData.PhotoDataStrcture(chatId);
            this.data.push(d);
            return d;
        }
    }

    /**
     * Send Queue Result back to Chat
     * @param msg Message Object
     * @param result Queue result string
     * @param entitiy Message Entity
     * @param url Requested URL queue
     */
    private async sendQueueResult(
        msg: TelegramBot.Message,
        result: string,
        parentMsg?: TelegramBot.Message,
        entitiy?: TelegramBot.MessageEntity,
        url?: string,
    ) {
        switch (result) {
            case CONSTS.ADDED_INTO_QUEUE:
                await this.bot.sendMessage(msg.chat.id, result, {reply_to_message_id: msg.message_id});
                break;
            case CONSTS.ALREADY_IN_QUEUE:
                if (entitiy && url) {
                    // if file_id already in queue, delete the image message to save the view space
                    await this.bot.deleteMessage(msg.chat.id, msg.message_id.toString());
                    // and then, send a message with URL's substr offset and length of text
                    // to notify it's already in queue
                    if (parentMsg) {
                        await this.bot.sendMessage(msg.chat.id,
                                                   `@(${entitiy.offset}+${entitiy.length}): ${url} ${CONSTS.ALREADY_IN_QUEUE}`,
                                                   {reply_to_message_id: parentMsg.message_id},
                                            );
                    }
                } else {
                    await this.bot.sendMessage(msg.chat.id, CONSTS.ALREADY_IN_QUEUE, {reply_to_message_id: msg.message_id});
                }
                break;
            default:
                // unspecified response, always delete the message we sent
                await this.bot.deleteMessage(msg.chat.id, msg.message_id.toString());
        }
    }

    /**
     * Check and Add into the Queue
     * @param msg Message Object
     */
    private async checkQueue(msg: TelegramBot.Message) {
        const chatId = msg.chat.id;
        let fileId: string;

        if (msg.chat.type === "private") {
            await this.bot.sendMessage(chatId, CONSTS.CAN_NOT_CHANGE_PHOTO);
            return CONSTS.CAN_NOT_CHANGE_PHOTO;
        } else if (msg.chat.type === "group" && msg.chat.all_members_are_administrators) {
            await this.bot.sendMessage(chatId, CONSTS.CAN_NOT_CHANGE_ALL_ADMINS_PHOTO);
            return CONSTS.CAN_NOT_CHANGE_ALL_ADMINS_PHOTO;
        }

        if (msg.photo && msg.photo.length > 0) {
            fileId = msg.photo.pop()!.file_id;
        } else if (msg.document && msg.document.thumb) {
            fileId = msg.document.file_id;
        } else {
            fileId = "";
        }

        const chatData = this.getData(chatId);
        let result = null;
        if (chatData.queue.indexOf(fileId) === -1) {
            chatData.queue.push(fileId);
            result = CONSTS.ADDED_INTO_QUEUE;
        } else {
            result = CONSTS.ALREADY_IN_QUEUE;
        }
        return result;
    }

    /**
     * Add Photo to Queue
     * @param msg Message Object
     */
    private async addPhoto(msg: TelegramBot.Message) {
        const result = await this.checkQueue(msg);
        if (result !== undefined && result.length > 0) {
            await this.sendQueueResult(msg, result);
        }
        return result;
    }

    /**
     * Update the Group Photo Icon
     */
    private doUpdate() {
        this.data.map(async (chatData) => {
            if (!chatData.last || moment(chatData.last).add(chatData.interval, "h").isBefore(moment())) {
                await this.nextPhoto(chatData);
            }
        });
    }

    private async nextPhoto(chatData: PhotoData.PhotoDataStrcture) {
        let fileLink: string;
        if (chatData.queue.length > 0) {
            fileLink = chatData.queue.shift()!;
            if (!chatData.history.includes(fileLink)) {
                chatData.history.push(fileLink);
            }
        } else if (chatData.queue.length === 0 && chatData.history.length > 1) {
            fileLink = this.randomHistory(chatData);
        } else {
            fileLink = "";
        }
        if (fileLink.length > 0) {
            await this.bot.getFileLink(fileLink)
                .then(async (link) => link instanceof Error ? null : this.bot.setChatPhoto(chatData.chatId, request(link)));
            chatData.last = +moment();
        }
        return fileLink;
    }

    private randomHistory(chatData: PhotoData.PhotoDataStrcture) {
        // prevent last photo out of random queue
        const idx = Math.floor(Math.random() * (chatData.history.length - 1));
        const fileLink = chatData.history[idx];
        // make next photo to last
        chatData.history = chatData.history.map<string>((h) => h !== fileLink ? h : "")
            .filter((h) => h)
            .concat([fileLink]);
        return fileLink;
    }

    /**
     * Upload the Photo from URL back to Chat for acquire a file ID
     * @param msg Message Object
     * @param imageBuffer Image Buffer Object
     * @param ent Message Entity
     * @param url Requested URL queue
     */
    private async uploadPhoto(msg: TelegramBot.Message, imageBuffer: Buffer, ent: TelegramBot.MessageEntity, url: string) {
        console.info(CONSTS.UPLOADING_PHOTO(`${msg.chat.title}(${msg.chat.id})`, imageBuffer, url));
        return this.bot.sendPhoto(msg.chat.id, imageBuffer, {caption: CONSTS.GROUP_PHOTO_CAPTION})
            .then(async (m) => {
                let ret;
                if (!(m instanceof Error)) {
                    ret = await this.sendQueueResult(m, await this.checkQueue(m), msg, ent, url);
                }
                return ret;
            })
            .catch((e) => {
                console.error(e);
            });
    }

    /**
     * Try to parse the downloaded Photo, then add into the queue
     * @param msg Message Object
     * @param imageBuffer Image Buffer Object
     * @param ent Message Entity
     * @param url Requested URL queue
     */
    private async parsePhoto(msg: TelegramBot.Message, imageBuffer: Buffer, ent: TelegramBot.MessageEntity, url: string) {
        return jimp.read(imageBuffer)
            .then(async (image) => {
                if (image !== undefined) {
                    console.info(CONSTS.IMAGE_FROM_URL_DIMENSION(image.getMIME(), image.bitmap.width, image.bitmap.height));
                    // send image which downloaded back to the chat for placehold a file_id
                    await this.uploadPhoto(msg, imageBuffer, ent, url);
                } else {
                    // jimp can not decode as an image, we must send a message to notify the URL is not an image
                    await this.bot.sendMessage(msg.chat.id,
                                               CONSTS.URL_REQUESTED_IS_NOT_A_IMAGE(url),
                                               {reply_to_message_id: msg.message_id});
                }
            })
            .catch((err: Error) => {
                console.error("jimp error", err.message);
            });
    }

    /**
     * Pre-Process URL for some Open Graph supported sites
     * @param msg Message Object
     * @param url Requested URL queue
     */
    private async preProcessUrl(msg: TelegramBot.Message, url: string) {
        return new Promise<string>((resolve, reject) => {
            console.info(CONSTS.URL_PREPARE_TO_DOWNLOAD(msg, url));
            if (url.match(/\.pixiv\./i) !== null) {
                // todo for pixiv, always reject until implemented
                reject(url);
            } else {
                request.get(url, { encoding: null }, async (error, response, body) => {
                    ogs({ url }, (err: boolean, results: any) => {
                        if (!err && results.success === true &&
                            results.data && results.data.ogImage && results.data.ogImage.url
                        ) {
                            const ogUrl = results.data.ogImage.url;
                            console.info(CONSTS.URL_FOUND_OG_IMAGE_URL(msg, url, ogUrl));
                            resolve(ogUrl);
                        } else {
                            console.info(CONSTS.URL_NOT_FOUND_OG_IMAGE_URL(msg, url));
                            reject(url);
                        }
                    });
                });
            }
        }).catch((_url: string) => _url);
    }

    /**
     * Try to get Image from the URL and try to parse then add
     * @param msg Message Object
     * @param ent Message Entity
     * @param url Requested URL queue
     */
    private async tryGetPhotoFromUrl(msg: TelegramBot.Message, ent: TelegramBot.MessageEntity, url: string) {
        this.uploadQueue = this.uploadQueue.then(async () =>
            new Promise<void>(async (resolve, reject) => {
                const imgUrl = await this.preProcessUrl(msg, url);
                if (imgUrl.length === 0) {
                    reject();
                    return;
                }
                return request.get(imgUrl, { encoding: null }, async (error, response, body) => {
                    if (error) {
                        console.error(error);
                        reject();
                        return;
                    }
                    if (response.statusCode === 200) {
                        await this.parsePhoto(msg, Buffer.from(response.body), ent, url);
                        resolve();
                    } else {
                        // notify the URL not responsed correctly
                        await this.bot.sendMessage(msg.chat.id,
                                                   CONSTS.URL_REQUESTED_IS_NOT_OK(url),
                                                   {reply_to_message_id: msg.message_id});
                        reject();
                    }
                });
            }),
        ).catch(() => { /* no-op */ });
        return this.uploadQueue;
    }

    /**
     * Add URL Photo to queue
     * @param msg Message Object
     */
    private doAddPhotoByUrl(msg: TelegramBot.Message) {
        if (msg.entities) {
            const urls: string[] = [];
            msg.entities.map(async (ent, idx) => {
                if (ent.type === "url" && msg.text !== undefined) {
                    const url = msg.text.substr(ent.offset, ent.length);
                    if (urls.indexOf(url) === -1) {
                        console.info(CONSTS.QUEUE_REQUEST_TEXT("URL", `${msg.chat.title}(${msg.chat.id}): ${url}`));
                        urls.push(url);
                        await this.tryGetPhotoFromUrl(msg, ent, url);
                    }
                }
            });
        }
    }
}
