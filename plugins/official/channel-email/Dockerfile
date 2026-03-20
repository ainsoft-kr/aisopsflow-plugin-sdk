FROM node:22-alpine
WORKDIR /app
COPY plugins/official/channel-email/package.json /app/package.json
RUN npm install --omit=dev
COPY plugins/official/channel-email/src /app/src
COPY plugins/official/channel-email/shared /app/shared
COPY plugins/official/channel-email/runner-plugin.yaml /app/runner-plugin.yaml
COPY plugins/official/channel-email/plugin.manifest.yaml /app/plugin.manifest.yaml
ENV PORT=9001
EXPOSE 9001
CMD ["npm","start"]
