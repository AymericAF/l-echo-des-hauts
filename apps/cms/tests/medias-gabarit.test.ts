/**
 * LE GABARIT PLACEHOLDER, COMPTE — et la dette des 11 fac-similes, SOLDEE.
 *
 * CE QUI S EST MESURE LE 2026-08-12, sur les 94 medias de `data/medias/manifeste.json`.
 * TRENTE-TROIS fichiers etaient le MEME dessin, au caractere pres : un panneau creme, une
 * feuille blanc casse, un filet d accent, UNE ligne de titre, et dix-huit barres grises
 * (`height="10" fill="#1A1A1A" opacity="0.16"`) figurant du faux texte. 21 `<rect>`, un
 * seul `<text>`, ~1,95 Kio. Aucun ne montrait son sujet.
 *
 *   - VINGT-DEUX sont les galeries. Traitees le 2026-08-11 : leur alternative passe a
 *     la chaine vide avec `"decoratif": true`, parce que le sens est porte par la
 *     LEGENDE UNIQUE de la galerie (« La ferme des Sagnes, en quatre plans. ») et
 *     qu une alternative par image ferait lire quatre fois la meme phrase.
 *   - ONZE etaient des FAC-SIMILES, et leur conclusion N ETAIT PAS LA MEME.
 *
 * POURQUOI ELLE N ETAIT PAS LA MEME — c est ce qui a decide de la suite. Un fac-simile
 * n est pas une image d ambiance sous une legende collective : c est une PIECE, et la
 * legende du corpus la designe comme la preuve de ce que l article avance.
 *
 *     blocs/A01-poste-source.svg
 *       alternative  « Fac-simile d un extrait de dossier de raccordement, capacite
 *                      residuelle du poste source »
 *       legende A01  « L'extrait du dossier de raccordement OU FIGURE la capacite
 *                      residuelle du poste source. »
 *       le fichier   un panneau titre, et dix-huit barres grises.
 *
 * Vider cette alternative-la n aurait pas retire du bruit : cela aurait efface la seule
 * trace ecrite de ce que l image DOIT montrer, et fige le placeholder en decor assume. Le
 * defaut n etait pas dans l alternative, il etait dans le DESSIN.
 *
 * CE QUI A ETE DECIDE, ET FAIT. La decision b7579b1d, approuvee le 2026-08-12, a retenu
 * la branche A : REDESSINER LES ONZE plutot que vider leurs alternatives. C est fait le
 * 2026-08-14. Chaque piece porte desormais la grille documentaire reelle que sa legende
 * annonce, remplie des SEULES valeurs que l article cite — jamais une valeur inventee.
 * Deux pieces n en avaient aucune a montrer et le disent en clair sur le dessin :
 * `blocs/A09-etable.svg` (« Sans echelle — l'article ne donne aucune dimension ») et
 * `blocs/A33-carnet.svg` (« valeurs quotidiennes non reproduites »). AUCUNE alternative
 * n a ete touchee : elles etaient justes, c est le dessin qui manquait.
 *
 * CE QUE CE FICHIER FAIT, ET CE QU IL NE FAIT PAS. Il ne redessine rien, et il ne touche
 * a aucune alternative. Il rend le constat MECANIQUE, et il rougit dans les DEUX sens :
 * un douzieme placeholder declare comme un document se voit (premier test) ; un des
 * dix-neuf fac-similes qui RETOMBERAIT au gabarit — regeneration ratee, revert, ecrasement
 * — se voit aussi (deuxieme test). La liste des onze n a pas disparu avec la dette : elle
 * a change de sens, et garde la ligne de titre sur laquelle la legende du corpus s adosse.
 *
 * ET LES QUATRE VERSIONS ANGLAISES, arrivees entre-temps. La tache `f011a634` a donne un
 * fichier par locale aux quatre fac-similes servis sur une page anglaise, copies du dessin
 * francais D AVANT le redessin — donc au gabarit. La fusion du redessin leur a porte la
 * meme grille : meme geometrie, seuls les `<text>` traduits, et aucune valeur qui ne soit
 * citee par l article `.en.md` qui sert la piece. Les redessines sont donc QUINZE, les
 * fac-similes du corpus DIX-NEUF, et il ne reste au gabarit que les 22 galeries.
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
 * LES QUINZE REDESSINES, ET LA LIGNE DE TITRE QUE CHACUN CONSERVE.
 *
 * La valeur est la ligne de titre gravee dans le fichier. Elle etait, avant le redessin,
 * le SEUL contenu que la piece portait ; elle reste ce a quoi la legende du media et
 * l article se raccrochent. Un dessin regenere qui la perdrait rendrait la legende
 * orpheline sans qu aucune autre garde ne s en apercoive.
 */
