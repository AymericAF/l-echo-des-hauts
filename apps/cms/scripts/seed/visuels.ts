/**
 * LE TEXTE GRAVE DANS UN VISUEL — le lire, et mesurer s il tient dans son cadre.
 *
 * POURQUOI CE MODULE EXISTE (2026-08-14, tache `f011a634`). Les visuels du corpus sont des
 * SVG dont le libelle est ECRIT DANS LE FICHIER. Corriger les alternatives textuelles a
 * regle ce qu un lecteur d ecran entend ; le texte grave, lui, restait francais sur les
 * pages anglaises — 53 chaines sur les 39 SVG servis. La parade est un fichier par locale,
 * et deux choses doivent alors etre gardees, qu aucun controle du depot ne voyait :
 *
 *  1. **qu il soit reellement traduit** — un `.en.svg` copie sans etre relu porte le
 *     francais, et rien ne le dit ;
 *  2. **qu il TIENNE** — les libelles sont poses a `x` fixe et `font-size` fixe, sans
 *     ajustement ni retour a la ligne. Un titre anglais plus long que la place sort du
 *     cadre EN SILENCE : personne ne rend ces SVG, ni le build, ni les gardes de sortie,
 *     ni axe-core. C est le seul defaut de ce lot qu aucune garde existante n attraperait.
 *
 * ── LA MESURE DE LARGEUR EST UNE ESTIMATION, ET C EST ASSUME ────────────────────────────
 *
 * Mesurer une largeur pour de vrai demanderait de rendre la police — donc un navigateur,
 * donc une dependance et une machine, pour garder six lignes de texte. L estimation retenue
 * est le produit `nombre de caracteres x font-size x avance moyenne de la police`. Elle
 * est GROSSIERE, et elle penche volontairement du cote SEVERE (avances majorees) : une
 * garde qui laisse passer un debordement ne sert a rien, une garde qui refuse un cas
 * limite fait raccourcir un titre, ce qui n a jamais fait de mal a un libelle de graphique.
 *
 * Ce qu elle ne voit pas, ecrit plutot que tu : une police absente du poste et remplacee au
 * rendu par une plus large, et les chaines a caracteres tres etroits (`1`, `l`, `i`) ou
 * tres larges (`W`, `M`), que la moyenne lisse. La marge de securite ci-dessous existe
 * pour ca.
 */
import fs from 'node:fs';

/**
 * Avance moyenne d un caractere, en fraction de la `font-size`.
 *
 * Relevees sur du texte mixte et MAJOREES : Georgia est une serif a chasse genereuse,
 * Helvetica/Arial une lineale un peu plus etroite. Les valeurs exactes n ont pas
 * d importance — ce qui compte est de ne jamais SOUS-estimer.
 */
const AVANCE: Record<string, number> = {
  Georgia: 0.54,
  Helvetica: 0.55,
  Arial: 0.55,
};
const AVANCE_PAR_DEFAUT = 0.6;

/**
 * La marge gardee a droite du cadre, en fraction de la largeur du viewBox.
 *
 * Elle n est pas decorative : elle absorbe l ecart entre l estimation et le rendu reel.
 * A 4 %, un texte estime juste a la limite dispose encore de 64 px sur un cadre de 1600.
 */
const MARGE_DROITE = 0.04;

/** Les entites XML que le corpus emploie — le texte se mesure DECODE, pas en source. */
function decoder(valeur: string): string {
  return valeur
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Toutes les chaines gravees d un SVG, dans l ordre du fichier, decodees. */
export function textesGraves(chemin: string): string[] {
  const svg = fs.readFileSync(chemin, 'utf8');
  return [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)]
    .map((trouve) => decoder(trouve[1]).trim())
    .filter((texte) => texte !== '');
}

export interface MesureTexte {
  texte: string;
  /** Largeur estimee du texte, en unites du viewBox. */
  largeur: number;
  /** Place restante dans le cadre pour ce texte, a son ancrage. */
  disponible: number;
  deborde: boolean;
}

/**
 * OU un texte s etend reellement, selon son ancrage.
 *
 * `x` n est PAS le bord gauche : c est le point d ancrage. Avec `text-anchor="middle"` le
 * texte deborde des deux cotes, avec `"end"` il s etend vers la GAUCHE. Mesurer comme si
 * tout partait a droite de `x` rend des verdicts absurdes — sur le corpus, le cas le plus
 * « serre » sortait a une place NEGATIVE, sur une etiquette centree de six caracteres.
 * Aucun des 22 visuels de ce lot n emploie d ancrage ; les autres si, et cette garde les
 * traverse.
 */
function segment(x: number, largeur: number, ancrage: string): [number, number] {
  if (ancrage === 'middle') return [x - largeur / 2, x + largeur / 2];
  if (ancrage === 'end') return [x - largeur, x];
  return [x, x + largeur];
}

/**
 * Mesure chaque `<text>` d un SVG contre la place dont il dispose.
 *
 * Un `<text>` sans `x`, sans `font-size` ou dans un SVG sans `viewBox` n est PAS mesure —
 * il n y a rien a quoi le comparer, et inventer un defaut serait pire que de se taire.
 * Le cas ne se presente pas dans le corpus ; s il se presentait, la garde de traduction
 * (`textesGraves`) continuerait de le couvrir.
 */
export function largeurEstimee(chemin: string): MesureTexte[] {
  const svg = fs.readFileSync(chemin, 'utf8');
  const cadre = /viewBox="0 0 ([\d.]+) [\d.]+"/.exec(svg);
  if (!cadre) return [];
  const largeurCadre = Number(cadre[1]);

  const mesures: MesureTexte[] = [];
  for (const trouve of svg.matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)) {
    const attributs = trouve[1];
    const texte = decoder(trouve[2]).trim();
    if (texte === '') continue;

    const x = /\bx="([\d.]+)"/.exec(attributs);
    const taille = /font-size="([\d.]+)"/.exec(attributs);
    if (!x || !taille) continue;

    const police = (/font-family="([^",]+)/.exec(attributs) || [, ''])[1].trim();
    const avance = AVANCE[police] ?? AVANCE_PAR_DEFAUT;
    const ancrage = (/text-anchor="([^"]+)"/.exec(attributs) || [, 'start'])[1];

    const largeur = Math.round(texte.length * Number(taille[1]) * avance);
    const [gauche, droite] = segment(Number(x[1]), largeur, ancrage);
    /* La borne GAUCHE est le bord du cadre, pas une marge : les libelles sont poses a
       `x = 60` par choix de mise en page, et exiger d eux 4 % d ecart ferait rougir la
       garde sur le dessin voulu. La marge ne sert qu a DROITE, ou elle absorbe l ecart
       entre l estimation et le rendu. */
    const borneDroite = largeurCadre * (1 - MARGE_DROITE);
    mesures.push({
      texte,
      largeur,
      disponible: Math.round(borneDroite - gauche),
      deborde: gauche < 0 || droite > borneDroite,
    });
  }
  return mesures;
}
