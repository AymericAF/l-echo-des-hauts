/**
 * L'ECLUSE DE PUBLICATION — le mecanisme qui remplace une consigne qui a
 * echoue TROIS fois sur trois (2026-08-07, 2026-08-10, 2026-08-12).
 *
 * Ce que le seed fait, et qu'aucune relecture ne change : il reecrit chaque
 * article avec `?status=published`, Strapi 5 republie le document meme quand
 * pas un octet ne change, et le webhook `publish_to_coolify` transforme chaque
 * republication en deploiement de production. 69 requetes pour un corpus
 * complet. La consigne « couper le webhook avant un seed » etait ecrite, elle
 * etait chiffree, elle etait a l'endroit ou passe celui qui seede — et elle a
 * ete oubliee trois fois sur trois.
 *
 * L'ecluse desarme le webhook a l'ouverture et le RESTAURE a la fermeture, sur
 * TOUS les chemins de sortie. Ce fichier exerce chacun de ces chemins, parce
 * que le piege est precisement la : un desarmement sans reharmement laisse la
 * publication MUETTE — plus aucune publication ne met jamais le site a jour —
 * et c'est un defaut PIRE que la rafale, parce qu'il est silencieux.
 *
 * Les cas 8 et 9 gardent autre chose : l'URL du webhook est un ETAT ARBITRE
 * (decision `fae6cd9c` branche A, retrait de `&force=false`). Or l'API admin
 * de Strapi REFUSE un PUT partiel — mesure le 2026-08-12 :
 *   PUT /admin/webhooks/1 {isEnabled:false} -> 400 ValidationError
 *   « name is a required field », « url is a required field »,
 *   « Url is not supported because it isn't reachable over the public internet »
 * Basculer l'activation exige donc de RETRANSMETTRE L'OBJET COMPLET, URL et
 * en-tete `Authorization` compris. Un mecanisme qui reconstruit mal cet objet
 * ecraserait en silence un arbitrage — d'ou l'empreinte verifiee apres chaque
 * ecriture.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { bacJetable, brancherLesBacs } from '../../../outils/bac-jetable.mjs';

/* Les bacs de ce fichier se referment : nettoyage dans `after()`, bac du cas fautif
   conservé avec sa raison. Cf. `outils/bac-jetable.mjs`. */
brancherLesBacs();

import {
  Ecluse,
  traverser,
  empreinte,
  ClientAdminHttp,
  NOM_WEBHOOK_PUBLICATION,
  type Webhook,
  type AdminStrapi,
} from '../scripts/seed/ecluse.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE_CMS = path.join(ICI, '..');

/* ------------------------------------------------------------------ */
/* Faux admin Strapi : l'objet complet, et le journal de ce qu'on ecrit */
/* ------------------------------------------------------------------ */

function webhookNominal(isEnabled: boolean): Webhook {
  return {
    id: 1,
    name: NOM_WEBHOOK_PUBLICATION,
    // L'URL ARBITREE : sans `&force=false`, cf. decision fae6cd9c branche A.
    url: 'http://82.25.116.173:8000/api/v1/deploy?uuid=mft3ounqrorfp4kix266q16q',
    headers: { Authorization: 'Bearer jeton-de-test-non-secret' },
    events: ['entry.publish', 'entry.unpublish'],
    isEnabled,
  };
}

class FauxAdmin implements AdminStrapi {
  webhooks: Webhook[];
  /** Chaque ecriture, dans l'ordre : ce qui a ete envoye. */
  ecritures: Webhook[] = [];
  /** Nombre d'ecritures a faire echouer avant d'en laisser passer une. */
  echouerLesNPremieresEcritures = 0;
  /** Echoue TOUTES les ecritures de reharmement. */
  echouerToujours = false;
  /** Simule une instance qui abime l'URL a l'ecriture (cas 8). */
  abimerUrlALEcriture = false;

  constructor(webhooks: Webhook[]) {
    this.webhooks = webhooks;
  }

  async listerWebhooks(): Promise<Webhook[]> {
    return this.webhooks.map((w) => ({ ...w, headers: { ...w.headers }, events: [...w.events] }));
  }

  async ecrireWebhook(w: Webhook): Promise<void> {
    this.ecritures.push({ ...w, headers: { ...w.headers }, events: [...w.events] });
    if (this.echouerToujours) throw new Error('PUT /admin/webhooks -> 502 (simule)');
    if (this.echouerLesNPremieresEcritures > 0) {
      this.echouerLesNPremieresEcritures -= 1;
      throw new Error('PUT /admin/webhooks -> 502 (simule)');
    }
    const i = this.webhooks.findIndex((x) => x.id === w.id);
    const pose = { ...w, headers: { ...w.headers }, events: [...w.events] };
    if (this.abimerUrlALEcriture) pose.url = pose.url + '&force=false';
    this.webhooks[i] = pose;
  }

