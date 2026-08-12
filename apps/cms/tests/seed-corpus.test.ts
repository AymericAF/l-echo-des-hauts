/**
 * Le corpus versionne est valide ENTIEREMENT avant la premiere ecriture.
 *
 * Pourquoi avant : le seed sert aussi a reconstruire l'environnement depuis le
 * depot apres une perte. Un corpus qui casse a mi-parcours laisserait une base
 * a moitie remplie, et la seconde execution rapprocherait sur un etat partiel.
 * D'ou la regle : on lit tout, on valide tout, puis seulement on ecrit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FORMATS_DE_PARTAGE, chargerCorpus, exigerFormatDePartage } from '../scripts/seed/corpus.ts';
import { SEPARATEUR, verifierFormatCredit } from '../scripts/seed/credits.ts';
import { ErreurCorpus, MediaIntrouvable } from '../scripts/seed/erreurs.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DATA_REEL = path.join(ICI, '..', 'data');

/* ------------------------------------------------------------------ */
/* Un corpus minimal, ecrit sur disque, que chaque test peut abimer.    */
/* ------------------------------------------------------------------ */

function ecrireCorpusMinimal(): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-corpus-'));
  const ecrire = (rel: string, contenu: string) => {
    const cible = path.join(racine, rel);
    fs.mkdirSync(path.dirname(cible), { recursive: true });
    fs.writeFileSync(cible, contenu, 'utf8');
  };

  ecrire('medias/couvertures/A05.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  ecrire('medias/identite/logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  ecrire('medias/identite/partage.png', 'PNG factice');
  ecrire(
    'medias/manifeste.json',
    JSON.stringify({
      // La ligne de credit est COMPOSEE depuis ces champs (§6.5), jamais ecrite.
      'couvertures/A05.svg': {
        alternativeText: 'Bassin versant',
        ayantDroit: 'Œuvre du projet',
        licence: 'CC0 1.0',
      },
      'identite/logo.svg': {
        alternativeText: 'Logo',
        ayantDroit: 'Œuvre du projet',
        licence: 'CC0 1.0',
      },
      'identite/partage.png': {
        alternativeText: 'Partage',
        ayantDroit: 'Œuvre du projet',
        licence: 'CC0 1.0',
      },
    })
  );

  ecrire(
    'categories.json',
    JSON.stringify([
      {
        ordreAffichage: 10,
        couleurAccent: '#1F5C4A',
        fr: { nom: 'Territoire', slug: 'territoire', description: 'Ce qui se decide.' },
        en: { nom: 'Territory', slug: 'territory', description: 'What gets decided.' },
      },
    ])
  );
  ecrire(
    'tags.json',
    JSON.stringify([
      { fr: { nom: 'Eau', slug: 'eau' }, en: { nom: 'Water', slug: 'water' } },
    ])
  );
  ecrire(
    'auteurs.json',
    JSON.stringify([
      {
        nom: 'Hakim Zerrouki',
        reseaux: [{ plateforme: 'site', url: 'https://exemple.test/auteur/hakim-zerrouki' }],
        fr: { slug: 'hakim-zerrouki', fonction: 'Reporter', bio: 'Sept ans en mairie.' },
        en: { slug: 'hakim-zerrouki', fonction: 'Reporter', bio: 'Seven years at the town hall.' },
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
      },
    })
  );

  const article = (locale: string, slug: string, titre: string) =>
    [
      '---',
      JSON.stringify(
        {
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
        },
        null,
        2
      ),
      '---',
      '',
      '::: texte',
      'Cinq echelons decident de l eau du plateau.',
      ':::',
      '',
    ].join('\n');

  ecrire('articles/A05.fr.md', article('fr', 'qui-decide-de-l-eau', 'Qui decide de l eau ?'));
  ecrire('articles/A05.en.md', article('en', 'who-decides-the-water', 'Who decides the water?'));

  return racine;
}

/* ------------------------------------------------------------------ */

