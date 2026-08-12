/**
 * Inspecte la SORTIE du build, pas le code source.
 *
 * Deux contraintes dures du projet ne se lisent pas dans un fichier :
 *   - « 0 ko de JavaScript servi hors /recherche » (§1, §5.4, recette §9). Un composant
 *     hydrate par megarde, une integration qui injecte un script, un `<script>` recopie
 *     d un exemple : rien de tout cela ne fait echouer un build Astro tout seul. Ca se
 *     voit dans `dist/`, et seulement si on regarde.
 *   - `output: 'static'` integral (§4.1). Une seule route en `prerender = false` fait
 *     basculer la sortie entiere en mode serveur — la violation ne se voit pas dans le
 *     fichier fautif (T-09).
 *
 * Ce fichier ne fait que CONSTATER. Ce qui rend la contrainte opposable en machine, c est
 * `integrations/garde-t09.mjs`, qui appelle `inspecterSortie` depuis le build lui-meme et
 * le fait sortir en code non nul. Lancer ce script a la main reste utile pour inspecter un
 * `dist/` deja construit : `npm run verifier:sortie`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ISSUES, manquementCorpusVide } from './issues.mjs';

/**
 * L exception `/recherche`, bornee au plus juste.
 *
 * §0 des arbitrages techniques : « /recherche est UNE page, et c est la seule exemptee ».
 * L exception porte donc sur des chemins EXACTS, jamais sur un sous-arbre :
 *   - `recherche/` en prefixe libre exempterait `/recherche/avancee/`, et n importe quelle
 *     page future rangee sous ce segment ;
 *   - exempter `_astro/` parce que la recherche s en sert ouvrirait le JavaScript a TOUT
 *     le site : ce repertoire porte les bundles partages, il est servi a toutes les pages.
 *     C est le vecteur de fuite le plus probable, et il reste ferme.
 * ~~Le JavaScript legal est celui de Pagefind (§5.4), qui vit dans son propre repertoire.~~
 * **2026-08-12 (tache cf33a689) : « qui vit dans son propre repertoire » ne suffisait pas.**
 * Le JavaScript legal est celui que ces pages-ci CHARGENT — cf. `atteignablesPagefind`.
 */
const PAGES_EXEMPTEES = new Set(['recherche/index.html', 'en/recherche/index.html']);

/**
 * LE REPERTOIRE DE PAGEFIND — a plat, jamais un sous-arbre. Le `(en/)?` est defensif : le
 * build n en depose qu un seul, `pagefind/`, mais la borne doit tenir si cela change.
 */
const REPERTOIRE_PAGEFIND = /^(en\/)?pagefind\/[^/]+$/;
const EST_SCRIPT = /\.(js|mjs|cjs)$/;
const EST_FEUILLE = /\.css$/;

