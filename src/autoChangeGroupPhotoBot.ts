// const europa = new (require("node-europa"))({ absolute: true, inline: true });
import * as moment from "moment";
import * as schedule from "node-schedule";
import * as TelegramBot from "node-telegram-bot-api";
import * as request from "request";
import * as sharp from "sharp";

import { TelegramBotExtended } from "../typings";

import { BotConfig, InitialConfig } from "./botConfig";
import * as CONSTS from "./consts";
import { Operations } from "./operations";
import * as PhotoData from "./photoData";
import { TelegramDownload } from "./telegramDownload";
import { Utils } from "./utils";

const pixivApi = require("pixiv-api-client");
const tracer = require("tracer");
const logger = tracer.colorConsole({ level: process.env.DEBUG !== undefined ? process.env.DEBUG : "info" });

moment.locale("zh-tw");

export
    /**
     * The Telegram Bot for Auto Change Group Photo Icon
     * @class AutoChangeGroupPhotoBot
     */
    class AutoChangeGroupPhotoBot {
    private static _instance?: AutoChangeGroupPhotoBot;
    private readonly downloader: TelegramDownload;
    private readonly config: BotConfig;
    private readonly bot: TelegramBot;
    private readonly data: PhotoData.PhotoDataStructure[];
    private uploadQueue: Promise<any> = Promise.resolve();
    private readonly pixiv?: any;

    /**
     * Singleton of AutoChangeGroupPhotoBot
     * @param _config Telegram Bot config object
     */
    public static getInstance(_config: any = {}) {
        return (AutoChangeGroupPhotoBot._instance) ?
            AutoChangeGroupPhotoBot._instance :
            (AutoChangeGroupPhotoBot._instance = new AutoChangeGroupPhotoBot(_config));
    }

    /**
     * AutoChangeGroupPhotoBot constructor
     * @param _config Telegram Bot config object
     */
    private constructor(_config: any = {}) {
        this.config = InitialConfig(Object.assign(new BotConfig(), _config), () => { BotConfig.saveConfig(this.config); });
        if (this.config.token) {
            this.data = PhotoData.PhotoDataStore(PhotoData.PhotoDataStructure.readData(), () => { PhotoData.PhotoDataStructure.saveData(this.data); });
            // if has bot token, then start the main program
            this.bot = new TelegramBot(this.config.token, { filepath: false, polling: { interval: 0, params: { timeout: 60 } } });

            this.downloader = TelegramDownload.getInstance(this.bot, logger);

            this.registerEvent()
                .then(() => { /* no-op */ })
                .catch(() => { /* no-op */ });
            if (this.config.pixiv.account && this.config.pixiv.password) {
                this.pixiv = new pixivApi();
                Utils.registerPixiv(this.pixiv, this.config);
            } else {
                this.pixiv = null;
                logger.info(CONSTS.DISABLED_PIXIV_ACCOUNT);
            }
        } else {
            throw Error(CONSTS.NEED_TELEGRAM_BOT_TOKEN);
        }
    }

    /**
     * Register Bot events and cronjob
     */
    private async registerEvent() {
        schedule.scheduleJob("0 * * * * *", () => { this.doUpdate(); });

        // queue the photo
        this.bot.onText(CONSTS.REGEXP_MATCH_TAG_COMMAND, async (msg) => {
            if (msg.reply_to_message && (msg.reply_to_message.photo || msg.reply_to_message.document)) {
                logger.info(CONSTS.QUEUE_TEXT("Text", msg.chat));
                await Operations.addPhoto(this.data, this.bot, this.downloader, msg.reply_to_message);
            } else if (msg.reply_to_message && msg.reply_to_message.entities) {
                this.doAddPhotoByUrl(msg.reply_to_message);
            }
        });

        this.bot.on("photo", async (msg: TelegramBot.Message) => {
            if (msg.caption && msg.caption.match(CONSTS.REGEXP_MATCH_TAG_COMMAND)) {
                logger.info(CONSTS.QUEUE_TEXT("Photo", msg.chat));
                await Operations.addPhoto(this.data, this.bot, this.downloader, msg);
            }
        });

        this.bot.on("document", async (msg: TelegramBot.Message) => {
            if (msg.caption && msg.caption.match(CONSTS.REGEXP_MATCH_TAG_COMMAND)) {
                logger.info(CONSTS.QUEUE_TEXT("Document", msg.chat));
                await Operations.addPhoto(this.data, this.bot, this.downloader, msg);
            }
        });

        this.bot.on("message", async (msg: TelegramBot.Message) => {
            if (msg.text !== undefined && msg.text.match(CONSTS.REGEXP_MATCH_TAG_COMMAND) !== null) {
                if (msg.reply_to_message && msg.reply_to_message.sticker) {
                    await this.doAddSticker(msg);
                } else if (msg.entities) {
                    this.doAddPhotoByUrl(msg);
                }
            }
        });

        await this.bot.getMe()
            .then(async (me: TelegramBot.User) => {
                await this.getMeEvent(me);
            })
            .catch((reason: any) => {
                logger.warn("Get Me occurred error", reason);
            });
    }

    /**
     * process get me events
     */
    private async getMeEvent(me: TelegramBot.User) {
        if (me instanceof Error) {
            logger.warn("Get Me Event occurred error", me);
            return;
        }

        this.bot.on("inline_query", async (inlineQuery: TelegramBot.InlineQuery) => {
            logger.info(inlineQuery);
            if (inlineQuery.query.match(/^\d+$/)) {
                const pid = Number(inlineQuery.query);
                await Utils.getPixivIllustDetail(this.pixiv, this.config, pid)
                    .then((illustObj) => {
                        const result: TelegramBot.InlineQueryResultPhoto[] = illustObj.originalUrl.map((url, i) => {
                            let caption = CONSTS.GROUP_PHOTO_PIXIV_CAPTION(illustObj);
                            caption = (caption.length > CONSTS.PHOTO_CAPTION_MAX_LENGTH)
                                ? caption.substr(0, CONSTS.PHOTO_CAPTION_MAX_LENGTH)
                                : caption;
                            const r: TelegramBot.InlineQueryResultPhoto = {
                                caption,
                                id: `${inlineQuery.id}_${i}`,
                                photo_url: url,
                                thumb_url: url,
                                type: "photo",
                            };
                            return r;
                        });
                        this.bot.answerInlineQuery(inlineQuery.id, result, { cache_time: 1 })
                            .catch((e) => logger.error(e));
                    });
            }
        });

        this.bot.onText(/^\/(\w+)@?(\w*)/i, async (msg, regex) => {
            if (!regex || regex[2] && regex[2] !== me.username) {
                logger.info("Received regex", regex, "but not @ me, ignored");
                return;
            }
            if (msg.chat.type !== "private" && regex[2] !== me.username) {
                logger.info("Received regex", regex, "but not @ me, ignored");
                return;
            }

            const command = regex[1].toLowerCase();
            const commandArgs = msg.text!.replace(regex[0], "")
                .trim()
                .split(" ");
            logger.info("Received command", command, "and args", commandArgs);
            await this.bot.getChatAdministrators(msg.chat.id)
                .then(async (members) => Operations.parseCommand(this.data, this.bot, this.config, members, msg, command as CONSTS.COMMANDS, commandArgs));
        });
    }

    /**
     * Update the Group Photo Icon
     */
    private doUpdate() {
        this.data.map(async (chatData) => {
            if (chatData.disabled) {
                return;
            }
            const isMomentBefore = moment(chatData.last)
                .add(chatData.interval, "h")
                .isBefore(moment());
            if (!chatData.paused && (!chatData.last || isMomentBefore)) {
                await chatData.nextPhoto(this.bot);
                // const fileLink = await chatData.nextPhoto(this.bot);
                // await this.bot.getChat(chatData.chatId)
                //     .then((chat) => {
                //         if (chat instanceof Error) {
                //             logger.error(CONSTS.GET_CHAT_ERROR(chatData.chatId, chat));
                //         } else {
                //             chatData.chatName = `${chat.title || chat.username}`;
                //             if (fileLink.length > 0) {
                //                 logger.info(CONSTS.UPDATED_PHOTO(chat, fileLink));
                //             }
                //         }
                //     })
                //     .catch((reason: Error) => {
                //         logger.error(CONSTS.GET_CHAT_ERROR(chatData.chatId, reason.message));
                //         const e = reason as TelegramBotExtended.TelegramError;
                //         if (e.code === "ETELEGRAM") {
                //             if (e.response.body.error_code >= 400 && e.response.body.error_code < 500) {
                //                 if (e.response.body.description.match(/chat not found/i) !== null) {
                //                     chatData.disabled = true;
                //                     logger.warn(CONSTS.CHAT_DISABLED_BY_SYSTEM(chatData.chatId, reason.message));
                //                 }
                //             }
                //         }
                //     });
            }
            this.downloader.checkGroup(chatData);
        });
    }

    private async doAddSticker(msg: TelegramBot.Message) {
        if (msg.reply_to_message && msg.reply_to_message.sticker) {
            const stickerURL: any = await this.bot.getFileLink(msg.reply_to_message.sticker.file_id);
            if (stickerURL instanceof Error) {
                return Promise.reject(stickerURL);
                // tslint:disable-next-line:unnecessary-else
            } else {
                return request(stickerURL, Utils.requestOptions, async (error, response, body) => {
                    const stickerSharp = sharp(body);
                    const stickerPng = await stickerSharp.png()
                        .toBuffer();
                    await Operations.sendPhotoPromise(this.data, this.bot, this.downloader, msg, stickerPng, { caption: CONSTS.GROUP_PHOTO_CAPTION });
                });
            }
        }
        return Promise.reject(null);
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
                const imgUrl = await Utils.preProcessUrl(this.pixiv, this.config, this.bot, msg, url);
                const isBuffer = imgUrl instanceof Buffer;
                const isPixiv = imgUrl instanceof PhotoData.PixivIllustStructure;
                if (!(imgUrl instanceof PhotoData.PixivIllustStructure) && imgUrl.length === 0) {
                    reject();
                    return;
                }
                const downloadImage = async (err: any, response: any, body: any) => {
                    if (err) {
                        logger.error(err);
                        reject();
                        return;
                    }
                    if (response.statusCode === 200) {
                        await Utils.parsePhoto(Operations.uploadPhoto, this.data, this.bot, this.downloader, msg,
                                               Buffer.from(response.body), ent, url,
                                               imgUrl instanceof Buffer ? undefined : imgUrl);
                        resolve();
                    } else {
                        // notify the URL not responded correctly
                        await this.bot.sendMessage(msg.chat.id,
                                                   CONSTS.URL_REQUESTED_IS_NOT_OK(url),
                                                   { reply_to_message_id: msg.message_id });
                        reject();
                    }
                };
                if (isBuffer) {
                    // tslint:disable-next-line:no-unnecessary-type-assertion
                    const imgBuffer = imgUrl as Buffer;
                    await Utils.parsePhoto(Operations.uploadPhoto, this.data, this.bot, this.downloader, msg, imgBuffer, ent, url);
                    resolve();
                    return;
                    // tslint:disable-next-line:unnecessary-else
                } else if (isPixiv) {
                    // tslint:disable-next-line:no-unnecessary-type-assertion
                    const illust = imgUrl as PhotoData.PixivIllustStructure;
                    return request.get(illust.originalUrl[0], Utils.requestOptions, downloadImage);
                    // tslint:disable-next-line:unnecessary-else
                } else {
                    // tslint:disable-next-line:no-unnecessary-type-assertion
                    const urlString = imgUrl as string;
                    return request.get(urlString, Utils.requestOptions, downloadImage);
                }
            }),
        )
            .catch(() => { /* no-op */ });
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
                        logger.info(CONSTS.QUEUE_REQUEST_TEXT("URL", `${msg.chat.title}(${msg.chat.id}): ${url}`));
                        urls.push(url);
                        await this.tryGetPhotoFromUrl(msg, ent, url);
                    }
                } else if (ent.type === "text_link") {
                    if (urls.indexOf(ent.url!) === -1) {
                        logger.info(CONSTS.QUEUE_REQUEST_TEXT("URL", `${msg.chat.title}(${msg.chat.id}): ${ent.url}`));
                        urls.push(ent.url!);
                        await this.tryGetPhotoFromUrl(msg, ent, ent.url!);
                    }
                }
            });
        }
    }
}
