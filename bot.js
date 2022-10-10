const axios = require("axios");
const cheerio = require("cheerio");
const discord = require("discord.js");
const express = require("express");
require("console-stamp")(console); // add console timestamp and log level info

// bot options (see README)
if (!process.env.DISCORD_TOKEN) {
    console.error("Set required DISCORD_TOKEN environment variable.");
    process.exit(1);
}
const DISCORD_TOKEN = process.env.DISCORD_TOKEN.trim();
const PUBLIC_REPLY_DECAY_TIME = process.env.PUBLIC_REPLY_DECAY_TIME || 120000;
const MAX_THREAD_TITLE_LENGTH = 100;

const API_SERVER_ENABLED = (process.env.API_SERVER_ENABLED ||
    "true").trim().match("^(true|on|y|1)") != null;
const API_SERVER_HOST = (process.env.API_SERVER_HOST ||
    "0.0.0.0").trim();
const API_SERVER_PORT = Number(process.env.API_SERVER_PORT) || 8000;

const STATS_ENABLED = (process.env.STATS_ENABLED || "true").trim()
    .match("^(true|on|y|1)") != null;
const STATS_CATEGORY_NAME = (process.env.STATS_CATEGORY_NAME || "stats").trim();
const STATS_UPDATE_INTERVAL = Number(process.env.STATS_UPDATE_INTERVAL) ||
    600000;
const STATS_COUNT_ROLES = (process.env.STATS_COUNT_ROLES || "").split(",")
    .map(name => name.trim().toLowerCase())
    .filter(name => name.length != 0);

// setup bot
botSetup(DISCORD_TOKEN).catch((e) => {
    console.error(e);
    process.exit(1);
});

// BOT CODE...

/*
    Connect bot and setup event handlers.
*/
async function botSetup (token) {
    const bot = new discord.Client({
        intents: ["GUILDS", "GUILD_MESSAGES", "GUILD_MEMBERS",
            "DIRECT_MESSAGES"]
    });

    bot.on("messageCreate", m => {
        // ignore own and other bots
        if (m.author.bot) return;
        // deal with server text channels only
        if (m.channel.type != "GUILD_TEXT") return;
        // #news channel
        if (m.channel.name == "news") return handleNewsMessage(m);
    });

    bot.login(token);
    await new Promise((resolve, reject) => {
        bot.once("ready", resolve);
        bot.once("error", reject);
    });
    console.log("Bot is now online.");

    let guild = bot.guilds.cache.first();
    if (!guild) {
        console.warn("Waiting for bot to be added to a guild...");
        guild = await new Promise(resolve => {
            bot.once("guildCreate", resolve);
        });
        console.log(`Joined guild '${guild.name}' (${guild.id}).`);
    }
    await guildStatsSetup(guild);

    await apiServerSetup(bot, guild);
    console.log("Ready.");
}

function apiServerSetup (bot, guild) {
    if (!API_SERVER_ENABLED) return;
    const server = express();
    const listener = server.listen(API_SERVER_PORT, API_SERVER_HOST);

    // basic logging of requests
    server.use((req, res, next) => {
        let requestedWith = req.get("User-Agent") || "";
        if (requestedWith) requestedWith = " with " + requestedWith;
        console.log("%s - Requested %s %s://%s:%i%s%s.", req.ip, req.method,
            req.protocol, req.hostname, listener.address().port, req.url,
            requestedWith);
        next();
    });

    //server.use(express.urlencoded({ extended: true }));
    // setup GET request handlers
    server.get("/messages", (req, res) => apiGetMessages(bot, guild, req, res));
    server.get("/events", (req, res) => apiGetEvents(bot, guild, req, res));
    server.get("/member", (req, res) => apiGetMember(bot, guild, req, res));

    // setup server listener
    return new Promise((resolve, reject) => {
        listener.once("listening", () => {
            console.log("API server is listening on %s:%i.",
                API_SERVER_HOST, listener.address().port);
            resolve(server);
        });
        listener.once("error", e => reject(e));
    });
}

async function apiGetMessages (bot, guild, req, res) {
    const channel = (await guild.channels.fetch()).find(
        c => c instanceof discord.BaseGuildTextChannel &&
            // check everyone can view channel (don't expose private channels)
            c.permissionsFor(guild.roles.everyone).has("VIEW_CHANNEL") &&
            (!req.query.channel || req.query.channel == c.name)
    );
    if (!channel) {
        res.status(404).send({error: "Text channel not found."});
        return;
    }
    res.send(await channel.messages.fetch({
        limit: Math.min(Number(req.query.limit) || 25, 500),
        cache: false
    }));
}

