/**
 * Confronte l attribut `alt` du HTML SERVI a la declaration `decoratif` du manifeste.
 *
 * LE TROU QUE CE FICHIER FERME, mesure le 2026-08-12. Aucun verificateur de sortie ne
 * regardait `alt` : `verifier-images` lit `width`, `height`, `loading` et `fetchpriority`
 * ; `verifier-origine-medias` lit `src` ; `verifier-seo` ignore les images hors `og:`.
 * Le seul instrument qui voyait l alternative etait axe-core — et il n intervient qu en
 * CAMPAGNE P2, c est-a-dire trop tard (le defaut est deja en ligne) et trop rarement (une
 * campagne, pas un push). Les deux defauts d alternatives corriges le 2026-08-11 ont
 * vecu la : `alt="   "` servi par un optionnel qui ne ramenait a `null` que la chaine
 * STRICTEMENT vide, et 36 alternatives qui nommaient la FORME du dessin.
 *
 * ── TROIS PIEGES, ET LA REGLE EST CE QUI RESTE APRES LES AVOIR EVITES ────────────────
 *
 * 1. **Astro emet un attribut `alt` NU, pas `alt=""`.** Mesure du 2026-08-11 sur le HTML
 *    reellement produit : `<img src="…" alt width="1200" height="800" loading="lazy">`.
 *    Les deux formes sont identiques pour un analyseur HTML — donc pour axe-core, qui
 *    travaille sur le DOM — mais un `grep 'alt=""'` sur `dist/` ne trouve RIEN. Une garde
 *    ecrite ainsi passerait au vert en ne voyant AUCUNE image decorative. `alternativeDe`
 *    lit les deux formes, et refuse de lire `altura="x"` comme un `alt` nu.
 *
 * 2. **Exiger un `alt` NON VIDE serait pire que rien.** La regle validerait « Diagramme en
 *    barres » — presente et inutile — et REFUSERAIT les 22 galeries legitimement vides. Ce
 *    qui se verifie n est pas la presence d un texte, c est la COHERENCE avec ce que le
 *    manifeste DECLARE : le vide se declare, il ne s obtient pas par oubli.
 *
 * 3. **Le vide peut etre une decision de POSITION, et elle est legitime.**
 *    `CarteArticle.astro` ecrit `alt=""` EN DUR sur la couverture d une carte : le titre de
 *    la carte est le lien, repeter l alternative de la couverture ferait du bruit. Le meme
 *    media sort donc VIDE en carte et PARLANT sur la page de l article. Mesure du
 *    2026-08-12 sur le build de fixtures : 67 images, 20 a `alt` vide, aucune sans `alt`.
 *    Une regle de position — « ce media est declare parlant, donc chacune de ses balises
 *    doit porter une alternative » — rougirait sur VINGT images saines a chaque build, et
 *    serait desarmee dans la semaine.
 *
 * ── LES DEUX REGLES ─────────────────────────────────────────────────────────────────
 *
 * **R1, de position, sans aucune declaration.** Toute `<img>` porte un attribut `alt`, et
 * sa valeur est soit VIDE (declaration de decor), soit PARLANTE. Une valeur faite de
 * blancs n est ni l une ni l autre : elle passe axe-core, qui exige une alternative non
 * nulle et en trouve une, et elle ne dit rien a personne.
 *
 * **R2, de CORPUS, contre le manifeste.** Pour chaque media du manifeste que le site sert
 * au moins une fois :
 *   - declare `decoratif: true`  -> AUCUNE page ne doit lui donner une alternative ;
 *   - sinon                      -> AU MOINS UNE page doit servir une alternative.
 * Le vide contextuel reste libre ; le vide TOTAL, lui, veut dire que l alternative
 * declaree n atteint aucun lecteur — mapping qui la perd, seed qui ne la pousse pas,
 * champ vide en base.
 *
 * ── CE QUE CE FICHIER NE VERIFIE PAS, ET POURQUOI ────────────────────────────────────
 *
 * Il ne compare JAMAIS le TEXTE servi a celui du manifeste. L avenant A4 du brief donne
 * au role `Redacteur` le droit d editer les details d un media, texte alternatif compris :
 * une divergence de texte entre le manifeste et l instance est un geste AUTORISE, et la
 * denoncer ferait rougir la garde sur l exercice d un droit ratifie. Seule la dichotomie
 * decoratif / parlant est opposable, parce qu elle, personne ne l a jamais autorisee a
 * bouger sans declaration.
 *
 * Il ne juge pas non plus la FORME du manifeste (`decoratif` qui ne serait pas le booleen
 * `true`, alternative vide sans declaration) : c est le chargement du corpus du seed
 * (`apps/cms/scripts/seed/corpus.ts`) qui refuse ces cas, et deux juges pour une meme
 * regle finissent par diverger.
 *
 * ── POURQUOI CE N EST PAS UNE INTEGRATION DE BUILD ───────────────────────────────────
 *
 * Les gardes d `integrations/` s executent dans CHAQUE build, y compris celui de
 * production. Or l application Coolify `echo-site` a pour `Base Directory` `/apps/web`
 * (cf. `apps/web/nixpacks.toml`) : `apps/cms/data/medias/manifeste.json` n est PAS dans son
 * contexte de construction. Une garde de build qui le lirait rendrait 2 —
 * VERIFICATION IMPOSSIBLE — et ferait echouer la production pour une cause qui n existe
 * que chez elle. Ce verificateur reste donc en ligne de commande, et l integration
 * continue le relance a chaque push : `scripts/verificateurs-de-sortie.mjs` DERIVE la
 * liste de `package.json`, il n y a rien a inscrire ailleurs.
 *
 * ⚠️ CE QUE CELA COUTE, ECRIT PLUTOT QUE TU : le `dist/` que l integration continue lui
 * donne est celui du build sur FIXTURES, dont les medias ne portent pas les noms du
 * manifeste. R1 y juge les 67 images ; R2 y juge ZERO media, et le compte rendu le DIT
 * (`resumeAlternatives`) plutot que de rendre une coche muette. R2 est exercee ailleurs :
 * par `tests/garde-alternatives.test.ts`, qui la casse dans les deux sens a chaque push, et
 * par un `npm run verifier:alternatives` sur un `dist/` construit contre l instance Strapi
 * garnie — c est-a-dire en recette (P3).
 *
 *   npm run verifier:alternatives
 *   node scripts/verifier-alternatives.mjs [dist] [--manifeste=<chemin>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ISSUES, manquementCorpusVide } from './issues.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Le prefixe sous lequel le SITE sert ses medias — la meme valeur que `src/lib/media.ts`. */
