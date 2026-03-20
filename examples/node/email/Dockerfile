FROM node:22-alpine
WORKDIR /app
COPY examples/node/email/package.json /app/package.json
RUN npm install --omit=dev
COPY examples/node/email/src /app/src
COPY examples/node/email/shared /app/shared
COPY examples/node/email/runner-plugin.yaml /app/runner-plugin.yaml
COPY examples/node/email/plugin.manifest.yaml /app/plugin.manifest.yaml
ENV PORT=9001
EXPOSE 9001
CMD ["npm","start"]
