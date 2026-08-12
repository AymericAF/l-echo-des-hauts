/**
 * PREUVE de la pagination sur le CORPUS REEL, lue dans `dist/`.
 *
 *   npm run preuve:pagination-corpus
 *
 * POURQUOI CE SCRIPT EXISTE A COTE DE `preuve-pagination.mjs`, QUI NE BOUGE PAS.
 * Celui-la construit son propre corpus (`corpus-recette.mjs`), avec des attendus
 * TRANSCRITS A LA MAIN, et sort dans `dist-recette/`. C est ce qu il faut : il exerce
 * des cas que le corpus editorial n atteint pas — une page 2, une rubrique sans
 * contrepartie anglaise, une profondeur de pagination differente entre locales, la 404.
 * Mais il ne dit RIEN de la sortie qu on sert : ni un slug accentue, ni un effectif a
 * douze pile, ni un ordre de tri sur egalite de date.
 *
 * Le present script juge `dist/` — la vraie sortie — et son attendu vient de l API
 * Strapi. Ce point est le seul qui compte : deriver l attendu de `registre.ts`
 * reviendrait a demander au code de rendu s il est d accord avec lui-meme, et un attendu
 * calcule par le code qu il controle ne controle rien. Les deux preuves sont donc
 * complementaires et aucune ne remplace l autre — l une couvre les cas que les donnees
 * n ont pas, l autre couvre les donnees que le banc n a pas.
 *
 * CODES DE SORTIE — trois issues (convention du parc, `scripts/issues.mjs`) :
 *   0  la sortie concorde avec le corpus, bornes comprises ;
 *   1  au moins un ecart — la preuve a eu lieu et a trouve quelque chose ;
 *   2  VERIFICATION IMPOSSIBLE — rien n a ete prouve.
 *
 * LE `2` LE PLUS IMPORTANT EST CELUI QU ON N ATTEND PAS. Un corpus dont aucun effectif
 * ne depasse la taille de page produit « 0 route paginee attendue, 0 emise » : tout
 * concorde, et pourtant la pagination multi-pages n a PAS ete exercee. Rendre `0` la
 * ferait dire « pagination prouvee sur le corpus reel » a une preuve qui n a rien vu.
 * C est exactement la classe de defaut que ce depot corrige partout ailleurs : quand
 * succes et echec rendent la meme sortie, la sortie ne prouve rien. Le geste, alors,
 * n est pas de corriger le site — c est de decider si le corpus doit exercer cette
 * frontiere, ou si elle restera couverte par le seul banc de recette.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ISSUES, manquementCorpusVide } from './issues.mjs';

/**
 * Les DEUX familles paginees du §4.2 (A-42 : auteur et dossier ne le sont pas).
 *
 * Recopiees plutot qu importees de `src/lib/routes/chemins.ts`, et c est deliberé : cet
 * instrument juge ce que le code produit, il ne peut pas emprunter au code juge la
 * definition de ce qu il attend. La divergence eventuelle est un CONSTAT rendu par
 * `divergencesAvecLeCode()`, pas un alignement silencieux.
 */
export const FAMILLES_PAGINEES_CAHIER = ['categorie', 'tag'];

/** §4.2 du cahier : « 12 par page ». Ecrit ici, confronte au code, jamais importe de lui. */
export const ARTICLES_PAR_PAGE_CAHIER = 12;

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- 1. compter le corpus, sans rien demander au code de rendu ----------------------

/**
 * Les effectifs par (locale, famille paginee, slug), comptes sur les articles PUBLIES
 * que rend l API.
 *
 * @param {Record<string, Array<{categorie?: {slug: string} | null, tags?: Array<{slug: string}>}>>} articlesParLocale
 * @returns {Map<string, number>} cle `locale|famille|slug`
 */
export function effectifsDuCorpus(articlesParLocale) {
  const effectifs = new Map();
  const compter = (cle) => effectifs.set(cle, (effectifs.get(cle) ?? 0) + 1);

  for (const [locale, articles] of Object.entries(articlesParLocale)) {
    for (const article of articles ?? []) {
      // Un article sans categorie ne fabrique pas une famille fantome : `categorie` est
      // requis en base (A-09), mais un instrument qui invente un slug `undefined`
      // rougirait sur une route que personne n a jamais demandee.
      if (article?.categorie?.slug) compter(`${locale}|categorie|${article.categorie.slug}`);
      for (const etiquette of article?.tags ?? []) {
        if (etiquette?.slug) compter(`${locale}|tag|${etiquette.slug}`);
      }
    }
  }

  return effectifs;
}

