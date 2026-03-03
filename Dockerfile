FROM node:20-slim

RUN apt-get update && apt-get install -y git python3 build-essential && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production=false

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

ENV NODE_ENV=production

ENTRYPOINT ["node"]
