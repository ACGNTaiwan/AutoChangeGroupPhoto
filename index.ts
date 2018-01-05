import * as fs from "fs";
import * as yaml from "js-yaml";
import { AutoChangeGroupPhotoBot } from "./AutoChangeGroupPhotoBot";
import { BotConfigGenerator } from "./BotConfig";
import * as CONSTS from "./consts";

// read and initial the config file
fs.readFile(CONSTS.CONFIG_FILE_PATH, null, async (err, d) => {
    let _config;
    try {
        _config = err !== null ?
            await BotConfigGenerator.AskForInputCredentials() :
            yaml.load(d.toString());
    } catch (e) {
        _config = {};
    } finally {
        AutoChangeGroupPhotoBot.getInstance(_config);
    }
});
