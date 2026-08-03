# Build stage
FROM node:22-alpine AS build
RUN apk update && apk add --no-cache build-base gcc autoconf automake zlib-dev libpng-dev bash vips-dev git

WORKDIR /opt/
COPY package.json package-lock.json ./
RUN npm install -g node-gyp
# vips-dev est installe ci-dessus : sans cette variable, sharp prefere compiler
# contre la libvips systeme plutot que d'utiliser son binaire precompile, et
# la compilation echoue (« Please add node-addon-api to your dependencies »).
# Le package-lock.json contient bien @img/sharp-linuxmusl-x64 : il n'y a rien a compiler.
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
RUN npm config set fetch-retry-maxtimeout 600000 -g && npm ci
ENV PATH=/opt/node_modules/.bin:$PATH

WORKDIR /opt/app
COPY . .
# Uncomment the following lines to set the admin panel URL at build time.
# Without this, the admin panel defaults to localhost:1337.
# ARG STRAPI_ADMIN_BACKEND_URL
# ENV STRAPI_ADMIN_BACKEND_URL=${STRAPI_ADMIN_BACKEND_URL}
ENV NODE_ENV=production
RUN npm run build

# Production stage
FROM node:22-alpine
# curl est requis par le healthcheck de Coolify, qui l'essaie AVANT wget.
# wget existe deja (BusyBox), curl non — d'ou l'avertissement au deploiement
# « The healthcheck needs a curl or wget command ... make sure that it is
# available in the image », suivi de « New container is not healthy, rolling
# back ». Constate le 2026-08-03 : `which wget` rend /usr/bin/wget, `which curl`
# rend ABSENT, alors que Strapi demarrait correctement.
RUN apk add --no-cache vips-dev curl
ENV NODE_ENV=production

WORKDIR /opt/
COPY --from=build /opt/package.json /opt/package-lock.json ./
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
RUN npm ci --omit=dev && npm cache clean --force  # --omit=dev replaces the deprecated --only=production
ENV PATH=/opt/node_modules/.bin:$PATH

WORKDIR /opt/app
COPY --from=build /opt/app ./

RUN chown -R node:node /opt/app
USER node
EXPOSE 1337
# HEALTHCHECK OBLIGATOIRE : Coolify ne tolere pas son absence. Retire le 2026-08-03,
# le deploiement a echoue autrement — « docker inspect --format='{{json
# .State.Health.Status}}' … : map has no entry for key "Health" ». Coolify SUPPOSE que la
# cle existe ; sans HEALTHCHECK dans l'image, son inspection plante et il roule en arriere.
#
# La commande teste UNIQUEMENT que le port accepte une connexion TCP, avec node — deja
# present. Elle n'utilise ni wget ni curl, ne depend d'aucun chemin HTTP, d'aucun code de
# retour et d'aucune resolution de « localhost ». C'est ce qui la distingue de la version
# precedente (`wget --spider http://localhost:1337/_health`), qui echouait sans jamais dire
# pourquoi : elle cumulait quatre causes possibles, dont `config/server.ts` qui prend
# `host: env('HOST', '0.0.0.0')` — une variable HOST dans Coolify et Strapi n'ecoute plus
# sur localhost, alors que le proxy, lui, l'atteint parfaitement.
#
# start-period a 90s : Strapi mettait ~40s a journaliser « started successfully ».
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD node -e "require('net').connect(1337,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"
CMD ["npm", "run", "start"]