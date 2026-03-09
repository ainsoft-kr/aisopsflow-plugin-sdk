FROM node:22-alpine
WORKDIR /app
COPY examples/node/kakao-webhook-simulator/package.json /app/package.json
RUN npm install --omit=dev
COPY examples/node/kakao-webhook-simulator/src /app/src
COPY examples/node/kakao-webhook-simulator/shared /app/shared
ENV PORT=9010
EXPOSE 9010
CMD ["npm","start"]
