/**
 * Garde §5.5 — aucune regle de style n arrive dans le HTML.
 *
 * Cinquieme garde du meme genre que T-09 (zero JavaScript), §5.3 (dimensions), T-06 (liens
 * morts) et T-01 (origine des medias), et posee pour ce qu aucune des quatre ne voyait :
 * le 2026-08-09, apres le correctif des images, la capture sous la CSP servie et la capture
 * CSP contournee differaient encore sur 2 des 4 pages recettees — la page 80 px plus haute
 * avec la CSP active. La sortie portait un bloc `<style>` sur 65 de ses 86 pages et un
 * attribut `style="--encre:…"` sur les 86, que `style-src 'self'` refuse.
 *
 * ELLE EXISTE PARCE QU UN AVERTISSEMENT NE TIENT RIEN. Le defaut etait deja ecrit, noir sur
 * blanc, dans les rapports Lighthouse du 2026-08-08 (18 occurrences), et dans le runbook
 * (« piege a effet differe » de l etape 27). Personne ne l a nomme : il etait noye sous le
 * defaut des images, qui saignait plus fort. Ce que change ce fichier n est pas la
 * connaissance du defaut, c est que le build ECHOUE.
 *
 * SEPAREE DES AUTRES VOLONTAIREMENT, comme elles le sont entre elles : le message d echec
 * de `garde-origine-medias` cite `img-src` et T-01 ; une regle de style refusee affichee
 * sous ce message enverrait chercher une cause qui n existe pas.
 *
 * SA PLACE DANS L ORDRE EST LIBRE : elle ne lit que le HTML emis, qu aucune autre
 * integration ne modifie. Elle est posee en dernier pour que les gardes qui deposent des
 * octets (`medias-locaux`) aient fini — economie de bruit, pas de dependance.
 */
import { fileURLToPath } from 'node:url';

import { inspecterStylesEnLigne, resumeStylesEnLigne } from '../scripts/verifier-styles-en-ligne.mjs';

const NOM = 'garde-styles-en-ligne';

/** Le message d echec, ecrit pour quelqu un qui decouvre la contrainte. */
function echec(manquements) {
  const montres = manquements.slice(0, 12);
  const reste = manquements.length - montres.length;
  return new Error(
    `[${NOM}] ${manquements.length} style(s) en ligne dans la sortie :\n` +
      montres.map((m) => `  - ${m}`).join('\n') +
      (reste > 0 ? `\n  … et ${reste} autre(s) du meme genre.` : '') +
      '\n\n  §5.5 du cahier : « CSP stricte ». La CSP posee sur le proxy' +
      '\n  (docs/runbook-provisionnement.md, etape 27) porte style-src \'self\' — sans' +
      "\n  'unsafe-inline', sans nonce, sans empreinte. Un style pose DANS le document n est" +
      '\n  donc jamais applique : la page repond 200, ses en-tetes sont conformes, et elle' +
      '\n  ne ressemble pas a ce que le build decrit.' +
      '\n' +
      "\n  NE PAS ELARGIR style-src POUR FAIRE TAIRE CE MESSAGE : ce serait defaire le §5.5" +
      '\n  pour couvrir un ecart de build, exactement ce qu on a refuse de faire sur img-src' +
      '\n  le 2026-08-09. Les deux corrections vivent ici :' +
      "\n    - bloc <style>   → `build.inlineStylesheets: 'never'` dans astro.config.mjs ;" +
      '\n    - attribut style= → le composant qui l ecrit ; la declaration se deplace dans' +
      '\n      une classe, donc dans la feuille servie.' +
      '\n  Le build echoue volontairement — la garde ne se contourne pas, elle se corrige.',
  );
}

/** @returns {import('astro').AstroIntegration} */
export default function gardeStylesEnLigne() {
  return {
    name: NOM,
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        // `fileURLToPath`, jamais `dir.pathname` : sous Windows ce dernier rend
        // `/C:/Users/...`, que `fs` ne trouve pas — la garde inspecterait une sortie
        // « absente » au lieu de la vraie. C est aussi pourquoi zero page inspectee est
        // un manquement plutot qu un vert.
        const rapport = inspecterStylesEnLigne(fileURLToPath(dir));
        if (rapport.manquements.length > 0) throw echec(rapport.manquements);
        logger.info(resumeStylesEnLigne(rapport));
      },
    },
  };
}
