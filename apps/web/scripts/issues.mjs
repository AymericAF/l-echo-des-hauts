/**
 * TROIS ISSUES, TROIS CODES — la convention du parc, reprise et non reinventee
 * (`~/.claude/.githooks/verifier-alignement.mjs`, `~/.claude/check-alignement-deploiement.ps1`).
 *
 *   0  VERIFIE ET CONFORME     — la preuve a eu lieu, et rien ne cloche.
 *   1  VERIFIE ET ANOMALIE     — la preuve a eu lieu, et a trouve quelque chose.
 *   2  VERIFICATION IMPOSSIBLE — la preuve n a PAS eu lieu : il manque de quoi juger.
 *
 * La troisieme est la raison d etre de la convention. Sans elle, « je n ai rien pu
 * verifier » rend le meme code que « j ai tout verifie, tout va bien ».
 *
 * POURQUOI CE FICHIER EXISTE, ALORS QUE LA CONSTANTE VIVAIT DANS `serveur-fixtures.mjs`
 * (commit c4bd11a, tache 8bfc7727). Depuis le 2026-08-10 elle ne sert plus seulement aux
 * deux preuves sur fixtures : les six verificateurs s en servent aussi, et trois d entre
 * eux sont importes par `integrations/` — c est-a-dire charges dans CHAQUE build, y
 * compris celui de production. Faire dependre un build reel du Strapi de substitution
 * serait un contresens, et ce fichier-la ecrit noir sur blanc qu il ne sert jamais en
 * production. La constante DEMENAGE donc ici, et `serveur-fixtures.mjs` la REEXPORTE :
 * une seule definition, aucun appelant a retoucher. Pointer, jamais dupliquer — deux
 * copies d un code de sortie finiraient par diverger, et le jour ou elles divergent, un
 * « 2 » d un cote vaut « anomalie » de l autre.
 */
export const ISSUES = { CONFORME: 0, ANOMALIE: 1, VERIFICATION_IMPOSSIBLE: 2 };

/**
 * L erreur qu une garde de build leve quand elle n a PAS PU verifier.
 *
 * Elle est SEPAREE du message d anomalie de chaque garde, et deliberement : « 44
 * manquement(s) » envoie corriger le site, « verification impossible » envoie corriger
 * l environnement. Afficher l un pour l autre coute une demi-journee de recherche dans
 * le mauvais objet — c est exactement ce que faisait `verifier-origine-medias.mjs`, qui
 * accusait notre propre origine d etre « hors du site ».
 *
 * @param {string} nom Le nom de la garde, pour que le journal du build le porte.
 * @param {string[]} raisons Ce qui manque, nomme.
 */
export function erreurVerificationImpossible(nom, raisons) {
  return new Error(
    `[${nom}] VERIFICATION IMPOSSIBLE — la garde n a rien pu juger :\n` +
      raisons.map((r) => `  - ${r}`).join('\n') +
      '\n\n  Ceci n est PAS un manquement du site : c est la garde qui est aveugle.' +
      '\n  Le build echoue quand meme, et c est le point : une garde qui ne peut pas' +
      '\n  verifier doit le DIRE, jamais rendre le vert de celle qui a verifie.' +
      `\n  Code de sortie ${ISSUES.VERIFICATION_IMPOSSIBLE} en ligne de commande (0 conforme, 1 anomalie).`,
  );
}