test('chargerCorpus lit le corpus minimal et rend ses entrees', () => {
  const racine = ecrireCorpusMinimal();
  const corpus = chargerCorpus(racine);

  assert.equal(corpus.categories.length, 1);
  assert.equal(corpus.tags.length, 1);
  assert.equal(corpus.auteurs.length, 1);
  assert.equal(corpus.articles.length, 1);
  assert.equal(corpus.articles[0].fr.slug, 'qui-decide-de-l-eau');
  assert.equal(corpus.articles[0].en?.slug, 'who-decides-the-water');
  assert.equal(corpus.medias.length, 3);
});

test('chargerCorpus echoue PROPREMENT quand un fichier media reference manque sur le disque', () => {
  const racine = ecrireCorpusMinimal();
  fs.rmSync(path.join(racine, 'medias', 'couvertures', 'A05.svg'));

  assert.throws(
    () => chargerCorpus(racine),
    (e: unknown) => {
      assert.ok(e instanceof MediaIntrouvable, 'doit etre une MediaIntrouvable');
      assert.match((e as Error).message, /couvertures\/A05\.svg/);
      return true;
    }
  );
});

test('chargerCorpus echoue quand un media utilise n est pas au manifeste', () => {
  const racine = ecrireCorpusMinimal();
  const manifeste = JSON.parse(fs.readFileSync(path.join(racine, 'medias/manifeste.json'), 'utf8'));
  delete manifeste['couvertures/A05.svg'];
  fs.writeFileSync(path.join(racine, 'medias/manifeste.json'), JSON.stringify(manifeste));

  assert.throws(() => chargerCorpus(racine), ErreurCorpus);
});

test('chargerCorpus echoue quand un media n a pas d alternativeText (controle 5 du plan)', () => {
  const racine = ecrireCorpusMinimal();
  const chemin = path.join(racine, 'medias/manifeste.json');
  const manifeste = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  manifeste['couvertures/A05.svg'].alternativeText = '   ';
  fs.writeFileSync(chemin, JSON.stringify(manifeste));

  assert.throws(() => chargerCorpus(racine), ErreurCorpus);
});

test('chargerCorpus echoue quand un article pointe une categorie inconnue', () => {
  const racine = ecrireCorpusMinimal();
  const chemin = path.join(racine, 'articles/A05.fr.md');
  fs.writeFileSync(
    chemin,
    fs.readFileSync(chemin, 'utf8').replace('"categorie": "territoire"', '"categorie": "inconnue"')
  );

  assert.throws(() => chargerCorpus(racine), ErreurCorpus);
});

test('chargerCorpus echoue quand une localisation EN n a pas de slug (A-09)', () => {
  const racine = ecrireCorpusMinimal();
  const chemin = path.join(racine, 'tags.json');
  const tags = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  tags[0].en.slug = '';
  fs.writeFileSync(chemin, JSON.stringify(tags));

  assert.throws(() => chargerCorpus(racine), ErreurCorpus);
});

test('chargerCorpus echoue sur deux medias de meme nom de fichier', () => {
  const racine = ecrireCorpusMinimal();
  fs.writeFileSync(path.join(racine, 'medias/identite/A05.svg'), '<svg/>');
  const chemin = path.join(racine, 'medias/manifeste.json');
  const manifeste = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  manifeste['identite/A05.svg'] = {
    alternativeText: 'Doublon',
    ayantDroit: 'Œuvre du projet',
    licence: 'CC0 1.0',
  };
  fs.writeFileSync(chemin, JSON.stringify(manifeste));

  assert.throws(() => chargerCorpus(racine), ErreurCorpus);
});

/* ------------------------------------------------------------------ */
/* Le corpus REELLEMENT versionne du depot doit satisfaire le controle  */
/* 12 du plan editorial : 41 localisations EN portant un uid.           */
/* ------------------------------------------------------------------ */

test('le corpus versionne du depot se charge sans erreur', () => {
  const corpus = chargerCorpus(DATA_REEL);
  assert.ok(corpus.articles.length > 0);
});

