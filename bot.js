const cheerio = require("cheerio");
const axios = require("axios");
const escape = require("discord-escape");
const discord = require("discord.js");
const express = require("express");
const expressAuthBasic = require("express-basic-auth");
require("console-stamp")(console); // add console timestamp and log level info


// bot options (see README)
if (!process.env.DISCORD_TOKEN) {
    console.error("Set required DISCORD_TOKEN environment variable.");
    process.exit(1);
}
const DISCORD_TOKEN = process.env.DISCORD_TOKEN.trim();
const REST_API_SERVER_ENABLED = (process.env.REST_API_SERVER_ENABLED ||
    "true").trim().match("^(true|on|y|1)") != null;
const REST_API_SERVER_HOST = (process.env.REST_API_SERVER_HOST ||
    "0.0.0.0").trim();
const REST_API_SERVER_PORT = process.env.REST_API_SERVER_PORT || 8000;
const REST_API_SERVER_USERNAME = process.env.REST_API_SERVER_USERNAME;
const REST_API_SERVER_PASSWORD = process.env.REST_API_SERVER_PASSWORD;
const PUBLIC_REPLY_DECAY_TIME = process.env.PUBLIC_REPLY_DECAY_TIME || 120000;
const MAX_THREAD_TITLE_LENGTH = 100;
const MAX_POST_LENGTH = 2000;

// setup bot and rest api server
botSetup(DISCORD_TOKEN).then(bot => {
    if (REST_API_SERVER_ENABLED) {
        return restApiSetup(bot, REST_API_SERVER_PORT,
            REST_API_SERVER_HOST, REST_API_SERVER_USERNAME,
            REST_API_SERVER_PASSWORD);
    }
}).catch((e) => {
    console.error(e);
    process.exit(1);
});

// BOT CODE...

function botSetup (token) {
    const bot = new discord.Client({
        intents: ["GUILDS", "GUILD_MESSAGES", "DIRECT_MESSAGES"]
    });

    bot.on("messageCreate", m => {
    // ignore own and other bots
        if (m.author.bot) return;
        // deal with server text channels only
        if (!(m.channel instanceof discord.TextChannel)) return;
        // #news channel
        if (m.channel.name == "news") return handleNewsMessage(m);
    });

    bot.login(token);

    return new Promise((resolve, reject) => {
        bot.once("ready", () => {
            console.log("Discord bot is now up and running.");

            // Updating stats
            const guild = client.guilds.cache.get('364428045093699594');
            setInterval(() =>{
                // Update the general Discord Member Stat Channel
                const memberCount = guild.members.cache.filter(m => !m.user.bot).size;
                const memberChannel = guild.channels.cache.get('992471062258384956');
                memberChannel.setName(`Discord Members: ${memberCount.toLocaleString()}`);

                // Update the general Freesider Stat Channel
                const freesiderCount = guild.members.cache.filter(m => !m.user.bot).size;
                const freesideChannel = guild.roles.get(`366661244284829697`).members.size;
                freesideChannel.setName(`Freesiders: ${memberCount.toLocaleString()}`);

                // Update the general Freesider Stat Channel
                const alumniCount = guild.members.cache.filter(m => !m.user.bot).size;
                const alumniChannel = guild.roles.get(`457611334989905922`).members.size;
                alumniChannel.setName(`Alumni: ${memberCount.toLocaleString()}`);
            }, 600000);


            resolve(bot);
        });
        bot.once("error", e => reject(e));
    });
}

