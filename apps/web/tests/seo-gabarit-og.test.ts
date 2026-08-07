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
  MAX_LIGNES_TITRE,
  cheminImageOg,
  decouperEnLignes,
  dispositionOg,
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

test('le decoupage se fait sur les espaces, sans perdre ni dupliquer un mot', () => {
  const texte = 'Le plateau se reboise trente ans apres la deprise agricole';
  const lignes = decouperEnLignes(texte, 20, 4);
  assert.equal(lignes.join(' '), texte);
  for (const ligne of lignes) assert.ok(ligne.length <= 20, `ligne trop large : « ${ligne} »`);
});

test('un mot plus long que le budget est coupe plutot que de deborder', () => {
  const lignes = decouperEnLignes('anticonstitutionnellement', 10, 4);
  for (const ligne of lignes) assert.ok(ligne.length <= 10, `ligne trop large : « ${ligne} »`);
  assert.ok(lignes.length > 1);
});

test('au-dela du nombre de lignes autorise, la derniere porte une ellipse', () => {
  const lignes = decouperEnLignes(TITRE_TRES_LONG, 25, 3);
  assert.equal(lignes.length, 3);
  assert.ok(lignes[2].endsWith('…'), `derniere ligne : « ${lignes[2]} »`);
  for (const ligne of lignes) assert.ok(ligne.length <= 25, `ligne trop large : « ${ligne} »`);
});

test('le decoupage ne rend jamais de ligne vide ni d espace en bord de ligne', () => {
  for (const largeur of [8, 12, 20, 33, 60]) {
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
      ligne.texte.length <= disposition.caracteresParLigne,
      `« ${ligne.texte} » (${ligne.texte.length}) depasse ${disposition.caracteresParLigne}`,
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
  const alt = texteAlternatifOg(gabarit());
  assert.ok(alt.includes('Le plateau se reboise'));
  assert.ok(alt.includes('Territoire'));
  assert.ok(alt.includes('Noelle Vasseur'));
  assert.ok(!alt.includes('.png'));
});
