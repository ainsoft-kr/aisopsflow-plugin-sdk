FROM node:22-alpine
WORKDIR /app
COPY examples/node/slack/package.json /app/package.json
RUN npm install --omit=dev
COPY examples/node/slack/src /app/src
COPY examples/node/slack/shared /app/shared
ENV PORT=9000
EXPOSE 9000
CMD ["npm","start"]
