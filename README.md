# Freeside Discord Bot
Discord bot as used on https://discord.freeside.co.uk. The bot currently does
the following:

Filters `#news` channel to only allow news articles (posts containing a working
web link) to be posted. A thread is automatically created for each article to
allow for discussion to take place. The thread title uses the article's
title (the OpenGraph title, falling back to the main title if not found).

Assists in monitoring Freeside server infrastructure. The bot runs a small REST
API web server to easily allow servers to send message notifications through the
bot.

Bot settings are passed through environment variables.

`DISCORD_TOKEN=` Token used to authenticate the bot. [Required]  
`REST_API_SERVER_ENABLED=`Enable REST API server.
[Default: true]  
`REST_API_SERVER_HOST=` Host to open REST API server on.
[Default: 0.0.0.0]  
`REST_API_SERVER_PORT=` Port to open REST API server on.
[Default: 8000]  
`REST_API_SERVER_USERNAME=` Username required to authenticate to REST API. 
[Optional]  
`REST_API_SERVER_PASSWORD=` Password required to authenticate to REST API.
[Optional]  
`PUBLIC_REPLY_DECAY_TIME=` Time it takes for a public message (at a user) to be
automatically deleted in ms.
[Default: 120000ms (2mins) ]

### Docker Install
You will need a file to set environment variables in. Create one called `./env`,
 this will be ignored by Git. Change port 8000 to 
```sh
git clone https://github.com/FreesideHull/FreesideBot
cd ./FreesideBot
docker build -t freesidebot .
# change port forwarding from 8000:8000 if you've used different port
docker run -d --restart=always -p 8000:8000 --name freesidebot \
    --env-file=./env freesidebot
```

### Manual Install
```sh
git clone https://github.com/FreesideHull/FreesideBot
cd ./FreesideBot
npm install
export DISCORD_TOKEN=<bot token goes here> # use set DISCORD_TOKEN= on Windows
node bot.js
```

### REST API
`POST` request parameters are always in the form of a string to string key value
map. Parameters can passed through the request body (either URL encoded format
or JSON format) or be included in the URL query string. Responses are always in
JSON format.

Status code is set `200` when successful, `400` if request is invalid and `500`
if the server encounters an error. A request that can't be fulfilled will
always return an object with an `error` attribute containing an error message
(e.g `{error: "Error message. Something went wrong!"}`).

Authentication is done through HTTP Basic Authentication scheme. All endpoints
require authentication. Both username and password must be set for auth to be
enabled.
***
## `POST /send`
Send a Discord text message into a specified text channel. 

Since channel is specified by name and not ID, the bot will check through all
guilds for a channel with the specified name and post into all channels that it
finds.

### `Parameters`

| Name      | Summary                                               |
|-----------|-------------------------------------------------------|
| `channel` | Name of channel to post into (e.g `general`).         |
| `message` | Text message to post (e.g. `@everyone Hello World!`). |

### `Response`
| Attribute | Summary                                   | Type       |
|-----------|-------------------------------------------|------------|
| `posted`  | URLs to all successfully posted messages. | `string[]` |
***

#### API Use Example:
Use cURL to post `Hello World!` to `#testing`. Authenticate as user `bob` with
password `pass123`\.  
`> curl -d "channel=testing" -d "message=Hello World! -u bob:pass123
http://localhost:8000/send`  
`{"posted":["https://discord.com/channels/57123123..."]}`