test('le corpus versionne porte un slug EN non vide sur chaque localisation EN existante', () => {
  const corpus = chargerCorpus(DATA_REEL);
  const manquants: string[] = [];

  /**
   * `exigeeSurToutes` distingue les deux regimes du plan editorial, qui ne sont
   * PAS le meme (§10.5 contre §10.1) :
   *   - Categorie, Tag, Dossier, Auteur : la localisation EN est due sur TOUTES
   *     les entrees, meme celles dont aucune page EN ne sera emise ;
   *   - Article : seuls 8 des 40 sont traduits. Exiger un `en` sur chaque
   *     article ferait echouer ce test des le 9e article francais ecrit, et
   *     pousserait a fabriquer des traductions que le plan ne demande pas.
   * Dans les deux cas, une localisation EN qui EXISTE doit porter son slug : il
   * est requis (A-09) et rien ne le genere par l'API ni par le seed.
   */
  const controler = (
    famille: string,
    entrees: { en?: { slug?: string } }[],
    exigeeSurToutes: boolean
  ) => {
    for (const [i, e] of entrees.entries()) {
      if (!e.en) {
        if (exigeeSurToutes) manquants.push(`${famille}[${i}] : localisation EN absente`);
        continue;
      }
      if (!String(e.en.slug ?? '').trim()) manquants.push(`${famille}[${i}] : slug EN vide`);
    }
  };

  controler('Categorie', corpus.categories, true);
  controler('Tag', corpus.tags, true);
  controler('Dossier', corpus.dossiers, true);
  controler('Auteur', corpus.auteurs, true);
  controler('Article', corpus.articles, false);
  assert.deepEqual(manquants, []);
});

test('le corpus versionne porte les effectifs EN annonces par le controle 12', () => {
  const corpus = chargerCorpus(DATA_REEL);
  const compteEn = (entrees: { en?: unknown }[]) => entrees.filter((e) => e.en).length;
  assert.equal(compteEn(corpus.categories), 6, 'Categorie EN');
  assert.equal(compteEn(corpus.tags), 20, 'Tag EN');
  assert.equal(compteEn(corpus.dossiers), 2, 'Dossier EN');
  assert.equal(compteEn(corpus.auteurs), 5, 'Auteur EN');
  assert.equal(compteEn(corpus.articles), 8, 'Article EN');
  assert.equal(
    compteEn(corpus.categories) +
      compteEn(corpus.tags) +
      compteEn(corpus.dossiers) +
      compteEn(corpus.auteurs) +
      compteEn(corpus.articles),
    41,
    'total des localisations EN portant un uid'
  );
});

/* ------------------------------------------------------------------ */
/* La LIGNE DE CREDIT au niveau du corpus — les trois sens              */
/*                                                                      */
/* `credits.ts` a ses propres tests unitaires. Ce qui se prouve ICI est  */
/* autre chose : que la garde est REELLEMENT BRANCHEE sur le chemin que  */
/* le seed emprunte. Un format juste dans un module que personne         */
/* n'appelle ne garde rien — c'est le mode d'echec que ce projet ferme   */
/* partout.                                                             */
/* ------------------------------------------------------------------ */

/** Ecrit un corpus minimal dont le media de couverture porte `meta`. */
function corpusAvecMediaMeta(meta: Record<string, unknown>): string {
  const racine = ecrireCorpusMinimal();
  const chemin = path.join(racine, 'medias/manifeste.json');
  const manifeste = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  manifeste['couvertures/A05.svg'] = meta;
  fs.writeFileSync(chemin, JSON.stringify(manifeste));
  return racine;
}

function refusDe(racine: string): string {
  try {
    chargerCorpus(racine);
  } catch (e) {
    assert.ok(e instanceof ErreurCorpus, 'doit etre une ErreurCorpus');
    return (e as Error).message;
  }
  return assert.fail('le corpus a ete ACCEPTE : la garde ne juge pas ce cas');
}

