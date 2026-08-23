/**
 * LE BAC JETABLE D'UN TEST — ouvert par son cas, refermé par le harnais.
 *
 * POURQUOI CE MODULE EXISTE. Les tests de `apps/web` et de `apps/cms` fabriquent leurs
 * arborescences d'épreuve dans le répertoire temporaire : un `dist/` bricolé, un corpus de
 * substitution, un miroir servi. Chaque appel tirait un dossier sous `mkdtemp` et n'en
 * effaçait AUCUN. Ce n'est pas une gêne de disque : le répertoire temporaire est celui de
 * l'utilisateur, partagé avec tout ce qui tourne sur le poste, et un banc qui y laisse ses
 * traces finit par juger sur celles des autres.
 *
 * C'EST LA FORME DE `.githooks/detect-secrets.recette.mjs` (commit `2dad990`), TRANSPOSÉE —
 * pas une seconde convention inventée à côté. Ce qui change tient au harnais : une recette
 * est un script linéaire, elle a un `try/finally` ; un fichier `node:test` n'en a pas, et
 * ses hooks tiennent la même place. La correspondance, terme à terme :
 *
 *     script linéaire                    fichier node:test
 *     ─────────────────────────────      ────────────────────────────────────────
 *     `finally` du corps                 `after()`   — tourne même si des cas rougissent
 *     dépôt du cas fautif conservé       `afterEach()` lit `t.passed`
 *     `process.on('exit')` en filet      `process.on('exit')`, à l'identique
 *
 * Quatre bornes, et aucune ne remplace les trois autres :
 *
 *   · LE NOM. `mkdtemp` tirait des caractères au sort sous un préfixe commun à TOUTES les
 *     exécutions. Le nom porte désormais le PID de la course, son instant de départ et le
 *     rang du bac dans la course : deux exécutions concurrentes ne peuvent plus se disputer
 *     un nom, et un reliquat se rattache au processus qui l'a laissé.
 *   · LA CRÉATION. Un `mkdtemp` qui échoue faisait remonter une exception nue ; elle NOMME
 *     maintenant le chemin qu'elle n'a pas pu créer, et dit de quel côté est le défaut —
 *     c'est le banc qui n'a pas tenu, ce n'est pas la garde qui a mal jugé.
 *   · LE NETTOYAGE, DANS `after()`. Il ne suffit pas qu'il soit écrit : il faut qu'il tourne
 *     quand un cas casse au milieu, qui est précisément le moment où personne ne le fera à
 *     la main. Un nettoyage écrit à la fin du dernier cas ne nettoie que les jours où tout
 *     va bien. Il rend en outre la liste de ce qu'il n'a pas pu effacer, et cette liste
 *     ROUGIT le fichier : c'est la seule position d'où son échec pèse encore sur le code de
 *     sortie.
 *   · CE QU'IL NE NETTOIE PAS. Le bac d'un cas EN ÉCHEC est CONSERVÉ, et son chemin imprimé.
 *     Un nettoyage qui emporte tout emporte aussi la seule matière qui explique le rouge —
 *     l'arborescence exacte sur laquelle l'assertion a été lue. Tout conserver est un
 *     défaut ; conserver le fautif est le contraire d'un défaut.
 *
 * ⚠️ LE PÉRIMÈTRE DE LA SUPPRESSION, ET IL N'EST PAS NÉGOCIABLE : ce nettoyage n'efface QUE
 * les chemins que `bacJetable` a construits dans CETTE course et gardés en mémoire. Jamais
 * un balayage par motif sur le répertoire temporaire — c'est celui de l'utilisateur, il
 * porte les fichiers de tout ce qui tourne sur ce poste. Rien de ce que les exécutions
 * passées y ont laissé n'est touché ici.
 *
 * ⚠️ `t.passed` EST LU, JAMAIS SUPPOSÉ. Le harnais le pose sur le contexte du cas avant
 * d'appeler `afterEach` ; s'il cessait de le faire, la conservation du bac fautif
 * disparaîtrait en silence — donc `brancherLesBacs` refuse de se brancher sur un harnais
 * qui ne l'expose pas, plutôt que de laisser croire à une conservation qui n'aurait plus
 * lieu. Cf. [[garantie-par-mecanisme-pas-convention]].
 *
 * Usage, en tête d'un fichier de test :
 *     import { bacJetable, brancherLesBacs } from '../../../outils/bac-jetable.mjs';
 *     brancherLesBacs();
 *     ... const racine = bacJetable('mon-prefixe');
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, beforeEach } from 'node:test';

/* Le nom d'un bac appartient à SA course, et à elle seule : le PID, l'instant de départ, et
   le rang du bac dans la course. Le rang est écrit sur une largeur de trois chiffres pour
   qu'un listing se trie dans l'ordre des cas — c'est un format d'affichage, pas un compte. */
const COURSE = `${process.pid}-${Date.now().toString(36)}`;
let rangDuBac = 0;

/** { chemin, garder: string|null, cas: string|null } */
const bacs = [];
let casCourant = null;
let brancheFaite = false;

/**
 * Ouvre un bac jetable et le retient. `prefixe` reste celui qu'écrivait l'appelant : il
 * garde sa valeur de diagnostic dans un listing, il n'est plus le seul segment du nom.
 */