  etat(): boolean {
    return this.webhooks.find((w) => w.name === NOM_WEBHOOK_PUBLICATION)!.isEnabled;
  }
}

function dossierJetable(): string {
  return bacJetable('ecluse');
}

function ecluseDeTest(admin: AdminStrapi, dossier: string) {
  const lignes: string[] = [];
  const ecluse = new Ecluse(admin, {
    cheminSentinelle: path.join(dossier, '.seed-ecluse.json'),
    journal: (l) => lignes.push(l),
  });
  return { ecluse, lignes, sentinelle: path.join(dossier, '.seed-ecluse.json') };
}

/* ================================================================== */
/* 1. Chemin nominal : desarme PENDANT, reharme APRES, prouve par relecture */
/* ================================================================== */

test('nominal : le webhook est desarme pendant le travail et reharme apres', async () => {
  const admin = new FauxAdmin([webhookNominal(true)]);
  const { ecluse, lignes, sentinelle } = ecluseDeTest(admin, dossierJetable());

  let etatPendant: boolean | null = null;
  await traverser(ecluse, async () => {
    etatPendant = admin.etat();
  });

  assert.equal(etatPendant, false, 'le webhook doit etre DESARME pendant le seed');
  assert.equal(admin.etat(), true, 'le webhook doit etre REHARME apres le seed');
  assert.equal(fs.existsSync(sentinelle), false, 'la sentinelle doit avoir ete retiree');
  assert.equal(admin.ecritures.length, 2, 'une ecriture pour desarmer, une pour reharmer');
  assert.ok(
    lignes.some((l) => /desarm/i.test(l)) && lignes.some((l) => /reharm|rearm/i.test(l)),
    'le journal doit dire les deux gestes'
  );
});

/* ================================================================== */
/* 2. LE PIEGE : un echec au milieu du seed reharme quand meme          */
/* ================================================================== */

test('echec au milieu du seed : le webhook est reharme quand meme, et l erreur remonte', async () => {
  const admin = new FauxAdmin([webhookNominal(true)]);
  const { ecluse, sentinelle } = ecluseDeTest(admin, dossierJetable());

  let etatPendant: boolean | null = null;
  await assert.rejects(
    () =>
      traverser(ecluse, async () => {
        etatPendant = admin.etat();
        throw new Error('panne simulee au milieu du seed');
      }),
    /panne simulee au milieu du seed/
  );

  assert.equal(etatPendant, false);
  assert.equal(admin.etat(), true, 'un seed qui plante ne doit PAS laisser la publication muette');
  assert.equal(fs.existsSync(sentinelle), false);
});

/* ================================================================== */
/* 3. Interruption (Ctrl-C) : meme exigence, prouvee en sous-processus  */
/* ================================================================== */

test('interruption par signal : le webhook est reharme avant que le processus ne sorte', async () => {
  const dossier = dossierJetable();
  const journal = path.join(dossier, 'journal.txt');
  const fixture = path.join(ICI, 'fixtures', 'ecluse-interruption.ts');

  const code = await new Promise<number>((resoudre) => {
    const fils = spawn(process.execPath, [fixture], {
      env: { ...process.env, ECLUSE_DOSSIER: dossier, ECLUSE_JOURNAL: journal },
      stdio: 'inherit',
    });
    fils.on('exit', (c) => resoudre(c ?? -1));
  });

  const dit = JSON.parse(fs.readFileSync(journal, 'utf8'));
  assert.equal(dit.etatPendant, false, 'desarme pendant');
  assert.equal(dit.etatApres, true, 'REHARME malgre le signal');
  assert.equal(dit.sentinelleRestante, false);
  assert.notEqual(dit.travailTermineNormalement, true, 'le travail devait etre interrompu');
  assert.notEqual(code, 0, 'une interruption ne se conclut pas par un succes');
  // Le chemin de sortie ne doit PAS etre `process.exit()`, qui coupe les
  // handles libuv encore ouverts (sockets keep-alive vers Strapi) et fait
  // AVORTER le processus sur Node 24 / Windows : 0xC0000409 = 3221226505,
  // « Assertion failed: !(handle->flags & UV_HANDLE_CLOSING) ». Le texte
  // disait alors la verite et le code de retour l'inverse — le defaut que
  // `tests/seed-code-sortie.test.ts` a deja fait payer a ce depot.
  assert.notEqual(code, 3221226505, "le processus a AVORTE au lieu de sortir : cf. process.exit()");
});

