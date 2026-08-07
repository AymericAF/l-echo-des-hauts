/**
 * Inspecte les IMAGES de la SORTIE du build, pas le code source.
 *
 * Ce que le cahier demande, §5.3, mot pour mot :
 *
 *   « Traitement par Sharp au build : AVIF avec repli WebP, jeu de tailles responsive,
 *     loading="lazy" hors zone visible immediate, dimensions explicites sur toutes les
 *     balises pour supprimer le CLS. »
 *
 * Ce fichier tient les DEUX dernieres clauses — celles qui ne dependent d aucun format
 * d image et qui valent donc quelle que soit la nature des medias. La clause AVIF/WebP,
 * elle, n a rien a traiter aujourd hui : la mediatheque ne contient que du SVG, qui est
 * vectoriel (constat du 2026-08-07, cf. le commit qui introduit ce fichier).
 *
 * POURQUOI UNE GARDE, ET PAS UNE RELECTURE. Les six `<img>` du site ecrivent tous
 * `width={media.largeur ?? undefined}`. Quand la dimension manque cote Strapi, Astro
 * OMET l attribut — sans avertissement, sans erreur, sans que le composant fautif ait
 * l air fautif. La page reste valide, le build reste vert, et le CLS revient. C est
 * exactement le mode d echec que le §5.3 existe pour supprimer, et il ne se voit que
 * dans `dist/`.
 *
 * TROIS CONTROLES, chacun avec son motif :
 *
 *   1. **Dimensions explicites.** `width` et `height` presents, entiers, strictement
 *      positifs. Le navigateur en derive un `aspect-ratio` et reserve la boite AVANT
 *      d avoir recu le premier octet de l image — c est la seule chose qui empeche le
 *      texte de sauter quand elle arrive. Un `width="100%"` ne fixe aucun rapport de
 *      forme : refuse comme un width absent.
 *   2. **Intention de chargement ecrite.** `loading` present, `lazy` ou `eager`. Un
 *      attribut absent ne dit pas laquelle des deux on voulait — et le mode d echec
 *      couteux n est pas l oubli du `lazy` : c est le `lazy` pose sur l image de la zone
 *      visible immediate, qui RETARDE le LCP. Exiger la valeur oblige a trancher image
 *      par image.
 *   3. **Pas de priorite contradictoire ni diluee.** `loading="lazy"` avec
 *      `fetchpriority="high"` demande au navigateur de differer ce qu on lui dit
 *      d urgence. Et deux `fetchpriority="high"` sur une page n en priorisent aucune.
 *
 * PORTEE : toutes les pages HTML, `/recherche` comprise. L exception de T-09 porte sur
 * le JavaScript, jamais sur le CLS.
 *
 * `npm run verifier:images` pour inspecter un `dist/` deja construit. Ce qui rend la
 * clause opposable en machine, c est `integrations/garde-images.mjs`, qui appelle cette
 * fonction DEPUIS le build et le fait sortir en code non nul.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Les deux seules valeurs qui expriment une intention (HTML `loading` sur `<img>`). */
const CHARGEMENTS = new Set(['lazy', 'eager']);

function fichiersDe(dossier) {
  const trouves = [];
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const complet = path.join(dossier, entree.name);
    if (entree.isDirectory()) trouves.push(...fichiersDe(complet));
    else trouves.push(complet);
  }
  return trouves;
}

/** La valeur d un attribut dans une balise ouvrante, ou `null` s il est absent. */
function attribut(balise, nom) {
  const trouve = balise.match(new RegExp(`\\s${nom}\\s*=\\s*"([^"]*)"`, 'i'));
  return trouve === null ? null : trouve[1];
}

/**
 * Une dimension au sens du §5.3 : un entier de pixels, strictement positif.
 *
 * `''`, `auto`, `100%` et `0` sont tous refuses. Les trois premiers ne fixent aucun
 * rapport de forme ; le quatrieme en fixe un degenere, et vient toujours d une donnee
 * manquante rendue en nombre.
 */
