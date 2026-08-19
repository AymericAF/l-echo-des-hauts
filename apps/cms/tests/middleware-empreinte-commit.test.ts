/**
 * LE CMS DIT QUELLE VERSION IL SERT — sans quoi un `200` ne prouve rien.
 *
 * LE DEFAUT QUE CE LOT FERME, mesure et non suppose. Le 2026-08-19 (tache `d0e0df3b`, commit
 * c951b25, queues 529 et 530), la sonde de schema du site — `apps/web/scripts/attendre-schema.mjs`
 * — a rendu « schema PRET a la premiere passe » a 08:03:46.41, alors que le conteneur CMS NEUF
 * n est devenu sain qu a 08:03:49.67. Elle a donc necessairement interroge l ANCIEN, encore route
 * par le proxy. Sur un vrai changement de schema, elle validerait sur l ancien et le build
 * partirait : il casserait, ou PIRE il reussirait sur l ANCIEN schema en produisant un site
 * perime, sans aucun signal.
 *
 * Aucune sonde ne peut fermer cela toute seule : multiplier les passes ne fait que multiplier les
 * mensonges tant que la reponse ne DIT PAS quelle version l a produite. Ce middleware est ce que
 * le CMS doit dire.
 *
 * ⚠️ CE QU IL NE FAIT PAS, ET C EST DELIBERE. Il n interdit rien, il ne compare rien, il ne juge
 * rien. Les deux applications ne portent le meme SHA que sur un push touchant LES DEUX arbres —
 * constate le 2026-08-19, le CMS a tourne sur deux commits successifs pendant que le site restait
 * sur le sien, et c est LEGITIME. Une garde d egalite stricte planterait donc sur tous les
 * deploiements ne touchant que le site
 * ([[garde-en-ferme-dans-un-build-transforme-l-incapacite-en-panne]]).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import configMiddlewares from '../config/middlewares.ts';
import empreinteCommit, {
  EN_TETE_EMPREINTE,
  NOM_GLOBAL,
  empreinteLisible,
} from '../src/middlewares/empreinte-commit.ts';
import statutPublie, {
  NOM_GLOBAL as NOM_STATUT_PUBLIE,
} from '../src/middlewares/statut-publie.ts';

/* ------------------------------------------------------------------ */
/* Un contexte Koa fidele sur sa seule part utile : `ctx.set`.          */
/* ------------------------------------------------------------------ */

/**
 * `ctx.set` de Koa delegue a `res.setHeader` de Node, qui REFUSE certaines valeurs :
 * `checkInvalidHeaderChar` n accepte que `[\t\x20-\x7e\x80-\xff]`. Une valeur portant un
 * retour a la ligne ou un caractere hors latin-1 leve `ERR_INVALID_CHAR` — et une exception
 * levee dans la chaine globale rendrait 500 sur CHAQUE requete de l instance.
 *
 * Le faux le reproduit A L IDENTIQUE : un faux plus permissif (un simple objet) rendrait vert
 * un middleware qui transforme une incapacite — « je n ai pas de SHA lisible » — en panne
 * totale du CMS, c est-a-dire le mode d echec le plus cher du lot.
 */
const CARACTERES_ACCEPTES = /^[\t\x20-\x7e\x80-\xff]*$/;

function creerContexte({ chemin = '/api/articles' } = {}) {
  const entetes: Record<string, string> = {};
  const ctx: any = {
    path: chemin,
    method: 'GET',
    status: 200,
    request: { path: chemin, header: {}, headers: {} },
    state: {},
    entetes,
    set(nom: string, valeur: string) {
      if (!CARACTERES_ACCEPTES.test(String(valeur))) {
        const erreur: any = new Error(`Invalid character in header content ["${nom}"]`);
        erreur.code = 'ERR_INVALID_CHAR';
        throw erreur;
      }
      entetes[nom.toLowerCase()] = String(valeur);
    },
  };
  return ctx;
}

/** Le middleware tel que Strapi l instancie : `(config, { strapi }) => fn`. */
const middleware = empreinteCommit({}, { strapi: {} as any });

/** Lance le middleware sous une valeur d environnement DONNEE, et restaure ensuite. */
async function sous(
  valeur: string | undefined,
  ctx: any = creerContexte(),
  fn: (ctx: any, next: () => any) => any = middleware,
  next: () => any = async () => {},
) {
  const avant = process.env.SOURCE_COMMIT;
  if (valeur === undefined) delete process.env.SOURCE_COMMIT;
  else process.env.SOURCE_COMMIT = valeur;
  try {
    await fn(ctx, next);
  } finally {
    if (avant === undefined) delete process.env.SOURCE_COMMIT;
    else process.env.SOURCE_COMMIT = avant;
  }
  return ctx;
}

