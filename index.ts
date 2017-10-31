/**
 * @license
 * Copyright 2017
 */

import * as fs from "fs";
import * as jimp from "jimp";
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
    IMAGE_FROM_URL_DIMENSION,
    INVALID_VALUE,
    NEED_TELEGRAM_BOT_TOKEN,
    NOW_INTERVAL,
    QUEUE_REQUEST_TEXT,
    QUEUE_TEXT,
    REGEXP_MATCH_TAG_COMMAND,
    SET_INTERVAL,
    URL_REQUESTED_IS_NOT_A_IMAGE,
    URL_REQUESTED_IS_NOT_OK,
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

    const tryGetPhotoFromUrl = async (msg: TelegramBot.Message, ent: TelegramBot.MessageEntity, url: string) => {
        request.get(url, { encoding: null }, (error, response, body) => {
            if (error) {
                console.error(error);
            }
            if (response.statusCode === 200) {
                const buffer = Buffer.from(response.body);
                jimp.read(buffer)
                    .then((image) => {
                        if (image !== undefined) {
                            console.info(IMAGE_FROM_URL_DIMENSION(image.getMIME(), image.bitmap.width, image.bitmap.height));
                            // send image which downloaded back to the chat for placehold a file_id
                            bot.sendPhoto(msg.chat.id, buffer, {caption: GROUP_PHOTO_CAPTION})
                                .then((m) => {
                                    if (!(m instanceof Error)) {
                                        const result = checkQueue(m);
                                        switch (result) {
                                            case ADDED_INTO_QUEUE:
                                                addPhoto(m);
                                                break;
                                            case ALREADY_IN_QUEUE:
                                                // if file_id already in queue, delete the image message to save the view space
                                                await bot.deleteMessage(m.chat.id, m.message_id.toString());
                                                // and then, send a message with URL's substr offset and length of text
                                                // to notify it's already in queue
                                                await bot.sendMessage(msg.chat.id,
                                                                      `@(${ent.offset}+${ent.length}): ${url} ${ALREADY_IN_QUEUE}`,
                                                                      {reply_to_message_id: msg.message_id},
                                                );
                                                break;
                                            default:
                                                // unspecified response, always delete the message we sent
                                                await bot.deleteMessage(m.chat.id, m.message_id.toString());
                                        }
                                    }
                                })
                                .catch((e) => {
                                    console.error(e);
                                });
                        } else {
                            // jimp can not decode as an image, we must send a message to notify the URL is not an image
                            await bot.sendMessage(msg.chat.id, URL_REQUESTED_IS_NOT_A_IMAGE, {reply_to_message_id: msg.message_id});
                        }
                    })
                    .catch((err: Error) => {
                        console.error("jimp error", err.message);
                    });
            } else {
                // notify the URL not responsed correctly
                await bot.sendMessage(msg.chat.id, URL_REQUESTED_IS_NOT_OK, {reply_to_message_id: msg.message_id});
            }
        });
    };

    const doAddPhotoByUrl = async (msg: TelegramBot.Message) => {
        if (msg.entities) {
            const urls: string[] = [];
            msg.entities.map((ent, idx) => {
                if (ent.type === "url" && msg.text !== undefined) {
                    const url = msg.text.substr(ent.offset, ent.length);
                    if (urls.indexOf(url) === -1) {
                        console.info(QUEUE_REQUEST_TEXT("URL", `${msg.chat.title}(${msg.chat.id}): ${url}`));
                        await tryGetPhotoFromUrl(msg, ent, url);
                        urls.push(url);
                    }
                }
            });
        }
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
            } else if (msg.reply_to_message && msg.reply_to_message.entities) {
                await doAddPhotoByUrl(msg.reply_to_message);
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

        bot.on("message", (msg: TelegramBot.Message) => {
            if (msg.text !== undefined && msg.text.match(REGEXP_MATCH_TAG_COMMAND) !== null) {
                if (msg.entities) {
                    await doAddPhotoByUrl(msg);
                }
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
