const ADDED_INTO_QUEUE = "已加入序列";
const ALREADY_IN_QUEUE = "已在序列中";
const CAN_NOT_CHANGE_ALL_ADMINS_PHOTO = "I can't change group photo if all members are admin!";
const CAN_NOT_CHANGE_PHOTO = "I can't change your photo!";
const CONFIG_FILE_PATH = "./config.yaml";
const DATA_FILE_PATH = "./data.yaml";
const GROUP_PHOTO_CAPTION = "#群組圖片";
const IMAGE_FROM_URL_DIMENSION = (mime: string, w: number, h: number) =>
    `Got Image file in type of ${mime} as resolution in dimension (${w}×${h})`;
const INVALID_VALUE = "無效的數值";
const NEED_TELEGRAM_BOT_TOKEN = "Need a valid Telegram Bot Token";
const NOW_INTERVAL = (interval: string) => `目前設定值為${interval}小時`;
const QUEUE_REQUEST_TEXT = (type: string, name: string) => `Receive ${type} Queue Request from ${name}`;
const QUEUE_TEXT = (type: string, name: string) => `Receive ${type} Queue from ${name}`;
const REGEXP_MATCH_TAG_COMMAND = /(#|＃)(群組圖|群组图)(片)?/ig;
const SET_INTERVAL = (interval: string) => `已設定變更間隔為${interval}小時`;
const URL_REQUESTED_IS_NOT_A_IMAGE = "要求的網址不是可辨識的圖片，無法安排自動換圖";
const URL_REQUESTED_IS_NOT_OK = "要求的網址回傳不是成功要求，請檢查網址";
const WAITING_PHOTOS = (count: number, nextTime: string) => `等待的圖片數：${count.toString()}\n下次換圖時間：${nextTime}`;

export {
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
};
