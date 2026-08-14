/**
 * La SURCHARGE `partage.seo` sort-elle vraiment dans le HTML ? — au point de lecture.
 *
 * Ce que les tests unitaires prouvent deja, et qui ne suffit pas. `metadonneesSeo`
 * est exerce dans les deux sens sur des fixtures ; le mapper sait lire un `seo` non
 * nul ; le seed sait le transmettre. Chacune de ces preuves porte sur UN maillon.
 * Aucune ne dit ce qui sort a l autre bout — et le 2026-08-12, la chaine etait
 * coupee au milieu sans qu aucune de ces preuves ne rougisse : le composant
 * existait, le mapper savait le lire, et le seed ne l envoyait pas.
 *
 * Ce script prend donc les deux extremites REELLES — le corpus versionne d un cote,
 * `dist/` de l autre — et verifie qu elles disent la meme chose :
 *
 *   1. **Chaque entree surchargee sort surchargee.** `metaTitre` dans le `<title>`
 *      et `og:title`, `metaDescription` dans la `meta description`, `canonique` dans
 *      le `<link rel=canonical>`, `imagePartage` dans `og:image`.
 *   2. **Chaque entree NON surchargee sort en repli calcule.** Sans ce second
 *      controle, un bug qui appliquerait la surcharge PARTOUT passerait : les pages
 *      surchargees seraient justes, et personne ne regarderait les autres.
 *   3. **`noindex: true` produit la balise robots ET sort du sitemap** (A-29).
 *      C est le champ dont l echec coute le plus cher, dans les deux sens.
 *
 * Il ne remplace pas `verifier-seo.mjs`, qui verifie des invariants sans connaitre
 * le contenu. Celui-ci confronte le HTML a ce que la REDACTION a ecrit — d ou son nom :
 * il n est pas un verificateur de SORTIE (il ne jugerait rien avec `dist/` seul), c est
 * une preuve qui croise deux sources, et sa famille est celle des `preuve-*.mjs`.
 *
 * IL TIENT LA CONVENTION DES TROIS ISSUES (`./issues.mjs`), et c est ici qu elle compte
 * le plus : un `dist/` absent et un site conforme rendraient sinon le meme vert, alors
 * que ce script est precisement celui qui existe pour dire ce qui SORT.
 *
 * Usage : node scripts/preuve-surcharge-seo.mjs [dist] [corpus]
 */
import fs from 'node:fs';
import path from 'node:path';

/* Les chemins viennent des MEMES fonctions que le build : coder « /categorie/x » en
   dur ici ferait passer ce script a cote de toutes les pages le jour ou une route
   bouge — et un script qui ne trouve rien ne signale rien. */
import { cheminArticle, cheminIndex } from '../src/lib/routes/chemins.ts';
import { ISSUES } from './issues.mjs';
import { decoder, designeLeMedia, normaliserNom } from './verifier-alternatives.mjs';

const ICI = import.meta.dirname;
const DIST = process.argv[2] ?? path.join(ICI, '..', 'dist');
const CORPUS = process.argv[3] ?? path.join(ICI, '..', '..', 'cms', 'data');

/* ------------------------------------------------------------------ */
/* Lecture du corpus — les memes fichiers que le seed, lus a plat       */
/* ------------------------------------------------------------------ */

const lireJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/** Le frontmatter JSON d un article, tolerant aux fins de ligne Windows. */
function frontmatter(chemin) {
  const brut = fs.readFileSync(chemin, 'utf8').replace(/\r\n/g, '\n');
  const trouve = brut.match(/^---\n([\s\S]*?)\n---/);
  if (!trouve) throw new Error(`${chemin} : frontmatter absent`);
  return JSON.parse(trouve[1]);
}

/**
 * Les entrees a confronter : une par page attendue dans `dist/`.
 *
 * `repli` porte ce que le build DOIT calculer quand rien n est surcharge — le titre
 * de l entree. On ne recalcule pas la troncature ici : la comparer reviendrait a
 * reimplementer `tronquerSurUnMot`, donc a tester le script contre lui-meme.
 */