/*
    Called every time a message is posted into news channel.
*/
async function handleNewsMessage (message) {
    /*
        The news channel can only contain links to news stories. A hyperlink
        to a page containing an 'og:title' meta tag is considered a news story.
        A message posted which does not contain this will be rejected.
    */
    const match = message.content.match(/https?:\/\/[^ "]{2,}/);
    const title = match && await fetchNewsTitle(match[0], message.author);

    if (title) {
    // message determined to be a news story
        console.log("Creating news discussion thread for %s named '%s'.",
            message.author.tag, title);
        await message.startThread({
            // keep under thread limit
            name: title.substr(0, MAX_THREAD_TITLE_LENGTH)
        });
    } else {
    // not a news story, remove message
        await removeMessage(message, "Please only post news articles. " +
            "Discussion on news stories should take place inside their " +
            "designated thread which will be created automatically.");
    }
}

/*
    Fetch title of a news article given its URL. This title will be used for
    creating a thread.
*/
async function fetchNewsTitle (url) {
    console.log("Attempting to fetch page %s for news title.", url);
    const response = await axios.get(url, {
        headers: {
            /*
                Use Chrome / Windows 10 user agent as a precaution against
                bad news sites which may reject requests due to user agent.
            */
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/102.0.5005.115 Safari/537.36"
        }
    }).catch(e => console.log("Request for %s failed. %s", url, e.message));
    if (!response) return null; // request failed

    const $ = cheerio.load(response.data); // parse response HTML

    // first try using opengraph title
    const metaOgTitle = $("meta[property=og:title],meta[name=og:title]");
    if (metaOgTitle.length != 0) return metaOgTitle.attr("content");
    console.log("Page %s contains no OpenGraph title tag.", url);

    // no opengraph title tag, so use the main title
    const title = $("title");
    if (title.length != 0 && title.text().length != 0) return title.text();
    console.log("Page %s also contains no title tag. Title not found.", url);

    return null; // no title found
}

/**
    Inform user with a text message. First tries to send message to the user's
    DM channel. If this fails (user has it closed) then the message will be
    sent in publicChannel. Exception is thrown forward if this fails still.

    Message sent in publicChannel will expire and be deleted after a set period
    of time for cleanliness. See PUBLIC_REPLY_DECAY_TIME.
*/
async function inform (user, message, publicChannel = null,
    tryingPublic = false) {
    // channel to send in
    const channel = (tryingPublic && publicChannel) || user.dmChannel ||
        await user.createDM();
    try {
        return await channel.send(user.toString() + "\n" + message);
    } catch (e) {
    // message already tried through dms, public channel now also failed
        if (tryingPublic || !publicChannel) throw e; // pass on exception
    }

    // to get here: sending dm to user failed, try posting in public channel
    const reply = await inform(user, message, publicChannel, true);

    // clean up public messages after time
    await new Promise(resolve => setTimeout(resolve, PUBLIC_REPLY_DECAY_TIME));
    try {
        await reply.delete();
    } catch {
        console.warn(`Failed to automatically delete ${message.url}. ` +
            "Message may have already been deleted manually.");
    }
}

/*
    Remove a user's message with a reason.
*/
async function removeMessage (message, reason) {
    console.log("Removing message '%s' by %s with explaination '%s'.",
        message.content, message.author.tag, reason);
    await message.delete();

    /*
        Send message to author with their quoted message and why it was removed.

        > message content quoted (replace "\n" with "\n>"to continue quote over
            multiple lines)
        ** This message was removed ** (reason)
    */
    await inform(message.author,
        "> " + escape(message.content).replace(/\n/g, "\n> ") + "\n" +
        "**This message was removed.** " + reason, message.channel);
}

// REST API CODE...

function restApiSetup (bot, port, host, username = null, password = null) {
    const server = express();
    const listener = server.listen(port, host);

    // log requests
    server.use((req, res, next) => {
        let requestedWith = req.get("User-Agent") || "";
        if (requestedWith) requestedWith = " with " + requestedWith;
        console.log("%s - Requested %s %s://%s:%i%s%s.", req.ip, req.method,
            req.protocol, req.hostname, listener.address().port, req.url,
            requestedWith);
        next();
    });

    // handle authentication if credential requirements are set
    if (username && password) {
        server.use(expressAuthBasic({
            users: { [username]: password },
            challenge: true,
            unauthorizedResponse: req => (req.auth ? "Incorrect" : "Missing") +
                " credentials."
        }));
    }

    // allow handling url encoded or json encoded body
    server.use(express.json());
    server.use(express.urlencoded({ extended: true }));

    // handle POST /send
    server.post("/send", (req, res) => restApiSendMessage(bot, req, res));

    // setup server listener
    return new Promise((resolve, reject) => {
        listener.once("listening", () => {
            console.log("REST API server is listening on %s:%i.", host,
                listener.address().port);
            resolve(server);
        });
        listener.once("error", e => reject(e));
    });
}

// handle POST /send requests
async function restApiSendMessage (bot, req, res) {
    // check channel parameter
    const channelName = (req.body.channel || req.query.channel || "").trim()
        .replace(/^#/, "").toLowerCase();
    if (!channelName) {
        res.status(400).send({ error: "Missing 'channel' parameter." });
        return;
    }

    // check message parameter
    const message = req.body.message || req.query.message;
    if (!message) {
        res.status(400).send({ error: "Missing 'message' parameter." });
        return;
    }

    if (bot.guilds.cache.length == 0) {
        res.status(500).send({ error: "Bot is not in any guilds." });
        return;
    }

    // send out messages, posted will be an array of urls to messages which were
    // successfully posted
    const posted = await Promise.allSettled(
    // for all guilds...
        bot.guilds.cache.map(guild => {
            // get text channel with name (specified in user request)
            const channel = guild.channels.cache.find(
                c => c.name == channelName && c instanceof discord.TextChannel
            );
            // if channel exists: send user message into it and return msg url
            if (channel) {
                return channel.send(message.substr(0, MAX_POST_LENGTH))
                    .then(m => m.url).catch(console.error);
            }
            // return null / undefined for errors or if channel not found
            return null;
        })
    // filter and map to get array of urls
    ).then(results => results.filter(r => r.value).map(r => r.value));

    if (posted.length == 0) {
        res.status(500).send({
            error: "No messages were posted successfully. " +
            `Check text channel #${channelName} exists.`
        });
    } else {
        console.log("%s - Posted message '%s' in #%s in %i guild(s). " +
            "Message URLs: %s.", req.ip, req.body.message, channelName,
        posted.length, posted.join(", "));
        res.send({ posted });
    }
}
