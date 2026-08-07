/**
 * Harnais de rupture de schema Strapi (R4 du brief : « Strapi bouge pendant le projet »).
 *
 * Ce n est PAS un test de forme. Chaque cas « champ disparu » retire un champ d une
 * reponse representative et exige que le mapping LEVE une erreur, au lieu de rendre
 * un `undefined` qui traverserait silencieusement le build jusqu au HTML.
 *
 * Les fixtures sont derivees champ par champ des schemas reels d `apps/cms`
 * (5 collections + 8 blocs + 2 components + Configuration), pas d une reponse
 * inventee : la base de `echoback.ayfiweb.fr` etait vide au 2026-08-07.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  mapperArticle,
  mapperAuteur,
  mapperCategorie,
  mapperTag,
  mapperDossier,
  mapperConfiguration,
} from '../src/lib/strapi/mapping.ts';
import { ChampManquantError } from '../src/lib/strapi/erreurs.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));

function fixture(nom: string): any {
  return JSON.parse(fs.readFileSync(path.join(ICI, 'fixtures', `${nom}.json`), 'utf8'));
}

/** Copie profonde, pour qu un cas de mutation ne contamine pas le suivant. */
function copie<T>(valeur: T): T {
  return JSON.parse(JSON.stringify(valeur));
}

/** Retire le champ designe par un chemin pointe (`imageCouverture.url`, `contenu.0.texte`). */
function sansChamp<T>(racine: T, chemin: string): T {
  const clone: any = copie(racine);
  const segments = chemin.split('.');
  const derniere = segments.pop() as string;
  let curseur: any = clone;
  for (const segment of segments) curseur = curseur[segment];
  assert.ok(
    curseur !== undefined && derniere in curseur,
    `fixture invalide : le chemin « ${chemin} » n existe pas, le cas de test ne prouverait rien`,
  );
  delete curseur[derniere];
  return clone;
}

const ARTICLES = fixture('articles-fr');
const AUTEURS = fixture('auteurs-fr');
const CATEGORIES = fixture('categories-fr');
const TAGS = fixture('tags-fr');
const DOSSIERS = fixture('dossiers-fr');
const CONFIGURATION = fixture('configuration-fr');

const articleComplet = () => copie(ARTICLES.data[0]);
const articleMinimal = () => copie(ARTICLES.data[1]);

// ---------------------------------------------------------------------------
// Article — cas nominal
// ---------------------------------------------------------------------------

test('mapperArticle traduit une entree complete en entite de domaine', () => {
  const article = mapperArticle(articleComplet());

  assert.equal(article.documentId, 'art0000000000000000001');
  assert.equal(article.locale, 'fr');
  assert.equal(article.slug, 'viaduc-rouvre-apres-dix-huit-mois-de-travaux');
  assert.equal(article.titre, 'Le viaduc rouvre apres dix-huit mois de travaux');
  assert.equal(article.aLaUne, true);
  assert.equal(article.datePublication, '2026-03-04T07:30:00.000Z');
  assert.equal(article.legendeCouverture, 'Le viaduc au petit matin, le jour de sa reouverture.');

  assert.equal(article.imageCouverture.url, '/uploads/viaduc_aube_8f2c1a.jpg');
  assert.equal(article.imageCouverture.largeur, 2400);
  assert.equal(
    article.imageCouverture.alternative,
    'Un viaduc de pierre enjambant une vallee dans la brume',
  );

  assert.equal(article.auteur.slug, 'camille-ferrand');
  assert.equal(article.categorie.slug, 'amenagement');
  assert.equal(article.categorie.couleurAccent, '#1f6f4a');
  assert.deepEqual(
    article.tags.map((t) => t.slug),
    ['mobilite', 'travaux'],
  );
  assert.equal(article.dossier?.slug, 'la-vallee-se-reconstruit');
});

test('mapperArticle rend les optionnels a null ou vide, sans lever', () => {
  const article = mapperArticle(articleMinimal());

  assert.equal(article.legendeCouverture, null);
  assert.equal(article.dossier, null);
  assert.equal(article.seo, null);
  assert.deepEqual(article.tags, []);
  assert.deepEqual(article.articlesLies, []);
  assert.deepEqual(article.localisations, []);
});

