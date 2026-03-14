FROM node:22-alpine
WORKDIR /app
COPY examples/node/gmail/package.json /app/package.json
RUN npm install --omit=dev
COPY examples/node/gmail/src /app/src
COPY examples/node/gmail/shared /app/shared
COPY examples/node/gmail/plugin.manifest.yaml /app/plugin.manifest.yaml
ENV PORT=9005
EXPOSE 9005
CMD ["npm", "start"]
