/**
 * Confronte la sortie a une regle simple : AUCUNE regle de style n arrive dans le HTML.
 *
 * LE DEFAUT QUE CE FICHIER FERME. Le 2026-08-09, apres le correctif des images (T-01), la
 * campagne de rendu a montre que la capture `normal` (CSP servie) et la capture `rendues`
 * (CSP contournee) DIFFERAIENT ENCORE sur 2 des 4 pages recettees, de facon reproductible
 * sur deux passes : la page etait 80 px plus haute avec la CSP active. La sortie portait
 * un bloc `<style>` sur 65 de ses 86 pages, et un attribut `style="--encre:…"` sur les 86.
 * `style-src 'self'` les REFUSE — sans `'unsafe-inline'`, sans nonce, sans empreinte.
 *
 * ET CE N ETAIT PAS UNE DECOUVERTE NEUVE : les rapports Lighthouse du 2026-08-08 portaient
 * deja 18 occurrences de « …style-src 'self''. Either the 'unsafe-i… ». Personne ne l a
 * nomme, parce que le defaut des images saignait plus fort. C est exactement le motif de
 * cette garde : un avertissement que personne ne lit n a jamais rien tenu — celle-ci fait
 * ECHOUER le build.
 *
 * ELLE NE RECOPIE PAS LA CSP. L en-tete vit dans les labels Traefik de l application
 * Coolify (`docs/runbook-provisionnement.md`, etape 27) et n a aucun domicile dans ce
 * depot ; en recopier la valeur creerait la seconde source de verite que ce projet
 * corrige partout ailleurs. Ce qui est tenu ici est la regle qui rend la page conforme a
 * n importe quelle CSP stricte : **une regle de style est servie comme FICHIER**. Un
 * `<link rel="stylesheet">` de meme origine satisfait `'self'` quelle que soit la
 * formulation exacte de l en-tete. La garde reste donc juste si la CSP est reecrite, et ne
 * devient fausse que si le §5.5 du cahier (« CSP stricte ») est renverse — auquel cas
 * c est ce fichier qu il faut changer, en le sachant.
 *
 * DEUX CLASSES, SEPAREES DANS LE MESSAGE, parce qu elles se corrigent a deux endroits :
 *   - le bloc `<style>` vient du reglage `build.inlineStylesheets` d Astro, qui remonte
 *     les petites feuilles dans le document ; il se retire par `'never'` ;
 *   - l attribut `style=` vient d un composant qui l ECRIT, et aucun reglage ne le retire.
 * Les confondre enverrait chercher la mauvaise cause.
 *
 * PORTEE : toutes les pages HTML de la sortie, `/recherche` et `/en/` comprises.
 *
 * `npm run verifier:styles-en-ligne` pour inspecter un `dist/` deja construit. Ce qui rend
 * la clause opposable en machine, c est `integrations/garde-styles-en-ligne.mjs`, qui
 * appelle cette fonction DEPUIS le build et le fait sortir en code non nul.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** La directive citee dans un refus : c est elle qui bloque, dans le navigateur. */
const DIRECTIVE = "style-src 'self'";

/** Longueur d extrait citee dans un manquement : assez pour reconnaitre, pas pour noyer. */
const EXTRAIT = 140;

function fichiersDe(dossier) {
  const trouves = [];
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const complet = path.join(dossier, entree.name);
    if (entree.isDirectory()) trouves.push(...fichiersDe(complet));
    else trouves.push(complet);
  }
  return trouves;
}

function extrait(texte) {
  const compact = texte.replace(/\s+/g, ' ').trim();
  return compact.length > EXTRAIT ? `${compact.slice(0, EXTRAIT)}…` : compact;
}

/** Les elements a contenu BRUT : ce qu ils portent n est pas du balisage. */
const BRUTS = new Set(['script', 'textarea', 'title']);

/**
 * Parcourt le HTML BALISE PAR BALISE, plutot que de le grepper.
 *
 * La difference n est pas cosmetique : `&lt;p style="…"&gt;` dans un article est du TEXTE,
 * le navigateur n en fait rien et la CSP non plus — un `grep 'style='` rougirait dessus.
 * Symetriquement, une valeur d attribut peut contenir `>` (`style="a>b"`), ce qui coupe en
 * deux toute regex naive de balise. Le decoupage ci-dessous respecte les guillemets.
 *
 * @returns {{blocs: {index: number, contenu: string}[], attributs: {balise: string, valeur: string}[]}}
 */
