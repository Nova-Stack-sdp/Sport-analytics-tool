FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm config set fetch-retries 5 fetch-retry-mintimeout 5000 \
  && npm ci --ignore-scripts --no-audit --no-fund

COPY . .

EXPOSE 3000

CMD ["npm", "start"]