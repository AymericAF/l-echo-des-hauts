/**
 * LA SURCHARGE LOCALISEE DE L ALTERNATIVE TEXTUELLE — lecture, et les deux gardes.
 *
 * CE QUE CE FICHIER PROTEGE, et pourquoi il existe. L `alternativeText` de la
 * mediatheque est UNE valeur par fichier, sans locale : `plugin::upload.file` ne
 * porte aucune entree i18n, et le plugin upload ecrit par `strapi.db.query`, jamais
 * par le Document Service (mesure du 2026-08-14, tache `2801722c`). Une image servie
 * sur une page anglaise sortait donc avec son alternative FRANCAISE — 28 textes
 * distincts sur les 41 pages `lang="en"` du build, plus un `og:image:alt` sur 33
 * pages.
 *
 * La parade N EST PAS de localiser la mediatheque — ce serait du developpement de
 * plugin. C est un champ texte LOCALISE pose a cote de chaque media, qui PRIME sur
 * l `alternativeText` quand il est renseigne et laisse le comportement d origine
 * exactement en place quand il est vide. C est le patron de `seo.imagePartage`
 * (priorite 1 d A-28), et il ne demande rien de neuf a Strapi : les types porteurs
 * sont deja localises (A-06), la dynamic zone `contenu` aussi.
 *
 * A-04 reste entier sur son fond : l alternative ne vient JAMAIS d une legende, et
 * l `alternativeText` natif demeure la source par defaut. Ce qui est amende est sa
 * seule phrase « il n y a rien a ajouter au modele ».
 *
 * LES DEUX GARDES, et ce qu elles empechent :
 *
 *  1. UNE SURCHARGE BLANCHE EST REFUSEE. « Vide » et « blanc » ne se ressemblent
 *     pas : un champ absent dit « pas de surcharge, prends l alternative native »,
 *     tandis que trois espaces ECRASENT l alternative par du silence. C est
 *     exactement le defaut du 2026-08-11 (`alt="   "` servi par un optionnel qui ne
 *     ramenait a `null` que la chaine STRICTEMENT vide), et il ne doit pas rentrer
 *     par la porte qu on vient d ouvrir.
 *
 *  2. UNE SURCHARGE SUR UN MEDIA `decoratif: true` EST REFUSEE. C est la meme
 *     contradiction que celle deja gardee au manifeste : ou l image porte une
 *     information — alors elle n est pas decorative —, ou elle n en porte pas, et
 *     aucune traduction n a de sens. Sans cette garde, `decoratif` cesserait d etre
 *     opposable des qu on passe par la surcharge.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chargerCorpus } from '../scripts/seed/corpus.ts';
import { ErreurCorpus } from '../scripts/seed/erreurs.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE_CMS = path.join(ICI, '..');

/* ------------------------------------------------------------------ */
/* Un corpus minimal PORTEUR DE SURCHARGES, que chaque test peut abimer */
/* ------------------------------------------------------------------ */

type Options = {
  /** Surcharge portee par la couverture de l article EN. */
  couvertureEn?: string;
  /** Surcharge portee par le bloc `image-legendee` de l article EN. */
  blocEn?: string;
  /** Surcharge portee par le hero de la categorie EN. */
  heroCategorieEn?: string;
  /** Surcharge portee par la photo de l auteur EN. */
  photoAuteurEn?: string;
  /** Surcharges portees par la Configuration EN. */
  logoEn?: string;
  partageEn?: string;
  /** Rend DECORATIVE l image du bloc `image-legendee` (alternative native vide). */
  blocDecoratif?: boolean;
};

