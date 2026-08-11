/**
 * Index Pagefind, genere en POST-BUILD (§5.4) — et re-inspection de la sortie apres coup.
 *
 * POURQUOI EN POST-BUILD, ET PAS DANS LE BUILD. Pagefind indexe du HTML deja ecrit : il
 * lui faut `dist/` complet. Il ne peut donc pas etre une integration Astro, et son
 * depot echappe par construction a la garde T-09, qui s execute au dernier hook du build
 * (`astro:build:done`), donc AVANT que ce script tourne. Un index de recherche serait
 * ainsi le seul endroit du site ou du JavaScript pourrait entrer sans jamais passer
 * devant la garde.
 *
 * D OU LA SECONDE MOITIE DE CE FICHIER, qui est la seule qui compte vraiment : une fois
 * l index ecrit, on RELANCE `inspecterSortie` — la meme fonction, avec la meme exemption
 * bornee aux chemins exacts `(en/)?pagefind/<fichier>.js` — sur la sortie AUGMENTEE. La
 * contrainte « aucun JavaScript servi hors /recherche » est donc verifiee sur ce qui est
 * reellement deploye, pas sur ce qui existait avant que l index n arrive.
 *
 * Ce que cela attrape, concretement : une version de Pagefind qui rangerait son bundle
 * dans un sous-repertoire, qui deposerait un fichier a la racine de `dist/`, ou qui
 * injecterait une balise `<script>` dans les pages indexees. Aucun de ces trois cas ne
 * casse quoi que ce soit visiblement — le site continue de s afficher.
 *
 * Le script sort en code NON NUL a la moindre anomalie : c est ce qui arrete le
 * deploiement Coolify, `npm run build` enchainant `astro build` et ce fichier.
 *
 *   node scripts/index-pagefind.mjs [dist]
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { inspecterSortie } from './verifier-sortie.mjs';

const NOM = 'index-pagefind';

/**
 * Les manquements de la sortie APRES depot de l index.
 *
 * Delegation assumee a `inspecterSortie` : reecrire ici un controle « proche » du sien
 * ferait exactement le defaut que ce projet corrige depuis trois taches — deux copies
 * d une meme regle, qui divergent au premier changement. L exemption `/recherche` a un
 * seul domicile (`scripts/verifier-sortie.mjs`), et c est lui qui doit dire oui ou non,
 * y compris sur les octets que Pagefind vient d ecrire.
 *
 * @param {string} dist Chemin du repertoire de sortie, index compris.
 * @returns {string[]}
 */
export function manquementsDepot(dist) {
  return inspecterSortie(dist).manquements;
}

/** Le message d echec, ecrit pour quelqu un qui decouvre la contrainte. */
function echec(titre, manquements) {
  return new Error(
    `[${NOM}] ${titre}\n` +
      manquements.map((m) => `  - ${m}`).join('\n') +
      '\n\n  Contrainte dure du projet (brief §1, §5.4, recette §9, arbitrage T-09) :' +
      '\n  aucun JavaScript servi hors /recherche. L exemption est bornee aux chemins' +
      '\n  EXACTS `(en/)?pagefind/<fichier>.js` — jamais a un sous-arbre, jamais a `_astro/`.' +
      '\n  Le post-build echoue volontairement : un index de recherche ne rachete pas' +
      '\n  du JavaScript servi au reste du site.',
  );
}

/**
 * Genere l index et le depose dans `<dist>/pagefind`.
 *
 * @param {string} dist
 * @returns {Promise<{pages: number}>}
 */
export async function indexer(dist) {
  const { createIndex, close } = await import('pagefind');

  const { errors: erreursCreation, index } = await createIndex({});
  if (erreursCreation?.length) throw echec('Pagefind n a pas demarre :', erreursCreation);

  try {
    const { errors: erreursLecture, page_count: pages } = await index.addDirectory({ path: dist });
    if (erreursLecture?.length) throw echec('Pagefind n a pas lu la sortie :', erreursLecture);

    /* Zero page indexee est le mode d echec ou succes et echec rendent la meme sortie :
       le repertoire `pagefind/` est ecrit, la page /recherche se charge, le champ de
       saisie s affiche — et aucune requete ne rend jamais rien. Cf.
       [[quand-succes-et-echec-rendent-la-meme-sortie]]. */
    if (pages === 0) {
      throw echec('aucune page indexee :', [
        `Pagefind n a trouve aucun document a indexer dans ${dist}. Verifier que la sortie ` +
          'porte bien des `data-pagefind-body` (Base.astro) et qu elle n est pas vide.',
      ]);
    }

    const { errors: erreursEcriture } = await index.writeFiles({
      outputPath: path.join(dist, 'pagefind'),
    });
    if (erreursEcriture?.length) throw echec('Pagefind n a pas ecrit son index :', erreursEcriture);

    /* DEFAUT VOLONTAIRE (preuve en cassant, tache 08f04f58) : un octet de JavaScript
       depose HORS de `pagefind/`, exactement ce qu une version de Pagefind pourrait faire
       en changeant de disposition. Personne ne le voyait avant que preuve:rendu emprunte
       la porte de la production. */
    (await import('node:fs')).writeFileSync(path.join(dist, 'mouchard.js'), 'console.log(1)');

    return { pages };
  } finally {
    await close();
  }
}

/** Le compte rendu au vert, en une ligne. */
export function resumeIndex(dist, pages) {
  const rapport = inspecterSortie(dist);
  return (
    `${pages} page(s) indexee(s) par Pagefind ; sortie re-inspectee : ` +
    `${rapport.fichiers} fichier(s), aucun JavaScript servi hors /recherche.`
  );
}

// --- Usage en ligne de commande -------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dist = process.argv[2] ? path.resolve(process.argv[2]) : path.join(racine, 'dist');

  const { pages } = await indexer(dist);

  const manquements = manquementsDepot(dist);
  if (manquements.length > 0) {
    const erreur = echec(`${manquements.length} manquement(s) APRES depot de l index :`, manquements);
    console.error(`\n✖ ${erreur.message}`);
    process.exit(1);
  }
  console.log(`✔ ${resumeIndex(dist, pages)}`);
}
