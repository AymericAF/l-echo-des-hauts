/**
 * Depose dans la SORTIE les octets des medias que les pages referencent.
 *
 * C EST LA SECONDE MOITIE DE T-01. L arbitrage (`docs/arbitrages-techniques.md`) dit
 * « l image servie depuis notre propre domaine, TELECHARGEE AU BUILD ».
 * `src/lib/media.ts` tient le chemin ecrit dans la page ; ce fichier tient les octets
 * deposes sous ce chemin. L un sans l autre remplacerait une image INTERDITE par une
 * image ABSENTE — meme page blanche, autre cause.
 *
 * LA LISTE SE DERIVE DE LA SORTIE, jamais d un registre. Un registre tenu par les
 * composants serait une seconde source de verite : le jour ou une page reference un
 * media sans passer par lui, le fichier manque et rien ne le dit. En relisant `dist/`,
 * on telecharge exactement ce que le site demande — ni plus (aucune mediatheque entiere
 * recopiee), ni moins.
 *
 * ELLE EST LUE DANS LE HTML ET DANS LE XML. Un `og:image` vit dans une page, mais une
 * enclosure de flux vit dans `rss.xml` : ne scanner que le HTML laisserait une reference
 * sans octets, invisible depuis le navigateur.
 *
 * IL ECHOUE FORT. Un media introuvable arrete le build (`integrations/medias-locaux.mjs`
 * leve). C est le seul comportement acceptable : un 404 tolere rendrait un site sans
 * images, c est-a-dire exactement le defaut du 2026-08-08, avec un build vert par-dessus.
 *
 * IL NE TOUCHE PAS AU FORMAT. Les octets sont deposes tels que la mediatheque les rend.
 * Le traitement Sharp (AVIF + repli WebP, §5.3) est la decision `129b7fc6`, en attente
 * d Aymeric : elle s appliquera a des fichiers deja servis par le site, et ne change rien
 * a ce module.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CARACTERES_MEDIA, PREFIXE_MEDIAS, sourceDistanteMedia } from '../src/lib/media.ts';

/** Les extensions ou une reference de media peut apparaitre en clair. */
const TEXTES = /\.(html|xml|txt|css|json|webmanifest)$/i;

/**
 * Un chemin de media dans un document.
 *
 * La classe s arrete avant le guillemet, l espace et les separateurs de balise, ce qui
 * suffit a borner la reference dans un attribut comme dans une URL absolue.
 *
 * CE QU ELLE SUPPOSE DU PRODUCTEUR, et pourquoi ce n est PAS une devinette — verifie le
 * 2026-08-14 (tache `b863b636`) sur le paquet reellement installe. Un nom de fichier ne
 * traverse pas la mediatheque tel quel : `@strapi/upload` le remplace par un HASH
 * (`services/upload.js`, `hash: generateFileName(basename)`), lui-meme construit par
 * `services/image-manipulation.js` :
 *
 *     nameToSlug(name, { separator: '_', lowercase: false }) + '_' + 10 hex
 *
 * et le provider local sert `/uploads/${hash}${ext}`. Mesure de la vraie fonction :
 *
 *     « été.svg »         -> /uploads/ete_a1b2c3d4e5.svg
 *     « photo (1).svg »   -> /uploads/photo_1_a1b2c3d4e5.svg
 *     « c'est.svg »       -> /uploads/c_est_a1b2c3d4e5.svg
 *     « naïve œuvre.png » -> /uploads/naive_oeuvre_a1b2c3d4e5.png
 *
 * Accents translitteres, espaces / apostrophes / parentheses remplaces : la mediatheque ne
 * PEUT PAS emettre un nom hors de cette classe. Le soupcon inverse — un nom accentue jamais
 * releve, un nom a parenthese TRONQUE en son milieu, donc un 404 sur un fichier qui n a
 * jamais existe — a bien ete reproduit sur des references FABRIQUEES, mais aucune ne peut
 * venir du producteur reel. La lecture n a donc pas ete elargie : le faire aurait fallu
 * distinguer l espace separateur d un `srcset` de l espace d un nom de fichier, ce que rien
 * ne permet.
 *
 * ~~LA LIMITE, ECRITE PLUTOT QUE TUE : cette garantie reste une CONVENTION. Aucun test ne la
 * verrouille … Si la slugification de Strapi change, rien ici ne rougira : c est
 * `cheminLocalMedia`, qui ne filtre AUCUN caractere, qui ecrira le chemin, et cette classe qui
 * le lira mal.~~ — **REECRIT LE 2026-08-16 (tache `57a94366`) : le cas SILENCIEUX est ferme.**
 *
 * CE QUI RESTE VRAI, ET NE CHANGERA PAS : on ne verrouille TOUJOURS PAS la slugification de
 * Strapi elle-meme. `@strapi/utils` vit dans `apps/cms/node_modules` et n est pas resolvable
 * d ici ; l installer cote `apps/web` mesurerait une SECONDE COPIE, independante de celle du
 * producteur reel, et resterait verte le jour ou celui-ci changerait de version (voie ecartee
 * par Aymeric le 2026-08-14). Si la slugification change, rien ici ne le PREDIRA.
 *
 * CE QUI N EST PLUS VRAI : que rien ne rougirait. La classe vit desormais dans UN SEUL
 * litteral — `CARACTERES_MEDIA` de `../src/lib/media.ts` —, lu ici et ecrit la-bas, et
 * `cheminLocalMedia` LEVE si un chemin en sort. Les deux formes du defaut sont donc couvertes :
 * un caractere hors classe AU MILIEU tronquait la reference et faisait deja rougir le build par
 * le 404 ; un caractere hors classe en PREMIERE POSITION ne matchait RIEN et passait en
 * silence — c est ce second cas, le seul muet, qui est ferme cote producteur.
 */
