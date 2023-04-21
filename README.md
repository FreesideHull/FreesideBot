# Freeside Discord Bot
Discord bot as used on https://discord.freeside.uk. The bot currently does
the following:

Filters `#news` channel to only allow news articles (posts containing a working
web link) to be posted. A thread is automatically created for each article to
allow for discussion to take place. The thread title uses the article's
title (the OpenGraph title, falling back to the main title and then to the page
URL itself).

Assists with Freeside server infrastructure. The bot runs a small API web server
which currently allows fetching events, text messages and user info from the
server in JSON format.

Keeps an updated count of how many members there are in certain roles and in
the server as a whole. These stats are shown as locked voice channels.

Bot settings are passed through environment variables.

`DISCORD_TOKEN=` Token used to authenticate the bot. [Required]
`API_SERVER_ENABLED=`Enable API server.
[Default: true]  
`API_SERVER_HOST=` Host to open API server on.
[Default: 0.0.0.0]  
`API_SERVER_PORT=` Port to open API server on.
[Default: 8080]  
`API_SERVER_USERNAME=` Username required to authenticate to the API.
[Optional]  
`API_SERVER_PASSWORD=` Password required to authenticate to the API.
[Optional]  
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
# change port forwarding from 8080:8080 if you've used different port
docker run -d --restart=always -p 8080:8080 --name freesidebot \
    --env-file=./env freesidebot
```
Or you can use the public container from [here](https://hub.docker.com/r/freesidehull/freesidebot)

### Manual Install
```sh
git clone https://github.com/FreesideHull/FreesideBot
cd ./FreesideBot
npm install
export DISCORD_TOKEN=<bot token goes here> # use set DISCORD_TOKEN= on Windows
node bot.js
```

### API Server

All endpoints return data in JSON format. Summary of endpoints:

- `GET /events` - Get array of events currently listed on the discord server.
- `GET /messages?channel=general` - Get message feed from text channel.
- `GET /member?tag=YourName#1234` - Get member info by tag.
- `GET /member?id=123456789` - Get member info by discord user ID.

Use the "Basic" HTTP Authentication scheme to access API endpoints when both
`API_SERVER_USERNAME` and `API_SERVER_PASSWORD` are set.
