import * as htmlToText from "html-to-text";
import * as jimp from "jimp";
import * as TelegramBot from "node-telegram-bot-api";
import * as request from "request";

import { BotConfig } from "./botConfig";
import * as CONSTS from "./consts";
import * as PhotoData from "./photoData";
import { TelegramDownload } from "./telegramDownload";

const ogs = require("open-graph-scraper");

const tracer = require("tracer");
const logger = tracer.colorConsole({ level: process.env.DEBUG !== undefined ? process.env.DEBUG : "info" });

export class Utils {
    public static readonly requestOptions = {
        encoding: null,
        followRedirect: false,
    };

    /**
     * Pre-Process URL for some Open Graph supported sites
     * @param pixiv PixivApi instance
     * @param config Bot Config
     * @param bot Telegram Bot Instance
     * @param msg Message Object
     * @param url Requested URL queue
     */
    public static async preProcessUrl(pixiv: any, config: BotConfig, bot: TelegramBot, msg: TelegramBot.Message, url: string) {
        return new Promise<string | Buffer | PhotoData.PixivIllustStructure>(async (resolve, reject) => {
            logger.info(CONSTS.URL_PREPARE_TO_DOWNLOAD(msg, url));
            const checkSizeOk = await Utils.sizeLimitationCheck(config, url);
            if (checkSizeOk) {
                if (url.match(CONSTS.REGEXP_MATCH_PIXIV_DOMAIN) !== null) {
                    const pixivInfo = Array.from(url.match(CONSTS.REGEXP_MATCH_PIXIV_ILLUST_ID)!)
                        .filter((m) => m);
                    if (pixiv !== null && pixivInfo.length > 0) {
                        const iid = Number(pixivInfo.pop());
                        await Utils.getPixivIllustDetail(pixiv, config, iid)
                            .then((illustObj) => { resolve(illustObj); return illustObj; });
                    } else {
                        reject(url);
                    }
                } else if (url.match(CONSTS.REGEXP_MATCH_HENTAI_DOMAIN) !== null) {
                    logger.info(CONSTS.NOT_SUPPORT_FOR_HENTAI(url));
                    await bot.sendMessage(msg.chat.id, CONSTS.NOT_SUPPORT_FOR_HENTAI_MSG(url), { reply_to_message_id: msg.message_id });
                    reject(Buffer.from([]));
                } else {
                    request.get(url, Utils.requestOptions, async (error, response, body) => {
                        ogs(
                            {
                                headers: {
                                    "user-agent": "Mozilla/5.0 (compatible; AutoChangeGroupPhotoBot/0.1; +https://github.com/ACGNTaiwan/AutoChangeGroupPhoto)",
                                },
                                url,
                            },
                            async (err: boolean, results: any) => {
                                if (!err && results.success === true &&
                                    results.ogImage && results.ogImage.url
                                ) {
                                    const ogUrl = results.ogImage.url;
                                    logger.info(CONSTS.URL_FOUND_OG_IMAGE_URL(msg, url, ogUrl));
                                    const ogCheckSizeOk = await Utils.sizeLimitationCheck(config, ogUrl);
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
                            },
                        ).catch((e: any) => {
                            logger.info(CONSTS.URL_NOT_FOUND_OG_IMAGE_URL(msg, url));
                            if (response.body.length > 0) {
                                resolve(Buffer.from(response.body));
                            } else {
                                reject(Buffer.from([]));
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
     * Check the content Size for pre-process action
     * @param config Bot Config
     * @param url The Request URL which need to check size
     */
    public static async sizeLimitationCheck(config: BotConfig, url: string) {
        return new Promise<boolean>((resolve, reject) => {
            logger.info(CONSTS.URL_SIZE_CHECK(url));
            request.head(url, Utils.requestOptions, async (error, response, body) => {
                const headers = response.headers;
                let length = -1;
                let mime = "";
                if (headers["content-length"]) {
                    length = Number(headers["content-length"]);
                }
                if (headers["content-type"]) {
                    mime = headers["content-type"];
                }
                const isHTML = mime.match(/html/i) !== null;
                const isAcceptedMime = mime.match(/^image/i) !== null || isHTML;
                const isOutOfSizeBound = length !== -1 && length > config.downloadMaxSize;
                if (isAcceptedMime) {
                    if (isHTML) {
                        logger.info(CONSTS.URL_HTML_IGNORE(url));
                        resolve(true);
                    } else {
                        if (isOutOfSizeBound) {
                            logger.warn(CONSTS.URL_SIZE_OUT_OF_BOUND(url, length, config.downloadMaxSize));
                            reject();
                        } else {
                            logger.info(CONSTS.URL_SIZE_RESULT(url, length));
                            resolve(true);
                        }
                    }
                } else {
                    // always reject for non image or web page
                    logger.warn(CONSTS.URL_CONTENT_TYPE_NOT_ACCEPTED(url, mime));
                    reject();
                }
            });
        })
            .then(() => true)
            .catch(() => false);
    }

    /**
     * Send Queue Result back to Chat
     * @param bot Telegram Bot Instance
     * @param msg Message Object
     * @param result Queue result string
     * @param entity Message Entity
     * @param url Requested URL queue
     */
    public static async sendQueueResult(
        bot: TelegramBot,
        msg: TelegramBot.Message,
        result: string,
    ) {
        switch (result) {
            case CONSTS.ADDED_INTO_QUEUE:
                await bot.sendMessage(msg.chat.id, result, { reply_to_message_id: msg.message_id });
                break;
            case CONSTS.ALREADY_IN_QUEUE:
                await bot.sendMessage(msg.chat.id, CONSTS.ALREADY_IN_QUEUE, { reply_to_message_id: msg.message_id });
                break;
            case CONSTS.BANNED_PHOTO:
                await bot.sendMessage(msg.chat.id, result, { reply_to_message_id: msg.message_id });
                break;
            case CONSTS.UNSUPPORTED_FILE_EXTENSIONS(msg.document!.file_name!):
                await bot.sendMessage(msg.chat.id, result, { reply_to_message_id: msg.message_id, parse_mode: "Markdown" });
                break;
            default:
                // unspecified response, always delete the message we sent
                await bot.deleteMessage(msg.chat.id, msg.message_id.toString());
        }
    }

    /**
     * Check and Add into the Queue
     * @param bot Telegram Bot Instance
     * @param msg Message Object
     */
    public static async checkQueue(
        bot: TelegramBot,
        data: PhotoData.PhotoDataStructure[],
        downloader: TelegramDownload,
        msg: TelegramBot.Message,
    ) {
        const chatId = msg.chat.id;
        let fileId: string;

        if (msg.chat.type === "private") {
            await bot.sendMessage(chatId, CONSTS.CAN_NOT_CHANGE_PHOTO);
            return CONSTS.CAN_NOT_CHANGE_PHOTO;
            // tslint:disable-next-line:unnecessary-else deprecation
        } else if (msg.chat.type === "group" && msg.chat.all_members_are_administrators) {
            await bot.sendMessage(chatId, CONSTS.CAN_NOT_CHANGE_ALL_ADMINS_PHOTO);
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
            fileId = (msg.sticker) ? msg.sticker.file_id : "";
        }

        const chatData = PhotoData.PhotoDataStructure.getData(data, chatId);
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
        downloader.checkGroup(chatData);
        return result;
    }

    /**
     * Try to parse the downloaded Photo, then add into the queue
     * @param uploadPhoto Upload Photo callback
     * @param bot Telegram Bot Instance
     * @param msg Message Object
     * @param imageBuffer Image Buffer Object
     * @param ent Message Entity
     * @param url Requested URL queue
     * @param imgUrl URL or Pixiv Structure
     */
    public static async parsePhoto(
        uploadPhoto: (
            data: PhotoData.PhotoDataStructure[],
            bot: TelegramBot,
            downloader: TelegramDownload,
            msg: TelegramBot.Message,
            imageBuffer: Buffer,
            ent: TelegramBot.MessageEntity,
            url: string,
            imgUrl?: string | PhotoData.PixivIllustStructure,
        ) => Promise<void>,
        data: PhotoData.PhotoDataStructure[],
        bot: TelegramBot,
        downloader: TelegramDownload,
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
                    // send image which downloaded back to the chat for placeholder a file_id
                    await uploadPhoto(data, bot, downloader, msg, imageBuffer, ent, url, imgUrl);
                } else {
                    // jimp can not decode as an image, we must send a message to notify the URL is not an image
                    await bot.sendMessage(msg.chat.id,
                                          CONSTS.URL_REQUESTED_IS_NOT_A_IMAGE(url),
                                          { reply_to_message_id: msg.message_id });
                }
            })
            .catch((err: Error) => {
                logger.error("jimp error", err.message);
            });
    }

    /**
     * Register for Pixiv API instance
     * @param pixiv PixivApi instance
     * @param config Bot Config
     */
    public static registerPixiv(pixiv: any, config: BotConfig) {
        if (pixiv !== null) {
            const pixivLogged = (userInfo: any) => {
                config.pixiv.refreshToken = userInfo.refresh_token;
                logger.info(CONSTS.ENABLED_PIXIV_ACCOUNT(config.pixiv.account, config.pixiv.refreshToken));
            };
            const pixivLoginError = (e: any) => {
                logger.error(e);
            };
            if (config.pixiv.refreshToken === "") {
                logger.info(CONSTS.ENABLING_PIXIV_ACCOUNT(config.pixiv.account));
//		pixiv.tokenRequest(config.pixiv.account, config.pixiv.password)
                pixiv.login(config.pixiv.account, config.pixiv.password)
                    .then(pixivLogged)
                    .catch(pixivLoginError);
            } else {
                logger.info(CONSTS.ENABLING_REFRESHED_PIXIV_ACCOUNT(config.pixiv.account, config.pixiv.refreshToken));
                pixiv.refreshAccessToken(config.pixiv.refreshToken)
                    .then(pixivLogged)
                    .catch(pixivLoginError);
            }
            setInterval(() => pixiv.refreshAccessToken(), 60 * 1000 * 60);
        }
    }

    /**
     * Convert to Reverse Proxy URL for Pixiv Images
     * @param config Bot Config
     * @param oUrl Original Image URL
     */
    public static processPixivUrl(config: BotConfig, oUrl: string) {
        const pUrl = (typeof oUrl === "string" ? oUrl : "").replace(CONSTS.REGEXP_MATCH_PIXIV_IMAGE_DOMAIN, `$1${config.pixiv.reverseProxyDomain}$2`);
        logger.info(CONSTS.PIXIV_URL_REVERSED_PROXY(oUrl, pUrl));
        return pUrl;
    }

    /**
     * Get Pixiv Illust Detail informations
     * @param pixiv PixivApi instance
     * @param config Bot Config
     * @param illustId Pixiv Illust ID
     * @param options Pixiv API Options
     */
    public static async getPixivIllustDetail(pixiv: any, config: BotConfig, illustId: number, options: any = {}): Promise<PhotoData.PixivIllustStructure> {
        return pixiv.illustDetail(illustId, options)
            .catch((e: any) => logger.error(e))
            .then(({ illust }: any) => {
                const oUrl = illust.meta_single_page.original_image_url ? [Utils.processPixivUrl(config, illust.meta_single_page.original_image_url)] :
                    illust.meta_pages.map((mp: any) => Utils.processPixivUrl(config, mp.image_urls.original));
                const smUrl = illust.meta_single_page.original_image_url ? [Utils.processPixivUrl(config, illust.image_urls.square_medium)] :
                    illust.meta_pages.map((mp: any) => Utils.processPixivUrl(config, mp.image_urls.square_medium));
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

    // no used
    public constructor() {
        this.init();
    }

    // no used
    public init() {
        logger.DEBUG("utils initialized");
    }
}
