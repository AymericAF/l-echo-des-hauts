/**
 * La SURCHARGE `partage.seo` traverse le corpus versionne — ou echoue bruyamment.
 *
 * Pourquoi ce fichier existe. Le composant `partage.seo` est le mecanisme de
 * surcharge editoriale : il existe pour qu un redacteur impose un titre, une
 * description, une canonique ou un `noindex` differents du repli calcule au build
 * (A-07). Jusqu ici, AUCUNE entree du corpus n en portait — le chemin n avait donc
 * jamais servi. Et il ne servait pas seulement « pas encore » : le pipeline ne le
 * portait PAS DU TOUT. `chargerCorpus` reconstruisait les objets localises en ne
 * gardant que les cles connues, et aucun des corps envoyes a Strapi ne mentionnait
 * `seo`. Un redacteur qui aurait renseigne le champ dans `apps/cms/data/` aurait vu
 * sa valeur disparaitre SANS AUCUN MESSAGE — le mode d echec le plus couteux qui
 * soit, celui ou le succes et l echec rendent la meme sortie.
 *
 * Ces tests exercent donc les deux sens, sur les trois familles qui portent le
 * composant au modele : la valeur renseignee ARRIVE, et la valeur absente reste
 * absente (elle ne se fabrique pas — A-07 interdit d ecrire un defaut en base).
 *
 * `Auteur` et `Tag` n en portent pas, et c est un ARBITRAGE (A-08), pas un oubli.
 * Un `seo` pose sur l un d eux est donc refuse a la lecture plutot qu ignore : sans
 * ce refus, on retomberait exactement dans le silence que ce fichier ferme.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { chargerCorpus } from '../scripts/seed/corpus.ts';
import { ErreurCorpus, MediaIntrouvable } from '../scripts/seed/erreurs.ts';

import { bacJetable, brancherLesBacs } from '../../../outils/bac-jetable.mjs';

/* Les bacs de ce fichier se referment : nettoyage dans `after()`, bac du cas fautif
   conservé avec sa raison. Cf. `outils/bac-jetable.mjs`. */
brancherLesBacs();

/* ------------------------------------------------------------------ */
/* Un corpus minimal AUTONOME — volontairement independant de celui de  */
/* `seed-corpus.test.ts`, pour que les deux fichiers puissent evoluer   */
/* sans se casser l un l autre.                                         */
/* ------------------------------------------------------------------ */

type Retouche = (corpus: {
  categories: any[];
  tags: any[];
  auteurs: any[];
  dossiers: any[];
  articleFr: any;
}) => void;

