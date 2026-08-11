/**
 * LE GABARIT PLACEHOLDER, COMPTE — et la dette des 11 fac-similes, NOMMEE plutot que
 * racontee.
 *
 * CE QUI S EST MESURE LE 2026-08-12, sur les 94 medias de `data/medias/manifeste.json`.
 * TRENTE-TROIS fichiers sont le MEME dessin, au caractere pres : un panneau creme, une
 * feuille blanc casse, un filet d accent, UNE ligne de titre, et dix-huit barres grises
 * (`height="10" fill="#1A1A1A" opacity="0.16"`) figurant du faux texte. 21 `<rect>`, un
 * seul `<text>`, ~1,95 Kio. Aucun ne montre son sujet.
 *
 *   - VINGT-DEUX sont les galeries. Traitees le 2026-08-11 : leur alternative passe a
 *     la chaine vide avec `"decoratif": true`, parce que le sens est porte par la
 *     LEGENDE UNIQUE de la galerie (« La ferme des Sagnes, en quatre plans. ») et
 *     qu une alternative par image ferait lire quatre fois la meme phrase.
 *   - ONZE sont des FAC-SIMILES, et leur conclusion N EST PAS LA MEME.
 *
 * POURQUOI ELLE N EST PAS LA MEME — c est tout l objet de ce fichier. Un fac-simile
 * n est pas une image d ambiance sous une legende collective : c est une PIECE, et la
 * legende du corpus la designe comme la preuve de ce que l article avance.
 *
 *     blocs/A01-poste-source.svg
 *       alternative  « Fac-simile d un extrait de dossier de raccordement, capacite
 *                      residuelle du poste source »
 *       legende A01  « L'extrait du dossier de raccordement OU FIGURE la capacite
 *                      residuelle du poste source. »
 *       le fichier   un panneau titre « Extrait du dossier de raccordement —
 *                      reconstitution », et dix-huit barres grises.
 *
 * Vider cette alternative-la ne retirerait pas du bruit : cela effacerait la seule trace
 * ecrite de ce que l image DOIT montrer, et figerait le placeholder en decor assume. Le
 * defaut n est pas dans l alternative, il est dans le DESSIN.
 *
 * ET CE N EST PAS UNE FATALITE DU FAC-SIMILE : QUATRE des quinze en dessinent un pour de
 * bon — `couvertures/A28.svg` (8,1 Kio, 73 rect + 19 lignes, cinq colonnes de registre),
 * `couvertures/A38.svg` (6,1 Kio, tableau de quatre rentrees), `couvertures/A39.svg`
 * (3,8 Kio, dix-huit lignes de texte portant les montants reels) et
 * `blocs/A25-inspection.svg` (7,6 Kio, cotation des six piles). Leurs legendes sont de
 * la MEME nature que celles des onze. La difference tient au fichier, a rien d autre :
 * les onze sont INACHEVES, ils ne sont pas decoratifs.
 *
 * CE QUE CE FICHIER FAIT, ET CE QU IL NE FAIT PAS. Il ne redessine rien — le contenu
 * appartient a Aymeric — et il ne touche a aucune alternative. Il rend le constat
 * MECANIQUE : la liste des onze est ecrite ici, re-mesuree a chaque push, et elle
 * rougit dans les DEUX sens. Un douzieme placeholder declare comme un document se voit ;
 * un des onze REDESSINE se voit aussi, et demande alors qu on le retire de la liste —
 * une exemption qui survit a sa cause elargit le trou en silence.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MEDIAS = path.join(RACINE, 'data', 'medias');
const ARTICLES = path.join(RACINE, 'data', 'articles');

/**
 * LES ONZE, ET CE QUE CHACUN ANNONCE SANS LE DESSINER.
 *
 * La valeur est la ligne de titre REELLEMENT gravee dans le fichier — le seul contenu
 * que le dessin porte aujourd hui. Elle sert de repere a qui redessinera : ce titre est
 * ce que l image dit deja, tout le reste est a produire.
 */
const FAC_SIMILES_AU_GABARIT: Record<string, string> = {
  'couvertures/A02.svg': 'Reglement de zonage, annexe 4 — reconstitution',
  'couvertures/A24.svg': 'Chronologie contentieuse — reconstitution',
  'couvertures/A36.svg': 'Deliberation du 24 avril 2026 — reconstitution',
  'couvertures/A37.svg': 'Ordre du jour du 24 septembre 2026, point 9 — reconstitution',
  'blocs/A01-poste-source.svg': 'Extrait du dossier de raccordement — reconstitution',
  'blocs/A09-etable.svg': "Plan de l'etable des Sagnes — reconstitution",
  'blocs/A11-dossier.svg': 'Dossier de maladie professionnelle — reconstitution',
  'blocs/A17-compte.svg': "Compte d'exploitation 2025-2026 — reconstitution",
  'blocs/A23-registre.svg': "Registre d'atelier, juin 1983 — reconstitution",
  'blocs/A29-regle-exploitation.svg': "Regle d'exploitation du barrage — reconstitution",
  'blocs/A33-carnet.svg': 'Carnet du col des Trois-Vents, double page — reconstitution',
};

