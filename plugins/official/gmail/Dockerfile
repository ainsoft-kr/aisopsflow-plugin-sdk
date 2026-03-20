FROM node:22-alpine
WORKDIR /app
COPY plugins/official/gmail/package.json /app/package.json
RUN npm install --omit=dev
COPY plugins/official/gmail/src /app/src
COPY plugins/official/gmail/shared /app/shared
COPY plugins/official/gmail/runner-plugin.yaml /app/runner-plugin.yaml
COPY plugins/official/gmail/plugin.manifest.yaml /app/plugin.manifest.yaml
ENV PORT=9005
EXPOSE 9005
CMD ["npm", "start"]
