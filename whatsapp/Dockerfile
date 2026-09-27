# O build precisa do repositório inteiro: o módulo depende de @restaurante/shared
# e lê os configs em whatsapp/tenants/. Construa da RAIZ:
#     docker build -f whatsapp/Dockerfile -t barbearia-whatsapp .
FROM node:22-alpine

WORKDIR /app

# Dependências primeiro: o cache do Docker só é invalidado quando elas mudam.
COPY package.json package-lock.json ./
COPY shared/package.json  shared/
COPY site/package.json    site/
COPY whatsapp/package.json whatsapp/
RUN npm ci --omit=dev --workspace=@restaurante/whatsapp --include-workspace-root

COPY tsconfig.base.json ./
COPY shared/   shared/
COPY whatsapp/ whatsapp/

ENV NODE_ENV=production
EXPOSE 3333

# tsx roda o TypeScript direto — é assim que o módulo já roda hoje.
CMD ["npm", "run", "start", "-w", "@restaurante/whatsapp"]
