FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node public ./public
COPY --chown=node:node server ./server
COPY --chown=node:node scripts ./scripts
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4174 DATA_DIR=/app/data
EXPOSE 4174
VOLUME ["/app/data"]
CMD ["node", "server/index.mjs"]
