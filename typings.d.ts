import * as request from "request";

export declare namespace TelegramBotExtended {
    interface TelegramError extends Error {
        code: string | number;
        response: request.RequestResponse;
    }
}
