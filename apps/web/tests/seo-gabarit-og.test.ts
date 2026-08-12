/**
 * Le gabarit des images Open Graph generees par article (§4.5).
 *
 * Ce qu un test peut prouver ici, et ce qu il ne peut pas. La mise en page est
 * CALCULEE avant d etre dessinee (`dispositionOg`), donc ses invariants se verifient sur
 * des nombres : rien ne deborde du cadre, rien ne chevauche rien, aucune ligne ne
 * depasse son budget de largeur. Ce qu aucun test unitaire ne prouve, c est que le
 * rasteriseur trouve une police et ecrive vraiment les glyphes — cela se voit sur
 * l image, et c est le role de la garde `verifier-seo.mjs`, qui refuse une image dont la
 * zone de titre est uniforme.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CADRE_OG,
  CHASSE_DEFAUT,
  MARGE_OG,
  MAX_LIGNES_TITRE,
  cheminImageOg,
  decouperEnLignes,
  dispositionOg,
  largeurEm,
  svgOg,
  texteAlternatifOg,
  type GabaritOg,
} from '../src/lib/seo/gabarit-og.ts';

function gabarit(surcharge: Partial<GabaritOg> = {}): GabaritOg {
  return {
    titre: 'Le plateau se reboise, trente ans apres la deprise',
    rubrique: 'Territoire',
    auteur: 'Noelle Vasseur',
    nomSite: "L'Echo des Hauts",
    couleurAccent: null,
    ...surcharge,
  };
}

const TITRE_TRES_LONG =
  'Trente ans apres la fermeture de la derniere filature du plateau, les pentes se referment ' +
  'sur elles-memes et le paysage que les anciens connaissaient a disparu sans que personne ne ' +
  "l ait vraiment decide ni meme remarque a l epoque ou cela se jouait";

// --- decoupage en lignes ---------------------------------------------------------

test('un titre court tient sur une seule ligne, intacte', () => {
  assert.deepEqual(decouperEnLignes('Eau et foret', 30, 4), ['Eau et foret']);
});

/* Le budget est une LARGEUR EN EM depuis le 2026-08-11, plus un compte de caracteres :
   c'est ce changement qui empeche un titre en capitales de deborder. Ces trois cas
   verifient donc la largeur estimee de chaque ligne, jamais sa longueur. */
test('le decoupage se fait sur les espaces, sans perdre ni dupliquer un mot', () => {
  const texte = 'Le plateau se reboise trente ans apres la deprise agricole';
  const lignes = decouperEnLignes(texte, 12, 4);
  assert.equal(lignes.join(' '), texte);
  for (const ligne of lignes) assert.ok(largeurEm(ligne) <= 12, `ligne trop large : « ${ligne} »`);
});

test('un mot plus long que le budget est coupe plutot que de deborder', () => {
  const lignes = decouperEnLignes('anticonstitutionnellement', 5, 4);
  for (const ligne of lignes) assert.ok(largeurEm(ligne) <= 5, `ligne trop large : « ${ligne} »`);
  assert.ok(lignes.length > 1);
});

test('un mot en CAPITALES plus large que le budget est coupe lui aussi', () => {
  /* Le meme mot en capitales est ~40 % plus large : avec un budget en caracteres, il
     passait pour identique et debordait. */
  const lignes = decouperEnLignes('ANTICONSTITUTIONNELLEMENT', 5, 4);
  for (const ligne of lignes) assert.ok(largeurEm(ligne) <= 5, `ligne trop large : « ${ligne} »`);
  assert.ok(
    lignes.length > decouperEnLignes('anticonstitutionnellement', 5, 4).length,
    'les capitales doivent occuper plus de lignes que les bas de casse, a budget egal',
  );
});

test('au-dela du nombre de lignes autorise, la derniere porte une ellipse', () => {
  const lignes = decouperEnLignes(TITRE_TRES_LONG, 13, 3);
  assert.equal(lignes.length, 3);
  assert.ok(lignes[2].endsWith('…'), `derniere ligne : « ${lignes[2]} »`);
  for (const ligne of lignes) assert.ok(largeurEm(ligne) <= 13, `ligne trop large : « ${ligne} »`);
});

