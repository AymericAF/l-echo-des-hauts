// LE BAC JETABLE SE RETIRE, OU IL S'ACCUMULE. IL N'Y A PAS DE TROISIÈME ÉTAT.
//
// ── LE FAIT QUI LE MOTIVE, MESURÉ ICI ET NON REPRIS D'AILLEURS ─────────────────────────────
// Le répertoire temporaire de ce poste portait 199 592 entrées le 2026-08-28. Sur les douze
// familles les plus nombreuses, SIX viennent de ce dépôt-ci et d'aucun autre — et aucune des
// six n'était retirée nulle part :
//
//     garde-t09-              20 535   apps/web/tests/garde-sortie.test.ts
//     echo-corpus-            13 700   apps/cms/tests/seed-corpus.test.ts
//     garde-styles-en-ligne-  10 406   apps/web/tests/garde-styles-en-ligne.test.ts
//     garde-images-            9 091   apps/web/tests/garde-images.test.ts
//     garde-origine-medias-    8 160   apps/web/tests/garde-origine-medias.test.ts
//     echo-voies-              7 722   apps/cms/tests/seed-voies.test.ts
//
// Ce n'est pas un encombrement de confort : chaque bac neuf naît dans un dossier que le
// système d'exploitation doit parcourir, et le coût se paie à CHAQUE passe de `npm test`.
//
// ── D'OÙ VIENT CE MODULE — IL EST PORTÉ, PAS INVENTÉ ──────────────────────────────────────
// Il vient de `docs/lib-banc-hermetique.mjs` du dépôt de documentation
// (`l-echo-des-hauts-magazine-editorial-local`, commit `eefe1a4`), où le même défaut a été
// tari le 2026-08-27. Réécrire un harnais ici aurait fabriqué une seconde rédaction d'une
// même mécanique, à faire diverger — ce que ce projet corrige partout ailleurs.
//
// ⚠️ CE QUI N'A DÉLIBÉRÉMENT PAS ÉTÉ PORTÉ : `exigerHermeticite` et `cheminsConsultes`, qui
// confrontent au disque tout ce que `require.resolve` consulterait depuis le bac. Elles
// ferment un trou RÉEL — mais un trou que ce dépôt-ci n'a pas : aucun test d'`apps/web` ni
// d'`apps/cms` ne RÉSOUT un paquet depuis son bac ; tous y écrivent une arborescence de
// fichiers qu'une garde relit ensuite par chemin. Les porter quand même aurait posé ici une
// mécanique que rien n'exerce, et un contrôle jamais exécuté n'est pas vert : il est muet.
// Le jour où un bac de ce dépôt servira de domicile de résolution, c'est de là qu'il faut les
// reprendre — elles y sont écrites et prouvées.
//
// ── POURQUOI ICI, ET PAS DANS CHAQUE FICHIER DE TEST ──────────────────────────────────────
// Le trou n'appartient à aucun cas : il appartient au BAC. Le traiter fichier par fichier
// obligerait à recommencer à chaque banc écrit, et le prochain naîtrait troué.
//
// ── POURQUOI HORS DU RÉPERTOIRE TEMPORAIRE ────────────────────────────────────────────────
// Deux raisons, et la seconde est celle qui compte. (1) Un bac qui ne naît pas dans le
// temporaire de l'utilisateur ne peut pas l'engorger, même le jour où le retrait échoue.
// (2) Un reliquat dans une racine DÉDIÉE est imputable : il porte le préfixe de sa recette et
// le numéro du processus qui l'a laissé. Dans un temporaire à 199 592 entrées, un reliquat
// n'est plus qu'une entrée de plus, et personne ne le rattache jamais à rien.
// `TEMPORAIRE` reste exporté pour la recette qui doit rester dans le temporaire — parce
// qu'elle y éprouve quelque chose, ou qu'un tiers l'y attend.
//
// ── POURQUOI `finally` (ici : `after`) ET PAS « À LA FIN DU FICHIER » ─────────────────────
// Une recette de ce dépôt PROUVE EN CASSANT : l'échec est son régime normal, pas son
// accident. Un retrait écrit après la boucle de cas ne tourne donc jamais le jour où il
// servirait. Sous `node:test`, le `finally` de l'appelant est le crochet `after()`, qui
// s'exécute que les cas soient verts ou rouges.
//
// ── LE FILET, ET CE QU'IL NE RATTRAPE PAS ─────────────────────────────────────────────────
// `process.exit()` ne déroule AUCUN `finally` et ne joue AUCUN `after()`. Le filet
// `process.on('exit')` reprend donc la main à la sortie, quelle qu'elle soit — sauf `SIGKILL`
// et `process.abort()`, que rien ne rattrape. Il ne pèse pas sur le code de sortie : ce qu'il
// peut encore faire, c'est ne pas mentir par omission.
//
// ⚠️ LE PÉRIMÈTRE DU RETRAIT N'EST PAS NÉGOCIABLE : il n'efface QUE les chemins que `creer` a
// construits dans cette course et gardés en mémoire. JAMAIS un balayage par motif sur le
// répertoire temporaire — c'est celui de l'utilisateur, il porte les fichiers de tout ce qui
// tourne sur ce poste. Et ce module NE PURGE RIEN de ce qui est déjà là : tarir la fuite et
// vider le seau sont deux gestes, et le second est une suppression de masse.
//
// ── CE QUI LE PROUVE ──────────────────────────────────────────────────────────────────────
// `apps/web/tests/banc-jetable.test.ts`, qui le prouve EN LE CASSANT : une passe verte et une
// passe délibérément rouge, jouées en processus fils, avec le compte des bacs restants avant
// et après dans les deux régimes. Une seule mesure sur le vert ne dirait rien du `after()`.

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/* LA RACINE DÉDIÉE. Hors du répertoire temporaire — c'est le déménagement — et hors de tout
   dépôt, pour qu'aucun `node_modules` de projet ne se retrouve sur sa chaîne. `ECHO_BANCS`
   existe pour les postes réglés autrement, et pour qu'une recette puisse se donner une racine
   à elle sans jamais toucher à celle du poste. */
