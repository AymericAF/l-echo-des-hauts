/**
 * Confronte la sortie a une regle simple : UN NIVEAU DE TITRE NE SAUTE JAMAIS.
 *
 * LE DEFAUT QUE CE FICHIER FERME, mesure et non suppose. La campagne axe-core du
 * 2026-08-10 (117 URL x 2 vues, `docs/mesures/2026-08-10/M-06/axe-violations.csv`) n a
 * trouve qu UNE regle violee sur tout le site, et l a trouvee 68 fois : `heading-order`,
 * sur 34 URL (27 articles fr + 7 en), UN noeud par page, toujours le meme —
 * `<h4 class="bloc-encadre__titre">` pose juste apres un `<h2>`. Depuis que le corpus est
 * passe a 48 articles, l article que le §3 du protocole de mesure designe pour la porte P2
 * porte lui aussi un encadre : la porte se joue dessus (98 au lieu de 100 en accessibilite,
 * dispersion nulle sur 9 runs).
 *
 * POURQUOI UNE GARDE PLUTOT QU UN SEUL CORRECTIF. Le correctif vit dans un composant : il
 * tient tant que personne ne repose un titre trop bas. La campagne axe, elle, ne tourne
 * qu en recette — un defaut qui ne se voit qu a la campagne suivante a deja atteint la
 * production, ce qui est exactement ce qui vient d arriver. Cette garde s execute a CHAQUE
 * build, sur la sortie construite, et le fait ECHOUER.
 *
 * CE QU ELLE TIENT, ET CE QU ELLE NE TIENT PAS. Elle tient la regle que `heading-order`
 * tient : le niveau d un titre ne descend jamais de plus d un cran d un titre au suivant.
 * Elle ne tient NI le `h1` unique, NI la presence d un `h1` — l un vit dans A-21 et dans
 * le rendu de `RichTexte`, l autre est la regle axe `page-has-heading-one`. Les dupliquer
 * ici ferait rougir deux gardes sur un meme defaut, et enverrait corriger deux fois.
 *
 * REMONTER EST LICITE. `h4` puis `h2` ferme deux sections et en ouvre une : c est la
 * lecture normale d un article. Seule la DESCENTE de plus d un cran fait disparaitre un
 * echelon du sommaire que le lecteur d ecran se construit.
 *
 * PORTEE : toutes les pages HTML de la sortie, `/recherche` et `/en/` comprises.
 *
 * `npm run verifier:cascade-titres` pour inspecter un `dist/` deja construit. Ce qui rend
 * la clause opposable en machine, c est `integrations/garde-cascade-titres.mjs`, qui
 * appelle cette fonction DEPUIS le build et le fait sortir en code non nul.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ISSUES, manquementCorpusVide } from './issues.mjs';

/** Longueur d extrait citee dans un manquement : assez pour reconnaitre, pas pour noyer. */
const EXTRAIT = 80;

/**
 * Les elements dont le contenu N EST PAS RENDU comme du balisage. Un `<h6>` ecrit dans un
 * `<script>` ou un `<template>` n arrive jamais dans l arbre de la page : le compter
 * ferait rougir la garde sur un titre que personne ne voit, et axe-core ne le voit pas
 * davantage. Le site ne sert aucun JavaScript (garde T-09) — c est neanmoins ecrit ici,
 * parce qu une garde ne doit pas dependre d une autre pour rester juste.
 */
const NON_RENDUS = ['script', 'style', 'template', 'noscript'];

function fichiersDe(dossier) {
  const trouves = [];
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const complet = path.join(dossier, entree.name);
    if (entree.isDirectory()) trouves.push(...fichiersDe(complet));
    else trouves.push(complet);
  }
  return trouves;
}

function extrait(texte) {
  const compact = texte.replace(/\s+/g, ' ').trim();
  return compact.length > EXTRAIT ? `${compact.slice(0, EXTRAIT)}…` : compact;
}

/** Le HTML prive de ce qui n est pas rendu : commentaires, scripts, gabarits, styles. */
function balisageRendu(html) {
  let net = html.replace(/<!--[\s\S]*?-->/g, ' ');
  for (const balise of NON_RENDUS) {
    net = net.replace(new RegExp(`<${balise}\\b[\\s\\S]*?</${balise}\\s*>`, 'gi'), ' ');
  }
  return net;
}

