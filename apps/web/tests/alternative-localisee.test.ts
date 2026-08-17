/**
 * LA SURCHARGE LOCALISEE DE L ALTERNATIVE — cote SITE : elle est demandee, puis appliquee.
 *
 * CE QUE CE FICHIER PROTEGE. L `alternativeText` d un media est UNE valeur par fichier,
 * sans locale : les 8 articles anglais servaient donc des alternatives FRANCAISES —
 * mesure du 2026-08-14 sur les 41 pages `lang="en"` du build, 28 textes distincts, tous
 * issus mot pour mot du manifeste. La parade est un champ LOCALISE pose a cote du
 * media, cote CMS ; ce fichier garde les deux moities cote site.
 *
 * OU LE REPLI EST APPLIQUE, ET POURQUOI LA. Il l est AU MAPPING, dans `Media.alternative`
 * — pas dans les composants de rendu. Il y a SIX points de rendu d un `alt` issu d un
 * media (`PageArticle` deux fois, `BlocImageLegendee`, `PageIndex` deux fois, `EnTete`),
 * plus l `og:image:alt` de `Base.astro` : demander a chacun de se souvenir du repli,
 * c est six occasions de l oublier, et l oubli serait SILENCIEUX — un alt francais reste
 * un alt valide. Applique au mapping, le rendu ignore d ou vient l alternative, et il n y
 * a plus rien a oublier. C est aussi ce qui rend cette garde tenable : elle porte sur
 * `mapper*`, pas sur sept fichiers `.astro` qu aucun test ne peut instancier.
 *
 * LA SECONDE MOITIE, ET C EST ELLE QU ON OUBLIE : un champ que le `populate` ne demande
 * PAS n arrive jamais, et le mapping ne peut pas le voir manquer — il lirait `undefined`,
 * `texteOptionnel` rendrait `null`, et le repli retomberait sagement sur l alternative
 * francaise. Succes et echec rendraient la meme sortie. Les tests de `REQUETES` ci-dessous
 * sont donc aussi importants que ceux du mapping.
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
  mapperDossier,
  mapperConfiguration,
} from '../src/lib/strapi/mapping.ts';
import { REQUETES } from '../src/lib/strapi/requete.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));

function fixture(nom: string): any {
  const brut = JSON.parse(fs.readFileSync(path.join(ICI, 'fixtures', `${nom}.json`), 'utf8'));
  const liste = Array.isArray(brut) ? brut : (brut.data ?? brut);
  return JSON.parse(JSON.stringify(Array.isArray(liste) ? liste[0] : liste));
}

const blocImage = (article: any) =>
  article.contenu.find((b: any) => b.type === 'bloc.image-legendee');

const blocVideo = (article: any) => article.contenu.find((b: any) => b.type === 'bloc.video');

/* ------------------------------------------------------------------ */
/* SENS 1 — sans surcharge, RIEN NE CHANGE                             */
/* ------------------------------------------------------------------ */

test('sans surcharge, l alternative reste celle de la mediatheque — le champ vide ne change rien', () => {
  const brut = fixture('articles-en');
  const article = mapperArticle(brut);

  assert.equal(
    article.imageCouverture.alternative,
    brut.imageCouverture.alternativeText,
    'le comportement d origine doit etre EXACTEMENT preserve quand personne ne surcharge'
  );
});

/* ------------------------------------------------------------------ */
/* SENS 2 — avec surcharge, elle PRIME                                 */
/* ------------------------------------------------------------------ */

test('la couverture d un article sert sa surcharge, et le media natif n est pas modifie pour autant', () => {
  const brut = fixture('articles-en');
  brut.alternativeCouverture = 'A stone viaduct spanning a valley in the mist';

  const article = mapperArticle(brut);

  assert.equal(article.imageCouverture.alternative, 'A stone viaduct spanning a valley in the mist');
  assert.notEqual(
    article.imageCouverture.alternative,
    brut.imageCouverture.alternativeText,
    'la surcharge doit avoir REMPLACE l alternative francaise, pas s ajouter a cote'
  );
  assert.equal(article.imageCouverture.url, brut.imageCouverture.url, 'le media lui-meme est intact');
  assert.equal(article.imageCouverture.legende, brut.imageCouverture.caption, 'le credit est intact');
});

