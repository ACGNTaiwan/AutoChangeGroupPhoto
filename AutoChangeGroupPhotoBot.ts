// const europa = new (require("node-europa"))({ absolute: true, inline: true });
import * as fs from "fs";
import * as htmlToText from "html-to-text";
import * as jimp from "jimp";
import * as yaml from "js-yaml";
import * as moment from "moment";
import * as schedule from "node-schedule";
import * as TelegramBot from "node-telegram-bot-api";
const ogs = require("open-graph-scraper");
const pixivApi = require("pixiv-api-client");
import * as request from "request";
const tracer = require("tracer");
const logger = tracer.colorConsole({ level: process.env.DEBUG!.length > 0 ? process.env.DEBUG : "info" });
import { BotConfig, InitialConfig } from "./BotConfig";
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
    private pixiv?: any;
    private requestOptions = {
        encoding: null,
        followRedirect: false,
    };

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
        this.config = InitialConfig(Object.assign(new BotConfig(), _config), () => { this.saveConfig(); });
        if (this.config.token) {
            this.data = PhotoData.PhotoDataStore(this.readData(), () => { this.saveData(); });
            // if has bot token, then start the main program
            this.bot = new TelegramBot(this.config.token, { polling: { interval: 0, params: { timeout: 60 } } });

            this.registerEvent().then(() => { /* no-op */ }).catch(() => { /* no-op */ });
            if (this.config.pixiv.account && this.config.pixiv.password) {
                this.pixiv = new pixivApi();
                const pixivLogged = (userInfo: any) => {
                    this.config.pixiv.refreshToken = userInfo.refresh_token;
                    logger.info(CONSTS.ENABLED_PIXIV_ACCOUNT(this.config.pixiv.account, this.config.pixiv.refreshToken));
                };
                const pixivLogginError = (e: any) => {
                    logger.error(e);
                };
                if (this.config.pixiv.refreshToken === "") {
                    logger.info(CONSTS.ENABLING_PIXIV_ACCOUNT(this.config.pixiv.account));
                    this.pixiv.login(this.config.pixiv.account, this.config.pixiv.password)
                        .then(pixivLogged)
                        .catch(pixivLogginError);
                } else {
                    logger.info(CONSTS.ENABLING_REFRESHED_PIXIV_ACCOUNT(this.config.pixiv.account, this.config.pixiv.refreshToken));
                    this.pixiv.refreshAccessToken(this.config.pixiv.refreshToken)
                        .then(pixivLogged)
                        .catch(pixivLogginError);
                }
                setInterval(() => this.pixiv.refreshAccessToken(), 60 * 1000 * 60);
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

        // queue the phpto
        this.bot.onText(CONSTS.REGEXP_MATCH_TAG_COMMAND, async (msg) => {
            if (msg.reply_to_message && (msg.reply_to_message.photo || msg.reply_to_message.document)) {
                logger.info(CONSTS.QUEUE_TEXT("Text", msg.chat));
                await this.addPhoto(msg.reply_to_message);
            } else if (msg.reply_to_message && msg.reply_to_message.entities) {
                this.doAddPhotoByUrl(msg.reply_to_message);
            }
        });

        this.bot.on("photo", async (msg: TelegramBot.Message) => {
            if (msg.caption && msg.caption.match(CONSTS.REGEXP_MATCH_TAG_COMMAND)) {
                logger.info(CONSTS.QUEUE_TEXT("Photo", msg.chat));
                await this.addPhoto(msg);
            }
        });

        this.bot.on("document", async (msg: TelegramBot.Message) => {
            if (msg.caption && msg.caption.match(CONSTS.REGEXP_MATCH_TAG_COMMAND)) {
                logger.info(CONSTS.QUEUE_TEXT("Document", msg.chat));
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

            this.bot.on("inline_query", async (inlineQuery: TelegramBot.InlineQuery) => {
                logger.info(inlineQuery);
                if (inlineQuery.query.match(/^\d+$/)) {
                    const pid = Number(inlineQuery.query);
                    await this.getPixivIllustDetail(pid).then((illustObj) => {
                        const result: TelegramBot.InlineQueryResultPhoto[] = illustObj.originalUrl.map((url, i) => {
                            const r: TelegramBot.InlineQueryResultPhoto = {
                                caption: CONSTS.GROUP_PHOTO_PIXIV_CAPTION(illustObj),
                                id: `${inlineQuery.id}_${i}`,
                                photo_url: url,
                                thumb_url: url,
                                type: "photo",
                            };
                            return r;
                        });
                        this.bot.answerInlineQuery(inlineQuery.id, result, { cache_time: 1 }).catch(() => { /* no-op */ });
                    });
                }
            });

            this.bot.onText(/^\/(\w+)@?(\w*)/i, async (msg, regex) => {
                if (regex) {
                    if (regex[2] && regex[2] !== me.username) {
                        return;
                    }

                    const command = regex[1].toLowerCase();
                    const commandArgs = msg.text!.replace(regex[0], "").trim().split(" ");

                    await this.bot.getChatAdministrators(msg.chat.id)
                        .then(async (members) => this.parseCommand(members, msg, command as CONSTS.COMMANDS, commandArgs));
                }
            });
        });
    }

    /**
     * Parse Text Command from chat
     * @param members Telegram Chat Members
     * @param msg Message Object
     * @param command Command
     * @param commandArgs Command Arguments
     */
    private async parseCommand(
        members: TelegramBot.ChatMember[] | Error,
        msg: TelegramBot.Message,
        command: CONSTS.COMMANDS,
        commandArgs: string[],
    ) {
        const chatId = msg.chat.id;
        const chatData = this.getData(chatId);

        if (members instanceof Error) {
            return;
        }
        if (CONSTS.COMMANDS_ADMINS_ONLY.indexOf(command) !== -1) {
            if (msg.from) {
                if (members.map((member) => member.user.id).indexOf(msg.from.id) === -1) {
                    return;
                }
            }
        }

        switch (command) {
            case CONSTS.COMMANDS.SET_PAUSED:
                chatData.paused = true;
                logger.info(CONSTS.PAUSE_RESUME_LOG_MESSAGE(msg.chat, chatData));
                await this.bot.sendMessage(chatId, CONSTS.PAUSE_RESUME_MESSAGE(msg.chat, chatData));
                break;
            case CONSTS.COMMANDS.SET_RESUMED:
                chatData.paused = false;
                logger.info(CONSTS.PAUSE_RESUME_LOG_MESSAGE(msg.chat, chatData));
                await this.bot.sendMessage(chatId, CONSTS.PAUSE_RESUME_MESSAGE(msg.chat, chatData));
                break;
            case CONSTS.COMMANDS.SET_INTERVAL:
                if (msg.text) {
                    const args = commandArgs.join(" ");
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
            case CONSTS.COMMANDS.NEXT_PHOTO:
                await this.nextPhoto(chatData);
                break;
            case CONSTS.COMMANDS.BAN:
                await this.delPhoto(msg, true);
                break;
            case CONSTS.COMMANDS.UNBAN:
                if (msg.reply_to_message && (msg.reply_to_message.photo || msg.reply_to_message.document)) {
                    await this.unbanPhoto(msg);
                }
                break;
            case CONSTS.COMMANDS.DELETE:
                await this.delPhoto(msg);
                break;
            // TODO
            // case 'setloop':
            //     if (members.map((member) => member.user.id).indexOf(msg.from.id) === -1) break;
            //     if (msg.text.split(' ').length === 1) bot.sendMessage(chatId, '目前')
            // case 'block':
            //     if (members.map((member) => member.user.id).indexOf(msg.from.id) === -1) break;
            case CONSTS.COMMANDS.QUEUE_STATUS:
                const nextTime = moment(chatData.last)
                    .add(chatData.interval, "h")
                    .format("LLL");
                await this.bot.sendMessage(chatId, CONSTS.WAITING_PHOTOS(chatData, nextTime));
                break;
            // TODO
            // case 'votenext':
            //     break;
            default:
            // no-op
        }
    }

    /**
     * Convert Data from old structure
     * @param d PhotoDataStrcture Data Array
     */
    private doCompatibleConvert(d: object): PhotoData.PhotoDataStrcture[] {
        return Object.keys(d)
            .map<PhotoData.PhotoDataStrcture>(
            (chatId: string) => {
                const pds = (d as any)[chatId] as PhotoData.PhotoDataStrcture;
                pds.chatId = Number(chatId);
                return new PhotoData.PhotoDataStrcture(pds);
            },
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
            logger.warn(e);
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
        fs.writeFile(CONSTS.DATA_FILE_PATH, yaml.safeDump(_data), () => void (0));
    }

    /**
     * Save Config to file
     */
    private saveConfig() {
        const _config = JSON.parse(JSON.stringify(this.config)); // to prevent Proxy dump undefined
        fs.writeFile(CONSTS.CONFIG_FILE_PATH, yaml.safeDump(_config), () => void (0));
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
    ) {
        switch (result) {
            case CONSTS.ADDED_INTO_QUEUE:
                await this.bot.sendMessage(msg.chat.id, result, { reply_to_message_id: msg.message_id });
                break;
            case CONSTS.ALREADY_IN_QUEUE:
                await this.bot.sendMessage(msg.chat.id, CONSTS.ALREADY_IN_QUEUE, { reply_to_message_id: msg.message_id });
                break;
            case CONSTS.BANNED_PHOTO:
                await this.bot.sendMessage(msg.chat.id, result, { reply_to_message_id: msg.message_id });
                break;
            case CONSTS.UNSUPPORTED_FILE_EXTENSIONS(msg.document!.file_name!):
                await this.bot.sendMessage(msg.chat.id, result, { reply_to_message_id: msg.message_id, parse_mode: "Markdown" });
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
            if (msg.document.file_name!.match(/.(gif|mp4)/gi) === null) {
                fileId = msg.document.file_id;
            } else {
                fileId = "";
                logger.info(CONSTS.FILE_ADD_INTO_QUEUE_UNSUPPORTED(msg.document.file_name!));
                return CONSTS.UNSUPPORTED_FILE_EXTENSIONS(msg.document.file_name!);
            }
        } else {
            fileId = "";
        }

        const chatData = this.getData(chatId);
        let result = null;
        if (chatData.banList.indexOf(fileId) === -1) {
            if (chatData.queue.indexOf(fileId) === -1) {
                chatData.queue.push(fileId);
                result = CONSTS.ADDED_INTO_QUEUE;
                logger.info(CONSTS.FILE_ADDED_INTO_QUEUE(fileId));
            } else {
                result = CONSTS.ALREADY_IN_QUEUE;
                logger.info(CONSTS.FILE_ALREADY_IN_QUEUE(fileId));
            }
        } else {
            result = CONSTS.BANNED_PHOTO;
            logger.info(CONSTS.QUEUE_WAS_BANNED(chatId, fileId));
        }
        return result;
    }

    /**
     * Ban the photo
     * @param msg Message Object
     * @param ban Ban Option
     */
    private async delPhoto(msg: TelegramBot.Message, ban = false) {
        const chatId = msg.chat.id;
        const chatData = this.getData(chatId);
        let fileIdIist: string[];

        if (msg.reply_to_message) {
            fileIdIist = (msg.reply_to_message.photo ? msg.reply_to_message.photo.map<string>((p) => p.file_id) : [])
                .concat(msg.reply_to_message.document ? [msg.reply_to_message.document.file_id] : []);
        } else {
            fileIdIist = (chatData.history.length !== 0 ? [chatData.history.pop()!] : []);
        }

        if (fileIdIist.length === 0) { return; }

        if (ban) {
            fileIdIist.map((p) => chatData.banList.indexOf(p) === -1 ? chatData.banList.push(p) : null);
            logger.info(CONSTS.BANNED_TEXT(chatId, fileIdIist.join(", ")));
            await this.bot.sendMessage(chatId, CONSTS.BANNED_PHOTO, { reply_to_message_id: msg.message_id });
        } else {
            logger.info(CONSTS.DELETE_TEXT(chatId, fileIdIist.join(", ")));
            await this.bot.sendMessage(chatId, CONSTS.DELETE_PHOTO, { reply_to_message_id: msg.message_id });
        }

        chatData.queue = chatData.queue
            .map<string>((q) => fileIdIist.indexOf(q) === -1 ? q : "")
            .filter((q) => q);

        if (!msg.reply_to_message) { await this.nextPhoto(chatData); }
    }

    /**
     * Unban the banned photo
     * @param msg Message Object
     */
    private async unbanPhoto(msg: TelegramBot.Message) {
        const chatId = msg.chat.id;
        const fileIdIist = (msg.reply_to_message!.photo ? msg.reply_to_message!.photo!.map<string>((p) => p.file_id) : [])
            .concat(msg.reply_to_message!.document ? [msg.reply_to_message!.document!.file_id] : []);
        const chatData = this.getData(chatId);
        chatData.banList = chatData.banList
            .map<string>((b) => fileIdIist.indexOf(b) !== -1 ? "" : b)
            .filter((b) => b);
        logger.info(CONSTS.UNBANNED_TEXT(chatId, fileIdIist.join(", ")));
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
            if (!chatData.paused && (!chatData.last || moment(chatData.last).add(chatData.interval, "h").isBefore(moment()))) {
                const fileLink = await this.nextPhoto(chatData);
                await this.bot.getChat(chatData.chatId)
                    .then((chat) => {
                        if (chat instanceof Error) {
                            logger.error(CONSTS.GET_CHAT_ERROR(chatData.chatId, chat));
                        } else {
                            chatData.chatName = `${chat.title || chat.username}`;
                            if (fileLink.length > 0) {
                                logger.info(CONSTS.UPDATED_PHOTO(chat, fileLink));
                            }
                        }
                    })
                    .catch((reason: any) => {
                        logger.error(CONSTS.GET_CHAT_ERROR(chatData.chatId, reason));
                    });
            }
        });
    }

    /**
     * To send update action for group photo
     * @param chatData PhotoDataStrcture
     */
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
                .then(async (link) => link instanceof Error ? null :
                    this.bot.setChatPhoto(chatData.chatId, request(link))
                        .catch((reason) => {
                            logger.error(CONSTS.UPDATE_PHOTO_ERROR(chatData.chatId, reason));
                        }),
            );
            chatData.last = +moment();
        }
        return fileLink;
    }

    /**
     * For random output a file id and push the result to last
     * @param chatData PhotoDataStrcture
     */
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
     * @param imgUrl URL or Pixiv Structure
     */
    private async uploadPhoto(
        msg: TelegramBot.Message,
        imageBuffer: Buffer,
        ent: TelegramBot.MessageEntity,
        url: string,
        imgUrl?: string | PhotoData.PixivIllustStructure,
    ) {
        logger.info(CONSTS.UPLOADING_PHOTO(`${msg.chat.title}(${msg.chat.id})`, imageBuffer, url));
        const illust: PhotoData.PixivIllustStructure | null = imgUrl instanceof PhotoData.PixivIllustStructure ? imgUrl : null;
        const caption = (illust ? CONSTS.GROUP_PHOTO_PIXIV_CAPTION(illust) : CONSTS.GROUP_PHOTO_CAPTION);
        return this.bot.sendPhoto(msg.chat.id, imageBuffer, { caption, disable_notification: true, reply_to_message_id: msg.message_id })
            .then(async (m) => {
                let ret;
                if (!(m instanceof Error)) {
                    ret = await this.sendQueueResult(msg, await this.checkQueue(m));
                    await this.bot.deleteMessage(m.chat.id, m.message_id.toString());
                }
                return ret;
            })
            .catch((e) => {
                logger.error(e);
            });
    }

    /**
     * Try to parse the downloaded Photo, then add into the queue
     * @param msg Message Object
     * @param imageBuffer Image Buffer Object
     * @param ent Message Entity
     * @param url Requested URL queue
     * @param imgUrl URL or Pixiv Structure
     */
    private async parsePhoto(
        msg: TelegramBot.Message,
        imageBuffer: Buffer,
        ent: TelegramBot.MessageEntity,
        url: string,
        imgUrl?: string | PhotoData.PixivIllustStructure,
    ) {
        return jimp.read(imageBuffer)
            .then(async (image) => {
                if (image !== undefined) {
                    logger.info(CONSTS.IMAGE_FROM_URL_DIMENSION(image.getMIME(), image.bitmap.width, image.bitmap.height));
                    // send image which downloaded back to the chat for placehold a file_id
                    await this.uploadPhoto(msg, imageBuffer, ent, url, imgUrl);
                } else {
                    // jimp can not decode as an image, we must send a message to notify the URL is not an image
                    await this.bot.sendMessage(msg.chat.id,
                                               CONSTS.URL_REQUESTED_IS_NOT_A_IMAGE(url),
                                               { reply_to_message_id: msg.message_id });
                }
            })
            .catch((err: Error) => {
                logger.error("jimp error", err.message);
            });
    }

    /**
     * Check the content Size for pre-process action
     * @param url The Request URL which need to check size
     */
    private async sizeLimitationCheck(url: string) {
        return new Promise<boolean>((resolve, reject) => {
            logger.info(CONSTS.URL_SIZE_CHECK(url));
            request.head(url, this.requestOptions, async (error, response, body) => {
                const headers = response.headers;
                let length = -1;
                let mime = "";
                if (headers["content-length"]) {
                    length = Number(headers["content-length"]);
                }
                if (headers["content-type"]) {
                    mime = headers["content-type"]!;
                }
                const isHTML = mime.match(/html/i) !== null;
                const isAcceptedMime = mime.match(/^image/i) !== null || isHTML;
                const isOutOfSizeBound = length !== -1 && length > this.config.downloadMaxSize;
                if (isAcceptedMime) {
                    if (isHTML) {
                        logger.info(CONSTS.URL_HTML_IGNORE(url));
                        resolve();
                    } else {
                        if (isOutOfSizeBound) {
                            logger.warn(CONSTS.URL_SIZE_OUT_OF_BOUND(url, length, this.config.downloadMaxSize));
                            reject();
                        } else {
                            logger.info(CONSTS.URL_SIZE_RESULT(url, length));
                            resolve();
                        }
                    }
                } else {
                    // always reject for non image or web page
                    logger.warn(CONSTS.URL_CONTENT_TYPE_NOT_ACCEPTED(url, mime));
                    reject();
                }
            });
        }).then(() => true).catch(() => false);
    }

    /**
     * Convert to Reverse Proxy URL for Pixiv Images
     * @param oUrl Original Image URL
     */
    private processPixivUrl(oUrl: string) {
        const pUrl = (typeof oUrl === "string" ? oUrl : "").replace(CONSTS.REGEXP_MATCH_PIXIV_IMAGE_DOMAIN, `$1${this.config.pixiv.reverseProxyDomain}$2`);
        logger.info(CONSTS.PIXIV_URL_REVERSED_PROXY(oUrl, pUrl));
        return pUrl;
    }

    /**
     * Get Pixiv Illust Detail infomations
     * @param illustId Pixiv Illust ID
     * @param options Pixiv API Options
     */
    private async getPixivIllustDetail(illustId: number, options: any = {}): Promise<PhotoData.PixivIllustStructure> {
        return this.pixiv.illustDetail(illustId, options)
            .catch((e: any) => logger.error(e))
            .then(({ illust }: any) => {
                const oUrl = illust.meta_single_page.original_image_url ? [this.processPixivUrl(illust.meta_single_page.original_image_url)] :
                    illust.meta_pages.map((mp: any) => this.processPixivUrl(mp.image_urls.original));
                const smUrl = illust.meta_single_page.original_image_url ? [this.processPixivUrl(illust.image_urls.square_medium)] :
                    illust.meta_pages.map((mp: any) => this.processPixivUrl(mp.image_urls.square_medium));
                const rfUrl = CONSTS.PIXIV_ILLUST_IID_URL(illustId);
                const tags = illust.tags.map((t: any) => `#${t.name}`);
                const caption = htmlToText.fromString(illust.caption); // europa.convert(illust.caption);
                const illustObj = new PhotoData.PixivIllustStructure(
                    illustId,
                    illust.title,
                    caption,
                    illust.user.name,
                    tags,
                    oUrl,
                    smUrl,
                    rfUrl,
                );
                logger.info(CONSTS.PIXIV_ILLUST_DETAIL(illustObj));
                return illustObj;
            });
    }

    /**
     * Pre-Process URL for some Open Graph supported sites
     * @param msg Message Object
     * @param url Requested URL queue
     */
    private async preProcessUrl(msg: TelegramBot.Message, url: string) {
        return new Promise<string | Buffer | PhotoData.PixivIllustStructure>(async (resolve, reject) => {
            logger.info(CONSTS.URL_PREPARE_TO_DOWNLOAD(msg, url));
            const checkSizeOk = await this.sizeLimitationCheck(url);
            if (checkSizeOk) {
                if (url.match(CONSTS.REGEXP_MATCH_PIXIV_DOMAIN) !== null) {
                    const pixivInfo = Array.from(url.match(CONSTS.REGEXP_MATCH_PIXIV_ILLUST_ID)!).filter((m) => m);
                    if (this.pixiv !== null && pixivInfo.length > 0) {
                        const iid = Number(pixivInfo.pop());
                        await this.getPixivIllustDetail(iid).then((illustObj) => { resolve(illustObj); return illustObj; });
                    } else {
                        reject(url);
                    }
                } else if (url.match(CONSTS.REGEXP_MATCH_HENTAI_DOMAIN) !== null) {
                    logger.info(CONSTS.NOT_SUPPORT_FOR_HENTAI(url));
                    await this.bot.sendMessage(msg.chat.id, CONSTS.NOT_SUPPORT_FOR_HENTAI_MSG(url), { reply_to_message_id: msg.message_id });
                    reject(Buffer.from([]));
                } else {
                    request.get(url, this.requestOptions, async (error, response, body) => {
                        ogs({ url }, async (err: boolean, results: any) => {
                            if (!err && results.success === true &&
                                results.data && results.data.ogImage && results.data.ogImage.url
                            ) {
                                const ogUrl = results.data.ogImage.url;
                                logger.info(CONSTS.URL_FOUND_OG_IMAGE_URL(msg, url, ogUrl));
                                const ogCheckSizeOk = await this.sizeLimitationCheck(ogUrl);
                                if (ogCheckSizeOk) {
                                    resolve(ogUrl);
                                } else {
                                    reject(Buffer.from([]));
                                }
                            } else {
                                logger.info(CONSTS.URL_NOT_FOUND_OG_IMAGE_URL(msg, url));
                                if (response.body.length > 0) {
                                    resolve(Buffer.from(response.body));
                                } else {
                                    reject(Buffer.from([]));
                                }
                            }
                        });
                    });
                }
            } else {
                reject(Buffer.from([]));
            }
        }).catch((_url: string | Buffer) => _url);
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
                        await this.parsePhoto(msg, Buffer.from(response.body), ent, url, imgUrl instanceof Buffer ? undefined : imgUrl);
                        resolve();
                    } else {
                        // notify the URL not responsed correctly
                        await this.bot.sendMessage(msg.chat.id,
                                                   CONSTS.URL_REQUESTED_IS_NOT_OK(url),
                                                   { reply_to_message_id: msg.message_id });
                        reject();
                    }
                };
                if (isBuffer) {
                    await this.parsePhoto(msg, imgUrl as Buffer, ent, url);
                    resolve();
                    return;
                } else if (isPixiv) {
                    const illust = imgUrl as PhotoData.PixivIllustStructure;
                    return request.get(illust.originalUrl[0], this.requestOptions, downloadImage);
                } else {
                    return request.get(imgUrl as string, this.requestOptions, downloadImage);
                }
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
