/**
 * Lecture des fichiers d'article versionnes.
 *
 * Format retenu — un fichier par article ET par locale, `<code>.<locale>.md` :
 *
 *   ---
 *   { ... en-tete JSON : slug, titre, chapo, relations, date ... }
 *   ---
 *
 *   ::: texte
 *   Markdown du corps.
 *   :::
 *
 *   ::: chiffres-cles
 *   41 % | | de remplissage au 12 aout 2025
 *   :::
 *
 * L'en-tete est du JSON, pas du YAML : `JSON.parse` echoue bruyamment sur une
 * faute de frappe la ou un parseur de prose maison echouerait en silence.
 */
import { ErreurCorpus } from './erreurs.ts';

export type BlocBrut = {
  type: string;
  attributs: Record<string, string>;
  corps: string;
};

/* ------------------------------------------------------------------ */
/* En-tete                                                             */
/* ------------------------------------------------------------------ */

const DELIMITEUR = /^---\s*$/;

export function separerEnTete(source: string): {
  enTete: Record<string, any>;
  corps: string;
} {
  const lignes = source.replace(/\r\n/g, '\n').split('\n');
  if (!DELIMITEUR.test(lignes[0] ?? '')) {
    throw new ErreurCorpus('en-tete absent : le fichier doit commencer par une ligne `---`');
  }
  const fin = lignes.findIndex((l, i) => i > 0 && DELIMITEUR.test(l));
  if (fin === -1) {
    throw new ErreurCorpus('en-tete non ferme : il manque la seconde ligne `---`');
  }
  const brut = lignes.slice(1, fin).join('\n');
  let enTete: Record<string, any>;
  try {
    enTete = JSON.parse(brut);
  } catch (e) {
    throw new ErreurCorpus(`en-tete JSON invalide : ${(e as Error).message}`);
  }
  if (enTete === null || typeof enTete !== 'object' || Array.isArray(enTete)) {
    throw new ErreurCorpus('en-tete JSON invalide : un objet est attendu');
  }
  return { enTete, corps: lignes.slice(fin + 1).join('\n') };
}

/* ------------------------------------------------------------------ */
/* Attributs de la ligne d'ouverture d'un bloc                          */
/* ------------------------------------------------------------------ */

/** `auteur="Marie Sanz" variante=alerte` -> { auteur: 'Marie Sanz', variante: 'alerte' } */
export function lireAttributs(ligne: string): Record<string, string> {
  const attributs: Record<string, string> = {};
  const motif = /([A-Za-z][\w-]*)\s*=\s*(?:"([^"]*)"|([^\s"]+))/g;
  let m: RegExpExecArray | null;
  while ((m = motif.exec(ligne)) !== null) {
    attributs[m[1]] = m[2] !== undefined ? m[2] : m[3];
  }
  return attributs;
}

/* ------------------------------------------------------------------ */
/* Decoupage en blocs                                                   */
/* ------------------------------------------------------------------ */

export function decouperEnBlocs(corps: string): BlocBrut[] {
  const lignes = corps.replace(/\r\n/g, '\n').split('\n');
  const blocs: BlocBrut[] = [];
  let courant: BlocBrut | null = null;
  let tampon: string[] = [];

  for (const [i, ligne] of lignes.entries()) {
    const ouverture = /^:::\s*([a-z][a-z-]*)\s*(.*)$/.exec(ligne);
    const fermeture = /^:::\s*$/.test(ligne);

    if (fermeture) {
      if (!courant) throw new ErreurCorpus(`ligne ${i + 1} : fermeture `+"`:::`"+` sans bloc ouvert`);
      courant.corps = tampon.join('\n');
      blocs.push(courant);
      courant = null;
      tampon = [];
      continue;
    }
    if (ouverture) {
      if (courant) {
        throw new ErreurCorpus(
          `ligne ${i + 1} : bloc \`${ouverture[1]}\` ouvert alors que \`${courant.type}\` ne l'est pas encore ferme`
        );
      }
      courant = { type: ouverture[1], attributs: lireAttributs(ouverture[2]), corps: '' };
      continue;
    }
    if (courant) {
      tampon.push(ligne);
    } else if (ligne.trim() !== '') {
      throw new ErreurCorpus(
        `ligne ${i + 1} : texte hors de tout bloc — tout le corps doit vivre dans un ` +
          '`::: type` ... `:::` (' +
          JSON.stringify(ligne.slice(0, 60)) +
          ')'
      );
    }
  }

  if (courant) throw new ErreurCorpus(`bloc \`${courant.type}\` non ferme en fin de fichier`);
  return blocs;
}

