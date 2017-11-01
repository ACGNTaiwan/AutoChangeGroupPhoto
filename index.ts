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
    DATA_FILE_JSON_PATH,
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
import * as PhotoData from "./PhotoData";

let data: PhotoData.PhotoDataStrcture[];

moment.locale("zh-tw");

const saveData = () => {
    const _data = JSON.parse(JSON.stringify(data)); // to prevent Proxy dump undefined
    fs.writeFile(DATA_FILE_PATH, yaml.safeDump(_data));
};

function getData(chatId: number): PhotoData.PhotoDataStrcture {
    const chatData = data.filter((d) => d.chatId === chatId).shift();
    if (chatData instanceof PhotoData.PhotoDataStrcture) {
        return chatData;
    } else {
        const d = new PhotoData.PhotoDataStrcture(chatId);
        data.push(d);
        saveData();
        return d;
    }
}

async function main(bot: TelegramBot) {
    async function checkQueue(msg: TelegramBot.Message) {
        const chatId = msg.chat.id;
        let fileId: string;

        if (msg.chat.type === "private") {
            await bot.sendMessage(chatId, CAN_NOT_CHANGE_PHOTO);
            return CAN_NOT_CHANGE_PHOTO;
        } else if (msg.chat.type === "group" && msg.chat.all_members_are_administrators) {
            await bot.sendMessage(chatId, CAN_NOT_CHANGE_ALL_ADMINS_PHOTO);
            return CAN_NOT_CHANGE_ALL_ADMINS_PHOTO;
        }

        if (msg.photo && msg.photo.length > 0) {
            fileId = msg.photo.pop()!.file_id;
        } else if (msg.document && msg.document.thumb) {
            fileId = msg.document.file_id;
        } else {
            fileId = "";
        }

        const chatData = getData(chatId);
        let result = null;
        if (chatData.queue.indexOf(fileId) === -1) {
            chatData.queue.push(fileId);
            result = ADDED_INTO_QUEUE;
        } else {
            result = ALREADY_IN_QUEUE;
        }
        return result;
    }
    async function addPhoto(msg: TelegramBot.Message) {
        const chatId = msg.chat.id;
        const result = await checkQueue(msg);
        if (result !== undefined) {
            await bot.sendMessage(chatId, result, {reply_to_message_id: msg.message_id});
            saveData();
        }
        return result;
    }

    function doUpdate() {
        data.map(async (chatData) => {
            if (chatData.queue.length > 0 &&
                (!chatData.last || moment(chatData.last).add(chatData.interval, "h").isBefore(moment()))
            ) {
                await bot.getFileLink(chatData.queue.shift()!)
                    .then(async (link) => link instanceof Error ? null : bot.setChatPhoto(chatData.chatId, request(link)));
                chatData.last = +moment();
                saveData();
            }
        });
    }

    function tryGetPhotoFromUrl(msg: TelegramBot.Message, ent: TelegramBot.MessageEntity, url: string) {
        request.get(url, { encoding: null }, async (error, response, body) => {
            if (error) {
                console.error(error);
            }
            if (response.statusCode === 200) {
                const buffer = Buffer.from(response.body);
                jimp.read(buffer)
                    .then(async (image) => {
                        if (image !== undefined) {
                            console.info(IMAGE_FROM_URL_DIMENSION(image.getMIME(), image.bitmap.width, image.bitmap.height));
                            // send image which downloaded back to the chat for placehold a file_id
                            bot.sendPhoto(msg.chat.id, buffer, {caption: GROUP_PHOTO_CAPTION})
                                .then(async (m) => {
                                    if (!(m instanceof Error)) {
                                        const result = await checkQueue(m);
                                        switch (result) {
                                            case ADDED_INTO_QUEUE:
                                                await addPhoto(m);
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
    }

    function doAddPhotoByUrl(msg: TelegramBot.Message) {
        if (msg.entities) {
            const urls: string[] = [];
            msg.entities.map(async (ent, idx) => {
                if (ent.type === "url" && msg.text !== undefined) {
                    const url = msg.text.substr(ent.offset, ent.length);
                    if (urls.indexOf(url) === -1) {
                        console.info(QUEUE_REQUEST_TEXT("URL", `${msg.chat.title}(${msg.chat.id}): ${url}`));
                        tryGetPhotoFromUrl(msg, ent, url);
                        urls.push(url);
                    }
                }
            });
        }
    }

    schedule.scheduleJob("0 * * * * *", doUpdate);

    await bot.getMe().then((me) => {
        if (me instanceof Error) {
            return;
        }

        bot.onText(/^\/(\w+)@?(\w*)/i, async (msg, regex) => {
            if (regex) {
                if (regex[2] && regex[2] !== me.username) {
                    return;
                }

                const chatId = msg.chat.id;
                const chatData = getData(chatId);

                await bot.getChatAdministrators(chatId).then(async (members) => {
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
                                await bot.getFileLink(chatData.queue.shift()!)
                                    .then(
                                        async (link: string | Error) =>
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

        bot.onText(REGEXP_MATCH_TAG_COMMAND, async (msg) => {
            if (msg.reply_to_message && (msg.reply_to_message.photo || msg.reply_to_message.document)) {
                console.info(QUEUE_TEXT("Text", `${msg.chat.title}(${msg.chat.id})`));
                await addPhoto(msg.reply_to_message);
            } else if (msg.reply_to_message && msg.reply_to_message.entities) {
                doAddPhotoByUrl(msg.reply_to_message);
            }
        });

        bot.on("photo", async (msg: TelegramBot.Message) => {
            if (msg.caption && msg.caption.match(REGEXP_MATCH_TAG_COMMAND)) {
                console.info(QUEUE_TEXT("Photo", `${msg.chat.title}(${msg.chat.id})`));
                await addPhoto(msg);
            }
        });

        bot.on("document", async (msg: TelegramBot.Message) => {
            if (msg.caption && msg.caption.match(REGEXP_MATCH_TAG_COMMAND)) {
                console.info(QUEUE_TEXT("Document", `${msg.chat.title}(${msg.chat.id})`));
                await addPhoto(msg);
            }
        });

        bot.on("message", async (msg: TelegramBot.Message) => {
            if (msg.text !== undefined && msg.text.match(REGEXP_MATCH_TAG_COMMAND) !== null) {
                if (msg.entities) {
                    doAddPhotoByUrl(msg);
                }
            }
        });
    });
}

function doCompatibleConvert(d: object): PhotoData.PhotoDataStrcture[] {
    const apds: PhotoData.PhotoDataStrcture[] = [];
    Object.keys(d).map((chatId: string) => {
        const dc = (d as any)[chatId] as PhotoData.PhotoDataStrcture;
        const pds = new PhotoData.PhotoDataStrcture(Number(chatId));
        pds.interval = dc.interval;
        pds.last = dc.last;
        pds.queue = dc.queue;
        apds.push(pds);
    });
    return apds;
}

async function init(_config: any, _data: any) {
    if (_data instanceof Object) {
        _data = doCompatibleConvert(_data);
    }
    data = PhotoData.PhotoDataStore(_data, saveData);
    if (_config.token) {
        // if has bot token, then start the main program
        const bot = new TelegramBot(_config.token, {polling: {interval: 0, params: {timeout: 60}}});
        await main(bot);
    } else {
        throw Error(NEED_TELEGRAM_BOT_TOKEN);
    }
}

// read site data which contains chat's photo list data
function readData(_config: any) {
    let preparingData: any = [];
    if (fs.existsSync(DATA_FILE_PATH)) {
        fs.readFile(DATA_FILE_PATH, null, async (err, d) => {
            try {
                preparingData = yaml.load(d.toString());
            } catch (e) {
                console.warn(e);
            }
            await init(_config, preparingData);
        });
    } else {
        fs.readFile(DATA_FILE_JSON_PATH, null, async (err, d) => {
            try {
                preparingData = JSON.parse(d.toString());
            } catch (e) {
                console.warn(e);
            }
            await init(_config, preparingData);
        });
    }
}

// read and initial the config file
fs.readFile(CONFIG_FILE_PATH, null, (err, d) => {
    let _config;
    try {
        _config = yaml.load(d.toString());
    } catch (e) {
        _config = {};
    } finally {
        readData(_config);
    }
});
