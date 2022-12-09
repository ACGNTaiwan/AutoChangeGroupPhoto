import * as fs from "fs";
import * as yaml from "js-yaml";

import { AutoChangeGroupPhotoBot } from "./src/autoChangeGroupPhotoBot";
import { BotConfigGenerator } from "./src/botConfig";
import * as CONSTS from "./src/consts";

process.on('unhandledRejection', error => {
  console.error('unhandledRejection', error);
  process.exit(1) // To exit with a 'failure' code
});

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
