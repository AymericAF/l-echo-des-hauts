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
 * l index ecrit, on RETIRE ce que rien ne charge puis on RELANCE `inspecterSortie` — la
 * meme fonction, avec le meme critere — sur la sortie AUGMENTEE ET NETTOYEE. La contrainte
 * « aucun JavaScript servi hors /recherche » est donc verifiee sur ce qui est reellement
 * deploye, pas sur ce qui existait avant que l index n arrive.
 *
 * ~~la meme exemption bornee aux chemins exacts `(en/)?pagefind/<fichier>.js`~~ —
 * **2026-08-12 (tache cf33a689)** : ce n est plus un motif de chemin mais l ATTEIGNABILITE
 * depuis la page /recherche. Le motif laissait passer 410,0 Kio de bundles servis et
 * charges par personne, dont le seul qui fabrique une feuille de style a l execution.
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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { bundlesPagefindNonCharges, inspecterSortie } from './verifier-sortie.mjs';

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

/**
 * RETIRE DE LA SORTIE LES BUNDLES QUE PAGEFIND DEPOSE ET QUE RIEN NE CHARGE.
 *
 * MESURE DU 2026-08-12 sur la sortie reellement indexee (24 pages) : Pagefind ecrit neuf
 * fichiers `.js`/`.css` dans `dist/pagefind/`, la page n en charge que deux — `pagefind.js`
 * (son `data-bundle`) et `pagefind-worker.js` (que le premier demarre). Les sept autres,
 * 419 831 octets soit 410,0 Kio, etaient servis publiquement et lus par personne, sur un
 * site dont la contrainte dure du §1 est « zero JavaScript servi hors /recherche ». Parmi
 * eux, `pagefind-highlight.js` est le seul a fabriquer une feuille de style a l execution :
 * il ne manquait qu une ligne pour rouvrir la decision « `style-src` : rien a ouvrir ».
 *
 * ICI ET PAS A LA MAIN : le prochain build les redeposerait. AVANT la re-inspection, pour
 * que la garde juge la sortie REELLEMENT deployee et non celle d avant nettoyage.
 *
 * CE QU IL NE TOUCHE JAMAIS : tout ce qui n est ni script ni feuille — `pagefind-entry.json`,
 * `wasm.*.pagefind`, `*.pf_meta`, `index/`, `fragment/`. Ces fichiers sont demandes a
 * l execution par des URL CALCULEES qu aucune lecture statique ne voit ; les retirer rendrait
 * la recherche muette en repondant 200 partout — le mode d echec ou succes et echec rendent
 * la meme sortie.
 *
 * ⚠ CE QUE CE RETRAIT REND INERTE, HORS DE CE DEPOT — mesure, pas suppose. Le temoin
 * `__temoin-ui` de `scripts/mesure-csp-style.mjs` (depot de documentation) charge
 * `/pagefind/pagefind-ui.js` et `/pagefind/pagefind-ui.css` DEPUIS LA SORTIE qu on lui
 * donne : c est sa contre-epreuve, celle qui montre ce que l interface packagee ferait.
 * Mesure du 2026-08-12, meme instrument, meme sortie, avant puis apres le retrait :
 *
 *   avant  __temoin-ui : 5 resultat(s), 0 violation, 2 injection(s)
 *   apres  __temoin-ui : 0 resultat(s), 0 violation, 1 injection(s)
 *
 * Les six mesures REELLES (fr/en x reference/echantillon x appliquee/contournee) sont, elles,
 * identiques des deux cotes : 5 et 4 resultats, 0 violation, 2 injections. La recherche n est
 * donc pas touchee — c est la contre-epreuve qui l est, et elle se tait sans le dire (un `0`
 * qui ressemble a une ligne propre). Le geste correct appartient a l instrument : servir le
 * bundle de l interface depuis `node_modules/pagefind`, jamais depuis une sortie de
 * production qui n a aucune raison de le porter.
 *
 * @param {string} dist
 * @returns {{relatif: string, octets: number}[]} ce qui a ete retire, pour le DIRE.
 */
export function retirerBundlesNonCharges(dist) {
  const retires = [];
  for (const relatif of bundlesPagefindNonCharges(dist)) {
    const absolu = path.join(dist, ...relatif.split('/'));
    retires.push({ relatif, octets: fs.statSync(absolu).size });
    fs.rmSync(absolu);
  }
  return retires;
}

/** Le message d echec, ecrit pour quelqu un qui decouvre la contrainte. */
function echec(titre, manquements) {
  return new Error(
    `[${NOM}] ${titre}\n` +
      manquements.map((m) => `  - ${m}`).join('\n') +
      '\n\n  Contrainte dure du projet (brief §1, §5.4, recette §9, arbitrage T-09) :' +
      '\n  aucun JavaScript servi hors /recherche. L exemption est bornee a ce que la page' +
      '\n  CHARGE — jamais a un repertoire, jamais a un sous-arbre, jamais a `_astro/`.' +
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

  /* AVANT la re-inspection : la garde doit juger la sortie telle qu elle sera deployee. */
  const retires = retirerBundlesNonCharges(dist);
  if (retires.length > 0) {
    const octets = retires.reduce((total, r) => total + r.octets, 0);
    console.log(
      `▸ ${retires.length} bundle(s) Pagefind charge(s) par aucune page, retire(s) ` +
        `(${(octets / 1024).toFixed(1)} Kio) : ${retires.map((r) => r.relatif).join(', ')}`,
    );
  }

  const manquements = manquementsDepot(dist);
  if (manquements.length > 0) {
    const erreur = echec(`${manquements.length} manquement(s) APRES depot de l index :`, manquements);
    console.error(`\n✖ ${erreur.message}`);
    process.exit(1);
  }
  console.log(`✔ ${resumeIndex(dist, pages)}`);
}