export function stylesEnLigneDe(html) {
  const blocs = [];
  const attributs = [];
  let i = 0;

  while (i < html.length) {
    const ouvre = html.indexOf('<', i);
    if (ouvre === -1) break;

    if (html.startsWith('<!--', ouvre)) {
      // Un style commente n est pas applique : le navigateur ne le voit pas, nous non plus.
      const fin = html.indexOf('-->', ouvre + 4);
      i = fin === -1 ? html.length : fin + 3;
      continue;
    }
    if (html[ouvre + 1] === '!' || html[ouvre + 1] === '?' || html[ouvre + 1] === '/') {
      const fin = html.indexOf('>', ouvre + 1);
      i = fin === -1 ? html.length : fin + 1;
      continue;
    }

    const nom = /^<([a-zA-Z][a-zA-Z0-9:-]*)/.exec(html.slice(ouvre, ouvre + 64));
    if (nom === null) {
      i = ouvre + 1;
      continue;
    }

    // Fin de la balise, en sautant par-dessus les valeurs entre guillemets.
    let j = ouvre + 1 + nom[1].length;
    let quote = null;
    while (j < html.length) {
      const c = html[j];
      if (quote !== null) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        break;
      }
      j += 1;
    }
    const balise = html.slice(ouvre, Math.min(j + 1, html.length));
    const interieur = html.slice(ouvre + 1 + nom[1].length, j);
    const nomBas = nom[1].toLowerCase();

    if (nomBas === 'style') {
      const ferme = html.toLowerCase().indexOf('</style', j);
      const contenu = html.slice(j + 1, ferme === -1 ? html.length : ferme);
      blocs.push({ index: ouvre, contenu });
      i = ferme === -1 ? html.length : ferme;
      continue;
    }

    // `style=` sur n importe quelle balise. La classe `[\s/]` avant le nom evite
    // `data-style=`, `text-style=` et `styles=`, que la CSP ne regarde pas.
    const trouve = /[\s/]style\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*))/i.exec(interieur);
    if (trouve !== null) {
      attributs.push({ balise, valeur: trouve[1] ?? trouve[2] ?? trouve[3] ?? '' });
    }

    if (BRUTS.has(nomBas)) {
      const ferme = html.toLowerCase().indexOf(`</${nomBas}`, j);
      i = ferme === -1 ? html.length : ferme;
      continue;
    }

    i = j + 1;
  }

  return { blocs, attributs };
}

/** Le manquement d un bloc `<style>` — il renvoie au REGLAGE qui le produit. */
function manquementBloc(relatif, rang, contenu) {
  return (
    `${relatif} → bloc <style> nº${rang} (${contenu.length} caracteres) : « ${extrait(contenu)} ». ` +
    `La CSP servie (« ${DIRECTIVE} ») REFUSE ce bloc dans le navigateur : la page repond 200, ` +
    'ses en-tetes sont conformes, et AUCUNE de ses regles ne s applique. ' +
    "Cause : Astro remonte les petites feuilles dans le document (`build.inlineStylesheets`, " +
    "defaut `'auto'`). `'never'` les sort en fichiers, que `'self'` autorise. " +
    'NE PAS elargir style-src pour faire taire ce message.'
  );
}

/** Le manquement d un attribut `style=` — aucun reglage ne le retire, c est du CODE. */
function manquementAttribut(relatif, balise, valeur) {
  return (
    `${relatif} → attribut style= sur ${extrait(balise)} (valeur « ${extrait(valeur)} »). ` +
    `La CSP servie (« ${DIRECTIVE} ») REFUSE cet attribut dans le navigateur. ` +
    "AUCUN reglage de build ne le retire : c est un composant qui l ecrit, et la correction " +
    'va dans ce composant — la declaration se deplace dans une classe, donc dans la feuille. ' +
    'NE PAS elargir style-src pour faire taire ce message.'
  );
}

/**
 * @param {string} dist Chemin du repertoire de sortie.
 * @returns {{manquements: string[], pages: number, blocs: number, attributs: number}}
 */
export function inspecterStylesEnLigne(dist) {
  if (!fs.existsSync(dist)) {
    return { manquements: [`sortie absente : ${dist}`], pages: 0, blocs: 0, attributs: 0 };
  }

  const tous = fichiersDe(dist).map((f) => path.relative(dist, f).split(path.sep).join('/'));
  const manquements = [];
  let pages = 0;
  let blocs = 0;
  let attributs = 0;

  for (const relatif of tous) {
    if (!relatif.endsWith('.html')) continue;
    pages += 1;
    const html = fs.readFileSync(path.join(dist, relatif), 'utf8');
    const trouves = stylesEnLigneDe(html);

    trouves.blocs.forEach((bloc, rang) => {
      blocs += 1;
      manquements.push(manquementBloc(relatif, rang + 1, bloc.contenu));
    });
    for (const { balise, valeur } of trouves.attributs) {
      attributs += 1;
      manquements.push(manquementAttribut(relatif, balise, valeur));
    }
  }

  // Zero page inspectee n est pas une preuve, c est une garde branchee sur le vide — le
  // mode d echec le plus discret d un controle : il rend vert sans avoir rien regarde.
  if (pages === 0) {
    manquements.push(
      `aucune page HTML dans ${dist} : la garde n a rien inspecte. ` +
        'Un vert sur zero page ne prouve rien — verifier le chemin de la sortie.',
    );
  }

  return { manquements, pages, blocs, attributs };
}

/** Le compte rendu au vert, en une ligne. */
export function resumeStylesEnLigne(rapport) {
  return (
    `${rapport.pages} page(s) HTML : aucun bloc <style>, aucun attribut style= — ` +
    "toutes les regles de style sont servies en fichiers, ce que « style-src 'self' » autorise."
  );
}

// --- Usage en ligne de commande -------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dist = process.argv[2] ?? path.join(racine, 'dist');
  const rapport = inspecterStylesEnLigne(dist);
  if (rapport.manquements.length > 0) {
    console.error(`\n✖ ${rapport.manquements.length} manquement(s) :`);
    for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
    process.exit(1);
  }
  console.log(`✔ ${resumeStylesEnLigne(rapport)}`);
}
