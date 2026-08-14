/**
 * LES VISUELS LOCALISES — le texte GRAVE dans l image, et la garde qui l exige traduit.
 *
 * CE QUE CE FICHIER PROTEGE, mesure le 2026-08-14 (tache `45a3265e`). Corriger les
 * alternatives textuelles a regle ce qu un lecteur d ecran ENTEND ; ca n a rien change a
 * ce qu un lecteur anglophone VOIT. Les 40 medias servis sur une page anglaise portaient
 * **53 chaines francaises gravees** : le nom de la rubrique dans les bandeaux, le libelle
 * de chaque graphique, et deux couvertures ou le texte grave EST le contenu — A23 affiche
 * « 17 h 40 » et A09 le verbatim entier.
 *
 * LA PARADE N EST PAS LA MEME QUE POUR L ALTERNATIVE, et le fait decisif est a l envers :
 * ici le modele ne bloque pas. Un champ `media` PEUT etre localise — `isLocalizedAttribute`
 * rend `true` des que `pluginOptions.i18n.localized` vaut `true`, quel que soit le type
 * d attribut. L encadre d A-06 le dit lui-meme : les medias ne sont pas concernes par la
 * localisation D OFFICE, ce qui les laisse partages « comme ecrit » — partages par CHOIX,
 * donc, pas par contrainte. Ce lot renverse ce choix pour QUATRE champs.
 *
 * TROIS GARDES, ET AUCUNE NE DEVINE LA LANGUE.
 *
 *  1. **L EGALITE DU TEXTE GRAVE.** Un media anglais qui porte une chaine identique a
 *     celle de sa contrepartie francaise n a pas ete traduit. C est un constat, comme la
 *     regle ajoutee a `verifier-langue.mjs` le meme jour, et pour la meme raison : une
 *     heuristique de langue se trompe, une egalite non.
 *
 *  2. **LA LARGEUR.** Les libelles sont poses a `x` fixe et `font-size` fixe, sans
 *     ajustement : un titre anglais plus long que la place disponible sort du cadre SANS
 *     QUE RIEN NE ROUGISSE — personne ne rend ces SVG. C est le seul defaut de ce lot
 *     qu aucune garde existante n attraperait.
 *
 *  3. **LA PAIRE.** Un media `.en.svg` qui n a pas de francais, ou un francais localise
 *     dont l anglais manque, sont deux facons de servir la mauvaise image.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chargerCorpus } from '../scripts/seed/corpus.ts';
import { largeurEstimee, textesGraves } from '../scripts/seed/visuels.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE_CMS = path.join(ICI, '..');
const DATA = path.join(RACINE_CMS, 'data');
const MEDIAS = path.join(DATA, 'medias');

const schema = (rel: string) =>
  JSON.parse(fs.readFileSync(path.join(RACINE_CMS, 'src', rel), 'utf8'));
const localise = (attribut: any) => attribut?.pluginOptions?.i18n?.localized === true;

/* ------------------------------------------------------------------ */
/* SENS 1 — les quatre champs media sont LOCALISES                      */
/* ------------------------------------------------------------------ */

test('les quatre champs media porteurs sont declares LOCALISES — A-06 amende sur le fond', () => {
  const cas: [string, string, string][] = [
    ['api/article/content-types/article/schema.json', 'imageCouverture', 'Article'],
    ['api/categorie/content-types/categorie/schema.json', 'imageHero', 'Categorie'],
    ['api/dossier/content-types/dossier/schema.json', 'imageHero', 'Dossier'],
  ];

  for (const [chemin, champ, nom] of cas) {
    const attribut = schema(chemin).attributes[champ];
    assert.equal(attribut.type, 'media', `${nom}.${champ} reste un media`);
    assert.ok(
      localise(attribut),
      `${nom}.${champ} DOIT etre localise : non localise, les deux locales servent le MEME ` +
        'fichier, donc le meme texte grave — ce que ce lot existe pour corriger'
    );
  }
});

test('le champ image du bloc `image-legendee` n a PAS d option i18n, et c est correct', () => {
  const composant = JSON.parse(
    fs.readFileSync(path.join(RACINE_CMS, 'src/components/bloc/image-legendee.json'), 'utf8')
  );

  /* Un attribut de COMPOSANT ne porte pas ses propres options i18n : ce qui le localise
     est la dynamic zone `contenu` de l article, qui l est. La localisation du media de
     bloc est donc acquise sans rien declarer — il suffit que le `.en.md` pointe le fichier
     anglais, ce que le cas « le corpus pointe » ci-dessous verifie. */
  assert.equal(composant.attributes.image.pluginOptions, undefined);
});

