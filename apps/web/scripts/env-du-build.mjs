/**
 * LA RESOLUTION DES VARIABLES DU BUILD — un seul domicile, et la raison d y tenir.
 *
 * Astro n expose a `import.meta.env` du CLIENT que les variables prefixees `PUBLIC_`, et
 * le jeton de build est en lecture seule mais reste un secret : il ne doit atteindre AUCUN
 * bundle. Les variables du projet sont donc lues cote Node, au build, et poussees dans
 * `process.env` — c est ce que fait `chargerEnvDuBuild`, appelee par `astro.config.mjs`.
 *
 * CE QUE CETTE POUSSEE GARANTIT, ET QUI N ETAIT ECRIT NULLE PART. Le site a DEUX lecteurs
 * de `ECHO_STRAPI_URL`, et ils ne lisent pas au meme endroit :
 *
 *   - le PRODUCTEUR des chemins de medias — le loader Content Layer, via
 *     `src/lib/strapi/client.ts` — lit `import.meta.env[nom] ?? process.env[nom]`, donc
 *     la resolution de VITE d abord ;
 *   - le DEPOSEUR des octets — `integrations/medias-locaux.mjs` — vit hors du pipeline
 *     Vite (Astro importe les fichiers de config en Node pur, cf.
 *     `node_modules/astro/dist/core/config/vite-load.js`) : il n a que `process.env`.
 *
 * Deux lectures de la meme variable, c est la forme exacte du defaut ferme le 2026-08-11
 * sur `ECHO_SITE_URL` (commit b6805ac) : trois gardes jugeaient contre `process.env` quand
 * le producteur suivait la configuration resolue, et l une des trois rendait VERT en
 * retirant 597 liens de sa garde sans un mot.
 *
 * ICI, LE SOUPCON EST REFUTE — mesure du 2026-08-14, tache `b863b636` — et la refutation
 * tient a un enchainement en deux temps qu il faut connaitre avant de toucher a ce fichier :
 *
 *   1. `astro.config.mjs` s execute AVANT tout le reste et pousse ici la valeur resolue ;
 *   2. Vite resout ensuite `loadEnv(mode, root, '')`, qui donne la PRIORITE a `process.env`
 *      sur les fichiers `.env*`. Le producteur lit donc exactement la valeur du temps 1.
 *
 * Mesure de bout en bout, sur des builds REELS : `.env` portant `https://bidon.invalid` et
 * `.env.staging` la vraie instance, `npx astro build --mode staging` echoue au « Syncing
 * content » sur `ENOTFOUND bidon.invalid`. C est le PRODUCTEUR qui a suivi `process.env`,
 * contre son propre fichier de mode. Meme resultat avec la variable posee par le shell.
 *
 * COROLLAIRE A NE PAS OUBLIER : `--mode` est donc SANS EFFET sur les variables `ECHO_`
 * une fois qu elles sont resolues ici. Ce n est pas un defaut — c est ce qui fait tenir la
 * convergence — mais quelqu un qui poserait un `.env.<mode>` en attendant qu il gouverne
 * le build serait surpris, et rien ne le lui dirait.
 *
 * CE QUI ROMPRAIT LA GARANTIE, et que `tests/medias-locaux.test.ts` verrouille : retirer la
 * poussee, en changer le prefixe, ou une version de Vite qui cesserait de preferer
 * `process.env`. Le site servirait alors les chemins d une instance et les octets d une
 * autre — toutes deux en 200, donc build VERT.
 */
import { loadEnv } from 'vite';

/** Le prefixe des variables du projet : la borne de ce qui est pousse. */
const PREFIXE = 'ECHO_';

/**
 * Pousse dans `cible` les variables `ECHO_` de `env`, sans jamais ecraser une valeur deja
 * posee.
 *
 * NE JAMAIS ECRASER est ce qui fait tenir le deploiement : Coolify passe ses variables par
 * l environnement du processus, et un `.env` de poste qui les recouvrirait ferait
 * construire la production contre l instance d un developpeur.
 *
 * @param {Record<string, string>} env Variables resolues (typiquement `loadEnv`).
 * @param {Record<string, string | undefined>} cible Ou les poser — `process.env` par defaut.
 */
export function chargerEnvDuBuild(env, cible = process.env) {
  for (const [cle, valeur] of Object.entries(env)) {
    if (cle.startsWith(PREFIXE) && cible[cle] === undefined) cible[cle] = valeur;
  }
  return cible;
}

/**
 * La resolution telle que le build la fait : lecture des fichiers, puis poussee.
 *
 * Le mode est `NODE_ENV ?? 'production'` — celui d Astro n est pas connu de ce fichier, et
 * il n a pas besoin de l etre : la valeur poussee ici est celle que Vite servira de toute
 * facon au producteur (cf. le temps 2 ci-dessus).
 */
export function resoudreEnvDuBuild(racine = process.cwd()) {
  return chargerEnvDuBuild(loadEnv(process.env.NODE_ENV ?? 'production', racine, ''));
}