const PREFIXE_MEDIAS = '/medias/';

/**
 * Le manifeste du corpus, dans l AUTRE application du monorepo.
 *
 * Il est le seul domicile de la declaration `decoratif` : le seed la lit ici et televerse
 * une `alternativeText` vide en consequence. Rien n en est recopie de ce cote.
 */
export const MANIFESTE_PAR_DEFAUT = path.join(
  RACINE,
  '..',
  'cms',
  'data',
  'medias',
  'manifeste.json',
);

/**
 * L ALPHABET DES BLANCS — les caracteres qui ne peignent rien a l ecran.
 *
 * Mesure du 2026-08-11, sur une alternative a `"  ​ "` : le rendu servait
 * `alt="   "`, axe-core comptait trois espaces comme une description valide, et la page
 * restait verte sur une image qui n avait plus AUCUNE alternative. La chaine vide est une
 * DECLARATION ; une chaine de blancs est un oubli deguise en declaration.
 */
const BLANCS = /^[\s\u180E\u200B\u200C\u200D\u2060\uFEFF]+$/;

/** Les entites que l echappement HTML d Astro peut avoir posees sur une valeur d attribut. */
const NOMMEES = new Map([
  ['nbsp', '\u00A0'],
  ['ensp', '\u2002'],
  ['emsp', '\u2003'],
  ['thinsp', '\u2009'],
  ['zwnj', '\u200C'],
  ['zwj', '\u200D'],
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['#39', "'"],
]);

