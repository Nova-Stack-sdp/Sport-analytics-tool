FROM node:22-bookworm-slim
WORKDIR /app

COPY package*.json ./

RUN npm ci --no-audit --no-fund --verbose

COPY . .

ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]