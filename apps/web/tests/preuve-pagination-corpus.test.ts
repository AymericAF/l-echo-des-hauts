/**
 * L instrument qui confronte `dist/` au CORPUS REEL — et non a une attente ecrite a la main.
 *
 * CE QU IL AJOUTE A `preuve-pagination.mjs`, QUI EXISTE DEJA ET NE BOUGE PAS. Cette
 * preuve-la construit son propre corpus (`corpus-recette.mjs`), avec des attendus
 * transcrits a la main, et sort dans `dist-recette/`. C est ce qu il faut : elle exerce
 * des cas que le corpus editorial n atteint pas — une page 2, une rubrique sans
 * contrepartie anglaise, la 404. Mais elle ne dit RIEN de la sortie qu on sert.
 *
 * Le present module juge `dist/`, et son attendu vient de l API Strapi — c est-a-dire
 * d une source que le code de rendu n ecrit pas. Deriver l attendu de `registre.ts`
 * reviendrait a demander au code s il est d accord avec lui-meme.
 *
 * MODE D ECHEC LE PLUS REDOUTE, ET LA RAISON DU TROISIEME CODE. Un corpus dont aucun
 * effectif ne depasse la page produit « 0 route paginee attendue, 0 emise » : tout
 * concorde, et pourtant la pagination multi-pages n a PAS ete exercee. Rendre 0 la
 * ferait dire « prouvee sur le corpus reel » a une preuve qui n a rien vu — le defaut
 * exact que ce depot corrige partout ailleurs. C est une INCAPACITE (2), pas un vert.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ARTICLES_PAR_PAGE_CAHIER,
  attendusDePagination,
  bornesDUnePage,
  confronterRoutes,
  effectifsDuCorpus,
  manquementsDesBornes,
  verdictDeLaPreuve,
} from '../scripts/preuve-pagination-corpus.mjs';
import { ISSUES } from '../scripts/issues.mjs';

/** Un article a la forme que rend l API, et rien de plus que ce que l instrument lit. */
const article = (categorie: string, tags: string[] = []) => ({
  categorie: { slug: categorie },
  tags: tags.map((slug) => ({ slug })),
});

const fois = (nombre: number, fabrique: (index: number) => unknown) =>
  Array.from({ length: nombre }, (_, index) => fabrique(index));

// --- 1. le corpus se compte, il ne se suppose pas -----------------------------------

test('les effectifs se comptent par famille PAGINEE, locale par locale', () => {
  const effectifs = effectifsDuCorpus({
    fr: [article('territoire', ['emploi']), article('territoire', ['emploi', 'eau']), article('grand-air', [])],
    en: [article('territory', ['employment'])],
  });

  assert.equal(effectifs.get('fr|categorie|territoire'), 2);
  assert.equal(effectifs.get('fr|categorie|grand-air'), 1);
  assert.equal(effectifs.get('fr|tag|emploi'), 2);
  assert.equal(effectifs.get('fr|tag|eau'), 1);
  assert.equal(effectifs.get('en|categorie|territory'), 1);
  assert.equal(effectifs.get('en|tag|employment'), 1);
});

test('auteur et dossier ne sont PAS comptes : A-42 ne les pagine pas', () => {
  const effectifs = effectifsDuCorpus({ fr: [article('territoire')], en: [] });
  assert.ok(![...effectifs.keys()].some((cle) => cle.includes('auteur') || cle.includes('dossier')));
});

test('un article sans categorie ne fabrique pas une famille fantome', () => {
  const effectifs = effectifsDuCorpus({ fr: [{ categorie: null, tags: [] }], en: [] });
  assert.equal(effectifs.size, 0);
});

// --- 2. l attendu se derive du compte, dans les DEUX sens ---------------------------

test('un effectif sous la page n attend AUCUNE route /page/n, et interdit /page/2', () => {
  const attendus = attendusDePagination(new Map([['fr|categorie|territoire', 8]]), 12);
  const territoire = attendus.find((entree) => entree.cle === 'fr|categorie|territoire')!;

  assert.equal(territoire.nombreDePages, 1);
  assert.deepEqual(territoire.emises, ['/categorie/territoire']);
  assert.ok(territoire.interdites.includes('/categorie/territoire/page/1'));
  assert.ok(territoire.interdites.includes('/categorie/territoire/page/2'));
});

test('EXACTEMENT 12 tient sur une page — la frontiere que le corpus reel exerce', () => {
  const [emploi] = attendusDePagination(new Map([['fr|tag|emploi', 12]]), 12);
  assert.equal(emploi.nombreDePages, 1);
  assert.deepEqual(emploi.emises, ['/tag/emploi']);
  assert.ok(emploi.interdites.includes('/tag/emploi/page/2'));
});