function ecrireCorpus(options: Options = {}): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-alt-'));
  const ecrire = (rel: string, contenu: string) => {
    const cible = path.join(racine, rel);
    fs.mkdirSync(path.dirname(cible), { recursive: true });
    fs.writeFileSync(cible, contenu, 'utf8');
  };

  const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>';
  for (const rel of [
    'medias/couvertures/A05.svg',
    'medias/identite/logo.svg',
    'medias/blocs/A05-piece.svg',
    'medias/auteurs/hakim-zerrouki.svg',
    'medias/heros/rubrique-territoire.svg',
  ]) {
    ecrire(rel, svg);
  }
  ecrire('medias/identite/partage.png', 'PNG factice');

  const duProjet = (alternativeText: string) => ({
    alternativeText,
    ayantDroit: 'Œuvre du projet',
    licence: 'CC0 1.0',
  });

  ecrire(
    'medias/manifeste.json',
    JSON.stringify({
      'couvertures/A05.svg': duProjet('Bassin versant'),
      'identite/logo.svg': duProjet('Logo'),
      'identite/partage.png': duProjet('Partage'),
      'blocs/A05-piece.svg': options.blocDecoratif
        ? { ...duProjet(''), decoratif: true }
        : duProjet('Fac-simile d un tableau de repartition'),
      'auteurs/hakim-zerrouki.svg': duProjet('Monogramme HZ'),
      'heros/rubrique-territoire.svg': duProjet('Bandeau de courbes de niveau'),
    })
  );

  ecrire(
    'categories.json',
    JSON.stringify([
      {
        ordreAffichage: 10,
        couleurAccent: '#1F5C4A',
        imageHero: 'heros/rubrique-territoire.svg',
        fr: { nom: 'Territoire', slug: 'territoire', description: 'Ce qui se decide.' },
        en: {
          nom: 'Territory',
          slug: 'territory',
          description: 'What gets decided.',
          ...(options.heroCategorieEn === undefined
            ? {}
            : { alternativeHero: options.heroCategorieEn }),
        },
      },
    ])
  );
  ecrire('tags.json', JSON.stringify([{ fr: { nom: 'Eau', slug: 'eau' }, en: { nom: 'Water', slug: 'water' } }]));
  ecrire(
    'auteurs.json',
    JSON.stringify([
      {
        nom: 'Hakim Zerrouki',
        photo: 'auteurs/hakim-zerrouki.svg',
        reseaux: [],
        fr: { slug: 'hakim-zerrouki', fonction: 'Reporter', bio: 'Sept ans en mairie.' },
        en: {
          slug: 'hakim-zerrouki',
          fonction: 'Reporter',
          bio: 'Seven years at the town hall.',
          ...(options.photoAuteurEn === undefined
            ? {}
            : { alternativePhoto: options.photoAuteurEn }),
        },
      },
    ])
  );
  ecrire('dossiers.json', JSON.stringify([]));
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
        ...(options.logoEn === undefined ? {} : { alternativeLogo: options.logoEn }),
        ...(options.partageEn === undefined
          ? {}
          : { alternativePartageDefaut: options.partageEn }),
      },
    })
  );

  const article = (locale: string, slug: string, titre: string, surcharges: Options) => {
    const enTete: Record<string, unknown> = {
      code: 'A05',
      locale,
      slug,
      titre,
      chapo: 'Cinq echelons, une seule facture.',
      auteur: 'hakim-zerrouki',
      categorie: 'territoire',
      tags: ['eau'],
      datePublication: '2026-03-16T08:00:00.000Z',
      aLaUne: false,
      imageCouverture: 'couvertures/A05.svg',
      legendeCouverture: 'Le bassin versant.',
    };
    if (locale === 'en' && surcharges.couvertureEn !== undefined) {
      enTete.alternativeCouverture = surcharges.couvertureEn;
    }
    const attributsBloc =
      locale === 'en' && surcharges.blocEn !== undefined
        ? ` alternative="${surcharges.blocEn}"`
        : '';
    return [
      '---',
      JSON.stringify(enTete, null, 2),
      '---',
      '',
      '::: texte',
      'Cinq echelons decident de l eau du plateau.',
      ':::',
      '',
      `::: image-legendee image=blocs/A05-piece.svg legende="Repartition" credit="Œuvre du projet"${attributsBloc}`,
      ':::',
      '',
    ].join('\n');
  };

  ecrire('articles/A05.fr.md', article('fr', 'qui-decide-de-l-eau', 'Qui decide de l eau ?', options));
  ecrire(
    'articles/A05.en.md',
    article('en', 'who-decides-the-water', 'Who decides the water?', options)
  );

  return racine;
}

const blocImage = (contenu: Record<string, any>[]) =>
  contenu.find((b) => b.__component === 'bloc.image-legendee');

/* ------------------------------------------------------------------ */
/* SENS 1 — la surcharge est LUE, locale par locale                     */
/* ------------------------------------------------------------------ */

test('la couverture d un article porte sa surcharge EN, et la locale FR reste sans surcharge', () => {
  const corpus = chargerCorpus(
    ecrireCorpus({ couvertureEn: 'The Ambre catchment, five tiers of authority overlaid' })
  );
  const article = corpus.articles[0];

  assert.equal(
    article.en?.alternativeCouverture,
    'The Ambre catchment, five tiers of authority overlaid'
  );
  assert.equal(
    article.fr.alternativeCouverture,
    undefined,
    'la locale FR n a pas de surcharge : son alternative native est deja francaise'
  );
});

