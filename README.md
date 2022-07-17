# Freeside Discord Bot
Discord bot as used on https://discord.freeside.co.uk. The bot currently does
the following:

Filters `#news` channel to only allow news articles (posts containing a working
web link) to be posted. A thread is automatically created for each article to
allow for discussion to take place. The thread title uses the article's
title (the OpenGraph title, falling back to the main title and then to the page
URL itself).

Keeps an updated count of how many members there are in certain roles and in
the server as a whole. These stats are shown as locked voice channels.

Bot settings are passed through environment variables.

`DISCORD_TOKEN=` Token used to authenticate the bot. [Required]  
`STATS_ENABLED=`Enable guild statistics (member count display in the form of
locked voice channels).
[Default: true]  
`STATS_CATEGORY_NAME=` Name of category channel created for listing stats.
[Default: stats]  
`STATS_UPDATE_INTERVAL=` How often stats should be updated in ms.
[Default: 600000 (10mins) ]  
`STATS_COUNT_ROLES=` Comma delimited list of roles (by name) that should have
a member count shown. (e.g. `freesiders,alumni`)
[Optional]  
`PUBLIC_REPLY_DECAY_TIME=` Time it takes for a public message (at a user) to be
automatically deleted in ms.
[Default: 120000ms (2mins) ]

### Docker Install
You will need a file to set environment variables in. Create one called `./env`,
 this will be ignored by Git.
```sh
git clone https://github.com/FreesideHull/FreesideBot
cd ./FreesideBot
docker build -t freesidebot .
docker run -d --restart=always --name freesidebot --env-file=./env freesidebot
```

### Manual Install
```sh
git clone https://github.com/FreesideHull/FreesideBot
cd ./FreesideBot
npm install
export DISCORD_TOKEN=<bot token goes here> # use set DISCORD_TOKEN= on Windows
node bot.js
```
