/**
 * LA REPARTITION DU §6.4, TENUE PAR UN COMPTAGE ET NON PAR UNE PHRASE.
 *
 * CE QUE CE FICHIER TRANCHE. Le plan editorial §6.4 annonce **105 entrees
 * media**, reparties en huit familles. Le manifeste en portait **94**, et rien
 * ne disait si les onze manquantes existaient sans etre decrites — auquel cas
 * ce seraient des visuels publies sans credit — ou si elles restaient a
 * produire. Le comptage ci-dessous repond, famille par famille, et il repondra
 * encore le jour ou quelqu'un en ajoutera ou en retirera une.
 *
 * L ECART EST DE ONZE, ET IL SE DECOMPOSE EN DEUX CHOSES QUI N ONT RIEN A VOIR :
 *
 *   - **8 images d en-tete** (6 de rubrique, 2 de dossier) manquaient pour de
 *     bon : ni fichier, ni ligne au manifeste, ni `imageHero` sur l entree. Rien
 *     n etait publie sans credit — il n y avait rien du tout. Elles sont
 *     produites, declarees et cablees.
 *   - **3 vignettes de `bloc.video`** n ont PLUS D OBJET : l avenant A5 du
 *     2026-08-10 (decision `58e44080`) a retire les trois `bloc.video` du
 *     corpus. Le §6.4 laisse le chiffre 3 en place A DESSEIN — le corriger
 *     ferait bouger le total 105, la phrase de synthese et le controle 5 du §11,
 *     « un recomptage qu A5 n a pas arbitre ». On ne le corrige donc pas ici non
 *     plus : on le CONSTATE, et le test le rend visible plutot que de le laisser
 *     dormir dans un ecart de onze.
 *
 * POURQUOI ON NE PEUT PAS SE CONTENTER DE PRODUIRE LES TROIS. `chargerCorpus`
 * refuse un media au manifeste que personne n emploie. Une vignette produite
 * aujourd hui ferait donc echouer le seed — ce n est pas une opinion sur
 * l opportunite de la produire, c est une impossibilite mecanique tant qu aucun
 * `bloc.video` ne la porte. Le test `aucun bloc.video` ci-dessous est la moitie
 * qui l explique : si un jour il rougit, c est qu une video est revenue, et
 * c est ce jour-la que les vignettes se produisent.
 *
 * LE PLAFOND ATTEIGNABLE EST DONC 102, PAS 105, tant que le recomptage du §6.4
 * n est pas arbitre. Ecrit ici pour que personne ne cherche onze fichiers
 * fantomes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chargerCorpus } from '../scripts/seed/corpus.ts';
import type { Placement } from '../scripts/seed/voies.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DATA_REEL = path.join(ICI, '..', 'data');

/** La table du §6.4, recopiee ligne a ligne — c'est elle qui fait foi. */
const REPARTITION_6_4: { famille: string; placement: Placement; attendu: number }[] = [
  { famille: "Couvertures d'article (`imageCouverture`)", placement: 'couverture', attendu: 40 },
  { famille: '`imageHero` de rubrique', placement: 'hero-categorie', attendu: 6 },
  { famille: '`imageHero` de dossier', placement: 'hero-dossier', attendu: 2 },
  { famille: 'Images de `bloc.galerie`', placement: 'galerie', attendu: 22 },
  { famille: 'Images de `bloc.image-legendee`', placement: 'image-legendee', attendu: 23 },
  { famille: "Portraits d'auteur (`Auteur.photo`)", placement: 'auteur-photo', attendu: 5 },
  { famille: '`Configuration` : logo, logoSombre, favicon, imagePartageDefaut', placement: 'configuration', attendu: 4 },
];

/** La huitieme ligne du §6.4, laissee a 3 a dessein et sans objet depuis A5. */
const VIGNETTES_VIDEO = { placement: 'video-vignette' as Placement, annonce: 3, exigible: 0 };

const TOTAL_ANNONCE = 105;