test('un bloc `image-legendee` porte sa surcharge, et la legende n en est pas touchee', () => {
  const corpus = chargerCorpus(ecrireCorpus({ blocEn: 'Facsimile of an allocation table' }));
  const bloc = blocImage(corpus.articles[0].en!.contenu);

  assert.equal(bloc?.alternative, 'Facsimile of an allocation table');
  assert.equal(bloc?.legende, 'Repartition', 'A-04 tient : la legende n est pas l alternative');
  assert.equal(blocImage(corpus.articles[0].fr.contenu)?.alternative, undefined);
});

test('le hero d une categorie, la photo d un auteur et les medias de la Configuration portent la leur', () => {
  const corpus = chargerCorpus(
    ecrireCorpus({
      heroCategorieEn: 'Banner of contour lines',
      photoAuteurEn: 'HZ monogram, graphic portrait of Hakim Zerrouki',
      logoEn: 'The Highland Echo, magazine of the plateau',
      partageEn: 'Default sharing card of The Highland Echo',
    })
  );

  assert.equal(corpus.categories[0].en?.alternativeHero, 'Banner of contour lines');
  assert.equal(
    corpus.auteurs[0].en?.alternativePhoto,
    'HZ monogram, graphic portrait of Hakim Zerrouki'
  );
  assert.equal(
    corpus.configuration.en?.alternativeLogo,
    'The Highland Echo, magazine of the plateau'
  );
  assert.equal(
    corpus.configuration.en?.alternativePartageDefaut,
    'Default sharing card of The Highland Echo'
  );
});

test('un corpus SANS aucune surcharge se charge — le champ est facultatif, et vide il ne change rien', () => {
  const corpus = chargerCorpus(ecrireCorpus());

  assert.equal(corpus.articles[0].en?.alternativeCouverture, undefined);
  assert.equal(blocImage(corpus.articles[0].en!.contenu)?.alternative, undefined);
  assert.equal(corpus.categories[0].en?.alternativeHero, undefined);
  assert.equal(corpus.configuration.en?.alternativeLogo, undefined);
});

/* ------------------------------------------------------------------ */
/* SENS 2 — GARDE 1 : une surcharge BLANCHE est refusee                 */
/* ------------------------------------------------------------------ */

test('GARDE 1 — une couverture surchargee par des espaces est REFUSEE, en nommant l article', () => {
  assert.throws(
    () => chargerCorpus(ecrireCorpus({ couvertureEn: '   ' })),
    (e: unknown) => {
      assert.ok(e instanceof ErreurCorpus, 'doit etre une ErreurCorpus');
      assert.match((e as Error).message, /A05\.en\.md/);
      assert.match((e as Error).message, /alternativeCouverture/);
      return true;
    }
  );
});

test('GARDE 1 — la chaine STRICTEMENT vide est refusee elle aussi : on omet le champ, on ne le vide pas', () => {
  assert.throws(() => chargerCorpus(ecrireCorpus({ couvertureEn: '' })), ErreurCorpus);
});

test('GARDE 1 — elle vaut pour un bloc, un hero, une photo et la Configuration, pas seulement pour la couverture', () => {
  for (const options of [
    { blocEn: '  ' },
    { heroCategorieEn: ' ' },
    { photoAuteurEn: '\t' },
    { logoEn: '   ' },
    { partageEn: '' },
  ] as Options[]) {
    assert.throws(
      () => chargerCorpus(ecrireCorpus(options)),
      ErreurCorpus,
      `une surcharge blanche doit etre refusee pour ${Object.keys(options)[0]}`
    );
  }
});

test('GARDE 1 — PREUVE EN CASSANT : une surcharge NON BLANCHE passe, la garde ne refuse pas tout', () => {
  const corpus = chargerCorpus(ecrireCorpus({ couvertureEn: 'A', blocEn: 'B', heroCategorieEn: 'C' }));

  assert.equal(corpus.articles[0].en?.alternativeCouverture, 'A');
  assert.equal(blocImage(corpus.articles[0].en!.contenu)?.alternative, 'B');
  assert.equal(corpus.categories[0].en?.alternativeHero, 'C');
});

/* ------------------------------------------------------------------ */
/* SENS 3 — GARDE 2 : pas de surcharge sur un media DECORATIF           */
/* ------------------------------------------------------------------ */