const FAC_SIMILES_REDESSINES: Record<string, string> = {
  'couvertures/A02.svg': 'Reglement de zonage, annexe 4 — reconstitution',
  'couvertures/A24.svg': 'Chronologie contentieuse — reconstitution',
  'couvertures/A36.svg': 'Deliberation du 24 avril 2026 — reconstitution',
  'couvertures/A37.svg': 'Ordre du jour du 24 septembre 2026, point 9 — reconstitution',
  'blocs/A01-poste-source.svg': 'Extrait du dossier de raccordement — reconstitution',
  'blocs/A01-poste-source.en.svg': 'Extract from the connection file — reconstruction',
  'blocs/A09-etable.svg': "Plan de l'etable des Sagnes — reconstitution",
  'blocs/A09-etable.en.svg': 'Layout of the Sagnes byre — reconstruction',
  'blocs/A11-dossier.svg': 'Dossier de maladie professionnelle — reconstitution',
  'blocs/A17-compte.svg': "Compte d'exploitation 2025-2026 — reconstitution",
  'blocs/A23-registre.svg': "Registre d'atelier, juin 1983 — reconstitution",
  'blocs/A23-registre.en.svg': 'Workshop register, June 1983 — reconstruction',
  'blocs/A29-regle-exploitation.svg': "Regle d'exploitation du barrage — reconstitution",
  'blocs/A29-regle-exploitation.en.svg': 'Dam operating rule — reconstruction',
  'blocs/A33-carnet.svg': 'Carnet du col des Trois-Vents, double page — reconstitution',
};

/**
 * LES QUATRE QUI DESSINAIENT DEJA UN DOCUMENT — la preuve, avant le redessin, que le
 * gabarit n etait pas la forme normale d un fac-simile. Ils servaient de modele ; ils
 * sont maintenant tenus par la meme garde que les quinze.
 */
const FAC_SIMILES_DEJA_DESSINES = [
  'couvertures/A28.svg',
  'couvertures/A38.svg',
  'couvertures/A39.svg',
  'blocs/A25-inspection.svg',
];

/** Les dix-neuf fac-similes du corpus, redessines et modeles confondus. */
const FAC_SIMILES = [...Object.keys(FAC_SIMILES_REDESSINES), ...FAC_SIMILES_DEJA_DESSINES];

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

/* LE COMPTE EST PASSE PAR 37 AVANT DE RETOMBER A 22, et les deux etapes se lisent ici.
   La tache `f011a634` a donne un fichier PAR LOCALE aux quatre fac-similes servis sur une
   page anglaise : leurs `.en.svg` sont nes du dessin FRANCAIS D AVANT REDESSIN, donc au
   gabarit, et le compte est monte de 33 a 37 sans qu aucun placeholder NOUVEAU apparaisse.
   La fusion du redessin a porte la meme grille aux quatre versions anglaises — meme
   geometrie, seuls les `<text>` traduits, valeurs prises aux SEULS articles `.en.md` qui
   les servent. Il ne reste donc au gabarit que les 22 galeries, des deux cotes. */
test('le gabarit placeholder ne porte plus que les 22 galeries, et personne d autre', () => {
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
    [],
    'un media hors galerie est au gabarit placeholder : il annonce un document et n en dessine aucun',
  );
});

test('les dix-neuf fac-similes DESSINENT leur document — aucun ne retombe au gabarit', () => {
  for (const cle of FAC_SIMILES) {
    const p = profil(cle);
    /* Le redessin de 2026-08-14 se defait aussi facilement qu il s est fait : un revert,
       une regeneration ratee, un ecrasement par un script. La dette reviendrait alors en
       silence, sous des alternatives toujours justes et un axe-core toujours vert. */
    assert.equal(p.barres, 0, `${cle} porte des barres de faux texte`);
    assert.ok(
      p.rect >= 40 || p.texte >= 10,
      `${cle} ne dessine pas de document (${p.rect} rect, ${p.texte} text)`,
    );
  }
});

test('chacun des quinze redessines conserve la ligne de titre a laquelle la legende s adosse', () => {
  for (const [cle, titre] of Object.entries(FAC_SIMILES_REDESSINES)) {
    assert.ok(
      profil(cle).titres.includes(titre),
      `${cle} : la ligne de titre gravee a disparu ou change — la legende du corpus la cite`,
    );
  }
});

test('les dix-neuf annoncent un DOCUMENT, et le corpus les designe comme la piece qu ils montrent', () => {
  const meta = manifeste();
  const corpus = fs
    .readdirSync(ARTICLES)
    .filter((f) => f.endsWith('.md'))
    .map((f) => fs.readFileSync(path.join(ARTICLES, f), 'utf8'))
    .join('\n');

  for (const cle of FAC_SIMILES) {
    /* C EST CE COUPLE QUI INTERDISAIT DE LES VIDER PAR SYMETRIE AVEC LES GALERIES. Une
       galerie s efface parce que sa legende UNIQUE porte le sens pour quatre images ; ici
       la legende ne remplace pas l image, elle la DESIGNE comme la preuve. */
    /* « Facsimile » sans tiret est la forme ANGLAISE, entree le 2026-08-14 avec les
       fichiers `.en.svg` : la regle est la meme des deux cotes — l alternative annonce un
       document —, seule sa graphie change. */
    assert.match(
      meta[cle].alternativeText,
      /^Fac-?simile/i,
      `${cle} : l alternative n annonce plus un document`,
    );
    assert.ok(corpus.includes(cle), `${cle} n est reference par aucun article`);
  }
});