test('le decoupage ne rend jamais de ligne vide ni d espace en bord de ligne', () => {
  for (const largeur of [4, 6, 11, 18, 33]) {
    for (const ligne of decouperEnLignes(TITRE_TRES_LONG, largeur, 4)) {
      assert.notEqual(ligne.trim(), '');
      assert.equal(ligne, ligne.trim());
    }
  }
});

// --- disposition : les invariants geometriques ------------------------------------

function boites(disposition: ReturnType<typeof dispositionOg>) {
  return [
    { nom: 'rubrique', haut: disposition.rubrique.y - disposition.rubrique.taille, bas: disposition.rubrique.y },
    ...disposition.lignes.map((ligne, index) => ({
      nom: `titre ${index}`,
      haut: ligne.y - disposition.tailleTitre,
      bas: ligne.y,
    })),
    { nom: 'pied', haut: disposition.pied.y - disposition.pied.taille, bas: disposition.pied.y },
  ];
}

test('tout le texte tient dans le cadre, marges comprises', () => {
  for (const titre of ['Court', gabarit().titre, TITRE_TRES_LONG]) {
    const disposition = dispositionOg(gabarit({ titre }));
    for (const boite of boites(disposition)) {
      assert.ok(boite.haut >= disposition.marge, `${boite.nom} sort par le haut (${boite.haut})`);
      assert.ok(
        boite.bas <= CADRE_OG.hauteur - disposition.marge,
        `${boite.nom} sort par le bas (${boite.bas} > ${CADRE_OG.hauteur - disposition.marge})`,
      );
    }
  }
});

test('aucun bloc n en chevauche un autre, meme sur le titre le plus long', () => {
  for (const titre of ['Court', gabarit().titre, TITRE_TRES_LONG]) {
    const ordonnees = boites(dispositionOg(gabarit({ titre })));
    for (let index = 1; index < ordonnees.length; index += 1) {
      assert.ok(
        ordonnees[index].haut >= ordonnees[index - 1].bas,
        `« ${ordonnees[index].nom} » chevauche « ${ordonnees[index - 1].nom} » ` +
          `(${ordonnees[index].haut} < ${ordonnees[index - 1].bas}) — titre : ${titre.slice(0, 40)}…`,
      );
    }
  }
});

test('un titre long reduit la taille du texte plutot que de deborder', () => {
  const court = dispositionOg(gabarit({ titre: 'Eau' }));
  const long = dispositionOg(gabarit({ titre: TITRE_TRES_LONG }));
  assert.ok(long.tailleTitre < court.tailleTitre, 'le titre long doit descendre d un cran de taille');
  assert.ok(long.lignes.length <= MAX_LIGNES_TITRE);
});

test('chaque ligne respecte le budget de largeur de la taille retenue', () => {
  const disposition = dispositionOg(gabarit({ titre: TITRE_TRES_LONG }));
  for (const ligne of disposition.lignes) {
    assert.ok(
      largeurEm(ligne.texte) <= disposition.budgetEm,
      `« ${ligne.texte} » (${largeurEm(ligne.texte).toFixed(2)} em) depasse ${disposition.budgetEm.toFixed(2)} em`,
    );
  }
});

test('la couleur d accent de la rubrique est reprise quand elle existe', () => {
  assert.equal(dispositionOg(gabarit({ couleurAccent: '#8a3324' })).accent, '#8a3324');
  assert.equal(dispositionOg(gabarit({ couleurAccent: null })).accent, dispositionOg(gabarit()).accent);
});

test('une couleur d accent qui n est pas un code hexadecimal est ignoree', () => {
  const defaut = dispositionOg(gabarit({ couleurAccent: null })).accent;
  for (const invalide of ['rouge', 'javascript:alert(1)', '#12', '"><script>', '']) {
    assert.equal(dispositionOg(gabarit({ couleurAccent: invalide })).accent, defaut, `accepte : ${invalide}`);
  }
});

