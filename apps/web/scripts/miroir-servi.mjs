/**
 * LE MIROIR DU SITE SERVI — la seconde source de `preuve-surcharge-seo.mjs`, la ou elle
 * n existe pas autrement.
 *
 * ── LE PROBLEME QU IL RESOUT ──────────────────────────────────────────────────────────
 *
 * `preuve-surcharge-seo.mjs` croise DEUX sources reelles : le corpus versionne
 * (`apps/cms/data`, ce que la REDACTION a ecrit) et un `dist/`. Il n existe pas beaucoup
 * d endroits ou les deux coexistent :
 *
 *   - l integration continue construit contre le Strapi de SUBSTITUTION (3 fixtures) :
 *     aucune page du corpus, la preuve rend `2` — mesure, trois pushes rouges d affilee ;
 *   - le build de production les avait toutes les deux — c est ce qu on a cru le
 *     2026-08-14. FAUX : Coolify construit `echo-site` avec `base_directory = /apps/web`,
 *     donc SANS `apps/cms/data`. La preuve rendait `2`, elle echouait en ferme, et le
 *     BUILD echouait avec elle : quatre deploiements de suite (470, 474, 476, 478), plus
 *     de trois heures pendant lesquelles publier ne remettait plus le site en ligne ;
 *   - LA MACHINE QUI JOUE LE SEED — le poste — a le depot ENTIER, donc le corpus. Ce qui
 *     lui manque est le `dist/`, qui ne sort jamais du conteneur de construction Coolify.
 *
 * Ce fichier ramene ce qui manque, et depuis la source qui compte : LE SITE SERVI. Pas un
 * build refait localement — un build local prouverait que NOTRE machine sait produire le
 * bon HTML, jamais que celui qui est EN LIGNE le porte. C est la difference entre vérifier
 * la bonne sortie et vérifier la sienne.
 *
 * ── CE QU IL NE FAIT PAS, ET C EST LE POINT ───────────────────────────────────────────
 *
 * IL NE JUGE RIEN. Il rend `0` (le miroir est complet, la preuve peut travailler) ou `2`
 * (il ne l est pas, personne ne sait rien) — JAMAIS `1`. Le `1` appartient a la preuve,
 * qui seule regarde le contenu. Melanger les deux redirait « le site est faux » quand il
 * faut lire « je n ai pas pu le lire ».
 *
 * ── LE MIROIR PARTIEL EST LE VRAI DANGER ──────────────────────────────────────────────
 *
 * `lirePage` de la preuve rend `null` pour une page absente, et la boucle fait `continue`.
 * Une page manquante ne fait donc PAS rougir la preuve : elle la fait SAUTER, en silence.
 * Un miroir a 60 pages sur 64 rendrait un vert dont personne n aurait choisi le contour.
 * D ou la severite d ici : tout ce qui n est ni un `200` ni un `404` est une INCAPACITE,
 * nommee, et le miroir entier s arrete la.
 *
 * Le `404`, lui, est legitime et se COMPTE : une page non emise est le domaine de
 * `verifier-seo.mjs`. Mais elle se compte, sinon « le site ne l emet pas » et « je ne l ai
 * pas demandee » rendent la meme sortie.
 *
 * ── LA DESTINATION EST PURGEE ─────────────────────────────────────────────────────────
 *
 * Le faux vert le plus facile a fabriquer : le site cesse d emettre une page, le miroir de
 * la veille la porte encore, et la preuve la juge conforme. Un miroir est une PHOTO, pas
 * une accumulation.
 *
 * Usage : node scripts/miroir-servi.mjs [destination] [origine] [corpus]
 */
import fs from 'node:fs';
import path from 'node:path';

import { entreesDuCorpus, absencesDuCorpus } from './preuve-surcharge-seo.mjs';
import { ISSUES } from './issues.mjs';
import { lireOrigine, ORIGINE_PAR_DEFAUT } from './origine.mjs';

const ICI = import.meta.dirname;
const DESTINATION = path.join(ICI, '..', '.miroir-servi');
const CORPUS = path.join(ICI, '..', '..', 'cms', 'data');

/** Le point d entree du sitemap : c est lui qui nomme ses segments, on ne les devine pas. */
export const SITEMAP_INDEX = '/sitemap-index.xml';

/**
 * Les chemins de page a ramener — DERIVES DU CORPUS, par les fonctions du build.
 *
 * Ecrire cette liste ici la ferait diverger de celle que la preuve relira le jour ou une
 * route bouge, et l ecart serait MUET : la preuve sauterait les pages absentes du miroir.
 */
