FROM node:22-alpine
WORKDIR /app
COPY packages/js /app/packages/js
COPY plugins/official/channel/kakao /app/plugins/official/channel/kakao
WORKDIR /app/plugins/official/channel/kakao
RUN npm install --omit=dev
ENV PORT=9011
EXPOSE 9011
CMD ["npm","start"]
