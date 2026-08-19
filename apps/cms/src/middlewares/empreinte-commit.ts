/**
 * LE CONTENEUR DIT QUEL COMMIT IL SERT — sans quoi un `200` ne prouve RIEN.
 *
 * LE DEFAUT QUE CE FICHIER OUVRE LA VOIE A FERMER, mesure et non suppose. Le 2026-08-19 (tache
 * `d0e0df3b`, commit c951b25, queues Coolify 529 et 530), le journal des deux applications donne :
 *
 *   08:03:07.68  CMS   Rolling update started.
 *   08:03:46.41  SITE  [attendre-schema] schema PRET a la premiere passe (aucune attente).
 *   08:03:49.67  CMS   « healthy »              <- 3,2 s APRES le vert de la sonde du site
 *   08:03:49.95  CMS   Removing old containers.
 *   08:03:50.11  SITE  npm run build : Strapi a repondu 502 sur /api/articles?… : Bad Gateway
 *
 * La sonde de schema du site (`apps/web/scripts/attendre-schema.mjs`) a donc valide sur l ANCIEN
 * conteneur, encore route par le proxy. Sur un vrai changement de schema, elle validerait sur
 * l ancien et le build partirait : il casserait, ou PIRE il REUSSIRAIT sur l ancien schema, en
 * publiant un site perime sans aucun signal — le mode d echec ou succes et echec rendent la meme
 * sortie.
 *
 * AUCUNE SONDE NE PEUT FERMER CELA SEULE. Multiplier ses passes ne fait que multiplier les
 * mensonges tant que la reponse ne dit pas QUI l a produite : N passes vertes sur l ancien
 * conteneur restent N passes vertes sur l ancien conteneur. Il fallait que le CMS parle. C est
 * tout ce que fait ce fichier.
 *
 * D OU VIENT LA VALEUR. `SOURCE_COMMIT` est injectee par Coolify dans le conteneur applicatif —
 * verifie le 2026-08-19 par lecture de `/proc/1/environ` du conteneur `echo-strapi` : sa valeur
 * est le SHA reel, identique a l etiquette de l image. Aucun reglage n a ete touche pour cela ;
 * elle est deja la. ⚠️ COTE SITE elle est ABSENTE — le reglage Coolify
 * `include_source_commit_in_build` vaut `false` sur les trois applications, et le build ne peut
 * pas la deduire de git (Coolify efface `.git` avant de construire). C est pourquoi la sonde ne
 * fait aujourd hui que LIRE et JOURNALISER cet en-tete : elle n a rien a quoi le comparer.
 *
 * ⚠️ CE QU IL NE FAIT PAS, ET C EST DELIBERE — a ne pas « completer » plus tard. Il n interdit
 * rien, ne compare rien, ne juge rien. Les deux applications ne portent le meme SHA que sur un
 * push touchant LES DEUX arbres : `watch_paths` ne reveille le CMS que sur `apps/cms/**` et le
 * site que sur `apps/web/**`, si bien que le CMS tourne couramment sur un commit plus recent que
 * le site. C est LEGITIME. Une garde d egalite stricte planterait donc sur tous les deploiements
 * ne touchant que le site — une incapacite transformee en panne
 * ([[garde-en-ferme-dans-un-build-transforme-l-incapacite-en-panne]]).
 *
 * POURQUOI L ABSENCE PLUTOT QU UN EN-TETE VIDE, quand la variable manque (developpement local).
 * Deux conteneurs qui ignorent tous deux leur version rendraient le MEME `X-Echo-Commit: `, et
 * n importe quelle comparaison les declarerait EGAUX : on aurait fabrique un vert a partir de
 * deux ignorances, exactement le mensonge que ce middleware existe pour supprimer. Une empreinte
 * ABSENTE ne se lit que d une facon — « je ne sais pas » — et c est la lecture juste.
 *
 * POURQUOI UNE BORNE SUR LA FORME. `ctx.set` delegue a `res.setHeader`, qui LEVE
 * (`ERR_INVALID_CHAR`) sur un retour a la ligne ou un caractere hors latin-1. Une exception levee
 * ici, dans la chaine globale, rendrait 500 sur CHAQUE requete de l instance — y compris celles
 * qui n ont rien a voir avec un deploiement. Une variable illisible est une incapacite ; elle ne
 * doit jamais devenir une panne. Ecarter la valeur nous ramene au cas « je ne sais pas », qui est
 * deja gere.
 *
 * POURQUOI IL EST DECLARE TOT — juste apres `strapi::errors`, et pas en fin de chaine comme
 * `global::statut-publie`. L en-tete est pose AVANT `next()` : c est la seule facon qu une reponse
 * d ERREUR le porte. Or la reponse qui interesse le plus est precisement une erreur — le
 * `400 ValidationError « Invalid key … »` de l ancien schema. Un middleware qui poserait
 * l en-tete apres `next()` le manquerait sur la seule reponse qui compte.
 */
