import * as fs from "fs";
import * as yaml from "js-yaml";
import * as TelegramBot from "node-telegram-bot-api";
import * as path from "path";
import * as CONSTS from "./consts";
import * as PhotoData from "./PhotoData";

let logger: any;

export class TelegramDownload {
    private static _instance?: TelegramDownload;
    private bot: TelegramBot;
    private store: string;

    public static getInstance(bot: TelegramBot, _logger: any, defaultStore: string = path.resolve(path.join(".", CONSTS.CACHE_FILE_FOLDER))) {
        return (this._instance) ? this._instance : (this._instance = new this(bot, _logger, defaultStore));
    }

    public checkGroup(photoData: PhotoData.PhotoDataStrcture) {
        const files = [...new Set(([] as string[]).concat(photoData.queue).concat(photoData.history).concat(photoData.history))];
        this.checkGroupCacheFolder(photoData.chatId);
        files.forEach(async (f) => this.checkFile(photoData.chatId, f)
            .catch((fileId: string) => {
                const retry = photoData.getRetryQueue(fileId);
                logger.debug(`${fileId} => ${retry.retryTimes}`);
                if (retry.retryTimes >= CONSTS.PHOTO_RETRY_MAX) {
                    photoData.pruneQueue(fileId);
                }
            }),
        );

        const _data = JSON.parse(JSON.stringify(photoData)); // to prevent Proxy dump undefined
        fs.writeFileSync(path.join(this.store, photoData.chatId.toString(), CONSTS.CACHE_DATA_FILENAME), yaml.safeDump(_data));

        const rootFile = path.join(this.store, CONSTS.CACHE_DATA_FILENAME);
        const groups: number[] = (!fs.existsSync(rootFile)) ? [] : yaml.load(fs.readFileSync(rootFile).toString());
        if (groups.indexOf(photoData.chatId) === -1) {
            groups.push(photoData.chatId);
            const _groups = JSON.parse(JSON.stringify(groups)); // to prevent Proxy dump undefined
            fs.writeFileSync(rootFile, yaml.safeDump(_groups));
        }

    }

    private constructor(bot: TelegramBot, _logger: any, defaultStore: string) {
        this.bot = bot;
        logger = _logger;
        this.store = defaultStore;
        this.checkCacheRoot();
    }

    private checkCacheRoot() {
        return this.checkCacheFolder(this.store);
    }

    private checkGroupCacheFolder(chatId: number) {
        return this.checkCacheFolder(path.join(this.store, chatId.toString()));
    }

    private checkCacheFolder(folder: string): string[] {
        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder);
            logger.info(CONSTS.CACHE_CREATED_FOLDER(folder));
            return [];
        } else {
            const files = fs.readdirSync(folder).filter((file) => fs.lstatSync(path.join(folder, file)).isFile());
            logger.debug(CONSTS.CACHE_FOLDER_CHECKED(folder, files));
            return files;
        }
    }

    private async checkFile(chatId: number, fileId: string) {
        const gFolder = path.join(this.store, chatId.toString());
        const gFile = path.join(gFolder, fileId.toString());
        if (!fs.existsSync(gFile)) {
            logger.info(CONSTS.CACHE_DOWNLOADING(gFile));
            const fid = await this.bot.getFile(fileId)
                .then((file) => (file instanceof Error) ? fileId : file.file_id)
                .catch((reason: Error) => reason);
            const filepath = (fid instanceof Error) ? fid : await this.bot.downloadFile(fid, gFolder);
            if (filepath instanceof Error) {
                logger.error(CONSTS.CACHE_DOWNLOAD_ERROR(gFile, filepath.message));
                return Promise.reject(fileId);
            } else {
                const filename = path.basename(filepath);
                const downloadedFile = path.join(gFolder, filename);
                fs.renameSync(downloadedFile, gFile);
                logger.info(CONSTS.CACHE_DOWNLOADED(filename, gFile));
            }
        } else {
            logger.debug(CONSTS.CACHE_DOWNLOAD_IGNORE(gFile));
        }
        return Promise.resolve(fileId);
    }
}