function compter(): Map<Placement, number> {
  const corpus = chargerCorpus(DATA_REEL);
  const parPlacement = new Map<Placement, number>();
  for (const media of corpus.medias) {
    for (const placement of media.placements) {
      parPlacement.set(placement, (parPlacement.get(placement) ?? 0) + 1);
    }
  }
  return parPlacement;
}

test('chaque famille du §6.4 porte l effectif annonce — comptage, pas hypothese', () => {
  const compte = compter();
  const ecarts = REPARTITION_6_4.filter((l) => (compte.get(l.placement) ?? 0) !== l.attendu).map(
    (l) => `${l.famille} : ${compte.get(l.placement) ?? 0} au corpus, ${l.attendu} au §6.4`
  );
  assert.deepEqual(ecarts, []);
});

test('AUCUN `bloc.video` dans le corpus — c est ce qui rend les 3 vignettes sans objet', () => {
  const corpus = chargerCorpus(DATA_REEL);
  const porteurs: string[] = [];
  for (const article of corpus.articles) {
    for (const locale of ['fr', 'en'] as const) {
      const contenu = article[locale]?.contenu ?? [];
      if (contenu.some((b) => b.__component === 'bloc.video')) porteurs.push(`${article.code}.${locale}`);
    }
  }
  assert.deepEqual(
    porteurs,
    [],
    'un `bloc.video` est revenu au corpus : les 3 vignettes du §6.4 redeviennent exigibles'
  );
  assert.equal(compter().get(VIGNETTES_VIDEO.placement) ?? 0, VIGNETTES_VIDEO.exigible);
});

test('le total atteignable est 102 — 105 annonces moins les 3 vignettes sans objet', () => {
  const corpus = chargerCorpus(DATA_REEL);
  const attendu = REPARTITION_6_4.reduce((s, l) => s + l.attendu, 0);
  assert.equal(attendu + VIGNETTES_VIDEO.annonce, TOTAL_ANNONCE, 'la table recopiee doit sommer a 105');
  assert.equal(attendu, TOTAL_ANNONCE - VIGNETTES_VIDEO.annonce);
  assert.equal(corpus.medias.length, attendu, 'un media au manifeste hors des familles du §6.4');
});

test('aucun media n est employe deux fois dans deux familles differentes', () => {
  // Le total ne vaut que si les familles ne se recouvrent pas : un fichier
  // employe en couverture ET en galerie serait compte deux fois, et le 102
  // masquerait un manquant.
  const corpus = chargerCorpus(DATA_REEL);
  const doubles = corpus.medias
    .filter((m) => m.placements.length !== 1)
    .map((m) => `${m.cle} : ${m.placements.join(', ') || '(aucun)'}`);
  assert.deepEqual(doubles, []);
});

test('les 8 images d en-tete sont CABLEES, pas seulement posees au manifeste', () => {
  // Un fichier au manifeste que personne n emploie est deja refuse par
  // `chargerCorpus`. Ce test dit l autre sens : chaque rubrique et chaque
  // dossier POINTE le sien, ce qu aucun comptage de fichiers ne montrerait.
  const corpus = chargerCorpus(DATA_REEL);
  assert.deepEqual(
    corpus.categories.filter((c) => !c.imageHero).map((c) => c.fr.slug),
    [],
    'rubrique sans imageHero'
  );
  assert.deepEqual(
    corpus.dossiers.filter((d) => !d.imageHero).map((d) => d.fr.slug),
    [],
    'dossier sans imageHero'
  );
});

test('les 8 images d en-tete sont de voie B — aucune attribution tierce, comme le §6.4 l exige', () => {
  const corpus = chargerCorpus(DATA_REEL);
  const fautives = corpus.medias
    .filter((m) => m.placements.some((p) => p === 'hero-categorie' || p === 'hero-dossier'))
    .filter((m) => m.voie !== 'B')
    .map((m) => `${m.cle} : voie ${m.voie}`);
  assert.deepEqual(fautives, []);
});
