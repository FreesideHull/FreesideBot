const fs = require("fs");
const cheerio = require("cheerio");
const axios = require("axios");
const escape = require("discord-escape");
const discord = require("discord.js");

const client = new discord.Client({
    intents: ["GUILDS", "GUILD_MESSAGES", "DIRECT_MESSAGES"]
});

// time taken for public messages to expire and be deleted (ms).
const MESSAGE_EXPIRE_TIME = process.env.MESSAGE_EXPIRE_TIME || 120000;

if (!process.env.DISCORD_TOKEN) {
    console.log("Set DISCORD_TOKEN environment variable.");
    process.exit(1);
}
client.login(process.env.DISCORD_TOKEN.trim());

client.once("ready", () => {
    console.log("Bot is now running.");
});

client.on("messageCreate", message => {
    // ignore bots
    if (message.author.bot) return; 
    // deal with server text channels only
    if (!(message.channel instanceof discord.TextChannel)) return;
    // #news channel
    if (message.channel.name == "news") return moderateNewsMessage(message);
});

/**
    Inform user with a text message. First tries to send message to the user's
    DM channel. If this fails (user has it closed) then the message will be
    sent in publicChannel. Exception is thrown forward if this fails still.
    
    Message sent in publicChannel will expire and be deleted after a set period
    of time for cleanliness. See MESSAGE_EXPIRE_TIME.
*/
async function inform(user, publicChannel, content, tryingPublic = false) {
    // tag user prefix
    content = user.toString() + "\n" + content;
    // channel to send in
    const channel = (tryingPublic && publicChannel) || user.dmChannel ||
        await user.createDM();
    let message;
    try {
        message = await channel.send(content);
    } catch (e) {
        // message already tried through dms, public channel now also failed
        if (tryingPublic) throw e;
        // sending dm to user failed, try posting in public channel
        message = await inform(user, publicChannel, content, true);  
        // clean up public messages after time
        await new Promise(resolve => setTimeout(resolve, MESSAGE_EXPIRE_TIME));
        await message.delete();
    }
    return message;
}

/*
    Remove a user's message with a reason.
*/
async function removeMessage(message, reason) {
    /*
        Send message to author with their quoted message and why it was removed. 

        > message content quoted (replace "\n" with "\n>"to continue quote over
            multiple lines)
        ** This message was removed ** (reason)
    */
    await inform(message.author, message.channel, 
        "> " + escape(message.content).replace(/\n/g, "\n> ") + "\n" +
        "**This message was removed.** " + reason);
    await message.delete();
}

/*
    Called every time a message is posted into news channel.
*/
async function moderateNewsMessage(message) {
    /*
        The news channel can only contain links to news stories. A hyperlink to
        a page containing an 'og:title' meta tag is considered a news story. A
        message posted which does not contain this will be rejected.
    */
    const match = message.content.match(/https?:\/\/[^ "]{2,}/);
    const title = match && await fetchOgTitle(match[0]);
    if (title) {
        // message determined to be a news story       
        await message.startThread({
            name: title.substr(0, 100)
        });
    } else {
        // not a news story, remove message
        await removeMessage(message, "Please only post news articles. " +
            "Discussion on news stories should take place inside their " +
            "designated thread which will be created automatically.");
    }
}

/*
    Fetch Open Graph title from a web page by its URL. Returns null if not
    found, page is not valid HTML or connection fails.
*/
async function fetchOgTitle(url) {
    let response;
    try {
        response = await axios.get(url, {
            headers: {
                /*
                    Use Chrome / Windows 10 user agent as a precaution against
                    bad news sites which may reject requests due to user agent.
                */
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                    "AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/97.0.4692.99 Safari/537.36"
            }
        });
    } catch {
        return null;
    }
    const selection = cheerio.load(response.data)("meta[property=og:title]");
    if (selection.length == 0) {
        return null;
    }
    return selection.attr("content");
}
