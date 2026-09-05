FROM node:24-bookworm-slim

WORKDIR /app

COPY package*.json ./

RUN npm ci --no-audit --no-fund

COPY prisma ./prisma
COPY prisma.config.ts ./
COPY jest.config.js ./

RUN npx prisma generate

COPY src ./src

CMD ["npm", "start"]