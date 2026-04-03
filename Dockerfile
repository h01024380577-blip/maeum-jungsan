FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/

FROM base AS builder
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build:next

FROM base AS runner
ENV NODE_ENV=production
RUN npm ci --only=production --legacy-peer-deps && npx prisma generate
COPY --from=builder /app/.next    ./.next
COPY --from=builder /app/public   ./public
COPY --from=builder /app/prisma   ./prisma
COPY --from=builder /app/package.json .
COPY --from=builder /app/next.config.ts .
EXPOSE 3000
CMD ["npm", "run", "start"]
