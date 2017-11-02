import * as fs from "fs";
import * as yaml from "js-yaml";
import { AutoChangeGroupPhotoBot } from "./AutoChangeGroupPhotoBot";
import * as CONSTS from "./consts";

// read and initial the config file
fs.readFile(CONSTS.CONFIG_FILE_PATH, null, (err, d) => {
    let _config;
    try {
        _config = yaml.load(d.toString());
    } catch (e) {
        _config = {};
    } finally {
        AutoChangeGroupPhotoBot.getInstance(_config);
    }
});
