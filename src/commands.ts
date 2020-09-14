import * as moment from "moment";
import * as TelegramBot from "node-telegram-bot-api";

import { BotConfig } from "./botConfig";
import * as CONSTS from "./consts";
import * as PhotoData from "./photoData";

const tracer = require("tracer");
const logger = tracer.colorConsole({ level: process.env.DEBUG !== undefined ? process.env.DEBUG : "info" });

class Commands {
    /**
     * Commands of SET_PAUSED method
     * @param msg Message Object
     */
    public static async _COMMANDS_SET_PAUSED(
        getData: (data: PhotoData.PhotoDataStructure[], chatId: number) => PhotoData.PhotoDataStructure,
        data: PhotoData.PhotoDataStructure[],
        bot: TelegramBot,
        msg: TelegramBot.Message,
    ) {
        const chatId = msg.chat.id;
        const chatData = getData(data, chatId);

        chatData.paused = true;
        logger.info(CONSTS.PAUSE_RESUME_LOG_MESSAGE(msg.chat, chatData));
        return bot.sendMessage(chatId, CONSTS.PAUSE_RESUME_MESSAGE(msg.chat, chatData));
    }

    /**
     * Commands of SET_RESUMED method
     * @param msg Message Object
     */
    public static async _COMMANDS_SET_RESUMED(
        getData: (data: PhotoData.PhotoDataStructure[], chatId: number) => PhotoData.PhotoDataStructure,
        data: PhotoData.PhotoDataStructure[],
        bot: TelegramBot,
        msg: TelegramBot.Message,
    ) {
        const chatId = msg.chat.id;
        const chatData = getData(data, chatId);

        chatData.paused = false;
        logger.info(CONSTS.PAUSE_RESUME_LOG_MESSAGE(msg.chat, chatData));
        return bot.sendMessage(chatId, CONSTS.PAUSE_RESUME_MESSAGE(msg.chat, chatData));
    }

    /**
     * Commands of SET_INTERVAL method
     * @param msg Message Object
     */
    public static async _COMMANDS_SET_INTERVAL(
        getData: (data: PhotoData.PhotoDataStructure[], chatId: number) => PhotoData.PhotoDataStructure,
        data: PhotoData.PhotoDataStructure[],
        bot: TelegramBot,
        config: BotConfig,
        msg: TelegramBot.Message,
        commandArgs: string[],
    ) {
        const chatId = msg.chat.id;
        const chatData = getData(data, chatId);

        if (msg.text) {
            const args = commandArgs.join(" ");
            if (args.length === 0) {
                return bot.sendMessage(chatId, CONSTS.NOW_INTERVAL(chatData.interval.toString()));
            }
            if (args.length > 0 && Number(args) >= config.minBotInterval) {
                chatData.interval = Number(args);
                return bot.sendMessage(chatId, CONSTS.SET_INTERVAL(chatData.interval.toString()));
                // tslint:disable-next-line:unnecessary-else
            } else {
                return bot.sendMessage(chatId, CONSTS.INVALID_VALUE);
            }
        }
    }

    /**
     * Commands of NEXT_PHOTO method
     * @param msg Message Object
     */
    public static async _COMMANDS_NEXT_PHOTO(
        getData: (data: PhotoData.PhotoDataStructure[], chatId: number) => PhotoData.PhotoDataStructure,
        data: PhotoData.PhotoDataStructure[],
        bot: TelegramBot,
        msg: TelegramBot.Message,
    ) {
        const chatId = msg.chat.id;
        const chatData = getData(data, chatId);

        return chatData.nextPhoto(bot);
    }

    /**
     * Commands of BAN method
     * @param msg Message Object
     */
    public static async _COMMANDS_BAN(
        delPhoto: (data: PhotoData.PhotoDataStructure[], bot: TelegramBot, msg: TelegramBot.Message, ban?: boolean | undefined) => void,
        data: PhotoData.PhotoDataStructure[],
        bot: TelegramBot,
        msg: TelegramBot.Message,
    ) {
        return delPhoto(data, bot, msg, true);
    }

    /**
     * Commands of UNBAN method
     * @param msg Message Object
     */
    public static async _COMMANDS_UNBAN(
        unbanPhoto: (data: PhotoData.PhotoDataStructure[], msg: TelegramBot.Message) => void,
        data: PhotoData.PhotoDataStructure[],
        msg: TelegramBot.Message,
    ) {
        if (msg.reply_to_message && (msg.reply_to_message.photo || msg.reply_to_message.document)) {
            return unbanPhoto(data, msg);
        }
    }

    /**
     * Commands of DELETE method
     * @param msg Message Object
     */
    public static async _COMMANDS_DELETE(
        delPhoto: (data: PhotoData.PhotoDataStructure[], bot: TelegramBot, msg: TelegramBot.Message, ban?: boolean | undefined) => void,
        data: PhotoData.PhotoDataStructure[],
        bot: TelegramBot,
        msg: TelegramBot.Message,
    ) {
        return delPhoto(data, bot, msg);
    }

    /**
     * Commands of QUEUE_STATUS method
     * @param msg Message Object
     */
    public static async _COMMANDS_QUEUE_STATUS(
        getData: (data: PhotoData.PhotoDataStructure[], chatId: number) => PhotoData.PhotoDataStructure,
        data: PhotoData.PhotoDataStructure[],
        bot: TelegramBot,
        msg: TelegramBot.Message,
    ) {
        const chatId = msg.chat.id;
        const chatData = getData(data, chatId);

        const nextTime = moment(chatData.last)
            .add(chatData.interval, "h")
            .format("LLL");
        return bot.sendMessage(chatId, CONSTS.WAITING_PHOTOS(chatData, nextTime));
    }

    // no used
    public constructor() {
        this.init();
    }

    // no used
    public init() {
        logger.DEBUG("Commands initialized");
    }
}

export { Commands };
