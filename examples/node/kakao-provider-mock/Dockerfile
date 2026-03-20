FROM node:22-alpine
WORKDIR /app
COPY examples/node/kakao-provider-mock/package.json /app/package.json
RUN npm install --omit=dev
COPY examples/node/kakao-provider-mock/src /app/src
COPY examples/node/kakao-provider-mock/shared /app/shared
COPY examples/node/kakao-provider-mock/runner-plugin.yaml /app/runner-plugin.yaml
COPY examples/node/kakao-provider-mock/plugin.manifest.yaml /app/plugin.manifest.yaml
ENV PORT=9011
EXPOSE 9011
CMD ["npm","start"]
