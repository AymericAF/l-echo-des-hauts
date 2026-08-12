/**
 * Le gabarit des images Open Graph generees par article — §4.5, mot pour mot :
 * « Images Open Graph generees par article (titre, categorie, auteur sur gabarit) ».
 *
 * DEUX ETAPES SEPAREES, ET C EST LE POINT DE CONCEPTION. `dispositionOg` CALCULE la mise
 * en page (taille du titre, decoupage en lignes, ordonnees de chaque bloc) et rend des
 * nombres ; `svgOg` ne fait que dessiner ce qu on lui donne. Un gabarit ecrit d un seul
 * jet en template de chaine n aurait aucun invariant verifiable : « le titre ne deborde
 * pas » et « la rubrique ne chevauche pas le titre » ne se prouvent que sur des
 * coordonnees. Un titre de 160 caracteres qui passe par-dessus le pied de page ne se
 * voit autrement que sur l image, une fois publiee.
 *
 * LA LARGEUR DU TEXTE EST ESTIMEE, PAS MESUREE — MAIS CARACTERE PAR CARACTERE. Sans
 * metriques de police au build, on borne la largeur d une ligne en EM, en sommant la
 * chasse de chacun de ses caracteres (`CHASSE_EM`). Le risque assume est de couper un peu
 * tot, jamais de deborder.
 *
 * CE QUI A CHANGE LE 2026-08-11 (tache 5e8f0fb7), ET POURQUOI CETTE PROMESSE ETAIT FAUSSE.
 * Le budget etait un NOMBRE DE CARACTERES, derive d une chasse moyenne UNIQUE de 0,54 em.
 * 0,54 est la moyenne d une phrase francaise en bas de casse ; une phrase tout en
 * capitales chasse ~0,70 em, soit 30 % de plus. Mesure sur l image rasterisee : le titre
 * « LE BUDGET 2027 DE LA COMMUNAUTE DES HAUTS EN DEBAT » au corps 66 poussait son encre
 * jusqu a x = 1199 — LE BORD DE L IMAGE, 71 px au-dela de la marge droite. Et rien ne le
 * voyait : les tests bornaient `ligne.texte.length`, la garde ne mesurait que la HAUTEUR
 * de l encre, et la hauteur ne bouge pas quand le texte deborde sur le cote.
 *
 * D OU VIENNENT LES VALEURS DE `CHASSE_EM`. Mesurees le 2026-08-11 sur la pile de polices
 * de `POLICE_TITRE` en graisse 700, en rasterisant chaque caractere seul puis repete 20
 * fois et en divisant la difference d encre par 19 — c est la CHASSE (l avance), pas la
 * largeur du dessin. La pile resout Georgia Bold sur le poste Windows et Liberation Serif
 * Bold sur le runner (metriques de Times New Roman) ; Georgia est la plus large des deux
 * sur tous les caracteres mesures, ce sont donc ses valeurs qui sont retenues, arrondies
 * au centieme SUPERIEUR. `MARGE_CHASSE` couvre le reste.
 *
 * CE QUE CETTE TABLE NE PEUT PAS GARANTIR : qu une pile de polices non mesuree chasse plus
 * large. C est pourquoi le controle 9 de `scripts/verifier-seo.mjs` mesure le DEBORDEMENT
 * REEL sur l image produite — une estimation peut se tromper, une mesure sur la sortie
 * non.
 *
 * CE QUE CE MODULE NE PROUVE PAS : que le rasteriseur trouve une police et dessine
 * vraiment les glyphes au corps demande. `sharp` embarque fontconfig, pas de fontes ; sur
 * une image de construction sans fonte installee, le SVG rend un fond correct et un titre
 * remplace par une file de rectangles d une douzaine de pixels — le cas exact ou succes et
 * echec produisent la meme sortie. C est `scripts/verifier-seo.mjs` qui ferme ce trou, en
 * refusant une image dont les glyphes de titre sont plus bas que la moitie du plus petit
 * palier de `TAILLES_TITRE`.
 */
import type { Locale } from '../domaine.ts';
import { libelles } from '../i18n/libelles.ts';
import { texteXml } from './xml.ts';

/** Le format Open Graph attendu : 1200x630, ratio 1,91:1. */
export const CADRE_OG = { largeur: 1200, hauteur: 630 } as const;

/** Au-dela, le titre est tronque : cinq lignes de 60 px ne tiennent pas sous la rubrique. */
export const MAX_LIGNES_TITRE = 4;