// --- SVG ---------------------------------------------------------------------------

test('le SVG porte les dimensions Open Graph attendues', () => {
  const svg = svgOg(gabarit());
  assert.match(svg, /width="1200"/);
  assert.match(svg, /height="630"/);
  assert.match(svg, /viewBox="0 0 1200 630"/);
  assert.equal(CADRE_OG.largeur, 1200);
  assert.equal(CADRE_OG.hauteur, 630);
});

test('le SVG ecrit bien le titre, la rubrique et l auteur', () => {
  const svg = svgOg(gabarit());
  // La rubrique est capitalisee dans le SVG comme elle l est sur le site
  // (`text-transform: uppercase`) : un rasteriseur n applique aucune feuille de style,
  // la transformation doit donc etre faite dans le texte lui-meme.
  assert.ok(svg.includes('TERRITOIRE'), 'rubrique absente ou non capitalisee');
  assert.ok(svg.includes('Noelle Vasseur'));
  assert.ok(svg.includes('Le plateau se reboise'));
});

test("un contenu hostile ne peut pas sortir du texte du SVG", () => {
  const svg = svgOg(
    gabarit({ titre: 'Fin</text><script>alert(1)</script><text>', rubrique: 'A & B', auteur: '<b>x</b>' }),
  );
  assert.ok(!svg.includes('<script'), 'balise script injectee dans le SVG');
  assert.ok(!svg.includes('<b>'), 'balise injectee dans le SVG');
  assert.ok(svg.includes('&amp;'), 'esperluette non echappee');
});