/**
 * L EXEMPTION DE /recherche N EST PLUS UN MOTIF DE CHEMIN : c est l ATTEIGNABILITE.
 *
 * CE QUI ETAIT ECRIT ICI JUSQU AU 2026-08-12, et ce que ca laissait passer :
 *
 *     const JS_EXEMPTE = /^(en\/)?pagefind\/[^/]+\.(js|mjs|cjs)$/;
 *
 * Tout `.js` pose a plat sous `pagefind/` passait — quel qu il soit, et quel que soit leur
 * nombre. Mesure sur la sortie reellement indexee (24 pages) : Pagefind y deposait NEUF
 * fichiers `.js`/`.css`, la page n en chargeait que DEUX (`pagefind.js`, nomme par son
 * `data-bundle`, et `pagefind-worker.js` que le premier demarre). Les sept autres —
 * 419 831 octets, 410,0 Kio — etaient servis publiquement et charges par rien, sur un site
 * dont la contrainte dure du §1 est « zero JavaScript servi hors /recherche ». Le pire
 * n etait pas le poids : `pagefind-highlight.js` est le seul a fabriquer une feuille de
 * style a l execution, soit exactement l injection dont l absence fonde la decision
 * « `style-src` : rien a ouvrir ». Il suffisait d une ligne pour le charger.
 *
 * POURQUOI PAS UNE LISTE DE NOMS ATTENDUS. Elle fermerait le cas et perimerait au premier
 * renommage — Pagefind versionne ses bundles — apres quoi la garde se corrige en ajoutant
 * un nom, c est-a-dire jamais. Le critere reste donc un MOTIF, mais un motif qui porte sur
 * la bonne chose : un script servi sous `pagefind/` est legal s il est ATTEINT depuis une
 * page exemptee, directement (son adresse est ecrite dans le HTML) ou par la chaine des
 * references entre bundles. Renommer un bundle charge ne casse rien, la reference suit ;
 * deposer un bundle que rien ne charge est refuse, quel que soit son nom.
 *
 * CE QUE CETTE LECTURE NE VOIT PAS, et il faut l ecrire : une reference construite a
 * l execution par une URL CALCULEE. C est le cas des donnees de l index
 * (`pagefind-entry.json`, `wasm.*.pagefind`, `*.pf_meta`, `index/`, `fragment/`) — mais
 * aucune n est un script ni une feuille, donc aucune n est jugee ici ni retiree ailleurs.
 * Pour les bundles eux-memes, Pagefind ecrit ses adresses en clair (mesure : `pagefind.js`
 * porte le litteral `pagefind-worker.js`), et une version qui cesserait de le faire ferait
 * ROUGIR la garde plutot que passer — le sens sur lequel une garde a le droit de se tromper.
 */
function estSousPagefind(relatif) {
  return REPERTOIRE_PAGEFIND.test(relatif);
}

/**
 * Les fichiers de `pagefind/` ATTEINTS depuis les pages exemptees, cloture comprise.
 *
 * @param {{absolu: string, relatif: string}[]} tous
 * @returns {Set<string>} chemins relatifs atteignables
 */
function atteignablesPagefind(tous) {
  const sousPagefind = tous.filter((f) => estSousPagefind(f.relatif));
  if (sousPagefind.length === 0) return new Set();

  const atteints = new Set();
  const aExplorer = [];

  /* Une adresse est reconnue par son SUFFIXE de chemin : `/pagefind/pagefind.js`,
     `pagefind/pagefind.js`, `./pagefind.js` depuis un bundle voisin, ou le simple nom de
     fichier dans un gabarit (`${basePath}pagefind-worker.js`). On compare donc le texte au
     nom de fichier ET au chemin relatif — jamais l inverse, qui ferait d une sous-chaine
     commune une reference. */
  const cite = (texte, fichier) => {
    const nom = fichier.relatif.slice(fichier.relatif.lastIndexOf('/') + 1);
    return texte.includes(fichier.relatif) || texte.includes(nom);
  };

  const marquer = (fichier) => {
    if (atteints.has(fichier.relatif)) return;
    atteints.add(fichier.relatif);
    if (EST_SCRIPT.test(fichier.relatif)) aExplorer.push(fichier);
  };

  /* 1. LES ENTREES, ET SEULEMENT DEPUIS LES PAGES EXEMPTEES. Une page ORDINAIRE qui
        nommerait un bundle ne le legalise pas : ce serait la fuite exacte — Pagefind sait
        injecter son interface dans les pages qu il indexe, et la contrainte tomberait sur
        tout le site sans qu un seul fichier bouge. */
  for (const page of tous) {
    if (!PAGES_EXEMPTEES.has(page.relatif)) continue;
    const html = fs.readFileSync(page.absolu, 'utf8');
    for (const fichier of sousPagefind) if (cite(html, fichier)) marquer(fichier);
  }

  // 2. LA CLOTURE : ce qu un bundle atteint charge a son tour.
  while (aExplorer.length > 0) {
    const courant = aExplorer.pop();
    const source = fs.readFileSync(courant.absolu, 'utf8');
    for (const fichier of sousPagefind) {
      if (fichier.relatif === courant.relatif) continue;
      if (cite(source, fichier)) marquer(fichier);
    }
  }

  return atteints;
}

