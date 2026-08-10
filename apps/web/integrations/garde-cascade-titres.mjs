/**
 * Garde §9 — aucun niveau de titre ne saute dans la sortie construite.
 *
 * Sixieme garde du meme genre que T-09 (zero JavaScript), §5.3 (dimensions), T-06 (liens
 * morts), T-01 (origine des medias) et §5.5 (styles en ligne), et posee pour ce qu aucune
 * des cinq ne voyait : le 2026-08-10, la campagne axe-core n a trouve qu UNE regle violee
 * sur tout le site, et l a trouvee 68 fois — `heading-order`, sur 34 URL, un noeud par
 * page, toujours `<h4 class="bloc-encadre__titre">` juste apres un `<h2>`.
 *
 * ELLE EXISTE PARCE QU UNE CAMPAGNE NE TOURNE PAS A CHAQUE BUILD. Le defaut etait ecrit
 * noir sur blanc dans la campagne du 2026-08-08 — il ne touchait alors que 2 pages HORS
 * porte, il ne coutait rien, personne ne l a corrige. Le corpus a grossi, l article que le
 * §3 du protocole designe pour la porte P2 s est mis a porter un encadre, et le meme
 * defaut inchange a fait tomber la porte a 98. Ce que change ce fichier n est pas la
 * connaissance du defaut : c est que le build ECHOUE.
 *
 * SEPAREE DES AUTRES VOLONTAIREMENT, comme elles le sont entre elles : le message
 * d echec de `garde-images` cite les dimensions et le §5.3 ; un niveau de titre saute
 * affiche sous ce message enverrait chercher une cause qui n existe pas.
 *
 * SA PLACE DANS L ORDRE EST LIBRE : elle ne lit que le HTML emis, qu aucune autre
 * integration ne modifie, et ne confronte aucune reference a `dist/`.
 */
import { fileURLToPath } from 'node:url';

import { erreurVerificationImpossible, ISSUES } from '../scripts/issues.mjs';
import {
  inspecterCascadeTitres,
  resumeCascadeTitres,
} from '../scripts/verifier-cascade-titres.mjs';

const NOM = 'garde-cascade-titres';

/**
 * AUCUNE CONTRAINTE D ORDRE — `inspecterCascadeTitres()` ne lit que la suite des balises
 * de titre du HTML emis. Elle n attend aucun octet depose par une autre integration.
 */
export const ROLE_SORTIE = 'sans-contrainte-d-ordre';

/** Le message d echec, ecrit pour quelqu un qui decouvre la contrainte. */
function echec(manquements) {
  const montres = manquements.slice(0, 12);
  const reste = manquements.length - montres.length;
  return new Error(
    `[${NOM}] ${manquements.length} niveau(x) de titre saute(s) dans la sortie :\n` +
      montres.map((m) => `  - ${m}`).join('\n') +
      (reste > 0 ? `\n  … et ${reste} autre(s) du meme genre.` : '') +
      '\n\n  §9 du cahier : « aucun avertissement d accessibilite ». La suite des titres EST' +
      "\n  le sommaire du document pour qui navigue au lecteur d ecran : un niveau saute fait" +
      '\n  disparaitre un echelon de la hierarchie. axe-core le compte en `heading-order`.' +
      '\n' +
      '\n  LE NIVEAU D UN TITRE N EST PAS TOUJOURS LIBRE : A-21 du modele de donnees impose' +
      '\n  que les titres saisis dans un `bloc.encadre` soient rendus en h4 OU PLUS BAS.' +
      '\n  Remonter un h4 fautif en h3 defait donc l arbitrage plutot que le defaut ; le' +
      '\n  correctif est ailleurs — dans la hierarchie des titres de la page, ou en sortant' +
      '\n  du fil des titres ce qui n est pas une etape de lecture.' +
      '\n  Le build echoue volontairement — la garde ne se contourne pas, elle se corrige.',
  );
}

/** @returns {import('astro').AstroIntegration} */
export default function gardeCascadeTitres() {
  return {
    name: NOM,
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        // `fileURLToPath`, jamais `dir.pathname` : sous Windows ce dernier rend
        // `/C:/Users/...`, que `fs` ne trouve pas — la garde inspecterait une sortie
        // « absente » au lieu de la vraie.
        const rapport = inspecterCascadeTitres(fileURLToPath(dir));
        /* UNE INCAPACITE N EST PAS UNE ANOMALIE : sortie absente ou sans page HTML vient
           presque toujours d un CHEMIN faux, et le message de `echec()` enverrait alors
           chercher un titre fautif qui n existe pas. */
        if (rapport.issue === ISSUES.VERIFICATION_IMPOSSIBLE) {
          throw erreurVerificationImpossible(NOM, rapport.manquements);
        }
        if (rapport.manquements.length > 0) throw echec(rapport.manquements);
        logger.info(resumeCascadeTitres(rapport));
      },
    },
  };
}
