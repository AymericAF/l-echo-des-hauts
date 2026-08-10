/**
 * Confronte les SORTIES SEO a la sortie du build — au point de lecture, pas au code.
 *
 * `verifier-liens.mjs` lit les `<a>` et les `<link>` des pages HTML. Il ne voit donc
 * rien de ce que ce lot produit : un `<loc>` de sitemap, un `<link>` de flux RSS et un
 * `og:image` sont invisibles pour lui. C est exactement la zone ou le defaut ne se
 * decouvre jamais en test : une URL de sitemap absente du site ne casse aucune page, ne
 * fait rougir aucun build, et se manifeste des mois plus tard en Search Console.
 *
 * SEPT CONTROLES, chacun ferme une classe de defaut que rien d autre ne voit :
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
 * `npm run verifier:seo` pour inspecter un `dist/` deja construit. Ce qui rend ces
 * clauses opposables en machine, c est `integrations/garde-seo.mjs`, qui appelle
 * `inspecterSeo` DEPUIS le build et le fait sortir en code non nul.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import sharp from 'sharp';

import { TAILLES_TITRE } from '../src/lib/seo/gabarit-og.ts';
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
  const vide = { manquements: [], issue: ISSUES.CONFORME, pagesIndexables: 0, urlsSitemap: 0, liensFlux: 0, imagesOg: 0, segments: 0 };

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

  return {
    manquements,
    issue: manquements.length > 0 ? ISSUES.ANOMALIE : ISSUES.CONFORME,
    pagesIndexables,
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
