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
import { ChampManquantError, ValeurInattendueError } from '../src/lib/strapi/erreurs.ts';

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
  'imageCouverture.caption',
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
  /* Depuis le 2026-08-19, l alternative vit DANS l entree de l image. Ces deux chemins
     remplacent `contenu.2.alternatives` : c est l entree qui doit se voir disparaitre,
     plus une table posee a cote et jointe par l url du fichier. */
  'contenu.2.images.0.image',
  'contenu.2.images.0.alternative',
  'contenu.2.disposition',
  'contenu.2.legende',
  'contenu.3.contenu',
  'contenu.3.variante',
  'contenu.4.url',
  'contenu.4.vignette',
  'contenu.4.alternativeVignette',
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

/**
 * Le CREDIT du portrait vient du `caption` NATIF de la mediatheque, et de nulle part
 * ailleurs (plan editorial §6.5, et §13 point 6b tranche le 2026-08-03 : la page auteur
 * l affiche sous l image). Ce test l ancre sur la valeur de la fixture plutot que sur une
 * chaine recopiee ici : une copie de plus est exactement ce que la decision (ii) a ecarte
 * en refusant un champ `credit` sur `Auteur`.
 */
test('mapperAuteur lit le credit du portrait dans le `caption` natif, pas ailleurs', () => {
  const brut = copie(AUTEURS.data[0]);
  const auteur = mapperAuteur(brut);

  assert.equal(auteur.photo?.legende, brut.photo.caption);
  assert.notEqual(
    auteur.photo?.legende,
    brut.photo.alternativeText,
    'le credit n est pas l alternative textuelle (A-04) : deux champs, deux fonctions',
  );
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

for (const champ of [
  'documentId',
  'locale',
  'nom',
  'slug',
  'fonction',
  'bio',
  'photo',
  // Le credit affiche sous le portrait : s il disparait du populate, le build casse ici,
  // pas silencieusement sur une page auteur rendue sans attribution (§6.3, D.4).
  'photo.caption',
  'reseaux',
  'updatedAt',
  'localizations',
]) {
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

// ---------------------------------------------------------------------------
// Une chaine faite de BLANCS est vide a l ecran, et doit l etre pour le mapping
// ---------------------------------------------------------------------------

/**
 * Le defaut que ces cas ferment (decouvert le 2026-08-11) : `texteRequis` ne refusait
 * que `valeur.length === 0`. Une chaine d espaces, de tabulations ou d une espace
 * insecable la traversait sans un mot — et sortait en `<h1>` visuellement vide, en
 * `<title>` vide, en `headline` vide dans le JSON-LD, avec un build VERT. C est
 * exactement le mode d echec que `erreurs.ts` dit fermer (« le build reste vert et le
 * site ment »), sur la moitie des champs qu il couvre.
 *
 * Le critere n est PAS « ce que `trim()` enleve ». Deux raisons de ne pas s y fier :
 *   1. `trim()` suit la grammaire `WhiteSpace` d ECMAScript — elle couvre bien U+00A0
 *      (mesure du 2026-08-11, Node 24), mais la faire dependre d une regle de langage
 *      quand ce qu on juge est un RENDU est un raccourci qui se paiera ;
 *   2. elle laisse passer les caracteres de LARGEUR NULLE — U+200B, U+200C, U+2060 ne
 *      sont pas de la categorie Zs, `trim()` ne les enleve pas, et ils n affichent
 *      pourtant RIEN. Un titre a "​" est aussi vide a l ecran qu un titre a " ".
 * D ou l alphabet explicite de `lecture.ts`, teste caractere par caractere ci-dessous.
 */
const BLANCS: ReadonlyArray<readonly [string, string]> = [
  ['trois espaces ordinaires', '   '],
  ['une tabulation', '\t'],
  ['un saut de ligne', '\n'],
  ['une espace INSECABLE U+00A0', ' '],
  ['une espace insecable etroite U+202F', ' '],
  ['une espace cadratin U+2000', ' '],
  ['une espace ideographique U+3000', '　'],
  ['une espace de largeur NULLE U+200B', '​'],
  ['un liant de largeur nulle U+2060', '⁠'],
  ['une marque d ordre d octets U+FEFF', '﻿'],
  ['un melange espace + insecable + tabulation', '  \t'],
];

/**
 * Les champs que `texteRequis` gouverne et qui SORTENT a l ecran ou dans une balise.
 * Chacun est atteint par son mapper reel : ce qui est prouve ici est la chaine complete
 * reponse Strapi → entite de domaine, pas le comportement isole d une fonction.
 */
const CHAMPS_TEXTE_REQUIS: ReadonlyArray<{
  readonly intitule: string;
  readonly poser: (valeur: string) => () => unknown;
}> = [
  { intitule: 'article.titre', poser: (v) => () => { const b = articleComplet(); b.titre = v; return mapperArticle(b); } },
  { intitule: 'article.chapo', poser: (v) => () => { const b = articleComplet(); b.chapo = v; return mapperArticle(b); } },
  { intitule: 'article.auteur.nom', poser: (v) => () => { const b = articleComplet(); b.auteur.nom = v; return mapperArticle(b); } },
  { intitule: 'article.categorie.nom', poser: (v) => () => { const b = articleComplet(); b.categorie.nom = v; return mapperArticle(b); } },
  { intitule: 'article.tags[0].nom', poser: (v) => () => { const b = articleComplet(); b.tags[0].nom = v; return mapperArticle(b); } },
  { intitule: 'article.dossier.titre', poser: (v) => () => { const b = articleComplet(); b.dossier.titre = v; return mapperArticle(b); } },
  { intitule: 'article.articlesLies[0].titre', poser: (v) => () => { const b = articleComplet(); b.articlesLies[0].titre = v; return mapperArticle(b); } },
  { intitule: 'article.articlesLies[0].chapo', poser: (v) => () => { const b = articleComplet(); b.articlesLies[0].chapo = v; return mapperArticle(b); } },
  { intitule: 'bloc.citation.texte', poser: (v) => () => { const b = articleComplet(); b.contenu[1].texte = v; return mapperArticle(b); } },
  { intitule: 'bloc.video.url', poser: (v) => () => { const b = articleComplet(); b.contenu[4].url = v; return mapperArticle(b); } },
  { intitule: 'bloc.chiffres-cles.valeur', poser: (v) => () => { const b = articleComplet(); b.contenu[7].entrees[0].valeur = v; return mapperArticle(b); } },
  { intitule: 'bloc.chiffres-cles.libelle', poser: (v) => () => { const b = articleComplet(); b.contenu[7].entrees[0].libelle = v; return mapperArticle(b); } },
  { intitule: 'auteur.nom', poser: (v) => () => { const b = copie(AUTEURS.data[0]); b.nom = v; return mapperAuteur(b); } },
  { intitule: 'categorie.nom', poser: (v) => () => { const b = copie(CATEGORIES.data[0]); b.nom = v; return mapperCategorie(b); } },
  { intitule: 'tag.nom', poser: (v) => () => { const b = copie(TAGS.data[0]); b.nom = v; return mapperTag(b); } },
  { intitule: 'dossier.titre', poser: (v) => () => { const b = copie(DOSSIERS.data[0]); b.titre = v; return mapperDossier(b); } },
  { intitule: 'configuration.nomSite', poser: (v) => () => { const b = copie(CONFIGURATION.data); b.nomSite = v; return mapperConfiguration(b); } },
  { intitule: 'configuration.descriptionDefaut', poser: (v) => () => { const b = copie(CONFIGURATION.data); b.descriptionDefaut = v; return mapperConfiguration(b); } },
  { intitule: 'partage.lien-social.url', poser: (v) => () => { const b = copie(CONFIGURATION.data); b.reseaux[0].url = v; return mapperConfiguration(b); } },
];

for (const { intitule, poser } of CHAMPS_TEXTE_REQUIS) {
  for (const [nomDuBlanc, blanc] of BLANCS) {
    test(`« ${intitule} » rempli de ${nomDuBlanc} est REFUSE`, () => {
      assert.throws(poser(blanc), ValeurInattendueError);
    });
  }
}

test('l erreur NOMME le champ fautif, pas seulement le fait qu il soit vide', () => {
  const brut = articleComplet();
  brut.titre = ' ';
  assert.throws(
    () => mapperArticle(brut),
    (erreur: unknown) => {
      assert.ok(erreur instanceof ValeurInattendueError);
      assert.equal(erreur.chemin, 'article.titre', 'le chemin doit designer le champ fautif');
      assert.match(erreur.message, /article\.titre/);
      return true;
    },
  );
});

test('un blanc invisible se laisse LIRE dans le message, jamais devine', () => {
  const brut = articleComplet();
  brut.titre = '  \t';
  try {
    mapperArticle(brut);
    assert.fail('le mapping aurait du lever');
  } catch (erreur) {
    assert.ok(erreur instanceof ValeurInattendueError);
    // Un message qui rendrait « chaine non vide attendue, recu "  " » laisserait le
    // lecteur compter des pixels. Les points de code sont echappes.
    assert.match(erreur.message, /u00a0/i, 'l espace insecable doit apparaitre echappe');
    assert.match(erreur.message, /blancs?|invisible/i, 'le message doit dire POURQUOI c est refuse');
  }
});

test('les espaces INTERNES restent legitimes — la garde ne touche pas au contenu reel', () => {
  const brut = articleComplet();
  // Espaces ordinaires, espace insecable avant un « : » et dans un nombre : de la
  // typographie francaise correcte, pas un champ vide.
  brut.titre = 'Le viaduc : 18 000 jours de travaux';
  assert.equal(mapperArticle(brut).titre, 'Le viaduc : 18 000 jours de travaux');

  const bordure = articleComplet();
  // Un blanc de BORDURE sur une valeur reelle n est pas un champ vide : on refuse le
  // champ vide, on ne se met pas a normaliser le contenu d autrui.
  bordure.chapo = '  Un chapo bien reel.  ';
  assert.equal(mapperArticle(bordure).chapo, '  Un chapo bien reel.  ');
});

test('un optionnel rempli de blancs n est PAS remonte en erreur (il n a rien a garantir)', () => {
  const brut = articleComplet();
  brut.legendeCouverture = '   ';
  assert.doesNotThrow(() => mapperArticle(brut));
});

// ---------------------------------------------------------------------------
// Un OPTIONNEL rempli de blancs vaut ABSENT, jamais une valeur
// ---------------------------------------------------------------------------

/**
 * Le defaut que ces cas ferment (tache `63012582`, mesure du 2026-08-11) :
 * `texteOptionnel` ne ramenait a `null` que la chaine STRICTEMENT vide. Un
 * `alternativeText` a `"   "` la traversait, et le rendu servait `alt="   "`.
 *
 * Ce n est pas le meme defaut que celui de `texteRequis`, et c est pour ca qu il
 * survit a sa correction : un `<h1>` vide se VOIT a l ecran, un `alt` fait de blancs
 * ne se voit nulle part. Pire, il PASSE les gardes : axe-core exige un `alt` non nul,
 * il en trouve un — trois espaces sont une alternative textuelle a ses yeux. La garde
 * reste verte sur une image qui n a plus aucune alternative. C est exactement la
 * symetrie de « graphique en barres » (tache `face261a`) : une alternative PRESENTE
 * et INUTILE, la ou `alt=""` aurait au moins la valeur d une DECLARATION.
 *
 * Branche retenue : NORMALISER en absent, pas refuser. Trois raisons, dans l ordre.
 *
 *  1. `texteOptionnel` normalise DEJA : `''` rend `null` depuis l origine. Ce qui est
 *     etendu ici est l alphabet du vide, pas la nature de la fonction. `texteRequis`,
 *     lui, refuse et ne normalise jamais — les deux contrats different par
 *     construction, il n y a donc aucune asymetrie a justifier.
 *  2. Un champ optionnel a le DROIT d etre absent. Rougir un build entier parce qu un
 *     editeur a laisse une espace dans une legende ferait payer a la publication le
 *     prix d une coquille, sur un champ dont le schema dit qu il peut ne rien valoir.
 *  3. `null` est precisement ce qui declenche le repli documente de chaque
 *     consommateur : `alt=""` (image decorative, forme reconnue par axe-core),
 *     `<figcaption>` non emis, `metaTitre` retombant sur le titre, canonique
 *     recalculee. Rendre la chaine de blancs, au contraire, force chaque consommateur
 *     a servir un attribut ou une balise qui ne porte rien.
 *
 * Ce que cette branche COUTE, et qu il faut ecrire plutot que taire : la lecture
 * cesse de distinguer « champ laisse vide » de « champ rempli de blancs par erreur ».
 * Un defaut de saisie devient donc indiscernable d une absence voulue. Ce trou n est
 * pas laisse ouvert, il est ferme A L ECRITURE par la garde de corpus du seed, qui
 * refuse un `alternativeText` blanc sur le meme alphabet (`apps/cms/scripts/seed/
 * corpus.ts`). Refuser a l entree, etre honnete a la sortie.
 */
const CHAMPS_TEXTE_OPTIONNEL: ReadonlyArray<{
  readonly intitule: string;
  readonly poser: (valeur: string) => unknown;
}> = [
  { intitule: 'article.imageCouverture.alternativeText', poser: (v) => { const b = articleComplet(); b.imageCouverture.alternativeText = v; return mapperArticle(b).imageCouverture.alternative; } },
  { intitule: 'article.imageCouverture.caption', poser: (v) => { const b = articleComplet(); b.imageCouverture.caption = v; return mapperArticle(b).imageCouverture.legende; } },
  { intitule: 'article.legendeCouverture', poser: (v) => { const b = articleComplet(); b.legendeCouverture = v; return mapperArticle(b).legendeCouverture; } },
  { intitule: 'article.seo.metaTitre', poser: (v) => { const b = articleComplet(); b.seo.metaTitre = v; return mapperArticle(b).seo!.metaTitre; } },
  { intitule: 'article.seo.metaDescription', poser: (v) => { const b = articleComplet(); b.seo.metaDescription = v; return mapperArticle(b).seo!.metaDescription; } },
  { intitule: 'article.seo.canonique', poser: (v) => { const b = articleComplet(); b.seo.canonique = v; return mapperArticle(b).seo!.canonique; } },
  { intitule: 'bloc.citation.auteurCitation', poser: (v) => { const b = articleComplet(); b.contenu[1].auteurCitation = v; return (mapperArticle(b).contenu[1] as any).auteurCitation; } },
  { intitule: 'bloc.citation.source', poser: (v) => { const b = articleComplet(); b.contenu[1].source = v; return (mapperArticle(b).contenu[1] as any).source; } },
  { intitule: 'bloc.galerie.legende', poser: (v) => { const b = articleComplet(); b.contenu[2].legende = v; return (mapperArticle(b).contenu[2] as any).legende; } },
  { intitule: 'bloc.galerie.images[0].image.alternativeText', poser: (v) => { const b = articleComplet(); b.contenu[2].images[0].image.alternativeText = v; return (mapperArticle(b).contenu[2] as any).images[0].alternative; } },
  { intitule: 'bloc.galerie.images[0].alternative', poser: (v) => { const b = articleComplet(); b.contenu[2].images[0].image.alternativeText = null; b.contenu[2].images[0].alternative = v; return (mapperArticle(b).contenu[2] as any).images[0].alternative; } },
  { intitule: 'bloc.encadre.titre', poser: (v) => { const b = articleComplet(); b.contenu[3].titre = v; return (mapperArticle(b).contenu[3] as any).titre; } },
  { intitule: 'bloc.video.legende', poser: (v) => { const b = articleComplet(); b.contenu[4].legende = v; return (mapperArticle(b).contenu[4] as any).legende; } },
  { intitule: 'bloc.image-legendee.image.alternativeText', poser: (v) => { const b = articleComplet(); b.contenu[5].image.alternativeText = v; return (mapperArticle(b).contenu[5] as any).image.alternative; } },
  { intitule: 'bloc.image-legendee.legende', poser: (v) => { const b = articleComplet(); b.contenu[5].legende = v; return (mapperArticle(b).contenu[5] as any).legende; } },
  { intitule: 'bloc.image-legendee.credit', poser: (v) => { const b = articleComplet(); b.contenu[5].credit = v; return (mapperArticle(b).contenu[5] as any).credit; } },
  { intitule: 'bloc.chiffres-cles.entrees[0].unite', poser: (v) => { const b = articleComplet(); b.contenu[7].entrees[0].unite = v; return (mapperArticle(b).contenu[7] as any).entrees[0].unite; } },
  { intitule: 'auteur.fonction', poser: (v) => { const b = copie(AUTEURS.data[0]); b.fonction = v; return mapperAuteur(b).fonction; } },
  { intitule: 'auteur.photo.alternativeText', poser: (v) => { const b = copie(AUTEURS.data[0]); b.photo.alternativeText = v; return mapperAuteur(b).photo!.alternative; } },
  { intitule: 'categorie.description', poser: (v) => { const b = copie(CATEGORIES.data[0]); b.description = v; return mapperCategorie(b).description; } },
  { intitule: 'dossier.dateOuverture', poser: (v) => { const b = copie(DOSSIERS.data[0]); b.dateOuverture = v; return mapperDossier(b).dateOuverture; } },
];

for (const { intitule, poser } of CHAMPS_TEXTE_OPTIONNEL) {
  for (const [nomDuBlanc, blanc] of BLANCS) {
    test(`« ${intitule} » rempli de ${nomDuBlanc} vaut ABSENT`, () => {
      assert.equal(
        poser(blanc),
        null,
        'un optionnel qui n affiche rien doit valoir null, sinon il sort tel quel dans l attribut',
      );
    });
  }
}

test('un optionnel rempli de blancs ne LEVE toujours pas — il n a rien a garantir', () => {
  for (const [, blanc] of BLANCS) {
    const brut = articleComplet();
    brut.imageCouverture.alternativeText = blanc;
    assert.doesNotThrow(() => mapperArticle(brut));
  }
});

test('la chaine strictement vide vaut toujours ABSENT — le comportement d origine est conserve', () => {
  const brut = articleComplet();
  brut.imageCouverture.alternativeText = '';
  assert.equal(mapperArticle(brut).imageCouverture.alternative, null);
});

test('un optionnel PORTEUR n est ni vide ni normalise — blancs de bordure compris', () => {
  const brut = articleComplet();
  // Une alternative reelle, encadree de blancs : la valeur sort telle quelle. Refuser
  // le vide et reecrire le contenu d autrui sont deux gestes differents ; le second
  // n appartient pas a la lecture.
  brut.imageCouverture.alternativeText = '  Le viaduc dans la brume  ';
  assert.equal(mapperArticle(brut).imageCouverture.alternative, '  Le viaduc dans la brume  ');

  const insecable = articleComplet();
  // Une espace INSECABLE au milieu d une valeur reelle est de la typographie, pas du vide.
  insecable.contenu[7].entrees[0].unite = '%\u00a0HT';
  assert.equal((mapperArticle(insecable).contenu[7] as any).entrees[0].unite, '%\u00a0HT');
});

test('un optionnel de type non-chaine reste une RUPTURE, la normalisation ne l avale pas', () => {
  const brut = articleComplet();
  brut.imageCouverture.alternativeText = 42;
  assert.throws(() => mapperArticle(brut), ValeurInattendueError);
});