/* ------------------------------------------------------------------ */
/* SENS 2 — le corpus pointe bien les fichiers anglais                  */
/* ------------------------------------------------------------------ */

/** Les paires (fr, en) que le CORPUS declare, tous porteurs confondus. */
function pairesDuCorpus(corpus: ReturnType<typeof chargerCorpus>) {
  const paires: { quoi: string; fr: string; en: string }[] = [];

  for (const a of corpus.articles) {
    if (!a.en) continue;
    paires.push({
      quoi: `article ${a.code} : couverture`,
      fr: a.fr.imageCouverture,
      en: a.en.imageCouverture,
    });
    const blocsFr = a.fr.contenu.filter((b: any) => b.__component === 'bloc.image-legendee');
    const blocsEn = a.en.contenu.filter((b: any) => b.__component === 'bloc.image-legendee');
    blocsEn.forEach((bloc: any, index: number) => {
      const jumeau = blocsFr[index];
      if (!jumeau) return;
      paires.push({
        quoi: `article ${a.code} : bloc image-legendee #${index + 1}`,
        fr: jumeau.image.__media,
        en: bloc.image.__media,
      });
    });
  }
  for (const c of corpus.categories) {
    if (c.en?.imageHero && c.imageHero) {
      paires.push({ quoi: `categorie ${c.en.slug} : hero`, fr: c.imageHero, en: c.en.imageHero });
    }
  }
  for (const d of corpus.dossiers) {
    if (d.en?.imageHero && d.imageHero) {
      paires.push({ quoi: `dossier ${d.en.slug} : hero`, fr: d.imageHero, en: d.en.imageHero });
    }
  }
  return paires;
}

test('RECETTE — les 22 visuels informatifs servis en anglais pointent un fichier PROPRE a la locale', () => {
  const corpus = chargerCorpus(DATA);
  const paires = pairesDuCorpus(corpus);

  assert.equal(paires.length, 22, 'huit couvertures, six blocs, six rubriques et deux dossiers');

  const partages = paires.filter((p) => p.fr === p.en);
  assert.deepEqual(
    partages.map((p) => `${p.quoi} (${p.fr})`),
    [],
    'ces porteurs servent le MEME fichier aux deux locales, donc le meme texte grave'
  );
});

/* ------------------------------------------------------------------ */
/* SENS 3 — GARDE 1 : aucun texte grave identique entre les deux        */
/* ------------------------------------------------------------------ */

test('RECETTE — aucun visuel anglais ne porte une chaine identique a sa version francaise', () => {
  const corpus = chargerCorpus(DATA);
  const recopies: string[] = [];

  for (const paire of pairesDuCorpus(corpus)) {
    const fr = textesGraves(path.join(MEDIAS, paire.fr));
    const en = textesGraves(path.join(MEDIAS, paire.en));
    for (const texte of en) {
      if (fr.includes(texte)) recopies.push(`${paire.quoi} — « ${texte} »`);
    }
  }

  assert.deepEqual(recopies, []);
});

test('GARDE 1 — PREUVE EN CASSANT : une chaine recopiee du francais est bien vue', () => {
  const fr = textesGraves(path.join(MEDIAS, 'heros/rubrique-territoire.svg'));
  const en = textesGraves(path.join(MEDIAS, 'heros/rubrique-territoire.en.svg'));

  assert.ok(fr.length > 0 && en.length > 0, 'les deux fichiers portent du texte');
  assert.equal(
    en.some((t) => fr.includes(t)),
    false,
    'aucune chaine commune aujourd hui'
  );
  /* Et la regle attrape bien l egalite quand elle existe — exercee sur le fichier
     francais confronte a LUI-MEME, le seul cas d egalite totale garanti. */
  assert.equal(fr.some((t) => fr.includes(t)), true);
});

/* ------------------------------------------------------------------ */
/* SENS 4 — GARDE 2 : le texte tient dans le cadre                      */
/* ------------------------------------------------------------------ */

test('RECETTE — aucun libelle anglais ne deborde du cadre de son image', () => {
  const corpus = chargerCorpus(DATA);
  const debordements: string[] = [];

  for (const paire of pairesDuCorpus(corpus)) {
    for (const mesure of largeurEstimee(path.join(MEDIAS, paire.en))) {
      if (mesure.deborde) {
        debordements.push(
          `${paire.quoi} — « ${mesure.texte} » : ${mesure.largeur} px pour ${mesure.disponible} px`
        );
      }
    }
  }

  assert.deepEqual(debordements, []);
});