test('un bloc `image-legendee` sert sa surcharge, et sa legende n en est pas touchee (A-04)', () => {
  const brut = fixture('articles-en');
  const bloc = brut.contenu.find((b: any) => b.__component === 'bloc.image-legendee');
  bloc.alternative = 'The viaduct from below, seen from the bank';

  const rendu = blocImage(mapperArticle(brut));

  assert.equal(rendu.image.alternative, 'The viaduct from below, seen from the bank');
  assert.equal(rendu.legende, bloc.legende, 'la legende reste la legende : elle n est pas l alternative');
});

test('un article LIE sert la surcharge de SA couverture — le meme fichier, deux pages, deux alternatives', () => {
  const brut = fixture('articles-en');
  assert.ok(brut.articlesLies?.length > 0, 'la fixture doit porter au moins un article lie');
  brut.articlesLies[0].alternativeCouverture = 'Council chamber, empty seats';

  const article = mapperArticle(brut);

  assert.equal(article.articlesLies[0].imageCouverture?.alternative, 'Council chamber, empty seats');
});

test('le hero d une categorie et celui d un dossier servent la leur', () => {
  const categorie = fixture('categories-en');
  categorie.alternativeHero = 'A crane above the rooftops';
  assert.equal(mapperCategorie(categorie).imageHero?.alternative, 'A crane above the rooftops');

  const dossier = fixture('dossiers-en');
  dossier.alternativeHero = 'Water intake at the source';
  assert.equal(mapperDossier(dossier).imageHero?.alternative, 'Water intake at the source');
});

test('la photo d un auteur sert la sienne', () => {
  const auteur = fixture('auteurs-en');
  auteur.alternativePhoto = 'HZ monogram, graphic portrait of Hakim Zerrouki';

  assert.equal(
    mapperAuteur(auteur).photo?.alternative,
    'HZ monogram, graphic portrait of Hakim Zerrouki'
  );
});

test('le logo et l image de partage de la Configuration servent les leurs — le logo SOMBRE compris', () => {
  const conf = fixture('configuration-en');
  conf.alternativeLogo = 'The Highland Echo, magazine of the plateau';
  conf.alternativePartageDefaut = 'Default sharing card of The Highland Echo';

  const rendu = mapperConfiguration(conf);

  assert.equal(rendu.logo.alternative, 'The Highland Echo, magazine of the plateau');
  assert.equal(rendu.imagePartageDefaut.alternative, 'Default sharing card of The Highland Echo');
  /* UNE SEULE surcharge pour DEUX fichiers, et c est voulu : dans un `<picture>`, le
     logo sombre est un `<source srcset>`, qui n a PAS d attribut `alt` — l alternative
     rendue vient toujours du `<img>` de repli. Deux champs auraient laisse croire que
     le second sert a quelque chose. */
  if (rendu.logoSombre) {
    assert.equal(rendu.logoSombre.alternative, 'The Highland Echo, magazine of the plateau');
  }
});

/* La carte de partage EDITORIALE, ajoutee le 2026-08-14 par la decision 426812f2 —
   donc APRES le chiffrage des visuels anglais, ce qui explique qu elle soit passee au
   travers. C etait le DERNIER texte francais servi par une page anglaise : sur les 39
   pages `lang="en"` de la production, plus aucun `alt` n en portait, et cette meta-la
   restait. Elle n est pas moins ENTENDUE que les autres — un lecteur d ecran l annonce
   quand l image ne charge pas, et elle voyage dans les apercus de partage. */