/**
 * Les paliers de corps essayes, du plus grand au plus petit.
 *
 * Exporte parce que le plus PETIT palier borne par le bas la hauteur d encre qu une ligne
 * de titre reellement dessinee peut avoir : c est de lui que `scripts/verifier-seo.mjs`
 * derive son seuil (`HAUTEUR_MINIMALE_GLYPHES`), et un test relie les deux valeurs.
 */
export const TAILLES_TITRE = [66, 58, 50, 44] as const;

/**
 * Chasse de chaque caractere, en em, pour la pile de `POLICE_TITRE` en graisse 700.
 *
 * Mesuree, arrondie au centieme superieur — cf. l en-tete pour le protocole. Groupee par
 * valeur : les caracteres d une meme ligne ont la meme chasse dans la fonte mesuree, ce
 * qui rend la table relisible et une correction verifiable d un coup d oeil.
 */
const CHASSE_EM = new Map<string, number>(
  (
    [
      ['W', 1.13], ['Œ', 1.11], ['Æ', 1.07], ['M', 1.03], ['m', 1.02], ['…', 0.95], ['œ', 0.94],
      ['—', 0.93], ['H', 0.92], ['%', 0.88], ['w', 0.87], ['æ', 0.86], ['NDUÙÛÜ', 0.84],
      ['OQÔÖK', 0.82], ['XG', 0.81], ['R', 0.8], ['V', 0.77], ['AÀÂÄB', 0.76], ['Y', 0.74],
      ['EÈÉÊË', 0.73], ['CÇ', 0.72], ['–0P', 0.71], ['ZnLT', 0.69], ['huùûü8F', 0.68], ['d', 0.67],
      ['p', 0.66], ['4Sq69b', 0.65], ['oôök', 0.64], ['23', 0.63], ['«»', 0.62], ['5aàâäJ', 0.6],
      ['x', 0.59], ['geèéêë', 0.58], ['vy', 0.57], ['7', 0.56], ['?', 0.55], ['cç', 0.54],
      ['z', 0.53], ['rs', 0.52], ['1', 0.49], ['/', 0.48], ['()IÎÏ', 0.45], ['tf', 0.4],
      ['-!', 0.38], [':;', 0.37], ['iîï', 0.36], ['jl', 0.35], ['.,', 0.33], ["'’", 0.27],
      [' ', 0.26],
    ] as const
  ).flatMap(([caracteres, chasse]) => [...caracteres].map((caractere) => [caractere, chasse] as const)),
);

/**
 * Chasse d un caractere ABSENT de la table.
 *
 * Majore le plus large qu elle contienne (`W`, 1,13). Un caractere inconnu est rare dans
 * un titre de ce magazine ; le compter au plus large fait couper trop tot, ce qui est le
 * sens du risque qu on accepte. Le compter au plus etroit ferait deborder, c est-a-dire
 * exactement le defaut que cette table corrige.
 */
export const CHASSE_DEFAUT = 1.15;

/**
 * Majoration appliquee au budget de largeur.
 *
 * La table vient d UNE pile de polices mesuree ; 3 % couvrent l arrondi et l ecart d une
 * fonte de repli non mesuree. Ce n est PAS le filet : le filet est le controle 9 de
 * `scripts/verifier-seo.mjs`, qui mesure le debordement sur l image produite.
 */
const MARGE_CHASSE = 1.03;

/** Largeur estimee d un texte, en EM du corps auquel il sera dessine. */
export function largeurEm(texte: string): number {
  let largeur = 0;
  for (const caractere of texte) largeur += CHASSE_EM.get(caractere) ?? CHASSE_DEFAUT;
  return largeur;
}

/** Marge du gabarit, en pixels — exportee : le controle 9 en derive la zone sans texte. */
export const MARGE_OG = 72;

const MARGE = MARGE_OG;

/* Les couleurs viennent de `src/styles/tokens.css` — recopiees ici parce qu un SVG
   rasterise au build ne lit aucune feuille de style. C est la seule duplication du lot,
   et elle est bornee a trois valeurs. */
const FOND = '#fbfaf7';
const TEXTE = '#1b1a17';
const TEXTE_DOUX = '#55524b';
const ACCENT_DEFAUT = '#1f5f4a';

