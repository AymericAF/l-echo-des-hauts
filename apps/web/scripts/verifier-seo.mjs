/**
 * Confronte les SORTIES SEO a la sortie du build — au point de lecture, pas au code.
 *
 * `verifier-liens.mjs` lit les `<a>` et les `<link>` des pages HTML. Il ne voit donc
 * rien de ce que ce lot produit : un `<loc>` de sitemap, un `<link>` de flux RSS et un
 * `og:image` sont invisibles pour lui. C est exactement la zone ou le defaut ne se
 * decouvre jamais en test : une URL de sitemap absente du site ne casse aucune page, ne
 * fait rougir aucun build, et se manifeste des mois plus tard en Search Console.
 *
 * HUIT CONTROLES, chacun ferme une classe de defaut que rien d autre ne voit :
 *
 *   1. **Chaque segment declare par l index existe.** Un index qui annonce un fichier
 *      absent est un sitemap mort ; le crawler abandonne le segment sans le dire.
 *   2. **Chaque `<loc>` de segment resout dans `dist/`.** C est la version « point de
 *      lecture » de la promesse du registre : ce n est pas parce que le registre
 *      annonce une route que `getStaticPaths` l a emise.
 *   3. **Aucune URL de sitemap ne porte `noindex`.** A-29 tient les deux points de
 *      lecture par une seule fonction (`src/lib/seo/indexation.ts`) ; ce controle
 *      verifie le RESULTAT, seul endroit ou une divergence se verrait.
 *   4. **Couverture : 100 % des pages indexables sont au sitemap.** C est le critere du
 *      §1 (« 100 % des pages indexables portent… »), pris a l envers : une page emise,
 *      sans `noindex`, absente du sitemap, est une page que personne ne declare. Ce
 *      controle-la est le seul qui puisse detecter un segment OUBLIE.
 *   5. **Chaque lien de flux RSS resout.** Un flux est lu dans un agregateur, jamais
 *      dans le site : ses liens morts sont invisibles depuis le navigateur.
 *   6. **Chaque `og:image` / `twitter:image` du site resout, et chaque page porte ses
 *      balises de partage minimales.** Une carte de partage cassee ne se voit qu en
 *      partageant.
 *   7. **Chaque image OG generee porte des GLYPHES A LA BONNE TAILLE dans sa bande de
 *      titre.** C est le controle le plus important du fichier. `sharp` embarque
 *      fontconfig mais aucune fonte : sur une image de construction sans police
 *      installee, la rasterisation REUSSIT et rend un PNG au fond correct, aux bonnes
 *      dimensions, au bon poids — et dont le titre est remplace par une file de
 *      rectangles de remplacement d une douzaine de pixels de haut. Succes et echec
 *      produisent la meme sortie ; seule une mesure les distingue.
 *
 *      LAQUELLE, EXACTEMENT, EST TOUT LE SUJET. Ce controle a d abord mesure l ECART-TYPE
 *      des pixels de la bande. Cette grandeur croit avec la quantite de texte, pas avec
 *      sa taille : elle laisse un titre long non dessine depasser un titre court
 *      correctement dessine. Au premier deploiement reel (tache f4a501cd), 21 vignettes
 *      etaient vides et UNE SEULE a rougi. Ce qu on mesure est desormais la HAUTEUR des
 *      glyphes, qui ne depend pas de la longueur du titre — cf. `HAUTEUR_MINIMALE_GLYPHES`
 *      et sa derivation chiffree.
 *
 *      DEUX JAMBES DEPUIS LE 2026-08-11, et la premiere ne suffisait pas. Le seuil absolu
 *      a ete FRANCHI par un tofu de 21 px (run 31534444682) : la garde acceptait l image,
 *      et comme l etat du rasteriseur est propre au PROCESSUS, c est un build entier de
 *      vignettes vides qui passait. Le seuil ne peut pas etre releve pour autant — le
 *      plancher legitime est a 22 px. La seconde jambe (`sonderRasteriseur`) mesure donc
 *      la PROPORTIONNALITE de l encre au corps demande, que le tofu ne peut pas imiter.
 *   8. **100 % des pages indexables portent un JSON-LD lisible** (§5.1, et le critere
 *      chiffre du §1). Chaque bloc est PARSE, son `@context` schema.org exige, ses noeuds
 *      typologiquement verifies, et les URL qu il affirme joignables confrontees a
 *      `dist/`. Le decompte est ensuite oppose au nombre de pages indexables du controle
 *      4 : nommer les pages manquantes ne suffit pas, l ecart global s affirme a part.
 *      Ce controle est le seul qui verrait un layout ayant cesse d appeler le calcul —
 *      le module de calcul, lui, resterait vert sur ses propres tests.
 *
 * `npm run verifier:seo` pour inspecter un `dist/` deja construit. Ce qui rend ces
 * clauses opposables en machine, c est `integrations/garde-seo.mjs`, qui appelle
 * `inspecterSeo` DEPUIS le build et le fait sortir en code non nul.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import sharp from 'sharp';

import { dispositionOg, svgOg, TAILLES_TITRE } from '../src/lib/seo/gabarit-og.ts';
import { ISSUES, manquementCorpusVide } from './issues.mjs';
import { lireOrigine } from './origine.mjs';
import { normaliser, routeDuFichier } from './verifier-liens.mjs';

/** Les balises `<meta>` de partage qu on exige sur TOUTE page HTML. */
const PARTAGE_OBLIGATOIRE = ['og:title', 'og:url', 'og:type', 'og:locale'];