function entreesDuCorpus(racine) {
  const entrees = [];

  for (const fichier of fs.readdirSync(path.join(racine, 'articles')).sort()) {
    const donnees = frontmatter(path.join(racine, 'articles', fichier));
    const locale = fichier.endsWith('.en.md') ? 'en' : 'fr';
    entrees.push({
      quoi: `article ${donnees.code} ${locale}`,
      chemin: cheminArticle(locale, donnees.slug),
      repli: donnees.titre,
      seo: donnees.seo,
    });
  }

  for (const categorie of lireJson(path.join(racine, 'categories.json'))) {
    for (const locale of ['fr', 'en']) {
      const l = categorie[locale];
      if (!l) continue;
      entrees.push({
        quoi: `categorie ${l.slug} ${locale}`,
        chemin: cheminIndex(locale, 'categorie', l.slug),
        repli: l.nom,
        seo: l.seo,
      });
    }
  }

  for (const dossier of lireJson(path.join(racine, 'dossiers.json'))) {
    for (const locale of ['fr', 'en']) {
      const l = dossier[locale];
      if (!l) continue;
      entrees.push({
        quoi: `dossier ${l.slug} ${locale}`,
        chemin: cheminIndex(locale, 'dossier', l.slug),
        repli: l.titre,
        seo: l.seo,
      });
    }
  }

  return entrees;
}

/* ------------------------------------------------------------------ */
/* Lecture de dist/                                                     */
/* ------------------------------------------------------------------ */

function lirePage(dist, chemin) {
  const candidats = [
    path.join(dist, chemin, 'index.html'),
    path.join(dist, `${chemin}.html`),
  ];
  for (const candidat of candidats) {
    if (fs.existsSync(candidat)) return fs.readFileSync(candidat, 'utf8');
  }
  return null;
}

/* Le decodage des entites et le rapprochement d un media servi a sa cle de
 * manifeste vivent tous deux dans `verifier-alternatives.mjs`, qui les a mesures
 * contre Strapi et les documente. Les recopier ici en ferait une seconde copie —
 * exactement ce que la convention `Pointer, jamais dupliquer` interdit, et pour la
 * raison qui s est verifiee ici : deux copies divergent. */

const titreDe = (html) => {
  const trouve = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return trouve ? decoder(trouve[1].trim()) : null;
};

/** Les balises `<nom …>` du document, chacune entiere : une valeur d attribut peut
    porter un `>` (`&gt;` n est pas obligatoire dans un attribut), et s arreter au
    premier `>` couperait la balise en deux. */
const balisesDe = (html, nom) =>
  html.match(new RegExp(`<${nom}\\b(?:"[^"]*"|'[^']*'|[^>"'])*>`, 'gi')) ?? [];

/**
 * La valeur d un attribut, decodee.
 *
 * Le motif borne la valeur sur le MEME guillemet que l ouvrant. Une classe qui
 * exclut les deux (`[^"']`) tronque a la premiere apostrophe INTERNE : c est ainsi
 * que « … 19,8 demandes : l ecart qui decidera du parc » se lisait « … : l », et que
 * le script rapportait des ecarts qui n existaient pas.
 */