/** Piles de polices generiques : aucune fonte n est embarquee ni telechargee. */
const POLICE_TITRE = "Georgia, 'Times New Roman', 'DejaVu Serif', 'Liberation Serif', serif";
const POLICE_LABEL =
  "'Segoe UI', Roboto, 'DejaVu Sans', 'Liberation Sans', Helvetica, Arial, sans-serif";

export interface GabaritOg {
  readonly titre: string;
  readonly rubrique: string;
  readonly auteur: string;
  readonly nomSite: string;
  /** `couleurAccent` de la rubrique (A-15) ; ignoree si ce n est pas un code hexadecimal. */
  readonly couleurAccent: string | null;
}

export interface LigneTitre {
  readonly texte: string;
  readonly x: number;
  /** Ligne de base du texte. */
  readonly y: number;
}

export interface DispositionOg {
  readonly marge: number;
  readonly accent: string;
  readonly tailleTitre: number;
  /** Largeur maximale d une ligne, en EM du corps retenu (jamais un compte de caracteres). */
  readonly budgetEm: number;
  readonly rubrique: { texte: string; x: number; y: number; taille: number };
  readonly lignes: readonly LigneTitre[];
  readonly pied: { texte: string; x: number; y: number; taille: number };
}

/** Coupe la fin du texte jusqu a ce qu il tienne, ellipse comprise, dans `budgetEm`. */
function tronquerAvecEllipse(texte: string, budgetEm: number): string {
  let garde = texte;
  while (garde !== '' && largeurEm(`${garde.trimEnd()}…`) > budgetEm) garde = garde.slice(0, -1);
  return `${garde.trimEnd()}…`;
}

/**
 * Decoupe un texte en au plus `maxLignes` lignes d au plus `budgetEm` EM de large.
 *
 * LE BUDGET EST UNE LARGEUR, PAS UN COMPTE DE CARACTERES (change le 2026-08-11) : un
 * compte de caracteres suppose une chasse unique, et cette supposition faisait deborder
 * les titres en capitales jusqu au bord de l image. Cf. l en-tete du module.
 *
 * Un mot plus large que le budget est coupe au caractere : le laisser deborder serait
 * pire, et c est le cas d un slug ou d un nom propre compose. Au-dela de `maxLignes`, la
 * derniere ligne se termine par une ellipse — un titre coupe net ressemble a un bug.
 */
export function decouperEnLignes(texte: string, budgetEm: number, maxLignes: number): string[] {
  const mots = texte.trim().split(/\s+/).filter((mot) => mot !== '');
  const lignes: string[] = [];
  let courante = '';

  const poser = (): void => {
    if (courante !== '') lignes.push(courante);
    courante = '';
  };

  for (const mot of mots) {
    if (largeurEm(mot) > budgetEm) {
      poser();
      let morceau = '';
      for (const caractere of mot) {
        if (morceau !== '' && largeurEm(morceau + caractere) > budgetEm) {
          lignes.push(morceau);
          morceau = caractere;
        } else {
          morceau += caractere;
        }
      }
      courante = morceau;
      continue;
    }
    const essai = courante === '' ? mot : `${courante} ${mot}`;
    if (largeurEm(essai) <= budgetEm) {
      courante = essai;
      continue;
    }
    poser();
    courante = mot;
  }
  poser();

  if (lignes.length <= maxLignes) return lignes;

  const gardees = lignes.slice(0, maxLignes);
  const derniere = gardees[maxLignes - 1];
  gardees[maxLignes - 1] =
    largeurEm(`${derniere}…`) <= budgetEm ? `${derniere}…` : tronquerAvecEllipse(derniere, budgetEm);
  return gardees;
}

/** Une couleur acceptee : un code hexadecimal, et rien d autre (le SVG est du markup). */
function accentValide(couleur: string | null): string {
  return couleur !== null && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(couleur) ? couleur : ACCENT_DEFAUT;
}