/* ------------------------------------------------------------------ */
/* Markdown -> champ Blocks de Strapi                                   */
/* ------------------------------------------------------------------ */

type Enfant = Record<string, any>;

/** `**gras**`, `*italique*`, `[texte](url)` — rien d'autre, volontairement. */
function lireInline(texte: string): Enfant[] {
  const enfants: Enfant[] = [];
  const motif = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let reste = 0;
  let m: RegExpExecArray | null;

  const pousserTexte = (t: string) => {
    if (t !== '') enfants.push({ type: 'text', text: t });
  };

  while ((m = motif.exec(texte)) !== null) {
    pousserTexte(texte.slice(reste, m.index));
    if (m[1] !== undefined) enfants.push({ type: 'text', text: m[1], bold: true });
    else if (m[2] !== undefined) enfants.push({ type: 'text', text: m[2], italic: true });
    else
      enfants.push({
        type: 'link',
        url: m[4],
        children: [{ type: 'text', text: m[3] }],
      });
    reste = m.index + m[0].length;
  }
  pousserTexte(texte.slice(reste));
  return enfants.length > 0 ? enfants : [{ type: 'text', text: '' }];
}

export function markdownVersBlocks(markdown: string): Enfant[] {
  const lignes = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: Enfant[] = [];
  let paragraphe: string[] = [];
  let liste: string[] = [];

  const viderParagraphe = () => {
    if (paragraphe.length === 0) return;
    blocks.push({ type: 'paragraph', children: lireInline(paragraphe.join(' ').trim()) });
    paragraphe = [];
  };
  const viderListe = () => {
    if (liste.length === 0) return;
    blocks.push({
      type: 'list',
      format: 'unordered',
      children: liste.map((item) => ({ type: 'list-item', children: lireInline(item) })),
    });
    liste = [];
  };

  for (const ligne of lignes) {
    const titre = /^(#{1,6})\s+(.*)$/.exec(ligne);
    const item = /^[-*]\s+(.*)$/.exec(ligne);

    if (ligne.trim() === '') {
      viderParagraphe();
      viderListe();
      continue;
    }
    if (titre) {
      viderParagraphe();
      viderListe();
      // A-21 : un h1 saisi dans un champ Blocks est rendu en h2 ; la page ne
      // porte qu'un seul <h1>, le titre de l'article.
      const niveau = Math.max(2, titre[1].length);
      blocks.push({ type: 'heading', level: niveau, children: lireInline(titre[2]) });
      continue;
    }
    if (item) {
      viderParagraphe();
      liste.push(item[1]);
      continue;
    }
    viderListe();
    paragraphe.push(ligne.trim());
  }
  viderParagraphe();
  viderListe();

  if (blocks.length === 0) {
    throw new ErreurCorpus('champ Blocks vide : le schema exige du contenu');
  }
  return blocks;
}

/* ------------------------------------------------------------------ */
/* Lecture d'un fichier d'article complet                               */
/* ------------------------------------------------------------------ */

export function lireArticle(source: string): {
  enTete: Record<string, any>;
  blocs: BlocBrut[];
} {
  const { enTete, corps } = separerEnTete(source);
  return { enTete, blocs: decouperEnBlocs(corps) };
}
