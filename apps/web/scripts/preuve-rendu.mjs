/**
 * Construit le site sur les fixtures, puis inspecte la sortie produite.
 *
 * C est la preuve executable des deux criteres qui ne se lisent pas dans le code :
 *   1. une page article rendue affiche les HUIT types de blocs ;
 *   2. l inventaire des fichiers servis ne contient AUCUN JavaScript.
 *
 * Le critere 2 est deja tenu par la garde T-09, qui fait echouer `astro build`. Ce
 * script ne la remplace pas : il ajoute le constat par TYPE DE BLOC, que la garde ne
 * peut pas faire — elle sait dire « aucun script », pas « les huit blocs sont la ».
 *
 * `npm run preuve:rendu`. La sortie va dans `dist/`, comme un build normal.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { demarrerServeurFixtures } from './serveur-fixtures.mjs';
import { inspecterSortie, resume } from './verifier-sortie.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Les huit blocs du §3.6, chacun reconnu par la classe que son composant pose. */
const SIGNATURES = {
  'bloc.texte': 'bloc-texte',
  'bloc.citation': 'bloc-citation',
  'bloc.galerie': 'bloc-galerie',
  'bloc.encadre': 'bloc-encadre',
  'bloc.video': 'bloc-video',
  'bloc.image-legendee': 'bloc-image',
  'bloc.separateur': 'bloc-separateur',
  'bloc.chiffres-cles': 'bloc-chiffres',
};

function lancer(commande, arguments_, env) {
  return new Promise((resoudre) => {
    const processus = spawn(commande, arguments_, {
      cwd: RACINE,
      env: { ...process.env, ...env },
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    processus.on('close', resoudre);
  });
}

function pagesArticle(dist) {
  const dossier = path.join(dist, 'article');
  if (!fs.existsSync(dossier)) return [];
  return fs
    .readdirSync(dossier, { withFileTypes: true })
    .filter((entree) => entree.isDirectory())
    .map((entree) => ({
      slug: entree.name,
      html: path.join(dossier, entree.name, 'index.html'),
    }))
    .filter((page) => fs.existsSync(page.html));
}

const serveur = await demarrerServeurFixtures();
console.log(`\n▸ Strapi de substitution : ${serveur.url} (fixtures de tests/fixtures/)\n`);

const code = await lancer('npx', ['astro', 'build'], {
  ECHO_STRAPI_URL: serveur.url,
  ECHO_STRAPI_API_TOKEN_READONLY: 'jeton-de-fixture',
  ECHO_SITE_URL: 'https://echo.ayfiweb.fr',
});
await serveur.arreter();

if (code !== 0) {
  console.error(`\n✖ Le build a echoue (code ${code}).`);
  process.exit(code);
}

const dist = path.join(RACINE, 'dist');
const rapport = inspecterSortie(dist);
const pages = pagesArticle(dist);

console.log('\n─────────────  PREUVE DE RENDU  ─────────────\n');
console.log(`Sortie : ${resume(rapport)}`);
console.log(`Pages article generees : ${pages.length}`);

let complete = false;
for (const page of pages) {
  const html = fs.readFileSync(page.html, 'utf8');
  const absents = Object.entries(SIGNATURES)
    .filter(([, classe]) => !html.includes(classe))
    .map(([bloc]) => bloc);

  console.log(
    `  /article/${page.slug} : ${Object.keys(SIGNATURES).length - absents.length}/8 types de blocs` +
      (absents.length > 0 ? ` — absents : ${absents.join(', ')}` : ''),
  );
  if (absents.length === 0) complete = true;
}

/**
 * Les liens de reseaux, lus DANS LA SORTIE et pas dans le composant.
 *
 * A-04 exige zero avertissement axe-core, et le mode d echec d une icone est toujours le
 * meme : un lien dont le seul contenu est un dessin n a aucun nom accessible, et un lecteur
 * d ecran annonce son URL. La regle est donc « glyphe decoratif + intitule textuel »,
 * jamais l inverse. Ce controle constate les deux sur le HTML emis :
 *   - chaque glyphe porte `aria-hidden="true"` (sinon il entre dans le nom du lien) ;
 *   - chaque lien garde du texte dans le flux (masque a l oeil, pas retire du document).
 * Ce n est PAS une campagne axe-core — elle demande un navigateur, que ce depot n a pas.
 * C est la classe d ecart que l icone introduit, et la seule qu on puisse voir d ici.
 */
function ecartsLiensSociaux(dist) {
  const ecarts = [];
  for (const fichier of fs.readdirSync(dist, { recursive: true })) {
    if (!String(fichier).endsWith('.html')) continue;
    const html = fs.readFileSync(path.join(dist, String(fichier)), 'utf8');
    const liens = [...html.matchAll(/<a\b[^>]*class="[^"]*liens-sociaux__lien[^"]*"[^>]*>([\s\S]*?)<\/a>/g)];
    for (const [, contenu] of liens) {
      const glyphe = (contenu.match(/<svg[\s\S]*?<\/svg>/) ?? [''])[0];
      if (glyphe && !/aria-hidden="true"/.test(glyphe)) {
        ecarts.push(`${fichier} : un glyphe sans aria-hidden entre dans le nom du lien`);
      }
      const texte = contenu.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim();
      if (texte.length === 0) ecarts.push(`${fichier} : un lien social sans texte accessible`);
    }
    if (liens.length > 0 && !/<nav[^>]*class="liens-sociaux"[^>]*aria-label="[^"]+"/.test(html)) {
      ecarts.push(`${fichier} : la liste de reseaux n est pas nommee (aria-label)`);
    }
  }
  return ecarts;
}

const ecartsSociaux = ecartsLiensSociaux(dist);
console.log(
  ecartsSociaux.length === 0
    ? 'Liens de reseaux : glyphes en aria-hidden, texte accessible present sur chaque lien.'
    : `Liens de reseaux : ${ecartsSociaux.length} ecart(s).`,
);

if (rapport.manquements.length > 0) {
  console.error('\n✖ Manquements dans la sortie :');
  for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
  process.exit(1);
}

if (ecartsSociaux.length > 0) {
  console.error('\n✖ Accessibilite des liens de reseaux :');
  for (const ecart of ecartsSociaux) console.error(`  - ${ecart}`);
  process.exit(1);
}

if (!complete) {
  console.error('\n✖ Aucune page article ne rend les 8 types de blocs.');
  process.exit(1);
}

console.log('\n✔ Une page article rend les 8 types de blocs, et aucun JavaScript n est servi.\n');
