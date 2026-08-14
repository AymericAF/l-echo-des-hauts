/**
 * Tests des donnees structurees du §5.1 — les CINQ types, et le serialiseur.
 *
 * Ce qui est teste ici, c est le CALCUL du graphe a partir d un contexte deja resolu :
 * quels noeuds sortent sur quelle page, avec quelles proprietes. Que ces noeuds sortent
 * VRAIMENT dans `dist/` se prouve ailleurs — `scripts/verifier-seo.mjs`, controle 8, qui
 * confronte les pages construites au meme critere. Les deux sont necessaires : ce
 * fichier-ci ne verrait pas un layout qui oublie d appeler la fonction.
 *
 * Le §5.1 mot pour mot : « Article sur les pages article, avec author, datePublished,
 * dateModified, image, publisher. BreadcrumbList sur toutes les pages profondes. Person
 * sur les pages auteur. WebSite avec SearchAction sur l accueil. CollectionPage sur les
 * pages categorie et dossier. »
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LONGUEUR_HEADLINE,
  donneesStructurees,
  serialiserJsonLd,
  type ContexteJsonLd,
} from '../src/lib/seo/donnees-structurees.ts';

const ORIGINE = 'https://echo.ayfiweb.fr';

const LOGO = { url: `${ORIGINE}/medias/logo.png`, largeur: 300, hauteur: 80 };

/** Un contexte minimal, que chaque test specialise. */
function contexte(surcharge: Partial<ContexteJsonLd> = {}): ContexteJsonLd {
  return {
    locale: 'fr',
    origine: ORIGINE,
    canonique: `${ORIGINE}/`,
    titre: 'Une page',
    description: 'Une description',
    nomSite: 'L Echo des Hauts',
    logo: LOGO,
    filAriane: [],
    sujet: { genre: 'aucun' },
    ...surcharge,
  };
}

/** Les noeuds du graphe, indexes par `@type`. */
function noeuds(graphe: ReturnType<typeof donneesStructurees>): Map<string, Record<string, unknown>> {
  const trouves = new Map<string, Record<string, unknown>>();
  for (const noeud of graphe['@graph']) trouves.set(String(noeud['@type']), noeud);
  return trouves;
}

const FIL_ARTICLE = [
  { nom: 'Accueil', url: `${ORIGINE}/` },
  { nom: 'Vie locale', url: `${ORIGINE}/categorie/vie-locale` },
  { nom: 'Le pont rouvre', url: `${ORIGINE}/article/le-pont-rouvre` },
];

const SUJET_ARTICLE = {
  genre: 'article',
  titre: 'Le pont rouvre apres deux ans de travaux',
  datePublication: '2026-03-04T08:00:00.000Z',
  dateModification: '2026-05-11T17:20:00.000Z',
  image: { url: `${ORIGINE}/medias/pont.jpg`, largeur: 1600, hauteur: 900 },
  auteur: { nom: 'Camille Ferrand', url: `${ORIGINE}/auteur/camille-ferrand` },
  rubrique: 'Vie locale',
  etiquettes: ['mobilite', 'travaux'],
} as const;

// --- Le cadre commun -------------------------------------------------------------------

test('le graphe porte toujours son @context schema.org et un @graph non vide', () => {
  const graphe = donneesStructurees(contexte({ filAriane: FIL_ARTICLE }));
  assert.equal(graphe['@context'], 'https://schema.org');
  assert.ok(Array.isArray(graphe['@graph']));
  assert.ok(graphe['@graph'].length > 0);
});

test('une page SANS aucun noeud a produire rend null plutot qu un graphe vide', () => {
  // Un `<script type="application/ld+json">{"@graph":[]}</script>` serait du bruit servi
  // sur chaque page : valide, et sans aucune information. La reponse honnete est de ne
  // rien emettre — et le controle 8 de `verifier-seo` exige alors que la page ne soit
  // pas indexable, ce qui referme la boucle.
  assert.equal(donneesStructurees(contexte({ filAriane: [] })), null);
});

// --- Type 1 : WebSite + SearchAction, sur l accueil et nulle part ailleurs -------------