const SHA = '38cf02318f8aac153fb44a5e7fb39ff1769360ee';

/* ------------------------------------------------------------------ */
/* 1. Le cas nominal : le conteneur DIT le commit qu il porte           */
/* ------------------------------------------------------------------ */

test('la reponse porte l empreinte du commit servi, et la requete continue sa route', async () => {
  let suites = 0;
  const ctx = await sous(SHA, creerContexte(), middleware, async () => {
    suites += 1;
  });

  assert.equal(ctx.entetes[EN_TETE_EMPREINTE.toLowerCase()], SHA);
  assert.equal(suites, 1, 'la requete doit continuer sa route');
});

test('l empreinte est posee AVANT `next` — un 400 la porte donc aussi', async () => {
  /* C EST LE CAS QUI COMPTE LE PLUS, et il est facile a rater. Le `400 ValidationError` de
     l ANCIEN schema (« Invalid key alternativePartage ») est EXACTEMENT la reponse dont il faut
     savoir qui l a produite. Un middleware qui poserait l en-tete APRES `next` la manquerait sur
     toute reponse d erreur — c est-a-dire sur la seule qui interesse. */
  let posee: string | undefined;
  const ctx = creerContexte();
  await sous(SHA, ctx, middleware, async () => {
    posee = ctx.entetes[EN_TETE_EMPREINTE.toLowerCase()];
    ctx.status = 400;
  });

  assert.equal(posee, SHA, 'l en-tete n etait pas encore pose quand la suite de la chaine a couru');
});

test('une exception en aval ne fait pas disparaitre l empreinte deja posee', async () => {
  const ctx = creerContexte();
  await assert.rejects(
    sous(SHA, ctx, middleware, async () => {
      throw new Error('ValidationError');
    }),
  );
  assert.equal(ctx.entetes[EN_TETE_EMPREINTE.toLowerCase()], SHA);
});

test('l empreinte ne depend pas de la route : le conteneur est le meme partout', async () => {
  for (const chemin of ['/api/articles', '/admin', '/uploads/photo.jpg', '/']) {
    const ctx = await sous(SHA, creerContexte({ chemin }));
    assert.equal(ctx.entetes[EN_TETE_EMPREINTE.toLowerCase()], SHA, chemin);
  }
});

/* ------------------------------------------------------------------ */
/* 2. LA VARIABLE ABSENTE — le silence, jamais un en-tete vide          */
/* ------------------------------------------------------------------ */

test('SOURCE_COMMIT absente (developpement local) : AUCUN en-tete, et aucun plantage', async () => {
  /* POURQUOI L ABSENCE ET PAS UNE CHAINE VIDE — le point de conception de tout le lot. Deux
     conteneurs qui ignorent l un et l autre leur version rendraient le MEME `X-Echo-Commit: `,
     et toute comparaison les declarerait EGAUX. On aurait fabrique un vert a partir de deux
     ignorances : precisement le mensonge que ce middleware existe pour supprimer. Une empreinte
     ABSENTE, elle, ne peut se lire que « je ne sais pas ». */
  let suites = 0;
  const ctx = await sous(undefined, creerContexte(), middleware, async () => {
    suites += 1;
  });

  assert.equal(
    Object.prototype.hasOwnProperty.call(ctx.entetes, EN_TETE_EMPREINTE.toLowerCase()),
    false,
    'un en-tete VIDE ment : il se compare a un autre en-tete vide et rend deux ignorances egales',
  );
  assert.equal(suites, 1, 'un CMS sans empreinte doit servir normalement, pas se bloquer');
});