test('13 attend /page/2 et interdit /page/3 — la garde ne fige pas le corpus d aujourd hui', () => {
  const [rubrique] = attendusDePagination(new Map([['fr|categorie|rubrique', 13]]), 12);
  assert.equal(rubrique.nombreDePages, 2);
  assert.deepEqual(rubrique.emises, ['/categorie/rubrique', '/categorie/rubrique/page/2']);
  assert.ok(rubrique.interdites.includes('/categorie/rubrique/page/3'));
  assert.ok(rubrique.interdites.includes('/categorie/rubrique/page/1'));
});

test('la locale EN porte son prefixe /en', () => {
  const [territory] = attendusDePagination(new Map([['en|categorie|territory', 25]]), 12);
  assert.deepEqual(territory.emises, [
    '/en/categorie/territory',
    '/en/categorie/territory/page/2',
    '/en/categorie/territory/page/3',
  ]);
});

test('le plafond du cahier est celui du §4.2, ecrit ici et non importe du code juge', () => {
  assert.equal(ARTICLES_PAR_PAGE_CAHIER, 12);
});

// --- 3. la confrontation nomme les deux sens de l ecart -----------------------------

const attendusDeuxPages = attendusDePagination(new Map([['fr|categorie|rubrique', 13]]), 12);

test('une route attendue et absente de la sortie est un manquement NOMME', () => {
  const manquements = confronterRoutes(new Set(['/categorie/rubrique']), attendusDeuxPages);
  assert.equal(manquements.length, 1);
  assert.match(manquements[0], /\/categorie\/rubrique\/page\/2/);
});

test('une route INTERDITE presente dans la sortie est un manquement NOMME', () => {
  const manquements = confronterRoutes(
    new Set(['/categorie/rubrique', '/categorie/rubrique/page/2', '/categorie/rubrique/page/3']),
    attendusDeuxPages,
  );
  assert.equal(manquements.length, 1);
  assert.match(manquements[0], /\/categorie\/rubrique\/page\/3/);
});

test('une sortie conforme au corpus ne rend AUCUN manquement', () => {
  assert.deepEqual(
    confronterRoutes(new Set(['/categorie/rubrique', '/categorie/rubrique/page/2']), attendusDeuxPages),
    [],
  );
});

// --- 4. les bornes se lisent dans les OCTETS emis -----------------------------------

const page = (cartes: number, options: { prev?: boolean; next?: boolean; nav?: boolean } = {}) =>
  `<html><body>${fois(cartes, () => '<article class="carte"><div class="carte__image"></div></article>').join('')}` +
  (options.nav === false
    ? ''
    : `<nav class="pagination">${options.prev ? '<a rel="prev" href="/x">p</a>' : ''}${
        options.next ? '<a rel="next" href="/y">s</a>' : ''
      }</nav>`) +
  '</body></html>';

test('les bornes d une page se lisent : cartes, rel=prev, rel=next, nav', () => {
  const lues = bornesDUnePage(page(12, { next: true }));
  assert.equal(lues.cartes, 12);
  assert.equal(lues.precedent, false);
  assert.equal(lues.suivant, true);
  assert.equal(lues.navigation, true);
});

test('carte__image ne se compte pas comme une carte', () => {
  assert.equal(bornesDUnePage('<div class="carte__image"></div>').cartes, 0);
});

test('une page unique qui rend une navigation de pagination est un manquement', () => {
  const manquements = manquementsDesBornes(attendusDePagination(new Map([['fr|tag|emploi', 12]]), 12), () =>
    page(12, { nav: true }),
  );
  assert.equal(manquements.length, 1);
  assert.match(manquements[0], /navigation/i);
});

test('une page unique sans navigation, a 12 articles, ne rend aucun manquement', () => {
  assert.deepEqual(
    manquementsDesBornes(attendusDePagination(new Map([['fr|tag|emploi', 12]]), 12), () =>
      page(12, { nav: false }),
    ),
    [],
  );
});

test('la premiere page d un index pagine ne porte PAS de rel=prev, et porte un rel=next', () => {
  const attendus = attendusDePagination(new Map([['fr|categorie|rubrique', 13]]), 12);
  const manquements = manquementsDesBornes(attendus, (route) =>
    route.endsWith('/page/2') ? page(1, { prev: true }) : page(12, { prev: true, next: true }),
  );
  assert.equal(manquements.length, 1);
  assert.match(manquements[0], /rel="prev"/);
});