function dimensionValide(valeur) {
  return valeur !== null && /^[0-9]+$/.test(valeur) && Number(valeur) > 0;
}

/** De quoi nommer l image dans un manquement, a 119 pages une reference vaut un nom. */
function nommer(balise) {
  return attribut(balise, 'src') ?? attribut(balise, 'srcset') ?? '(sans src)';
}

/**
 * @param {string} dist Chemin du repertoire de sortie.
 * @returns {{manquements: string[], images: number, pages: number}}
 */
export function inspecterImages(dist) {
  if (!fs.existsSync(dist)) {
    return { manquements: [`sortie absente : ${dist}`], images: 0, pages: 0 };
  }

  const pages = fichiersDe(dist)
    .map((f) => ({ absolu: f, relatif: path.relative(dist, f).split(path.sep).join('/') }))
    .filter((f) => f.relatif.endsWith('.html'));

  const manquements = [];
  let images = 0;

  for (const page of pages) {
    const html = fs.readFileSync(page.absolu, 'utf8');
    let hautePriorite = 0;

    for (const [balise] of html.matchAll(/<img\b[^>]*>/gi)) {
      images += 1;
      const nom = `${page.relatif} → ${nommer(balise)}`;

      const largeur = attribut(balise, 'width');
      const hauteur = attribut(balise, 'height');
      if (!dimensionValide(largeur) || !dimensionValide(hauteur)) {
        manquements.push(
          `${nom} : dimensions non explicites (width="${largeur ?? ''}" height="${hauteur ?? ''}") — §5.3, CLS`,
        );
      }

      const chargement = attribut(balise, 'loading');
      if (chargement === null || !CHARGEMENTS.has(chargement.toLowerCase())) {
        manquements.push(
          `${nom} : loading absent ou invalide ("${chargement ?? ''}") — attendu "lazy" ou "eager" (§5.3)`,
        );
      }

      const priorite = (attribut(balise, 'fetchpriority') ?? '').toLowerCase();
      if (priorite === 'high') {
        hautePriorite += 1;
        if (chargement !== null && chargement.toLowerCase() === 'lazy') {
          manquements.push(
            `${nom} : loading="lazy" avec fetchpriority="high" — les deux se contredisent`,
          );
        }
      }
    }

    if (hautePriorite > 1) {
      manquements.push(
        `${page.relatif} : ${hautePriorite} images en fetchpriority="high" — prioriser deux images n en priorise aucune`,
      );
    }

    /* Un `<source>` de `<picture>` sert un AUTRE fichier que l `<img>` : si son rapport
       de forme differe, la boite reservee d apres l `<img>` n est pas la sienne. Ses
       dimensions se declarent donc sur le `<source>` lui-meme. */
    for (const [balise] of html.matchAll(/<source\b[^>]*>/gi)) {
      const largeur = attribut(balise, 'width');
      const hauteur = attribut(balise, 'height');
      if (!dimensionValide(largeur) || !dimensionValide(hauteur)) {
        manquements.push(
          `${page.relatif} → source ${nommer(balise)} : dimensions non explicites — §5.3, CLS`,
        );
      }
    }
  }

  return { manquements, images, pages: pages.length };
}

/** Le compte rendu au vert, en une ligne. */
export function resumeImages(rapport) {
  return (
    `${rapport.images} image(s) sur ${rapport.pages} page(s) : ` +
    'dimensions explicites, intention de chargement ecrite sur chacune.'
  );
}

// --- Usage en ligne de commande -------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const rapport = inspecterImages(path.join(racine, 'dist'));
  if (rapport.manquements.length > 0) {
    console.error(`\n✖ ${rapport.manquements.length} manquement(s) :`);
    for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
    process.exit(1);
  }
  console.log(`✔ ${resumeImages(rapport)}`);
}
