/**
 * Garde T-06 — aucun lien emis ne pointe une URL que le build n a pas produite.
 *
 * Troisieme garde du meme genre que T-09 (zero JavaScript) et §5.3 (images), et pour la
 * meme raison : « Le build echoue si l une des URL produites — lien de bascule ou
 * `hreflang` — n appartient pas au registre des routes reellement emises. Sans cette
 * assertion, la classe entiere des liens morts de bascule ne se decouvre qu en cliquant,
 * c est-a-dire jamais en test automatise. » (`docs/arbitrages-techniques.md`, T-06.)
 *
 * Elle est SEPAREE des deux autres volontairement : le message d echec de T-09 cite la
 * contrainte zero-JavaScript, et un lien mort affiche sous ce message enverrait chercher
 * une cause qui n existe pas.
 */
import { fileURLToPath } from 'node:url';

import { erreurVerificationImpossible, ISSUES } from '../scripts/issues.mjs';
import { ORIGINE_PAR_DEFAUT } from '../scripts/origine.mjs';
import { inspecterLiens, resumeLiens } from '../scripts/verifier-liens.mjs';

const NOM = 'garde-liens';

/**
 * CETTE GARDE VERIFIE QU UNE REFERENCE ABOUTIT DANS LA SORTIE : apres tout depot d octets.
 *
 * Preuve du role, et elle n a rien d evident — ce fichier s interdit les `src` d images,
 * on pourrait donc le croire independant des medias. Il ne l est pas : il lit les `href`
 * des `<link>`, et depuis T-01 la sortie porte
 * `<link rel="icon" href="/medias/favicon_….png">` sur chacune de ses pages (constate dans
 * `dist/` le 2026-08-10). Sans les octets deposes, c est un « lien mort » par page.
 */
export const ROLE_SORTIE = 'verifie-que-les-references-aboutissent';

function echec(manquements) {
  return new Error(
    `[${NOM}] ${manquements.length} lien(s) interne(s) sans cible dans la sortie :\n` +
      manquements.map((m) => `  - ${m}`).join('\n') +
      '\n\n  Arbitrage T-06 : la bascule FR/EN et les hreflang se calculent sur le REGISTRE' +
      '\n  des routes reellement emises, jamais par prefixage d une URL (T-04). Un lien mort' +
      '\n  ici signifie que la page a fabrique son URL au lieu de la lire dans le registre,' +
      '\n  ou que le registre annonce une route que getStaticPaths n emet pas.' +
      '\n  Le build echoue volontairement — la garde ne se contourne pas, elle se corrige.',
  );
}

/** @returns {import('astro').AstroIntegration} */
export default function gardeLiens() {
  return {
    name: NOM,
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        // `fileURLToPath`, jamais `dir.pathname` : sous Windows ce dernier rend
        // `/C:/Users/...`, que `fs` ne trouve pas — la garde inspecterait une sortie
        // « absente » au lieu de la vraie.
        const origine = process.env.ECHO_SITE_URL ?? ORIGINE_PAR_DEFAUT;
        const rapport = inspecterLiens(fileURLToPath(dir), origine);
        /* UNE INCAPACITE N EST PAS UNE ANOMALIE, et les deux messages n envoient pas au
           meme endroit : « lien mort » envoie corriger le registre des routes, «
           verification impossible » envoie corriger `ECHO_SITE_URL`. Le build echoue
           dans les deux cas — jamais au vert sur ce qui n a pas ete regarde. */
        if (rapport.issue === ISSUES.VERIFICATION_IMPOSSIBLE) {
          throw erreurVerificationImpossible(NOM, rapport.manquements);
        }
        if (rapport.manquements.length > 0) throw echec(rapport.manquements);
        logger.info(resumeLiens(rapport));
      },
    },
  };
}