test('SOURCE_COMMIT vide ou blanche : AUCUN en-tete non plus', async () => {
  for (const valeur of ['', '   ', '\t', '\n']) {
    const ctx = await sous(valeur);
    assert.equal(
      Object.prototype.hasOwnProperty.call(ctx.entetes, EN_TETE_EMPREINTE.toLowerCase()),
      false,
      `« ${JSON.stringify(valeur)} » n est pas une empreinte`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* 3. PREUVE EN CASSANT : une valeur illisible ne doit pas casser le CMS */
/* ------------------------------------------------------------------ */

test('PREUVE EN CASSANT : une valeur qu un en-tete HTTP refuse est ECARTEE, pas propagee', async () => {
  /* LE TEMOIN d abord : la valeur brute, passee telle quelle a `ctx.set`, leve — donc un
     middleware naif rendrait 500 sur CHAQUE requete de l instance, y compris celles qui n ont
     rien a voir avec un deploiement. Une incapacite (« ma variable est bizarre ») deviendrait
     une panne totale. */
  const empoisonnees = ['abc\ndef', 'sha\r\nX-Injecte: oui', 'fleche→', 'a'.repeat(200)];

  for (const valeur of empoisonnees) {
    const temoin = creerContexte();
    if (CARACTERES_ACCEPTES.test(valeur)) {
      /* Trop longue mais lisible : le temoin ne leve pas, c est la BORNE qui l ecarte. */
      assert.doesNotThrow(() => temoin.set(EN_TETE_EMPREINTE, valeur));
    } else {
      assert.throws(() => temoin.set(EN_TETE_EMPREINTE, valeur), { code: 'ERR_INVALID_CHAR' });
    }

    const ctx = await sous(valeur);
    assert.equal(
      Object.prototype.hasOwnProperty.call(ctx.entetes, EN_TETE_EMPREINTE.toLowerCase()),
      false,
      `« ${valeur.slice(0, 20)} » a ete propagee dans l en-tete`,
    );
  }
});

test('empreinteLisible accepte ce qu un SHA est, et refuse le reste', async () => {
  assert.equal(empreinteLisible(SHA), SHA);
  assert.equal(empreinteLisible(`  ${SHA}  `), SHA, 'les blancs de bord ne sont pas l empreinte');
  assert.equal(empreinteLisible('v1.2.3-rc.1'), 'v1.2.3-rc.1', 'une etiquette reste lisible');
  assert.equal(empreinteLisible(undefined), null);
  assert.equal(empreinteLisible(''), null);
  assert.equal(empreinteLisible('   '), null);
  assert.equal(empreinteLisible('a b'), null, 'une espace interne n appartient pas a un SHA');
  assert.equal(empreinteLisible('abc\ndef'), null);
  assert.equal(empreinteLisible(42), null, 'ce qui n est pas une chaine n est pas une empreinte');
});

/* ------------------------------------------------------------------ */
/* 4. Le cablage — et la preuve en cassant                              */
/* ------------------------------------------------------------------ */

test('config/middlewares.ts branche le middleware, DANS la portee de strapi::errors', () => {
  const noms = configMiddlewares.map((entree: any) =>
    typeof entree === 'string' ? entree : entree.name,
  );

  const rang = noms.indexOf(NOM_GLOBAL);
  assert.notEqual(rang, -1, `${NOM_GLOBAL} doit etre branche dans config/middlewares.ts`);
  assert.ok(
    rang > noms.indexOf('strapi::errors'),
    'il doit venir APRES strapi::errors : c est ce qui fait porter l empreinte aux reponses ' +
      'd ERREUR — le 400 de l ancien schema est justement celle qu il faut identifier.',
  );
});

test('PREUVE EN CASSANT : la chaine du fichier de configuration pose l empreinte, celle sans l entree ne la pose pas', async () => {
  /* Le registre des middlewares globaux de ce depot. Un `global::` inconnu doit faire ROUGIR :
     le tolerer laisserait un renommage vider la chaine en silence, et le test resterait vert
     sur une chaine qui ne dit plus rien. */
  const REGISTRE: Record<string, any> = {
    [NOM_GLOBAL]: empreinteCommit,
    [NOM_STATUT_PUBLIE]: statutPublie,
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
      const suivant = async (i: number): Promise<void> => {
        if (i === fns.length) return;
        await fns[i](ctx, () => suivant(i + 1));
      };
      await suivant(0);
    };
  };

  const avec = creerContexte();
  await sous(SHA, avec, chaine(configMiddlewares as any[]));
  assert.equal(
    avec.entetes[EN_TETE_EMPREINTE.toLowerCase()],
    SHA,
    'la chaine telle que config/middlewares.ts la declare doit dire la version servie',
  );

  /* LE TEMOIN. La meme chaine privee de l entree ne dit plus rien : ce qui parle est bien le
     middleware branche, pas le contexte de ce test. */
  const sans = creerContexte();
  const amputee = (configMiddlewares as any[]).filter(
    (entree) => (typeof entree === 'string' ? entree : entree.name) !== NOM_GLOBAL,
  );
  await sous(SHA, sans, chaine(amputee));
  assert.equal(
    Object.prototype.hasOwnProperty.call(sans.entetes, EN_TETE_EMPREINTE.toLowerCase()),
    false,
  );
});