test('l accueil porte un WebSite avec son SearchAction (§5.1)', () => {
  const graphe = donneesStructurees(contexte({ sujet: { genre: 'accueil' } }))!;
  const site = noeuds(graphe).get('WebSite')!;
  assert.equal(site.url, `${ORIGINE}/`);
  assert.equal(site.name, 'L Echo des Hauts');
  assert.equal(site.inLanguage, 'fr');

  const action = site.potentialAction as Record<string, unknown>;
  assert.equal(action['@type'], 'SearchAction');
  assert.equal(action['query-input'], 'required name=search_term_string');
  const cible = action.target as Record<string, unknown>;
  assert.equal(cible.urlTemplate, `${ORIGINE}/recherche?q={search_term_string}`);
});

test('l accueil anglais pointe SON formulaire de recherche, pas le francais', () => {
  // Un `SearchAction` qui renvoie toute une langue vers le formulaire de l autre est le
  // meme defaut que le `hreflang` fabrique par prefixage (T-04) : invisible tant que les
  // deux chemins se ressemblent.
  const graphe = donneesStructurees(
    contexte({ locale: 'en', canonique: `${ORIGINE}/en`, sujet: { genre: 'accueil' } }),
  )!;
  const action = noeuds(graphe).get('WebSite')!.potentialAction as Record<string, unknown>;
  assert.equal(
    (action.target as Record<string, unknown>).urlTemplate,
    `${ORIGINE}/en/recherche?q={search_term_string}`,
  );
});

test('l accueil porte son editeur, et l accueil n a PAS de fil d Ariane', () => {
  // « BreadcrumbList sur toutes les pages PROFONDES » : l accueil n en est pas une, et un
  // fil a une seule etape ne guide personne.
  const graphe = donneesStructurees(contexte({ sujet: { genre: 'accueil' }, filAriane: [] }))!;
  const types = noeuds(graphe);
  assert.ok(types.has('Organization'));
  assert.ok(!types.has('BreadcrumbList'));
});

test('aucune page profonde ne porte de WebSite : il est reserve a l accueil', () => {
  for (const sujet of [
    SUJET_ARTICLE,
    { genre: 'collection' } as const,
    { genre: 'auteur', fonction: null, portrait: null, reseaux: [] } as const,
    { genre: 'aucun' } as const,
  ]) {
    const graphe = donneesStructurees(contexte({ sujet, filAriane: FIL_ARTICLE }))!;
    assert.ok(!noeuds(graphe).has('WebSite'), `WebSite emis a tort pour ${sujet.genre}`);
  }
});

// --- Type 2 : Article, avec les cinq proprietes NOMMEES par le §5.1 --------------------

test('une page article porte un Article avec author, datePublished, dateModified, image et publisher', () => {
  const graphe = donneesStructurees(
    contexte({
      canonique: `${ORIGINE}/article/le-pont-rouvre`,
      sujet: SUJET_ARTICLE,
      filAriane: FIL_ARTICLE,
    }),
  )!;
  const article = noeuds(graphe).get('Article')!;

  // Les cinq du §5.1, une assertion chacune — c est la liste contractuelle.
  assert.deepEqual(article.author, {
    '@type': 'Person',
    name: 'Camille Ferrand',
    url: `${ORIGINE}/auteur/camille-ferrand`,
  });
  assert.equal(article.datePublished, '2026-03-04T08:00:00.000Z');
  assert.equal(article.dateModified, '2026-05-11T17:20:00.000Z');
  assert.deepEqual(article.image, {
    '@type': 'ImageObject',
    url: `${ORIGINE}/medias/pont.jpg`,
    width: 1600,
    height: 900,
  });
  assert.deepEqual(article.publisher, { '@id': `${ORIGINE}/#organisation` });

  // Et l editeur reference est DEFINI dans le meme graphe : une page dont le
  // `publisher` pointe un `@id` absent ne declare pas d editeur du tout.
  const editeur = noeuds(graphe).get('Organization')!;
  assert.equal(editeur['@id'], `${ORIGINE}/#organisation`);
  assert.equal(editeur.name, 'L Echo des Hauts');
  assert.deepEqual(editeur.logo, {
    '@type': 'ImageObject',
    url: LOGO.url,
    width: 300,
    height: 80,
  });
});

