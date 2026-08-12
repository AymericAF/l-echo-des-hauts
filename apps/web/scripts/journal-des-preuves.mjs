/**
 * LE JOB `sortie` NE DOIT PLUS S ARRETER AU PREMIER ROUGE — journal, puis verdict unique.
 *
 * LE DEFAUT QUE CE FICHIER FERME, mesure le 2026-08-12 (tache 772ac0ac). Le job `sortie`
 * enchaine CINQ pas qui JUGENT, chacun sur un objet different :
 *
 *   1. `npm run preuve:rendu`        — le build reel sur fixtures, par la porte de la production
 *   2. `dist/pagefind/pagefind.js`   — l index de recherche est bien depose
 *   3. la boucle des verificateurs   — la sortie construite, par la porte de la recette
 *   4. `npm run preuve:pagination`   — les bornes, sur un SECOND build (corpus de recette)
 *   5. `npm run preuve:encre-og`     — le seuil de la garde des images OG
 *
 * GitHub Actions arrete un job au PREMIER pas en code non nul. Les quatre suivants ne
 * tournent pas — ils ne sont ni verts ni rouges, ils N EXISTENT PAS dans ce run. Un seul
 * verificateur rouge en 3 fait donc SAUTER 4 et 5, qui ne partagent pourtant rien avec
 * lui : `preuve:pagination` construit son propre corpus dans `dist-recette/`, et
 * `preuve:encre-og` ne lit meme pas de sortie. Une garde en court-circuite trois autres.
 *
 * CE QUE CA COUTE, ET POURQUOI CE N EST PAS UN CONFORT. On corrige la trouvaille, on
 * repousse, et le run suivant decouvre la SUIVANTE — un defaut par aller-retour de CI,
 * chacun coutant `npm ci` + deux builds. Pire : tant qu un pas rouge subsiste, on n a
 * AUCUN moyen de savoir si les gardes d apres tournent encore. C est exactement le fil
 * des trois taches du jour : une garde qui ne s exerce pas la ou le mal se produit ne
 * garde rien — ici parce qu une AUTRE garde l a court-circuitee.
 *
 * LE MECANISME, ET POURQUOI PAS `continue-on-error`. `continue-on-error: true` fait
 * passer la CONCLUSION du pas a `success` : le job devient vert sur un pas rouge, ce qui
 * echange un court-circuit contre un mensonge. Ici, chaque pas qui juge :
 *
 *   - tourne sous `if: always()` (il ne depend plus de ceux d avant) ;
 *   - capture son propre code de sortie et le CONSIGNE dans un journal ;
 *   - sort en 0 pour ne pas arreter le job — ce qui n absout personne, puisque
 *     le pas FINAL relit le journal et rend le verdict.
 *
 * LA CONVENTION DES ISSUES EST CELLE DU DEPOT, PAS UNE SECONDE. `0` conforme, `1` juge
 * et trouve (corriger le SITE), `2` verification impossible (corriger l ENVIRONNEMENT) :
 * elle est definie une seule fois dans `scripts/issues.mjs` et n est pas recopiee ici.
 * Le verdict la fait apparaitre dans le journal du job — c est la moitie que le job
 * n avait pas, `docs/ci-incapacite-vs-anomalie.md` §7 le nommant explicitement comme un
 * perimetre distinct de la boucle des verificateurs.
 *
 * LE PIEGE QUE CE FICHIER DOIT FERMER EN PREMIER : un journal vide, ou un pas ajoute au
 * workflow sans etre consigne, ferait rendre `0` a un verdict qui n a rien juge — succes
 * et echec rendant la meme sortie. La population attendue est donc DERIVEE
 * (`preuve:*` de package.json + les pas natifs declares ci-dessous), et son absence est
 * une INCAPACITE du verdict lui-meme, jamais un silence.
 * Cf. [[quand-succes-et-echec-rendent-la-meme-sortie]].
 *
 *   node scripts/journal-des-preuves.mjs --consigner <nom> <code>   -> ajoute une ligne, sort en 0
 *   node scripts/journal-des-preuves.mjs --verdict                  -> 0 / 1 / 2
 *
 * Le chemin du journal se lit dans `JOURNAL_DES_PREUVES`, ou en dernier argument.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ISSUES } from './issues.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * LES PAS QUI JUGENT SANS ETRE UN SCRIPT `preuve:*` — declares, avec leur raison.
 *
 * Ils ne peuvent pas se deriver de `package.json` : ils n y sont pas, et ils n ont pas a
 * y etre. Les ecrire ici plutot que de les laisser implicites est ce qui permet au
 * verdict de constater qu ils ont bien tourne — sans cette liste, retirer l un des deux
 * du workflow rendrait le verdict vert sur un pas disparu.
 */