/**
 * CE QUI FABRIQUE UNE FEUILLE DE STYLE A L EXECUTION — les trois facons, pas seulement la
 * premiere.
 *
 * Ce controle ne porte que sur les bundles ATTEINTS : un bundle mort est deja refuse pour
 * une autre raison, et l accuser deux fois ferait croire la seconde garde exercee.
 */
const INJECTE_DU_STYLE = /createElement\(\s*['"`]style['"`]\s*\)|insertRule\s*\(|adoptedStyleSheets/;

/** Marqueurs d une sortie serveur a la racine de `dist/` (§4.1 : aucune route serveur). */
const MARQUEURS_SERVEUR = ['_worker.js', 'server', 'functions', '_routes.json'];

/**
 * LA SEULE VALEUR DE `type` QUI OUVRE LA GARDE — l exception du 2026-08-10.
 *
 * §5.1 du cahier exige des donnees structurees sur les pages indexables, et il n existe
 * qu une facon de les servir : un `<script type="application/ld+json">`. La garde devait
 * donc s ouvrir. Elle s ouvre sur une valeur EXACTE, jamais sur un prefixe : ni
 * `application/json`, ni `application/ld+json; charset=utf-8`, ni rien qui la contienne.
 * Un `startsWith` ou une expression reguliere laxiste ici rouvrirait le site entier.
 *
 * Ce que le type NE PROUVE PAS, et pourquoi il ne suffit jamais seul : il dit ce que
 * l auteur PRETEND servir, pas ce que le navigateur executera. `type="application/ld+json"`
 * pose au-dessus de `alert(1)` est un tunnel a JavaScript deguise, ouvert par la garde
 * elle-meme. Le contenu est donc PARSE (`estGrapheJson` ci-dessous) : les deux conditions
 * ensemble, jamais l une sans l autre.
 */
const TYPE_LD_JSON = 'application/ld+json';

/**
 * La valeur de l attribut `type` d une balise ouvrante, ou `null` s il n y en a pas.
 *
 * `\s` en tete est ce qui empeche `data-type="application/ld+json"` de se faire passer
 * pour un `type` : le caractere qui precede y est un tiret, pas une espace. Les trois
 * formes de valeur du HTML sont acceptees (guillemets, apostrophes, valeur nue), parce
 * que refuser une forme legale reviendrait a juger le style plutot que le contenu.
 */
export function typeDeScript(attributs) {
  const trouve = attributs.match(/\stype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/i);
  if (trouve === null) return null;
  return trouve[1] ?? trouve[2] ?? trouve[3] ?? '';
}

/**
 * Le type designe-t-il EXACTEMENT du JSON-LD ?
 *
 * « Comparaison exacte, insensible a la casse, espaces normalises » : `\n` et les
 * espaces de bord ne changent pas une valeur d attribut, un espace INTERIEUR si
 * (`application/ld + json` n est pas un type MIME). D ou le `trim` + collapse, puis
 * l egalite stricte.
 */
export function estTypeLdJson(valeur) {
  if (valeur === null) return false;
  return valeur.trim().replace(/\s+/g, ' ').toLowerCase() === TYPE_LD_JSON;
}

/**
 * Le contenu d un bloc ld+json est-il un GRAPHE ?
 *
 * Deux exigences, et la seconde n est pas de la coquetterie. `42` et `"alert(1)"` sont
 * du JSON parfaitement valide : ils sont inertes, donc sans danger — mais les accepter
 * reviendrait a dire que la garde ne sait pas ce qu elle laisse passer. Un graphe
 * JSON-LD est un objet ou un tableau, toujours.
 */
export function estGrapheJson(contenu) {
  try {
    const valeur = JSON.parse(contenu);
    return typeof valeur === 'object' && valeur !== null;
  } catch {
    return false;
  }
}

/**
 * Les manquements de TOUS les blocs `<script>` d une page.
 *
 * Lu bloc par bloc plutot que par une expression reguliere globale, pour une raison
 * precise : une lecture gloutonne du premier `<script …>` jusqu au DERNIER `</script>`
 * de la page avalerait tout ce qui se trouve entre les deux. Un script executable pose
 * apres un premier JSON-LD legitime disparaitrait alors de la garde — et c est le
 * placement le plus naturel pour quelqu un qui ajoute un traceur.
 *
 * @param {string} html
 * @param {string} fichier Chemin relatif, pour nommer la page dans le message.
 */
export function manquementsScripts(html, fichier) {
  const manquements = [];
  const ouvrantes = /<script\b([^>]*)>/gi;
  const minuscules = html.toLowerCase();

  let ouvrante;
  while ((ouvrante = ouvrantes.exec(html)) !== null) {
    const attributs = ouvrante[1];
    const type = typeDeScript(attributs);
    const etiquette = type === null ? '<script>' : `<script type="${type.trim()}">`;

    if (!estTypeLdJson(type)) {
      manquements.push(
        `balise ${etiquette} dans ${fichier}` +
          (type === null ? '' : ' — seul « application/ld+json » est admis (§5.1)'),
      );
      continue;
    }

    const debut = ouvrantes.lastIndex;
    const fin = minuscules.indexOf('</script', debut);
    if (fin === -1) {
      manquements.push(
        `balise ${etiquette} non fermee dans ${fichier} : sans balise fermante, son contenu ` +
          'n a pas ete juge — et un bloc que la garde ne lit pas est un bloc qui passe',
      );
      continue;
    }

    const contenu = html.slice(debut, fin);
    if (!estGrapheJson(contenu)) {
      manquements.push(
        `balise ${etiquette} dans ${fichier} dont le contenu N EST PAS un graphe JSON : ` +
          `« ${contenu.trim().slice(0, 60)} ». Le type dit ce que l auteur pretend servir, ` +
          'pas ce que le navigateur executera — l exception typee ne doit pas devenir un ' +
          'tunnel a JavaScript deguise.',
      );
    }

    /* On reprend la lecture APRES la fermeture : ce qui est a l interieur d un bloc
       ld+json valide n est pas du HTML, et ce qui suit doit rester inspecte. */
    ouvrantes.lastIndex = fin;
  }

  return manquements;
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
 * Les balises ouvrantes du HTML, sans leur contenu textuel.
 *
 * Chercher ` on...=` dans le document entier remonterait « one = 1 » ecrit dans un article.
 * Un faux positif sur une garde dure finit toujours de la meme facon : on la desactive.
 */
function balisesOuvrantes(html) {
  return html.match(/<[a-z][^>]*>/gi) ?? [];
}

/**
 * @param {string} dist Chemin du repertoire de sortie.
 * @returns {{manquements: string[], issue: number, pages: number, fichiers: number, octets: number}}
 */
/**
 * LES BUNDLES ET FEUILLES DE `pagefind/` QUE RIEN NE CHARGE, chemins relatifs tries.
 *
 * EXPORTE, et c est le point : `scripts/index-pagefind.mjs` s en sert pour les RETIRER de
 * la sortie apres indexation. Le critere de ce qui doit disparaitre et le critere de ce que
 * la garde refuse sont ainsi le MEME — deux copies d une meme regle divergent au premier
 * changement, et l on servirait a nouveau ce qu on croit avoir retire.
 *
 * Les `.css` y figurent alors que la garde T-09 ne les juge pas : 63 Kio de feuilles mortes
 * ne violent aucune contrainte, mais elles appartiennent au meme depot mort, et les laisser
 * ferait croire le nettoyage fait.
 *
 * @param {string} dist
 * @returns {string[]}
 */
export function bundlesPagefindNonCharges(dist) {
  if (!fs.existsSync(dist)) return [];
  const tous = fichiersDe(dist).map((f) => ({
    absolu: f,
    relatif: path.relative(dist, f).split(path.sep).join('/'),
  }));
  const atteints = atteignablesPagefind(tous);
  return tous
    .filter((f) => estSousPagefind(f.relatif))
    .filter((f) => EST_SCRIPT.test(f.relatif) || EST_FEUILLE.test(f.relatif))
    .filter((f) => !atteints.has(f.relatif))
    .map((f) => f.relatif)
    .sort();
}

export function inspecterSortie(dist) {
  if (!fs.existsSync(dist)) {
    /* UNE INCAPACITE N EST PAS UNE ANOMALIE. Jusqu au 2026-08-10 ce retour sortait en `1`,
       le code d un manquement du site : « la sortie de construction est absente » et « la
       sortie est presente et fautive » devenaient indiscernables pour un lecteur
       automatique, alors qu elles envoient a des gestes opposes — comprendre pourquoi rien
       n a ete construit, ou corriger le site. La convention vient de `./issues.mjs` et n est
       PAS recopiee ici : deux definitions d un code de sortie finissent par diverger. */
    return {
      manquements: [`sortie absente : ${dist}`],
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      pages: 0,
      fichiers: 0,
      octets: 0,
    };
  }

  const tous = fichiersDe(dist).map((f) => ({
    absolu: f,
    relatif: path.relative(dist, f).split(path.sep).join('/'),
  }));
  const pagesHtml = tous.filter((f) => f.relatif.endsWith('.html'));

  const manquements = [];

  /* 1. Aucun fichier JavaScript servi, hors ce que la page /recherche CHARGE reellement.
        L exemption porte sur l atteignabilite, jamais sur le repertoire : cf. le long
        commentaire d `atteignablesPagefind`. */
  const atteints = atteignablesPagefind(tous);
  for (const fichier of tous) {
    if (!EST_SCRIPT.test(fichier.relatif)) continue;
    if (atteints.has(fichier.relatif)) continue;
    if (estSousPagefind(fichier.relatif)) {
      manquements.push(
        `bundle Pagefind servi et charge par AUCUNE page : ${fichier.relatif} — ` +
          "l exemption de /recherche porte sur ce que la page charge, pas sur le repertoire. " +
          'Le retirer apres indexation (`scripts/index-pagefind.mjs`), ou le charger.',
      );
      continue;
    }
    manquements.push(`fichier JavaScript servi : ${fichier.relatif}`);
  }

  /* 1 bis. UN BUNDLE CHARGE QUI FABRIQUE DU STYLE ROUVRE UNE DECISION FERMEE. La mesure
     `eba89df5` a prouve qu aucune feuille n est injectee sur /recherche, et c est ce qui
     fonde « `style-src` : rien a ouvrir ». Le jour ou un bundle charge se met a en poser
     une, la page repond 200 et rend autre chose : la garde le dit ici plutot que de laisser
     la decision se perimer en silence. */
  for (const relatif of [...atteints].sort()) {
    if (!EST_SCRIPT.test(relatif)) continue;
    const fichier = tous.find((f) => f.relatif === relatif);
    if (!INJECTE_DU_STYLE.test(fs.readFileSync(fichier.absolu, 'utf8'))) continue;
    manquements.push(
      `bundle Pagefind CHARGE qui fabrique une feuille de style a l execution : ${relatif} — ` +
        "la decision « style-src : rien a ouvrir » (docs/csp-style-src-recherche.md) reposait " +
        'sur son absence. Elle se rouvre : mesurer, puis trancher — ne pas taire ce constat.',
    );
  }

  /* 2. Aucune balise <script> EXECUTABLE ni attribut d evenement inline, hors la page
        /recherche. Depuis le 2026-08-10 la garde admet le seul `<script
        type="application/ld+json">` au contenu PARSABLE (§5.1) — l ouverture et sa borne
        vivent dans `manquementsScripts`, avec la raison pour laquelle le type ne suffit
        jamais seul. */
  for (const fichier of tous) {
    if (!fichier.relatif.endsWith('.html')) continue;
    if (PAGES_EXEMPTEES.has(fichier.relatif)) continue;
    const html = fs.readFileSync(fichier.absolu, 'utf8');
    manquements.push(...manquementsScripts(html, fichier.relatif));
    const baliseFautive = balisesOuvrantes(html).find((b) => /\son[a-z]+\s*=/i.test(b));
    if (baliseFautive) {
      manquements.push(
        `attribut d evenement inline dans ${fichier.relatif} : ${baliseFautive.slice(0, 80)}`,
      );
    }
  }

  // 3. Aucune trace de sortie serveur.
  for (const marqueur of MARQUEURS_SERVEUR) {
    if (fs.existsSync(path.join(dist, marqueur))) {
      manquements.push(`sortie serveur detectee : ${marqueur} (§4.1 : aucune route serveur)`);
    }
  }

  /* SECONDE INCAPACITE, ET ELLE EST PIRE QUE L ABSENCE : `dist/` existe et ne porte pas
     une seule page. Jusqu au 2026-08-10 ce cas rendait
     « ✔ 0 page(s) HTML, 0 fichier(s), 0.0 Kio : aucun JavaScript servi » et le code `0` —
     une absence TOTALE de contenu produisant le signal du succes, que l integration
     continue n aplatit PAS (elle n aplatit que le non-nul).

     POURQUOI CE CONTROLE EST ICI, ET NON EN TETE COMME CHEZ LES CINQ AUTRES. Ce fichier est
     le seul des six dont une partie du jugement ne vient PAS des pages : « aucun fichier
     JavaScript servi » et « aucun marqueur de sortie serveur » se lisent sur l arborescence,
     et restent vrais sans une seule page. Un `dist/` qui porte `_worker.js` et zero page a
     donc bel et bien ete juge, et il a trouve : rendre `2` la-dessus DETRUIRAIT une
     trouvaille reelle — « voici le defaut, nomme » deviendrait « je n ai pas su regarder »,
     le miroir exact du defaut qu on ferme ici. L incapacite ne se declare donc que si rien
     n a ete inspecte ET rien n a ete trouve. La regle exacte du correctif est : NE JAMAIS
     RENDRE `0` SUR UN CORPUS VIDE — le code de l anomalie, lui, ne bouge pas.

     Declencheur : « zero PAGE inspectee », jamais « zero trouvaille ». L argument du `2`
     plutot que du `1` vit dans `./issues.mjs`, avec le message ; ni l un ni l autre n est
     recopie ici. */
  if (manquements.length === 0 && pagesHtml.length === 0) {
    return {
      manquements: [manquementCorpusVide(dist, tous.length)],
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      pages: 0,
      fichiers: tous.length,
      octets: 0,
    };
  }

  return {
    manquements,
    issue: manquements.length > 0 ? ISSUES.ANOMALIE : ISSUES.CONFORME,
    pages: pagesHtml.length,
    fichiers: tous.length,
    octets: tous.reduce((total, f) => total + fs.statSync(f.absolu).size, 0),
  };
}

/** Le compte rendu au vert, en une ligne. */
export function resume(rapport) {
  return (
    `${rapport.pages} page(s) HTML, ${rapport.fichiers} fichier(s), ` +
    `${(rapport.octets / 1024).toFixed(1)} Kio : aucun JavaScript servi, aucune sortie serveur.`
  );
}

/* Execution directe : `node scripts/verifier-sortie.mjs [dist]`. L argument est accepte
   comme sur les cinq autres — sans lui, le seul moyen d exercer ce script sur autre chose
   que `apps/web/dist` etait de DEPLACER la sortie du depot, ce qui rend la preuve
   difficilement rejouable. `npm run verifier:sortie` n en passe aucun : le defaut est
   inchange. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const rapport = inspecterSortie(process.argv[2] ?? path.join(racine, 'dist'));
  if (rapport.issue === ISSUES.VERIFICATION_IMPOSSIBLE) {
    console.error('\n⛔ VERIFICATION IMPOSSIBLE — aucune sortie n a ete jugee :');
    for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
    process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
  }
  if (rapport.manquements.length > 0) {
    console.error(`\n✖ ${rapport.manquements.length} manquement(s) :`);
    for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
    process.exit(ISSUES.ANOMALIE);
  }
  console.log(`✔ ${resume(rapport)}`);
}
