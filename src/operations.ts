import * as TelegramBot from "node-telegram-bot-api";

import { BotConfig } from "./botConfig";
import { Commands } from "./commands";
import * as CONSTS from "./consts";
import * as PhotoData from "./photoData";
import { TelegramDownload } from "./telegramDownload";
import { Utils } from "./utils";

const tracer = require("tracer");
const logger = tracer.colorConsole({ level: process.env.DEBUG !== undefined ? process.env.DEBUG : "info" });

class Operations {
    /**
     * Parse Text Command from chat
     * @param data Array of PhotoDataStructure
     * @param bot Telegram Bot Instance
     * @param config Bot Config
     * @param members Telegram Chat Members
     * @param msg Message Object
     * @param command Command
     * @param commandArgs Command Arguments
     */
    public static async parseCommand(
        data: PhotoData.PhotoDataStructure[],
        bot: TelegramBot,
        config: BotConfig,
        members: TelegramBot.ChatMember[] | Error,
        msg: TelegramBot.Message,
        command: CONSTS.COMMANDS,
        commandArgs: string[],
    ) {
        if (members instanceof Error) {
            return;
        }
        if (CONSTS.COMMANDS_ADMINS_ONLY.indexOf(command) !== -1) {
            if (msg.from) {
                if (members.map((member) => member.user.id)
                    .indexOf(msg.from.id) === -1) {
                    return;
                }
            }
        }

        switch (command) {
            case CONSTS.COMMANDS.SET_PAUSED:
                await Commands._COMMANDS_SET_PAUSED(PhotoData.PhotoDataStructure.getData, data, bot, msg);
                break;
            case CONSTS.COMMANDS.SET_RESUMED:
                await Commands._COMMANDS_SET_RESUMED(PhotoData.PhotoDataStructure.getData, data, bot, msg);
                break;
            case CONSTS.COMMANDS.SET_INTERVAL:
                await Commands._COMMANDS_SET_INTERVAL(PhotoData.PhotoDataStructure.getData, data, bot, config, msg, commandArgs);
                break;
            case CONSTS.COMMANDS.NEXT_PHOTO:
                await Commands._COMMANDS_NEXT_PHOTO(PhotoData.PhotoDataStructure.getData, data, bot, msg);
                break;
            case CONSTS.COMMANDS.DELETE:
                await Commands._COMMANDS_DELETE(Operations.delPhoto, data, bot, msg);
                break;
            case CONSTS.COMMANDS.BAN:
                await Commands._COMMANDS_BAN(Operations.delPhoto, data, bot, msg);
                break;
            case CONSTS.COMMANDS.UNBAN:
                await Commands._COMMANDS_UNBAN(Operations.unbanPhoto, data, msg);
                break;
            // TODO
            // case 'setloop':
            //     if (members.map((member) => member.user.id).indexOf(msg.from.id) === -1) break;
            //     if (msg.text.split(' ').length === 1) bot.sendMessage(chatId, '目前')
            // case 'block':
            //     if (members.map((member) => member.user.id).indexOf(msg.from.id) === -1) break;
            case CONSTS.COMMANDS.QUEUE_STATUS:
                await Commands._COMMANDS_QUEUE_STATUS(PhotoData.PhotoDataStructure.getData, data, bot, msg);
                break;
            // TODO
            // case 'votenext':
            //     break;
            default:
            // no-op
        }
    }

    /**
     * Ban the photo
     * @param data Array of PhotoDataStructure
     * @param bot Telegram Bot Instance
     * @param msg Message Object
     * @param ban Ban Option
     */
    public static async delPhoto(
        data: PhotoData.PhotoDataStructure[],
        bot: TelegramBot,
        msg: TelegramBot.Message,
        ban = false,
    ) {
        const chatId = msg.chat.id;
        const chatData = PhotoData.PhotoDataStructure.getData(data, chatId);
        let fileIdList: string[];

        if (msg.reply_to_message) {
            fileIdList = (msg.reply_to_message.photo ? msg.reply_to_message.photo.map<string>((p) => p.file_id) : [])
                .concat(msg.reply_to_message.document ? [msg.reply_to_message.document.file_id] : []);
        } else {
            fileIdList = (chatData.history.length !== 0 ? [chatData.history[chatData.history.length - 1]] : []);
        }

        if (fileIdList.length === 0) { return; }

        if (ban) {
            fileIdList.map((p) => chatData.banList.indexOf(p) === -1 ? chatData.banList.push(p) : null);
            logger.info(CONSTS.BANNED_TEXT(chatId, fileIdList.join(", ")));
            await bot.sendMessage(chatId, CONSTS.BANNED_PHOTO, { reply_to_message_id: msg.message_id });
        } else {
            logger.info(CONSTS.DELETE_TEXT(chatId, fileIdList.join(", ")));
            await bot.sendMessage(chatId, CONSTS.DELETE_PHOTO, { reply_to_message_id: msg.message_id });
        }

        if (fileIdList.includes(chatData.history[chatData.history.length - 1])) {
            await chatData.nextPhoto(bot);
        }

        chatData.queue = chatData.queue.filter((q) => !fileIdList.includes(q));

        chatData.history = chatData.history.filter((q) => !fileIdList.includes(q));
    }

