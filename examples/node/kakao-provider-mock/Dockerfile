FROM node:22-alpine
WORKDIR /app
COPY examples/node/kakao-provider-mock/package.json /app/package.json
RUN npm install --omit=dev
COPY examples/node/kakao-provider-mock/src /app/src
COPY examples/node/kakao-provider-mock/shared /app/shared
ENV PORT=9011
EXPOSE 9011
CMD ["npm","start"]
