FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY jest.config.js ./


# Prisma generates its client during npm install. It only needs a syntactically
# valid URL at build time; the real URL is supplied by backend/.env at runtime.
RUN DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" npm ci

COPY src ./src
COPY tests ./tests

EXPOSE 8080

CMD ["npm", "start"]