test('mapperArticle tronque articlesLies a 3 (troncature defensive au build, A-13)', () => {
  const brut = articleComplet();
  assert.equal(brut.articlesLies.length, 4, 'la fixture doit en porter 4 pour que le cas prouve quelque chose');

  const article = mapperArticle(brut);
  assert.equal(article.articlesLies.length, 3);
  assert.deepEqual(
    article.articlesLies.map((a) => a.slug),
    ['ce-que-le-chantier-a-coute', 'les-riverains-font-le-bilan', 'le-calendrier-des-prochains-ouvrages'],
  );
});

// ---------------------------------------------------------------------------
// Article — i18n : le slug n est PAS partage entre locales
// ---------------------------------------------------------------------------

test('mapperArticle conserve le slug PROPRE de chaque localisation', () => {
  const article = mapperArticle(articleComplet());

  assert.equal(article.localisations.length, 1);
  const en = article.localisations[0]!;
  assert.equal(en.locale, 'en');
  assert.equal(en.slug, 'viaduct-reopens-after-eighteen-months-of-works');
  assert.notEqual(en.slug, article.slug, 'un slug EN egal au slug FR trahirait une derivation par prefixage');
  assert.equal(en.documentId, article.documentId, 'les localisations d un document partagent son documentId');
});

test('mapperCategorie conserve un slug EN distinct du slug FR (uid localise d office)', () => {
  const categorie = mapperCategorie(copie(CATEGORIES.data[0]));
  assert.equal(categorie.slug, 'amenagement');
  assert.equal(categorie.localisations[0]?.slug, 'planning-and-development');
});

// ---------------------------------------------------------------------------
// Article — les 8 blocs de la Dynamic Zone
// ---------------------------------------------------------------------------

test('mapperArticle traduit les 8 types de blocs, dans l ordre de saisie', () => {
  const article = mapperArticle(articleComplet());

  assert.deepEqual(
    article.contenu.map((bloc) => bloc.type),
    [
      'bloc.texte',
      'bloc.citation',
      'bloc.galerie',
      'bloc.encadre',
      'bloc.video',
      'bloc.image-legendee',
      'bloc.separateur',
      'bloc.chiffres-cles',
    ],
  );

  const citation = article.contenu[1];
  assert.equal(citation.type, 'bloc.citation');
  if (citation.type === 'bloc.citation') {
    assert.equal(citation.auteurCitation, 'Helene Bouvier');
    assert.equal(citation.source, 'commercante, place du Marche');
  }

  const galerie = article.contenu[2];
  if (galerie.type === 'bloc.galerie') {
    assert.equal(galerie.disposition, 'grille');
    assert.equal(galerie.images.length, 2);
    assert.equal(galerie.images[0]!.url, '/uploads/galerie_1_aa11.jpg');
  }

  const video = article.contenu[4];
  if (video.type === 'bloc.video') {
    assert.equal(video.url, 'https://www.youtube.com/watch?v=aaaaaaaaaaa');
    assert.equal(video.vignette?.url, '/uploads/vignette_video_cc33.jpg');
  }

  const chiffres = article.contenu[7];
  if (chiffres.type === 'bloc.chiffres-cles') {
    assert.equal(chiffres.entrees.length, 3);
    assert.deepEqual(chiffres.entrees[2], { valeur: '1 sur 4', unite: null, libelle: 'habitants concernes' });
  }
});

test('mapperArticle refuse un bloc dont le __component est inconnu du modele', () => {
  const brut = articleComplet();
  brut.contenu[0].__component = 'bloc.carrousel-3d';
  assert.throws(() => mapperArticle(brut), /bloc\.carrousel-3d/);
});

// ---------------------------------------------------------------------------
// LE HARNAIS : un champ qui disparait de la reponse Strapi doit CASSER
// ---------------------------------------------------------------------------

const CHAMPS_ARTICLE = [
  'documentId',
  'locale',
  'titre',
  'slug',
  'chapo',
  'contenu',
  'imageCouverture',
  'legendeCouverture',
  'auteur',
  'categorie',
  'tags',
  'dossier',
  'articlesLies',
  'datePublication',
  'aLaUne',
  'seo',
  'updatedAt',
  'publishedAt',
  'localizations',
];

