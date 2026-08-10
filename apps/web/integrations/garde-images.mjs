/**
 * Garde §5.3 — le CLS est tenu par le build, pas par la discipline.
 *
 * Meme principe que la garde T-09, autre objet. T-09 refuse le JavaScript et la sortie
 * serveur ; celle-ci refuse une image sans dimensions explicites et sans intention de
 * chargement ecrite. Les deux sont separees VOLONTAIREMENT : le message d echec de T-09
 * cite la contrainte zero-JavaScript, et un defaut d image affiche sous ce message
 * enverrait chercher une cause qui n existe pas.
 *
 * Ce qu un script separe (`npm run verifier:images`) ne rend pas opposable : il constate
 * apres coup, et le jour ou il aurait servi, personne ne l aura lance. Ici, le controle
 * vit DANS le build (`astro:build:done`), et une exception levee dans un hook fait sortir
 * `astro build` en code NON NUL — c est la seule chose qui compte, le deploiement Coolify
 * s arrete la.
 */
import { fileURLToPath } from 'node:url';

import { inspecterImages, resumeImages } from '../scripts/verifier-images.mjs';

const NOM = 'garde-images';

/**
 * AUCUNE CONTRAINTE D ORDRE, et c est mesure, pas suppose : `inspecterImages()` ne lit que
 * des ATTRIBUTS (`width`, `height`, `loading`, `fetchpriority`) dans le HTML deja emis, et
 * ne verifie jamais qu un fichier reference existe dans `dist/`. Deposer les octets avant
 * ou apres ne change donc rien a son verdict. Sa place actuelle — entre `medias-locaux` et
 * les trois gardes de reference — n est qu une commodite de lecture.
 */
export const ROLE_SORTIE = 'sans-contrainte-d-ordre';

/** Le message d echec, ecrit pour quelqu un qui decouvre la contrainte. */
function echec(manquements) {
  return new Error(
    `[${NOM}] ${manquements.length} image(s) hors du §5.3 dans la sortie :\n` +
      manquements.map((m) => `  - ${m}`).join('\n') +
      '\n\n  Cahier des charges §5.3 : « loading="lazy" hors zone visible immediate,' +
      '\n  dimensions explicites sur toutes les balises pour supprimer le CLS ».' +
      '\n  Une dimension absente vient presque toujours d un media dont Strapi ne rend' +
      '\n  ni width ni height : la corriger EN BASE, pas en codant une valeur en dur.' +
      '\n  Le build echoue volontairement — la garde ne se contourne pas, elle se corrige.',
  );
}

/** @returns {import('astro').AstroIntegration} */
export default function gardeImages() {
  return {
    name: NOM,
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        // `fileURLToPath`, jamais `dir.pathname` : sous Windows ce dernier rend
        // `/C:/Users/...`, que `fs` ne trouve pas — la garde inspecterait une sortie
        // « absente » au lieu de la vraie, et rendrait vert sur zero image lue.
        const rapport = inspecterImages(fileURLToPath(dir));
        if (rapport.manquements.length > 0) throw echec(rapport.manquements);
        logger.info(resumeImages(rapport));
      },
    },
  };
}
