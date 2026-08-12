/**
 * LE ROLE PUBLIC NE LIT QUE DU PUBLIE — tenu par du code, plus par une case a
 * cocher.
 *
 * LE DEFAUT QUE CE FICHIER FERME. Mesure le 2026-08-10 sur
 * `https://echoback.ayfiweb.fr` : `/api/articles?status=draft` repondait `200`
 * SANS AUCUN JETON. Un article cree en brouillon et jamais publie etait rendu,
 * titre et corps compris, a un appelant anonyme. La permission `find` du role
 * Public emporte `?status=draft` : Strapi n'offre AUCUNE granularite entre
 * « lire le publie » et « lire les brouillons ». Le geste de fermeture pose ce
 * jour-la — decocher les 11 `find`/`findOne` du role Public — est un REGLAGE
 * d'instance, c'est-a-dire ce qu'un clic dans l'admin reouvre, sans trace et
 * sans test.
 *
 * L'ARBITRAGE. Decision `7106948b`, branche A : le §3.9 du cahier — role Public
 * en lecture — est REMIS EN PLACE, et la fuite se ferme par du code. Ce
 * middleware est ce code. Il impose `status=published` a tout appelant qui ne
 * porte AUCUNE credence, quel que soit le parametre recu ; le role Public peut
 * alors etre rouvert en lecture sans rouvrir la fuite.
 *
 * POURQUOI L'EN-TETE ET PAS `ctx.state.auth` — le point le plus facile a rater.
 * L'authentification de Strapi ne tourne PAS dans la chaine globale : elle est
 * composee dans le gestionnaire de ROUTE
 * (`@strapi/core`, `services/server/compose-endpoint.js` —
 * `createAuthenticateMiddleware` precede l'action, et tout cela s'execute APRES
 * les middlewares de `config/middlewares.ts`). Un middleware global qui lirait
 * `ctx.state.auth` le trouverait VIDE pour tous les appelants, jeton de build et
 * application d'apercu compris : il leur retirerait les brouillons qu'ils ont le
 * droit de lire, et fermerait un livrable du perimetre (brief §7.4 (b)) en
 * croyant fermer une fuite. Le critere retenu est donc la presence d'une
 * CREDENCE dans la requete.
 *
 * LA CREDENCE SE LIT COMME STRAPI LA LIT, ET AU MEME ENDROIT. Les deux
 * strategies du contenu ne connaissent qu'une source, l'en-tete
 * `Authorization`, et exigent la meme forme :
 *   - jeton d'API — `@strapi/admin`, `server/src/strategies/api-token-utils.js` :
 *     `parts[0].toLowerCase() !== 'bearer' || parts.length !== 2` → aucun jeton ;
 *   - utilisateur — `@strapi/plugin-users-permissions`, `server/services/jwt.js` :
 *     meme decoupage, meme exigence.
 * Tout ce qui n'est pas un `Bearer <jeton>` a deux parties non vides retombe
 * donc sur le role Public — y compris l'en-tete « Bearer » NU, celui que produit
 * une variable d'environnement absente (piege mesure le 2026-08-04). C'est
 * pourquoi il compte ici comme une absence de credence, et non comme un
 * appelant authentifie.
 *
 * LE SENS DE LA DIVERGENCE, SI STRAPI CHANGE SA REGLE. Cette lecture est un
 * MIROIR, et un miroir peut deriver. Elle est ecrite pour que la derive coute
 * une fonction, jamais une fuite : si Strapi acceptait un jour une autre forme
 * de credence, ce middleware la classerait « sans credence » et imposerait
 * `published` a un appelant qui avait le droit de lire des brouillons — visible
 * immediatement, et sans rien exposer. L'erreur inverse serait silencieuse.
 *
 * CE QU'IL NE FAIT PAS. Il ne remplace pas les permissions : l'ECRITURE du role
 * Public reste fermee cote instance, comme depuis toujours. Il ne dit rien des
 * fichiers servis sous `/uploads/…`, publics par construction. Et il ne juge
 * rien — c'est `apps/web/scripts/verifier-surface-publique.mjs` qui mesure
 * l'instance et rend le verdict.
 */
export const NOM_GLOBAL = 'global::statut-publie';

/** Le parametre de Strapi 5 qui choisit brouillon ou publie. */
export const PARAMETRE_STATUT = 'status';

/** La seule valeur qu'un appelant sans credence peut obtenir. */
export const STATUT_IMPOSE = 'published';

/** Le prefixe des routes de contenu. L'admin a le sien, et il n'est pas ici. */
const PREFIXE_CONTENU = '/api/';

/**
 * L'appelant ne porte-t-il AUCUNE credence — donc le role Public, et lui seul ?
 *
 * Les deux premieres branches sont un filet : si ce middleware etait un jour
 * monte APRES l'authentification (middleware de route), l'etat resolu ferait
 * foi et vaudrait mieux qu'une relecture de l'en-tete.
 */
export function estAppelantSansCredence(ctx: any): boolean {
  if (ctx?.state?.user) return false;
  if (ctx?.state?.auth?.credentials) return false;

  const entete = ctx?.request?.header?.authorization ?? ctx?.request?.headers?.authorization;
  if (typeof entete !== 'string') return true;

  const parties = entete.trim().split(/\s+/);
  const porteUnJeton =
    parties.length === 2 && parties[0].toLowerCase() === 'bearer' && parties[1] !== '';

  return !porteUnJeton;
}

/** La requete vise-t-elle une route de contenu ? */
export function estRouteDeContenu(chemin: unknown): boolean {
  return typeof chemin === 'string' && chemin.startsWith(PREFIXE_CONTENU);
}

/**
 * Impose le statut sur la query DEJA PARSEE.
 *
 * `strapi::query` redefinit l'accesseur `query` de Koa (`@strapi/core`,
 * `middlewares/query.js`) : il rend un objet `qs` MIS EN CACHE par querystring,
 * donc stable d'un acces a l'autre. Ecrire dans cet objet suffit, et c'est le
 * chemin le plus sur : il ne re-encode aucun autre parametre — un
 * `qs.stringify` de tout l'objet re-ecrirait chaque filtre imbrique pour ne
 * changer qu'un mot.
 *
 * `ctx.querystring` conserve donc le TEXTE de l'appelant : c'est voulu, et c'est
 * sans effet — Strapi lit `ctx.query`, jamais la chaine brute, pour construire
 * ses parametres de document. Le repli ci-dessous existe pour un contexte dont
 * l'accesseur ne mettrait rien en cache : la valeur ecrite serait alors perdue,
 * et il vaut mieux payer une re-ecriture complete que ne rien fermer.
 */
export function imposerStatut(ctx: any): void {
  const query = ctx?.query;
  if (query && typeof query === 'object') {
    query[PARAMETRE_STATUT] = STATUT_IMPOSE;
  }

  if (ctx?.query?.[PARAMETRE_STATUT] === STATUT_IMPOSE) return;

  ctx.request.query = { ...(query ?? {}), [PARAMETRE_STATUT]: STATUT_IMPOSE };
}

export default () =>
  async (ctx: any, next: () => any) => {
    if (estRouteDeContenu(ctx?.path ?? ctx?.request?.path) && estAppelantSansCredence(ctx)) {
      imposerStatut(ctx);
    }
    return next();
  };