    /**
     * Unban the banned photo
     * @param data Array of PhotoDataStructure
     * @param msg Message Object
     */
    public static async unbanPhoto(data: PhotoData.PhotoDataStructure[], msg: TelegramBot.Message) {
        const chatId = msg.chat.id;
        const fileIdList = (msg.reply_to_message!.photo ? msg.reply_to_message!.photo.map<string>((p) => p.file_id) : [])
            .concat(msg.reply_to_message!.document ? [msg.reply_to_message!.document.file_id] : []);
        const chatData = PhotoData.PhotoDataStructure.getData(data, chatId);
        chatData.banList = chatData.banList
            .map<string>((b) => fileIdList.indexOf(b) !== -1 ? "" : b)
            .filter((b) => b);
        logger.info(CONSTS.UNBANNED_TEXT(chatId, fileIdList.join(", ")));
    }

    /**
     * Add Photo to Queue
     * @param data Array of PhotoDataStructure
     * @param bot Telegram Bot Instance
     * @param downloader Telegram Downloader
     * @param msg Message Object
     */
    public static async addPhoto(
        data: PhotoData.PhotoDataStructure[],
        bot: TelegramBot,
        downloader: TelegramDownload,
        msg: TelegramBot.Message,
    ) {
        const result = await Utils.checkQueue(bot, data, downloader, msg);
        if (result !== undefined && result.length > 0) {
            await Utils.sendQueueResult(bot, msg, result);
        }
        return result;
    }

    /**
     * Upload the Photo from URL back to Chat for acquire a file ID
     * @param data Array of PhotoDataStructure
     * @param bot Telegram Bot Instance
     * @param downloader Telegram Downloader
     * @param msg Message Object
     * @param imageBuffer Image Buffer Object
     * @param ent Message Entity
     * @param url Requested URL queue
     * @param imgUrl URL or Pixiv Structure
     */
    public static async uploadPhoto(
        data: PhotoData.PhotoDataStructure[],
        bot: TelegramBot,
        downloader: TelegramDownload,
        msg: TelegramBot.Message,
        imageBuffer: Buffer,
        ent: TelegramBot.MessageEntity,
        url: string,
        imgUrl?: string | PhotoData.PixivIllustStructure,
    ) {
        logger.info(CONSTS.UPLOADING_PHOTO(`${msg.chat.title}(${msg.chat.id})`, imageBuffer, url));
        const illust: PhotoData.PixivIllustStructure | null = imgUrl instanceof PhotoData.PixivIllustStructure ? imgUrl : null;
        const caption = (illust ? CONSTS.GROUP_PHOTO_PIXIV_CAPTION(illust) : CONSTS.GROUP_PHOTO_CAPTION);
        return Operations.sendPhotoPromise(data, bot, downloader, msg, imageBuffer, { caption });
    }

    public static async sendPhotoPromise(
        data: PhotoData.PhotoDataStructure[],
        bot: TelegramBot,
        downloader: TelegramDownload,
        msg: TelegramBot.Message,
        buffer: Buffer,
        options?: TelegramBot.SendPhotoOptions,
    ) {
        const opt = Object.apply({ reply_to_message_id: msg.message_id, disable_notification: true }, options as [any]) as TelegramBot.SendPhotoOptions;
        return bot.sendPhoto(msg.chat.id, buffer, opt, { filename: "queue.jpg", contentType: "image/jpeg" })
            .then(async (m) => {
                let ret;
                if (!(m instanceof Error)) {
                    ret = await Utils.sendQueueResult(bot, msg, await Utils.checkQueue(bot, data, downloader, m));
                    await bot.deleteMessage(m.chat.id, m.message_id.toString());
                }
                return ret;
            })
            .catch((e) => {
                logger.error(e);
            });
    }

    // no used
    public constructor() {
        this.init();
    }

    // no used
    public init() {
        logger.DEBUG("Operations initialized");
    }
}

export { Operations };
