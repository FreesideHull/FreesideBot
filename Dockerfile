FROM node:17
WORKDIR /usr/src/app

COPY . .
RUN npm install

CMD [ "node", "bot.js" ]
