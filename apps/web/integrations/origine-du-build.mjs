/**
 * LE BUILD ARCHIVE L ORIGINE QU IL A RESOLUE, DANS LA SORTIE QU IL PRODUIT.
 *
 * POURQUOI (2026-08-16, tache `4d2dd1d3`). Les trois verificateurs en ligne de commande
 * — `verifier-liens`, `verifier-seo`, `verifier-origine-medias` — resolvaient chacun
 * `process.argv[3] ?? ECHO_SITE_URL ?? repli`. Hors d un build c est correct : il n y a
 * aucune configuration Astro a lire. Mais RIEN ne les reliait a l origine que le build
 * avait reellement employee. Un `npm run verifier:*` lance apres un
 * `astro build --site <autre-origine>` jugeait donc contre la mauvaise reference — et
 * rendait le MEME signe de conformite qu un verdict valide.
 *
 * Le 2026-08-11, `origine-des-gardes.test.ts` avait ferme ce defaut cote INTEGRATIONS, en
 * leur faisant lire `config.site`. Cette integration-ci ferme la seconde porte : elle
 * ecrit ce que le producteur a employe, pour que ce qui juge la sortie PLUS TARD, dans un
 * autre processus et peut-etre sur une autre machine, puisse le retrouver.
 *
 * CE QU ELLE N EST PAS. Elle ne juge rien et ne fait echouer aucun build : elle depose une
 * reference. Si son ecriture echoue, elle le DIT dans le journal et laisse le build
 * continuer — les verificateurs retombent alors sur leur chaine ordinaire, exactement
 * comme avant ce mecanisme. Faire echouer une publication pour un artefact accessoire
 * serait transformer une incapacite en panne.
 *
 * L ORDRE DES HOOKS EST CELUI D ASTRO : `astro:config:done` d abord, ou la configuration
 * est resolue et ou `--site` a deja gagne sur le fichier de configuration ; puis
 * `astro:build:done`, ou la sortie existe et peut recevoir le fichier.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FICHIER_ORIGINE_BUILD, ORIGINE_PAR_DEFAUT, origineDuBuild } from '../scripts/origine.mjs';

export default function origineDuBuildIntegration() {
  let siteResolu;

  return {
    name: 'echo-origine-du-build',
    hooks: {
      'astro:config:done': ({ config }) => {
        /* `config.site` est la valeur RESOLUE : `--site` y a deja gagne sur le fichier de
           configuration, et donc sur la variable d environnement qui l alimente. C est la
           meme source que celle dont les trois gardes de `integrations/` dependent. */
        siteResolu = config.site;
      },
      'astro:build:done': ({ dir, logger }) => {
        /* `fileURLToPath`, jamais `dir.pathname` : sous Windows ce dernier rend un chemin
           prefixe d un `/` que `join` ne rattrape pas. Meme precaution que les gardes. */
        const sortie = fileURLToPath(dir);
        const origine = origineDuBuild(siteResolu, ORIGINE_PAR_DEFAUT);
        try {
          writeFileSync(
            join(sortie, FICHIER_ORIGINE_BUILD),
            `${JSON.stringify({ origine }, null, 2)}\n`,
            'utf8',
          );
          logger.info(`origine du build archivee : ${origine}`);
        } catch (e) {
          /* Journalise et continue. Un verificateur sans artefact retombe sur
             `ECHO_SITE_URL` puis sur le repli — le comportement d avant, pas une panne. */
          logger.warn(
            `origine du build NON archivee (${e.message}) — les verificateurs en ligne de `
              + 'commande retomberont sur ECHO_SITE_URL, comme avant ce mecanisme',
          );
        }
      },
    },
  };
}
