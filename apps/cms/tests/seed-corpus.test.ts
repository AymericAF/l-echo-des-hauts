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

import { chargerCorpus } from '../scripts/seed/corpus.ts';
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
  ecrire('medias/identite/partage.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  ecrire(
    'medias/manifeste.json',
    JSON.stringify({
      // La ligne de credit est COMPOSEE depuis ces champs (§6.5), jamais ecrite.
      'couvertures/A05.svg': {
        alternativeText: 'Bassin versant',
        ayantDroit: 'Œuvre du projet',
        licence: 'Œuvre du projet',
      },
      'identite/logo.svg': {
        alternativeText: 'Logo',
        ayantDroit: 'Œuvre du projet',
        licence: 'Œuvre du projet',
      },
      'identite/partage.svg': {
        alternativeText: 'Partage',
        ayantDroit: 'Œuvre du projet',
        licence: 'Œuvre du projet',
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
      imagePartageDefaut: 'identite/partage.svg',
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
    licence: 'Œuvre du projet',
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
      licence: 'Œuvre du projet',
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

/* ------------------------------------------------------------------ */
/* `decoratif: true` — une image qui ne dit rien le DECLARE            */
/* ------------------------------------------------------------------ */

/**
 * Pourquoi ce champ existe (tache `face261a`).
 *
 * Le controle 5 du §11 du plan editorial exige un `alternativeText` NON VIDE sur
 * chaque media, et cette garde le tenait. La regle est bonne par defaut et mauvaise
 * dans un cas : une image DECORATIVE — qui ne porte aucune information que le texte
 * voisin ne porte deja — doit sortir en `alt=""`. C est une forme reconnue, qu axe-core
 * accepte, et qui dit a un lecteur d ecran de PASSER l image. La contraindre a porter
 * une alternative produit l inverse du but : « Composition graphique evoquant un seau
 * de traite », six fois de suite dans une galerie, est du bruit qui se fait lire.
 *
 * Ce que ce champ NE FAIT PAS : autoriser l oubli. Une alternative absente et une
 * alternative volontairement vide ne doivent JAMAIS se ressembler — sinon la garde ne
 * protege plus rien et « decoratif » devient la case qu on coche pour se taire. D ou
 * les deux refus symetriques ci-dessous : `alternativeText` vide SANS `decoratif` reste
 * une faute, et `decoratif: true` AVEC une alternative non vide en est une autre.
 */
test('chargerCorpus accepte un alternativeText vide quand `decoratif: true` est DECLARE', () => {
  const racine = ecrireCorpusMinimal();
  const chemin = path.join(racine, 'medias/manifeste.json');
  const manifeste = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  manifeste['couvertures/A05.svg'].alternativeText = '';
  manifeste['couvertures/A05.svg'].decoratif = true;
  fs.writeFileSync(chemin, JSON.stringify(manifeste));

  const corpus = chargerCorpus(racine);
  const media = corpus.medias.find((m: any) => m.cle === 'couvertures/A05.svg');
  assert.equal(media.alternativeText, '', 'ce qui part vers la mediatheque doit etre la chaine vide');
  assert.equal(media.decoratif, true, 'la declaration doit voyager avec le media, pas se deviner');
});

test('chargerCorpus refuse un alternativeText vide SANS declaration `decoratif` (controle 5)', () => {
  const racine = ecrireCorpusMinimal();
  const chemin = path.join(racine, 'medias/manifeste.json');
  const manifeste = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  manifeste['couvertures/A05.svg'].alternativeText = '';
  fs.writeFileSync(chemin, JSON.stringify(manifeste));

  assert.throws(
    () => chargerCorpus(racine),
    (e: unknown) => {
      assert.ok(e instanceof ErreurCorpus);
      assert.match((e as Error).message, /decoratif/, 'le message doit nommer la SEULE facon legitime de vider une alternative');
      return true;
    },
  );
});

test('chargerCorpus refuse `decoratif: true` accompagne d une alternative NON vide', () => {
  const racine = ecrireCorpusMinimal();
  const chemin = path.join(racine, 'medias/manifeste.json');
  const manifeste = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  manifeste['couvertures/A05.svg'].decoratif = true;
  fs.writeFileSync(chemin, JSON.stringify(manifeste));

  // Les deux se contredisent : ou l image porte une information, ou elle n en porte
  // pas. Laisser passer les deux, c est laisser la sortie trancher au hasard.
  assert.throws(() => chargerCorpus(racine), ErreurCorpus);
});

test('chargerCorpus refuse un `decoratif` qui ne soit pas le booleen `true`', () => {
  for (const valeur of ['true', 1, {}, null]) {
    const racine = ecrireCorpusMinimal();
    const chemin = path.join(racine, 'medias/manifeste.json');
    const manifeste = JSON.parse(fs.readFileSync(chemin, 'utf8'));
    manifeste['couvertures/A05.svg'].alternativeText = '';
    manifeste['couvertures/A05.svg'].decoratif = valeur;
    fs.writeFileSync(chemin, JSON.stringify(manifeste));

    assert.throws(
      () => chargerCorpus(racine),
      ErreurCorpus,
      `« ${JSON.stringify(valeur)} » ne doit pas valoir declaration`,
    );
  }
});

test('chargerCorpus refuse `decoratif: false` — la case ne se coche que pour dire OUI', () => {
  const racine = ecrireCorpusMinimal();
  const chemin = path.join(racine, 'medias/manifeste.json');
  const manifeste = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  manifeste['couvertures/A05.svg'].decoratif = false;
  fs.writeFileSync(chemin, JSON.stringify(manifeste));

  // Un `false` explicite est un bruit qui se met a diverger : le defaut EST
  // « non decoratif », et un champ qui redit le defaut finit par le contredire.
  assert.throws(() => chargerCorpus(racine), ErreurCorpus);
});

/* ------------------------------------------------------------------ */
/* Le corpus REEL : ce qui est declare decoratif, et ce qui ne l est pas */
/* ------------------------------------------------------------------ */

test('les 22 medias de galerie du corpus reel sont declares decoratifs, et eux seuls', () => {
  const corpus = chargerCorpus(DATA_REEL);
  const decoratifs = corpus.medias.filter((m: any) => m.decoratif).map((m: any) => m.cle).sort();
  const galeries = corpus.medias.filter((m: any) => m.cle.startsWith('galeries/')).map((m: any) => m.cle).sort();

  assert.equal(galeries.length, 22, 'le corpus porte 22 medias de galerie');
  assert.deepEqual(decoratifs, galeries, 'aucun media hors galerie ne doit etre declare decoratif');
  for (const m of corpus.medias) {
    if (m.decoratif) assert.equal(m.alternativeText, '');
    else assert.notEqual(m.alternativeText.trim(), '');
  }
});

test('aucune alternative du corpus reel n OUVRE en nommant le genre graphique', () => {
  const corpus = chargerCorpus(DATA_REEL);
  // Le defaut de `face261a` : « Diagramme en barres du debit de la source… » nomme
  // l objet, pas ce qu il dit. Le critere porte sur la TETE de la phrase — une forme
  // citee en incise (« … lue sur un diagramme en barres ») n est pas visee.
  const GENRE = /^(Diagramme|Courbes? d|Trois courbes|Cascade|Grille|Boucle|Frise|Trace |Profil |Elevation dessinee|Composition graphique|(Dix-huit|Dix|Vingt|Six|Quatorze|Trois|Quatre|Cinq|Neuf) (paires de barres|barres|series|lignes)|Trois series)/;
  const fautifs = corpus.medias.filter((m: any) => GENRE.test(m.alternativeText)).map((m: any) => m.cle);
  assert.deepEqual(fautifs, [], 'ces alternatives nomment leur forme au lieu de ce qu elles montrent');
});