export const PAS_HORS_PACKAGE_JSON = {
  'index-de-recherche':
    'le pas qui lit `dist/pagefind/pagefind.js` dans la sortie produite. Il est ecrit en ' +
    'shell dans le workflow et non en script npm, deliberement : il ne peut pas etre ' +
    'satisfait par une declaration du depot, il lit le repertoire.',
  'verificateurs-de-sortie':
    'la boucle qui relance les verificateurs derives de package.json. Elle rend deja son ' +
    'propre verdict agrege ; ce qui est consigne ici est le code de la BOUCLE, pour que ' +
    'son rouge cesse de faire sauter les pas suivants.',
};

/** Les scripts `preuve:*` que `package.json` DECLARE, tries. */
export function preuvesDeclarees(paquet) {
  return Object.keys(paquet.scripts ?? {})
    .filter((cle) => cle.startsWith('preuve:'))
    .sort();
}

/** Tout ce que le job doit avoir consigne quand il arrive au verdict. */
export function pasAttendus(paquet) {
  return [...preuvesDeclarees(paquet), ...Object.keys(PAS_HORS_PACKAGE_JSON)].sort();
}

/**
 * Le sens d un code de sortie, dans le vocabulaire de `issues.mjs`.
 *
 * Tout code non nul autre que `2` est une anomalie : un `127` (commande absente) ou un
 * `137` (tue par l OOM) ne sont pas des incapacites DECLAREES, et les traiter comme
 * telles ferait dire au verdict qu il sait ce qu il ne sait pas.
 */
export function classer(code) {
  if (code === ISSUES.CONFORME) return 'conforme';
  if (code === ISSUES.VERIFICATION_IMPOSSIBLE) return 'incapacite';
  return 'anomalie';
}

/**
 * Les entrees d un journal, dans l ordre ou elles ont ete consignees.
 *
 * Une ligne illisible n est PAS ignoree : elle ressort en `code: null`, que le verdict
 * traite en incapacite. Sauter ce qu on ne comprend pas est la forme la plus discrete du
 * vert sur rien.
 */
export function lireJournal(texte) {
  const entrees = [];
  for (const ligne of (texte ?? '').split('\n')) {
    const nu = ligne.trim();
    if (nu === '') continue;
    const trouve = /^(\S+)\s+(-?\d+)$/.exec(nu);
    if (trouve === null) entrees.push({ nom: nu, code: null });
    else entrees.push({ nom: trouve[1], code: Number(trouve[2]) });
  }
  return entrees;
}

/**
 * Le verdict du job, a partir du journal et de la population attendue.
 *
 * @returns {{ code: number, lignes: string[] }} `code` 0 conforme, 1 au moins un pas non
 *   conforme, 2 le VERDICT lui-meme n a pas pu juger (journal vide, illisible, ou pas
 *   attendu absent). La troisieme est la seule qui parle du dispositif et non du site.
 */
export function verdict(entrees, attendus) {
  const lignes = [];
  const vues = new Map();
  for (const entree of entrees) vues.set(entree.nom, entree.code);

  const illisibles = entrees.filter((e) => e.code === null).map((e) => e.nom);
  const absents = attendus.filter((nom) => !vues.has(nom));

  if (entrees.length === 0) {
    lignes.push(
      'VERDICT IMPOSSIBLE : le journal des preuves est vide. Aucun pas n a rien consigne — ' +
        'rendre 0 ici serait un vert sur zero preuve.',
    );
    return { code: ISSUES.VERIFICATION_IMPOSSIBLE, lignes };
  }
  if (illisibles.length > 0) {
    lignes.push(`VERDICT IMPOSSIBLE : ligne(s) de journal illisible(s) : ${illisibles.join(', ')}`);
  }
  if (absents.length > 0) {
    lignes.push(
      `VERDICT IMPOSSIBLE : le journal ne porte pas ${absents.join(', ')} — le pas a ete ` +
        'retire du workflow, n a pas tourne, ou a ete ajoute sans etre consigne. Un verdict ' +
        'rendu sur une population amputee certifie « tout conforme » sur ce qui manque.',
    );
  }
  if (illisibles.length > 0 || absents.length > 0) {
    return { code: ISSUES.VERIFICATION_IMPOSSIBLE, lignes };
  }

  const incapacites = [];
  const anomalies = [];
  for (const [nom, code] of vues) {
    if (classer(code) === 'incapacite') incapacites.push(nom);
    else if (classer(code) === 'anomalie') anomalies.push(`${nom} (code ${code})`);
  }

  /* LE VERDICT NE BOUGE PAS : incapacite COMPRISE, tout code non nul fait echouer le job.
     Ce qui change est ce que ce journal DIT. Un build qui n a rien produit ne passe pas
     sous pretexte qu on a su le nommer. (`docs/ci-incapacite-vs-anomalie.md`, encadre.) */
  if (incapacites.length > 0) {
    lignes.push(
      `N ONT PAS PU JUGER — code 2, il manquait de quoi juger. Corriger l ENVIRONNEMENT : ${incapacites.join(', ')}`,
    );
  }
  if (anomalies.length > 0) {
    lignes.push(`ONT JUGE, ET TROUVE — code 1. Corriger le SITE : ${anomalies.join(', ')}`);
  }
  if (incapacites.length === 0 && anomalies.length === 0) {
    lignes.push(`OK : ${vues.size} pas juges, tous conformes (code 0).`);
    return { code: ISSUES.CONFORME, lignes };
  }
  return { code: ISSUES.ANOMALIE, lignes };
}

