FROM node:22-alpine
WORKDIR /app
COPY examples/node/microsoft-email/package.json /app/package.json
RUN npm install --omit=dev
COPY examples/node/microsoft-email/src /app/src
COPY examples/node/microsoft-email/shared /app/shared
COPY examples/node/microsoft-email/plugin.manifest.yaml /app/plugin.manifest.yaml
ENV PORT=9006
EXPOSE 9006
CMD ["npm", "start"]