function valeurAttribut(balise, nom) {
  const trouve = balise.match(new RegExp(`\\b${nom}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return trouve ? decoder(trouve[1] ?? trouve[2]) : null;
}

function meta(html, attribut, valeur) {
  for (const balise of balisesDe(html, 'meta')) {
    if (valeurAttribut(balise, attribut) === valeur) return valeurAttribut(balise, 'content');
  }
  return null;
}

function canoniqueDe(html) {
  for (const balise of balisesDe(html, 'link')) {
    if (valeurAttribut(balise, 'rel') === 'canonical') return valeurAttribut(balise, 'href');
  }
  return null;
}

/** Toutes les URL declarees par les segments de sitemap presents dans dist/. */
function urlsDuSitemap(dist) {
  const urls = new Set();
  const parcourir = (dossier) => {
    if (!fs.existsSync(dossier)) return;
    for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
      const complet = path.join(dossier, entree.name);
      if (entree.isDirectory()) parcourir(complet);
      else if (/^sitemap.*\.xml$/i.test(entree.name)) {
        const xml = fs.readFileSync(complet, 'utf8');
        for (const loc of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
          try {
            urls.add(new URL(loc[1]).pathname.replace(/\/$/, '') || '/');
          } catch {
            urls.add(loc[1]);
          }
        }
      }
    }
  };
  parcourir(dist);
  return urls;
}

/* ------------------------------------------------------------------ */
/* Les controles                                                        */
/* ------------------------------------------------------------------ */

export function verifierSurchargeSeo(dist = DIST, corpus = CORPUS) {
  const manquements = [];
  const signaler = (m) => manquements.push(m);

  const entrees = entreesDuCorpus(corpus);
  const surchargees = entrees.filter((e) => e.seo !== undefined);
  const nues = entrees.filter((e) => e.seo === undefined);

  /* 0. Le corpus doit exercer LES DEUX chemins — sinon ce script ne prouve rien. */
  if (surchargees.length === 0) {
    signaler(
      'aucune entree du corpus ne porte de surcharge partage.seo : le mecanisme de ' +
        'surcharge n est exerce nulle part, et ce script ne peut rien constater'
    );
  }
  if (nues.length === 0) {
    signaler('toute entree du corpus est surchargee : le repli calcule n est plus exerce');
  }

  const sitemap = urlsDuSitemap(dist);
  let pagesLues = 0;

  for (const entree of entrees) {
    const html = lirePage(dist, entree.chemin);
    if (html === null) continue; // page non emise : c est le domaine de verifier-seo.mjs
    pagesLues++;

    const seo = entree.seo ?? {};
    const titre = titreDe(html);
    const description = meta(html, 'name', 'description');
    const ogTitre = meta(html, 'property', 'og:title');
    const ogImage = meta(html, 'property', 'og:image');
    const robots = meta(html, 'name', 'robots');
    const canonique = canoniqueDe(html);

    /* 1. Ce qui est surcharge sort surcharge. */
    if (seo.metaTitre !== undefined) {
      if (titre === null || !titre.includes(seo.metaTitre)) {
        signaler(
          `${entree.quoi} : <title> vaut « ${titre} » et ne porte pas le metaTitre ` +
            `surcharge « ${seo.metaTitre} » — c est le repli qui sort`
        );
      }
      if (ogTitre !== null && !ogTitre.includes(seo.metaTitre)) {
        signaler(`${entree.quoi} : og:title ignore la surcharge (« ${ogTitre} »)`);
      }
    }

    if (seo.metaDescription !== undefined && description !== seo.metaDescription) {
      signaler(
        `${entree.quoi} : meta description vaut « ${description} » au lieu de la ` +
          `surcharge « ${seo.metaDescription} »`
      );
    }

    if (seo.canonique !== undefined && canonique !== seo.canonique) {
      signaler(
        `${entree.quoi} : canonique vaut « ${canonique} » au lieu de la surcharge ` +
          `« ${seo.canonique} » — A-27 exige qu elle soit honoree telle quelle`
      );
    }

    /* Strapi RENOMME a l upload : `partage/A01-col-des-trois-vents.png` est servi
       `/medias/A01_col_des_trois_vents_ec2b979fb1.png`. Comparer le nom brut faisait
       donc manquer tout media a tiret — constate sur l instance le 2026-08-14, ou
       l image surchargee SORTAIT et ce controle la declarait absente. */
    if (seo.imagePartage !== undefined) {
      const nom = path.basename(seo.imagePartage);
      const servi = ogImage === null ? null : normaliserNom(path.posix.basename(ogImage));
      if (servi === null || !designeLeMedia(servi, normaliserNom(nom))) {
        signaler(
          `${entree.quoi} : og:image vaut « ${ogImage} » et ne designe pas l image ` +
            `surchargee « ${nom} » — c est la carte generee ou le defaut qui sort`
        );
      }
    }

    /* 2. Ce qui n est pas surcharge sort en repli calcule. */
    if (seo.metaTitre === undefined && titre !== null) {
      const debut = entree.repli.slice(0, 20);
      if (!titre.includes(debut)) {
        signaler(
          `${entree.quoi} : <title> vaut « ${titre} » sans reprendre le repli calcule ` +
            `« ${entree.repli} » — une surcharge fuit-elle d une autre entree ?`
        );
      }
    }

    /* 3. A-29 : noindex tient les deux points de lecture. */
    const attenduNoindex = seo.noindex === true;
    const porteNoindex = robots !== null && /noindex/i.test(robots);
    if (attenduNoindex && !porteNoindex) {
      signaler(
        `${entree.quoi} : le corpus demande noindex:true et la page ne porte pas ` +
          '<meta name="robots" content="noindex"> — la page est exposee'
      );
    }
    if (!attenduNoindex && porteNoindex && !/\/(404|mentions-legales)$/.test(entree.chemin)) {
      signaler(
        `${entree.quoi} : la page porte noindex alors que le corpus ne le demande pas ` +
          '— une page voulue publique est desindexee'
      );
    }
    if (attenduNoindex && sitemap.has(entree.chemin)) {
      signaler(`${entree.quoi} : noindex:true mais l URL est declaree au sitemap (A-29)`);
    }
  }

  /* L INCAPACITE se distingue de l anomalie, et prime sur elle : zero page lue, c est
     zero connaissance sur ce qui sort. Rendre `1` enverrait corriger le SITE, quand le
     geste est de comprendre pourquoi rien n a ete construit — ou pourquoi ce n est pas
     le bon chemin. */
  if (pagesLues === 0) {
    return {
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      manquements: [
        `aucune page du corpus n a ete trouvee sous ${dist} : le build n a pas tourne, ou ` +
          'les chemins ont change — ce script n a donc RIEN verifie, et son silence ne ' +
          'vaut pas conformite',
      ],
      pagesLues,
      surchargees: surchargees.length,
      nues: nues.length,
    };
  }

  return {
    issue: manquements.length > 0 ? ISSUES.ANOMALIE : ISSUES.CONFORME,
    manquements,
    pagesLues,
    surchargees: surchargees.length,
    nues: nues.length,
  };
}

/* ------------------------------------------------------------------ */

if (import.meta.filename === process.argv[1]) {
  const { issue, manquements, pagesLues, surchargees, nues } = verifierSurchargeSeo();
  console.log(
    `[surcharge-seo] ${pagesLues} pages lues, ${surchargees} entrees surchargees, ${nues} en repli.`
  );

  if (issue === ISSUES.VERIFICATION_IMPOSSIBLE) {
    console.error('\n[surcharge-seo] VERIFICATION IMPOSSIBLE — la preuve n a PAS eu lieu :');
    for (const m of manquements) console.error(`  - ${m}`);
    console.error(
      '\n  Ceci n est PAS un manquement du site : c est la preuve qui est aveugle.\n' +
        `  Code ${ISSUES.VERIFICATION_IMPOSSIBLE} (0 conforme, 1 anomalie).`
    );
    process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
  }

  if (issue === ISSUES.ANOMALIE) {
    console.error(`\n${manquements.length} manquement(s) :`);
    for (const m of manquements) console.error(`  - ${m}`);
    process.exit(ISSUES.ANOMALIE);
  }

  console.log('[surcharge-seo] la surcharge et le repli sortent tous deux, comme ecrit.');
}
