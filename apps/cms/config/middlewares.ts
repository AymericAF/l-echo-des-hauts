import type { Core } from '@strapi/strapi';

const config: Core.Config.Middlewares = [
  'strapi::logger',
  'strapi::errors',
  // Le conteneur DIT quel commit il sert (`X-Echo-Commit`) — sans quoi un `200` du CMS ne dit
  // rien de la VERSION qui a repondu, et la sonde de schema du site valide sur l ANCIEN
  // conteneur, encore route par le proxy (mesure du 2026-08-19, queues 529 et 530).
  // DANS la portee de `strapi::errors`, et avant tout le reste : l'en-tete est pose AVANT
  // `next()`, ce qui le fait porter par les reponses d'ERREUR — dont le `400 ValidationError`
  // de l'ancien schema, la seule qu'il soit vraiment utile d'identifier.
  // Voir `src/middlewares/empreinte-commit.ts`.
  'global::empreinte-commit',
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'connect-src': ["'self'", 'https:'],
          // Le provider local sert les medias depuis l'origine de Strapi :
          // aucun hote tiers a ouvrir (A3 a supprime l'ouverture vers R2).
          'img-src': ["'self'", 'data:', 'blob:'],
          'media-src': ["'self'", 'data:', 'blob:'],
          upgradeInsecureRequests: null,
        },
      },
    },
  },
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
  // Le role Public ne lit que du publie, et c'est ce middleware qui le tient —
  // la permission `find` de Strapi emporte `?status=draft`, sans granularite.
  // APRES `strapi::query`, qui pose l'accesseur qs sur lequel il ecrit.
  // Voir `src/middlewares/statut-publie.ts` (decision 7106948b, branche A).
  'global::statut-publie',
];

export default config;