test('SENS 1 — un credit hors format est REFUSE, en nommant le media et ce qui manque', () => {
  const message = refusDe(
    corpusAvecMediaMeta({
      alternativeText: 'Bassin versant',
      ayantDroit: 'Œuvre du projet',
      // Exactement ce que le depot publiait sous les portraits : une licence
      // qui n'en est pas une.
      licence: "Portrait graphique genere ; aucune personne reelle n'est representee",
    })
  );
  assert.match(message, /couvertures\/A05\.svg/, 'le refus doit NOMMER le media');
  assert.match(message, /licence/i, 'le refus doit dire CE QUI manque');
  assert.match(message, /liste blanche/i);
});

test('SENS 1 bis — une licence exclue par le §6.2 est refusee en la citant', () => {
  const message = refusDe(
    corpusAvecMediaMeta({
      alternativeText: 'Bassin versant',
      ayantDroit: 'Jeanne Aubry',
      licence: 'CC BY-SA 4.0',
    })
  );
  assert.match(message, /couvertures\/A05\.svg/);
  assert.match(message, /CC BY-SA 4\.0/);
});

/**
 * Decision `887d2cfd`, branche A, approuvee par Aymeric le 2026-08-11 :
 * « Œuvre du projet » sort de la liste blanche des licences.
 *
 * Ce test exerce le retrecissement SUR LE CHEMIN REEL de la garde — le
 * chargement du manifeste —, et pas seulement sur la fonction pure. C est ce
 * chemin-la qu emprunte le seed : une garde verte en unitaire et muette au
 * chargement ne garderait rien.
 *
 * Il est le pendant du test « §13 point 4 applique » plus bas : celui-ci
 * constate qu aucun media versionne ne porte le statut en licence, celui-la
 * etablit que la garde le REFUSERAIT desormais. Constater un etat et tenir un
 * invariant sont deux choses.
 */
test('SENS 1 quater — « Œuvre du projet » en LICENCE est refuse, en nommant le media', () => {
  const message = refusDe(
    corpusAvecMediaMeta({
      alternativeText: 'Bassin versant',
      ayantDroit: 'Œuvre du projet',
      // Le statut d ayant droit recopie en second segment : la ligne
      // tautologique que le depot publiait avant le 2026-08-10.
      licence: 'Œuvre du projet',
    })
  );
  assert.match(message, /couvertures\/A05\.svg/, 'le refus doit NOMMER le media');
  assert.match(message, /Œuvre du projet/);
  assert.match(message, /liste blanche/i);
});

test('SENS 1 ter — CC BY sans mention des modifications est refuse', () => {
  const message = refusDe(
    corpusAvecMediaMeta({
      alternativeText: 'Bassin versant',
      ayantDroit: 'Jeanne Aubry',
      licence: 'CC BY 4.0',
    })
  );
  assert.match(message, /couvertures\/A05\.svg/);
  assert.match(message, /modification/i);
});

test('SENS 2 — un credit conforme PASSE, et arrive compose au format du §6.5', () => {
  const racine = corpusAvecMediaMeta({
    alternativeText: 'Bassin versant',
    ayantDroit: 'Jeanne Aubry',
    licence: 'CC BY 4.0',
    modifications: 'recadre en carre, converti en AVIF',
  });
  const corpus = chargerCorpus(racine);
  const media = corpus.medias.find((m) => m.cle === 'couvertures/A05.svg');
  assert.equal(media?.caption, 'Jeanne Aubry — CC BY 4.0 — recadre en carre, converti en AVIF');
});

test('SENS 3 — un credit VIDE reste refuse : la garde precedente n est PAS perdue', () => {
  for (const vide of [{}, { ayantDroit: '   ' }, { ayantDroit: 'X', licence: '  ' }]) {
    const message = refusDe(
      corpusAvecMediaMeta({ alternativeText: 'Bassin versant', ...vide })
    );
    assert.match(message, /couvertures\/A05\.svg/);
    assert.match(message, /ayantDroit|licence/);
  }
});

test('un `caption` ecrit a la main est refuse — il serait une seconde copie de la licence', () => {
  const message = refusDe(
    corpusAvecMediaMeta({
      alternativeText: 'Bassin versant',
      ayantDroit: 'Œuvre du projet',
      licence: 'CC0 1.0',
      caption: 'Œuvre du projet — CC0 1.0',
    })
  );
  assert.match(message, /couvertures\/A05\.svg/);
  assert.match(message, /caption/);
});