test('le SVG ne fait aucun appel reseau : ni image externe, ni police distante', () => {
  const svg = svgOg(gabarit());
  assert.ok(!/https?:\/\//.test(svg.replace(/xmlns="[^"]*"/g, '')), 'URL externe dans le SVG');
  assert.ok(!svg.includes('@import'));
  assert.ok(!svg.includes('xlink:href'));
});

// --- chemin et texte de remplacement -----------------------------------------------

test("le chemin d une image OG porte la locale et le slug de CETTE locale", () => {
  assert.equal(cheminImageOg('fr', 'le-plateau-se-reboise'), '/og/fr/le-plateau-se-reboise.png');
  assert.equal(cheminImageOg('en', 'the-plateau-regrows'), '/og/en/the-plateau-regrows.png');
});

test("le texte de remplacement decrit ce que l image montre, pas le fichier", () => {
  const alt = texteAlternatifOg(gabarit(), 'fr');
  assert.ok(alt.includes('Le plateau se reboise'));
  assert.ok(alt.includes('Territoire'));
  assert.ok(alt.includes('Noelle Vasseur'));
  assert.ok(!alt.includes('.png'));
});

test("le texte de remplacement est ECRIT DANS LA LANGUE DE LA PAGE", () => {
  /* Il part dans `og:image:alt` et `twitter:image:alt` : c est ce qu un lecteur d ecran
     annonce quand l image de partage ne charge pas, et ce qu un reseau social affiche.
     La signature en etait ecrite en dur — « , par <auteur> » — donc en francais sur les
     pages anglaises, sans que rien ne le voie (tache `ba63557e`). */
  assert.equal(
    texteAlternatifOg(gabarit(), 'fr'),
    'Le plateau se reboise, trente ans apres la deprise — Territoire, par Noelle Vasseur',
  );
  assert.equal(
    texteAlternatifOg(gabarit(), 'en'),
    'Le plateau se reboise, trente ans apres la deprise — Territoire, by Noelle Vasseur',
  );
});

// --- la largeur du texte est ESTIMEE par caractere, pas par un facteur moyen --------

/**
 * LE DEFAUT DU 2026-08-11 (tache 5e8f0fb7). La largeur d une ligne etait bornee en
 * NOMBRE DE CARACTERES, a partir d une chasse moyenne unique de 0,54 em — la moyenne
 * d une phrase francaise en bas de casse. Les capitales chassent bien plus large : mesure
 * sur la pile de polices du gabarit, la moyenne d une phrase tout en capitales est de
 * ~0,70 em, soit 30 % de plus que le budget. Consequence mesuree sur l image rasterisee :
 * un titre en capitales au corps 66 poussait son encre jusqu a x = 1199 — LE BORD DE
 * L IMAGE, 71 px au-dela de la marge droite. L en-tete du module promettait pourtant
 * « couper un peu tot, JAMAIS deborder ».
 */
const CAPITALES = 'LE BUDGET 2027 DE LA COMMUNAUTE DES HAUTS EN DEBAT';

test('la chasse est comptee CARACTERE PAR CARACTERE : une capitale coute plus qu une bas-de-casse', () => {
  assert.ok(
    largeurEm('MMMM') > largeurEm('iiii') * 2,
    `M=${largeurEm('MMMM')} i=${largeurEm('iiii')} : un modele a chasse unique les rendrait egaux`,
  );
  assert.ok(largeurEm('E') > largeurEm('e'), 'une capitale doit couter plus que sa bas-de-casse');
});

test('un caractere hors table est compte au plus large, jamais au plus etroit', () => {
  assert.equal(largeurEm('字'), CHASSE_DEFAUT);
  assert.ok(CHASSE_DEFAUT >= largeurEm('W'), 'le defaut doit majorer le caractere le plus large de la table');
});

test('largeurEm est additive et compte les espaces', () => {
  assert.ok(Math.abs(largeurEm('ab') + largeurEm('c') - largeurEm('abc')) < 1e-9);
  assert.ok(largeurEm('a b') > largeurEm('ab'), 'un espace occupe de la place');
});

test('un titre EN CAPITALES tient dans le budget de largeur, comme un titre en bas de casse', () => {
  for (const titre of [CAPITALES, 'MMMMMMMMMMMMMMMMMMMMMMMMMMMMM', 'ŒUVRES ET ÆTHER : WWW']) {
    const disposition = dispositionOg(gabarit({ titre }));
    for (const ligne of disposition.lignes) {
      assert.ok(
        largeurEm(ligne.texte) <= disposition.budgetEm,
        `« ${ligne.texte} » : ${largeurEm(ligne.texte).toFixed(2)} em > budget ` +
          `${disposition.budgetEm.toFixed(2)} em au corps ${disposition.tailleTitre}`,
      );
    }
  }
});

test('aucune ligne ne sort de la zone de texte, capitales comprises — en PIXELS estimes', () => {
  const droiteMax = CADRE_OG.largeur - MARGE_OG;
  for (const titre of [CAPITALES, 'MMMMMMMMMMMMMMMMMMMMMMMMMMMMM', TITRE_TRES_LONG.toLocaleUpperCase('fr')]) {
    const disposition = dispositionOg(gabarit({ titre }));
    for (const ligne of disposition.lignes) {
      const droite = ligne.x + largeurEm(ligne.texte) * disposition.tailleTitre;
      assert.ok(droite <= droiteMax, `« ${ligne.texte} » finit a ${Math.round(droite)} px (max ${droiteMax})`);
    }
  }
});

test('un titre en bas de casse se coupe EXACTEMENT comme avant — la correction ne hache rien', () => {
  /* La correction ne doit pas se payer par des titres reels hachees : sur une phrase
     francaise ordinaire, le modele par caractere doit rendre le meme decoupage que
     l ancien facteur moyen unique de 0,54 em (budget de 29 caracteres au corps 66). */
  const disposition = dispositionOg(gabarit({ titre: 'Le plateau se reboise, trente ans apres la deprise' }));
  assert.equal(disposition.tailleTitre, 66);
  assert.deepEqual(
    disposition.lignes.map((ligne) => ligne.texte),
    ['Le plateau se reboise, trente', 'ans apres la deprise'],
  );
});