export function bacJetable(prefixe) {
  const gabarit = join(tmpdir(), `${prefixe}-${COURSE}-${String(++rangDuBac).padStart(3, '0')}-`);
  let d;
  try {
    d = mkdtempSync(gabarit);
  } catch (e) {
    /* Une erreur EXPLICITE, jamais une trace de pile : elle nomme le chemin qu'elle n'a pas
       pu créer et dit de quel côté est le défaut. */
    throw new Error(`BAC JETABLE NON CRÉÉ — mkdtemp(\`${gabarit}*\`) a échoué : `
      + `${e.code || ''} ${String(e.message).split('\n')[0]}`
      + `\n→ le banc d'essai n'a pas pu être monté ; ce cas ne dit RIEN de ce qu'il juge.`);
  }
  bacs.push({ chemin: d, garder: null, cas: casCourant });
  return d;
}

/* `garder` porte la RAISON de la conservation, jamais un booléen nu : elle s'imprime telle
   quelle, pour qu'un bac survivant ne se lise jamais comme un oubli. */
function conserverLesBacsDuCas(nom, raison) {
  for (const b of bacs) if (b.cas === nom && !b.garder) b.garder = raison;
}

/* Il REND la liste de ce qu'il n'a pas pu effacer, au lieu de l'avaler. `maxRetries` couvre
   la cause la plus banale sur un poste Windows — un analyseur qui tient encore un handle sur
   des fichiers écrits la seconde d'avant ; ce qui survit aux reprises est un vrai reliquat.
   Ce qui est CONSERVÉ À DESSEIN n'est pas un reliquat : il sort par l'autre liste. */
function nettoyerLesBacs() {
  const restants = [];
  const gardes = [];
  while (bacs.length) {
    const b = bacs.shift();
    if (b.garder) { gardes.push(`${b.chemin}  (${b.garder})`); continue; }
    try { rmSync(b.chemin, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 }); }
    catch (e) { restants.push(`${b.chemin}  (${e.code || ''} ${String(e.message).split('\n')[0]})`); }
  }
  return { restants, gardes };
}

/* RENDRE COMPTE EST LA MOITIÉ DU DISPOSITIF, et cette fonction est appelée depuis `after()`
   et depuis le filet d'`exit`, jamais depuis un cas. Un bac effacé sans un mot et un bac
   jamais créé se ressemblent exactement, vus de la sortie. */
function rendreCompteDesBacs(restants, gardes) {
  if (gardes.length) {
    console.log(`\n  CONSERVÉS À DESSEIN (${gardes.length}) — le banc des cas fautifs, pour le diagnostic :`);
    for (const g of gardes) console.log(`      ${g}`);
    console.log("        → l'arborescence exacte sur laquelle l'assertion a été lue.");
    console.log('          À effacer une fois le rouge compris.');
  }
  if (restants.length) {
    console.log(`\n  ECHEC nettoyage — ${restants.length} bac(s) jetable(s) n'ont pas pu être effacés :`);
    for (const r of restants) console.log(`      ${r}`);
    console.log("        → ce n'est pas un défaut de ce qui est jugé ; c'est le banc qui laisse des");
    console.log('          traces, et un banc qui laisse des traces finit par juger sur celles des autres.');
  }
}

/**
 * Branche le nettoyage sur le harnais. À appeler UNE fois, en tête du fichier de test.
 * Un second appel ne rebranche pas : les hooks se cumuleraient et le compte rendu sortirait
 * deux fois, dont une à vide.
 */
export function brancherLesBacs() {
  if (brancheFaite) return;
  brancheFaite = true;

  beforeEach((t) => { casCourant = t.name; });

  afterEach((t) => {
    /* Le harnais doit dire si le cas est passé. S'il cesse de l'exposer, la conservation du
       bac fautif meurt en silence — on préfère un rouge bruyant à une garde éteinte. */
    if (typeof t.passed !== 'boolean') {
      throw new Error("BAC JETABLE : le harnais n'expose plus `t.passed` dans `afterEach` — "
        + 'le bac d\'un cas en échec ne serait plus conservé, et le diagnostic disparaîtrait '
        + 'sans un mot.');
    }
    /* LE BAC DU CAS FAUTIF SURVIT, et lui seul. C'est là que vit tout ce qui permet de
       comprendre le rouge. Un nettoyage qui emporte tout emporte aussi le diagnostic. */
    if (!t.passed) conserverLesBacsDuCas(t.name, `cas en échec : ${t.name}`);
    casCourant = null;
  });

  /* LE NETTOYAGE EST ICI — la place du `finally` d'un script linéaire. Un fichier dont un cas
     casse au milieu est exactement le moment où personne ne nettoiera à la main, et c'est
     ainsi que le répertoire temporaire s'est rempli. */
  after(() => {
    const { restants, gardes } = nettoyerLesBacs();
    rendreCompteDesBacs(restants, gardes);
    /* Un bac qu'on n'a pas pu effacer ROUGIT, et c'est la seule position d'où son échec pèse
       encore sur le code de sortie. */
    if (restants.length) {
      throw new Error(`BACS JETABLES NON NETTOYÉS : ${restants.length} — chemins imprimés ci-dessus.`);
    }
  });

  /* Filet de dernier recours, pour les morts qui ne passent pas par `after()` — et il y en
     a : `process.exit()` ne déroule aucun hook. Un gestionnaire d'`exit` ne peut plus peser
     sur le code de sortie ; ce qu'il peut encore faire, c'est ne pas mentir par omission. */
  process.on('exit', () => {
    const { restants, gardes } = nettoyerLesBacs();
    rendreCompteDesBacs(restants, gardes);
  });
}