export function cheminsAMirroiter(corpus) {
  return [...new Set(entreesDuCorpus(corpus).map((entree) => entree.chemin))];
}

/** L URL servie d un chemin : avec le slash final, sinon le site repond en redirection. */
function urlDeLaPage(origine, chemin) {
  return chemin === '/' ? `${origine}/` : `${origine}${chemin}/`;
}

/** Le fichier ou `lirePage` de la preuve ira chercher cette page. */
function fichierDeLaPage(destination, chemin) {
  return path.join(destination, chemin, 'index.html');
}

function deposer(fichier, contenu) {
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  fs.writeFileSync(fichier, contenu, 'utf8');
}

/** La recuperation par defaut : le reseau. Isolee pour que le miroir se prouve sans lui. */
export async function recupererParDefaut(url) {
  const reponse = await fetch(url, { redirect: 'follow' });
  /* Le corps est TOUJOURS lu, meme sur un 404 : sans cela la connexion reste a demi
     ouverte dans le pool et le processus ne se termine pas de lui-meme — ce qui
     obligerait a un `process.exit()` brutal, dont l abandon des poignees libuv fait
     avorter Node sous Windows AVANT que le code de sortie ne soit rendu. Meme garde que
     `verifier-en-tetes.mjs`. */
  const corps = await reponse.text();
  return { statut: reponse.status, corps };
}

/**
 * Ramene le site servi dans `destination`, en forme de `dist/`.
 *
 * @param {object} options
 * @param {string} options.origine     L origine publique du site (`https://…`).
 * @param {string} options.corpus      La racine du corpus versionne (`apps/cms/data`).
 * @param {string} options.destination Le dossier du miroir — PURGE avant ecriture.
 * @param {(url: string) => Promise<{statut: number, corps: string}>} [options.recuperer]
 * @returns {Promise<{issue: number, manquements: string[], pagesEcrites: number,
 *                    pagesAbsentes: number, segmentsSitemap: number, origine: string}>}
 */
