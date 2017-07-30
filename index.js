const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const request = require('request');
const schedule = require('node-schedule');
const moment = require('moment');
const config = require('./config.json');

const bot = new TelegramBot(config.token, {polling: {interval: 0, params: {timeout: 60}}});

let data;
try {
    data = require('./data.json');
} catch (error) {
    data = {};
}

moment.locale('zh-tw');

const saveData = () => {
    fs.writeFile('data.json', JSON.stringify(data), () => {});
};

const initData = (chatId) => {
    if (!data[chatId]) {
        data[chatId] = {
            queue: [],
            interval: 1
        };
    }
};

const addPhoto = (msg) => {
    const chatId = msg.chat.id;
    let fileId;

    if (msg.chat.type === 'private') {
        bot.sendMessage(chatId, 'I can\'t change your photo!');
        return;
    } else if (msg.chat.type === 'group' && msg.chat.all_members_are_administrators) {
        bot.sendMessage(chatId, 'I can\'t change group photo if all members are admin!');
        return;
    }

    if (msg.photo) {
        fileId = msg.photo.pop().file_id;
    } else if (msg.document && msg.document.thumb) {
        fileId = msg.document.file_id;
    }

    initData(chatId);
    if (data[chatId].queue.indexOf(fileId) === -1) {
        data[chatId].queue.push(fileId);
        bot.sendMessage(chatId, '已加入序列', {reply_to_message_id: msg.message_id});
    } else {
        bot.sendMessage(chatId, '已在序列中', {reply_to_message_id: msg.message_id});
    }
    saveData();
};

const doUpdate = () => {
    for (const chatId in data) {
        if (data[chatId].queue.length > 0 && (!data[chatId].last || moment(data[chatId].last).add(data[chatId].interval, 'h').isBefore(moment()))) {
            bot.getFileLink(data[chatId].queue.shift()).then((link) => bot.setChatPhoto(chatId, request(link)));
            data[chatId].last = +moment();
            saveData();
        }
    }
};

schedule.scheduleJob('0 * * * * *', doUpdate);

bot.getMe().then((me) => {
    bot.onText(/^\/(\w+)@?(\w*)/i, (msg, regex) => {
        if (regex[2] && regex[2] !== me.username) {
            return;
        }

        const chatId = msg.chat.id;
        initData(chatId);

        bot.getChatAdministrators(chatId).then((members) => {
            switch (regex[1]) {
            case 'setinterval':
                if (msg.text.split(' ').length === 1) {
                    bot.sendMessage(chatId, '目前設定值為' + data[chatId].interval + '小時');
                    break;
                }
                if (members.map((member) => member.user.id).indexOf(msg.from.id) === -1) break;

                if (msg.text.split(' ').length === 2 && msg.text.split(' ')[1] >= 0.5) {
                    data[chatId].interval = Number(msg.text.split(' ')[1]);
                    bot.sendMessage(chatId, '已設定變更間隔為' + data[chatId].interval + '小時');
                    saveData();
                } else {
                    bot.sendMessage(chatId, '無效的數值');
                }
                break;
            case 'next':
                if (members.map((member) => member.user.id).indexOf(msg.from.id) === -1) break;
                if (data[chatId].queue.length > 0) {
                    bot.getFileLink(data[chatId].queue.shift()).then((link) => bot.setChatPhoto(chatId, request(link)));
                    data[chatId].last = +moment();
                }
                break;
            // TODO
            // case 'setloop':
            //     if (members.map((member) => member.user.id).indexOf(msg.from.id) === -1) break;
            //     if (msg.text.split(' ').length === 1) bot.sendMessage(chatId, '目前')
            // case 'block':
            //     if (members.map((member) => member.user.id).indexOf(msg.from.id) === -1) break;
            case 'queue':
                bot.sendMessage(chatId,
                    '等待的圖片數：' + data[chatId].queue.length +
                    '\n下次換圖時間：' + moment(data[chatId].last).add(data[chatId].interval, 'h').format('LLL')
                );
                break;
            // TODO
            // case 'votenext':
            //     break;
            }
        });
    });

    bot.onText(/#群組圖片/ig, (msg) => {
        if (msg.reply_to_message && (msg.reply_to_message.photo||msg.reply_to_message.document)) {
            addPhoto(msg.reply_to_message);
        }
    });

    bot.on('photo', (msg) => {
        if (msg.caption && msg.caption.match(/#群組圖片/ig)) addPhoto(msg);
    });
    bot.on('document', (msg) => {
        if (msg.caption && msg.caption.match(/#群組圖片/ig)) addPhoto(msg);
    });
});
