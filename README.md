# Freeside Discord Bot
Discord bot as used on https://discord.freeside.co.uk. Current use is filtering
the `#news` channel to only allow news articles (posts containing a working
web link) to be posted. A thread is automatically created for each article to
allow for discussion to take place. The thread title uses the news article's
title (the OpenGraph title, falling back to the main title if not found).

Settings are passed through environment variables.

`DISCORD_TOKEN=` Token used to authenticate the bot. [Required]

`MESSAGE_EXPIRE_TIME=` Time it takes for a public message (at a user) to be
automatically deleted in miliseconds. Default is 2 minutes (12000ms).

### Docker Usage:
You will need a file to set environment variables in. Create one called `./env`,
 this will be ignored by Git.
```sh
git clone https://github.com/FreesideHull/FreesideBot
cd ./FreesideBot
docker build -t freesidebot .
docker run -d --name freesidebot --env-file=./env freesidebot
```

### Manual Usage:
```sh
git clone https://github.com/FreesideHull/FreesideBot
cd ./FreesideBot
npm install
export DISCORD_TOKEN=<bot token goes here> # use set DISCORD_TOKEN= on Windows
node bot.js
```