/**
 * Les titres d une page, DANS L ORDRE DU DOCUMENT — c est le seul ordre qui compte : ni
 * l imbrication (`<aside>`, `<section>`) ni les roles ARIA ne remettent le compteur a
 * zero, et axe-core ne les regarde pas non plus.
 *
 * @returns {{ niveau: number, texte: string }[]}
 */
export function titresDe(html) {
  const trouves = [];
  const balises = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;
  for (const trouve of balisageRendu(html).matchAll(balises)) {
    trouves.push({
      niveau: Number(trouve[1]),
      texte: extrait(trouve[2].replace(/<[^>]*>/g, ' ')),
    });
  }
  return trouves;
}

/** Le manquement d un niveau saute, redige pour qui decouvre la contrainte. */
function manquementSaut(relatif, rang, precedent, courant) {
  return (
    `${relatif} : titre n°${rang} — h${precedent.niveau} puis h${courant.niveau}, ` +
    `${courant.niveau - precedent.niveau - 1} niveau(x) saute(s) ` +
    `(« ${precedent.texte} » puis « ${courant.texte} »)`
  );
}

/**
 * @param {string} dist Le chemin de la sortie construite.
 * @returns {{ manquements: string[], issue: number, pages: number, titres: number }}
 */
export function inspecterCascadeTitres(dist) {
  if (!fs.existsSync(dist)) {
    /* UNE INCAPACITE N EST PAS UNE ANOMALIE : « la sortie est absente » envoie chercher
       pourquoi rien n a ete construit, « un niveau saute » envoie corriger un composant.
       Convention IMPORTEE de `./issues.mjs`, jamais recopiee. */
    return {
      manquements: [`sortie absente : ${dist}`],
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      pages: 0,
      titres: 0,
    };
  }

  const tous = fichiersDe(dist).map((f) => path.relative(dist, f).split(path.sep).join('/'));

  /* Zero page inspectee n est pas une preuve : c est une garde branchee sur le vide. Le
     declencheur est « zero PAGE », jamais « zero titre » — une page sans titre est
     legitimement conforme, et rougir dessus rendrait la garde rouge en permanence. */
  if (!tous.some((relatif) => relatif.endsWith('.html'))) {
    return {
      manquements: [manquementCorpusVide(dist, tous.length)],
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      pages: 0,
      titres: 0,
    };
  }

  const manquements = [];
  let pages = 0;
  let titres = 0;

  for (const relatif of tous) {
    if (!relatif.endsWith('.html')) continue;
    pages += 1;
    const trouves = titresDe(fs.readFileSync(path.join(dist, relatif), 'utf8'));
    titres += trouves.length;
    for (let rang = 1; rang < trouves.length; rang += 1) {
      const precedent = trouves[rang - 1];
      const courant = trouves[rang];
      /* Le PREMIER titre n est compare a rien : il n a pas de precedent, et « la page
         commence par un h2 » est le sujet d une autre regle (`page-has-heading-one`). */
      if (courant.niveau > precedent.niveau + 1) {
        manquements.push(manquementSaut(relatif, rang + 1, precedent, courant));
      }
    }
  }

  return {
    manquements,
    issue: manquements.length > 0 ? ISSUES.ANOMALIE : ISSUES.CONFORME,
    pages,
    titres,
  };
}

/** Le compte rendu au vert, en une ligne. */
export function resumeCascadeTitres(rapport) {
  return (
    `${rapport.pages} page(s) HTML, ${rapport.titres} titre(s) : aucun niveau saute — ` +
    'la suite des titres reste le sommaire du document pour qui navigue au lecteur d ecran.'
  );
}

// --- Usage en ligne de commande -------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dist = process.argv[2] ?? path.join(racine, 'dist');
  const rapport = inspecterCascadeTitres(dist);
  if (rapport.issue === ISSUES.VERIFICATION_IMPOSSIBLE) {
    console.error('\n⛔ VERIFICATION IMPOSSIBLE — aucune cascade de titres n a ete jugee :');
    for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
    process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
  }
  if (rapport.manquements.length > 0) {
    console.error(`\n✖ ${rapport.manquements.length} manquement(s) :`);
    for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
    process.exit(ISSUES.ANOMALIE);
  }
  console.log(`✔ ${resumeCascadeTitres(rapport)}`);
}