// --- Lecture de la topologie du workflow ------------------------------------------------

/**
 * Les pas d un job du workflow : intitule, `id`, `if`, et le corps de son `run`.
 *
 * POURQUOI UN EXTRACTEUR ET PAS UNE EXPRESSION REGULIERE SUR LE FICHIER ENTIER. Ce qui
 * est asserte plus loin est une TOPOLOGIE — « aucun pas qui juge ne depend du precedent »
 * — et une expression reguliere qui cherche `always()` quelque part dans 14 Kio de YAML
 * serait verte le jour ou le mot survit sur le mauvais pas. Il n y a pas d analyseur YAML
 * dans ce depot (public, sans dependance de confort) : celui-ci ne comprend que la forme
 * exacte de ce fichier-la, et c est assez.
 */
export function pasDuJob(yml, job) {
  /* `\r?\n` et non `\n` : ce fichier est versionne en CRLF, et un extracteur qui laisse
     traner un `\r` ne reconnait plus une seule ligne — il rendrait ZERO pas, donc une
     topologie vide, donc des assertions vraies sur du vide. Mesure du 2026-08-12 : c est
     exactement ce qu il a fait a sa premiere execution. */
  const lignes = yml.split(/\r?\n/);
  const debut = lignes.findIndex((l) => l === `  ${job}:`);
  if (debut === -1) return [];

  const pas = [];
  let courant = null;
  let dansRun = false;

  for (let i = debut + 1; i < lignes.length; i += 1) {
    const ligne = lignes[i];
    if (/^ {2}\S/.test(ligne)) break; // le job suivant

    const ouverture = /^ {6}- name: (.+)$/.exec(ligne);
    if (ouverture !== null) {
      courant = { nom: ouverture[1].trim(), id: null, si: null, run: '' };
      pas.push(courant);
      dansRun = false;
      continue;
    }
    if (courant === null) continue;

    const champ = /^ {8}(\w+): ?(.*)$/.exec(ligne);
    if (champ !== null) {
      dansRun = false;
      if (champ[1] === 'id') courant.id = champ[2].trim();
      if (champ[1] === 'if') courant.si = champ[2].trim();
      if (champ[1] === 'run') {
        dansRun = true;
        if (champ[2].trim() !== '' && champ[2].trim() !== '|') courant.run = champ[2].trim();
      }
      continue;
    }
    if (dansRun) courant.run += `${ligne.trim()}\n`;
  }

  return pas;
}

// --- Usage en ligne de commande ---------------------------------------------------------

function cheminDuJournal(arguments_) {
  const explicite = arguments_.find((a) => !a.startsWith('--') && /[\\/]/.test(a));
  const chemin = explicite ?? process.env.JOURNAL_DES_PREUVES;
  if (!chemin) {
    console.error(
      '✖ [journal-des-preuves] aucun journal : renseigne JOURNAL_DES_PREUVES, ou passe le ' +
        'chemin en argument. Sans lui, consigner ecrirait dans le vide et le verdict jugerait du vent.',
    );
    process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
  }
  return chemin;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arguments_ = process.argv.slice(2);
  const journal = cheminDuJournal(arguments_);

  if (arguments_[0] === '--consigner') {
    const nom = arguments_[1];
    const code = arguments_[2];
    if (!nom || !/^-?\d+$/.test(code ?? '')) {
      console.error('✖ [journal-des-preuves] usage : --consigner <nom> <code>');
      process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
    }
    fs.mkdirSync(path.dirname(path.resolve(journal)), { recursive: true });
    fs.appendFileSync(journal, `${nom} ${code}\n`, 'utf8');
    console.log(`▸ consigne : ${nom} -> ${code} (${classer(Number(code))})`);
    /* SORTIE 0 DELIBEREE : c est ce qui empeche le pas d arreter le job. Le rouge n est
       pas perdu, il est DIFFERE jusqu au verdict — qui, lui, ne peut pas etre saute. */
    process.exit(ISSUES.CONFORME);
  }

  if (arguments_[0] === '--verdict') {
    const paquet = JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8'));
    const texte = fs.existsSync(journal) ? fs.readFileSync(journal, 'utf8') : '';
    const rendu = verdict(lireJournal(texte), pasAttendus(paquet));
    for (const ligne of rendu.lignes) {
      if (rendu.code === ISSUES.CONFORME) console.log(ligne);
      else console.error(`::error title=Gardes du code::${ligne}`);
    }
    process.exit(rendu.code);
  }

  console.error('✖ [journal-des-preuves] usage : --consigner <nom> <code> | --verdict');
  process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
}
