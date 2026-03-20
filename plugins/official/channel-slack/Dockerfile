FROM node:22-alpine
WORKDIR /app
COPY plugins/official/channel-slack/package.json /app/package.json
RUN npm install --omit=dev
COPY plugins/official/channel-slack/src /app/src
COPY plugins/official/channel-slack/shared /app/shared
COPY plugins/official/channel-slack/runner-plugin.yaml /app/runner-plugin.yaml
COPY plugins/official/channel-slack/plugin.manifest.yaml /app/plugin.manifest.yaml
ENV PORT=9000
EXPOSE 9000
CMD ["npm","start"]
