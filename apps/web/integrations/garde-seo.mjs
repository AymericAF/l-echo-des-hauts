/**
 * Garde §5.2 / §4.5 — les sorties SEO sont confrontees a `dist/`, et le build echoue.
 *
 * Quatrieme garde de la meme famille que T-09 (zero JavaScript), §5.3 (images) et T-06
 * (liens), et pour la meme raison : ce qu elle verifie ne se voit pas dans le code.
 *
 * Elle est SEPAREE de `garde-liens` volontairement, alors que les deux confrontent des
 * URL a `dist/`. Le message d echec de `garde-liens` cite T-06 et envoie chercher un
 * lien de bascule fabrique par prefixage ; une `<loc>` de sitemap manquante n a rien a
 * voir avec cela, et afficher la mauvaise cause coute plus cher que de ne rien afficher.
 */
import { fileURLToPath } from 'node:url';

import { erreurVerificationImpossible, ISSUES } from '../scripts/issues.mjs';
import { ORIGINE_PAR_DEFAUT, origineDuBuild } from '../scripts/origine.mjs';
import { inspecterSeo, resumeSeo } from '../scripts/verifier-seo.mjs';

const NOM = 'garde-seo';

/**
 * CETTE GARDE VERIFIE QU UNE REFERENCE ABOUTIT DANS LA SORTIE : apres tout depot d octets.
 *
 * Preuve du role : `inspecterSeo()` pousse « og:image pointe « … », absent de dist/ », et
 * la sortie constatee le 2026-08-10 porte
 * `og:image` = `…/medias/partage_defaut_….jpg` — un fichier que `medias-locaux` depose.
 */
export const ROLE_SORTIE = 'verifie-que-les-references-aboutissent';

function echec(manquements) {
  return new Error(
    `[${NOM}] ${manquements.length} manquement(s) dans les sorties SEO :\n` +
      manquements.map((m) => `  - ${m}`).join('\n') +
      '\n\n  §5.2 du cahier : canoniques systematiques, hreflang reciproques, Open Graph et' +
      '\n  Twitter Card complets, robots.txt genere, sitemap index segmente. §4.5 : images' +
      '\n  Open Graph generees par article. A-29 : une page noindex sort du sitemap.' +
      '\n  Ces sorties ne sont lues NI par un navigateur NI par une page : un sitemap qui' +
      '\n  declare une URL absente, un flux qui publie un lien mort ou une vignette sans' +
      '\n  texte ne se decouvrent qu en Search Console ou en partageant un article.' +
      '\n  Le build echoue volontairement — la garde ne se contourne pas, elle se corrige.',
  );
}

/** @returns {import('astro').AstroIntegration} */
export default function gardeSeo() {
  /**
   * L origine de la configuration RESOLUE, capturee au seul hook qui l expose. En
   * relisant `process.env.ECHO_SITE_URL`, cette garde produisait sous
   * `--site https://autre-origine.test` 121 manquements dont aucun n existait : 6
   * segments de sitemap « hors du site », puis les 115 pages indexables declarees
   * absentes d un sitemap qui ne se reconnaissait plus lui-meme. Argumentaire complet et
   * mesure dans `scripts/origine.mjs`.
   */
  let siteResolu;

  return {
    name: NOM,
    hooks: {
      'astro:config:done': ({ config }) => {
        siteResolu = config.site;
      },
      'astro:build:done': async ({ dir, logger }) => {
        // `fileURLToPath`, jamais `dir.pathname` : sous Windows ce dernier rend
        // `/C:/Users/...`, que `fs` ne trouve pas — la garde inspecterait une sortie
        // « absente » au lieu de la vraie.
        const origine = origineDuBuild(siteResolu, ORIGINE_PAR_DEFAUT);
        const rapport = await inspecterSeo(fileURLToPath(dir), origine);
        if (rapport.issue === ISSUES.VERIFICATION_IMPOSSIBLE) {
          throw erreurVerificationImpossible(NOM, rapport.manquements);
        }
        if (rapport.manquements.length > 0) throw echec(rapport.manquements);
        logger.info(resumeSeo(rapport));
      },
    },
  };
}
