FROM node:22-alpine
WORKDIR /app
COPY plugins/official/kakao-provider/package.json /app/package.json
RUN npm install --omit=dev
COPY plugins/official/kakao-provider/src /app/src
COPY plugins/official/kakao-provider/shared /app/shared
COPY plugins/official/kakao-provider/runner-plugin.yaml /app/runner-plugin.yaml
COPY plugins/official/kakao-provider/plugin.manifest.yaml /app/plugin.manifest.yaml
ENV PORT=9011
EXPOSE 9011
CMD ["npm","start"]