/**
 * Bande verticale ou le titre est dessine, en fraction de la hauteur de l image.
 *
 * Bornee au titre, jamais a l image entiere : le filet d accent en haut (y 0 a 14), le
 * trait et le texte du pied de page (y 504 et suivants) sont du DECOR, dessine que le
 * titre le soit ou non. Les compter reviendrait a mesurer autre chose que ce qu on veut
 * savoir — et cela suffisait, du temps de l ecart-type, a faire passer une image vide.
 *
 * D OU VIENNENT CES DEUX FRACTIONS, mesurees sur les coordonnees que `dispositionOg`
 * calcule pour une image de 630 px de haut. La rubrique a sa ligne de base a y=102 et le
 * pied a y=558 : la bande doit donc rester entre les deux. 0,3 et 0,72 valent 189 et 454,
 * ce qui est PLUS SERRE que la zone de titre reellement dessinable (158 a 490). C est
 * volontaire et c est sans effet sur le verdict : le bloc de titre est CENTRE dans cette
 * zone, donc au moins une de ses lignes tombe toujours entierement dans la bande, quel
 * que soit le nombre de lignes. Verifie le 2026-08-08 sur les quatre paliers de corps —
 * seul le cas 4 lignes au palier 66 px voit sa premiere et sa derniere ligne rognees, et
 * ses lignes du milieu mesurent la pleine hauteur.
 *
 * NE PAS L ELARGIR JUSQU AU DECOR. Sous 0,162 la rubrique entre dans la bande (sa ligne
 * de base est a y=102), au-dessus de 0,8 le trait et le texte du pied y entrent aussi. La
 * mesure porterait alors sur des elements qui ne sont pas le titre, et le controle ne
 * dirait plus ce qu il pretend dire.
 */
const BANDE_TITRE = { haut: 0.3, bas: 0.72 };

/**
 * Un pixel est de l ENCRE en dessous de cette valeur de gris, sur 255.
 *
 * La bande de titre ne contient que deux couleurs : le fond `#fbfaf7` (gris 250) et le
 * texte `#1b1a17` (gris 26) — le filet d accent et le trait du pied sont hors bande, et
 * la couleur de rubrique n y est pas dessinee. 200 tombe donc loin des deux : il attrape
 * jusqu aux bords les plus delaves de l anticrenelage sans jamais compter du fond.
 */
const SEUIL_ENCRE = 200;

/**
 * Nombre minimal de pixels d encre pour qu une RANGEE compte comme encree.
 *
 * A 1, un unique pixel d anticrenelage a la pointe d un accent rallongerait le bloc
 * mesure. Une vraie ligne de titre en porte des centaines, un tofu aussi : entre 1 et
 * quelques dizaines, la valeur ne change aucun verdict.
 */
const ENCRE_PAR_RANGEE = 2;

/**
 * Hauteur minimale, en pixels, du plus haut bloc de rangees encrees de la bande de titre.
 *
 * CE QUE CE SEUIL SEPARE, ET POURQUOI CE N EST PAS L ANCIEN. La garde comparait
 * auparavant l ECART-TYPE des pixels de la bande a 8. Cette mesure croit avec la QUANTITE
 * de texte, pas avec sa taille — elle ne separe donc pas les deux populations qu elle
 * pretend separer. Mesure le 2026-08-08 sur ce gabarit : un titre d un mot REELLEMENT
 * dessine rend 18,98 d ecart-type, la ou le titre le plus long rendu SANS AUCUNE FONTE
 * rend 29,22. Le vide depasse le plein ; aucun seuil ne les departage. C est ce qui a
 * laisse passer 20 vignettes vides sur 21 au premier deploiement (tache f4a501cd) : le
 * seuil de 8 n avait pas ete pose trop bas, il portait sur la mauvaise grandeur.
 *
 * CE QUE MESURE CELLE-CI. Sans fonte, le rasteriseur ne rend pas une image vide : il
 * dessine un « tofu » — un rectangle de remplacement — a la place de chaque caractere,
 * a la BONNE position mais a une taille fixe d une douzaine de pixels, sans rapport avec
 * le corps demande. La hauteur d encre est donc la grandeur qui distingue « dessine » de
 * « pas dessine », et elle ne depend pas de la longueur du titre.
 *
 * LE CALCUL QUI FIXE LA VALEUR — deux distributions mesurees le 2026-08-08, sur les 21
 * images du site construites deux fois, avec et sans fonte (`npm run preuve:encre-og`
 * rejoue la mesure) :
 *
 *   sans fonte  : 0 px (rien dessine) ou 12 a 13 px (tofu), sur 42 images. PLAFOND 13.
 *   avec fontes : 65 px sur les 21 images du site, sans exception.
 *                 32 px sur le pire titre plausible fabrique (4 lignes au palier 44 px,
 *                 commencant par une capitale).
 *                 23 px sur un titre adversaire sans capitale, sans accent et sans le
 *                 moindre jambage — reduit a sa hauteur d x, et introuvable en francais.
 *
 * 20 est le milieu geometrique de [13 ; 32] arrondi (20,4) : 1,54x au-dessus du plafond
 * du cas vide, 1,6x sous le plancher du cas plein plausible, et encore sous le plancher
 * adversaire de 23. C est aussi la moitie du plus petit palier de corps du gabarit
 * (44 px) — un test relie les deux valeurs, pour qu ajouter un palier plus petit a
 * `TAILLES_TITRE` fasse rougir plutot que de rendre ce seuil arbitraire.
 *
 * NE PAS LE RABAISSER SUR UN FAUX POSITIF sans avoir refait les deux mesures : un titre
 * legitime en dessous de 20 px d encre voudrait dire que le gabarit dessine son titre
 * plus petit que la moitie de son plus petit corps, ce qui est un defaut du gabarit.
 */
