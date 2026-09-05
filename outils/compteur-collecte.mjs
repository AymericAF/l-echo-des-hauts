// COMPTEUR DE COLLECTE — rapporteur `node:test` qui compte les cas REELLEMENT executes,
// fichier par fichier, pour que `outils/lancer-bancs.mjs` puisse refuser une collecte vide.
//
// POURQUOI IL FAUT COMPTER SOI-MEME. Mesure du 2026-09-05 (Node 24.14.0) : un fichier de test
// sans aucun cas ne sort pas seulement en 0, il est compte « pass 1 ». `node --test` fabrique
// en effet un cas SYNTHETIQUE portant le nom du fichier quand celui-ci n en a declare aucun.
// Le resume final (`ℹ pass N`) est donc inutilisable comme plancher : il ne distingue pas
// « 1 banc qui a tout verifie » de « 1 banc qui n a rien execute ».
//
// COMMENT ON DISTINGUE LE CAS SYNTHETIQUE D UN VRAI CAS :
//     nesting === 0  ·  line === 1  ·  column === 1  ·  ET son `name` DESIGNE LE FICHIER
// Un vrai `test()` porte le nom que l auteur lui a donne et la ligne ou il est declare.
//
// ⚠️ PIEGE PAYE LE 2026-09-05 : ce `name` n est PAS le nom de base du fichier, c est LE CHEMIN
// TEL QU IL A ETE PASSE SUR LA LIGNE DE COMMANDE — « tests/vide.test.ts » en relatif, le
// chemin complet en absolu. Comparer au seul `basename` laissait passer tous les bancs lances
// en chemin absolu : la garde etait verte et ne gardait rien. On compare le chemin RESOLU.
//
// ON NE COMPTE QUE `details.type === 'test'`. Un `describe()` emet un evenement de type
// `suite` : s il etait compte, un groupe vide de ses `it` passerait pour un banc plein — c est
// precisement la forme d effacement qu on cherche a voir.
//
// UN CAS `skip`/`todo` COMPTE. Le defaut vise est « aucun cas n a ete collecte », pas « des cas
// ont ete neutralises ». Compter les skips comme des vides ferait rougir des bancs sains, et
// une garde qui rougit a tort se fait desactiver : on perdrait la couverture EN PLUS du
// plancher.
//
// SORTIE : une ligne JSON par fichier, {"fichier": "<chemin>", "cas": <n>}.

import { basename, resolve } from 'node:path';

function nommeLeFichier(nom, fichier) {
  if (nom === fichier || nom === basename(fichier)) return true;
  try {
    return resolve(nom) === resolve(fichier);
  } catch {
    return false;
  }
}

function estCasSynthetique(d) {
  return d.nesting === 0 && d.line === 1 && d.column === 1 && nommeLeFichier(d.name, d.file ?? '');
}

export default async function* compteurDeCollecte(source) {
  /** @type {Map<string, number>} */
  const parFichier = new Map();

  for await (const evt of source) {
    if (evt.type !== 'test:pass' && evt.type !== 'test:fail') continue;
    const d = evt.data;
    if (!d?.file) continue;
    if (!parFichier.has(d.file)) parFichier.set(d.file, 0);
    if (d.details?.type !== 'test') continue;
    if (estCasSynthetique(d)) continue;
    parFichier.set(d.file, parFichier.get(d.file) + 1);
  }

  for (const [fichier, cas] of parFichier) {
    yield `${JSON.stringify({ fichier, cas })}\n`;
  }
}
