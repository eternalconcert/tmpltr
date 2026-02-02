FROM node:23
WORKDIR /app

ADD demo demo
ADD src src
ADD package.json .

RUN npm install

EXPOSE 3000

WORKDIR /app/demo
CMD ["node", "server.mjs"]