export const RACINE_DES_BANCS = process.env.ECHO_BANCS
  ? resolve(process.env.ECHO_BANCS)
  : join(homedir(), '.echo-bancs');

/* Le domicile à demander quand une recette doit RESTER dans le répertoire temporaire de
   l'utilisateur. Le défaut, lui, est la racine dédiée. */
export const TEMPORAIRE = tmpdir();

/**
 * REND UN HARNAIS DE BACS JETABLES : il les fabrique, les tient en mémoire, et les RETIRE.
 *
 * `domicile` — où les bacs se montent. Défaut : `RACINE_DES_BANCS`. `TEMPORAIRE` pour rester
 *              dans le répertoire temporaire de l'utilisateur.
 * `filet`    — pose le `process.on('exit')` de dernier recours. Le laisser à `true`.
 *
 * L'appelant met `nettoyer()` dans son `after()`, et `rendreCompte()` juste après.
 */
export function harnaisDeBacs({ domicile = RACINE_DES_BANCS, filet = true } = {}) {
  const racine = resolve(domicile);
  /* Le nom d'un bac appartient à SA course, et à elle seule : le PID, l'instant de départ, et
     le rang du bac dans la course. Deux exécutions concurrentes ne peuvent plus se disputer un
     nom — et `node --test` en lance une par fichier —, et un reliquat se rattache au processus
     qui l'a laissé. Le rang est écrit sur trois chiffres pour qu'un listing se trie dans
     l'ordre des cas : c'est un format d'affichage, jamais un compte de cas. */
  const course = `${process.pid}-${Date.now().toString(36)}`;
  let rang = 0;
  const bacs = [];

  function creer(prefixe) {
    try {
      mkdirSync(racine, { recursive: true });
    } catch (e) {
      throw new Error(
        `RACINE DES BACS NON CRÉÉE — \`${racine}\` : ${e.code || ''} ${String(e.message).split('\n')[0]}`
          + "\n→ le bac n'a pas pu être monté ; ce cas ne dit RIEN de ce qu'il devait éprouver.",
      );
    }
    const gabarit = join(racine, `${prefixe}${course}-${String(++rang).padStart(3, '0')}-`);
    let bac;
    try {
      bac = mkdtempSync(gabarit);
    } catch (e) {
      /* Une erreur EXPLICITE, jamais une trace de pile : elle nomme le chemin qu'elle n'a pas
         pu créer et dit de quel côté est le défaut. */
      throw new Error(
        `BAC JETABLE NON CRÉÉ — mkdtemp(\`${gabarit}*\`) a échoué : ${e.code || ''} ${String(e.message).split('\n')[0]}`
          + "\n→ le bac n'a pas pu être monté ; ce cas ne dit RIEN de ce qu'il devait éprouver.",
      );
    }
    bacs.push({ chemin: bac, garder: null });
    return bac;
  }

  /* `garder` porte la RAISON de la conservation, jamais un booléen nu : elle s'imprime telle
     quelle, pour qu'un bac survivant ne se lise jamais comme un oubli. */
  function conserverLeDernier(raison) {
    if (bacs.length) bacs[bacs.length - 1].garder = raison;
  }

  /* Il REND la liste de ce qu'il n'a pas pu effacer, au lieu de l'avaler.

     ⚠️ NE PAS LIRE `maxRetries: 5, retryDelay: 120` COMME UNE REPRISE QUI A LIEU : le réglage
     est conservé du module d'origine pour la classe de verrou d'un handle tenu par un tiers,
     qui n'a jamais été reproduite ici. C'est un pari assumé, pas un mécanisme dont on a
     constaté le travail. */
  function nettoyer() {
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

  /* RENDRE COMPTE EST LA MOITIÉ DU DISPOSITIF : un bac effacé sans un mot et un bac jamais
     créé se ressemblent exactement, vus de la sortie. Silencieux quand tout est propre —
     sinon le signal se fait ignorer. */
  function rendreCompte({ restants, gardes }) {
    if (gardes.length) {
      console.log(`\n  CONSERVÉS À DESSEIN (${gardes.length}) — le bac des cas fautifs, pour le diagnostic :`);
      for (const g of gardes) console.log(`      ${g}`);
      console.log('        → à effacer une fois le rouge compris.');
    }
    if (restants.length) {
      console.log(`\n  ECHEC nettoyage — ${restants.length} bac(s) jetable(s) n'ont pas pu être effacés :`);
      for (const r of restants) console.log(`      ${r}`);
      console.log("        → ce n'est pas un défaut de la garde ; c'est le banc qui laisse des traces,");
      console.log('          et un banc qui laisse des traces finit par juger sur celles des autres.');
    }
  }

  if (filet) {
    process.on('exit', () => {
      rendreCompte(nettoyer());
    });
  }

  return { creer, conserverLeDernier, nettoyer, rendreCompte, racine, course };
}
