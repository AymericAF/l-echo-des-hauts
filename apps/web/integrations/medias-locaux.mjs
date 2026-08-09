/**
 * T-01 — les medias sont TELECHARGES AU BUILD et servis par le site.
 *
 * Cette integration est la premiere de la chaine `astro:build:done`, et l ordre compte :
 * les trois gardes qui suivent (`garde-origine-medias`, `garde-liens`, `garde-seo`)
 * verifient toutes qu une reference aboutit dans `dist/`. Les faire passer avant le
 * depot des octets les ferait rougir sur un site sain.
 *
 * POURQUOI DANS LE BUILD plutot que dans un script separe : un script qu il faut penser
 * a lancer n aura pas ete lance le jour ou il aurait servi. Une exception levee dans un
 * hook fait sortir `astro build` en code NON NUL, et le deploiement Coolify s arrete la.
 */
import { fileURLToPath } from 'node:url';

import { localiserMedias, resumeMediasLocaux } from '../scripts/medias-locaux.mjs';

const NOM = 'medias-locaux';

function echec(echecs) {
  return new Error(
    `[${NOM}] ${echecs.length} media(s) references par la sortie n ont PAS pu etre ` +
      'telecharges :\n' +
      echecs.map((e) => `  - ${e}`).join('\n') +
      '\n\n  Arbitrage T-01 (docs/arbitrages-techniques.md) : le media est servi DEPUIS' +
      '\n  NOTRE DOMAINE, telecharge au build. Deployer sans ces fichiers rendrait un site' +
      '\n  dont les images sont declarees et jamais peintes — le meme ecran que le defaut' +
      '\n  du 2026-08-08, pour une autre cause.' +
      '\n  Verifier que ECHO_STRAPI_URL designe bien l instance qui porte la mediatheque,' +
      '\n  et que le fichier existe encore cote Strapi (une entree peut referencer un' +
      '\n  media supprime de la Media Library).' +
      '\n  Le build echoue volontairement — la garde ne se contourne pas, elle se corrige.',
  );
}

/** @returns {import('astro').AstroIntegration} */
export default function mediasLocaux() {
  return {
    name: NOM,
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        // `fileURLToPath`, jamais `dir.pathname` : sous Windows ce dernier rend
        // `/C:/Users/...`, que `fs` ne trouve pas — on deposerait les medias ailleurs
        // que dans la sortie reelle, et la garde suivante rougirait sur la mauvaise cause.
        const rapport = await localiserMedias(
          fileURLToPath(dir),
          process.env.ECHO_STRAPI_URL ?? '',
        );
        if (rapport.echecs.length > 0) throw echec(rapport.echecs);
        logger.info(resumeMediasLocaux(rapport));
      },
    },
  };
}
