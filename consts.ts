const convert = require("convert-units");
import * as TelegramBot from "node-telegram-bot-api";
import * as PhotoData from "./PhotoData";

export const ADDED_INTO_QUEUE = "已加入序列";
export const ALREADY_IN_QUEUE = "已在序列中";
export const BANNED_PHOTO = "此圖片已被封鎖";
export const BANNED_TEXT = (charId: number, fileId: string) => `Receive Ban Queue for ${charId} to ${fileId}.`;
export const CAN_NOT_CHANGE_ALL_ADMINS_PHOTO = "I can't change group photo if all members are admin!";
export const CAN_NOT_CHANGE_PHOTO = "I can't change your photo!";
export enum COMMANDS {
    SET_INTERVAL = "setinterval",
    NEXT_PHOTO = "next",
    QUEUE_STATUS = "queue",
}
export const CONFIG_FILE_PATH = "./config.yaml";
export const DATA_FILE_JSON_PATH = "./data.json";
export const DATA_FILE_PATH = "./data.yaml";
export const DISABLED_PIXIV_ACCOUNT = "There not configurated for pixiv API account";
export const ENABLED_PIXIV_ACCOUNT = (account: string, refreshToken: string) =>
    `Pixiv API Account Enabled => \`${account}\` with refresh token => \`${refreshToken}\`.`;
export const ENABLING_REFRESHED_PIXIV_ACCOUNT = (account: string, refreshToken: string) =>
    `Re-Enabling Pixiv API Account => \`${account}\` by refresh token => \`${refreshToken}\`.`;
export const ENABLING_PIXIV_ACCOUNT = (account: string) => `Enabling Pixiv API Account => \`${account}\`.`;
export const FILE_ADDED_INTO_QUEUE = (fileId: string) => `File (${fileId}) added into queue.`;
export const FILE_ALREADY_IN_QUEUE = (fileId: string) => `File (${fileId}) already in the queue.`;
export const GET_CHAT_ERROR = (chatId: number, reason: any) => `Get Chat Error ${chatId}: ${reason}.`;
export const GROUP_PHOTO_CAPTION = "#群組圖片";
export const GROUP_PHOTO_PIXIV_CAPTION = (illust: PhotoData.PixivIllustStructure) =>
    `${illust.title}(${illust.userName})
${illust.referralUrl} ${GROUP_PHOTO_CAPTION}

${illust.tags.join(" ")}
${illust.caption}`;
export const IMAGE_FROM_URL_DIMENSION = (mime: string, w: number, h: number) =>
    `Got Image file in type of ${mime} as resolution in dimension (${w}×${h}).`;
export const INVALID_VALUE = "無效的數值";
export const NEED_TELEGRAM_BOT_TOKEN = "Need a valid Telegram Bot Token.";
export const NOW_INTERVAL = (interval: string) => `目前設定值為${interval}小時`;
export const PIXIV_ILLUST_IID_URL = (iid: number) => `https://www.pixiv.net/i/${iid}`;
export const PIXIV_ILLUST_DETAIL = (illust: PhotoData.PixivIllustStructure) =>
    `Got Illust \`${illust.title} : ${illust.caption} - ${illust.userName}\` (${illust.tags.join(", ")}) ` +
    `with URL \`${illust.originalUrl}\` and square image URL \`${illust.squareMediumUrl}\``;