export const HAUTEUR_MINIMALE_GLYPHES = 20;

/* ------------------------------------------------------------------------------------
   LA SONDE DU RASTERISEUR — la seconde jambe du controle 7, et pourquoi il en fallait une.

   CE QUE LE SEUIL ABSOLU CI-DESSUS NE PEUT PAS FAIRE. Il compare une hauteur d encre a une
   constante. Or la hauteur du « tofu » — le rectangle de remplacement dessine quand aucune
   fonte ne resout — n est ni deterministe ni bornee : mesure le 2026-08-11, elle vaut 0, 12
   ou 13 px la plupart du temps, mais elle est montee a 18 px sur le poste Windows et a
   21 px sur le runner GitHub (run 31534444682, tentative 1). A 21 px, elle FRANCHIT le
   seuil de 20 : la garde accepte l image. Et comme cet etat est propre au PROCESSUS (60
   rasterisations dans un meme processus rendent toutes la meme valeur), ce n est pas une
   image qui passe, ce sont les 42 d un build entier.

   Le seuil ne peut pas non plus etre releve pour couvrir 21 px : le plancher legitime est
   la hauteur d x d un titre sans capitale, sans accent et sans jambage au plus petit
   palier, soit 22 px a 44. Les deux populations se touchent. AUCUNE constante ne les
   separe — c est la meme classe d erreur que l ecart-type d avant, sur une autre grandeur.

   CE QUE CETTE SONDE MESURE A LA PLACE, et qui separe par CONSTRUCTION. Un texte reellement
   dessine a une hauteur d encre PROPORTIONNELLE au corps demande ; un tofu a une taille
   fixe, sans rapport avec le corps. On rasterise donc le meme mot de reference a deux
   paliers — le plus grand et le plus petit de `TAILLES_TITRE` — et on exige que le rapport
   des deux hauteurs SUIVE le rapport des corps. Mesure du 2026-08-11 :

     avec fontes  : 1,478 aux 5 tirages (rapport theorique 66/44 = 1,5) ;
     sans fonte   : 0 a 1,083 sur 25 processus distincts.

   Le fosse est franc et il ne depend PAS de la taille du tofu : un tofu de 21 px rend
   21/21, un tofu de 12 px rend 12/12. Le second critere (`SONDE_PART_DU_CORPS`) ferme le
   cas residuel ou les deux paliers ne tirent pas la meme taille de tofu.

   CE QU ELLE NE PROUVE PAS. Elle mesure le rasteriseur DU PROCESSUS QUI L EXECUTE. Appelee
   depuis le build (`integrations/garde-seo.mjs`), c est exactement celui qui a produit les
   images — c est la que sa valeur est maximale. Lancee a la main sur un `dist/` deja
   construit, elle parle de la machine de recette et non de celle du build : le controle
   par image ci-dessus reste donc necessaire, et les deux jambes ne se remplacent pas.
   ------------------------------------------------------------------------------------ */

/** Le mot de la sonde : une capitale, une hauteur d x, un jambage — les trois etages. */
export const SONDE_MOT = 'Enjeux';

/** Rapport minimal exige entre les hauteurs d encre des deux paliers (theorique : 1,5). */
export const SONDE_RATIO_MINIMAL = 1.25;

/** Part du corps que l encre du grand palier doit atteindre, capitale et jambage compris. */
export const SONDE_PART_DU_CORPS = 0.6;

const GABARIT_SONDE = {
  rubrique: 'Territoire',
  auteur: 'Noelle Vasseur',
  nomSite: 'L Echo des Hauts',
  couleurAccent: null,
};

/**
 * Le titre de sonde qui tombe sur `corpsVise` — CHERCHE, jamais ecrit en dur.
 *
 * Le nombre de mots qui fait descendre d un palier depend du modele de chasse du gabarit :
 * l ecrire ici en ferait une seconde source de verite, fausse des que le modele change.
 */
export function titreDeSonde(corpsVise) {
  for (let mots = 1; mots <= 400; mots += 1) {
    const titre = Array.from({ length: mots }, () => SONDE_MOT).join(' ');
    if (dispositionOg({ ...GABARIT_SONDE, titre }).tailleTitre === corpsVise) return titre;
  }
  return null;
}

/**
 * Rasterise la sonde aux deux paliers extremes et rend les deux hauteurs et leur rapport.
 *
 * Rend `null` quand une des deux images est illisible : confondre « illisible » et « pas
 * de glyphes » enverrait chercher la mauvaise cause (meme regle que `mesurerBandeTitre`).
 */
export async function sonderRasteriseur() {
  const grandCorps = Math.max(...TAILLES_TITRE);
  const petitCorps = Math.min(...TAILLES_TITRE);
  const mesures = [];
  for (const corps of [grandCorps, petitCorps]) {
    const titre = titreDeSonde(corps);
    if (titre === null) return null;
    const png = await sharp(Buffer.from(svgOg({ ...GABARIT_SONDE, titre }))).png().toBuffer();
    const mesure = await mesurerBandeTitre(png);
    if (mesure === null) return null;
    mesures.push({ corps, hauteur: mesure.hauteurGlyphes });
  }
  const [grand, petit] = mesures;
  return { grand, petit, ratio: petit.hauteur === 0 ? 0 : grand.hauteur / petit.hauteur };
}