/* ================================================================== */
/* 4. Deja desarme avant : on RESTAURE, on n'ARME pas                   */
/* ================================================================== */

test('webhook deja desarme avant le seed : il est laisse desarme, et le journal le crie', async () => {
  const admin = new FauxAdmin([webhookNominal(false)]);
  const { ecluse, lignes } = ecluseDeTest(admin, dossierJetable());

  await traverser(ecluse, async () => {});

  assert.equal(admin.etat(), false, 'l ecluse RESTAURE l etat trouve, elle n arme pas d autorite');
  assert.equal(admin.ecritures.length, 0, 'rien a ecrire : aucune ecriture ne doit partir');
  assert.ok(
    lignes.some((l) => /muet|deja desarme/i.test(l)),
    'un webhook trouve desarme est une publication muette : il faut le dire'
  );
});

/* ================================================================== */
/* 5. Le reharmement est REESSAYE                                       */
/* ================================================================== */

test('reharmement : un echec transitoire est reessaye jusqu a la preuve', async () => {
  const admin = new FauxAdmin([webhookNominal(true)]);
  admin.echouerLesNPremieresEcritures = 0;
  const { ecluse, sentinelle } = ecluseDeTest(admin, dossierJetable());

  await ecluse.ouvrir();
  admin.echouerLesNPremieresEcritures = 2; // les deux premieres tentatives de reharmement
  const ok = await ecluse.fermer();

  assert.equal(ok, true, 'la 3e tentative doit aboutir');
  assert.equal(admin.etat(), true);
  assert.equal(fs.existsSync(sentinelle), false);
});

/* ================================================================== */
/* 6. Reharmement definitivement impossible : ca doit HURLER, pas passer */
/* ================================================================== */

test('reharmement impossible : fermer() rend false, la sentinelle RESTE, le journal hurle', async () => {
  const admin = new FauxAdmin([webhookNominal(true)]);
  const { ecluse, lignes, sentinelle } = ecluseDeTest(admin, dossierJetable());

  await ecluse.ouvrir();
  admin.echouerToujours = true;
  const ok = await ecluse.fermer();

  assert.equal(ok, false, 'un reharmement non prouve ne se rapporte JAMAIS comme un succes');
  assert.equal(admin.etat(), false);
  assert.equal(
    fs.existsSync(sentinelle),
    true,
    'la sentinelle reste : elle est ce qui permet au prochain run de rattraper'
  );
  assert.ok(
    lignes.some((l) => /PUBLICATION MUETTE/.test(l)),
    'le journal doit nommer la consequence, pas seulement l echec HTTP'
  );
});

/* ================================================================== */
/* 7. Sentinelle trouvee au demarrage : un run precedent est mort       */
/* ================================================================== */

test('sentinelle trouvee au demarrage : l ecluse rattrape le run mort avant de seeder', async () => {
  const dossier = dossierJetable();
  const sentinelle = path.join(dossier, '.seed-ecluse.json');
  // Un run precedent est mort SANS reharmer : webhook desarme + sentinelle sur le disque.
  fs.writeFileSync(
    sentinelle,
    JSON.stringify({
      nom: NOM_WEBHOOK_PUBLICATION,
      etatAvant: true,
      ouvertA: '2026-08-12T00:00:00.000Z',
    })
  );
  const admin = new FauxAdmin([webhookNominal(false)]);
  const { ecluse, lignes } = ecluseDeTest(admin, dossier);

  await ecluse.ouvrir();

  assert.ok(
    lignes.some((l) => /RATTRAPAGE/.test(l)),
    'le rattrapage doit etre annonce, pas silencieux'
  );
  // Rattrape a `true` (etat d'avant le run mort), puis re-desarme pour CE run.
  assert.equal(admin.etat(), false, 'ce run desarme a son tour');
  assert.equal(
    await ecluse.fermer(),
    true
  );
  assert.equal(admin.etat(), true, 'et rend l etat d avant le run mort');
});

/* ================================================================== */
/* 8. L'URL ARBITREE est gardee : une ecriture qui l'abime fait echouer  */
/* ================================================================== */

test('empreinte : si l ecriture abime l URL arbitree, l ecluse refuse de continuer', async () => {
  const admin = new FauxAdmin([webhookNominal(true)]);
  admin.abimerUrlALEcriture = true;
  const { ecluse } = ecluseDeTest(admin, dossierJetable());

  await assert.rejects(() => ecluse.ouvrir(), /empreinte|url/i);
});