export const NOM_GLOBAL = 'global::empreinte-commit';

/**
 * LE NOM DE L EN-TETE. Le depot n avait aucun en-tete de reponse personnalise avant celui-ci
 * (releve le 2026-08-19 : `apps/web/scripts/verifier-en-tetes.mjs` ne connait que des en-tetes
 * NORMALISES de securite) — il n y avait donc aucune convention a suivre, et celle-ci est posee
 * ici : prefixe du projet, objet designe, sans abreviation.
 */
export const EN_TETE_EMPREINTE = 'X-Echo-Commit';

/** La variable que Coolify injecte dans le conteneur applicatif. */
export const VARIABLE_EMPREINTE = 'SOURCE_COMMIT';

/**
 * CE QU UNE EMPREINTE PEUT ETRE — volontairement plus large qu un SHA, et bornee.
 *
 * Plus large : rien ne garantit que Coolify n y mettra jamais une etiquette (`v1.2.3-rc.1`), et
 * une sonde qui ne saurait lire que 40 hexa se tairait sur une valeur parfaitement utilisable.
 * Bornee : la longueur ferme la classe entiere des valeurs aberrantes sans avoir a les enumerer
 * ([[classer-plutot-qu-enumerer-les-cas]]), et le jeu de caracteres est un sous-ensemble strict
 * de ce que `res.setHeader` accepte — donc aucune valeur retenue ne peut lever.
 */
export const MOTIF_EMPREINTE = /^[0-9A-Za-z._-]{1,128}$/;

/**
 * L empreinte, ou `null` quand il n y en a pas d utilisable.
 *
 * `null` recouvre TROIS situations volontairement confondues — variable absente, vide, illisible
 * — parce qu elles disent toutes la meme chose au lecteur : ce conteneur ne sait pas dire quelle
 * version il sert. Les distinguer dans l en-tete reviendrait a publier trois nuances d ignorance,
 * dont aucune ne se compare a quoi que ce soit.
 */
export function empreinteLisible(brut: unknown): string | null {
  if (typeof brut !== 'string') return null;
  const propre = brut.trim();
  return MOTIF_EMPREINTE.test(propre) ? propre : null;
}

/**
 * La valeur est lue A CHAQUE REQUETE, pas une fois au chargement du module.
 *
 * Elle est pourtant fixe pour la vie du conteneur : la lecture ne coute rien et achete deux
 * choses. D abord elle rend le middleware exercable sans recharger le module — un test qui doit
 * ruser avec le cache d imports pour couvrir le cas « variable absente » finit par ne plus le
 * couvrir. Ensuite elle ne fige pas un `undefined` capture avant que l environnement ne soit
 * completement materialise, ce dont rien dans l ordre de chargement de Strapi ne nous protege.
 */
export default () =>
  async (ctx: any, next: () => any) => {
    const empreinte = empreinteLisible(process.env[VARIABLE_EMPREINTE]);
    if (empreinte !== null) ctx.set(EN_TETE_EMPREINTE, empreinte);
    return next();
  };