/**
 * Le verdict de la sonde, PUR et exporte pour etre teste sans rasteriseur.
 *
 * Rend la liste des manquements — vide quand le rasteriseur dessine vraiment.
 */
export function verdictSonde(sonde) {
  if (sonde === null) {
    return ['sonde du rasteriseur illisible : sharp n a pas pu decoder ses deux images'];
  }
  const manques = [];
  const plancher = Math.round(sonde.grand.corps * SONDE_PART_DU_CORPS);
  if (sonde.grand.hauteur < plancher) {
    manques.push(
      `sonde du rasteriseur : au corps ${sonde.grand.corps}, l encre du mot « ${SONDE_MOT} » ne fait que ` +
        `${sonde.grand.hauteur} px de haut (< ${plancher} = ${SONDE_PART_DU_CORPS} x le corps) — les glyphes ` +
        'ne sont PAS dessines au corps demande. Cause la plus probable : aucune fonte installee dans cet ' +
        'environnement (sharp embarque fontconfig, pas de fontes).',
    );
  }
  if (sonde.ratio < SONDE_RATIO_MINIMAL) {
    manques.push(
      `sonde du rasteriseur : la hauteur d encre ne SUIT PAS le corps — ${sonde.grand.hauteur} px au corps ` +
        `${sonde.grand.corps} contre ${sonde.petit.hauteur} px au corps ${sonde.petit.corps}, soit un rapport ` +
        `de ${sonde.ratio.toFixed(2)} la ou les corps sont dans un rapport de ` +
        `${(sonde.grand.corps / sonde.petit.corps).toFixed(2)} (minimum exige ${SONDE_RATIO_MINIMAL}). Un texte ` +
        'dessine grandit avec son corps ; un rectangle de remplacement garde sa taille quel que soit le corps.',
    );
  }
  return manques;
}

function fichiersDe(dossier) {
  const trouves = [];
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const complet = path.join(dossier, entree.name);
    if (entree.isDirectory()) trouves.push(...fichiersDe(complet));
    else trouves.push(complet);
  }
  return trouves;
}

/** Les valeurs `<loc>` d un document sitemap. */
export function locsDe(xml) {
  return [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, valeur]) => valeur.trim());
}

/** Les `href` des `<xhtml:link rel="alternate">` d un sitemap. */
export function alternatesDe(xml) {
  return [...xml.matchAll(/<xhtml:link\b[^>]*\bhref="([^"]*)"/g)].map(([, valeur]) => valeur.trim());
}

/** Les liens d un flux RSS : `<link>`, `<guid>` et le `atom:link` autoreferent. */
export function liensDuFlux(xml) {
  const simples = [...xml.matchAll(/<(?:link|guid)(?:\s[^>]*)?>([^<]*)<\/(?:link|guid)>/g)].map(
    ([, valeur]) => valeur.trim(),
  );
  const atom = [...xml.matchAll(/<atom:link\b[^>]*\bhref="([^"]*)"/g)].map(([, v]) => v.trim());
  return [...simples, ...atom].filter((valeur) => valeur !== '');
}

/** Les `<meta>` d une page, indexees par `property` ou `name`. */
export function metasDe(html) {
  const trouvees = new Map();
  for (const [balise] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const cle = balise.match(/\b(?:property|name)\s*=\s*"([^"]*)"/i);
    const valeur = balise.match(/\bcontent\s*=\s*"([^"]*)"/i);
    if (cle === null || valeur === null) continue;
    const liste = trouvees.get(cle[1]) ?? [];
    liste.push(valeur[1]);
    trouvees.set(cle[1], liste);
  }
  return trouvees;
}

/** `true` quand la page se declare `noindex` (A-29). */
export function estNoindex(html) {
  return (metasDe(html).get('robots') ?? []).some((valeur) => /\bnoindex\b/i.test(valeur));
}

/**
 * Le contenu BRUT de chaque `<script type="application/ld+json">` d une page.
 *
 * La forme du type est lue largement ICI (casse, apostrophes, espaces), et strictement
 * par la garde T-09 : les deux ne repondent pas a la meme question. `verifier-sortie`
 * decide de ce que le site A LE DROIT de servir ; ce fichier-ci compte ce qui EST servi,
 * et compter large est la bonne erreur — un bloc mal type doit apparaitre comme un bloc
 * fautif, pas disparaitre du decompte.
 */
export function blocsJsonLd(html) {
  const trouves = [];
  const motif = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  for (const [, attributs, contenu] of html.matchAll(motif)) {
    const type = attributs.match(/\stype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/i);
    const valeur = type === null ? '' : (type[1] ?? type[2] ?? type[3] ?? '');
    if (valeur.trim().replace(/\s+/g, ' ').toLowerCase() === 'application/ld+json') {
      trouves.push(contenu);
    }
  }
  return trouves;
}

/**
 * Les noeuds d un bloc JSON-LD, ou `null` si le bloc n est pas un graphe lisible.
 *
 * Les trois formes acceptees par JSON-LD sont ramenees a une liste : un objet unique, un
 * tableau d objets, ou un objet portant `@graph`. Rendre `null` plutot que `[]` distingue
 * « je n ai pas su lire » de « il n y a rien dedans » — deux verdicts qui envoient a des
 * gestes opposes.
 */
