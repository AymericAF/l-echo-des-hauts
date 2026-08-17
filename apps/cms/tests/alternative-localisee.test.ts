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
  /** Surcharge portee par la carte de partage EDITORIALE de l article EN (`partage.seo`). */
  seoPartageEn?: string;
  /** Pose `seoPartageEn` SANS `seo.imagePartage` : la surcharge ne surchargerait rien. */
  seoSansImage?: boolean;
  /** Surcharge portee par la VIGNETTE du bloc `video` EN (A-04, decision `5ca1ca4b`). */
  vignetteEn?: string;
  /** Rend DECORATIVE la vignette du bloc `video` (alternative native vide). */
  vignetteDecorative?: boolean;
  /** Pose `vignetteEn` SANS `vignette` : la surcharge ne surchargerait rien. */
  videoSansVignette?: boolean;
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
  /* La vignette n existe QUE si le bloc video la cite : un media au manifeste et employe
     nulle part est refuse par `chargerCorpus` — c est la garde des orphelins. */
  if (!options.videoSansVignette) ecrire('medias/blocs/A05-vignette.svg', svg);
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
      ...(options.videoSansVignette
        ? {}
        : {
            'blocs/A05-vignette.svg': options.vignetteDecorative
              ? { ...duProjet(''), decoratif: true }
              : duProjet('Le canal d amenee vu depuis la passerelle'),
          }),
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
    if (locale === 'en' && surcharges.seoPartageEn !== undefined) {
      enTete.seo = {
        ...(surcharges.seoSansImage ? {} : { imagePartage: 'identite/partage.png' }),
        alternativePartage: surcharges.seoPartageEn,
      };
    }
    const attributsBloc =
      locale === 'en' && surcharges.blocEn !== undefined
        ? ` alternative="${surcharges.blocEn}"`
        : '';
    const attributsVideo =
      (surcharges.videoSansVignette ? '' : ' vignette=blocs/A05-vignette.svg') +
      (locale === 'en' && surcharges.vignetteEn !== undefined
        ? ` alternativeVignette="${surcharges.vignetteEn}"`
        : '');
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
      `::: video url=https://www.youtube.com/watch?v=aaaaaaaaaaa legende="Le canal, en trois minutes."${attributsVideo}`,
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

const blocVideo = (contenu: Record<string, any>[]) =>
  contenu.find((b) => b.__component === 'bloc.video');

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

/* LA VIGNETTE D UN `bloc.video` — le HUITIEME porteur, ouvert le 2026-08-17 (decision
   `5ca1ca4b`, branche A). Elle se comble EXACTEMENT comme `bloc.image-legendee` : un champ
   voisin dans le meme composant, que la dynamic zone localise par construction. Le trou
   etait reste invisible parce que `bloc.video` n a plus aucun porteur au corpus depuis
   l avenant A5 — l absence de donnee n est pas l absence de defaut. */