for (const champ of CHAMPS_ARTICLE) {
  test(`Article : la disparition du champ « ${champ} » fait echouer le mapping`, () => {
    assert.throws(
      () => mapperArticle(sansChamp(articleComplet(), champ)),
      (erreur: unknown) => erreur instanceof ChampManquantError && String(erreur.message).includes(champ),
      `le champ « ${champ} » peut disparaitre de la reponse Strapi sans que rien ne le detecte`,
    );
  });
}

const CHAMPS_IMBRIQUES_ARTICLE = [
  'imageCouverture.url',
  'imageCouverture.alternativeText',
  'imageCouverture.width',
  'imageCouverture.height',
  'auteur.nom',
  'auteur.slug',
  'categorie.nom',
  'categorie.slug',
  'categorie.couleurAccent',
  'tags.0.nom',
  'tags.0.slug',
  'dossier.titre',
  'dossier.slug',
  'articlesLies.0.titre',
  'articlesLies.0.slug',
  'articlesLies.0.imageCouverture',
  'seo.metaTitre',
  'seo.metaDescription',
  'seo.noindex',
  'seo.canonique',
  'seo.imagePartage',
  'localizations.0.locale',
  'localizations.0.slug',
  'contenu.0.contenu',
  'contenu.1.texte',
  'contenu.1.auteurCitation',
  'contenu.2.images',
  'contenu.2.disposition',
  'contenu.2.legende',
  'contenu.3.contenu',
  'contenu.3.variante',
  'contenu.4.url',
  'contenu.4.vignette',
  'contenu.5.image',
  'contenu.5.credit',
  'contenu.6.style',
  'contenu.7.entrees',
];

for (const chemin of CHAMPS_IMBRIQUES_ARTICLE) {
  test(`Article : la disparition de « ${chemin} » fait echouer le mapping`, () => {
    assert.throws(
      () => mapperArticle(sansChamp(articleComplet(), chemin)),
      ChampManquantError,
      `« ${chemin} » peut disparaitre de la reponse Strapi sans que rien ne le detecte`,
    );
  });
}

// ---------------------------------------------------------------------------
// Auteur, Categorie, Tag, Dossier, Configuration — nominal + harnais
// ---------------------------------------------------------------------------

test('mapperAuteur traduit une entree complete', () => {
  const auteur = mapperAuteur(copie(AUTEURS.data[0]));
  assert.equal(auteur.slug, 'camille-ferrand');
  assert.equal(auteur.fonction, 'Cheffe de rubrique Amenagement');
  assert.equal(auteur.photo?.url, '/uploads/portrait_camille_ff66.jpg');
  assert.deepEqual(
    auteur.reseaux.map((r) => r.plateforme),
    ['linkedin', 'site'],
  );
  assert.ok(Array.isArray(auteur.bio));
});

test('mapperAuteur rend les optionnels a null sans lever', () => {
  const auteur = mapperAuteur(copie(AUTEURS.data[1]));
  assert.equal(auteur.fonction, null);
  assert.equal(auteur.photo, null);
  assert.equal(auteur.bio, null);
  assert.deepEqual(auteur.reseaux, []);
});

test('mapperAuteur refuse une plateforme hors de l enum ferme (A-30)', () => {
  const brut = copie(AUTEURS.data[0]);
  brut.reseaux[0].plateforme = 'threads';
  assert.throws(() => mapperAuteur(brut), /threads/);
});

for (const champ of ['documentId', 'locale', 'nom', 'slug', 'fonction', 'bio', 'photo', 'reseaux', 'updatedAt', 'localizations']) {
  test(`Auteur : la disparition du champ « ${champ} » fait echouer le mapping`, () => {
    assert.throws(() => mapperAuteur(sansChamp(copie(AUTEURS.data[0]), champ)), ChampManquantError);
  });
}

test('mapperCategorie traduit une entree complete', () => {
  const categorie = mapperCategorie(copie(CATEGORIES.data[0]));
  assert.equal(categorie.nom, 'Amenagement');
  assert.equal(categorie.ordreAffichage, 10);
  assert.equal(categorie.couleurAccent, '#1f6f4a');
  assert.equal(categorie.imageHero?.url, '/uploads/hero_amenagement_ee55.jpg');
  assert.equal(categorie.seo?.metaTitre, 'Amenagement');
});

