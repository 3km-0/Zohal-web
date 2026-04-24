FROM mcr.microsoft.com/playwright:v1.54.2-jammy

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
ENV PORT=8080

CMD ["npm", "start"]
