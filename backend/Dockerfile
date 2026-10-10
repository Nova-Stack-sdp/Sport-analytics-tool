FROM node:24-alpine

WORKDIR /app

# Install system dependencies once
RUN for i in 1 2 3; do apk add --no-cache openssl && break || sleep 5; done

# Copy only dependency manifests for layer caching
COPY package*.json ./

# Install dependencies (cached layer if package*.json unchanged)
RUN npm config set fetch-retries 5 fetch-retry-mintimeout 5000 \
  && npm ci --ignore-scripts --no-audit --no-fund

# Copy Prisma schema and config
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY jest.config.js ./

# Generate Prisma client
RUN npx prisma generate

# Copy application source (invalidates cache only if src changed)
COPY src ./src

EXPOSE 8080

CMD ["npm", "start"]
