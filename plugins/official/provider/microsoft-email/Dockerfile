FROM node:22-alpine
WORKDIR /app
COPY packages/js /app/packages/js
COPY plugins/official/provider/microsoft-email /app/plugins/official/provider/microsoft-email
WORKDIR /app/plugins/official/provider/microsoft-email
RUN npm install --omit=dev
ENV PORT=9006
EXPOSE 9006
CMD ["npm", "start"]