test('un auteur dont la page n est pas emise garde son nom et perd son url', () => {
  // §10.3 : un index sans article dans la locale n est pas emis. Pointer sa page
  // produirait un lien mort dans le graphe — invisible depuis le navigateur.
  const graphe = donneesStructurees(
    contexte({
      sujet: { ...SUJET_ARTICLE, auteur: { nom: 'Camille Ferrand', url: null } },
      filAriane: FIL_ARTICLE,
    }),
  )!;
  assert.deepEqual(noeuds(graphe).get('Article')!.author, {
    '@type': 'Person',
    name: 'Camille Ferrand',
  });
});

test('le headline est tronque : Google ignore un titre trop long, il ne le raccourcit pas', () => {
  // 120 caracteres : la borne HAUTE du champ `titre` au modele (A-26). Le cas n a donc
  // rien de theorique — c est le titre le plus long que la base accepte de stocker.
  const long =
    'Le pont de la vallee rouvre enfin a la circulation apres deux annees entieres de travaux, de deviations et de retards';
  assert.equal(long.length, 117);
  assert.ok(long.length > LONGUEUR_HEADLINE);
  const graphe = donneesStructurees(
    contexte({ sujet: { ...SUJET_ARTICLE, titre: long }, filAriane: FIL_ARTICLE }),
  )!;
  const headline = noeuds(graphe).get('Article')!.headline as string;
  assert.ok(headline.length <= LONGUEUR_HEADLINE, `headline de ${headline.length} caracteres`);
  assert.ok(long.startsWith(headline.replace(/…$/, '').trim()));
});

test('le headline est le titre de l ARTICLE, jamais le <title> suffixe du nom du site', () => {
  const graphe = donneesStructurees(
    contexte({ titre: 'Le pont rouvre — L Echo des Hauts', sujet: SUJET_ARTICLE, filAriane: FIL_ARTICLE }),
  )!;
  assert.equal(noeuds(graphe).get('Article')!.headline, SUJET_ARTICLE.titre);
});

test('la rubrique et les etiquettes de l article sortent en articleSection et keywords', () => {
  const article = noeuds(
    donneesStructurees(contexte({ sujet: SUJET_ARTICLE, filAriane: FIL_ARTICLE }))!,
  ).get('Article')!;
  assert.equal(article.articleSection, 'Vie locale');
  assert.deepEqual(article.keywords, ['mobilite', 'travaux']);
});

// --- Type 3 : BreadcrumbList sur toutes les pages profondes ----------------------------

