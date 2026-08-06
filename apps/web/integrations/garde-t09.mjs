/**
 * Garde T-09 — la contrainte dure est tenue par le build, pas par la discipline.
 *
 * T-09 (`docs/arbitrages-techniques.md`) prescrit, mot pour mot :
 *
 *   « Le build de production ECHOUE si l une de ces conditions est vraie : un adaptateur
 *     serveur est configure, la sortie contient un `_worker.js` ou un repertoire de
 *     fonctions, ou un fichier de route exporte `prerender = false`. C est ce qui rend le
 *     §4.1 opposable en machine plutot qu en intention. »
 *
 * Un script separe qu il faut penser a lancer (`npm run verifier:sortie`) ne rend rien
 * opposable : il constate apres coup, et le jour ou il aurait servi, personne ne l aura
 * lance. Cette integration place les memes verifications DANS le build, au plus tot pour
 * chacune :
 *
 *   - `astro:config:done`   → adaptateur configure, ou `buildOutput` bascule en `server` ;
 *   - `astro:routes:resolved` → une route non prerendue (`prerender = false`), nommee par
 *     son fichier — c est la condition que T-09 dit invisible dans le fichier fautif ;
 *   - `astro:build:done`    → la sortie elle-meme (`inspecterSortie`) : JavaScript servi,
 *     balise `<script>`, attribut `on*=` inline, marqueurs de sortie serveur.
 *
 * Une exception lancee dans un hook fait echouer `astro build`, qui sort en code NON NUL.
 * C est la seule chose qui compte : le deploiement Coolify s arrete la.
 */
import { fileURLToPath } from 'node:url';

import { inspecterSortie, resume } from '../scripts/verifier-sortie.mjs';

const NOM = 'garde-t09';

/** Le message d echec, ecrit pour quelqu un qui decouvre la contrainte. */
function echec(titre, manquements) {
  return new Error(
    `[${NOM}] ${titre}\n` +
      manquements.map((m) => `  - ${m}`).join('\n') +
      '\n\n  Contrainte dure du projet (brief §1, §4.1, recette §9, arbitrage T-09) :' +
      '\n  aucun JavaScript servi hors /recherche, aucune route serveur.' +
      '\n  Le build echoue volontairement — la garde ne se contourne pas, elle se corrige.',
  );
}

/**
 * Conditions T-09 lisibles sur la configuration resolue.
 *
 * ATTENTION — ce qui porte reellement la condition « un adaptateur serveur est
 * configure » ici, c est `buildOutput`, PAS `adapter`. Constate le 2026-08-07 dans
 * `node_modules/astro/dist/integrations/hooks.js` lignes 288-305 : `setAdapter()` ecrit
 * dans `settings.adapter` et bascule `settings.buildOutput` a `'server'`, mais n ecrit
 * JAMAIS dans `settings.config.adapter` — le `config.adapter` recu ici reste `undefined`.
 * La branche `adapter` ci-dessous est donc un filet pour le jour ou Astro l exposera ;
 * elle n est pas ce qui tient la garde aujourd hui, et il ne faut pas s y fier.
 *
 * Reste hors de portee de CE hook : un adaptateur qui declare
 * `adapterFeatures.buildOutput === 'static'` ne bascule pas `buildOutput` (meme source,
 * ligne 290). Il est neanmoins sans danger pour la contrainte, et surtout il n echappe
 * pas a la garde : un tel adaptateur n emet aucune route serveur, et s il ecrivait
 * malgre tout un `_worker.js`, un `server/`, un `functions/` ou un `_routes.json`, le
 * hook `astro:build:done` le refuserait sur la sortie. Aucune sortie serveur ne passe.
 *
 * @param {{adapter?: {name?: string}, buildOutput?: 'static'|'server'}} etat
 */
export function manquementsConfig({ adapter, buildOutput }) {
  const manquements = [];
  if (adapter) {
    manquements.push(
      `adaptateur serveur configure : ${adapter.name ?? '(sans nom)'} (§4.1 : aucune route serveur)`,
    );
  }
  if (buildOutput && buildOutput !== 'static') {
    manquements.push(
      `buildOutput = '${buildOutput}' au lieu de 'static' : la sortie entiere bascule en mode serveur`,
    );
  }
  return manquements;
}

/**
 * Condition T-09 lisible sur les routes resolues.
 *
 * Lue sur `isPrerendered` plutot que par une expression reguliere sur les sources : c est
 * la valeur qu Astro a reellement retenue, apres ses propres defauts.
 *
 * Deux exclusions, et pas une de plus :
 *   - `type: 'redirect'` — une redirection n est prerendue par nature, elle ne prouve
 *     aucune bascule serveur ;
 *   - `origin: 'internal'` — la plomberie d Astro elle-meme (`_server-islands.astro`, le
 *     404 par defaut, l endpoint d images de dev) est declaree non prerendue dans TOUT
 *     build, y compris un build statique qui n emet aucune sortie serveur. Constate ici
 *     le 2026-08-07 : sans cette exclusion, la garde refusait le build sain.
 *
 * Les routes `origin: 'external'` (injectees par une integration via `injectRoute`)
 * restent SOUS la garde : c est precisement par la qu une route serveur pourrait entrer
 * sans qu aucun fichier du projet ne la montre.
 *
 * @param {Array<{pattern?: string, entrypoint?: string, isPrerendered?: boolean, type?: string, origin?: string}>} routes
 */
export function manquementsRoutes(routes) {
  return routes
    .filter(
      (route) =>
        route.isPrerendered === false && route.type !== 'redirect' && route.origin !== 'internal',
    )
    .map(
      (route) =>
        `route non prerendue : ${route.entrypoint || route.pattern} ` +
        `(prerender = false — fait basculer la sortie ENTIERE en mode serveur)`,
    );
}

/** @returns {import('astro').AstroIntegration} */
export default function gardeT09() {
  return {
    name: NOM,
    hooks: {
      'astro:config:done': ({ config, buildOutput, logger }) => {
        const manquements = manquementsConfig({ adapter: config.adapter, buildOutput });
        if (manquements.length > 0) throw echec('configuration non statique :', manquements);
        logger.info('configuration statique, aucun adaptateur.');
      },

      'astro:routes:resolved': ({ routes, logger }) => {
        const manquements = manquementsRoutes(routes);
        if (manquements.length > 0) throw echec('route(s) hors du rendu statique :', manquements);
        logger.info(`${routes.length} route(s) resolue(s), toutes prerendues.`);
      },

      'astro:build:done': ({ dir, logger }) => {
        // `fileURLToPath`, jamais `dir.pathname` : sous Windows ce dernier rend
        // `/C:/Users/...`, un chemin que `fs` ne trouve pas — la garde inspecterait alors
        // une sortie « absente » au lieu de la vraie.
        const rapport = inspecterSortie(fileURLToPath(dir));
        if (rapport.manquements.length > 0) {
          throw echec(`${rapport.manquements.length} manquement(s) dans la sortie :`, rapport.manquements);
        }
        logger.info(resume(rapport));
      },
    },
  };
}