// La regex de RELECTURE, construite sur la classe PARTAGEE. Elle est EXPORTEE pour que le test
// de non-divergence puisse la confronter a ce que `cheminLocalMedia` ECRIT. Sans cet export, le
// test comparerait la classe a elle-meme et resterait vert alors que les deux cotes ont diverge —
// constate en cassant, le 2026-08-16 (tache 57a94366).
export const REFERENCE = new RegExp(`${PREFIXE_MEDIAS}[${CARACTERES_MEDIA}]+`, 'g');

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
 * Les chemins de medias references par la sortie, dedoublonnes et tries.
 *
 * @param {string} dist Chemin du repertoire de sortie.
 * @returns {string[]}
 */
export function referencesMediasDe(dist) {
  if (!fs.existsSync(dist)) return [];
  const trouvees = new Set();

  for (const absolu of fichiersDe(dist)) {
    const relatif = path.relative(dist, absolu).split(path.sep).join('/');
    // Les medias deja deposes ne se scannent pas : un SVG peut contenir n importe quoi,
    // et se lire soi-meme fabriquerait des references qu aucune page ne demande.
    if (relatif.startsWith(PREFIXE_MEDIAS.slice(1))) continue;
    if (!TEXTES.test(relatif)) continue;

    for (const [reference] of fs.readFileSync(absolu, 'utf8').matchAll(REFERENCE)) {
      trouvees.add(reference);
    }
  }

  return [...trouvees].sort();
}

/** Le `fetch` reel, ramene a la forme minimale que ce module consomme. */
async function recupererParReseau(url) {
  const reponse = await fetch(url);
  if (!reponse.ok) return { ok: false, status: reponse.status, octets: null };
  return { ok: true, status: reponse.status, octets: Buffer.from(await reponse.arrayBuffer()) };
}

/**
 * Telecharge chaque media reference et l ecrit dans la sortie.
 *
 * @param {string} dist Chemin du repertoire de sortie.
 * @param {string} baseStrapi `ECHO_STRAPI_URL`.
 * @param {{recuperer?: (url: string) => Promise<{ok: boolean, status: number, octets: Buffer|null}>}} options
 * @returns {Promise<{telecharges: number, octets: number, echecs: string[]}>}
 */
export async function localiserMedias(dist, baseStrapi, options = {}) {
  const references = referencesMediasDe(dist);
  if (references.length === 0) return { telecharges: 0, octets: 0, echecs: [] };

  if (!baseStrapi) {
    throw new Error(
      'ECHO_STRAPI_URL est absente : impossible de telecharger les medias que la sortie ' +
        'reference. Le build n a pas de mode degrade (src/lib/strapi/client.ts) — et un ' +
        'site sans ses images est precisement le defaut que T-01 ferme.',
    );
  }

  const recuperer = options.recuperer ?? recupererParReseau;
  const echecs = [];
  let telecharges = 0;
  let octets = 0;

  for (const reference of references) {
    const source = sourceDistanteMedia(reference, baseStrapi);
    const destination = path.join(dist, ...reference.slice(1).split('/'));

    let reponse;
    try {
      reponse = await recuperer(source);
    } catch (erreur) {
      echecs.push(`${reference} : ${source} injoignable — ${erreur.message}`);
      continue;
    }

    if (!reponse.ok) {
      echecs.push(`${reference} : ${source} a repondu ${reponse.status}`);
      continue;
    }
    if (reponse.octets === null || reponse.octets.length === 0) {
      echecs.push(`${reference} : ${source} a repondu un corps VIDE (0 octet)`);
      continue;
    }

    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, reponse.octets);
    telecharges += 1;
    octets += reponse.octets.length;
  }

  return { telecharges, octets, echecs };
}

/** Le compte rendu au vert, en une ligne. */
export function resumeMediasLocaux(rapport) {
  return (
    `${rapport.telecharges} media(s) deposes dans la sortie ` +
    `(${(rapport.octets / 1024).toFixed(1)} Kio) : le site sert ses propres images (T-01).`
  );
}

// --- Usage en ligne de commande -------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dist = process.argv[2] ?? path.join(racine, 'dist');
  const rapport = await localiserMedias(dist, process.argv[3] ?? process.env.ECHO_STRAPI_URL ?? '');
  if (rapport.echecs.length > 0) {
    console.error(`\n✖ ${rapport.echecs.length} media(s) non telecharge(s) :`);
    for (const echec of rapport.echecs) console.error(`  - ${echec}`);
    process.exit(1);
  }
  console.log(`✔ ${resumeMediasLocaux(rapport)}`);
}
