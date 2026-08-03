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
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:1337/_health || exit 1
CMD ["npm", "run", "start"]