function ecrireCorpus(retoucher: Retouche = () => {}): string {
  const racine = bacJetable('echo-seo');
  const ecrire = (rel: string, contenu: string) => {
    const cible = path.join(racine, rel);
    fs.mkdirSync(path.dirname(cible), { recursive: true });
    fs.writeFileSync(cible, contenu, 'utf8');
  };

  ecrire('medias/couvertures/A05.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  ecrire('medias/identite/logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  ecrire('medias/identite/partage.png', 'PNG factice');
  const credit = { ayantDroit: 'Œuvre du projet', licence: 'CC0 1.0' };

  const categories = [
    {
      ordreAffichage: 10,
      couleurAccent: '#1F5C4A',
      fr: { nom: 'Territoire', slug: 'territoire', description: 'Ce qui se decide.' },
      en: { nom: 'Territory', slug: 'territory', description: 'What gets decided.' },
    },
  ];
  const tags = [{ fr: { nom: 'Eau', slug: 'eau' }, en: { nom: 'Water', slug: 'water' } }];
  const auteurs = [
    {
      nom: 'Hakim Zerrouki',
      reseaux: [],
      fr: { slug: 'hakim-zerrouki', fonction: 'Reporter', bio: 'Sept ans en mairie.' },
      en: { slug: 'hakim-zerrouki', fonction: 'Reporter', bio: 'Seven years at the hall.' },
    },
  ];
  const dossiers = [
    {
      dateOuverture: '2026-02-01',
      fr: { titre: "L eau du plateau", slug: 'l-eau-du-plateau', introduction: 'Cinq echelons.' },
      en: { titre: 'Water of the plateau', slug: 'water-of-the-plateau', introduction: 'Five tiers.' },
    },
  ];
  const articleFr: any = {
    code: 'A05',
    locale: 'fr',
    slug: 'qui-decide-de-l-eau',
    titre: 'Qui decide de l eau ?',
    chapo: 'Cinq echelons, une seule facture.',
    auteur: 'hakim-zerrouki',
    categorie: 'territoire',
    tags: ['eau'],
    dossier: 'l-eau-du-plateau',
    datePublication: '2026-03-16T08:00:00.000Z',
    aLaUne: false,
    imageCouverture: 'couvertures/A05.svg',
    legendeCouverture: 'Le bassin versant.',
  };

  retoucher({ categories, tags, auteurs, dossiers, articleFr });

  /* Le corpus refuse un media declare au manifeste mais utilise nulle part. La
     vignette de partage n est donc posee QUE si la retouche s en sert — sinon le
     fixture echouerait pour une raison etrangere a ce qu il teste. */
  const utilise = (cle: string) =>
    JSON.stringify([categories, tags, auteurs, dossiers, articleFr]).includes(cle);
  const manifeste: Record<string, unknown> = {
    'couvertures/A05.svg': { alternativeText: 'Bassin versant', ...credit },
    'identite/logo.svg': { alternativeText: 'Logo', ...credit },
    'identite/partage.png': { alternativeText: 'Partage', ...credit },
  };
  if (utilise('partage/A05-og.png')) {
    ecrire('medias/partage/A05-og.png', 'PNG factice');
    manifeste['partage/A05-og.png'] = { alternativeText: 'Vignette de partage', ...credit };
  }
  ecrire('medias/manifeste.json', JSON.stringify(manifeste));

  ecrire('categories.json', JSON.stringify(categories));
  ecrire('tags.json', JSON.stringify(tags));
  ecrire('auteurs.json', JSON.stringify(auteurs));
  ecrire('dossiers.json', JSON.stringify(dossiers));
  ecrire(
    'configuration.json',
    JSON.stringify({
      logo: 'identite/logo.svg',
      imagePartageDefaut: 'identite/partage.png',
      reseaux: [],
      fr: {
        nomSite: "L'Echo des Hauts",
        descriptionDefaut: 'Magazine de demonstration.',
        mentionsLegales: 'Media fictif.',
      },
      en: {
        nomSite: 'The Highland Echo',
        descriptionDefaut: 'Demo magazine.',
        mentionsLegales: 'Fictional outlet.',
      },
    })
  );

  const md = (donnees: any, corps: string) =>
    ['---', JSON.stringify(donnees, null, 2), '---', '', '::: texte', corps, ':::', ''].join('\n');

  ecrire('articles/A05.fr.md', md(articleFr, 'Cinq echelons decident de l eau.'));
  ecrire(
    'articles/A05.en.md',
    md(
      { ...articleFr, locale: 'en', slug: 'who-decides-the-water', titre: 'Who decides the water?' },
      'Five tiers decide the water.'
    )
  );

  return racine;
}

/** La surcharge de reference : chaque champ tenu, tous DIFFERENTS du repli. */
const SEO_ARTICLE = {
  metaTitre: 'Eau du plateau : les cinq echelons',
  metaDescription: 'Qui decide, qui paie, qui arbitre — la chaine de decision en clair.',
  canonique: 'https://exemple.test/dossier/l-eau-du-plateau',
  noindex: false,
  imagePartage: 'partage/A05-og.png',
  /* A-04 amende : la surcharge localisee de l alternative de la carte. Elle figure ici
     parce que cette constante enumere le composant ENTIER — c est ce qui fait que ce
     test voit un champ nouvellement ajoute plutot que de l ignorer. */
  alternativePartage: 'Sharing card: five tiers of decision, one bill',
};

/* ------------------------------------------------------------------ */
/* 1. La valeur renseignee ARRIVE — sur les trois familles du modele    */
/* ------------------------------------------------------------------ */

test('la surcharge seo d un ARTICLE traverse le chargement du corpus', () => {
  const racine = ecrireCorpus((c) => {
    c.articleFr.seo = SEO_ARTICLE;
  });
  const corpus = chargerCorpus(racine);

  assert.deepEqual(corpus.articles[0].fr.seo, SEO_ARTICLE);
});

test('la surcharge seo d une CATEGORIE traverse le chargement, locale par locale', () => {
  const racine = ecrireCorpus((c) => {
    c.categories[0].fr.seo = { metaTitre: 'Amenagement du plateau' };
    c.categories[0].en.seo = { metaTitre: 'Planning the plateau' };
  });
  const corpus = chargerCorpus(racine);

  assert.equal(corpus.categories[0].fr.seo?.metaTitre, 'Amenagement du plateau');
  assert.equal(corpus.categories[0].en?.seo?.metaTitre, 'Planning the plateau');
});

test('la surcharge seo d un DOSSIER traverse le chargement', () => {
  const racine = ecrireCorpus((c) => {
    c.dossiers[0].fr.seo = { metaDescription: 'Cinq echelons, une facture.', noindex: true };
  });
  const corpus = chargerCorpus(racine);

  assert.equal(corpus.dossiers[0].fr.seo?.noindex, true);
  assert.equal(corpus.dossiers[0].fr.seo?.metaDescription, 'Cinq echelons, une facture.');
});

/* ------------------------------------------------------------------ */
/* 2. L absence reste une absence — A-07                                */
/* ------------------------------------------------------------------ */

test('sans surcharge, aucun seo n est FABRIQUE au chargement (A-07)', () => {
  const corpus = chargerCorpus(ecrireCorpus());

  assert.equal(corpus.articles[0].fr.seo, undefined);
  assert.equal(corpus.categories[0].fr.seo, undefined);
  assert.equal(corpus.dossiers[0].fr.seo, undefined);
});

/* ------------------------------------------------------------------ */
/* 3. Ce qui est refuse — bruyamment                                    */
/* ------------------------------------------------------------------ */

test('un seo pose sur un AUTEUR est refuse, pas ignore (A-08)', () => {
  const racine = ecrireCorpus((c) => {
    c.auteurs[0].fr.seo = { metaTitre: 'Hakim Zerrouki, reporter' };
  });

  assert.throws(
    () => chargerCorpus(racine),
    (e: unknown) => {
      assert.ok(e instanceof ErreurCorpus, 'doit etre une ErreurCorpus');
      assert.match((e as Error).message, /A-08/);
      return true;
    }
  );
});

test('un seo pose sur un TAG est refuse, pas ignore (A-08)', () => {
  const racine = ecrireCorpus((c) => {
    c.tags[0].fr.seo = { metaTitre: 'Eau' };
  });

  assert.throws(
    () => chargerCorpus(racine),
    (e: unknown) => {
      assert.ok(e instanceof ErreurCorpus, 'doit etre une ErreurCorpus');
      assert.match((e as Error).message, /A-08/);
      return true;
    }
  );
});

test('un metaTitre au-dela de 60 est refuse a la LECTURE, pas par Strapi a l ecriture', () => {
  const racine = ecrireCorpus((c) => {
    c.articleFr.seo = { metaTitre: 'x'.repeat(61) };
  });

  assert.throws(
    () => chargerCorpus(racine),
    (e: unknown) => {
      assert.match((e as Error).message, /metaTitre/);
      assert.match((e as Error).message, /60/);
      return true;
    }
  );
});

test('une metaDescription au-dela de 160 est refusee a la lecture', () => {
  const racine = ecrireCorpus((c) => {
    c.articleFr.seo = { metaDescription: 'x'.repeat(161) };
  });

  assert.throws(() => chargerCorpus(racine), /metaDescription/);
});

test('un noindex non booleen est refuse — un « true » texte n est pas un vrai', () => {
  const racine = ecrireCorpus((c) => {
    c.articleFr.seo = { noindex: 'true' };
  });

  assert.throws(() => chargerCorpus(racine), /noindex/);
});

test('une canonique relative est refusee — A-27 exige une URL absolue', () => {
  const racine = ecrireCorpus((c) => {
    c.articleFr.seo = { canonique: '/dossier/l-eau-du-plateau' };
  });

  assert.throws(() => chargerCorpus(racine), /canonique/);
});

test('une imagePartage absente du manifeste est refusee comme tout autre media', () => {
  const racine = ecrireCorpus((c) => {
    c.articleFr.seo = { imagePartage: 'partage/inexistante.png' };
  });

  assert.throws(
    () => chargerCorpus(racine),
    (e: unknown) => {
      assert.ok(e instanceof ErreurCorpus || e instanceof MediaIntrouvable);
      assert.match((e as Error).message, /partage\/inexistante\.png/);
      return true;
    }
  );
});

test('une cle inconnue dans seo est refusee — sinon la faute de frappe est muette', () => {
  const racine = ecrireCorpus((c) => {
    c.articleFr.seo = { metaTitle: 'faute de frappe anglaise' };
  });

  assert.throws(() => chargerCorpus(racine), /metaTitle/);
});

/* ------------------------------------------------------------------ */
/* 4. Le corpus REEL porte la preuve des deux chemins                   */
/* ------------------------------------------------------------------ */

test('le corpus reel porte au moins une surcharge par famille, et un noindex vrai', () => {
  const corpus = chargerCorpus(path.join(import.meta.dirname, '..', 'data'));

  const surchargees = {
    article: corpus.articles.filter((a) => a.fr.seo !== undefined),
    categorie: corpus.categories.filter((c) => c.fr.seo !== undefined),
    dossier: corpus.dossiers.filter((d) => d.fr.seo !== undefined),
  };

  for (const [famille, entrees] of Object.entries(surchargees)) {
    assert.ok(entrees.length > 0, `aucune surcharge seo sur la famille ${famille}`);
  }

  const avecNoindex = [
    ...corpus.articles.map((a) => a.fr.seo),
    ...corpus.categories.map((c) => c.fr.seo),
    ...corpus.dossiers.map((d) => d.fr.seo),
  ].filter((s) => s?.noindex === true);
  assert.ok(avecNoindex.length > 0, 'aucune entree noindex:true — le champ le plus couteux');

  // L autre chemin doit rester exerce : si TOUT etait surcharge, le repli calcule
  // ne sortirait plus nulle part et on ne prouverait qu une moitie.
  assert.ok(
    corpus.articles.some((a) => a.fr.seo === undefined),
    'plus aucun article sans surcharge — le repli calcule n est plus exerce'
  );
});
