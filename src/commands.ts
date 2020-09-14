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
        getData: (chatId: number) => PhotoData.PhotoDataStructure,
        bot: TelegramBot,
        msg: TelegramBot.Message,
    ) {
        const chatId = msg.chat.id;
        const chatData = getData(chatId);

        chatData.paused = true;
        logger.info(CONSTS.PAUSE_RESUME_LOG_MESSAGE(msg.chat, chatData));
        return bot.sendMessage(chatId, CONSTS.PAUSE_RESUME_MESSAGE(msg.chat, chatData));
    }

    /**
     * Commands of SET_RESUMED method
     * @param msg Message Object
     */
    public static async _COMMANDS_SET_RESUMED(
        getData: (chatId: number) => PhotoData.PhotoDataStructure,
        bot: TelegramBot,
        msg: TelegramBot.Message,
    ) {
        const chatId = msg.chat.id;
        const chatData = getData(chatId);

        chatData.paused = false;
        logger.info(CONSTS.PAUSE_RESUME_LOG_MESSAGE(msg.chat, chatData));
        return bot.sendMessage(chatId, CONSTS.PAUSE_RESUME_MESSAGE(msg.chat, chatData));
    }

    /**
     * Commands of SET_INTERVAL method
     * @param msg Message Object
     */
    public static async _COMMANDS_SET_INTERVAL(
        getData: (chatId: number) => PhotoData.PhotoDataStructure,
        bot: TelegramBot,
        config: BotConfig,
        msg: TelegramBot.Message,
        commandArgs: string[],
    ) {
        const chatId = msg.chat.id;
        const chatData = getData(chatId);

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
        getData: (chatId: number) => PhotoData.PhotoDataStructure,
        nextPhoto: (chatData: PhotoData.PhotoDataStructure) => void,
        msg: TelegramBot.Message,
    ) {
        const chatId = msg.chat.id;
        const chatData = getData(chatId);

        return nextPhoto(chatData);
    }

    /**
     * Commands of BAN method
     * @param msg Message Object
     */
    public static async _COMMANDS_BAN(
        delPhoto: (msg: TelegramBot.Message, ban?: boolean | undefined) => void,
        msg: TelegramBot.Message,
    ) {
        return delPhoto(msg, true);
    }

    /**
     * Commands of UNBAN method
     * @param msg Message Object
     */
    public static async _COMMANDS_UNBAN(
        unbanPhoto: (msg: TelegramBot.Message) => void,
        msg: TelegramBot.Message,
    ) {
        if (msg.reply_to_message && (msg.reply_to_message.photo || msg.reply_to_message.document)) {
            return unbanPhoto(msg);
        }
    }

    /**
     * Commands of DELETE method
     * @param msg Message Object
     */
    public static async _COMMANDS_DELETE(
        delPhoto: (msg: TelegramBot.Message, ban?: boolean | undefined) => void,
        msg: TelegramBot.Message,
    ) {
        return delPhoto(msg);
    }

    /**
     * Commands of QUEUE_STATUS method
     * @param msg Message Object
     */
    public static async _COMMANDS_QUEUE_STATUS(
        getData: (chatId: number) => PhotoData.PhotoDataStructure,
        bot: TelegramBot,
        msg: TelegramBot.Message,
    ) {
        const chatId = msg.chat.id;
        const chatData = getData(chatId);

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
