/**
 * Garde §4.2 / §9 — aucune chaine adressee au lecteur ne sort dans la mauvaise langue.
 *
 * Septieme garde du meme genre que T-09 (zero JavaScript), §5.3 (dimensions), T-06 (liens
 * morts), T-01 (origine des medias), §5.5 (styles en ligne) et la cascade des titres. Elle
 * est posee pour ce qu aucune des six ne voyait, et que rien n aurait vu sans un lecteur
 * humain : le 2026-08-10, DEUX chaines francaises sont apparues sur les pages anglaises du
 * pied de page. Elles n avaient pas ete introduites ce jour-la — elles dataient du socle
 * (`d2e7b75`) et dormaient invisibles, parce que les pages anglaises ne rendaient pas ce
 * bloc. L inventaire de la sortie en a trouve deux autres du meme genre, plus une
 * cinquieme dans la bascule FR/EN.
 *
 * ELLE EXISTE PARCE QUE LE DEFAUT EST MUET. Une etiquette d accessibilite en francais sur
 * une page anglaise ne casse rien, ne rougit nulle part, et ne se voit pas a l ecran :
 * elle est ENTENDUE, par un lecteur d ecran anglophone, telle quelle. Le seul moment ou
 * quelqu un s en apercoit est celui ou une personne lit une page anglaise — c est-a-dire
 * jamais, sur un miroir de demonstration.
 *
 * CE QU ELLE NE VOIT PAS est ecrit dans `scripts/verifier-langue.mjs` : une chaine ecrite
 * en dur ET absente du dictionnaire n a rien a quoi se comparer. Ce trou est ferme a la
 * SOURCE par `tests/garde-langue.test.ts`.
 *
 * SA PLACE DANS L ORDRE EST LIBRE : elle ne lit que le HTML emis, qu aucune autre
 * integration ne modifie, et ne confronte aucune reference a `dist/`.
 */
import { fileURLToPath } from 'node:url';

import { erreurVerificationImpossible, ISSUES } from '../scripts/issues.mjs';
import { inspecterLangue, resumeLangue } from '../scripts/verifier-langue.mjs';

const NOM = 'garde-langue';

/** AUCUNE CONTRAINTE D ORDRE — elle ne lit que le texte du HTML emis. */
export const ROLE_SORTIE = 'sans-contrainte-d-ordre';

/** Le message d echec, ecrit pour quelqu un qui decouvre la contrainte. */
function echec(manquements) {
  const montres = manquements.slice(0, 12);
  const reste = manquements.length - montres.length;
  return new Error(
    `[${NOM}] ${manquements.length} chaine(s) servie(s) dans la mauvaise langue :\n` +
      montres.map((m) => `  - ${m}`).join('\n') +
      (reste > 0 ? `\n  … et ${reste} autre(s) du meme genre.` : '') +
      '\n\n  §4.2 : le miroir anglais est COMPLET. Une ossature francaise sur une page' +
      "\n  anglaise decredibilise la demonstration d i18n en une seconde — et quand la" +
      '\n  chaine est un `aria-label`, un texte masque a l oeil ou un `og:image:alt`, elle' +
      "\n  n est pas un detail cosmetique : c est le contenu que percoit quelqu un qui ne" +
      '\n  voit pas la page.' +
      '\n' +
      '\n  LE CORRECTIF EST TOUJOURS LE MEME : faire venir la chaine de `libelles(locale)`,' +
      '\n  et transmettre la locale au composant qui en manque. Poser un `lang=` sur' +
      "\n  l element pour faire taire ce message ferait MENTIR la declaration au lieu de" +
      '\n  corriger le texte — sauf si la chaine est reellement dans cette langue-la, ce que' +
      '\n  la bascule FR/EN est seule a faire (T-04).' +
      '\n  Le build echoue volontairement — la garde ne se contourne pas, elle se corrige.',
  );
}

/** @returns {import('astro').AstroIntegration} */
export default function gardeLangue() {
  return {
    name: NOM,
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        // `fileURLToPath`, jamais `dir.pathname` : sous Windows ce dernier rend
        // `/C:/Users/...`, que `fs` ne trouve pas.
        const rapport = inspecterLangue(fileURLToPath(dir));
        if (rapport.issue === ISSUES.VERIFICATION_IMPOSSIBLE) {
          throw erreurVerificationImpossible(NOM, rapport.manquements);
        }
        if (rapport.manquements.length > 0) throw echec(rapport.manquements);
        logger.info(resumeLangue(rapport));
      },
    },
  };
}