test('mapperCategorie refuse une couleurAccent qui ne respecte pas la regex A-15', () => {
  const brut = copie(CATEGORIES.data[0]);
  brut.couleurAccent = '#abc';
  assert.throws(() => mapperCategorie(brut), /couleurAccent/);
});

for (const champ of [
  'documentId',
  'locale',
  'nom',
  'slug',
  'description',
  'couleurAccent',
  'imageHero',
  'ordreAffichage',
  'seo',
  'updatedAt',
  'localizations',
]) {
  test(`Categorie : la disparition du champ « ${champ} » fait echouer le mapping`, () => {
    assert.throws(() => mapperCategorie(sansChamp(copie(CATEGORIES.data[0]), champ)), ChampManquantError);
  });
}

test('mapperTag traduit une entree complete', () => {
  const tag = mapperTag(copie(TAGS.data[0]));
  assert.equal(tag.nom, 'Mobilite');
  assert.equal(tag.slug, 'mobilite');
  assert.equal(tag.localisations[0]?.slug, 'mobility');
});

for (const champ of ['documentId', 'locale', 'nom', 'slug', 'updatedAt', 'localizations']) {
  test(`Tag : la disparition du champ « ${champ} » fait echouer le mapping`, () => {
    assert.throws(() => mapperTag(sansChamp(copie(TAGS.data[0]), champ)), ChampManquantError);
  });
}

test('mapperDossier traduit une entree complete, articles tries par datePublication croissante (A-18)', () => {
  const dossier = mapperDossier(copie(DOSSIERS.data[0]));
  assert.equal(dossier.titre, 'La vallee se reconstruit');
  assert.equal(dossier.dateOuverture, '2026-02-01');
  assert.equal(dossier.articles.length, 1);
  assert.equal(dossier.articles[0]!.slug, 'viaduc-rouvre-apres-dix-huit-mois-de-travaux');
});

for (const champ of [
  'documentId',
  'locale',
  'titre',
  'slug',
  'introduction',
  'imageHero',
  'articles',
  'dateOuverture',
  'seo',
  'updatedAt',
  'localizations',
]) {
  test(`Dossier : la disparition du champ « ${champ} » fait echouer le mapping`, () => {
    assert.throws(() => mapperDossier(sansChamp(copie(DOSSIERS.data[0]), champ)), ChampManquantError);
  });
}

test('mapperConfiguration traduit le Single Type', () => {
  const configuration = mapperConfiguration(copie(CONFIGURATION.data));
  assert.equal(configuration.nomSite, 'L Echo des Hauts');
  assert.equal(configuration.baseline, 'Le journal de la vallee');
  assert.equal(configuration.logo.url, '/uploads/logo_clair_3344.svg');
  assert.equal(configuration.logoSombre?.url, '/uploads/logo_sombre_5566.svg');
  assert.equal(configuration.imagePartageDefaut.url, '/uploads/partage_defaut_99aa.jpg');
  // La fixture porte les HUIT valeurs de l enum A-30 depuis le 2026-08-07 : c est ce qui
  // fait passer les sept glyphes et le repli textuel de Facebook dans la preuve de rendu.
  assert.deepEqual(
    configuration.reseaux.map((r) => r.plateforme),
    ['mastodon', 'bluesky', 'linkedin', 'x', 'instagram', 'youtube', 'facebook', 'site'],
  );
  assert.ok(Array.isArray(configuration.mentionsLegales));
});

for (const champ of [
  'documentId',
  'locale',
  'nomSite',
  'baseline',
  'logo',
  'logoSombre',
  'favicon',
  'descriptionDefaut',
  'imagePartageDefaut',
  'reseaux',
  'texteFooter',
  'mentionsLegales',
  'updatedAt',
]) {
  test(`Configuration : la disparition du champ « ${champ} » fait echouer le mapping`, () => {
    assert.throws(() => mapperConfiguration(sansChamp(copie(CONFIGURATION.data), champ)), ChampManquantError);
  });
}

test('un champ requis passe a null est refuse, la ou un optionnel a null est accepte', () => {
  const brut = articleComplet();
  brut.titre = null;
  assert.throws(() => mapperArticle(brut), /titre/);

  const autre = articleComplet();
  autre.legendeCouverture = null;
  assert.equal(mapperArticle(autre).legendeCouverture, null);
});