test('le fil d Ariane numerote ses etapes a partir de 1 et porte leur URL', () => {
  const graphe = donneesStructurees(contexte({ sujet: SUJET_ARTICLE, filAriane: FIL_ARTICLE }))!;
  assert.deepEqual(noeuds(graphe).get('BreadcrumbList')!.itemListElement, [
    { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${ORIGINE}/` },
    { '@type': 'ListItem', position: 2, name: 'Vie locale', item: `${ORIGINE}/categorie/vie-locale` },
    { '@type': 'ListItem', position: 3, name: 'Le pont rouvre', item: `${ORIGINE}/article/le-pont-rouvre` },
  ]);
});

test('un fil d une seule etape n est pas emis : il ne dit rien', () => {
  const graphe = donneesStructurees(
    contexte({ sujet: { genre: 'collection' }, filAriane: [{ nom: 'Accueil', url: `${ORIGINE}/` }] }),
  )!;
  assert.ok(!noeuds(graphe).has('BreadcrumbList'));
});

test('les QUATRE familles de pages profondes portent un fil d Ariane', () => {
  for (const sujet of [
    SUJET_ARTICLE,
    { genre: 'collection' } as const,
    { genre: 'auteur', fonction: null, portrait: null, reseaux: [] } as const,
    { genre: 'aucun' } as const,
  ]) {
    const graphe = donneesStructurees(contexte({ sujet, filAriane: FIL_ARTICLE }))!;
    assert.ok(noeuds(graphe).has('BreadcrumbList'), `fil absent pour ${sujet.genre}`);
  }
});

// --- Type 4 : Person sur les pages auteur ----------------------------------------------

test('une page auteur porte un Person, avec sa fonction, son portrait et ses reseaux', () => {
  const graphe = donneesStructurees(
    contexte({
      canonique: `${ORIGINE}/auteur/camille-ferrand`,
      titre: 'Camille Ferrand',
      sujet: {
        genre: 'auteur',
        fonction: 'Reporter',
        portrait: { url: `${ORIGINE}/medias/camille.jpg`, largeur: 400, hauteur: 400 },
        reseaux: ['https://www.linkedin.com/in/exemple'],
      },
      filAriane: [
        { nom: 'Accueil', url: `${ORIGINE}/` },
        { nom: 'Camille Ferrand', url: `${ORIGINE}/auteur/camille-ferrand` },
      ],
    }),
  )!;
  const personne = noeuds(graphe).get('Person')!;
  assert.equal(personne.name, 'Camille Ferrand');
  assert.equal(personne.url, `${ORIGINE}/auteur/camille-ferrand`);
  assert.equal(personne.jobTitle, 'Reporter');
  assert.deepEqual(personne.sameAs, ['https://www.linkedin.com/in/exemple']);
  assert.equal((personne.image as Record<string, unknown>).url, `${ORIGINE}/medias/camille.jpg`);
});

test('un auteur sans fonction, sans portrait et sans reseau ne porte pas de cle vide', () => {
  // Une propriete `null` ou `[]` dans un graphe est un signal FAUX : elle dit « cette
  // information existe et vaut rien ». Le test des resultats enrichis la remonte.
  const personne = noeuds(
    donneesStructurees(
      contexte({
        titre: 'Tarik Belhadj',
        sujet: { genre: 'auteur', fonction: null, portrait: null, reseaux: [] },
        filAriane: FIL_ARTICLE,
      }),
    )!,
  ).get('Person')!;
  assert.ok(!('jobTitle' in personne));
  assert.ok(!('image' in personne));
  assert.ok(!('sameAs' in personne));
});

/* --- `sameAs` n admet que l EXTERNE, et le mecanisme le tient ------------------------
 *
 * LE DEFAUT DU 2026-08-11 (tache 6e8578be), sur la donnee REELLE. Les cinq auteurs
 * portent dans `reseaux` l URL de LEUR PROPRE page — un choix editorial assume, ecrit
 * en toutes lettres au § `reseaux` de `docs/plan-editorial.md` : « c est volontairement
 * circulaire, et c est le seul choix qui ne fabrique pas de fausse identite en ligne ».
 * Ce choix vaut pour la NAV, ou un lien vers soi est inutile mais inoffensif.
 *
 * Il ne vaut PAS pour `sameAs`, dont la ligne 260 dit deja l inverse : « `sameAs` porte
 * les profils EXTERNES de la personne ». Un `sameAs` egal a la canonique de la page
 * n affirme rien — au mieux du bruit, au pire une identite circulaire. Cette regle
 * n etait tenue que par un COMMENTAIRE, et la donnee reelle le violait sur les dix pages
 * auteur de la production. Elle est desormais tenue par un mecanisme.
 *
 * La NAV n est pas concernee : elle recoit `auteur.reseaux` telle quelle
 * (`PageIndex.astro:113`), et le dernier test ci-dessous garde cette separation.
 */

test('sameAs ecarte une URL RELATIVE — elle designe une page du site', () => {
  const personne = noeuds(
    donneesStructurees(
      contexte({
        canonique: `${ORIGINE}/auteur/theo-brissac`,
        titre: 'Theo Brissac',
        sujet: {
          genre: 'auteur',
          fonction: 'Reporter',
          portrait: null,
          reseaux: ['/auteur/theo-brissac', 'https://www.linkedin.com/in/exemple'],
        },
        filAriane: FIL_ARTICLE,
      }),
    )!,
  ).get('Person')!;
  assert.deepEqual(personne.sameAs, ['https://www.linkedin.com/in/exemple']);
});

test('sameAs ecarte une URL ABSOLUE posee sur l origine du site', () => {
  const personne = noeuds(
    donneesStructurees(
      contexte({
        canonique: `${ORIGINE}/auteur/theo-brissac`,
        titre: 'Theo Brissac',
        sujet: {
          genre: 'auteur',
          fonction: 'Reporter',
          portrait: null,
          reseaux: [`${ORIGINE}/auteur/theo-brissac`, 'https://mastodon.exemple/@theo'],
        },
        filAriane: FIL_ARTICLE,
      }),
    )!,
  ).get('Person')!;
  assert.deepEqual(personne.sameAs, ['https://mastodon.exemple/@theo']);
});

test('sameAs disparait quand TOUS les reseaux sont internes — jamais un tableau vide', () => {
  /* L etat REEL de la production le 2026-08-11 : une seule entree, interne. Ecrire
     `"sameAs":[]` serait pire que ne rien ecrire — cf. le contrat de `noeud()`. */
  const personne = noeuds(
    donneesStructurees(
      contexte({
        canonique: `${ORIGINE}/auteur/theo-brissac`,
        titre: 'Theo Brissac',
        sujet: {
          genre: 'auteur',
          fonction: 'Reporter',
          portrait: null,
          reseaux: [`${ORIGINE}/auteur/theo-brissac`],
        },
        filAriane: FIL_ARTICLE,
      }),
    )!,
  ).get('Person')!;
  assert.ok(!('sameAs' in personne));
});

test('sameAs ecarte l origine du site MEME sur une page d une AUTRE langue', () => {
  /* `Auteur.reseaux` est NON localise (A-06) : les deux locales lisent la meme URL
     francaise. Sur `/en/auteur/<slug>`, l URL interne ne vaut donc pas la canonique de
     la page — et un filtre qui comparerait a la CANONIQUE, et non a l ORIGINE, la
     laisserait passer. C est le defaut C de la tache 6e8578be, dont la moitie SEO se
     ferme ici. */
  const personne = noeuds(
    donneesStructurees(
      contexte({
        locale: 'en',
        canonique: `${ORIGINE}/en/auteur/theo-brissac`,
        titre: 'Theo Brissac',
        sujet: {
          genre: 'auteur',
          fonction: 'Reporter',
          portrait: null,
          reseaux: [`${ORIGINE}/auteur/theo-brissac`],
        },
        filAriane: FIL_ARTICLE,
      }),
    )!,
  ).get('Person')!;
  assert.ok(!('sameAs' in personne));
});

test('une URL d un AUTRE hote qui contient le nom du site reste EXTERNE', () => {
  /* Le filtre compare des ORIGINES, jamais des chaines : `echo.ayfiweb.fr.exemple.test`
     et `exemple.test/?u=echo.ayfiweb.fr` sont des hotes tiers. Un `startsWith` sur
     l origine les avalerait tous les deux, et effacerait un vrai profil externe. */
  const personne = noeuds(
    donneesStructurees(
      contexte({
        canonique: `${ORIGINE}/auteur/theo-brissac`,
        titre: 'Theo Brissac',
        sujet: {
          genre: 'auteur',
          fonction: 'Reporter',
          portrait: null,
          reseaux: [
            'https://echo.ayfiweb.fr.exemple.test/theo',
            `https://exemple.test/?u=${ORIGINE}/auteur/theo-brissac`,
          ],
        },
        filAriane: FIL_ARTICLE,
      }),
    )!,
  ).get('Person')!;
  assert.deepEqual(personne.sameAs, [
    'https://echo.ayfiweb.fr.exemple.test/theo',
    `https://exemple.test/?u=${ORIGINE}/auteur/theo-brissac`,
  ]);
});