/**
 * La valeur d attribut telle que le NAVIGATEUR la lira.
 *
 * Sans ce decodage, `alt=" &#160;&#8203; "` passerait pour parlante : la garde jugerait la
 * source du document plutot que ce que le lecteur d ecran recevra.
 */
export function decoder(valeur) {
  return valeur.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (entier, corps) => {
    if (corps.startsWith('#x') || corps.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(corps.slice(2), 16));
    }
    if (corps.startsWith('#')) return String.fromCodePoint(Number.parseInt(corps.slice(1), 10));
    const connue = NOMMEES.get(corps.toLowerCase());
    return connue ?? entier;
  });
}

/** Une valeur NON VIDE faite uniquement de blancs : ni une declaration, ni une description. */
export function estBlanche(valeur) {
  const lisible = decoder(valeur);
  return lisible.length > 0 && BLANCS.test(lisible);
}

/**
 * L attribut `alt` d une balise ouvrante : est-il PRESENT, et que vaut-il ?
 *
 * LE PIEGE EST ICI. `alt` nu et `alt=""` sont la meme chose, et il faut lire les deux ;
 * `altura` et `data-alt` n en sont pas, et les lire comme un `alt` nu rendrait la garde
 * verte sur une image DEPOURVUE d alternative. La borne `(?=[\s/>=])` apres le nom est ce
 * qui separe les deux cas.
 *
 * @returns {{presente: boolean, valeur: string}}
 */
