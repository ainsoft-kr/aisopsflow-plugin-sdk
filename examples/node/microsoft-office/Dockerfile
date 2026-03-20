FROM node:22-alpine
WORKDIR /app
COPY examples/node/microsoft-office/package.json /app/package.json
RUN npm install --omit=dev
COPY examples/node/microsoft-office/src /app/src
COPY examples/node/microsoft-office/shared /app/shared
COPY examples/node/microsoft-office/runner-plugin.yaml /app/runner-plugin.yaml
COPY examples/node/microsoft-office/plugin.manifest.yaml /app/plugin.manifest.yaml
ENV PORT=9007
EXPOSE 9007
CMD ["npm", "start"]
