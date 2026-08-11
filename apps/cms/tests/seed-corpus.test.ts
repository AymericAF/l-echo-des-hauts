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

  /* Un media par PLACEMENT du §6.7 : couverture, galerie, `bloc.image-legendee`,
     portrait d auteur, configuration. Les conditions 5 et 7 se jugent sur
     l EMPLOI reel — sans ces emplois, elles ne seraient exercables par rien. */
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>';
  for (const rel of [
    'medias/couvertures/A05.svg',
    'medias/identite/logo.svg',
    'medias/identite/partage.svg',
    'medias/blocs/A05-piece.svg',
    'medias/galeries/A05-1.svg',
    'medias/auteurs/hakim-zerrouki.svg',
  ]) {
    ecrire(rel, svg);
  }
  // La VOIE est DERIVEE de l ayant droit : rien a saisir sur un media du projet.
  const duProjet = (alternativeText: string) => ({
    alternativeText,
    ayantDroit: 'Œuvre du projet',
    licence: 'Œuvre du projet',
  });
  ecrire(
    'medias/manifeste.json',
    JSON.stringify({
      // La ligne de credit est COMPOSEE depuis ces champs (§6.5), jamais ecrite.
      'couvertures/A05.svg': duProjet('Bassin versant'),
      'identite/logo.svg': duProjet('Logo'),
      'identite/partage.svg': duProjet('Partage'),
      'blocs/A05-piece.svg': duProjet('Fac-simile d un tableau de repartition'),
      'galeries/A05-1.svg': duProjet('Composition evoquant une conduite'),
      'auteurs/hakim-zerrouki.svg': duProjet('Monogramme HZ'),
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
        photo: 'auteurs/hakim-zerrouki.svg',
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
      '::: image-legendee image=blocs/A05-piece.svg legende="Repartition" credit="Œuvre du projet"',
      ':::',
      '',
      '::: galerie images=galeries/A05-1.svg legende="La conduite" disposition=grille',
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
  assert.equal(corpus.medias.length, 6);
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

/** Ecrit un corpus minimal dont le media `cle` porte `meta`. */
function corpusAvecMeta(cle: string, meta: Record<string, unknown>, racineDonnee?: string): string {
  const racine = racineDonnee ?? ecrireCorpusMinimal();
  const chemin = path.join(racine, 'medias/manifeste.json');
  const manifeste = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  manifeste[cle] = meta;
  fs.writeFileSync(chemin, JSON.stringify(manifeste));
  return racine;
}

/** Ecrit un corpus minimal dont le media de couverture porte `meta`. */
function corpusAvecMediaMeta(meta: Record<string, unknown>): string {
  return corpusAvecMeta('couvertures/A05.svg', meta);
}

/** Pose le sidecar de relevee du §6.7 la ou la garde ira le lire. */
function ecrireSidecar(racine: string, cle: string, contenu: unknown): void {
  const chemin = path.join(racine, 'medias', 'sources', `${path.basename(cle)}.json`);
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  fs.writeFileSync(chemin, JSON.stringify(contenu), 'utf8');
}

/** Un relevee de voie C complet — celui d un document du domaine public. */
const RELEVEE_C = {
  urlFichier: 'https://exemple.test/fichiers/registre-1910.jpg',
  urlPage: 'https://exemple.test/pieces/registre-1910',
  licence: 'Public Domain Mark 1.0',
  dateReleve: '2026-08-12',
  parQui: 'Aymeric Filliot',
  sha256: 'b'.repeat(64),
};

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
  // Un fichier tiers ne peut vivre QUE dans `bloc.image-legendee` — le seul
  // endroit du modele qui sache afficher un credit en propre (§6.3, voie C).
  const racine = corpusAvecMeta('blocs/A05-piece.svg', {
    alternativeText: 'Page de registre, vers 1910',
    ayantDroit: 'Jeanne Aubry',
    licence: 'CC BY 4.0',
    modifications: 'recadre en carre, converti en AVIF',
    voie: 'C',
  });
  ecrireSidecar(racine, 'blocs/A05-piece.svg', { ...RELEVEE_C, licence: 'CC BY 4.0' });

  const corpus = chargerCorpus(racine);
  const media = corpus.medias.find((m) => m.cle === 'blocs/A05-piece.svg');
  assert.equal(media?.caption, 'Jeanne Aubry — CC BY 4.0 — recadre en carre, converti en AVIF');
  assert.equal(media?.voie, 'C');
  assert.deepEqual(media?.placements, ['image-legendee']);
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
/* LES QUATRE CONDITIONS DU §6.7 REDEVENUES EXPRIMABLES                 */
/*                                                                      */
/* `seed-voies.test.ts` juge le module. Ce qui se prouve ICI est que la  */
/* garde est BRANCHEE sur le chemin que le seed emprunte, et qu'elle lit */
/* le placement REEL — pas le dossier du fichier. Une condition juste    */
/* dans un module que personne n'appelle ne garde rien.                  */
/* ------------------------------------------------------------------ */

test('LA VOIE — elle est DERIVEE sur les medias du projet, sans une saisie', () => {
  const corpus = chargerCorpus(ecrireCorpusMinimal());
  assert.deepEqual(
    corpus.medias.map((m) => m.voie),
    corpus.medias.map(() => 'B'),
    'les medias dont nous sommes l ayant droit derivent tous en voie B'
  );
});

test('LA VOIE — un media tiers SANS voie declaree est refuse, en le nommant', () => {
  const message = refusDe(
    corpusAvecMeta('blocs/A05-piece.svg', {
      alternativeText: 'Page de registre',
      ayantDroit: 'Jeanne Aubry',
      licence: 'CC0 1.0',
    })
  );
  assert.match(message, /blocs\/A05-piece\.svg/, 'le refus doit NOMMER le media');
  assert.match(message, /voie/i);
});

test('LES PLACEMENTS se lisent sur l EMPLOI, pas sur le dossier du fichier', () => {
  const corpus = chargerCorpus(ecrireCorpusMinimal());
  const placements = Object.fromEntries(corpus.medias.map((m) => [m.cle, m.placements]));
  assert.deepEqual(placements['couvertures/A05.svg'], ['couverture']);
  assert.deepEqual(placements['galeries/A05-1.svg'], ['galerie']);
  assert.deepEqual(placements['blocs/A05-piece.svg'], ['image-legendee']);
  assert.deepEqual(placements['auteurs/hakim-zerrouki.svg'], ['auteur-photo']);
  assert.deepEqual(placements['identite/logo.svg'], ['configuration']);
});

test('CONDITION 5 — une voie C EN COUVERTURE fait echouer le chargement, media nomme', () => {
  const racine = corpusAvecMeta('couvertures/A05.svg', {
    alternativeText: 'Gravure du bassin',
    ayantDroit: 'Bibliotheque de Val-d Ambre',
    licence: 'Public Domain Mark 1.0',
    voie: 'C',
  });
  ecrireSidecar(racine, 'couvertures/A05.svg', RELEVEE_C);

  const message = refusDe(racine);
  assert.match(message, /couvertures\/A05\.svg/);
  assert.match(message, /couverture/);
  assert.match(message, /voie C/i);
});

test('CONDITION 5 — une voie C EN GALERIE fait echouer le chargement, media nomme', () => {
  const racine = corpusAvecMeta('galeries/A05-1.svg', {
    alternativeText: 'Photographie de la conduite, vers 1912',
    ayantDroit: 'Bibliotheque de Val-d Ambre',
    licence: 'Public Domain Mark 1.0',
    voie: 'C',
  });
  ecrireSidecar(racine, 'galeries/A05-1.svg', RELEVEE_C);

  const message = refusDe(racine);
  assert.match(message, /galeries\/A05-1\.svg/);
  assert.match(message, /galerie/);
});

test('CONDITION 5 — la MEME voie C dans `bloc.image-legendee` passe : c est le placement qui juge', () => {
  const racine = corpusAvecMeta('blocs/A05-piece.svg', {
    alternativeText: 'Page de registre, vers 1910',
    ayantDroit: 'Bibliotheque de Val-d Ambre',
    licence: 'Public Domain Mark 1.0',
    voie: 'C',
  });
  ecrireSidecar(racine, 'blocs/A05-piece.svg', RELEVEE_C);

  const corpus = chargerCorpus(racine);
  assert.equal(corpus.medias.find((m) => m.cle === 'blocs/A05-piece.svg')?.voie, 'C');
});

test('CONDITION 6 — une voie C sans sidecar fait echouer le chargement, chemin attendu nomme', () => {
  const message = refusDe(
    corpusAvecMeta('blocs/A05-piece.svg', {
      alternativeText: 'Page de registre, vers 1910',
      ayantDroit: 'Bibliotheque de Val-d Ambre',
      licence: 'Public Domain Mark 1.0',
      voie: 'C',
    })
  );
  assert.match(message, /A05-piece\.svg/);
  assert.match(message, /sources[\\/]A05-piece\.svg\.json/);
});

test('CONDITION 7 — les portraits VERSIONNES sont des avatars de voie B : exemptes par construction', () => {
  const corpus = chargerCorpus(ecrireCorpusMinimal());
  const portrait = corpus.medias.find((m) => m.placements.includes('auteur-photo'));
  assert.equal(portrait?.voie, 'B');
});

test('CONDITION 7 — un portrait de voie D sans qualification de la personne est REFUSE', () => {
  const racine = corpusAvecMeta('auteurs/hakim-zerrouki.svg', {
    alternativeText: 'Portrait de trois quarts, atelier',
    ayantDroit: 'Jeanne Aubry',
    licence: 'CC0 1.0',
    voie: 'D',
  });
  // Licence irreprochable, sidecar present : c est LE cas qui compte, celui ou
  // tout ce qui se verifie facilement est vert. Ce qui manque est le second
  // relevee, celui de la personne representee (§6.3, D.1).
  ecrireSidecar(racine, 'auteurs/hakim-zerrouki.svg', { ...RELEVEE_C, licence: 'CC0 1.0' });

  const message = refusDe(racine);
  assert.match(message, /auteurs\/hakim-zerrouki\.svg/);
  assert.match(message, /qualification/i);
  assert.match(message, /Q1/);
});

test('CONDITION 7 — un portrait de voie D COMPLET passe', () => {
  const racine = corpusAvecMeta('auteurs/hakim-zerrouki.svg', {
    alternativeText: 'Cadrage sur les mains et le carnet, visage hors champ',
    ayantDroit: 'Jeanne Aubry',
    licence: 'CC0 1.0',
    voie: 'D',
  });
  ecrireSidecar(racine, 'auteurs/hakim-zerrouki.svg', {
    ...RELEVEE_C,
    licence: 'CC0 1.0',
    qualification: 'Q1',
    preuve: 'Fichier ouvert en pleine resolution : visage hors champ, aucune enseigne lisible.',
  });

  const corpus = chargerCorpus(racine);
  assert.equal(corpus.medias.find((m) => m.cle === 'auteurs/hakim-zerrouki.svg')?.voie, 'D');
});

test('CONDITION 7 — une licence hors D.3 est refusee sur un portrait, MEME blanche au §6.2', () => {
  // « Photographie d Aymeric Filliot » est admise par la liste blanche generale
  // du §6.2 (condition 4) et absente de D.3. Les deux conditions se CUMULENT :
  // c est exactement ce que le dernier paragraphe du §6.7 dit.
  const racine = corpusAvecMeta('auteurs/hakim-zerrouki.svg', {
    alternativeText: 'Portrait en contre-jour',
    ayantDroit: 'Aymeric Filliot',
    licence: "Photographie d'Aymeric Filliot",
    voie: 'D',
  });
  ecrireSidecar(racine, 'auteurs/hakim-zerrouki.svg', {
    ...RELEVEE_C,
    licence: "Photographie d'Aymeric Filliot",
    qualification: 'Q1',
    preuve: 'Visage hors champ.',
  });

  const message = refusDe(racine);
  assert.match(message, /auteurs\/hakim-zerrouki\.svg/);
  assert.match(message, /D\.3/);
});

test('LES TROIS CONDITIONS DEJA EN PLACE ne sont pas perdues au passage', () => {
  // alternativeText vide (2), credit vide (3), licence hors liste blanche (4) :
  // un durcissement qui relacherait l existant serait une regression muette.
  const sansAlt = ecrireCorpusMinimal();
  corpusAvecMeta(
    'couvertures/A05.svg',
    { alternativeText: '  ', ayantDroit: 'Œuvre du projet', licence: 'CC0 1.0' },
    sansAlt
  );
  assert.match(refusDe(sansAlt), /alternativeText/);

  assert.match(
    refusDe(corpusAvecMediaMeta({ alternativeText: 'X', ayantDroit: 'Œuvre du projet' })),
    /licence/
  );
  assert.match(
    refusDe(
      corpusAvecMediaMeta({
        alternativeText: 'X',
        ayantDroit: 'Œuvre du projet',
        licence: 'CC BY-SA 4.0',
      })
    ),
    /liste blanche/
  );
});
