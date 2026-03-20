FROM node:22-alpine
WORKDIR /app
COPY plugins/official/channel-telegram/package.json /app/package.json
RUN npm install --omit=dev
COPY plugins/official/channel-telegram/src /app/src
COPY plugins/official/channel-telegram/shared /app/shared
COPY plugins/official/channel-telegram/runner-plugin.yaml /app/runner-plugin.yaml
COPY plugins/official/channel-telegram/plugin.manifest.yaml /app/plugin.manifest.yaml
ENV PORT=9002
EXPOSE 9002
CMD ["npm","start"]