test('un bloc `video` porte la surcharge de sa VIGNETTE, et la legende n en est pas touchee', () => {
  const corpus = chargerCorpus(
    ecrireCorpus({ vignetteEn: 'The headrace canal seen from the footbridge' })
  );
  const bloc = blocVideo(corpus.articles[0].en!.contenu);

  assert.equal(bloc?.alternativeVignette, 'The headrace canal seen from the footbridge');
  assert.equal(bloc?.legende, 'Le canal, en trois minutes.', 'A-04 tient : la legende n est pas l alternative');
  assert.equal(
    blocVideo(corpus.articles[0].fr.contenu)?.alternativeVignette,
    undefined,
    'la locale FR n a pas de surcharge : son alternative native est deja francaise'
  );
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
    { seoPartageEn: '  ' },
    { vignetteEn: ' ' },
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

test('GARDE 1 — PREUVE EN CASSANT : une surcharge de carte de partage NON BLANCHE se charge', () => {
  const corpus = chargerCorpus(
    ecrireCorpus({ seoPartageEn: 'Sharing card: five tiers, one bill' })
  );

  assert.equal(corpus.articles[0].en?.seo?.alternativePartage, 'Sharing card: five tiers, one bill');
});

/* Le mode d echec propre a CE champ : la surcharge est posee, elle a l air d etre prise,
   et elle ne surcharge RIEN — il n y a pas de carte a surcharger. Le repli du site
   servirait alors l image generee au build ou celle par defaut, avec leur alternative a
   elles, et le redacteur croirait avoir traduit quelque chose. On refuse a l entree. */
test('GARDE 3 — `alternativePartage` SANS `seo.imagePartage` est REFUSE : elle ne surchargerait rien', () => {
  assert.throws(
    () =>
      chargerCorpus(
        ecrireCorpus({ seoPartageEn: 'Sharing card that has no file behind it', seoSansImage: true })
      ),
    (e: unknown) => {
      assert.ok(e instanceof ErreurCorpus, 'doit etre une ErreurCorpus');
      assert.match((e as Error).message, /alternativePartage/);
      assert.match((e as Error).message, /imagePartage/);
      return true;
    }
  );
});

/* Le meme mode d echec que GARDE 3, sur l autre porteur qui peut ne pas avoir de media :
   la surcharge est posee, elle a l air d etre prise, et il n y a AUCUNE vignette a
   surcharger. Le bloc degraderait vers son lien textuel, et le redacteur croirait avoir
   traduit quelque chose. On refuse a l entree. */
test('GARDE 3 — `alternativeVignette` SANS `vignette` est REFUSE : elle ne surchargerait rien', () => {
  assert.throws(
    () =>
      chargerCorpus(
        ecrireCorpus({ vignetteEn: 'A thumbnail with no file behind it', videoSansVignette: true })
      ),
    (e: unknown) => {
      assert.ok(e instanceof ErreurCorpus, 'doit etre une ErreurCorpus');
      assert.match((e as Error).message, /alternativeVignette/);
      assert.match((e as Error).message, /vignette/);
      return true;
    }
  );
});

test('GARDE 3 — PREUVE EN CASSANT : un bloc `video` SANS vignette et SANS surcharge se charge', () => {
  const corpus = chargerCorpus(ecrireCorpus({ videoSansVignette: true }));

  assert.equal(blocVideo(corpus.articles[0].en!.contenu)?.vignette, undefined);
  assert.equal(blocVideo(corpus.articles[0].en!.contenu)?.alternativeVignette, undefined);
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

test('GARDE 2 — elle vaut aussi pour la VIGNETTE d un bloc `video`', () => {
  assert.throws(
    () =>
      chargerCorpus(
        ecrireCorpus({ vignetteDecorative: true, vignetteEn: 'The headrace canal' })
      ),
    (e: unknown) => {
      assert.ok(e instanceof ErreurCorpus, 'doit etre une ErreurCorpus');
      assert.match((e as Error).message, /blocs\/A05-vignette\.svg/);
      assert.match((e as Error).message, /decoratif/);
      return true;
    }
  );
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

test('le composant `bloc.video` porte `alternativeVignette` — le HUITIEME porteur (A-04, 2026-08-17)', () => {
  const composant = JSON.parse(
    fs.readFileSync(path.join(RACINE_CMS, 'src/components/bloc/video.json'), 'utf8')
  );

  assert.ok(composant.attributes.alternativeVignette, 'le bloc doit porter `alternativeVignette`');
  assert.equal(composant.attributes.alternativeVignette.type, 'string');
  /* Meme raison que pour `bloc.image-legendee` : un attribut de composant ne declare pas
     ses propres options i18n — ce qui le localise est la dynamic zone `contenu`. */
  assert.equal(composant.attributes.alternativeVignette.pluginOptions, undefined);
  assert.notEqual(composant.attributes.alternativeVignette.required, true);
});

test('le composant `partage.seo` porte `alternativePartage` — la carte de partage est le SEPTIEME porteur', () => {
  const composant = JSON.parse(
    fs.readFileSync(path.join(RACINE_CMS, 'src/components/partage/seo.json'), 'utf8')
  );

  assert.ok(composant.attributes.alternativePartage, 'le composant doit porter `alternativePartage`');
  assert.equal(composant.attributes.alternativePartage.type, 'string');
  /* Meme raison que pour le bloc : un attribut de composant ne declare pas ses propres
     options i18n. Ce qui rend celui-ci localise est l attribut `seo` de chaque entite
     porteuse, declare `localized: true` — verifie par le test suivant. */
  assert.equal(composant.attributes.alternativePartage.pluginOptions, undefined);
  assert.notEqual(composant.attributes.alternativePartage.required, true);
});

test('l attribut `seo` est localise sur les trois entites qui le portent — sans quoi le champ ne servirait a rien', () => {
  for (const chemin of [
    'api/article/content-types/article/schema.json',
    'api/categorie/content-types/categorie/schema.json',
    'api/dossier/content-types/dossier/schema.json',
  ]) {
    const seo = schema(chemin).attributes.seo;
    assert.equal(seo.component, 'partage.seo');
    assert.ok(localise(seo), `${chemin} : la localisation d \`alternativePartage\` DEPEND de celle-ci`);
  }
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

/* ------------------------------------------------------------------ */
/* SENS 5 — LE CORPUS VERSIONNE : complet, et reellement en anglais    */
/*                                                                     */
/* Ces trois cas sont la RECETTE de la tache, pas une redite des tests  */
/* de fixture : ils portent sur ce que le site sert vraiment. Sans eux, */
/* tout ce qui precede peut etre vert pendant que les pages anglaises   */
/* restent francaises — le mecanisme marcherait, personne ne s en       */
/* servirait.                                                          */
/* ------------------------------------------------------------------ */

/** Tout ce qui est servi sur une page EN et attend une alternative, avec sa surcharge. */
function porteursAnglais(corpus: ReturnType<typeof chargerCorpus>) {
  const parCle = new Map(corpus.medias.map((m) => [m.cle, m]));
  const porteurs: { quoi: string; media: string; surcharge?: string }[] = [];

  for (const a of corpus.articles) {
    if (!a.en) continue;
    porteurs.push({
      quoi: `article ${a.code} : couverture`,
      media: a.en.imageCouverture,
      surcharge: a.en.alternativeCouverture,
    });
    /* LA CARTE DE PARTAGE EDITORIALE, ajoutee a cette liste le 2026-08-16 — et c est
       l ABSENCE de cette ligne qui a laisse passer le defaut. La carte de A01 a ete
       posee le 2026-08-14, APRES le chiffrage des visuels anglais, et servait son
       `og:image:alt` francais sur la page anglaise : la recette est restee verte tout
       du long, parce qu elle ne regardait pas la. Verifie en cassant le 2026-08-16 —
       sans cette ligne, retirer la surcharge de A01 laisse les 361 tests au vert. */
    if (a.en.seo?.imagePartage) {
      porteurs.push({
        quoi: `article ${a.code} : carte de partage (seo.imagePartage)`,
        media: a.en.seo.imagePartage,
        surcharge: a.en.seo.alternativePartage,
      });
    }
    for (const bloc of a.en.contenu) {
      if (bloc.__component === 'bloc.image-legendee') {
        porteurs.push({
          quoi: `article ${a.code} : bloc image-legendee`,
          media: bloc.image.__media,
          surcharge: bloc.alternative,
        });
      }
      /* LA GALERIE EST DANS CETTE LISTE, ET ELLE N A PAS DE SURCHARGE — c est voulu,
         et c est ce qui rend le trou VISIBLE plutot que tacite.
         `bloc.galerie` porte N images pour une seule legende (A-22) ; lui donner des
         alternatives par locale demanderait un champ REPETABLE, donc un autre lot. Le
         corpus n en a pas besoin : ses 22 images de galerie sont toutes
         `decoratif: true` (commit `d0e3db5`), elles sortent en `alt=""` et il n y a
         rien a traduire. Le filtre `decoratif` ci-dessous les ecarte donc toutes.
         Le jour ou une galerie PORTEUSE sera servie en anglais, ce test ROUGIRA en la
         nommant — et c est le bon moment pour decider d etendre le mecanisme, pas
         avant. Sans cette ligne, elle serait sortie en francais sans que rien ne bouge.
         Mesure du 2026-08-14 : sur le banc de fixtures, dont les galeries ne sont PAS
         decoratives, trois alternatives francaises sortaient bien sur les pages EN. */
      if (bloc.__component === 'bloc.galerie') {
        for (const image of bloc.images) {
          porteurs.push({ quoi: `article ${a.code} : bloc galerie`, media: image.__media });
        }
      }
    }
  }
  for (const c of corpus.categories) {
    /* LE MEDIA REELLEMENT SERVI EN ANGLAIS : la localisation de la locale quand elle
       existe, le fichier partage sinon. Lire `c.imageHero` seul ferait juger le fichier
       FRANCAIS pour une page anglaise — et rendrait cette recette aveugle a la parade
       qu on vient de poser. */
    const media = c.en?.imageHero ?? c.imageHero;
    if (c.en && media) {
      porteurs.push({
        quoi: `categorie ${c.en.slug} : hero`,
        media,
        surcharge: c.en.alternativeHero,
      });
    }
  }
  for (const d of corpus.dossiers) {
    const media = d.en?.imageHero ?? d.imageHero;
    if (d.en && media) {
      porteurs.push({
        quoi: `dossier ${d.en.slug} : hero`,
        media,
        surcharge: d.en.alternativeHero,
      });
    }
  }
  for (const a of corpus.auteurs) {
    if (a.en && a.photo) {
      porteurs.push({
        quoi: `auteur ${a.en.slug} : photo`,
        media: a.photo,
        surcharge: a.en.alternativePhoto,
      });
    }
  }
  const conf = corpus.configuration;
  if (conf.en) {
    porteurs.push({
      quoi: 'configuration : logo',
      media: conf.logo,
      surcharge: conf.en.alternativeLogo,
    });
    porteurs.push({
      quoi: 'configuration : image de partage',
      media: conf.imagePartageDefaut,
      surcharge: conf.en.alternativePartageDefaut,
    });
  }

  // Un media DECORATIF n attend rien : son alternative est vide des deux cotes.
  return porteurs.filter((p) => !parCle.get(p.media)?.decoratif);
}

/**
 * DEUX MECANISMES, ET IL EN FAUT UN — mis a jour le 2026-08-14 (tache `f011a634`).
 *
 * Ce cas exigeait une SURCHARGE sur chaque media servi en anglais. Depuis que les visuels
 * porteurs de texte ont leur propre fichier par locale, ce n est plus la seule reponse, et
 * ce n est plus la bonne pour eux :
 *
 *   - media PARTAGE entre les deux locales -> la surcharge localisee est le seul moyen
 *     (le fichier est le meme, son `alternativeText` aussi) ;
 *   - media LOCALISE (`…​.en.svg`) -> le fichier anglais porte SA propre alternative au
 *     manifeste, et une surcharge en plus serait un second porteur du meme texte, a
 *     diverger.
 *
 * Ce qui se garde n a pas change : qu AUCUNE alternative francaise ne soit servie sur une
 * page anglaise. C est le chemin qui differe, pas le resultat.
 */
test('RECETTE — tout media servi sur une page ANGLAISE et non decoratif porte une alternative ANGLAISE', () => {
  const corpus = chargerCorpus(path.join(RACINE_CMS, 'data'));
  const manquants = porteursAnglais(corpus).filter(
    (p) => !p.surcharge && !p.media.endsWith('.en.svg')
  );

  assert.deepEqual(
    manquants.map((p) => `${p.quoi} (${p.media})`),
    [],
    'ces medias sont PARTAGES et sans surcharge : ils sortiraient en francais sur une page anglaise'
  );
});

test('RECETTE — aucune surcharge anglaise ne recopie l alternative francaise, mot pour mot', () => {
  const corpus = chargerCorpus(path.join(RACINE_CMS, 'data'));
  const parCle = new Map(corpus.medias.map((m) => [m.cle, m]));

  /* LE CRITERE EST L EGALITE, PAS UNE HEURISTIQUE DE LANGUE. C est ce qui a fait
     defaut au compteur de `verifier-langue.mjs`, qui cherchait des lettres accentuees
     dans un manifeste ECRIT SANS ACCENTS : il rendait 0 sur 28 alt francais, et un
     compteur a zero se lit « rien a signaler ». Comparer a la source, c est exact. */
  const recopies = porteursAnglais(corpus).filter(
    (p) => p.surcharge !== undefined && p.surcharge === parCle.get(p.media)?.alternativeText
  );

  assert.deepEqual(recopies.map((p) => p.quoi), []);
});

test('RECETTE — le corpus versionne porte 8 surcharges, celles des medias PARTAGES, et AUCUNE en francais', () => {
  const corpus = chargerCorpus(path.join(RACINE_CMS, 'data'));
  const porteurs = porteursAnglais(corpus);

  /* SEPT, ET NON PLUS VINGT-NEUF (2026-08-14, tache `f011a634`). Les 22 visuels porteurs
     de texte ont desormais un fichier par locale : leur alternative anglaise vit au
     manifeste, avec le fichier, et la surcharge a ete RETIREE — deux porteurs du meme
     texte finissent par diverger. Restent les medias vraiment partages : les cinq
     portraits d auteur, le logo et l image de partage par defaut.

     HUIT DEPUIS LE 2026-08-16 : la carte de partage EDITORIALE de A01 s ajoute a eux.
     Elle est partagee entre les deux locales par une decision ecrite au manifeste — « UN
     SEUL fichier pour les deux locales […] aucune PHRASE n y est gravee : deux noms
     propres, deux nombres, une unite » —, donc la surcharge localisee est bien le seul
     moyen, exactement comme pour le logo. */
  assert.equal(porteurs.filter((p) => p.surcharge).length, 8);
  assert.equal(porteurs.filter((p) => p.media.endsWith('.en.svg')).length, 22);
  assert.equal(
    porteurs.filter((p) => p.surcharge && p.media.endsWith('.en.svg')).length,
    0,
    'un media localise NE DOIT PAS porter en plus une surcharge : le fichier dit deja tout'
  );

  /* La locale FRANCAISE n en porte aucune, et c est le sens meme du dispositif :
     l alternative native EST deja francaise. Une surcharge FR serait une seconde
     copie de la meme phrase, a diverger. */
  const surchargesFr = [
    ...corpus.articles.map((a) => a.fr.alternativeCouverture),
    ...corpus.articles.flatMap((a) =>
      a.fr.contenu
        .filter((b: any) => b.__component === 'bloc.image-legendee')
        .map((b: any) => b.alternative)
    ),
    ...corpus.categories.map((c) => c.fr.alternativeHero),
    ...corpus.dossiers.map((d) => d.fr.alternativeHero),
    ...corpus.auteurs.map((a) => a.fr.alternativePhoto),
    ...corpus.articles.map((a) => a.fr.seo?.alternativePartage),
    corpus.configuration.fr?.alternativeLogo,
    corpus.configuration.fr?.alternativePartageDefaut,
  ].filter((v) => v !== undefined);

  assert.deepEqual(surchargesFr, []);
});