export const PIXIV_URL_REVERSED_PROXY = (oUrl: string, pUrl: string) => `Convert Pixiv URL \`${oUrl}\` => \`${pUrl}\``;
export const QUEUE_REQUEST_TEXT = (type: string, name: string) => `Receive ${type} Queue Request from ${name}.`;
export const QUEUE_TEXT = (type: string, chat: TelegramBot.Chat) => `Receive ${type} Queue from Group/Peer ${chat.title || chat.username}(${chat.id}).`;
export const QUEUE_WAS_BANNED = (chatId: number, fileId: string) => `The file of ${fileId} was banned in ${chatId}`;
export const REGEXP_MATCH_BAN_COMMAND = /(#|＃)(鞭|ban|banned|block|R18)/ig;
export const REGEXP_MATCH_PIXIV_DOMAIN = /\.pixiv\./i;
export const REGEXP_MATCH_PIXIV_ILLUST_ID = /illust_id=(\d+)|www.pixiv.net\/i\/(\d+)/i;
export const REGEXP_MATCH_PIXIV_IMAGE_DOMAIN = /^(https:\/\/)i.pximg.net(\/.+)$/i;
export const REGEXP_MATCH_TAG_COMMAND = /(#|＃)(群組圖|群组图)(片)?/ig;
export const REGEXP_MATCH_UNBAN_COMMAND = /(#|＃)(解鞭|unban)/ig;
export const SET_INTERVAL = (interval: string) => `已設定變更間隔為${interval}小時`;
export const UNBANNED_TEXT = (charId: number, fileId: string) => `Receive UnBan Queue for ${charId} to ${fileId}.`;
export const UPDATE_PHOTO_ERROR = (chatId: number, reason: any) => `Update photo rejected on ${chatId}: ${reason}.`;
export const UPDATE_PHOTO_IGNORE = (chat: TelegramBot.Chat) =>
    `Group/Peer ${chat.title || chat.username}(${chat.id}) ignore to update photo due to photo link was empty.`;
export const UPDATED_PHOTO = (chat: TelegramBot.Chat, fileLink: string) =>
    `Group/Peer ${chat.title || chat.username}(${chat.id}) updated photo to \`${fileLink}\`.`;
export const UPLOADING_PHOTO = (chatId: string | number, image: Buffer, url: string) =>
    `Uploading the Photo from \`${url}\` (size: ${convert(image.byteLength).from("B").to("MB").toFixed(2)}MB) to Chat: ${chatId}.`;
export const URL_CONTENT_TYPE_NOT_ACCEPTED = (url: string, mime: string) =>
    `The request of \`${url}\` is not accept for the MIME type which is \`${mime}\`, is only allowed image or html`;
export const URL_HTML_IGNORE = (url: string) => `Request of \`${url}\` ignore to check size.`;
export const URL_PREPARE_TO_DOWNLOAD = (msg: TelegramBot.Message, url: string) =>
    `Prepare to download \`${url}\` for ${msg.chat.title}(${msg.chat.id}).`;
export const URL_FOUND_OG_IMAGE_URL = (msg: TelegramBot.Message, url: string, ogUrl: string) =>
    `Found \`og:img\` to download \`${url}\` => \`${ogUrl}\` for ${msg.chat.title}(${msg.chat.id}).`;
export const URL_NOT_FOUND_OG_IMAGE_URL = (msg: TelegramBot.Message, url: string) =>
    `\`og:img\` not found to download \`${url}\` for ${msg.chat.title}(${msg.chat.id}), fallback to continue.`;
export const URL_REQUESTED_IS_NOT_A_IMAGE = (url: string) => `要求的網址 \`${url}\` 不是可辨識的圖片，無法安排自動換圖`;
export const URL_REQUESTED_IS_NOT_OK = (url: string) => `要求的網址 \`${url}\` 回傳不是成功要求，請檢查網址`;
export const URL_SIZE_CHECK = (url: string) => `Checking file size for \`${url}\`.`;
export const URL_SIZE_RESULT = (url: string, size: number) =>
    `The file size for \`${url}\` is passed for ${convert(size).from("B").to("MB").toFixed(2)}MB.`;
export const URL_SIZE_OUT_OF_BOUND = (url: string, size: number, limitation: number) =>
    `The request of \`${url}\` is ${convert(size).from("B").to("MB").toFixed(2)}MB, ` +
    `that is exceed the limitation of ${convert(limitation).from("B").to("MB").toFixed(2)}MB.`;
export const WAITING_PHOTOS = (count: number, banCount: number, historyCount: number, nextTime: string) =>
    `等待的圖片數：${count}\n被鞭圖片數量：${banCount}\n歷史記錄數量：${historyCount}\n下次換圖時間：${nextTime}`;
