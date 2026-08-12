/**
 * JUGER UNE SORTIE CONSTRUITE, QUELLE QU ELLE SOIT — la meme population, le meme verdict.
 *
 * LE DEFAUT QUE CE FICHIER FERME, mesure le 2026-08-12 (tache da329cb3). Le corpus de
 * recette (`scripts/corpus-recette.mjs`) est construit par `preuve-pagination.mjs` dans
 * `dist-recette/` — 54 routes le 2026-08-12 — et il exerce EXACTEMENT ce que le corpus
 * editorial n atteint pas : une page 2, une categorie a douze pile, un article non
 * traduit, une rubrique sans contrepartie anglaise, la 404. Ces pages-la n etaient jugees
 * par PERSONNE :
 *
 *   - aucun des sept verificateurs de sortie ne les lisait (seul `inspecterLiens` etait
 *     appele, en direct, pour les liens morts) ;
 *   - `dist-recette/pagefind/` n existait pas — releve du 2026-08-12, le repertoire est
 *     absent apres `npm run preuve:pagination`. Le corpus n etait donc pas indexe, et la
 *     RE-INSPECTION que `index-pagefind.mjs` fait apres depot — la seule qui voie les
 *     octets ecrits APRES `astro build` — ne s exercait pas sur lui.
 *
 * Autrement dit : un defaut qui ne se manifesterait QUE sur une page paginee, sur un
 * article non traduit ou sur la 404 passait au travers de tout le dispositif. Une garde
 * dont l objet n est jamais soumis ne garde rien — c est la troisieme forme du meme
 * defaut que les taches 772ac0ac et da2975e2 corrigent par les deux autres bouts.
 *
 * LA POPULATION NE SE RECOPIE PAS. Elle est celle de `verificateurs-de-sortie.mjs`
 * (`verifier:*` de package.json, moins les deux exemptes dont le corpus est une reponse
 * HTTP). Une seconde liste diverge toujours de la premiere : c est precisement le defaut
 * du 2026-08-11 que cette derivation a ferme pour l integration continue.
 *
 * AUCUNE EXEMPTION PROPRE AU CORPUS DE RECETTE, ET C EST MESURE, PAS SUPPOSE. Le
 * 2026-08-12, les SEPT verificateurs derives ont ete lances sur le `dist-recette/` produit
 * par `npm run preuve:pagination` : les sept rendent `0`, sur 54 pages — cascade-titres
 * (323 titres), images (297), liens (1 366), origine-medias (513 references), seo (50 URL
 * au sitemap, 127 nœuds structures, 32 images OG), sortie (111 fichiers), styles-en-ligne.
 * Aucun n a besoin d etre excuse. Si un jour l un d eux ne peut pas juger ce corpus, il
 * rendra `2` et le dira — il ne faudra pas le retirer en silence de la boucle.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ISSUES } from './issues.mjs';
import { verificateursALancer } from './verificateurs-de-sortie.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Ce qu il faut lancer pour juger `dist`, un element par verificateur.
 *
 * `node scripts/verifier-<nom>.mjs <dist> <origine>` et non `npm run` : le nom vient DEJA
 * de `package.json` par la derivation, et passer par npm ajouterait un lanceur qui
 * normalise parfois les codes de sortie — or c est le `2` contre le `1` qui porte tout le
 * sens ici. L origine est passee a tous : les trois qui la lisent (`liens`,
 * `origine-medias`, `seo`) la prennent en `argv[3]`, les autres l ignorent.
 *
 * @param {{scripts?: Record<string, string>}} paquet
 * @param {string} dist
 * @param {string} origine
 * @returns {{nom: string, script: string, arguments: string[]}[]}
 */
export function commandesDeJugement(paquet, dist, origine) {
  return verificateursALancer(paquet).map((nom) => ({
    nom,
    script: `scripts/verifier-${nom}.mjs`,
    arguments: [`scripts/verifier-${nom}.mjs`, dist, origine],
  }));
}

/**
 * Ce qui empeche de juger — avant de lancer quoi que ce soit.
 *
 * Une liste vide ferait tourner la boucle sur zero verificateur et rendre `0` : succes et
 * echec rendraient la meme sortie. Un script annonce mais absent du disque serait un
 * `127` que rien ne distinguerait d une anomalie.
 *
 * @param {{nom: string, script: string}[]} commandes
 * @param {string} racine
 * @returns {string[]}
 */
export function incapacitesDuJugement(commandes, racine = RACINE) {
  const ecarts = [];
  if (commandes.length === 0) {
    ecarts.push(
      'aucun verificateur a lancer sur cette sortie : la boucle tournerait sur du vide et ' +
        'la preuve sortirait en vert sans avoir rien juge.',
    );
  }
  for (const commande of commandes) {
    if (!fs.existsSync(path.join(racine, commande.script))) {
      ecarts.push(`${commande.script} est annonce par package.json mais n existe pas sur le disque.`);
    }
  }
  return ecarts;
}

/**
 * Le verdict de la boucle, a partir des codes rendus.
 *
 * L INCAPACITE PRIME SUR L ANOMALIE, et ce n est pas arbitraire : quand un verificateur
 * n a rien pu juger, les `0` de ses voisins ne couvrent plus la sortie entiere. Rendre `1`
 * enverrait corriger le site alors qu on ne sait meme pas ce qui a ete regarde. Le geste
 * est de rendre la sortie jugeable d abord.
 *
 * @param {{nom: string, code: number}[]} resultats
 * @returns {{issue: number, lignes: string[]}}
 */
export function verdictDuJugement(resultats) {
  const incapables = resultats.filter((r) => r.code === ISSUES.VERIFICATION_IMPOSSIBLE).map((r) => r.nom);
  const anomalies = resultats
    .filter((r) => r.code !== ISSUES.CONFORME && r.code !== ISSUES.VERIFICATION_IMPOSSIBLE)
    .map((r) => `${r.nom} (code ${r.code})`);

  const lignes = [];
  if (incapables.length > 0) {
    lignes.push(
      `N ONT PAS PU JUGER — code 2, il manquait de quoi juger. Corriger l ENVIRONNEMENT : ${incapables.join(', ')}`,
    );
  }
  if (anomalies.length > 0) {
    lignes.push(`ONT JUGE, ET TROUVE — code 1. Corriger le SITE : ${anomalies.join(', ')}`);
  }

  if (incapables.length > 0) return { issue: ISSUES.VERIFICATION_IMPOSSIBLE, lignes };
  if (anomalies.length > 0) return { issue: ISSUES.ANOMALIE, lignes };
  return {
    issue: ISSUES.CONFORME,
    lignes: [`${resultats.length} verificateur(s) de sortie, tous conformes (code 0).`],
  };
}