export function alternativeDe(balise) {
  const trouve = balise.match(
    /(?:^|[\s"'])alt(?=[\s/>=])\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/i,
  );
  if (trouve === null) return { presente: false, valeur: '' };
  return { presente: true, valeur: trouve[1] ?? trouve[2] ?? trouve[3] ?? '' };
}

/**
 * LE MANIFESTE, LU — ou DECLARE illisible, jamais rendu sous la forme d un objet vide
 * qu une boucle traverserait avant de sortir en vert.
 *
 * Meme forme que `lireOrigine()` de `./origine.mjs`, et pour la meme cause : une
 * incapacite servie sous l apparence d une reponse plausible est le pire des deux
 * mondes. Un manifeste vide EST une incapacite — il n y a plus rien a confronter.
 *
 * LES DECLARATIONS SONT INDEXEES PAR NOM DE FICHIER, et la valeur est une LISTE. Le
 * manifeste garantit l unicite du nom — le seed s en sert pour rapprocher un fichier de la
 * mediatheque — mais garder la liste est ce qui permet de DIRE la collision plutot que d en
 * retenir une au hasard : un rapprochement ambigu resolu en silence donnerait un verdict
 * sur la mauvaise declaration.
 *
 * @param {string} chemin
 * @returns {{lisible: boolean, declarations: Map<string, {cle: string, decoratif: boolean}[]>,
 *            manquement: string, issue: number}}
 */
export function lireManifeste(chemin) {
  const refus = (motif) => ({
    lisible: false,
    declarations: new Map(),
    manquement:
      `manifeste des medias illisible (${chemin}) : ${motif}. ` +
      'La coherence « vide si et seulement si declare decoratif » n a donc rien pu ' +
      'confronter — ce n est PAS un site conforme, c est une garde aveugle.',
    issue: ISSUES.VERIFICATION_IMPOSSIBLE,
  });

  if (!fs.existsSync(chemin)) return refus('fichier absent');

  let brut;
  try {
    brut = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  } catch (erreur) {
    return refus(`JSON invalide — ${erreur.message}`);
  }
  if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) {
    return refus('un objet de declarations est attendu');
  }

  const declarations = new Map();
  for (const [cle, meta] of Object.entries(brut)) {
    /* LE RAPPROCHEMENT SE FAIT SUR LE NOM DE FICHIER, et le manifeste garantit son
       unicite — c est deja la cle du rapprochement dans la mediatheque
       (`apps/cms/scripts/seed/corpus.ts`). On reprend la meme, on n en invente pas une. */
    const nom = normaliserNom(path.basename(cle));
    const deja = declarations.get(nom);
    const declaration = { cle, decoratif: meta?.decoratif === true };
    if (deja === undefined) declarations.set(nom, [declaration]);
    else deja.push(declaration);
  }

  if (declarations.size === 0) return refus('aucune declaration de media');

  return { lisible: true, declarations, manquement: '', issue: ISSUES.CONFORME };
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

/**
 * Un nom de fichier ramene a la forme sur laquelle les deux bouts se comparent :
 * extension retiree, minuscules, toute suite de caracteres non alphanumeriques ramenee a
 * un `_`.
 *
 * POURQUOI LE `_`, ET PAS LE TIRET DU MANIFESTE. Strapi RENOMME ce qu il recoit, et il le
 * fait avec le tiret bas. Mesure du 2026-08-12, en lisant le code de l instance
 * (`@strapi/upload@5.51.x`, `services/image-manipulation.js`) et en exercant sa dependance
 * `@sindresorhus/slugify@1.1.0`, celle que `@strapi/utils` declare :
 *
 *     hash = nameToSlug(basename, { separator: '_', lowercase: false }) + '_' + 10 hex
 *
 *     A01.svg              ->  A01_a1b2c3d4e5.svg
 *     A01-poste-source.svg ->  A01_poste_source_a1b2c3d4e5.svg
 *     logo-sombre.svg      ->  logo_sombre_a1b2c3d4e5.svg
 *
 * Comparer les noms bruts ferait donc manquer TOUS les medias a tiret — soit la moitie du
 * corpus — et la garde rendrait un vert sur ce qu elle n aurait pas su rattacher.
 */
export function normaliserNom(nom) {
  return nom
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
}

/**
 * LE SUFFIXE QUE STRAPI AJOUTE : `crypto.randomBytes(5).toString('hex')`, donc DIX
 * caracteres hexadecimaux, jamais un mot.
 *
 * Sa forme exacte n est pas un detail de confort : c est elle qui empeche le rapprochement
 * d etre AMBIGU. Sans elle, `a01` se rapprocherait aussi de `a01_poste_source_a1b2c3d4e5`
 * — un AUTRE media — et la garde jugerait un bloc contre la declaration d une couverture.
 * Mesure du meme jour, sur le `dist/` de fixtures : la borne fait tomber le faux
 * rapprochement de `logo_clair_3344` avec `identite/logo.svg`.
 */
const SUFFIXE_STRAPI = /^[0-9a-f]{10}$/;

/**
 * Un fichier SERVI designe-t-il la declaration `base` ? Les deux noms sont attendus
 * NORMALISES (`normaliserNom`).
 *
 * Exporte parce que ce rapprochement n est pas propre a cette garde : `preuve-surcharge-
 * seo.mjs` doit le faire aussi, pour dire si l `og:image` d une page porte bien l image
 * choisie par la redaction. Le recopier la-bas serait la deuxieme copie d une regle
 * qui vit dans le renommage de Strapi — et deux copies d une regle finissent toujours
 * par diverger le jour ou Strapi change de separateur.
 */
export function designeLeMedia(servi, base) {
  if (servi === base) return true;
  return servi.startsWith(`${base}_`) && SUFFIXE_STRAPI.test(servi.slice(base.length + 1));
}

/**
 * Le nom de fichier servi, normalise — ou `null` quand l URL ne designe pas la
 * mediatheque du site (`data:`, `/favicon.svg`, une image de partage) : aucune de
 * celles-la n a de declaration a confronter.
 */
export function nomServi(url) {
  const chemin = url.split('#')[0].split('?')[0];
  if (!chemin.startsWith(PREFIXE_MEDIAS)) return null;
  const reste = chemin.slice(PREFIXE_MEDIAS.length);
  if (reste === '') return null;
  return normaliserNom(path.posix.basename(reste));
}

/**
 * Les entrees du manifeste qu un fichier servi peut designer : le nom EXACT, ou le nom
 * suivi du suffixe de Strapi. Rien d autre — un rapprochement approximatif rendrait un
 * verdict sur la mauvaise declaration, ce qui est pire qu aucun verdict.
 */
function rapprocher(declarations, servi) {
  const trouvees = [];
  for (const [base, lot] of declarations) {
    if (designeLeMedia(servi, base)) trouvees.push(...lot);
  }
  return trouvees;
}

/**
 * @param {string} dist Chemin du repertoire de sortie.
 * @param {string} [cheminManifeste] Chemin du manifeste des medias.
 * @returns {{manquements: string[], issue: number, images: number, pages: number,
 *            mediasJuges: number}}
 */
export function inspecterAlternatives(dist, cheminManifeste = MANIFESTE_PAR_DEFAUT) {
  const rien = { images: 0, pages: 0, mediasJuges: 0 };

  /* AVANT TOUT LE RESTE : la declaration. Sans elle, R2 ne peut pas exister, et rendre le
     vert de R1 seule ferait passer une garde a MOITIE aveugle pour une garde verte. */
  const manifeste = lireManifeste(cheminManifeste);
  if (!manifeste.lisible) {
    return { manquements: [manifeste.manquement], issue: manifeste.issue, ...rien };
  }

  if (!fs.existsSync(dist)) {
    return {
      manquements: [`sortie absente : ${dist}`],
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      ...rien,
    };
  }

  const tous = fichiersDe(dist).map((f) => path.relative(dist, f).split(path.sep).join('/'));
  const pages = tous.filter((relatif) => relatif.endsWith('.html'));

  /* SECONDE INCAPACITE, la meme que chez les sept autres : `dist/` existe et ne porte pas
     une seule page. Le declencheur est « zero PAGE inspectee », JAMAIS « zero image » —
     une page sans `<img>` reste legitimement conforme. Argument et message : ./issues.mjs */
  if (pages.length === 0) {
    return {
      manquements: [manquementCorpusVide(dist, tous.length)],
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      ...rien,
    };
  }

  const manquements = [];
  /* Ce que chaque media du manifeste a REELLEMENT recu, toutes pages confondues. R2 se
     prononce sur ce cumul, jamais sur une balise isolee — c est le piege 3. */
  const parMedia = new Map();
  let images = 0;

  for (const relatif of pages) {
    const html = fs.readFileSync(path.join(dist, relatif), 'utf8');

    for (const [balise] of html.matchAll(/<img\b[^>]*>/gi)) {
      images += 1;
      const source = (balise.match(/\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i) ?? [])
        .slice(1)
        .find((v) => v !== undefined);
      const nom = `${relatif} → ${source ?? '(sans src)'}`;
      const alternative = alternativeDe(balise);

      // ── R1 ──────────────────────────────────────────────────────────────────────────
      if (!alternative.presente) {
        manquements.push(
          `${nom} : attribut alt absent. Une image sans alternative est annoncee par son ` +
            'URL au lecteur d ecran ; le vide se DECLARE (alt=""), il ne s obtient pas ' +
            'par omission.',
        );
      } else if (estBlanche(alternative.valeur)) {
        manquements.push(
          `${nom} : alternative « ${alternative.valeur} » ni vide ni parlante — faite de ` +
            'blancs. axe-core exige une alternative non nulle, il en trouve une, et elle ' +
            'ne dit rien : presente et inutile.',
        );
      }

      // ── Collecte pour R2 ────────────────────────────────────────────────────────────
      const servi = source === undefined ? null : nomServi(source);
      if (servi === null) continue;
      const candidats = rapprocher(manifeste.declarations, servi);
      if (candidats.length === 0) continue;
      if (candidats.length > 1) {
        manquements.push(
          `${nom} : deux entrees du manifeste se rapprochent de ce fichier — ` +
            `${candidats.map((c) => `« ${c.cle} »`).join(' et ')}. Le rapprochement dans la ` +
            'mediatheque se fait sur le nom de fichier : il doit etre unique.',
        );
        continue;
      }

      const declaration = candidats[0];
      const suivi = parMedia.get(declaration.cle) ?? {
        declaration,
        positions: 0,
        parlantes: [],
        premiere: nom,
      };
      suivi.positions += 1;
      if (alternative.presente && alternative.valeur !== '' && !estBlanche(alternative.valeur)) {
        suivi.parlantes.push(nom);
      }
      parMedia.set(declaration.cle, suivi);
    }
  }

  // ── R2, sur le cumul ──────────────────────────────────────────────────────────────
  for (const [cle, suivi] of parMedia) {
    if (suivi.declaration.decoratif) {
      if (suivi.parlantes.length > 0) {
        manquements.push(
          `${suivi.parlantes[0]} : « ${cle} » est declare decoratif au manifeste ` +
            '(`"decoratif": true`, alternative vide) et le site lui en sert pourtant une. ' +
            `${suivi.parlantes.length} position(s) concernee(s). Le vide se declare a un ` +
            'seul endroit : ou la declaration est fausse, ou le rendu la contredit.',
        );
      }
      continue;
    }
    if (suivi.parlantes.length === 0) {
      manquements.push(
        `${suivi.premiere} : « ${cle} » porte une alternative au manifeste et elle n est ` +
          `JAMAIS servie — ${suivi.positions} position(s), toutes a alt vide. Le vide ` +
          'contextuel est legitime (une carte dont le titre porte le lien) ; le vide ' +
          'TOTAL veut dire que l alternative declaree n atteint aucun lecteur.',
      );
    }
  }

  return {
    manquements,
    issue: manquements.length > 0 ? ISSUES.ANOMALIE : ISSUES.CONFORME,
    images,
    pages: pages.length,
    mediasJuges: parMedia.size,
  };
}

/**
 * Le compte rendu au vert, en une ligne.
 *
 * IL NOMME LE ZERO. Un `dist/` dont aucun media n est rattache au manifeste — le build sur
 * fixtures de l integration continue — n a exerce que R1 : le taire ferait rendre la meme
 * coche a une coherence verifiee et a une coherence jamais exercee.
 */
export function resumeAlternatives(rapport) {
  const socle =
    `${rapport.images} image(s) sur ${rapport.pages} page(s) : ` +
    'alternative presente sur chacune, aucune faite de blancs';
  if (rapport.mediasJuges === 0) {
    return `${socle} — aucun media du manifeste n est servi par cette sortie, la coherence « vide si et seulement si decoratif » n a rien eu a juger ici.`;
  }
  return (
    `${socle} ; ${rapport.mediasJuges} media(s) du manifeste servis, ` +
    'vide si et seulement si declare decoratif.'
  );
}

/* Execution directe : `node scripts/verifier-alternatives.mjs [dist] [--manifeste=<chemin>]`.
   LE MANIFESTE SE PASSE NOMME, jamais par position : `tests/verificateurs-incapacite.test.ts`
   lance tous les verificateurs sous la forme `script <dist> <origine>`, et une origine lue
   comme un chemin de manifeste ferait rendre 2 la ou le tableau attend 0 et 1. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arguments_ = process.argv.slice(2);
  const nomme = arguments_.find((a) => a.startsWith('--manifeste='));
  const positionnel = arguments_.find((a) => !a.startsWith('--'));
  const rapport = inspecterAlternatives(
    positionnel ?? path.join(RACINE, 'dist'),
    nomme === undefined ? MANIFESTE_PAR_DEFAUT : nomme.slice('--manifeste='.length),
  );
  if (rapport.issue === ISSUES.VERIFICATION_IMPOSSIBLE) {
    console.error('\n⛔ VERIFICATION IMPOSSIBLE — aucune alternative n a ete jugee :');
    for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
    process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
  }
  if (rapport.manquements.length > 0) {
    console.error(`\n✖ ${rapport.manquements.length} manquement(s) :`);
    for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
    process.exit(ISSUES.ANOMALIE);
  }
  console.log(`✔ ${resumeAlternatives(rapport)}`);
}