export async function construireMiroir({
  origine,
  corpus,
  destination,
  recuperer = recupererParDefaut,
}) {
  const rien = (manquements) => ({
    issue: ISSUES.VERIFICATION_IMPOSSIBLE,
    manquements,
    pagesEcrites: 0,
    pagesAbsentes: 0,
    segmentsSitemap: 0,
    origine: String(origine),
  });

  /* 1. L origine — declaree illisible, jamais remplacee en silence par un repli. */
  const lecture = lireOrigine(origine);
  if (!lecture.lisible) return rien([lecture.manquement]);
  const base = lecture.hote;

  /* 2. Le corpus — c est lui qui dit QUOI ramener. Sans lui, il n y a pas de miroir a
     faire, et ce n est pas la meme chose qu un miroir vide. */
  const absentes = absencesDuCorpus(corpus);
  if (absentes.length > 0) {
    return rien([
      `le corpus est introuvable ou incomplet sous ${corpus} — le miroir n a pas de liste ` +
        'de pages a ramener :',
      ...absentes.map((chemin) => `  - absent : ${chemin}`),
    ]);
  }

  /* 3. La purge. Un miroir est une PHOTO du site servi ; ce qui restait d hier ferait
     juger un etat qui n est plus en ligne. */
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });

  const manquements = [];
  const echec = (url, quoi) => manquements.push(`  - ${url} : ${quoi}`);

  const lire = async (url) => {
    try {
      return await recuperer(url);
    } catch (erreur) {
      echec(url, `injoignable (${String(erreur?.cause?.message ?? erreur?.message ?? erreur)})`);
      return null;
    }
  };

  /* 4. Le sitemap. Il n est PAS accessoire : le controle A-29 de la preuve exige qu une
     page `noindex` soit ABSENTE du sitemap, et un sitemap vide rend cette absence
     triviale — la preuve certifierait conforme sans avoir rien lu. */
  let segmentsSitemap = 0;
  const index = await lire(`${base}${SITEMAP_INDEX}`);
  if (index === null || index.statut !== 200) {
    if (index !== null) echec(`${base}${SITEMAP_INDEX}`, `statut ${index.statut} au lieu de 200`);
    return rien([
      'le sitemap du site servi n a pas pu etre ramene — sans lui, le controle A-29 ' +
        '(« une page noindex ne doit pas etre au sitemap ») se verifierait A VIDE et ' +
        'rendrait un vert qui ne prouve rien :',
      ...manquements,
    ]);
  }
  deposer(path.join(destination, path.basename(SITEMAP_INDEX)), index.corps);

  const segments = [...index.corps.matchAll(/<loc>([^<]+)<\/loc>/g)].map((trouve) => trouve[1]);
  for (const segment of segments) {
    const reponse = await lire(segment);
    if (reponse === null) continue;
    if (reponse.statut !== 200) {
      echec(segment, `statut ${reponse.statut} au lieu de 200`);
      continue;
    }
    let nom;
    try {
      nom = path.basename(new URL(segment).pathname);
    } catch {
      nom = path.basename(segment);
    }
    deposer(path.join(destination, nom), reponse.corps);
    segmentsSitemap++;
  }
  if (manquements.length > 0) {
    return rien([
      'un segment de sitemap n a pas pu etre ramene — le sitemap du miroir serait ' +
        'PARTIEL, et une page absente d un sitemap tronque se lirait « conforme a A-29 » :',
      ...manquements,
    ]);
  }

  /* 5. Les pages du corpus. */
  let pagesEcrites = 0;
  let pagesAbsentes = 0;
  for (const chemin of cheminsAMirroiter(corpus)) {
    const url = urlDeLaPage(base, chemin);
    const reponse = await lire(url);
    if (reponse === null) continue;
    if (reponse.statut === 404) {
      /* Legitime : une page non emise est le domaine de `verifier-seo.mjs`. Elle se
         COMPTE quand meme — sinon « le site ne l emet pas » et « je ne l ai pas
         demandee » rendent la meme sortie. */
      pagesAbsentes++;
      continue;
    }
    if (reponse.statut !== 200) {
      echec(url, `statut ${reponse.statut} — ni 200 ni 404, le miroir serait PARTIEL`);
      continue;
    }
    deposer(fichierDeLaPage(destination, chemin), reponse.corps);
    pagesEcrites++;
  }

  if (manquements.length > 0) {
    return rien([
      'le site servi n a pas rendu toutes les pages que le corpus declare — un miroir ' +
        'PARTIEL fait SAUTER les pages manquantes dans la preuve, sans la faire rougir :',
      ...manquements,
    ]);
  }

  if (pagesEcrites === 0) {
    return rien([
      `aucune page du corpus n a ete ramenee depuis ${base} : le site servi ne porte ` +
        'AUCUNE des pages que la redaction a ecrites. Ce n est pas un miroir vide, c est ' +
        'une absence de site — ou une origine qui ne designe pas le bon.',
    ]);
  }

  return {
    issue: ISSUES.CONFORME,
    manquements: [],
    pagesEcrites,
    pagesAbsentes,
    segmentsSitemap,
    origine: base,
  };
}

/* ------------------------------------------------------------------ */

if (import.meta.filename === process.argv[1]) {
  const destination = process.argv[2] ?? DESTINATION;
  const origine = process.argv[3] ?? process.env.ECHO_SITE_URL ?? ORIGINE_PAR_DEFAUT;
  const corpus = process.argv[4] ?? CORPUS;

  const rapport = await construireMiroir({ origine, corpus, destination });

  if (rapport.issue === ISSUES.VERIFICATION_IMPOSSIBLE) {
    console.error('\n[miroir-servi] VERIFICATION IMPOSSIBLE — le miroir n a PAS ete constitue :');
    for (const m of rapport.manquements) console.error(m.startsWith('  ') ? m : `  ${m}`);
    console.error(
      '\n  Ceci n est PAS un manquement du site : la preuve de surcharge n a pas de\n' +
        '  seconde source. Corriger l ENVIRONNEMENT (le site est-il en ligne ? l origine\n' +
        `  est-elle la bonne ?). Code ${ISSUES.VERIFICATION_IMPOSSIBLE}.`
    );
    process.exitCode = ISSUES.VERIFICATION_IMPOSSIBLE;
  } else {
    console.log(
      `[miroir-servi] ${rapport.pagesEcrites} page(s) ramenee(s) depuis ${rapport.origine}, ` +
        `${rapport.pagesAbsentes} absente(s) du site (404), ` +
        `${rapport.segmentsSitemap} segment(s) de sitemap — miroir dans ${destination}.`
    );
    process.exitCode = ISSUES.CONFORME;
  }
}