// --- 2. deriver l attendu, dans les deux sens ---------------------------------------

function prefixe(locale) {
  return locale === 'fr' ? '' : `/${locale}`;
}

/**
 * Ce que la sortie DOIT porter, et ce qu elle ne doit SURTOUT pas porter.
 *
 * Les deux listes comptent autant l une que l autre : « la page 2 manque » et « une page
 * 3 vide existe » sont deux defauts distincts, et le second ne se voit jamais en
 * naviguant — il se decouvre dans un sitemap, six mois plus tard.
 *
 * RIEN ICI NE FIGE LE CORPUS D AUJOURD HUI. L attendu se recalcule a chaque execution
 * depuis les effectifs : le jour ou une rubrique passe a treize articles, cet instrument
 * EXIGE `/page/2` au lieu de l interdire. Une garde qui graverait « aucune route paginee »
 * interdirait l etat meme que le projet cherche a atteindre.
 *
 * @param {Map<string, number>} effectifs
 * @param {number} parPage
 */
export function attendusDePagination(effectifs, parPage) {
  return [...effectifs.entries()]
    .map(([cle, effectif]) => {
      const [locale, famille, slug] = cle.split('|');
      const base = `${prefixe(locale)}/${famille}/${slug}`;
      const nombreDePages = Math.ceil(effectif / parPage);

      const emises = [base];
      for (let numero = 2; numero <= nombreDePages; numero += 1) emises.push(`${base}/page/${numero}`);

      /* `/page/1` est interdite a TOUS les index, paginés ou non : elle ferait doublon
         avec la forme courte, deux URL pour la meme page. Et `/page/(n+1)` est la page
         finale vide — celle que `Math.ceil` sur un multiple exact ne doit jamais creer. */
      const interdites = [`${base}/page/1`, `${base}/page/${nombreDePages + 1}`];

      return { cle, locale, famille, slug, base, effectif, parPage, nombreDePages, emises, interdites };
    })
    .sort((a, b) => a.cle.localeCompare(b.cle));
}

/** Ce que le CODE fait, confronte a ce que le CAHIER dit — l ecart est nomme, jamais suivi. */
export function divergencesAvecLeCode(codeParPage, codeFamillesPaginees) {
  const ecarts = [];
  if (codeParPage !== ARTICLES_PAR_PAGE_CAHIER) {
    ecarts.push(
      `le code pagine par ${codeParPage}, le §4.2 du cahier dit ${ARTICLES_PAR_PAGE_CAHIER} : ` +
        'tant que les deux divergent, cet instrument ne sait plus contre quoi il juge.',
    );
  }
  const attendues = [...FAMILLES_PAGINEES_CAHIER].sort().join(', ');
  const trouvees = [...codeFamillesPaginees].sort().join(', ');
  if (attendues !== trouvees) {
    ecarts.push(`le code pagine les familles [${trouvees}], le cahier (A-42) en nomme [${attendues}].`);
  }
  return ecarts;
}

// --- 3. confronter les routes emises ------------------------------------------------

/**
 * @param {ReadonlySet<string>} routesEmises
 * @param {ReturnType<typeof attendusDePagination>} attendus
 */
export function confronterRoutes(routesEmises, attendus) {
  const manquements = [];
  for (const entree of attendus) {
    for (const route of entree.emises) {
      if (!routesEmises.has(route)) {
        manquements.push(
          `${route} : ATTENDUE et absente de la sortie — ${entree.effectif} article(s) en base, ` +
            `${entree.nombreDePages} page(s) de ${entree.parPage}.`,
        );
      }
    }
    for (const route of entree.interdites) {
      if (routesEmises.has(route)) {
        manquements.push(
          `${route} : INTERDITE et pourtant emise — ${entree.effectif} article(s) en base ` +
            `ne font que ${entree.nombreDePages} page(s).`,
        );
      }
    }
  }
  return manquements;
}

// --- 4. lire les bornes dans les octets emis ----------------------------------------