/**
 * LES QUATRE QUI DESSINENT VRAIMENT UN DOCUMENT — la ligne de partage, et la preuve que
 * le gabarit n est pas la forme normale d un fac-simile.
 */
const FAC_SIMILES_DESSINES = [
  'couvertures/A28.svg',
  'couvertures/A38.svg',
  'couvertures/A39.svg',
  'blocs/A25-inspection.svg',
];

type Profil = { rect: number; texte: number; barres: number; titres: string[] };

/** Le profil d un SVG, compte sur ses octets — jamais sur ce qu on croit y avoir mis. */
function profil(cle: string): Profil {
  const source = fs.readFileSync(path.join(MEDIAS, cle), 'utf8');
  return {
    rect: (source.match(/<rect\b/g) ?? []).length,
    texte: (source.match(/<text\b/g) ?? []).length,
    /* LA BARRE GRISE DU GABARIT, a l identique dans les 33 : meme hauteur, meme encre,
       meme opacite. Seule la largeur varie, pour figurer des lignes inegales. */
    barres: (source.match(/<rect[^>]*height="10"[^>]*fill="#1A1A1A"[^>]*opacity="0\.16"/g) ?? [])
      .length,
    titres: [...source.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((m) =>
      m[1].replace(/<[^>]+>/g, '').trim(),
    ),
  };
}

/** Un fichier au gabarit placeholder : une seule ligne de titre, et du faux texte. */
function estAuGabarit(p: Profil): boolean {
  return p.texte === 1 && p.barres >= 10;
}

function manifeste(): Record<string, { alternativeText: string }> {
  return JSON.parse(fs.readFileSync(path.join(MEDIAS, 'manifeste.json'), 'utf8'));
}

test('le gabarit placeholder porte 33 fichiers : les 22 galeries et les 11 fac-similes, et personne d autre', () => {
  const auGabarit = Object.keys(manifeste())
    .filter((cle) => estAuGabarit(profil(cle)))
    .sort();

  const galeries = auGabarit.filter((cle) => cle.startsWith('galeries/'));
  const autres = auGabarit.filter((cle) => !cle.startsWith('galeries/'));

  assert.equal(galeries.length, 22, 'les 22 galeries sont au gabarit, et le restent');
  /* LE SENS QUI COMPTE : un DOUZIEME placeholder declare comme un document doit se voir
     ici, pas six semaines plus tard dans une campagne axe-core — qui, elle, ne le verra
     jamais : l alternative est presente et non vide, axe-core est vert. */
  assert.deepEqual(
    autres,
    Object.keys(FAC_SIMILES_AU_GABARIT).sort(),
    'un media hors galerie est au gabarit placeholder sans figurer dans la liste des onze',
  );
});

test('chacun des onze est TOUJOURS au gabarit — sinon la liste doit maigrir', () => {
  for (const [cle, titre] of Object.entries(FAC_SIMILES_AU_GABARIT)) {
    const p = profil(cle);
    /* Une exemption qui survit a sa cause elargit le trou en silence : le jour ou l un
       des onze est redessine, ce test rougit et demande qu on le retire de la liste. */
    assert.ok(
      estAuGabarit(p),
      `${cle} n est plus au gabarit (${p.rect} rect, ${p.texte} text, ${p.barres} barres) — ` +
        's il a ete redessine, retire-le de FAC_SIMILES_AU_GABARIT.',
    );
    assert.deepEqual(p.titres, [titre], `${cle} : la ligne de titre gravee a change`);
  }
});

test('les quatre autres fac-similes DESSINENT leur document — le gabarit n est pas une fatalite', () => {
  for (const cle of FAC_SIMILES_DESSINES) {
    const p = profil(cle);
    assert.equal(p.barres, 0, `${cle} porte des barres de faux texte`);
    assert.ok(
      p.rect >= 40 || p.texte >= 10,
      `${cle} ne dessine plus de document (${p.rect} rect, ${p.texte} text)`,
    );
  }
});

test('les onze annoncent un DOCUMENT, et le corpus les designe comme la piece qu ils montrent', () => {
  const meta = manifeste();
  const corpus = fs
    .readdirSync(ARTICLES)
    .filter((f) => f.endsWith('.md'))
    .map((f) => fs.readFileSync(path.join(ARTICLES, f), 'utf8'))
    .join('\n');

  for (const cle of Object.keys(FAC_SIMILES_AU_GABARIT)) {
    /* C EST CE COUPLE QUI INTERDIT DE LES VIDER PAR SYMETRIE AVEC LES GALERIES. Une
       galerie s efface parce que sa legende UNIQUE porte le sens pour quatre images ; ici
       la legende ne remplace pas l image, elle la DESIGNE comme la preuve. */
    assert.match(
      meta[cle].alternativeText,
      /^Fac-simile/i,
      `${cle} : l alternative n annonce plus un document`,
    );
    assert.ok(corpus.includes(cle), `${cle} n est reference par aucun article`);
  }
});
