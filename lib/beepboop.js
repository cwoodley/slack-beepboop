'use strict';

var util = require('util');
var path = require('path');
var fs = require('fs');
var SQLite = require('sqlite3').verbose();
var Bot = require('slackbots');


/**
 * Constructor function
 */
var BeepBoop = function Constructor(settings) {
    this.settings = settings;
    this.settings.name = this.settings.name || 'beepboop';
    this.dbPath = settings.dbPath || path.resolve(process.cwd(), 'data', 'norrisbot.db');

    this.user = null;
    this.db = null;
};

// inherits methods and properties from the Bot constructor
util.inherits(BeepBoop, Bot);

/**
 * Run the bot 
 */
BeepBoop.prototype.run = function () {
    BeepBoop.super_.call(this, this.settings);

    this.on('start', this._onStart);
    this.on('message', this._onMessage);
};

/**
 * On Start callback, called when the bot connects to the Slack server
 */
BeepBoop.prototype._onStart = function () {
    this._loadBotUser();
    this._connectDb();
    this._firstRunCheck();
};

/**
 * On message callback, called when a message (of any type) is detected with the real time messaging API
 * @param {object} message
 * @private
 */
BeepBoop.prototype._onMessage = function (message) {
    if (this._isChatMessage(message) &&
        this._isChannelConversation(message) &&
        !this._isFromBeepBoop(message) &&
        this._isMentioningChuckNorris(message)
    ) {
        this._replyWithRandomJoke(message);
    } else {
		if (this._isChatMessage(message) &&
			this._isChannelConversation(message) &&
			!this._isFromBeepBoop(message) &&
			this._isInvokingStartup(message)
		) {
			this._replyWithStartup(message);
		}
	}
};

/**
 * Replyes to a message with a random Joke
 * @param {object} originalMessage
 * @private
 */
BeepBoop.prototype._replyWithRandomJoke = function (originalMessage) {
    var self = this;
    self.db.get('SELECT id, joke FROM jokes ORDER BY used ASC, RANDOM() LIMIT 1', function (err, record) {
        if (err) {
            return console.error('DATABASE ERROR:', err);
        }

        var channel = self._getChannelById(originalMessage.channel);
        self.postMessageToChannel(channel.name, record.joke, {as_user: true, icon_emoji: ':norrisbot:' });
        self.db.run('UPDATE jokes SET used = used + 1 WHERE id = ?', record.id);
    });
};

/**
 * Replies to a .startup request with a fake startup
 * @param {object} originalMessage
 * @private
 */

BeepBoop.prototype._replyWithStartup = function (originalMessage) {
    var self = this,
		request = require('request'),
		util 	= require('util');
		
	request('http://itsthisforthat.com/api.php?json', function (err, response, body) {
		var info = [];

		if (!err && response.statusCode === 200) {
			body = JSON.parse(body);
			info.push('So, basically, it\'s like a ' + body.this + ' for ' + body.that);
		}
		else {
			info = ['Why do I always have to come up with all the bright ideas?'];
		}
		var channel = self._getChannelById(originalMessage.channel);
        self.postMessageToChannel(channel.name, info[0], { 'slackbot': true, username: 'Startup Guy', icon_emoji: ':startupbot:' });
    });
};

/**
 * Loads the user object representing the bot
 * @private
 */
BeepBoop.prototype._loadBotUser = function () {
    var self = this;
    this.user = this.users.filter(function (user) {
        return user.name === self.name;
    })[0];
};

/**
 * Open connection to the db
 * @private
 */
BeepBoop.prototype._connectDb = function () {
    if (!fs.existsSync(this.dbPath)) {
        console.error('Database path ' + '"' + this.dbPath + '" does not exists or it\'s not readable.');
        process.exit(1);
    }

    this.db = new SQLite.Database(this.dbPath);
};

/**
 * Check if the first time the bot is run. It's used to send a welcome message into the channel
 * @private
 */
BeepBoop.prototype._firstRunCheck = function () {
    var self = this;
    self.db.get('SELECT val FROM info WHERE name = "lastrun" LIMIT 1', function (err, record) {
        if (err) {
            return console.error('DATABASE ERROR:', err);
        }

        var currentTime = (new Date()).toJSON();

        // this is a first run
        if (!record) {
            self._welcomeMessage();
            return self.db.run('INSERT INTO info(name, val) VALUES("lastrun", ?)', currentTime);
        }

        // updates with new last running time
        self.db.run('UPDATE info SET val = ? WHERE name = "lastrun"', currentTime);
    });
};

/**
 * Sends a welcome message in the channel
 * @private
 */
BeepBoop.prototype._welcomeMessage = function () {
    this.postMessageToChannel(this.channels[0].name, 'Hi guys, roundhouse-kick anyone?' +
        '\n I can tell jokes, but very honest ones. Just say `Chuck Norris` or `' + this.name + '` to invoke me!',
        {as_user: true});
};

/**
 * Util function to check if a given real time message object represents a chat message
 * @param {object} message
 * @returns {boolean}
 * @private
 */
BeepBoop.prototype._isChatMessage = function (message) {
    return message.type === 'message' && Boolean(message.text);
};

/**
 * Util function to check if a given real time message object is directed to a channel
 * @param {object} message
 * @returns {boolean}
 * @private
 */
BeepBoop.prototype._isChannelConversation = function (message) {
    return typeof message.channel === 'string' &&
        message.channel[0] === 'C'
        ;
};

/**
 * Util function to check if a given real time message is mentioning Chuck Norris or the norrisbot
 * @param {object} message
 * @returns {boolean}
 * @private
 */
BeepBoop.prototype._isMentioningChuckNorris = function (message) {
    return message.text.toLowerCase().indexOf('chuck norris') > -1 ||
        message.text.toLowerCase().indexOf(this.name) > -1;
};

/**
 * Util function to check if a given real time message is requesting a .startup
 * @param {object} message
 * @returns {boolean}
 * @private
 */
BeepBoop.prototype._isInvokingStartup = function (message) {
    return message.text.toLowerCase().indexOf('.startup') > -1;
};

/**
 * Util function to check if a given real time message has ben sent by the norrisbot
 * @param {object} message
 * @returns {boolean}
 * @private
 */
BeepBoop.prototype._isFromBeepBoop = function (message) {
//	return message.user === 'Chuck Norris';
	return message.user === this.user.id;
};

/**
 * Util function to get the name of a channel given its id
 * @param {string} channelId
 * @returns {Object}
 * @private
 */
BeepBoop.prototype._getChannelById = function (channelId) {
    return this.channels.filter(function (item) {
        return item.id === channelId;
    })[0];
};
 
module.exports = BeepBoop;
