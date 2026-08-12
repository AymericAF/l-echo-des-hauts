/**
 * Garde T-01 — aucune image ne vient d un domaine que la CSP du site refuse.
 *
 * Quatrieme garde du meme genre que T-09 (zero JavaScript), §5.3 (dimensions) et T-06
 * (liens morts), et posee pour une raison qu aucune des trois n avait couverte : le
 * 2026-08-08, le site en ligne n affichait AUCUNE image, ses 21 `<img>` pointant le
 * domaine du CMS contre une CSP en `img-src 'self' data:`. Le defaut est passe sous des
 * tests verts ET un build vert — `garde-images` ne regarde pas l hote, `garde-liens`
 * s interdit les `src` d images, `garde-seo` ignore un `og:image` externe. Le trou etait
 * a l intersection exacte des trois ; c est celui-ci qu il ferme.
 *
 * SEPAREE DES AUTRES VOLONTAIREMENT, comme elles le sont entre elles : le message d echec
 * de `garde-images` cite le CLS et le §5.3 ; une image refusee par la CSP affichee sous
 * ce message enverrait chercher une cause qui n existe pas.
 *
 * ELLE PASSE APRES `medias-locaux`, qui depose les octets : inversee, elle rougirait sur
 * un site sain.
 */
import { fileURLToPath } from 'node:url';

import { erreurVerificationImpossible, ISSUES } from '../scripts/issues.mjs';
import { ORIGINE_PAR_DEFAUT, origineDuBuild } from '../scripts/origine.mjs';
import { inspecterOrigineMedias, resumeOrigineMedias } from '../scripts/verifier-origine-medias.mjs';

const NOM = 'garde-origine-medias';

/**
 * CETTE GARDE VERIFIE QU UNE REFERENCE ABOUTIT DANS LA SORTIE : elle doit donc s executer
 * APRES toute integration declaree `depose-des-octets`. `tests/astro-config.test.ts` tient
 * cette dependance ; la phrase « ELLE PASSE APRES `medias-locaux` » ci-dessus n etait
 * qu un commentaire, et un commentaire ne tient rien.
 *
 * Preuve du role, pas deduction du nom : `inspecterOrigineMedias()` pousse un manquement
 * « aucun fichier de dist/ ne repond a ce chemin » (scripts/verifier-origine-medias.mjs).
 */
export const ROLE_SORTIE = 'verifie-que-les-references-aboutissent';

/** Le message d echec, ecrit pour quelqu un qui decouvre la contrainte. */
function echec(manquements) {
  return new Error(
    `[${NOM}] ${manquements.length} reference(s) d image hors de T-01 dans la sortie :\n` +
      manquements.map((m) => `  - ${m}`).join('\n') +
      '\n\n  Arbitrage T-01 (docs/arbitrages-techniques.md) : l image est « servie depuis' +
      '\n  notre propre domaine, telechargee au build ». La CSP posee sur le proxy' +
      '\n  (docs/runbook-provisionnement.md, etape 27) applique exactement cela.' +
      '\n' +
      '\n  NE PAS ELARGIR img-src POUR FAIRE TAIRE CE MESSAGE : ce serait defaire un' +
      '\n  arbitrage ratifie pour couvrir un ecart d implementation. Les URL de medias se' +
      '\n  construisent a UN SEUL endroit, src/lib/media.ts — c est la que la correction va.' +
      '\n  Le build echoue volontairement — la garde ne se contourne pas, elle se corrige.',
  );
}

/** @returns {import('astro').AstroIntegration} */
export default function gardeOrigineMedias() {
  /**
   * L origine de la configuration RESOLUE, capturee au seul hook qui l expose. Elle
   * remplace la relecture de `process.env.ECHO_SITE_URL`, qui faisait juger cette garde
   * contre une reference que le producteur n avait pas utilisee : sous
   * `--site https://autre-origine.test`, elle accusait 238 references d image d etre
   * « hors du site » alors qu elles portaient l origine donnee au build. La chaine de
   * repli est celle du producteur ; l argumentaire complet est dans `scripts/origine.mjs`.
   */
  let siteResolu;

  return {
    name: NOM,
    hooks: {
      'astro:config:done': ({ config }) => {
        siteResolu = config.site;
      },
      'astro:build:done': ({ dir, logger }) => {
        // `fileURLToPath`, jamais `dir.pathname` : sous Windows ce dernier rend
        // `/C:/Users/...`, que `fs` ne trouve pas — la garde inspecterait une sortie
        // « absente » au lieu de la vraie, et rendrait vert sur zero image lue.
        const origine = origineDuBuild(siteResolu, ORIGINE_PAR_DEFAUT);
        const rapport = inspecterOrigineMedias(fileURLToPath(dir), origine);
        if (rapport.issue === ISSUES.VERIFICATION_IMPOSSIBLE) {
          throw erreurVerificationImpossible(NOM, rapport.manquements);
        }
        if (rapport.manquements.length > 0) throw echec(rapport.manquements);
        logger.info(resumeOrigineMedias(rapport));
      },
    },
  };
}