test('empreinte : elle couvre l URL, les evenements et les en-tetes, pas isEnabled', () => {
  const a = webhookNominal(true);
  const b = webhookNominal(false);
  assert.equal(empreinte(a), empreinte(b), 'basculer isEnabled ne change pas l empreinte');

  assert.notEqual(empreinte(a), empreinte({ ...a, url: a.url + '&force=false' }));
  assert.notEqual(empreinte(a), empreinte({ ...a, events: ['entry.publish'] }));
  assert.notEqual(empreinte(a), empreinte({ ...a, headers: { Authorization: 'Bearer autre' } }));
});

/* ================================================================== */
/* 9. Le client HTTP envoie l'OBJET COMPLET (le PUT partiel rend 400)   */
/* ================================================================== */

test('ClientAdminHttp : le PUT porte l objet complet — un PUT partiel rend 400 sur l instance', async () => {
  const recu: any[] = [];
  const serveur = http.createServer((req, rep) => {
    let corps = '';
    req.on('data', (d) => (corps += d));
    req.on('end', () => {
      if (req.url === '/admin/login') {
        rep.writeHead(200, { 'Content-Type': 'application/json' });
        rep.end(JSON.stringify({ data: { token: 'jeton-admin-de-test' } }));
        return;
      }
      if (req.method === 'GET' && req.url === '/admin/webhooks') {
        rep.writeHead(200, { 'Content-Type': 'application/json' });
        rep.end(JSON.stringify({ data: [webhookNominal(true)] }));
        return;
      }
      if (req.method === 'PUT') {
        recu.push({ url: req.url, entetes: req.headers, corps: JSON.parse(corps) });
        // L'instance REFUSE un corps partiel : on reproduit sa validation.
        const c = JSON.parse(corps);
        for (const champ of ['name', 'url', 'headers', 'events', 'isEnabled']) {
          if (c[champ] === undefined) {
            rep.writeHead(400, { 'Content-Type': 'application/json' });
            rep.end(
              JSON.stringify({
                error: { status: 400, name: 'ValidationError', message: `${champ} is a required field` },
              })
            );
            return;
          }
        }
        rep.writeHead(200, { 'Content-Type': 'application/json' });
        rep.end(JSON.stringify({ data: c }));
        return;
      }
      rep.writeHead(404);
      rep.end();
    });
  });
  await new Promise<void>((r) => serveur.listen(0, '127.0.0.1', () => r()));
  const port = (serveur.address() as any).port;

  try {
    const client = new ClientAdminHttp(`http://127.0.0.1:${port}`, 'admin@test', 'motdepasse');
    const [w] = await client.listerWebhooks();
    await client.ecrireWebhook({ ...w, isEnabled: false });

    assert.equal(recu.length, 1);
    assert.equal(recu[0].url, '/admin/webhooks/1');
    assert.ok(recu[0].entetes.authorization?.startsWith('Bearer '), 'jeton admin porte en en-tete');
    for (const champ of ['name', 'url', 'headers', 'events', 'isEnabled']) {
      assert.ok(recu[0].corps[champ] !== undefined, `le PUT doit porter ${champ}`);
    }
    assert.equal(
      recu[0].corps.url,
      'http://82.25.116.173:8000/api/v1/deploy?uuid=mft3ounqrorfp4kix266q16q',
      'l URL arbitree est retransmise TELLE QUELLE'
    );
    assert.equal(recu[0].corps.isEnabled, false);
  } finally {
    await new Promise<void>((r) => serveur.close(() => r()));
  }
});

/* ================================================================== */
/* 10. UN SEUL /admin/login : le reharmement ne doit dependre d'aucune  */
/*     requete limitee en debit.                                        */
/*                                                                      */
/* Constate sur l'instance le 2026-08-12 : `POST /admin/login` rend 429  */
/* apres quelques ouvertures rapprochees. Une ecluse qui se              */
/* reconnecterait pour FERMER pourrait donc se voir refuser le droit de  */
/* reharmer — et laisserait la publication muette, le mode d'echec exact */
/* qu'elle existe pour empecher. Ce test le rend impossible : apres      */
/* l'ouverture, tout nouveau login est refuse en 429, et la fermeture    */
/* doit reussir quand meme.                                             */
/* ================================================================== */