/**
 * Ce qu une page rend, lu dans son HTML.
 *
 * `class="carte"` est exige avec son guillemet fermant : `carte__image` porte le meme
 * prefixe et gonflerait le compte d une carte par illustration.
 */
export function bornesDUnePage(html) {
  return {
    cartes: (html.match(/class="carte"/g) ?? []).length,
    precedent: /rel="prev"/.test(html),
    suivant: /rel="next"/.test(html),
    navigation: /<nav class="pagination"/.test(html),
  };
}

/**
 * Les bornes, exercees page par page contre le compte du corpus.
 *
 * @param {ReturnType<typeof attendusDePagination>} attendus
 * @param {(route: string) => string} lirePage rend le HTML, ou JETTE si la page manque.
 */
export function manquementsDesBornes(attendus, lirePage) {
  const manquements = [];

  for (const entree of attendus) {
    for (const [index, route] of entree.emises.entries()) {
      const numero = index + 1;
      let lues;
      try {
        lues = bornesDUnePage(lirePage(route));
      } catch (erreur) {
        // Une page illisible n est pas une borne non tenue : on ne sait pas ce qu elle
        // porte. Le `⛔` la distingue a l oeil dans la liste, et la fait primer au verdict.
        manquements.push(`⛔ ${route} : illisible, rien n a pu etre juge — ${erreur.message}`);
        continue;
      }

      const attenduCartes = Math.min(entree.parPage, entree.effectif - (numero - 1) * entree.parPage);
      if (lues.cartes !== attenduCartes) {
        manquements.push(
          `${route} : ${lues.cartes} carte(s) rendue(s), ${attenduCartes} carte(s) attendue(s) ` +
            `d apres le corpus (${entree.effectif} article(s), page ${numero}/${entree.nombreDePages}).`,
        );
      }

      const attenduPrecedent = numero > 1;
      if (lues.precedent !== attenduPrecedent) {
        manquements.push(
          `${route} : rel="prev" ${lues.precedent ? 'rendu' : 'absent'}, ` +
            `${attenduPrecedent ? 'attendu' : 'interdit'} sur la page ${numero}/${entree.nombreDePages}.`,
        );
      }

      const attenduSuivant = numero < entree.nombreDePages;
      if (lues.suivant !== attenduSuivant) {
        manquements.push(
          `${route} : rel="next" ${lues.suivant ? 'rendu' : 'absent'}, ` +
            `${attenduSuivant ? 'attendu' : 'interdit'} sur la page ${numero}/${entree.nombreDePages}.`,
        );
      }

      const attenduNavigation = entree.nombreDePages > 1;
      if (lues.navigation !== attenduNavigation) {
        manquements.push(
          `${route} : navigation de pagination ${lues.navigation ? 'rendue' : 'absente'}, ` +
            `${attenduNavigation ? 'attendue' : 'interdite'} — ${entree.effectif} article(s) ` +
            `font ${entree.nombreDePages} page(s).`,
        );
      }
    }
  }

  return manquements;
}

// --- 5. le verdict ------------------------------------------------------------------

/**
 * Trois issues — et l ordre de priorite n est PAS celui de `juger-sortie.mjs`, pour une
 * raison qu il faut ecrire sinon quelqu un « corrigera » l ecart.
 *
 * Ailleurs dans ce depot, l incapacite prime toujours : quand un verificateur n a rien pu
 * juger, les `0` de ses voisins ne couvrent plus la sortie, et on ne sait pas ce qui a ete
 * regarde. ICI, ce n est pas le cas. « Le corpus n exerce aucune page 2 » est une
 * incapacite PARTIELLE et parfaitement circonscrite : les 47 index ont bel et bien ete
 * lus, leurs routes confrontees et leurs bornes exercees. Seule la classe « ce qui commence
 * a la page 2 » n a pas ete atteinte.
 *
 * Donc une anomalie REELLE prime sur cette incapacite-la : une `/page/1` fantome emise est
 * un defaut du site, prouve et actionnable, et le rendre en `2` enverrait corriger
 * l environnement quand le geste est de corriger le site — le critere meme de la
 * convention. Les incapacites TOTALES (plafond divergent, page illisible) gardent, elles,
 * leur priorite absolue : la, on ne sait effectivement plus contre quoi on juge.
 *
 * @param {{routesPaginees: number, manquements: string[], plafondTenu: boolean}} etat
 */
