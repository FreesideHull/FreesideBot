const fs = require("fs");
const cheerio = require("cheerio");
const axios = require("axios");
const escape = require("discord-escape");
const discord = require("discord.js");

const client = new discord.Client({
    intents: ["GUILDS", "GUILD_MESSAGES", "DIRECT_MESSAGES"]
});

// load token from file
if (!fs.existsSync("token") || !fs.lstatSync("token").isFile()) {
    console.log("Discord token file ( ./token ) missing.");
    process.exit(1);
}
const token = fs.readFileSync("token", "utf-8").split(/\r?\n\r?/)[0].trim();
client.login(token);

client.on("messageCreate", message => {
    if (!(message.channel instanceof discord.TextChannel)) return;
    if (message.channel.name == "news") return moderateNewsMessage(message);
});

async function removeMessage(message, reason) {
    const dmChannel = message.author.dmChannel ||
        await message.author.createDM();
    /*
        Send direct message to author with their quoted message and why it was
        removed. 
        
        @usertag (followed by newline)
        > message content quoted (replace "\n" with "\n>"to continue quote over
            multiple lines)
        ** This message was removed ** (reason)
    */ 
    await dmChannel.send(message.author.toString() + "\n" +
        "> " + escape(message.content).replace(/\n/g, "\n> ") + "\n" +
        "**This message was removed.** " + reason);
    await message.delete();
}

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
            name: title
        });
    } else {
        // not a news story, remove message
        await removeMessage(message, "Please only post news articles. " +
            "Discussion on news stories should take place inside their " +
            "designated thread which will be created automatically.");
    }
}

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
