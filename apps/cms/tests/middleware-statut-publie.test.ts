/**
 * LE ROLE PUBLIC NE LIT QUE DU PUBLIE — et c'est le CODE qui le tient, plus une
 * case a cocher dans l'admin.
 *
 * CE QUE CE TEST GARDE. Le 2026-08-10, `/api/articles?status=draft` repondait
 * `200` sans aucun jeton : un article jamais publie etait rendu, titre et corps
 * compris, a un appelant anonyme. La fermeture posee ce jour-la est un REGLAGE
 * d'instance (les 11 `find`/`findOne` du role Public decoches), c'est-a-dire
 * exactement ce qu'un clic reouvre. L'arbitrage D-4 (decision `7106948b`,
 * branche A) tranche : le §3.9 du cahier — role Public en lecture — est REMIS
 * EN PLACE, et la fuite se ferme par du code. Ce fichier est ce code juge.
 *
 * POURQUOI L'EN-TETE `Authorization` ET PAS `ctx.state.auth`. L'authentification
 * de Strapi ne tourne PAS dans la chaine globale : elle est composee dans le
 * gestionnaire de ROUTE (`services/server/compose-endpoint.js`,
 * `createAuthenticateMiddleware`), donc APRES tout ce que
 * `config/middlewares.ts` enumere. Un middleware global qui lirait
 * `ctx.state.auth` le trouverait vide pour TOUS les appelants — y compris le
 * jeton de build et l'application d'apercu — et leur retirerait les brouillons
 * qu'ils ont le droit de lire. Le critere est donc la presence d'une CREDENCE
 * dans la requete, lue comme Strapi la lit.
 *
 * LA PREUVE EN CASSANT VIT DANS CE FICHIER. Le dernier test compose la chaine
 * globale DEPUIS `config/middlewares.ts` : retirer l'entree du fichier de
 * configuration fait rougir le lot, et le meme contexte passe dans une chaine
 * privee de l'entree conserve `draft` — c'est le temoin.
 * Cf. `[[un-controle-se-prouve-en-cassant-ce-qu-il-protege]]`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import qs from 'qs';

import configMiddlewares from '../config/middlewares.ts';
import statutPublie, {
  NOM_GLOBAL,
  PARAMETRE_STATUT,
  STATUT_IMPOSE,
  estAppelantSansCredence,
} from '../src/middlewares/statut-publie.ts';
import empreinteCommit, {
  NOM_GLOBAL as NOM_EMPREINTE,
} from '../src/middlewares/empreinte-commit.ts';

/* ------------------------------------------------------------------ */
/* Un contexte Koa fidele sur sa seule part utile : la query.           */
/* ------------------------------------------------------------------ */

/**
 * `ctx.query` de Strapi n'est pas le `ctx.query` de Koa : le middleware
 * `strapi::query` REDEFINIT l'accesseur sur `app.request` (qs, cache par
 * querystring, `strictNullHandling`, `depth: 20`). Le faux contexte reproduit
 * cette semantique-la, avec le VRAI `qs` — un faux plus simple (objet nu)
 * rendrait vert un middleware qui muterait une copie jetee au premier acces
 * suivant, c'est-a-dire le mode d'echec qu'on cherche precisement a exclure.
 */
const REGLAGES_QS = { strictNullHandling: true, arrayLimit: 100, depth: 20 } as const;

function creerContexte({
  chemin = '/api/articles',
  querystring = '',
  entetes = {} as Record<string, string>,
  state = {} as Record<string, unknown>,
} = {}) {
  const request: any = {
    path: chemin,
    querystring,
    header: entetes,
    headers: entetes,
    _cache: {} as Record<string, any>,
    get query() {
      if (!this._cache[this.querystring]) {
        this._cache[this.querystring] = qs.parse(this.querystring, REGLAGES_QS);
      }
      return this._cache[this.querystring];
    },
    set query(objet: any) {
      this.querystring = qs.stringify(objet);
    },
  };

  const ctx: any = {
    request,
    state,
    method: 'GET',
    /* La chaine globale porte desormais `global::empreinte-commit`, qui pose un en-tete de
       reponse. Ce contexte n'a jamais eu a en rendre compte — il n'est fidele que sur la query —
       mais il doit au moins accepter le geste, sinon c'est le FAUX qui casse la chaine, pas le
       code juge. */
    entetes: {} as Record<string, string>,
    set(nom: string, valeur: string) {
      this.entetes[String(nom).toLowerCase()] = String(valeur);
    },
    get path() {
      return request.path;
    },
    get querystring() {
      return request.querystring;
    },
    get query() {
      return request.query;
    },
    set query(objet: any) {
      request.query = objet;
    },
  };
  return ctx;
}

/** Le middleware tel que Strapi l'instancie : `(config, { strapi }) => fn`. */
const middleware = statutPublie({}, { strapi: {} as any });