export function verdictDeLaPreuve({ routesPaginees, manquements, plafondTenu }) {
  if (!plafondTenu) {
    return {
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      motif:
        'le plafond de pagination du code ne vaut pas celui du cahier : on ne sait plus ' +
        'contre quelle regle la sortie est jugee.',
    };
  }

  const illisibles = manquements.filter((ligne) => ligne.startsWith('⛔'));
  if (illisibles.length > 0) {
    return {
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      motif: `${illisibles.length} page(s) attendue(s) illisible(s) : rien n a pu y etre juge.`,
    };
  }

  if (manquements.length > 0) {
    return { issue: ISSUES.ANOMALIE, motif: `${manquements.length} ecart(s) entre la sortie et le corpus.` };
  }

  if (routesPaginees === 0) {
    return {
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      motif:
        'le corpus n exerce aucune page 2 : aucun index n atteint la taille de page, ' +
        'donc aucune route /page/n n est attendue ni emise. La conformite est verifiee, ' +
        'la pagination multi-pages ne l est PAS — un vert ici mentirait.',
    };
  }

  return {
    issue: ISSUES.CONFORME,
    motif: `${routesPaginees} route(s) paginee(s) confrontee(s) au corpus, bornes comprises.`,
  };
}

// --- 6. usage en ligne de commande --------------------------------------------------

/** Les routes que `dist/` porte reellement, dans la forme comparable au registre (T-04). */
export function routesEmises(dist) {
  const routes = new Set();
  let fichiers = 0;

  const parcourir = (dossier, base = '') => {
    for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
      const relatif = base ? `${base}/${entree.name}` : entree.name;
      if (entree.isDirectory()) parcourir(path.join(dossier, entree.name), relatif);
      else {
        fichiers += 1;
        if (!relatif.endsWith('.html')) continue;
        if (relatif === 'index.html') routes.add('/');
        else if (relatif.endsWith('/index.html')) routes.add(`/${relatif.slice(0, -'/index.html'.length)}`);
        else routes.add(`/${relatif.slice(0, -'.html'.length)}`);
      }
    }
  };

  parcourir(dist);
  return { routes, fichiers };
}

/** Le lecteur de pages passe a `manquementsDesBornes` : il JETTE quand la page manque. */
export function lecteurDe(dist) {
  return (route) => {
    const candidats = [
      path.join(dist, route === '/' ? 'index.html' : `${route.slice(1)}/index.html`),
      path.join(dist, `${route.slice(1)}.html`),
    ];
    for (const chemin of candidats) if (fs.existsSync(chemin)) return fs.readFileSync(chemin, 'utf8');
    throw new Error(`absente de ${path.basename(dist)}/`);
  };
}