test('GARDE 2 — surcharger un media `decoratif: true` est REFUSE, en nommant le media', () => {
  assert.throws(
    () => chargerCorpus(ecrireCorpus({ blocDecoratif: true, blocEn: 'An allocation table' })),
    (e: unknown) => {
      assert.ok(e instanceof ErreurCorpus, 'doit etre une ErreurCorpus');
      assert.match((e as Error).message, /blocs\/A05-piece\.svg/);
      assert.match((e as Error).message, /decoratif/);
      return true;
    }
  );
});

test('GARDE 2 — PREUVE EN CASSANT : le meme media decoratif SANS surcharge se charge', () => {
  const corpus = chargerCorpus(ecrireCorpus({ blocDecoratif: true }));

  assert.equal(blocImage(corpus.articles[0].en!.contenu)?.alternative, undefined);
});

/* ------------------------------------------------------------------ */
/* SENS 4 — les schemas declarent les champs, et ils sont LOCALISES     */
/* ------------------------------------------------------------------ */

const schema = (rel: string) =>
  JSON.parse(fs.readFileSync(path.join(RACINE_CMS, 'src', rel), 'utf8'));

const localise = (attribut: any) => attribut?.pluginOptions?.i18n?.localized === true;

test('les cinq types porteurs declarent leur champ de surcharge, et le declarent LOCALISE', () => {
  const cas: [string, string, string][] = [
    ['api/article/content-types/article/schema.json', 'alternativeCouverture', 'Article'],
    ['api/categorie/content-types/categorie/schema.json', 'alternativeHero', 'Categorie'],
    ['api/dossier/content-types/dossier/schema.json', 'alternativeHero', 'Dossier'],
    ['api/auteur/content-types/auteur/schema.json', 'alternativePhoto', 'Auteur'],
  ];

  for (const [chemin, champ, nom] of cas) {
    const attribut = schema(chemin).attributes[champ];
    assert.ok(attribut, `${nom} doit declarer \`${champ}\``);
    assert.equal(attribut.type, 'string', `${nom}.${champ} est un texte court`);
    assert.ok(
      localise(attribut),
      `${nom}.${champ} DOIT etre localise — non localise, il servirait le francais aux deux locales, ` +
        'ce qui est exactement le defaut qu il repare'
    );
    assert.notEqual(attribut.required, true, `${nom}.${champ} est facultatif : vide, il ne change rien`);
  }
});

test('la Configuration declare ses deux surcharges, localisees', () => {
  const attributs = schema('api/configuration/content-types/configuration/schema.json').attributes;

  for (const champ of ['alternativeLogo', 'alternativePartageDefaut']) {
    assert.ok(attributs[champ], `Configuration doit declarer \`${champ}\``);
    assert.equal(attributs[champ].type, 'string');
    assert.ok(localise(attributs[champ]), `Configuration.${champ} doit etre localise`);
  }
});

test('le composant `bloc.image-legendee` porte `alternative` — il herite de la dynamic zone, qui EST localisee', () => {
  const composant = JSON.parse(
    fs.readFileSync(path.join(RACINE_CMS, 'src/components/bloc/image-legendee.json'), 'utf8')
  );

  assert.ok(composant.attributes.alternative, 'le bloc doit porter `alternative`');
  assert.equal(composant.attributes.alternative.type, 'string');
  /* AUCUN `pluginOptions.i18n` ICI, ET C EST VOULU : un composant ne porte pas ses
     propres options i18n. Ce qui le rend localise est la dynamic zone `contenu` de
     l article, qui l est — la localisation EN d un article porte SES blocs, pas ceux
     de la francaise. Declarer `localized: true` sur un attribut de composant ferait
     croire a un reglage qui n existe pas. */
  assert.equal(
    composant.attributes.alternative.pluginOptions,
    undefined,
    'un attribut de composant ne declare pas d option i18n : la dynamic zone porte la localisation'
  );
});

test('la dynamic zone `contenu` de l article est bien localisee — sans quoi le champ du bloc ne servirait a rien', () => {
  const contenu = schema('api/article/content-types/article/schema.json').attributes.contenu;

  assert.equal(contenu.type, 'dynamiczone');
  assert.ok(localise(contenu), 'la localisation du bloc DEPEND entierement de celle-ci');
});

test('la garde ne touche pas au corpus REEL du depot : il se charge toujours', () => {
  const corpus = chargerCorpus(path.join(RACINE_CMS, 'data'));

  assert.equal(corpus.articles.length, 40);
  assert.equal(corpus.articles.filter((a) => a.en).length, 8);
});
