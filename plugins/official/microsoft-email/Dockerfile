FROM node:22-alpine
WORKDIR /app
COPY plugins/official/microsoft-email/package.json /app/package.json
RUN npm install --omit=dev
COPY plugins/official/microsoft-email/src /app/src
COPY plugins/official/microsoft-email/shared /app/shared
COPY plugins/official/microsoft-email/runner-plugin.yaml /app/runner-plugin.yaml
COPY plugins/official/microsoft-email/plugin.manifest.yaml /app/plugin.manifest.yaml
ENV PORT=9006
EXPOSE 9006
CMD ["npm", "start"]