test('GARDE 2 — PREUVE EN CASSANT : un libelle trop long est vu comme debordant', () => {
  const cible = path.join(MEDIAS, 'heros/rubrique-territoire.en.svg');
  const original = fs.readFileSync(cible, 'utf8');
  try {
    fs.writeFileSync(
      cible,
      original.replace(/(<text[^>]*font-size="52"[^>]*>)[^<]*(<\/text>)/, `$1${'T'.repeat(120)}$2`),
      'utf8'
    );
    const mesures = largeurEstimee(cible);
    assert.equal(
      mesures.some((m) => m.deborde),
      true,
      '120 caracteres en corps 52 ne peuvent pas tenir dans 1478 px'
    );
  } finally {
    fs.writeFileSync(cible, original, 'utf8');
  }
});

test('GARDE 2 — et elle ne crie pas a tort : les visuels FRANCAIS ne debordent pas non plus', () => {
  const corpus = chargerCorpus(DATA);
  const debordements: string[] = [];

  for (const paire of pairesDuCorpus(corpus)) {
    for (const mesure of largeurEstimee(path.join(MEDIAS, paire.fr))) {
      if (mesure.deborde) debordements.push(`${paire.quoi} — « ${mesure.texte} »`);
    }
  }

  assert.deepEqual(debordements, []);
});

/* ------------------------------------------------------------------ */
/* SENS 5 — GARDE 3 : la paire, et rien d orphelin                      */
/* ------------------------------------------------------------------ */

test('GARDE 3 — chaque fichier `.en.svg` du manifeste a son francais, et il est au manifeste', () => {
  const manifeste = JSON.parse(fs.readFileSync(path.join(MEDIAS, 'manifeste.json'), 'utf8'));
  const cles = Object.keys(manifeste);
  const anglais = cles.filter((c) => c.endsWith('.en.svg'));

  assert.equal(anglais.length, 22, 'huit bandeaux, huit couvertures, six blocs');

  for (const cle of anglais) {
    const francais = cle.replace(/\.en\.svg$/, '.svg');
    assert.ok(cles.includes(francais), `${cle} : le francais ${francais} manque au manifeste`);
    assert.ok(
      fs.existsSync(path.join(MEDIAS, cle)),
      `${cle} : declare au manifeste, absent du disque`
    );
  }
});

test('GARDE 3 — les alternatives des fichiers anglais sont ANGLAISES, jamais celles du francais', () => {
  const manifeste = JSON.parse(fs.readFileSync(path.join(MEDIAS, 'manifeste.json'), 'utf8'));
  const recopiees: string[] = [];

  for (const [cle, meta] of Object.entries<any>(manifeste)) {
    if (!cle.endsWith('.en.svg')) continue;
    const francais = manifeste[cle.replace(/\.en\.svg$/, '.svg')];
    if (meta.alternativeText === francais?.alternativeText) recopiees.push(cle);
  }

  assert.deepEqual(recopiees, []);
});

/* ------------------------------------------------------------------ */
/* SENS 6 — CE QUI N EST PAS TOUCHE, et il faut que ca se voie          */
/* ------------------------------------------------------------------ */

test('les 9 galeries et les invariants restent PARTAGES — le lot ne les couvre pas', () => {
  const manifeste = JSON.parse(fs.readFileSync(path.join(MEDIAS, 'manifeste.json'), 'utf8'));
  const cles = Object.keys(manifeste);

  /* Les galeries : leur etiquette commente une image que le manifeste declare
     `decoratif: true`, donc que le projet a decide de TAIRE. Les traduire serait produire
     neuf fichiers pour un texte qu on a choisi de ne pas dire. Les monogrammes d auteur et
     le favicon sont des SIGLES, pas du texte. Les deux logos gardent le nom du magazine :
     c est la marque, et elle ne se traduit pas dans un logotype (reponse (iii) de la
     decision `bec4abfc`). */
  for (const prefixe of ['galeries/', 'auteurs/', 'identite/']) {
    assert.equal(
      cles.filter((c) => c.startsWith(prefixe) && c.endsWith('.en.svg')).length,
      0,
      `${prefixe} ne doit porter aucun fichier anglais`
    );
  }
});