test('aucune valeur null ni tableau vide ne subsiste dans le graphe entier', () => {
  const graphe = donneesStructurees(
    contexte({ description: null, logo: null, sujet: SUJET_ARTICLE, filAriane: FIL_ARTICLE }),
  )!;
  const parcourir = (valeur: unknown, chemin: string): void => {
    assert.notEqual(valeur, null, `valeur null a ${chemin}`);
    if (Array.isArray(valeur)) {
      assert.notEqual(valeur.length, 0, `tableau vide a ${chemin}`);
      valeur.forEach((entree, i) => parcourir(entree, `${chemin}[${i}]`));
    } else if (typeof valeur === 'object') {
      for (const [cle, sous] of Object.entries(valeur as object)) parcourir(sous, `${chemin}.${cle}`);
    }
  };
  parcourir(graphe, 'graphe');
});

// --- Type 5 : CollectionPage sur categorie et dossier -----------------------------------

test('une page categorie ou dossier porte un CollectionPage', () => {
  const graphe = donneesStructurees(
    contexte({
      canonique: `${ORIGINE}/dossier/la-vallee-se-reconstruit`,
      titre: 'La vallee se reconstruit',
      description: 'Une serie en cinq episodes',
      sujet: { genre: 'collection' },
      filAriane: FIL_ARTICLE,
    }),
  )!;
  const collection = noeuds(graphe).get('CollectionPage')!;
  assert.equal(collection.name, 'La vallee se reconstruit');
  assert.equal(collection.description, 'Une serie en cinq episodes');
  assert.equal(collection.url, `${ORIGINE}/dossier/la-vallee-se-reconstruit`);
  assert.equal(collection.inLanguage, 'fr');
});

