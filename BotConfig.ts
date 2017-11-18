const convert = require("convert-units");

export class BotConfig {
    public token = "";
    public minBotInterval = 0.5;
    public downloadMaxSize = convert(5).from("MB").to("B");
}
