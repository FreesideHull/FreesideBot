FROM node:18.14-alpine3.16
WORKDIR /usr/src/app

COPY . .
RUN npm install

USER 13000:13000
CMD [ "node", "bot.js" ]