test('une page etiquette ne porte PAS de CollectionPage : le §5.1 nomme categorie et dossier', () => {
  // Le perimetre se POINTE, il ne se devine pas. Une page etiquette est bien une liste,
  // mais le cahier ne lui demande pas de CollectionPage — elle porte son fil d Ariane,
  // ce qui suffit au critere « 100 % des pages indexables portent un JSON-LD valide ».
  const graphe = donneesStructurees(contexte({ sujet: { genre: 'aucun' }, filAriane: FIL_ARTICLE }))!;
  const types = noeuds(graphe);
  assert.ok(!types.has('CollectionPage'));
  assert.deepEqual([...types.keys()], ['BreadcrumbList']);
});

// --- Le serialiseur : la sortie du bloc ne doit jamais redevenir du HTML ----------------

test('le serialiseur rend du JSON que JSON.parse relit a l identique', () => {
  const graphe = donneesStructurees(contexte({ sujet: SUJET_ARTICLE, filAriane: FIL_ARTICLE }))!;
  assert.deepEqual(JSON.parse(serialiserJsonLd(graphe)), graphe);
});

test('LA SORTIE PAR LA FERMETURE — un titre qui contient </script> ne ferme pas la balise', () => {
  // C est la seule faille propre au JSON-LD, et elle est ENTRANTE : le titre vient de la
  // base, donc d une saisie. `JSON.stringify` n echappe pas `<` — le navigateur, lui,
  // ferme la balise sur le premier `</script` litteral, et TOUT ce qui suit redevient du
  // HTML executable. La garde T-09 attraperait le resultat au build ; mieux vaut qu il ne
  // se produise pas.
  const graphe = donneesStructurees(
    contexte({
      sujet: { ...SUJET_ARTICLE, titre: 'Fin </script><script>alert(1)</script> du pont' },
      filAriane: FIL_ARTICLE,
    }),
  )!;
  const texte = serialiserJsonLd(graphe);
  assert.ok(!texte.includes('</script'), 'le serialiseur laisse passer une balise fermante');
  assert.ok(!texte.includes('<'), 'le serialiseur laisse passer un chevron ouvrant');
  // Et l information n est pas perdue : l echappement est reversible.
  const relu = JSON.parse(texte);
  assert.match(String(relu['@graph'].find((n: Record<string, unknown>) => n['@type'] === 'Article').headline), /alert\(1\)/);
});

test('le serialiseur echappe aussi les separateurs de ligne U+2028 et U+2029', () => {
  // Ils sont du JSON legal et du JavaScript ILLEGAL en litteral de chaine. Ecrits ici en
  // sequences d echappement : un caractere invisible dans un fichier de test est un
  // caractere qu un editeur normalise un jour sans que personne ne le voie.
  const graphe = donneesStructurees(
    contexte({
      sujet: { ...SUJET_ARTICLE, titre: 'Avant\u2028milieu\u2029fin' },
      filAriane: FIL_ARTICLE,
    }),
  )!;
  const texte = serialiserJsonLd(graphe);
  assert.ok(!texte.includes('\u2028'));
  assert.ok(!texte.includes('\u2029'));
  assert.deepEqual(JSON.parse(texte), graphe);
});
