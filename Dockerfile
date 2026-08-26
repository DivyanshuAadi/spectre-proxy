FROM node:22-alpine

WORKDIR /app

# Zero npm dependencies — no install step required.
COPY package.json server.js ./
COPY src ./src
COPY public ./public

RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV NODE_ENV=production
EXPOSE 3005

CMD ["node", "server.js"]