export function noeudsJsonLd(contenu) {
  let valeur;
  try {
    valeur = JSON.parse(contenu);
  } catch {
    return null;
  }
  if (Array.isArray(valeur)) return valeur.filter((n) => typeof n === 'object' && n !== null);
  if (typeof valeur !== 'object' || valeur === null) return null;
  if (Array.isArray(valeur['@graph'])) {
    return valeur['@graph'].filter((n) => typeof n === 'object' && n !== null);
  }
  return [valeur];
}

/** `true` quand le bloc declare le vocabulaire schema.org, sous l une de ses formes. */
export function declareSchemaOrg(contenu) {
  try {
    const valeur = JSON.parse(contenu);
    const contexte = Array.isArray(valeur)
      ? valeur.map((n) => n?.['@context'])
      : [valeur?.['@context']];
    return contexte.some((c) => {
      if (typeof c === 'string') return /^https?:\/\/schema\.org\/?$/i.test(c.trim());
      if (typeof c === 'object' && c !== null) return Object.values(c).some((v) => typeof v === 'string' && /schema\.org/i.test(v));
      return false;
    });
  } catch {
    return false;
  }
}

/**
 * Les URL qu un graphe AFFIRME joignables : `url` et `item`, a toute profondeur.
 *
 * `@id` est volontairement exclu : c est un identifiant, souvent porteur d un fragment
 * (`…/#organisation`) qui ne designe aucun fichier. `urlTemplate` l est aussi — celui du
 * `SearchAction` porte un gabarit (`{search_term_string}`) et vise `/recherche`, qui
 * releve du lot Pagefind (§5.4) et n est pas encore construit. Ce point-la est une dette
 * NOMMEE, pas un oubli : il se refermera quand la page existera, sans rien changer ici.
 */
export function urlsDuGraphe(valeur, trouvees = new Set()) {
  if (Array.isArray(valeur)) {
    for (const entree of valeur) urlsDuGraphe(entree, trouvees);
    return trouvees;
  }
  if (typeof valeur !== 'object' || valeur === null) return trouvees;
  for (const [cle, sous] of Object.entries(valeur)) {
    if ((cle === 'url' || cle === 'item') && typeof sous === 'string') trouvees.add(sous);
    else urlsDuGraphe(sous, trouvees);
  }
  return trouvees;
}

/**
 * Les deux grandeurs de la bande de titre d une image : la hauteur des glyphes dessines,
 * sur laquelle la garde DECIDE, et l ecart-type des pixels, qu elle ne fait que rapporter.
 *
 *   `hauteurGlyphes` : hauteur, en pixels, du plus haut bloc de rangees CONTIGUES portant
 *     de l encre. Sur un titre de plusieurs lignes, c est la hauteur d UNE ligne — les
 *     lignes sont separees par l interligne, donc par des rangees vierges. La grandeur ne
 *     depend ni du nombre de lignes ni de la longueur du titre : seulement de la taille a
 *     laquelle les glyphes ont ete rendus. C est exactement ce qu on veut savoir.
 *
 *   `ecartType` : conserve dans le message d echec, comme contexte de diagnostic. Il ne
 *     decide RIEN, et le test « l ecart-type ne separe pas les deux populations » de
 *     `tests/garde-seo.test.ts` interdit d y revenir.
 *
 * Les deux sont calcules sur les OCTETS BRUTS de la zone extraite, jamais via
 * `sharp().stats()`. Ce n est pas un detail de style : `stats()` decrit l image d ENTREE
 * et ignore les operations du pipeline (`extract`, `greyscale`). Mesure le 2026-08-07 —
 * un gabarit dont tous les textes avaient ete retires rendait 32,4 au lieu de 0, parce
 * que le filet d accent en haut de l image, hors bande, etait compte quand meme.
 *
 * Rend `null` quand l image est illisible — un fichier corrompu est signale ailleurs, et
 * confondre « corrompu » et « sans glyphes » enverrait chercher la mauvaise cause.
 */
export async function mesurerBandeTitre(fichier) {
  try {
    /* `fichier` est un chemin OU les octets d un PNG — la sonde du controle 7 mesure une
       image qu elle vient de produire et qui n a aucune raison de toucher le disque. */
    const { width, height } = await sharp(fichier).metadata();
    if (!width || !height) return null;
    const haut = Math.round(height * BANDE_TITRE.haut);
    const bas = Math.round(height * BANDE_TITRE.bas);
    const hauteurBande = bas - haut;
    const pixels = await sharp(fichier)
      .extract({ left: 0, top: haut, width, height: hauteurBande })
      .greyscale()
      .raw()
      .toBuffer();
    if (pixels.length === 0) return null;

    let somme = 0;
    for (const octet of pixels) somme += octet;
    const moyenne = somme / pixels.length;
    let ecarts = 0;
    for (const octet of pixels) ecarts += (octet - moyenne) ** 2;

    let hauteurGlyphes = 0;
    let bloc = 0;
    for (let y = 0; y < hauteurBande; y += 1) {
      let encre = 0;
      for (let x = 0; x < width; x += 1) {
        if (pixels[y * width + x] < SEUIL_ENCRE) encre += 1;
      }
      if (encre >= ENCRE_PAR_RANGEE) {
        bloc += 1;
        if (bloc > hauteurGlyphes) hauteurGlyphes = bloc;
      } else {
        bloc = 0;
      }
    }

    return { hauteurGlyphes, ecartType: Math.sqrt(ecarts / pixels.length) };
  } catch {
    return null;
  }
}

/**
 * @param {string} dist Chemin du repertoire de sortie.
 * @param {string} origine URL publique du site (`ECHO_SITE_URL`).
 */
