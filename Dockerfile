from node:22

ADD demo demo
ADD src src

EXPOSE 3000

WORKDIR demo
CMD ["node", "server.mjs"]