test('les 94 medias VERSIONNES portent une ligne de credit au format, ayant droit et licence', () => {
  const corpus = chargerCorpus(DATA_REEL);
  const horsFormat: string[] = [];
  for (const media of corpus.medias) {
    const verdict = verifierFormatCredit(media.caption);
    if (!verdict.conforme) horsFormat.push(`${media.cle} : ${verdict.motif}`);
    if (media.ayantDroit.trim() === '') horsFormat.push(`${media.cle} : ayant droit vide`);
  }
  assert.deepEqual(horsFormat, []);
  assert.equal(corpus.medias.length, 94);
});

/* ------------------------------------------------------------------ */
/* §13 point 4 — la licence des assets du depot, TRANCHEE le 2026-08-10 */
/*                                                                      */
/* Decision 90276751 d'Aymeric, branche (A) : CC0 1.0. Ce que ces deux   */
/* tests gardent n'est PAS le format — le test ci-dessus s'en charge, et */
/* la ligne tautologique « Œuvre du projet — Œuvre du projet » le        */
/* passait sans broncher. Ils gardent le fait que la DECISION est        */
/* appliquee : le second segment nomme une licence PUBLIABLE, et non le  */
/* statut d'ayant droit recopie.                                         */
/*                                                                      */
/* Pourquoi un mecanisme et pas une relecture : la valeur vit dans un    */
/* fichier de donnees de 94 entrees, qu'aucun test ne regardait au fond. */
/* Une reecriture partielle du manifeste — 93 lignes changees sur 94 —   */
/* ne ferait rougir strictement rien d'autre.                            */
/* ------------------------------------------------------------------ */

test('§13 point 4 applique : aucun media versionne ne porte le STATUT « Œuvre du projet » en licence', () => {
  const corpus = chargerCorpus(DATA_REEL);
  const tautologiques = corpus.medias
    .filter((m) => m.caption.split(` ${SEPARATEUR} `)[1]?.trim() === 'Œuvre du projet')
    .map((m) => `${m.cle} : "${m.caption}"`);
  assert.deepEqual(
    tautologiques,
    [],
    'la ligne de credit repete l ayant droit au lieu de nommer une licence — ' +
      'c est exactement ce que la decision 90276751 a tranche le 2026-08-10'
  );
});

test('§13 point 4 applique : les 5 portraits d auteur portent « Œuvre du projet — CC0 1.0 », au caractere pres', () => {
  const corpus = chargerCorpus(DATA_REEL);
  const portraits = corpus.medias.filter((m) => m.cle.startsWith('auteurs/'));
  assert.equal(portraits.length, 5, '5 portraits d auteur au manifeste');
  for (const portrait of portraits) {
    // C'est la ligne PUBLIEE sous chaque portrait (§13 point 6b, option (ii)).
    assert.equal(portrait.caption, 'Œuvre du projet — CC0 1.0', portrait.cle);
  }
});

/* ------------------------------------------------------------------ */
/* Les liens sociaux du journal : UN SEUL, et c est un arbitrage.       */
/* ------------------------------------------------------------------ */

/**
 * ARBITRAGE D AYMERIC, canal chat du Cockpit, 2026-08-07, cite : « Pour les
 * reseaux sociaux mets uniquement mon linkedin ».
 *
 * Ce que ce test garde, et pourquoi il est ici plutot que dans une revue de
 * code. `Configuration.reseaux` alimente directement le bloc de liens sociaux
 * du pied de page, sur les 86 pages du site (`PiedDePage.astro` →
 * `LiensSociaux.astro`). Une entree ajoutee dans ce fichier de donnees est donc
 * une marque de plus affichee partout, sans qu aucune ligne de code ne bouge et
 * sans qu aucun test existant ne rougisse : le seul endroit ou la decision
 * pouvait etre tenue par un mecanisme est le corpus versionne lui-meme.
 *
 * Il ne dit RIEN des auteurs (`auteurs.json`), dont les `reseaux` pointent vers
 * leur propre page du meme site : ce ne sont pas des marques tierces, et ils ne
 * sont pas l objet de cet arbitrage.
 *
 * Il ne dit rien non plus du registre des glyphes ni de l enum a huit
 * plateformes d A-30, qui restent entiers : ce que le journal PUBLIE et ce que
 * le site SAIT rendre sont deux questions distinctes. Les fixtures de
 * `apps/web/tests/fixtures/` continuent d exercer les huit valeurs — c est un
 * banc, pas la configuration du site.
 */
