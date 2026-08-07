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

import { inspecterLiens, resumeLiens } from '../scripts/verifier-liens.mjs';

const NOM = 'garde-liens';

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
        const origine = process.env.ECHO_SITE_URL ?? 'https://echo.ayfiweb.fr';
        const rapport = inspecterLiens(fileURLToPath(dir), origine);
        if (rapport.manquements.length > 0) throw echec(rapport.manquements);
        logger.info(resumeLiens(rapport));
      },
    },
  };
}
