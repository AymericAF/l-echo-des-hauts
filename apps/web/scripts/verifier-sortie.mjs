/**
 * Inspecte la SORTIE du build, pas le code source.
 *
 * Deux contraintes dures du projet ne se lisent pas dans un fichier :
 *   - « 0 ko de JavaScript servi hors /recherche » (§1, §5.4, recette §9). Un composant
 *     hydrate par megarde, une integration qui injecte un script, un `<script>` recopie
 *     d un exemple : rien de tout cela ne fait echouer un build Astro tout seul. Ca se
 *     voit dans `dist/`, et seulement si on regarde.
 *   - `output: 'static'` integral (§4.1). Une seule route en `prerender = false` fait
 *     basculer la sortie entiere en mode serveur — la violation ne se voit pas dans le
 *     fichier fautif (T-09).
 *
 * Ce fichier ne fait que CONSTATER. Ce qui rend la contrainte opposable en machine, c est
 * `integrations/garde-t09.mjs`, qui appelle `inspecterSortie` depuis le build lui-meme et
 * le fait sortir en code non nul. Lancer ce script a la main reste utile pour inspecter un
 * `dist/` deja construit : `npm run verifier:sortie`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ISSUES } from './issues.mjs';

/**
 * L exception `/recherche`, bornee au plus juste.
 *
 * §0 des arbitrages techniques : « /recherche est UNE page, et c est la seule exemptee ».
 * L exception porte donc sur des chemins EXACTS, jamais sur un sous-arbre :
 *   - `recherche/` en prefixe libre exempterait `/recherche/avancee/`, et n importe quelle
 *     page future rangee sous ce segment ;
 *   - exempter `_astro/` parce que la recherche s en sert ouvrirait le JavaScript a TOUT
 *     le site : ce repertoire porte les bundles partages, il est servi a toutes les pages.
 *     C est le vecteur de fuite le plus probable, et il reste ferme.
 * Le JavaScript legal est celui de Pagefind (§5.4), qui vit dans son propre repertoire.
 */
const PAGES_EXEMPTEES = new Set(['recherche/index.html', 'en/recherche/index.html']);
const JS_EXEMPTE = /^(en\/)?pagefind\/[^/]+\.(js|mjs|cjs)$/;

/** Marqueurs d une sortie serveur a la racine de `dist/` (§4.1 : aucune route serveur). */
const MARQUEURS_SERVEUR = ['_worker.js', 'server', 'functions', '_routes.json'];

function fichiersDe(dossier) {
  const trouves = [];
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const complet = path.join(dossier, entree.name);
    if (entree.isDirectory()) trouves.push(...fichiersDe(complet));
    else trouves.push(complet);
  }
  return trouves;
}

/**
 * Les balises ouvrantes du HTML, sans leur contenu textuel.
 *
 * Chercher ` on...=` dans le document entier remonterait « one = 1 » ecrit dans un article.
 * Un faux positif sur une garde dure finit toujours de la meme facon : on la desactive.
 */
function balisesOuvrantes(html) {
  return html.match(/<[a-z][^>]*>/gi) ?? [];
}

/**
 * @param {string} dist Chemin du repertoire de sortie.
 * @returns {{manquements: string[], issue: number, pages: number, fichiers: number, octets: number}}
 */
export function inspecterSortie(dist) {
  if (!fs.existsSync(dist)) {
    /* UNE INCAPACITE N EST PAS UNE ANOMALIE. Jusqu au 2026-08-10 ce retour sortait en `1`,
       le code d un manquement du site : « la sortie de construction est absente » et « la
       sortie est presente et fautive » devenaient indiscernables pour un lecteur
       automatique, alors qu elles envoient a des gestes opposes — comprendre pourquoi rien
       n a ete construit, ou corriger le site. La convention vient de `./issues.mjs` et n est
       PAS recopiee ici : deux definitions d un code de sortie finissent par diverger. */
    return {
      manquements: [`sortie absente : ${dist}`],
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      pages: 0,
      fichiers: 0,
      octets: 0,
    };
  }

  const tous = fichiersDe(dist).map((f) => ({
    absolu: f,
    relatif: path.relative(dist, f).split(path.sep).join('/'),
  }));

  const manquements = [];

  // 1. Aucun fichier JavaScript servi, hors le bundle Pagefind de /recherche.
  for (const fichier of tous) {
    if (!/\.(js|mjs|cjs)$/.test(fichier.relatif)) continue;
    if (JS_EXEMPTE.test(fichier.relatif)) continue;
    manquements.push(`fichier JavaScript servi : ${fichier.relatif}`);
  }

  // 2. Aucune balise <script> ni attribut d evenement inline, hors la page /recherche.
  for (const fichier of tous) {
    if (!fichier.relatif.endsWith('.html')) continue;
    if (PAGES_EXEMPTEES.has(fichier.relatif)) continue;
    const html = fs.readFileSync(fichier.absolu, 'utf8');
    if (/<script[\s>]/i.test(html)) {
      manquements.push(`balise <script> dans ${fichier.relatif}`);
    }
    const baliseFautive = balisesOuvrantes(html).find((b) => /\son[a-z]+\s*=/i.test(b));
    if (baliseFautive) {
      manquements.push(
        `attribut d evenement inline dans ${fichier.relatif} : ${baliseFautive.slice(0, 80)}`,
      );
    }
  }

  // 3. Aucune trace de sortie serveur.
  for (const marqueur of MARQUEURS_SERVEUR) {
    if (fs.existsSync(path.join(dist, marqueur))) {
      manquements.push(`sortie serveur detectee : ${marqueur} (§4.1 : aucune route serveur)`);
    }
  }

  return {
    manquements,
    issue: manquements.length > 0 ? ISSUES.ANOMALIE : ISSUES.CONFORME,
    pages: tous.filter((f) => f.relatif.endsWith('.html')).length,
    fichiers: tous.length,
    octets: tous.reduce((total, f) => total + fs.statSync(f.absolu).size, 0),
  };
}

/** Le compte rendu au vert, en une ligne. */
export function resume(rapport) {
  return (
    `${rapport.pages} page(s) HTML, ${rapport.fichiers} fichier(s), ` +
    `${(rapport.octets / 1024).toFixed(1)} Kio : aucun JavaScript servi, aucune sortie serveur.`
  );
}

/* Execution directe : `node scripts/verifier-sortie.mjs [dist]`. L argument est accepte
   comme sur les cinq autres — sans lui, le seul moyen d exercer ce script sur autre chose
   que `apps/web/dist` etait de DEPLACER la sortie du depot, ce qui rend la preuve
   difficilement rejouable. `npm run verifier:sortie` n en passe aucun : le defaut est
   inchange. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const rapport = inspecterSortie(process.argv[2] ?? path.join(racine, 'dist'));
  if (rapport.issue === ISSUES.VERIFICATION_IMPOSSIBLE) {
    console.error('\n⛔ VERIFICATION IMPOSSIBLE — aucune sortie n a ete jugee :');
    for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
    process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
  }
  if (rapport.manquements.length > 0) {
    console.error(`\n✖ ${rapport.manquements.length} manquement(s) :`);
    for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
    process.exit(ISSUES.ANOMALIE);
  }
  console.log(`✔ ${resume(rapport)}`);
}
