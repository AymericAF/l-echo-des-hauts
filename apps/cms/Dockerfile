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
#
# ⚠️ CE start-period N'EST PAS CELUI QUI FIXE LA FENETRE DE BASCULE, et les confondre a
# coute un arbitrage. Il y en a DEUX, ils ne portent pas sur la meme chose, et un seul se
# lit ici :
#   1. CELUI-CI gouverne le verdict de Docker : pendant 90 s, un echec de la sonde ne
#      compte pas et le conteneur reste « starting ». C'est la valeur que porte l'image,
#      et c'est bien elle que le conteneur execute.
#   2. Celui de Coolify (interface > Healthchecks > Start Period) ne descend PAS dans le
#      conteneur quand l'image porte deja son propre HEALTHCHECK : Coolify journalise
#      « Custom healthcheck found in Dockerfile. » et laisse celui de l'image en place. Il
#      s'en sert autrement — comme d'une ATTENTE SECHE dans sa propre boucle de
#      deploiement, avant de commencer a interroger la sonde :
#      « Waiting for the start period (N seconds) before starting healthcheck. »
#      C'est donc LUI, et non la ligne ci-dessous, qui fixe le plancher de la fenetre
#      entre « New container started. » et « Removing old containers. ».
#
# CE QUI LE PROUVE, sur l'instance et non par lecture (releve du 2026-08-28, en lecture
# seule) : le conteneur en service depuis le deploiement 555 rend `docker inspect --format
# '{{json .Config.Healthcheck}}'` -> "StartPeriod":90000000000, soit 90 s — alors que
# Coolify portait 40 s a sa creation. Les deux valeurs coexistent sans se recouvrir. Et le
# journal du meme deploiement 555 les montre a l'oeuvre :
#
#   13:35:23.541  New container started.
#   13:35:23.559  Custom healthcheck found in Dockerfile.
#   13:35:23.594  Waiting for the start period (40 seconds) before starting healthcheck.
#   13:36:03.785  "healthy"
#   13:36:04.033  Removing old containers.          <- 40,5 s apres le demarrage
#
# CONSEQUENCE POUR QUI TOUCHE A CES LIGNES : allonger ou raccourcir le 90 ci-dessous ne
# deplacera PAS la fenetre de bascule ; cela ne change que la duree pendant laquelle un
# demarrage rate est tolere sans marquer le conteneur « unhealthy ». La fenetre, elle, se
# regle dans Coolify.
#
# ⚠️ CE QU'IL NE PROUVE PAS, ET QUI A COUTE UN BUILD DU SITE. Il teste qu'une connexion TCP
# est acceptee : ni que le schema est charge, ni que la route REST le sert. Coolify attend
# bien qu'il passe avant de marquer le deploiement « finished », mais le proxy route encore
# l'ANCIEN conteneur jusqu'a la bascule — et c'est dans cette bascule que le build STATIQUE
# du site tombe. Mesure du 2026-08-19 (tache `d0e0df3b`, commit c951b25, queues 529 et 530) :
#
#   08:03:07.68  CMS   Rolling update started.
#   08:03:46.41  SITE  [attendre-schema] schema PRET a la premiere passe (aucune attente).
#   08:03:49.67  CMS   « healthy »              <- 3,2 s APRES le vert de la sonde du site
#   08:03:49.95  CMS   Removing old containers.
#   08:03:50.11  SITE  npm run build : Strapi a repondu 502 sur /api/articles?… : Bad Gateway
#   08:03:52.64  CMS   Rolling update completed.
#
# DEUX CONSEQUENCES pour qui touche a ces lignes :
#   1. la sonde du site (`apps/web/scripts/attendre-schema.mjs`) a valide AVANT que le
#      conteneur neuf ne soit sain : elle a donc interroge l'ANCIEN. Un `200` de sa part ne
#      dit rien de la version servie tant que ce conteneur ne DIT pas laquelle il porte.
#      ~~ce qui n'existe pas aujourd'hui~~ — DEPUIS LE 2026-08-19, IL LA DIT : le middleware
#      global `src/middlewares/empreinte-commit.ts` pose `X-Echo-Commit` depuis
#      `SOURCE_COMMIT`, que Coolify injecte deja dans ce conteneur (lu dans `/proc/1/environ`,
#      valeur identique a l'etiquette de l'image). L'en-tete est pose AVANT `next()`, donc
#      porte aussi par le `400 ValidationError` de l'ancien schema — la seule reponse qu'il
#      soit vraiment utile d'identifier.
#      ⚠️ CE QUE CE HEALTHCHECK PROUVE N'A PAS CHANGE POUR AUTANT : il teste toujours une
#      connexion TCP, et l'empreinte ne le rend ni plus ni moins probant. Elle deplace la
#      question la ou elle se resout — dans la REPONSE, lue par qui interroge —, elle ne la
#      resout pas ici. Ne pas etre tente d'y brancher une verification de version : un
#      HEALTHCHECK qui echouerait sur une empreinte ferait rouler Coolify en arriere sur un
#      conteneur parfaitement sain.
#      ⚠️ ET LA SONDE N'EN FAIT RIEN DE BLOQUANT : elle LIT l'empreinte et la JOURNALISE. Le
#      CMS et le site ne portent le meme SHA que sur un push touchant les DEUX arbres
#      (`watch_paths`), si bien qu'une empreinte inegale est un etat NORMAL ;
#   2. ce qui traverse la fenetre vit cote site, dans `apps/web/src/lib/strapi/client.ts`
#      (reprises sur 502/503/504). Allonger le `start-period` ICI ne la fermerait PAS : elle
#      s'ouvre au moment de la bascule, pas avant.
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD node -e "require('net').connect(1337,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"
CMD ["npm", "run", "start"]