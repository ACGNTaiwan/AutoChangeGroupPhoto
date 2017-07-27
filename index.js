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

const addToQueue = (chatId, id) => {
    bot.getChat(chatId).then((info) => {
        if (info.type === 'private') {
            bot.sendMessage(chatId, 'I can\'t change your photo!');
            return;
        } else if (info.type === 'group' && info.all_members_are_administrators) {
            bot.sendMessage(chatId, 'I can\'t change group photo if all members are admin!');
            return;
        }

        initData(chatId);
        if (data[chatId].queue.indexOf(id) === -1) data[chatId].queue.push(id);
        saveData();
    });
};

const addPhoto = (msg) => {
    if (msg.photo) {
        addToQueue(msg.chat.id, msg.photo.pop().file_id);
    } else if (msg.document && msg.document.thumb) {
        addToQueue(msg.chat.id, msg.document.file_id);
    }
};

const doUpdate = () => {
    for (const id in data) {
        if (data[id].queue.length > 0 && (!data[id].last || moment(data[id].last).add(data[id].interval, 'h').isBefore(moment()))) {
            bot.getFileLink(data[id].queue.shift()).then((link) => bot.setChatPhoto(id, request(link)));
            data[id].last = +moment();
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
                if (members.map((member) => member.user.id).indexOf(msg.from.id) === -1) break;

                if (msg.text.split(' ').length === 2 && msg.text.split(' ')[1] >= 0.5) {
                    data[chatId].interval = Number(msg.text.split(' ')[1]);
                    bot.sendMessage(chatId, '已設定變更間隔為' + data[chatId].interval + '小時');
                    saveData();
                } else {
                    bot.sendMessage(chatId, '無效的數值');
                }
                break;
            case 'queue':
                bot.sendMessage(chatId, data[chatId].queue.length);
                break;
            case 'next':
                if (members.map((member) => member.user.id).indexOf(msg.from.id) === -1) break;
                if (data[chatId].queue.length > 0) {
                    bot.getFileLink(data[chatId].queue.shift()).then((link) => bot.setChatPhoto(chatId, request(link)));
                    data[chatId].last = +moment();
                }
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
