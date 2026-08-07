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
 *   7. **Chaque image OG generee porte de l ENCRE dans sa bande de titre.** C est le
 *      controle le plus important du fichier. `sharp` embarque fontconfig mais aucune
 *      fonte : sur une image de construction sans police installee, la rasterisation
 *      REUSSIT et rend un PNG au fond correct et au texte invisible. Succes et echec
 *      produisent alors la meme sortie — un fichier PNG de bonne taille, aux bonnes
 *      dimensions. Seule la mesure de l ecart-type des pixels de la bande de titre les
 *      distingue.
 *
 * `npm run verifier:seo` pour inspecter un `dist/` deja construit. Ce qui rend ces
 * clauses opposables en machine, c est `integrations/garde-seo.mjs`, qui appelle
 * `inspecterSeo` DEPUIS le build et le fait sortir en code non nul.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import sharp from 'sharp';

import { normaliser, routeDuFichier } from './verifier-liens.mjs';

/** Les balises `<meta>` de partage qu on exige sur TOUTE page HTML. */
const PARTAGE_OBLIGATOIRE = ['og:title', 'og:url', 'og:type', 'og:locale'];

/**
 * Bande verticale ou le titre est dessine, en fraction de la hauteur de l image.
 *
 * Bornee au titre, jamais a l image entiere : le filet d accent en haut et le trait du
 * pied de page suffiraient a faire passer une image sans aucun texte.
 */
const BANDE_TITRE = { haut: 0.3, bas: 0.72 };

/**
 * Ecart-type minimal, sur 255, de la bande de titre.
 *
 * Un aplat parfait rend 0. Du texte noir sur fond creme, meme sur une seule ligne,
 * depasse largement 8 — mesure a 40 et plus sur les gabarits reels du site. Le seuil est
 * volontairement bas : il vise le cas « rien du tout », pas la qualite typographique.
 */
const ENCRE_MINIMALE = 8;

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
 * L ecart-type des pixels de la bande de titre d une image, sur 255.
 *
 * L ecart-type est calcule sur les OCTETS BRUTS de la zone extraite, pas via
 * `sharp().stats()`. Ce n est pas un detail de style : `stats()` decrit l image
 * d ENTREE et ignore les operations du pipeline (`extract`, `greyscale`). Mesure le
 * 2026-08-07 sur ce meme fichier — un gabarit dont tous les textes avaient ete retires
 * rendait 32,4 au lieu de 0, parce que le filet d accent en haut de l image, hors bande,
 * etait compte quand meme. La garde passait donc au vert sur une vignette VIDE : le
 * defaut exact qu elle existe pour attraper.
 *
 * Rend `null` quand l image est illisible — un fichier corrompu est signale ailleurs, et
 * confondre « corrompu » et « sans encre » enverrait chercher la mauvaise cause.
 */
export async function encreDuTitre(fichier) {
  try {
    const { width, height } = await sharp(fichier).metadata();
    if (!width || !height) return null;
    const haut = Math.round(height * BANDE_TITRE.haut);
    const bas = Math.round(height * BANDE_TITRE.bas);
    const pixels = await sharp(fichier)
      .extract({ left: 0, top: haut, width, height: bas - haut })
      .greyscale()
      .raw()
      .toBuffer();
    if (pixels.length === 0) return null;

    let somme = 0;
    for (const octet of pixels) somme += octet;
    const moyenne = somme / pixels.length;
    let ecarts = 0;
    for (const octet of pixels) ecarts += (octet - moyenne) ** 2;
    return Math.sqrt(ecarts / pixels.length);
  } catch {
    return null;
  }
}

/**
 * @param {string} dist Chemin du repertoire de sortie.
 * @param {string} origine URL publique du site (`ECHO_SITE_URL`).
 */
export async function inspecterSeo(dist, origine) {
  const vide = { manquements: [], pagesIndexables: 0, urlsSitemap: 0, liensFlux: 0, imagesOg: 0, segments: 0 };
  if (!fs.existsSync(dist)) return { ...vide, manquements: [`sortie absente : ${dist}`] };

  const relatifs = fichiersDe(dist).map((f) => path.relative(dist, f).split(path.sep).join('/'));
  const routes = new Set();
  for (const relatif of relatifs) {
    const route = routeDuFichier(relatif);
    if (route !== null) routes.add(route);
  }
  const servis = new Set(relatifs.map((relatif) => `/${relatif}`));

  const hote = (() => {
    try {
      return new URL(origine).origin;
    } catch {
      return null;
    }
  })();

  const manquements = [];

  /** Le chemin d une URL du site, ou `null` si elle designe un autre hote. */
  const cheminInterne = (url) => {
    const absolue = (() => {
      try {
        return new URL(url, hote ?? 'https://invalide.invalid');
      } catch {
        return null;
      }
    })();
    if (absolue === null) return undefined; // illisible
    if (hote !== null && absolue.origin !== hote) return null; // externe : hors garde
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
        if (cible === null) continue; // mediatheque Strapi : hors du site, hors garde
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
    const encre = await encreDuTitre(path.join(dist, relatif));
    if (encre === null) {
      manquements.push(`${relatif} : image illisible — sharp n a pas pu la decoder`);
      continue;
    }
    if (encre < ENCRE_MINIMALE) {
      manquements.push(
        `${relatif} : bande de titre uniforme (ecart-type ${encre.toFixed(2)} < ${ENCRE_MINIMALE}) — ` +
          "l image a ete produite MAIS son texte n a pas ete dessine. Cause la plus probable : " +
          'aucune fonte installee dans l environnement de build (sharp embarque fontconfig, pas de fontes).',
      );
    }
  }

  return { manquements, pagesIndexables, urlsSitemap: urlsSitemap.size, liensFlux, imagesOg, segments };
}

export function resumeSeo(rapport) {
  return (
    `${rapport.urlsSitemap} URL au sitemap sur ${rapport.segments} segment(s), ` +
    `${rapport.pagesIndexables} page(s) indexable(s) toutes declarees, ` +
    `${rapport.liensFlux} lien(s) de flux, ${rapport.imagesOg} image(s) OG avec du texte dessine.`
  );
}

// --- Usage en ligne de commande ---------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dist = process.argv[2] ?? path.join(racine, 'dist');
  const origine = process.argv[3] ?? process.env.ECHO_SITE_URL ?? 'https://echo.ayfiweb.fr';
  const rapport = await inspecterSeo(dist, origine);
  if (rapport.manquements.length > 0) {
    console.error(`\n✖ ${rapport.manquements.length} manquement(s) :`);
    for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
    process.exit(1);
  }
  console.log(`✔ ${resumeSeo(rapport)}`);
}
