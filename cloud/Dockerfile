FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY cloud/worker.mjs ./cloud/worker.mjs
USER node
CMD ["node", "cloud/worker.mjs"]