async function corpusDeLApi(base, jeton) {
  const articlesParLocale = {};
  for (const locale of ['fr', 'en']) {
    const url =
      `${base}/api/articles?locale=${locale}&status=published&pagination[pageSize]=200` +
      '&populate[categorie][fields][0]=slug&populate[tags][fields][0]=slug';
    const reponse = await fetch(url, { headers: { Authorization: `Bearer ${jeton}` } });
    if (!reponse.ok) throw new Error(`GET /api/articles?locale=${locale} — HTTP ${reponse.status}`);
    const charge = await reponse.json();
    if (!Array.isArray(charge?.data)) throw new Error(`reponse inattendue de l API pour locale=${locale}`);
    articlesParLocale[locale] = charge.data;
  }
  return articlesParLocale;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('preuve-pagination-corpus.mjs')) {
  const dist = path.resolve(process.argv[2] ?? path.join(RACINE, 'dist'));
  const base = process.env.ECHO_STRAPI_URL;
  const jeton = process.env.ECHO_STRAPI_API_TOKEN_READONLY;

  /* L INCAPACITE SE DIT AVANT TOUT LE RESTE. Sans corpus, sans sortie ou sans acces a
     l API, cet instrument ne peut RIEN affirmer — et le silence d une preuve absente
     ressemble trait pour trait au silence d une preuve reussie. */
  const empechements = [];
  if (!base || !jeton) empechements.push('ECHO_STRAPI_URL ou ECHO_STRAPI_API_TOKEN_READONLY absent de l environnement.');
  if (!fs.existsSync(dist)) empechements.push(`la sortie ${dist} n existe pas — aucun build a juger.`);
  if (empechements.length > 0) {
    console.error('\n⛔ VERIFICATION IMPOSSIBLE — la preuve n a PAS eu lieu :');
    for (const raison of empechements) console.error(`  - ${raison}`);
    process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
  }

  const { routes, fichiers } = routesEmises(dist);
  if (routes.size === 0) {
    console.error(`\n⛔ ${manquementCorpusVide(dist, fichiers)}`);
    process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
  }

  let articlesParLocale;
  try {
    articlesParLocale = await corpusDeLApi(base, jeton);
  } catch (erreur) {
    console.error(`\n⛔ VERIFICATION IMPOSSIBLE — le corpus n a pas pu etre lu : ${erreur.message}`);
    process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
  }

  /* Le code est interroge ICI, et seulement pour etre CONFRONTE au cahier. L attendu,
     lui, ne lui doit rien. */
  const { ARTICLES_PAR_PAGE, FAMILLES_PAGINEES } = await import('../src/lib/routes/chemins.ts');
  const ecartsDeRegle = divergencesAvecLeCode(ARTICLES_PAR_PAGE, FAMILLES_PAGINEES);

  const effectifs = effectifsDuCorpus(articlesParLocale);
  const attendus = attendusDePagination(effectifs, ARTICLES_PAR_PAGE_CAHIER);
  const routesPaginees = attendus.reduce((total, entree) => total + entree.nombreDePages - 1, 0);

  console.log('\n─────────────  CORPUS REEL, LU DANS L API  ─────────────\n');
  for (const locale of Object.keys(articlesParLocale)) {
    console.log(`  ${locale} : ${articlesParLocale[locale].length} article(s) publie(s)`);
  }
  console.log(`\n  ${attendus.length} index pagine(s) potentiel(s), taille de page ${ARTICLES_PAR_PAGE_CAHIER} (§4.2)`);
  const plusGros = [...attendus].sort((a, b) => b.effectif - a.effectif).slice(0, 5);
  for (const entree of plusGros) {
    console.log(
      `  ${String(entree.effectif).padStart(3)}  ${entree.base}` +
        `  → ${entree.nombreDePages} page(s)${entree.effectif === ARTICLES_PAR_PAGE_CAHIER ? '  ← a la borne exacte' : ''}`,
    );
  }

  console.log('\n─────────────  SORTIE CONFRONTEE AU CORPUS  ─────────────\n');
  console.log(`  ${routes.size} route(s) emise(s) dans ${path.basename(dist)}/`);
  console.log(`  ${routesPaginees} route(s) /page/n attendue(s) d apres le corpus`);

  const manquements = [
    ...ecartsDeRegle.map((ecart) => `⛔ ${ecart}`),
    ...confronterRoutes(routes, attendus),
    ...manquementsDesBornes(attendus, lecteurDe(dist)),
  ];

  if (manquements.length > 0) {
    console.error(`\n✖ ${manquements.length} constat(s) :`);
    for (const manquement of manquements) console.error(`  - ${manquement}`);
  }

  const rendu = verdictDeLaPreuve({
    routesPaginees,
    manquements,
    plafondTenu: ecartsDeRegle.length === 0,
  });

  if (rendu.issue === ISSUES.VERIFICATION_IMPOSSIBLE) {
    console.error(`\n⛔ VERIFICATION IMPOSSIBLE — ${rendu.motif}`);
    console.error(
      '   Ce qui EST verifie : chaque index emet exactement les routes que son effectif appelle,\n' +
        '   aucune /page/1, aucune page finale vide, et aucune navigation de pagination sur un\n' +
        '   index d une seule page. Ce qui ne l est PAS : tout ce qui commence a la page 2.',
    );
    process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
  }
  if (rendu.issue === ISSUES.ANOMALIE) {
    console.error(`\n✖ La preuve a eu lieu, et a trouve : ${rendu.motif}`);
    process.exit(ISSUES.ANOMALIE);
  }

  console.log(`\n✔ ${rendu.motif}\n`);
}