test('un seul /admin/login : le reharmement survit a un 429 sur le login', async () => {
  let logins = 0;
  let refuserLesLoginsSuivants = false;
  const etat = { webhook: webhookNominal(true) };

  const serveur = http.createServer((req, rep) => {
    let corps = '';
    req.on('data', (d) => (corps += d));
    req.on('end', () => {
      rep.setHeader('Content-Type', 'application/json');
      if (req.url === '/admin/login') {
        logins += 1;
        if (refuserLesLoginsSuivants) {
          rep.statusCode = 429;
          return rep.end(JSON.stringify({ error: { status: 429, name: 'TooManyRequests' } }));
        }
        return rep.end(JSON.stringify({ data: { token: 'jeton-admin' } })); // secret-ok : jeton bidon d un stub HTTP local, aucune valeur reelle
      }
      if (req.method === 'GET' && req.url === '/admin/webhooks')
        return rep.end(JSON.stringify({ data: [etat.webhook] }));
      if (req.method === 'PUT' && req.url === '/admin/webhooks/1') {
        etat.webhook = { ...JSON.parse(corps), id: 1 };
        return rep.end(JSON.stringify({ data: etat.webhook }));
      }
      rep.statusCode = 404;
      rep.end();
    });
  });
  await new Promise<void>((r) => serveur.listen(0, '127.0.0.1', () => r()));
  const port = (serveur.address() as any).port;

  try {
    const client = new ClientAdminHttp(`http://127.0.0.1:${port}`, 'admin@test', 'motdepasse');
    const { ecluse } = ecluseDeTest(client, dossierJetable());

    await ecluse.ouvrir();
    assert.equal(etat.webhook.isEnabled, false);

    // A partir d'ici, Strapi refuserait tout nouveau login.
    refuserLesLoginsSuivants = true;
    assert.equal(await ecluse.fermer(), true, 'le reharmement ne doit PAS dependre d un login');
    assert.equal(etat.webhook.isEnabled, true);
    assert.equal(logins, 1, 'un seul login pour toute la traversee');
  } finally {
    await new Promise<void>((r) => serveur.close(() => r()));
  }
});

/* ================================================================== */
/* 11-12. Le seed est FERME par defaut : sans identifiants admin, il    */
/*        refuse de seeder — et l'echappatoire doit etre EXPLICITE.     */
/* ================================================================== */

const SCRIPT = path.join(RACINE_CMS, 'scripts', 'seed', 'index.ts');

function lancerSeed(env: Record<string, string | undefined>) {
  return new Promise<{ code: number; sortie: string }>((resoudre) => {
    const fils = spawn(process.execPath, [SCRIPT], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let sortie = '';
    fils.stdout.on('data', (d) => (sortie += d));
    fils.stderr.on('data', (d) => (sortie += d));
    fils.on('exit', (code) => resoudre({ code: code ?? -1, sortie }));
  });
}

test('sans identifiants admin, le seed REFUSE de seeder (ferme par defaut)', async () => {
  const { code, sortie } = await lancerSeed({
    SEED_STRAPI_URL: 'http://127.0.0.1:1',
    SEED_STRAPI_TOKEN: 'jeton-de-test',
    SEED_STRAPI_ADMIN_EMAIL: '',
    SEED_STRAPI_ADMIN_PASSWORD: '',
    SEED_ECLUSE: '',
  });

  assert.notEqual(code, 0, 'un seed qui ne peut pas desarmer le webhook ne doit PAS partir');
  assert.match(sortie, /SEED_STRAPI_ADMIN_EMAIL/);
  assert.match(sortie, /21 bis/, 'le refus doit nommer l etape du runbook');
  assert.match(sortie, /SEED_ECLUSE=non/, 'et nommer l echappatoire explicite');
});

test('l echappatoire SEED_ECLUSE=non passe, mais elle ne peut pas etre involontaire', async () => {
  const { code, sortie } = await lancerSeed({
    SEED_STRAPI_URL: 'http://127.0.0.1:1',
    SEED_STRAPI_TOKEN: 'jeton-de-test',
    SEED_STRAPI_ADMIN_EMAIL: '',
    SEED_STRAPI_ADMIN_PASSWORD: '',
    SEED_ECLUSE: 'non',
  });

  // Le seed part (et echoue plus loin, faute de Strapi a joindre) : ce qui
  // compte est qu'il ne se soit PAS arrete sur le refus de l'ecluse.
  assert.doesNotMatch(sortie, /21 bis/);
  assert.match(sortie, /SANS ECLUSE|sans ecluse/i, 'la sortie doit crier que le filet est retire');
  assert.notEqual(code, 0);
});
