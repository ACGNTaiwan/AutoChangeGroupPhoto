/**
 * @license
 * Copyright 2017
 */

import * as fs from "fs";
import * as yaml from "js-yaml";
import * as moment from "moment";
import * as schedule from "node-schedule";
import * as TelegramBot from "node-telegram-bot-api";
import * as request from "request";
import {
    ADDED_INTO_QUEUE,
    ALREADY_IN_QUEUE,
    CAN_NOT_CHANGE_ALL_ADMINS_PHOTO,
    CAN_NOT_CHANGE_PHOTO,
    CONFIG_FILE_PATH,
    DATA_FILE_PATH,
    GROUP_PHOTO_CAPTION,
    INVALID_VALUE,
    NEED_TELEGRAM_BOT_TOKEN,
    NOW_INTERVAL,
    QUEUE_TEXT,
    REGEXP_MATCH_TAG_COMMAND,
    SET_INTERVAL,
    WAITING_PHOTOS,
} from "./consts";
import { PhotoDataStrcture } from "./PhotoDataStrcture";

let data: PhotoDataStrcture[];

moment.locale("zh-tw");

const saveData = () => fs.writeFile(DATA_FILE_PATH, yaml.safeDump(data));

const getData = (chatId: number): PhotoDataStrcture => {
    const chatData = data.filter((d) => d.chatId === chatId).shift();
    if (chatData instanceof PhotoDataStrcture) {
        return chatData;
    } else {
        const d = new PhotoDataStrcture(chatId);
        data.push(d);
        saveData();
        return d;
    }
};

const main = async (bot: TelegramBot) => {
    const checkQueue = (msg: TelegramBot.Message) => {
        const chatId = msg.chat.id;
        let fileId;

        if (msg.chat.type === "private") {
            await bot.sendMessage(chatId, CAN_NOT_CHANGE_PHOTO);
            return CAN_NOT_CHANGE_PHOTO;
        } else if (msg.chat.type === "group" && msg.chat.all_members_are_administrators) {
            await bot.sendMessage(chatId, CAN_NOT_CHANGE_ALL_ADMINS_PHOTO);
            return CAN_NOT_CHANGE_ALL_ADMINS_PHOTO;
        }

        if (msg.photo) {
            fileId = msg.photo.pop().file_id;
        } else if (msg.document && msg.document.thumb) {
            fileId = msg.document.file_id;
        }

        initData(chatId);
        let result = null;
        if (getData(chatId).queue.indexOf(fileId) === -1) {
            getData(chatId).queue.push(fileId);
            result = ADDED_INTO_QUEUE;
        } else {
            result = ALREADY_IN_QUEUE;
        }
        return result;
    };
    const addPhoto = (msg: TelegramBot.Message) => {
        const chatId = msg.chat.id;
        const result = checkQueue(msg);
        if (result !== undefined) {
            await bot.sendMessage(chatId, result, {reply_to_message_id: msg.message_id});
            saveData();
        }
        return result;
    };

    const doUpdate = () => {
        data.map((chatData) => {
            if (chatData.queue.length > 0 &&
                (!chatData.last || moment(chatData.last).add(chatData.interval, "h").isBefore(moment()))
            ) {
                await bot.getFileLink(chatData.queue.shift())
                    .then(async (link: string) => bot.setChatPhoto(chatData.chatId, request(link)));
                chatData.last = +moment();
                saveData();
            }
        });
    };

    schedule.scheduleJob("0 * * * * *", doUpdate);

    await bot.getMe().then((me) => {
        if (me instanceof Error) {
            return;
        }

        bot.onText(/^\/(\w+)@?(\w*)/i, (msg, regex) => {
            if (regex) {
                if (regex[2] && regex[2] !== me.username) {
                    return;
                }

                const chatId = msg.chat.id;
                const chatData = getData(chatId);

                await bot.getChatAdministrators(chatId).then((members) => {
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
                                    await bot.sendMessage(chatId, NOW_INTERVAL(chatData.interval.toString()));
                                    break;
                                }
                                if (args.length > 0 && Number(args) >= 0.5) {
                                    chatData.interval = Number(args);
                                    await bot.sendMessage(chatId, SET_INTERVAL(chatData.interval.toString()));
                                    saveData();
                                } else {
                                    await bot.sendMessage(chatId, INVALID_VALUE);
                                }
                            }
                            break;
                        case "next":
                            if (msg.from) {
                                if (members.map((member) => member.user.id).indexOf(msg.from.id) === -1) {
                                    break;
                                }
                            }
                            if (chatData.queue.length > 0) {
                                await bot.getFileLink(chatData.queue.shift())
                                    .then(
                                        async (link) =>
                                        link instanceof Error ? Promise.resolve(true) : bot.setChatPhoto(chatId, request(link)),
                                    );
                                chatData.last = +moment();
                                saveData();
                            }
                            break;
                        // TODO
                        // case 'setloop':
                        //     if (members.map((member) => member.user.id).indexOf(msg.from.id) === -1) break;
                        //     if (msg.text.split(' ').length === 1) bot.sendMessage(chatId, '目前')
                        // case 'block':
                        //     if (members.map((member) => member.user.id).indexOf(msg.from.id) === -1) break;
                        case "queue":
                            await bot.sendMessage(chatId,
                                                  WAITING_PHOTOS(chatData.queue.length,
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

        bot.onText(REGEXP_MATCH_TAG_COMMAND, (msg) => {
            if (msg.reply_to_message && (msg.reply_to_message.photo || msg.reply_to_message.document)) {
                console.info(QUEUE_TEXT("Text", `${msg.chat.title}(${msg.chat.id})`));
                addPhoto(msg.reply_to_message);
            }
        });

        bot.on("photo", (msg: TelegramBot.Message) => {
            if (msg.caption && msg.caption.match(REGEXP_MATCH_TAG_COMMAND)) {
                console.info(QUEUE_TEXT("Photo", `${msg.chat.title}(${msg.chat.id})`));
                addPhoto(msg);
            }
        });

        bot.on("document", (msg: TelegramBot.Message) => {
            if (msg.caption && msg.caption.match(REGEXP_MATCH_TAG_COMMAND)) {
                console.info(QUEUE_TEXT("Document", `${msg.chat.title}(${msg.chat.id})`));
                addPhoto(msg);
            }
        });
    });
};

// read site data which contains chat's photo list data
const readData = (_config: any) =>
    fs.readFile(DATA_FILE_PATH, null, (err, d) => {
        try {
            data = yaml.load(d.toString());
        } catch (e) {
            data = [];
        }
        if (_config.token) {
            // if has bot token, then start the main program
            const bot = new TelegramBot(_config.token, {polling: {interval: 0, params: {timeout: 60}}});
            await main(bot);
        } else {
            throw Error(NEED_TELEGRAM_BOT_TOKEN);
        }
    });

// read and initial the config file
fs.readFile(CONFIG_FILE_PATH, null, (err, d) => {
    let config;
    try {
        config = yaml.load(d.toString());
    } catch (e) {
        config = {};
    } finally {
        readData(config);
    }
});
