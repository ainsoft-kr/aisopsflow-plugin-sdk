FROM node:22-alpine
WORKDIR /app
COPY plugins/official/microsoft-office/package.json /app/package.json
RUN npm install --omit=dev
COPY plugins/official/microsoft-office/src /app/src
COPY plugins/official/microsoft-office/shared /app/shared
COPY plugins/official/microsoft-office/runner-plugin.yaml /app/runner-plugin.yaml
COPY plugins/official/microsoft-office/plugin.manifest.yaml /app/plugin.manifest.yaml
ENV PORT=9007
EXPOSE 9007
CMD ["npm", "start"]