/** Lance le middleware et rend le nombre d'appels a `next`. */
async function passer(ctx: any, fn = middleware) {
  let suites = 0;
  await fn(ctx, async () => {
    suites += 1;
  });
  return suites;
}

const JETON = 'Bearer 7d2c1f0a9b8e4d3c2a1f0e9d8c7b6a5f';

/* ------------------------------------------------------------------ */
/* 1. L'appelant sans credence — le role Public, et lui seul            */
/* ------------------------------------------------------------------ */

test('appelant public qui demande ?status=draft : le statut est force a published', async () => {
  const ctx = creerContexte({ querystring: 'status=draft' });

  const suites = await passer(ctx);

  assert.equal(ctx.query[PARAMETRE_STATUT], STATUT_IMPOSE);
  assert.equal(suites, 1, 'la requete doit continuer sa route');
});

test('appelant public sans parametre : le statut est POSE, pas seulement corrige', async () => {
  const ctx = creerContexte({ querystring: '' });

  await passer(ctx);

  assert.equal(ctx.query[PARAMETRE_STATUT], STATUT_IMPOSE);
});

test('appelant public : `?status[]=draft` en tableau est ecrase lui aussi', async () => {
  // Un parametre repete ou indice est parse en TABLEAU par qs : un middleware
  // qui ne testerait que l'egalite a la chaine « draft » le laisserait passer.
  const ctx = creerContexte({ querystring: 'status[0]=draft&status[1]=published' });

  await passer(ctx);

  assert.equal(ctx.query[PARAMETRE_STATUT], STATUT_IMPOSE);
});

test('appelant public : les autres parametres sont intacts, filtres imbriques compris', async () => {
  const ctx = creerContexte({
    querystring:
      'status=draft&locale=fr&sort=publishedAt:desc&pagination[pageSize]=12' +
      '&filters[categorie][slug][$eq]=vie-locale&populate[couverture][fields][0]=url',
  });

  await passer(ctx);

  assert.equal(ctx.query[PARAMETRE_STATUT], STATUT_IMPOSE);
  assert.equal(ctx.query.locale, 'fr');
  assert.equal(ctx.query.sort, 'publishedAt:desc');
  assert.equal(ctx.query.pagination.pageSize, '12');
  assert.equal(ctx.query.filters.categorie.slug.$eq, 'vie-locale');
  assert.equal(ctx.query.populate.couverture.fields[0], 'url');
});

test('appelant public : `Bearer` vide vaut ABSENCE de credence — le piege du 2026-08-04', async () => {
  // Une variable d'environnement absente donne l'en-tete « Bearer » nu. Strapi
  // le refuse (`parts.length !== 2` dans les deux strategies) et sert alors le
  // role Public : c'est donc bien un appelant public, et le forcage doit
  // s'appliquer. Le traiter comme authentifie rouvrirait la fuite a qui
  // enverrait un en-tete vide.
  const ctx = creerContexte({ querystring: 'status=draft', entetes: { authorization: 'Bearer ' } });

  await passer(ctx);

  assert.equal(ctx.query[PARAMETRE_STATUT], STATUT_IMPOSE);
});

test('appelant public : un en-tete qui n est pas un Bearer a deux parties reste public', async () => {
  for (const entete of ['Basic abcdef', 'Bearer a b', 'jeton-sans-schema']) {
    const ctx = creerContexte({ querystring: 'status=draft', entetes: { authorization: entete } });
    await passer(ctx);
    assert.equal(ctx.query[PARAMETRE_STATUT], STATUT_IMPOSE, `en-tete : ${entete}`);
  }
});

/* ------------------------------------------------------------------ */
/* 2. Ce qui ne doit RIEN perdre — jeton de build et apercu             */
/* ------------------------------------------------------------------ */

test('appelant porteur d un jeton : `?status=draft` est CONSERVE', async () => {
  // L'apercu des brouillons (brief §7.4 (b)) lit avec un jeton autorise. Si ce
  // middleware lui retirait `draft`, il fermerait un livrable du perimetre au
  // lieu de fermer une fuite.
  const ctx = creerContexte({ querystring: 'status=draft', entetes: { authorization: JETON } });

  const suites = await passer(ctx);

  assert.equal(ctx.query[PARAMETRE_STATUT], 'draft');
  assert.equal(suites, 1);
});

test('appelant deja resolu par Strapi (ctx.state.user) : rien n est touche', async () => {
  const ctx = creerContexte({ querystring: 'status=draft', state: { user: { id: 1 } } });

  await passer(ctx);

  assert.equal(ctx.query[PARAMETRE_STATUT], 'draft');
});

test('appelant deja resolu par jeton (ctx.state.auth.credentials) : rien n est touche', async () => {
  const ctx = creerContexte({
    querystring: 'status=draft',
    state: { auth: { strategy: { name: 'api-token' }, credentials: { id: 3 } } },
  });

  await passer(ctx);

  assert.equal(ctx.query[PARAMETRE_STATUT], 'draft');
});