test('la Configuration versionnee ne porte QU UN lien social, le LinkedIn d Aymeric', () => {
  const corpus = chargerCorpus(DATA_REEL);
  assert.deepEqual(corpus.configuration.reseaux, [
    { plateforme: 'linkedin', url: 'https://www.linkedin.com/in/aymeric-filliot-37442a17a/' },
  ]);
});

// --- l image de partage par defaut doit etre RASTERISEE par les plateformes -----------

test("l image de partage par defaut en SVG est refusee — les plateformes l ignorent", () => {
  /* LE DEFAUT DU 2026-08-11 (tache 9b173668), sur la donnee REELLE et non sur une fixture.
     `imagePartageDefaut` pointait `identite/partage-defaut.svg` : accueil, rubriques,
     auteurs et dossiers sortaient un `og:image:type` = `image/svg+xml`, releve tel quel
     sur la production. Aucune balise ne manquait, le fichier existait, l URL resolvait —
     et ces pages n avaient AUCUNE image de partage. */
  const racine = ecrireCorpusMinimal();
  fs.writeFileSync(path.join(racine, 'medias', 'identite', 'partage.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const manifeste = JSON.parse(fs.readFileSync(path.join(racine, 'medias', 'manifeste.json'), 'utf8'));
  manifeste['identite/partage.svg'] = manifeste['identite/partage.png'];
  delete manifeste['identite/partage.png'];
  fs.writeFileSync(path.join(racine, 'medias', 'manifeste.json'), JSON.stringify(manifeste));
  const configuration = JSON.parse(fs.readFileSync(path.join(racine, 'configuration.json'), 'utf8'));
  configuration.imagePartageDefaut = 'identite/partage.svg';
  fs.writeFileSync(path.join(racine, 'configuration.json'), JSON.stringify(configuration));

  assert.throws(() => chargerCorpus(racine), (erreur: unknown) => {
    assert.ok(erreur instanceof ErreurCorpus);
    assert.match((erreur as Error).message, /imagePartageDefaut/);
    assert.match((erreur as Error).message, /\.svg/);
    assert.match((erreur as Error).message, /RASTERISENT/);
    return true;
  });
  fs.rmSync(racine, { recursive: true, force: true });
});

test('les formats acceptes sont ceux que les plateformes rendent, et rien d autre', () => {
  assert.deepEqual(FORMATS_DE_PARTAGE, ['.png', '.jpg', '.jpeg', '.webp']);
  for (const refuse of ['identite/x.svg', 'identite/x.avif', 'identite/x.gif', 'identite/x']) {
    assert.throws(() => exigerFormatDePartage(refuse, 'configuration : imagePartageDefaut'), ErreurCorpus, refuse);
  }
  for (const accepte of ['identite/x.png', 'identite/x.JPG', 'identite/x.jpeg', 'identite/x.webp']) {
    exigerFormatDePartage(accepte, 'configuration : imagePartageDefaut');
  }
});

test('le corpus REEL du depot sert une carte de partage rasterisable', () => {
  /* Le corpus de test ci-dessus est fabrique : il ne dirait rien de la donnee publiee.
     Ce cas-ci lit `data/configuration.json`, celui que le seed televerse. */
  const reel = chargerCorpus(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data'));
  exigerFormatDePartage(reel.configuration.imagePartageDefaut, 'configuration : imagePartageDefaut');
});