async function apiGetEvents (bot, guild, req, res) {
    res.send(await guild.scheduledEvents.fetch());
}

async function apiGetMember (bot, guild, req, res) {
    const member = (await guild.members.fetch()).find(
        m => (req.query.id && req.query.id == m.id) ||
            (req.query.tag && m.user.tag.startsWith(req.query.tag))
    );
    if (!member) {
        res.status(404).send({error: "Member not found."});
        return;
    }    
    res.send({
        id: member.id,
        tag: member.user.tag,
        displayName: member.displayName,
        // displayHexColor returns "#000000" if color not set, use null instead.
        displayColor: member.displayColor == 0 ? null : member.displayHexColor,
        // two avatar functions, what's the difference?
        avatarUrl: member.displayAvatarURL() || member.avatarURL() 
    });
}

/*
    Setup guild statistics display. Stats such as total member count, how many
    members there are in certain roles, etc. are displayed as locked voice
    channels.
*/
async function guildStatsSetup (guild) {
    if (!STATS_ENABLED) return;
    console.log("Setting up guild statistics (server stats shown as locked " +
        `voice channels) on '${guild.name}' (${guild.id}).`); 
    // get roles specified in by name in STATS_COUNT_ROLES
    const roles = guild.roles.cache
        .filter(role => STATS_COUNT_ROLES.includes(role.name.toLowerCase()));
    // array of stats to show (functions returning stat string)
    const statFuncs = [
        // total member count function
        () => "Discord Members: " + guild.members.cache
            .filter(m => !m.user.bot).size.toLocaleString(),
        // role member count functions
        ...roles.map(role =>
            () => `${role.name}: ${role.members.size.toLocaleString()}`)
    ];
    await guildStatsUpdate(guild, statFuncs);
    setInterval(() => guildStatsUpdate(guild, statFuncs).catch(console.error),
        STATS_UPDATE_INTERVAL);
}

/*
    Function ran on an interval (STATS_UPDATE_INTERVAL) ms to update stats.
*/
async function guildStatsUpdate (guild, statFuncs) {
    // ensure updated channel and member lists
    await Promise.all([guild.members.fetch(), guild.channels.fetch()]); 
    // get category with name specified by STATS_CATEGORY_NAME
    const category = guild.channels.cache.find(c => c.type == "GUILD_CATEGORY"
        && c.name.toLowerCase() == STATS_CATEGORY_NAME.toLowerCase()) ||
        // or create if one doesn't exist
        await guild.channels.create(STATS_CATEGORY_NAME, { 
            name: STATS_CATEGORY_NAME,
            type: "GUILD_CATEGORY",
            permissionOverwrites: [{
                id: guild.id,
                deny: ["VIEW_CHANNEL"]
            }]
        });
    // get channels under the stats category
    const channels = guild.channels.cache
        .filter(c => c.parent == category && c.type == "GUILD_VOICE")
        .sort((a, b) => a.position - b.position);
    // update stat readings (set voice channel names)
    await Promise.all(
        [...statFuncs.keys()].map(indexNum => {
            const func = statFuncs[indexNum]; // func returns stat to display
            if (indexNum >= channels.size) // if no channel for this stat func
                return createLockedVoiceChannel(guild, func(), category);
            return channels.at(indexNum).setName(func());
        })
    );
}

/*
    Create a locked voice channel with set name and in specified category.
    (used for creating channels showing stats in name)
*/
function createLockedVoiceChannel (guild, name, category) {
    return guild.channels.create(name, {
        type: "GUILD_VOICE",
        parent: category,
        permissionOverwrites: [{
            id: guild.id,
            deny: ["VIEW_CHANNEL"]
        }]
    });
}

/*
    Called every time a message is posted into news channel.
*/
async function handleNewsMessage (message) {
    /*
        The news channel can only contain links to news stories.
        A message posted which does not contain a working link will be rejected.
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
                .replaceAll("/", "\u2044").replaceAll(":", "\u02d0")
            
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

    return url;
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
    await inform(message.author, "> " +
        discord.Util.escapeMarkdown(message.content).replace(/\n/g, "\n> ") +
        `\n**This message was removed.** ${reason}`, message.channel);
}