test('la DERNIERE page ne porte pas de rel=next — le lien mort que la relecture ne voit pas', () => {
  const attendus = attendusDePagination(new Map([['fr|categorie|rubrique', 13]]), 12);
  const manquements = manquementsDesBornes(attendus, (route) =>
    route.endsWith('/page/2') ? page(1, { prev: true, next: true }) : page(12, { next: true }),
  );
  assert.equal(manquements.length, 1);
  assert.match(manquements[0], /rel="next"/);
});

test('une page finale VIDE est un manquement, et le compte attendu est celui du corpus', () => {
  const attendus = attendusDePagination(new Map([['fr|categorie|rubrique', 13]]), 12);
  const manquements = manquementsDesBornes(attendus, (route) =>
    route.endsWith('/page/2') ? page(0, { prev: true }) : page(12, { next: true }),
  );
  assert.equal(manquements.length, 1);
  assert.match(manquements[0], /1 article|1 carte/i);
});

test('un index pagine conforme de bout en bout ne rend aucun manquement', () => {
  const attendus = attendusDePagination(new Map([['fr|categorie|rubrique', 13]]), 12);
  assert.deepEqual(
    manquementsDesBornes(attendus, (route) =>
      route.endsWith('/page/2') ? page(1, { prev: true }) : page(12, { next: true }),
    ),
    [],
  );
});

test('une page attendue mais illisible est une INCAPACITE, pas une borne non tenue', () => {
  const attendus = attendusDePagination(new Map([['fr|tag|emploi', 12]]), 12);
  const manquements = manquementsDesBornes(attendus, () => {
    throw new Error('Page absente de la sortie');
  });
  assert.equal(manquements.length, 1);
  assert.match(manquements[0], /⛔/);
});

// --- 5. le verdict : trois issues, et l incapacite prime ----------------------------

test('corpus qui pagine + sortie conforme = CONFORME', () => {
  const rendu = verdictDeLaPreuve({ routesPaginees: 3, manquements: [], plafondTenu: true });
  assert.equal(rendu.issue, ISSUES.CONFORME);
});

test('corpus qui pagine + une borne non tenue = ANOMALIE', () => {
  const rendu = verdictDeLaPreuve({ routesPaginees: 3, manquements: ['x'], plafondTenu: true });
  assert.equal(rendu.issue, ISSUES.ANOMALIE);
});

test('AUCUNE route paginee attendue = VERIFICATION IMPOSSIBLE, jamais un vert', () => {
  const rendu = verdictDeLaPreuve({ routesPaginees: 0, manquements: [], plafondTenu: true });
  assert.equal(rendu.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.match(rendu.motif, /n exerce aucune page/i);
});

test('un plafond de code divergent du cahier est une INCAPACITE : on ne sait plus ce qui est juge', () => {
  const rendu = verdictDeLaPreuve({ routesPaginees: 3, manquements: [], plafondTenu: false });
  assert.equal(rendu.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.match(rendu.motif, /plafond/i);
});

/**
 * L ORDRE DE PRIORITE EST L INVERSE DE CELUI DU RESTE DU DEPOT, ET C EST VOULU.
 *
 * « Le corpus n exerce aucune page 2 » est une incapacite PARTIELLE : les index ont bel et
 * bien ete lus et juges, seule la classe « au-dela de la page 1 » n a pas ete atteinte. Un
 * ecart trouve sur ce qui A ete juge est donc un defaut du SITE, prouve et actionnable —
 * le rendre en `2` enverrait corriger l environnement quand le geste est de corriger le
 * site. Les incapacites TOTALES, elles, priment toujours.
 */
test('une anomalie REELLE prime sur l incapacite partielle : le geste est de corriger le site', () => {
  const rendu = verdictDeLaPreuve({ routesPaginees: 0, manquements: ['/x/page/1 : INTERDITE'], plafondTenu: true });
  assert.equal(rendu.issue, ISSUES.ANOMALIE);
});

test('mais une incapacite TOTALE prime sur tout : on ne sait plus contre quoi on juge', () => {
  assert.equal(
    verdictDeLaPreuve({ routesPaginees: 0, manquements: ['x'], plafondTenu: false }).issue,
    ISSUES.VERIFICATION_IMPOSSIBLE,
  );
  assert.equal(
    verdictDeLaPreuve({ routesPaginees: 3, manquements: ['⛔ /x : illisible'], plafondTenu: true }).issue,
    ISSUES.VERIFICATION_IMPOSSIBLE,
  );
});