test('la carte de partage SURCHARGEE d un article sert son alternative anglaise (A-04 amende)', () => {
  const brut = fixture('articles-en');
  brut.seo.imagePartage = {
    url: '/uploads/A01_col_des_trois_vents_a1b2c3d4e5.png',
    alternativeText:
      'Carte de partage de A01 : six eoliennes sur la crete du col, la capacite ' +
      'residuelle de 8,4 MW en barre pleine sous les 19,8 MW demandes en barre evidee',
    caption: null,
    width: 1200,
    height: 630,
    mime: 'image/png',
  };
  brut.seo.alternativePartage =
    'Sharing card for A01: six wind turbines on the ridge of the pass, the residual ' +
    'capacity of 8.4 MW as a solid bar below the 19.8 MW requested as a hollow bar';

  const rendu = mapperArticle(brut).seo;

  assert.equal(
    rendu.imagePartage.alternative,
    'Sharing card for A01: six wind turbines on the ridge of the pass, the residual ' +
      'capacity of 8.4 MW as a solid bar below the 19.8 MW requested as a hollow bar'
  );
  /* Le fichier de la mediatheque n a pas bouge : c est UN media pour DEUX locales, et
     c est bien pour cela que la surcharge existe. */
  assert.match(brut.seo.imagePartage.alternativeText, /^Carte de partage/);
});

/* La VIGNETTE d un `bloc.video`, ajoutee le 2026-08-17 (decision `5ca1ca4b`, branche A).
   Elle etait le HUITIEME porteur, et le seul des trois releves par la revue des huit blocs
   d A-04 qui se comble comme `bloc.image-legendee` : un champ voisin, un `avecSurcharge`,
   rien de plus. Le trou etait invisible parce que `bloc.video` n a plus aucun porteur au
   corpus depuis l avenant A5 — mais le BANC de fixtures, lui, en porte un, et il servait
   bien une alternative FRANCAISE sur sa page anglaise. */
test('un bloc `video` sert la surcharge de sa VIGNETTE (A-04, revue des huit blocs)', () => {
  const brut = fixture('articles-en');
  const bloc = brut.contenu.find((b: any) => b.__component === 'bloc.video');
  assert.ok(bloc?.vignette, 'la fixture doit porter un bloc video AVEC vignette');
  bloc.alternativeVignette = 'The deck suspended above the valley, seen from the north bank';

  const rendu = blocVideo(mapperArticle(brut));

  assert.equal(
    rendu.vignette.alternative,
    'The deck suspended above the valley, seen from the north bank'
  );
  assert.notEqual(
    rendu.vignette.alternative,
    bloc.vignette.alternativeText,
    'la surcharge doit avoir REMPLACE l alternative francaise, pas s ajouter a cote'
  );
  assert.equal(rendu.legende, bloc.legende, 'la legende du bloc n est pas l alternative (A-04)');
  assert.equal(rendu.url, bloc.url, 'le lien sortant est intact');
});

/* ------------------------------------------------------------------ */
/* SENS 3 — une surcharge BLANCHE ne s applique pas                    */
/* ------------------------------------------------------------------ */

test('une surcharge BLANCHE ne remplace rien : elle est traitee comme absente, jamais comme un silence', () => {
  for (const blanc of ['', '   ', ' ', '\t']) {
    const brut = fixture('articles-en');
    brut.alternativeCouverture = blanc;

    assert.equal(
      mapperArticle(brut).imageCouverture.alternative,
      brut.imageCouverture.alternativeText,
      `une surcharge ${JSON.stringify(blanc)} doit laisser passer l alternative native`
    );
  }
});

test('une surcharge BLANCHE de la carte de partage ne remplace rien non plus', () => {
  for (const blanc of ['', '   ', '\t']) {
    const brut = fixture('articles-en');
    brut.seo.imagePartage = {
      url: '/uploads/A01_col_des_trois_vents_a1b2c3d4e5.png',
      alternativeText: 'Carte de partage de A01',
      caption: null,
    width: 1200,
      height: 630,
      mime: 'image/png',
    };
    brut.seo.alternativePartage = blanc;

    assert.equal(
      mapperArticle(brut).seo.imagePartage.alternative,
      'Carte de partage de A01',
      `une surcharge ${JSON.stringify(blanc)} doit laisser passer l alternative native`
    );
  }
});

test('une surcharge BLANCHE de la vignette video ne remplace rien non plus', () => {
  for (const blanc of ['', '   ', '\t']) {
    const brut = fixture('articles-en');
    const bloc = brut.contenu.find((b: any) => b.__component === 'bloc.video');
    const natif = bloc.vignette.alternativeText;
    bloc.alternativeVignette = blanc;

    assert.equal(
      blocVideo(mapperArticle(brut)).vignette.alternative,
      natif,
      `une surcharge ${JSON.stringify(blanc)} doit laisser passer l alternative native`
    );
  }
});

