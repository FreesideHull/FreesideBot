FROM node:17
WORKDIR /usr/src/app

COPY . .
RUN npm install

USER 13000:13000
CMD [ "node", "bot.js" ]
