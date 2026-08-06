/**
 * Verifie la SORTIE du build, pas le code source.
 *
 * Deux contraintes dures du projet ne se lisent pas dans un fichier :
 *   - « 0 ko de JavaScript servi hors /recherche » (§1, §5.4, recette §9). Un composant
 *     hydrate par megarde, une integration qui injecte un script, un `<script>` recopie
 *     d un exemple : rien de tout cela ne fait echouer un build Astro. Ca se voit dans
 *     `dist/`, et seulement si on regarde.
 *   - `output: 'static'` integral (§4.1). Une seule route en `prerender = false` fait
 *     basculer la sortie entiere en mode serveur — la violation ne se voit pas dans le
 *     fichier fautif (T-09).
 *
 * Ce script est un ACOMPTE sur la garde T-09, pas la garde elle-meme : il constate la
 * sortie apres coup, la garde T-09 doit faire echouer le build lui-meme.
 *
 * Sort en 1 au premier manquement. `node scripts/verifier-sortie.mjs`
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RACINE, 'dist');

/** Seule page ou du JavaScript est legal (§0 des arbitrages techniques). */
const CHEMINS_AUTORISES = [/^recherche\//, /^en\/recherche\//];

if (!fs.existsSync(DIST)) {
  console.error('dist/ absent : lancer `npm run build` avant la verification.');
  process.exit(1);
}

function fichiers(dossier) {
  const trouves = [];
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const complet = path.join(dossier, entree.name);
    if (entree.isDirectory()) trouves.push(...fichiers(complet));
    else trouves.push(complet);
  }
  return trouves;
}

const tous = fichiers(DIST).map((f) => ({
  absolu: f,
  relatif: path.relative(DIST, f).split(path.sep).join('/'),
}));

const manquements = [];

// 1. Aucun fichier JavaScript servi, hors /recherche.
for (const fichier of tous) {
  if (!/\.(js|mjs|cjs)$/.test(fichier.relatif)) continue;
  if (CHEMINS_AUTORISES.some((motif) => motif.test(fichier.relatif))) continue;
  manquements.push(`fichier JavaScript servi : ${fichier.relatif}`);
}

// 2. Aucune balise <script> dans le HTML, hors /recherche.
for (const fichier of tous) {
  if (!fichier.relatif.endsWith('.html')) continue;
  if (CHEMINS_AUTORISES.some((motif) => motif.test(fichier.relatif))) continue;
  const html = fs.readFileSync(fichier.absolu, 'utf8');
  if (/<script[\s>]/i.test(html)) manquements.push(`balise <script> dans ${fichier.relatif}`);
  if (/\son[a-z]+\s*=/i.test(html)) manquements.push(`attribut d evenement inline dans ${fichier.relatif}`);
}

// 3. Aucune trace de sortie serveur.
for (const marqueur of ['_worker.js', 'server', 'functions', '_routes.json']) {
  if (fs.existsSync(path.join(DIST, marqueur))) {
    manquements.push(`sortie serveur detectee : dist/${marqueur} (§4.1 : aucune route serveur)`);
  }
}

const pages = tous.filter((f) => f.relatif.endsWith('.html')).length;
const octets = tous.reduce((total, f) => total + fs.statSync(f.absolu).size, 0);

if (manquements.length > 0) {
  console.error(`\n✖ ${manquements.length} manquement(s) :`);
  for (const manquement of manquements) console.error(`  - ${manquement}`);
  process.exit(1);
}

console.log(
  `✔ ${pages} page(s) HTML, ${tous.length} fichier(s), ${(octets / 1024).toFixed(1)} Kio : ` +
    'aucun JavaScript servi, aucune sortie serveur.',
);