test('sans vignette, la surcharge de vignette ne fabrique aucun media — elle ne cree rien', () => {
  const brut = fixture('articles-en');
  const bloc = brut.contenu.find((b: any) => b.__component === 'bloc.video');
  bloc.vignette = null;
  bloc.alternativeVignette = 'A thumbnail that has no file behind it';

  assert.equal(blocVideo(mapperArticle(brut)).vignette, null);
});

test('sans carte de partage surchargee, la surcharge ne fabrique aucun media — elle ne cree rien', () => {
  const brut = fixture('articles-en');
  brut.seo.imagePartage = null;
  brut.seo.alternativePartage = 'Sharing card that has no file behind it';

  assert.equal(mapperArticle(brut).seo.imagePartage, null);
});

/* ------------------------------------------------------------------ */
/* SENS 4 — LE POPULATE LES DEMANDE                                    */
/*                                                                     */
/* Sans ces cas, tout ce qui precede pourrait etre vert pendant que le  */
/* site sert du francais : Strapi ne renvoie que ce qu on demande.      */
/* ------------------------------------------------------------------ */

test('la requete des articles demande la surcharge de couverture, et celle des articles LIES aussi', () => {
  const articles = REQUETES.articles;

  assert.ok(
    articles.fields.includes('alternativeCouverture'),
    'sans ce champ, Strapi ne le renvoie pas et le repli retombe en silence sur le francais'
  );
  assert.ok(
    articles.populate.articlesLies.fields.includes('alternativeCouverture'),
    'les cartes d articles lies rendent un `alt` : elles ont besoin de la surcharge'
  );
});

test('la requete des articles demande la surcharge du bloc `image-legendee`', () => {
  const bloc = REQUETES.articles.populate.contenu.on['bloc.image-legendee'];

  assert.ok(bloc.fields.includes('alternative'));
  assert.ok(bloc.fields.includes('legende'), 'la legende reste demandee : elle n est pas remplacee');
});

test('la requete des articles demande la surcharge de la vignette du bloc `video`', () => {
  const bloc = REQUETES.articles.populate.contenu.on['bloc.video'];

  assert.ok(
    bloc.fields.includes('alternativeVignette'),
    'un champ non demande n arrive jamais : le repli retomberait en silence sur le francais'
  );
  assert.ok(bloc.fields.includes('legende'), 'la legende reste demandee : elle n est pas remplacee');
  assert.ok(bloc.populate.vignette, 'le media lui-meme reste peuple');
});

test('les requetes des categories, dossiers, auteurs et de la Configuration demandent les leurs', () => {
  assert.ok(REQUETES.categories.fields.includes('alternativeHero'));
  assert.ok(REQUETES.dossiers.fields.includes('alternativeHero'));
  assert.ok(REQUETES.auteurs.fields.includes('alternativePhoto'));
  assert.ok(REQUETES.configuration.fields.includes('alternativeLogo'));
  assert.ok(REQUETES.configuration.fields.includes('alternativePartageDefaut'));
});

test('la requete des articles demande la surcharge de la carte de partage, DANS le composant seo', () => {
  /* Le champ vit dans `partage.seo`, pas a la racine de l article : c est le `fields` du
     populate SEO qu il faut, et lui seul. Demande au mauvais niveau, il ne remonterait
     jamais — et le repli retomberait en silence sur le francais, exactement le defaut
     que ce lot ferme. */
  for (const requete of [REQUETES.articles, REQUETES.categories, REQUETES.dossiers]) {
    assert.ok(
      requete.populate.seo.fields.includes('alternativePartage'),
      'sans ce champ dans le populate du composant seo, Strapi ne le renvoie pas'
    );
  }
});

test('AUCUNE requete ne demande de surcharge par un joker — la contrainte dure du populate explicite tient', () => {
  const serialise = JSON.stringify(REQUETES);

  assert.equal(serialise.includes('"*"'), false, 'populate explicite au build, jamais le joker');
});