export async function inspecterSeo(dist, origine) {
  const vide = {
    manquements: [],
    issue: ISSUES.CONFORME,
    pagesIndexables: 0,
    pagesIndexablesAvecJsonLd: 0,
    noeudsStructures: 0,
    urlsSitemap: 0,
    liensFlux: 0,
    imagesOg: 0,
    segments: 0,
  };

  /* AVANT TOUT : la reference. Ce fichier portait la variante la plus silencieuse des
     trois — `hote !== null && absolue.origin !== hote` DESACTIVE le test d origine en
     entier quand l origine ne se lit pas. Toute URL, meme celle d un autre site,
     redevenait alors « interne », et sa seule partie chemin etait confrontee a dist/.
     Le 2026-08-10, sortie IDENTIQUE au caractere pres avec et sans origine valide :
     `✔ 18 URL au sitemap sur 6 segment(s)…`, code 0. Succes et incapacite rendaient
     litteralement la meme phrase. */
  const lecture = lireOrigine(origine);
  if (!lecture.lisible) return { ...vide, manquements: [lecture.manquement], issue: lecture.issue };

  if (!fs.existsSync(dist)) {
    return { ...vide, manquements: [`sortie absente : ${dist}`], issue: ISSUES.VERIFICATION_IMPOSSIBLE };
  }

  const relatifs = fichiersDe(dist).map((f) => path.relative(dist, f).split(path.sep).join('/'));

  /* SECONDE INCAPACITE : `dist/` existe et ne porte pas une seule page. Ce fichier etait
     le seul des quatre a ne pas rendre un vert sur ce cas — il rendait `1`, « sitemap
     index absent : sitemap-index.xml (§5.2) », ce qui est pire qu inutile : le code et le
     message envoyaient corriger le SEO d un site dont aucune page n avait ete construite.
     C est la faute de cause deja fermee deux fois ici (800a978, 64614b7), et elle se
     referme au meme endroit que les trois verts. Le declencheur est « zero PAGE
     inspectee », jamais « zero URL au sitemap ». Argument et message : `./issues.mjs`. */
  if (!relatifs.some((relatif) => relatif.endsWith('.html'))) {
    return {
      ...vide,
      manquements: [manquementCorpusVide(dist, relatifs.length)],
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
    };
  }

  const routes = new Set();
  for (const relatif of relatifs) {
    const route = routeDuFichier(relatif);
    if (route !== null) routes.add(route);
  }
  const servis = new Set(relatifs.map((relatif) => `/${relatif}`));

  const hote = lecture.hote;
  const manquements = [];

  /** Le chemin d une URL du site, ou `null` si elle designe un autre hote. */
  const cheminInterne = (url) => {
    const absolue = (() => {
      try {
        return new URL(url, hote);
      } catch {
        return null;
      }
    })();
    if (absolue === null) return undefined; // illisible
    /* Un autre hote sort de la portee de ce fichier, et c est correct : ce `null`-la
       dit « cette URL est ailleurs », il ne dit plus « je n ai pas su regarder ». */
    if (absolue.origin !== hote) return null;
    return normaliser(absolue.pathname);
  };

  const resout = (chemin) => routes.has(chemin) || servis.has(chemin);

  // --- 1 et 2. Le sitemap index, ses segments, et leurs URL ------------------------
  const noindexParRoute = new Map();
  for (const relatif of relatifs) {
    if (!relatif.endsWith('.html')) continue;
    const route = routeDuFichier(relatif);
    if (route === null) continue;
    noindexParRoute.set(route, estNoindex(fs.readFileSync(path.join(dist, relatif), 'utf8')));
  }

  const indexSitemap = 'sitemap-index.xml';
  const urlsSitemap = new Set();
  let segments = 0;

  if (!relatifs.includes(indexSitemap)) {
    manquements.push(`sitemap index absent : ${indexSitemap} (§5.2 : sitemap index segmente)`);
  } else {
    const xmlIndex = fs.readFileSync(path.join(dist, indexSitemap), 'utf8');
    for (const loc of locsDe(xmlIndex)) {
      const chemin = cheminInterne(loc);
      if (chemin === undefined || chemin === null) {
        manquements.push(`sitemap-index.xml : segment hors du site ou illisible « ${loc} »`);
        continue;
      }
      const fichier = chemin.replace(/^\//, '');
      if (!relatifs.includes(fichier)) {
        manquements.push(`sitemap-index.xml declare « ${chemin} », que dist/ ne contient pas`);
        continue;
      }
      segments += 1;
      const xmlSegment = fs.readFileSync(path.join(dist, fichier), 'utf8');

      for (const url of locsDe(xmlSegment)) {
        const cible = cheminInterne(url);
        if (cible === undefined || cible === null) {
          manquements.push(`${fichier} : <loc> hors du site ou illisible « ${url} »`);
          continue;
        }
        urlsSitemap.add(cible);
        if (!resout(cible)) {
          manquements.push(`${fichier} : <loc> « ${cible} » ne correspond a aucune page de dist/`);
          continue;
        }
        // --- 3. Une URL declaree ne doit pas se dire noindex (A-29).
        if (noindexParRoute.get(cible) === true) {
          manquements.push(
            `${fichier} : « ${cible} » est declaree au sitemap ALORS QU elle porte ` +
              'meta robots=noindex — contradiction remontee en erreur par la Search Console (A-29)',
          );
        }
      }

      for (const href of alternatesDe(xmlSegment)) {
        const cible = cheminInterne(href);
        if (cible === undefined || cible === null) continue;
        if (!resout(cible)) {
          manquements.push(`${fichier} : alternate hreflang « ${cible} » absent de dist/`);
        }
      }
    }
  }

  // --- 4. Couverture : toute page indexable emise doit etre au sitemap --------------
  let pagesIndexables = 0;
  for (const [route, noindex] of noindexParRoute) {
    if (noindex) continue;
    pagesIndexables += 1;
    if (!urlsSitemap.has(route)) {
      manquements.push(
        `page indexable absente du sitemap : « ${route} » — elle est emise, elle ne porte ` +
          'pas noindex, et aucun segment ne la declare',
      );
    }
  }

  // --- 5. Les flux RSS ---------------------------------------------------------------
  let liensFlux = 0;
  for (const relatif of relatifs) {
    if (!/(^|\/)rss\.xml$/.test(relatif)) continue;
    const xml = fs.readFileSync(path.join(dist, relatif), 'utf8');
    for (const lien of liensDuFlux(xml)) {
      const cible = cheminInterne(lien);
      if (cible === undefined) {
        manquements.push(`${relatif} : lien illisible « ${lien} »`);
        continue;
      }
      if (cible === null) continue;
      liensFlux += 1;
      if (!resout(cible)) {
        manquements.push(`${relatif} : le flux publie « ${cible} », absent de dist/`);
      }
    }
  }

  // --- 6. Les balises de partage des pages -------------------------------------------
  for (const relatif of relatifs) {
    if (!relatif.endsWith('.html')) continue;
    const html = fs.readFileSync(path.join(dist, relatif), 'utf8');
    const metas = metasDe(html);

    for (const obligatoire of PARTAGE_OBLIGATOIRE) {
      if (!metas.has(obligatoire)) {
        manquements.push(`${relatif} : balise « ${obligatoire} » absente (§5.2 : Open Graph complet)`);
      }
    }
    if (!metas.has('twitter:card')) {
      manquements.push(`${relatif} : balise « twitter:card » absente (§5.2 : Twitter Card complete)`);
    }

    const canoniques = [...html.matchAll(/<link\b[^>]*\brel="canonical"[^>]*>/gi)];
    if (canoniques.length !== 1) {
      manquements.push(
        `${relatif} : ${canoniques.length} balise(s) canonical (§5.2 : canoniques systematiques, ` +
          'et une seule par page — deux canoniques valent zero canonique pour Google)',
      );
    }

    for (const cle of ['og:image', 'twitter:image']) {
      for (const valeur of metas.get(cle) ?? []) {
        const cible = cheminInterne(valeur);
        if (cible === undefined) {
          manquements.push(`${relatif} : ${cle} illisible « ${valeur} »`);
          continue;
        }
        /* Une image de partage HORS du site sort de la portee de ce fichier — mais plus
           du silence : depuis T-01, `garde-origine-medias` la REFUSE, parce que la CSP
           servie la refuse aussi. C est ici que le defaut du 2026-08-08 s est glisse,
           quand ce `continue` couvrait un og:image vers le CMS. */
        if (cible === null) continue;
        if (!resout(cible)) {
          manquements.push(`${relatif} : ${cle} pointe « ${cible} », absent de dist/`);
        }
      }
    }
  }

  // --- 7. Les images OG generees portent-elles vraiment du texte ? -------------------
  let imagesOg = 0;
  for (const relatif of relatifs) {
    if (!relatif.startsWith('og/') || !relatif.endsWith('.png')) continue;
    imagesOg += 1;
    const mesure = await mesurerBandeTitre(path.join(dist, relatif));
    if (mesure === null) {
      manquements.push(`${relatif} : image illisible — sharp n a pas pu la decoder`);
      continue;
    }
    if (mesure.hauteurGlyphes < HAUTEUR_MINIMALE_GLYPHES) {
      manquements.push(
        `${relatif} : glyphes de ${mesure.hauteurGlyphes} px de haut dans la bande de titre ` +
          `(< ${HAUTEUR_MINIMALE_GLYPHES} ; ecart-type ${mesure.ecartType.toFixed(2)}, qui ne decide rien) — ` +
          'l image a ete produite MAIS son titre n a pas ete dessine au corps demande : le plus petit ' +
          `palier du gabarit est ${Math.min(...TAILLES_TITRE)} px. Cause la plus probable : aucune fonte ` +
          'installee dans l environnement de build (sharp embarque fontconfig, pas de fontes), auquel cas ' +
          'le rasteriseur remplace chaque caractere par un rectangle d une douzaine de pixels.',
      );
    }
  }

  /* 7 bis. LA SONDE DU RASTERISEUR. Le seuil absolu ci-dessus a ete FRANCHI par un tofu de
     21 px le 2026-08-11 : il ne suffit pas, et il ne peut pas etre releve sans mordre sur
     le plancher legitime (22 px). La sonde tranche sur une grandeur que le tofu ne peut pas
     imiter — la PROPORTIONNALITE de l encre au corps demande. Cf. son en-tete.

     Elle ne tourne que s il y a au moins une image OG a juger : sans image generee, il n y
     a rien a dire du rasteriseur, et la faire tourner quand meme ferait rougir un `dist/`
     qui ne demande rien a personne. */
  if (imagesOg > 0) {
    manquements.push(...verdictSonde(await sonderRasteriseur()));
  }

  /* --- 8. Les donnees structurees du §5.1, EXERCEES AU POINT DE LECTURE -------------
     Le critere du §1 dit « 100 % des pages indexables portent un JSON-LD valide ». Il ne
     se lit ni dans le layout ni dans `src/lib/seo/donnees-structurees.ts` : un layout qui
     oublierait d appeler la fonction, une page qui court-circuiterait le layout, une
     valeur qui casserait le JSON a la serialisation ne se verraient QUE dans `dist/`.
     C est donc ici que le critere se mesure — on compte les pages indexables, on compte
     celles qui portent un graphe lisible, et on refuse tout ecart.

     Le comptage est double a dessein : chaque page manquante est nommee, ET l ecart
     global est affirme separement. Nommer sans compter laisserait passer un decompte
     fausse par un `continue` ; compter sans nommer n enverrait nulle part. */
  let pagesIndexablesAvecJsonLd = 0;
  let noeudsStructures = 0;

  for (const relatif of relatifs) {
    if (!relatif.endsWith('.html')) continue;
    const route = routeDuFichier(relatif);
    const indexable = route !== null && noindexParRoute.get(route) === false;
    const blocs = blocsJsonLd(fs.readFileSync(path.join(dist, relatif), 'utf8'));

    if (blocs.length === 0) {
      if (indexable) {
        manquements.push(
          `page indexable SANS donnees structurees : « ${route} » — §5.1, et critere du §1 ` +
            '(« 100 % des pages indexables portent un JSON-LD valide »)',
        );
      }
      continue;
    }

    let lisibles = 0;
    for (const [rang, contenu] of blocs.entries()) {
      const ou = `${relatif} : bloc JSON-LD ${rang + 1}/${blocs.length}`;
      const noeuds = noeudsJsonLd(contenu);

      if (noeuds === null) {
        manquements.push(`${ou} — contenu illisible, JSON.parse le refuse : « ${contenu.trim().slice(0, 60)} »`);
        continue;
      }
      if (noeuds.length === 0) {
        manquements.push(`${ou} — graphe VIDE : un bloc valide et sans noeud ne declare rien`);
        continue;
      }
      if (!declareSchemaOrg(contenu)) {
        manquements.push(`${ou} — aucun « @context » schema.org : un graphe sans vocabulaire n est interprete par personne`);
        continue;
      }

      const sansType = noeuds.filter((n) => n['@type'] === undefined || n['@type'] === null);
      if (sansType.length > 0) {
        manquements.push(`${ou} — ${sansType.length} noeud(s) sans « @type »`);
        continue;
      }

      /* Les URL que le graphe AFFIRME joignables doivent l etre. Un `item` de fil
         d Ariane ou une `image` qui ne resout pas ne casse aucune page et ne se
         decouvre qu en Search Console — exactement le silence que ce fichier existe
         pour rompre (meme raison que le controle 6 sur `og:image`). */
      for (const url of urlsDuGraphe(noeuds)) {
        const cible = cheminInterne(url);
        if (cible === undefined) {
          manquements.push(`${ou} — URL illisible « ${url} »`);
          continue;
        }
        if (cible === null) continue; // un autre hote sort de la portee de ce fichier
        if (!resout(cible)) {
          manquements.push(`${ou} — le graphe declare « ${cible} », que dist/ ne contient pas`);
        }
      }

      noeudsStructures += noeuds.length;
      lisibles += 1;
    }

    if (lisibles > 0 && indexable) pagesIndexablesAvecJsonLd += 1;
  }

  if (pagesIndexablesAvecJsonLd !== pagesIndexables) {
    manquements.push(
      `couverture des donnees structurees : ${pagesIndexablesAvecJsonLd} page(s) indexable(s) ` +
        `sur ${pagesIndexables} portent un JSON-LD lisible — le critere du §1 exige 100 %, ` +
        `l ecart est de ${pagesIndexables - pagesIndexablesAvecJsonLd}`,
    );
  }

  return {
    manquements,
    issue: manquements.length > 0 ? ISSUES.ANOMALIE : ISSUES.CONFORME,
    pagesIndexables,
    pagesIndexablesAvecJsonLd,
    noeudsStructures,
    urlsSitemap: urlsSitemap.size,
    liensFlux,
    imagesOg,
    segments,
  };
}

export function resumeSeo(rapport) {
  return (
    `${rapport.urlsSitemap} URL au sitemap sur ${rapport.segments} segment(s), ` +
    `${rapport.pagesIndexables} page(s) indexable(s) toutes declarees, ` +
    `${rapport.pagesIndexablesAvecJsonLd}/${rapport.pagesIndexables} portant un JSON-LD lisible ` +
    `(${rapport.noeudsStructures} noeud(s) structure(s)), ` +
    `${rapport.liensFlux} lien(s) de flux, ${rapport.imagesOg} image(s) OG dont le titre est ` +
    `dessine a plus de ${HAUTEUR_MINIMALE_GLYPHES} px de haut.`
  );
}

// --- Usage en ligne de commande ---------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dist = process.argv[2] ?? path.join(racine, 'dist');
  const origine = process.argv[3] ?? process.env.ECHO_SITE_URL ?? 'https://echo.ayfiweb.fr';
  const rapport = await inspecterSeo(dist, origine);
  if (rapport.issue === ISSUES.VERIFICATION_IMPOSSIBLE) {
    console.error('\n⛔ VERIFICATION IMPOSSIBLE — aucune sortie SEO n a ete jugee :');
    for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
    process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
  }
  if (rapport.manquements.length > 0) {
    console.error(`\n✖ ${rapport.manquements.length} manquement(s) :`);
    for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
    process.exit(ISSUES.ANOMALIE);
  }
  console.log(`✔ ${resumeSeo(rapport)}`);
}