export function dispositionOg(gabarit: GabaritOg): DispositionOg {
  const largeurUtile = CADRE_OG.largeur - 2 * MARGE;

  const budgetDe = (taille: number): number => largeurUtile / (taille * MARGE_CHASSE);

  /* On descend d un palier tant que le titre ne tient pas en MAX_LIGNES_TITRE lignes.
     Au dernier palier, `decouperEnLignes` tronque : mieux vaut une ellipse qu un
     debordement, qui ne se verrait que sur l image publiee. */
  let taille = TAILLES_TITRE[TAILLES_TITRE.length - 1];
  let lignes = decouperEnLignes(gabarit.titre, budgetDe(taille), MAX_LIGNES_TITRE);
  for (const palier of TAILLES_TITRE) {
    const essai = decouperEnLignes(gabarit.titre, budgetDe(palier), MAX_LIGNES_TITRE + 1);
    if (essai.length <= MAX_LIGNES_TITRE) {
      taille = palier;
      lignes = essai;
      break;
    }
  }

  const tailleRubrique = 30;
  const taillePied = 28;
  const interligne = Math.round(taille * 1.22);

  const yRubrique = MARGE + tailleRubrique;
  const yPied = CADRE_OG.hauteur - MARGE;

  /* Le bloc de titre est CENTRE dans l espace qui reste entre la rubrique et le pied :
     un titre d une ligne ne se colle donc pas sous la rubrique, et un titre de quatre
     lignes ne touche pas le pied. */
  const hautDisponible = yRubrique + 56;
  const basDisponible = yPied - taillePied - 40;
  const hauteurBloc = lignes.length * interligne;
  const depart = hautDisponible + Math.max(0, (basDisponible - hautDisponible - hauteurBloc) / 2);

  return {
    marge: MARGE,
    accent: accentValide(gabarit.couleurAccent),
    tailleTitre: taille,
    budgetEm: budgetDe(taille),
    rubrique: { texte: gabarit.rubrique, x: MARGE, y: yRubrique, taille: tailleRubrique },
    lignes: lignes.map((texte, index) => ({
      texte,
      x: MARGE,
      y: Math.round(depart + (index + 1) * interligne - (interligne - taille)),
    })),
    pied: { texte: `${gabarit.auteur} · ${gabarit.nomSite}`, x: MARGE, y: yPied, taille: taillePied },
  };
}

/**
 * Le texte de remplacement : il decrit ce que l image MONTRE (§5.3, esprit d A-04).
 *
 * IL EST ECRIT DANS LA LANGUE DE LA PAGE. Le titre et la rubrique le sont deja, puisque
 * ce sont les valeurs de la locale ; la signature, elle, etait ecrite en dur (« , par »)
 * et sortait donc en francais sur les pages anglaises — dans `og:image:alt` et
 * `twitter:image:alt`, c est-a-dire dans ce qu un lecteur d ecran annonce quand l image
 * ne charge pas (tache `ba63557e`, 2026-08-11).
 */
export function texteAlternatifOg(gabarit: GabaritOg, locale: Locale): string {
  return `${gabarit.titre} — ${gabarit.rubrique}, ${libelles(locale).parAuteur(gabarit.auteur)}`;
}

/** `/og/<locale>/<slug>.png` — le slug est celui de SA locale, jamais derive (T-05). */
export function cheminImageOg(locale: Locale, slug: string): string {
  return `/og/${locale}/${slug}.png`;
}

export function svgOg(gabarit: GabaritOg): string {
  const d = dispositionOg(gabarit);
  const lignes = d.lignes
    .map(
      (ligne) =>
        `  <text x="${ligne.x}" y="${ligne.y}" font-family="${POLICE_TITRE}" font-size="${d.tailleTitre}" ` +
        `font-weight="700" fill="${TEXTE}">${texteXml(ligne.texte)}</text>`,
    )
    .join('\n');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CADRE_OG.largeur}" height="${CADRE_OG.hauteur}" ` +
    `viewBox="0 0 ${CADRE_OG.largeur} ${CADRE_OG.hauteur}">\n` +
    `  <rect width="${CADRE_OG.largeur}" height="${CADRE_OG.hauteur}" fill="${FOND}" />\n` +
    `  <rect width="${CADRE_OG.largeur}" height="14" fill="${d.accent}" />\n` +
    `  <text x="${d.rubrique.x}" y="${d.rubrique.y}" font-family="${POLICE_LABEL}" ` +
    `font-size="${d.rubrique.taille}" font-weight="700" letter-spacing="2.4" fill="${d.accent}">` +
    `${texteXml(d.rubrique.texte.toLocaleUpperCase('fr'))}</text>\n` +
    `${lignes}\n` +
    `  <rect x="${d.marge}" y="${d.pied.y - d.pied.taille - 26}" width="96" height="4" fill="${d.accent}" />\n` +
    `  <text x="${d.pied.x}" y="${d.pied.y}" font-family="${POLICE_LABEL}" font-size="${d.pied.taille}" ` +
    `fill="${TEXTE_DOUX}">${texteXml(d.pied.texte)}</text>\n` +
    '</svg>\n'
  );
}
