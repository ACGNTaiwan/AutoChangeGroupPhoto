/**
 * @license
 * Copyright 2017
 */

const ADDED_INTO_QUEUE = "已加入序列";
const ALREADY_IN_QUEUE = "已在序列中";
const CAN_NOT_CHANGE_ALL_ADMINS_PHOTO = "I can't change group photo if all members are admin!";
const CAN_NOT_CHANGE_PHOTO = "I can't change your photo!";
const CONFIG_FILE_PATH = "./config.yaml";
const DATA_FILE_PATH = "./data.yaml";
const GROUP_PHOTO_CAPTION = "#群組圖片";
const INVALID_VALUE = "無效的數值";
const NEED_TELEGRAM_BOT_TOKEN = "Need a valid Telegram Bot Token";
const NOW_INTERVAL = (interval: string) => `目前設定值為${interval}小時`;
const QUEUE_TEXT = (type: string, name: string) => `Receive ${type} Queue from ${name}`;
const REGEXP_MATCH_TAG_COMMAND = /(#|＃)(群組圖|群组图)(片)?/ig;
const SET_INTERVAL = (interval: string) => `已設定變更間隔為${interval}小時`;
const WAITING_PHOTOS = (count: number, nextTime: string) => `等待的圖片數：${count.toString()}\n下次換圖時間：${nextTime}`;

export {
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
};