/* ------------------------------------------------------------------ */
/* 3. La portee : les routes de contenu, et elles seules                */
/* ------------------------------------------------------------------ */

test('hors des routes de contenu, la query n est pas touchee', async () => {
  for (const chemin of ['/admin/content-manager/collection-types/api::article.article', '/uploads/couverture.avif', '/']) {
    const ctx = creerContexte({ chemin, querystring: 'status=draft' });
    const suites = await passer(ctx);
    assert.equal(ctx.query[PARAMETRE_STATUT], 'draft', `chemin : ${chemin}`);
    assert.equal(suites, 1, `chemin : ${chemin}`);
  }
});

test('toutes les routes /api/ sont couvertes, pas seulement celles qu on a en tete', async () => {
  for (const chemin of ['/api/articles', '/api/articles/mon-slug', '/api/configuration', '/api/upload/files']) {
    const ctx = creerContexte({ chemin, querystring: 'status=draft' });
    await passer(ctx);
    assert.equal(ctx.query[PARAMETRE_STATUT], STATUT_IMPOSE, `chemin : ${chemin}`);
  }
});

test('estAppelantSansCredence lit l en-tete comme Strapi le lit', () => {
  assert.equal(estAppelantSansCredence(creerContexte({})), true);
  assert.equal(estAppelantSansCredence(creerContexte({ entetes: { authorization: JETON } })), false);
  assert.equal(estAppelantSansCredence(creerContexte({ entetes: { authorization: 'Bearer' } })), true);
  assert.equal(
    estAppelantSansCredence(creerContexte({ state: { auth: { credentials: { id: 1 } } } })),
    false,
  );
});

/* ------------------------------------------------------------------ */
/* 4. Le cablage — et la preuve en cassant                              */
/* ------------------------------------------------------------------ */

test('config/middlewares.ts branche le middleware, apres strapi::query', () => {
  const noms = configMiddlewares.map((entree: any) =>
    typeof entree === 'string' ? entree : entree.name,
  );

  const rang = noms.indexOf(NOM_GLOBAL);
  assert.notEqual(rang, -1, `${NOM_GLOBAL} doit etre branche dans config/middlewares.ts`);
  assert.ok(
    rang > noms.indexOf('strapi::query'),
    'il doit venir APRES strapi::query, qui pose l accesseur qs sur ctx.query',
  );
});

test('PREUVE EN CASSANT : la chaine du fichier de configuration force le statut, celle sans l entree ne le force pas', async () => {
  /* Le registre des middlewares globaux de ce depot. Un `global::` inconnu doit
     faire ROUGIR : le tolerer laisserait un renommage vider la chaine en
     silence, et le test resterait vert sur une chaine qui ne protege rien. */
  /* AMENDE LE 2026-08-19 : la chaine globale compte un SECOND middleware,
     `global::empreinte-commit` (le conteneur dit quel commit il sert). Ce registre a ROUGI des sa
     declaration, et c'est exactement ce qu'on lui demande — il refuse de composer une chaine
     qu'il ne connait pas plutot que de la vider en silence. On l'inscrit donc ici avec son VRAI
     module : le remplacer par un bouchon rendrait le temoin ci-dessous vert quoi qu'il arrive a
     la chaine reelle. */
  const REGISTRE: Record<string, any> = {
    [NOM_GLOBAL]: statutPublie,
    [NOM_EMPREINTE]: empreinteCommit,
  };

  const chaine = (entrees: any[]) => {
    const fns = entrees
      .map((entree) => (typeof entree === 'string' ? entree : entree.name))
      .filter((nom: string) => nom.startsWith('global::'))
      .map((nom: string) => {
        const fabrique = REGISTRE[nom];
        assert.ok(fabrique, `middleware global inconnu du test : ${nom}`);
        return fabrique({}, { strapi: {} as any });
      });

    return async (ctx: any) => {
      let suites = 0;
      const suivant = async (i: number): Promise<void> => {
        if (i === fns.length) {
          suites += 1;
          return;
        }
        await fns[i](ctx, () => suivant(i + 1));
      };
      await suivant(0);
      return suites;
    };
  };

  const avec = creerContexte({ querystring: 'status=draft' });
  assert.equal(await chaine(configMiddlewares as any[])(avec), 1);
  assert.equal(
    avec.query[PARAMETRE_STATUT],
    STATUT_IMPOSE,
    'la chaine telle que config/middlewares.ts la declare doit fermer la fuite',
  );

  /* LE TEMOIN. La meme chaine privee de l entree laisse passer `draft` : ce qui
     protege est bien le middleware branche, pas le contexte de ce test. */
  const sans = creerContexte({ querystring: 'status=draft' });
  const amputee = (configMiddlewares as any[]).filter(
    (entree) => (typeof entree === 'string' ? entree : entree.name) !== NOM_GLOBAL,
  );
  await chaine(amputee)(sans);
  assert.equal(sans.query[PARAMETRE_STATUT], 'draft');
});
