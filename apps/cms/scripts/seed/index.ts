/**
 * `npm run seed` — charge le contenu de demonstration versionne dans Strapi.
 *
 * Rejouable : le rapprochement se fait sur le slug, par locale. Deux executions
 * consecutives donnent le meme comptage en base.
 *
 * Variables d'environnement, aucune valeur par defaut secrete :
 *   SEED_STRAPI_URL    (defaut http://localhost:1337)
 *   SEED_STRAPI_TOKEN  jeton d'API **full-access** et a DUREE LIMITEE (jamais
 *                      `Unlimited` : un jeton plein acces sans expiration
 *                      survit a qui l'a cree) — PAS celui du build, qui est en
 *                      lecture seule (contrainte dure de la §1 ratifiee).
 *                      Sa date d'expiration vit a UN SEUL endroit, la matrice
 *                      des secrets du depot de documentation : elle ne se
 *                      recopie pas ici.
 *   SEED_STRAPI_ADMIN_EMAIL     \  identifiants ADMIN, pour l'ecluse de
 *   SEED_STRAPI_ADMIN_PASSWORD  /  publication (cf. `ecluse.ts`). Le jeton
 *                      d'API, meme full-access, NE PEUT PAS lire ni ecrire
 *                      `/admin/webhooks` : seule une session admin le peut.
 *
 * L'ECLUSE EST OBLIGATOIRE POUR SEEDER. Sans identifiants admin, le seed
 * REFUSE de partir : il republierait alors 69 fois avec le webhook arme, ce qui
 * s'est produit trois fois sur trois (runbook, etape 21 bis). L'echappatoire
 * `SEED_ECLUSE=non` existe pour un Strapi local sans webhook — elle doit etre
 * tapee, donc elle ne peut pas etre oubliee, ce qui est exactement la
 * difference avec la consigne qu'elle remplace.
 *
 * Sous-commandes :
 *   (aucune)     execute le seed puis affiche le comptage en base
 *   --verifier   n'ecrit rien : rejoue le controle 12 du plan editorial
 *   --comptage   n'ecrit rien : affiche le comptage en base
 *   --ecluse     n'ecrit rien : releve l'etat du webhook de publication
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ClientHttp } from './client.ts';
import { chargerCorpus } from './corpus.ts';
import { executerSeed } from './seed.ts';
import { controlerLocalisationsEn, EFFECTIFS_EN } from './controle12.ts';
import { ErreurCorpus, ErreurStrapi } from './erreurs.ts';
import { ClientAdminHttp, Ecluse, NOM_WEBHOOK_PUBLICATION, traverser } from './ecluse.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE_CMS = path.join(ICI, '..', '..');
const RACINE_DATA = path.join(RACINE_CMS, 'data');

/**
 * La sentinelle de l'ecluse : un fichier LOCAL, jamais versionne (le depot est
 * public). C'est ce qui survit a un SIGKILL, donc ce qui permet au seed suivant
 * de rattraper un webhook laisse desarme.
 */
const SENTINELLE_ECLUSE = path.join(RACINE_CMS, '.seed-ecluse.json');

const BASE = (process.env.SEED_STRAPI_URL ?? 'http://localhost:1337').replace(/\/+$/, '');
const JETON = process.env.SEED_STRAPI_TOKEN ?? '';
const ADMIN_EMAIL = process.env.SEED_STRAPI_ADMIN_EMAIL ?? '';
const ADMIN_MOTDEPASSE = process.env.SEED_STRAPI_ADMIN_PASSWORD ?? '';
const ECLUSE_RETIREE = process.env.SEED_ECLUSE === 'non';

function ecluse(): Ecluse {
  return new Ecluse(new ClientAdminHttp(BASE, ADMIN_EMAIL, ADMIN_MOTDEPASSE), {
    cheminSentinelle: SENTINELLE_ECLUSE,
    journal: (l) => console.log(l),
  });
}

const FAMILLES = ['categories', 'tags', 'auteurs', 'dossiers', 'articles'] as const;

async function lireJson(chemin: string): Promise<any> {
  const url = `${BASE}/${chemin}`;
  const rep = await fetch(url, { headers: { Authorization: `Bearer ${JETON}` } });
  const texte = await rep.text();
  if (!rep.ok) throw new ErreurStrapi('GET', url, rep.status, texte);
  return JSON.parse(texte);
}

/** Le comptage en base, famille par famille et locale par locale. */
async function comptage(): Promise<Record<string, number>> {
  const sortie: Record<string, number> = {};
  for (const famille of FAMILLES) {
    for (const locale of ['fr', 'en']) {
      const statut = famille === 'articles' ? '&status=published' : '';
      const rep = await lireJson(
        `api/${famille}?locale=${locale}&fields[0]=slug&pagination[pageSize]=1${statut}`
      );
      sortie[`${famille}:${locale}`] = rep?.meta?.pagination?.total ?? 0;
    }
  }
  const medias = await lireJson('api/upload/files?pagination[pageSize]=1');
  sortie['medias'] = Array.isArray(medias) ? medias.length : (medias?.pagination?.total ?? 0);
  for (const locale of ['fr', 'en']) {
    const rep = await lireJson(`api/configuration?locale=${locale}&fields[0]=nomSite`);
    sortie[`configuration:${locale}`] = rep?.data ? 1 : 0;
  }
  return sortie;
}

function afficherComptage(titre: string, valeurs: Record<string, number>) {
  console.log(`\n${titre}`);
  for (const [cle, n] of Object.entries(valeurs)) console.log(`  ${cle.padEnd(22)} ${n}`);
}

async function verifier(): Promise<number> {
  const rapport = await controlerLocalisationsEn(lireJson);

  console.log('\nControle 12 — (a) les 41 localisations EN portant un uid');
  let total = 0;
  for (const [plural, attendu] of Object.entries(EFFECTIFS_EN)) {
    const rendu = rapport.a.effectifs[plural] ?? 0;
    total += rendu;
    console.log(`  ${plural.padEnd(12)} ${String(rendu).padStart(3)} / ${attendu}`);
  }
  console.log(`  ${'TOTAL'.padEnd(12)} ${String(total).padStart(3)} / 41`);
  for (const a of rapport.a.anomalies) console.log(`  !! ${a.objet} : ${a.constat}`);

  console.log('\nControle 12 — (b) relations des 8 articles EN');
  console.log(`  fields[0]=locale rend-il le locale de l'entree liee ? ${rapport.b.localeRendueParFields ? 'OUI' : 'NON'}`);
  console.log(`  methode retenue : ${rapport.b.methode}`);
  for (const a of rapport.b.anomalies) console.log(`  !! ${a.objet} : ${a.constat}`);
  if (rapport.b.anomalies.length === 0) console.log('  aucune entree liee hors locale en');

  console.log(`\nControle 12 : ${rapport.vert ? 'VERT' : 'ROUGE'}`);
  return rapport.vert ? 0 : 1;
}

async function principal(): Promise<number> {
  const args = new Set(process.argv.slice(2));

  // `--ecluse` ne touche qu'a /admin/webhooks : il n'a pas besoin du jeton
  // d'API, et devoir en creer un pour verifier qu'une publication n'est pas
  // muette serait un frein place sur le seul controle qui la voit.
  if (args.has('--ecluse')) return etatEcluse();

  if (JETON === '') {
    console.error(
      'SEED_STRAPI_TOKEN est vide.\n' +
        "  Creez un jeton d'API **full-access** et a DUREE LIMITEE dans l'admin Strapi\n" +
        '  (Settings > API Tokens > Create new API Token, Token type: Full access,\n' +
        '   Token duration: 30 days — JAMAIS `Unlimited` : un jeton plein acces sans\n' +
        "   expiration survit a qui l'a cree)\n" +
        "  et exportez-le. Ce n'est PAS le jeton du build, qui est en lecture seule."
    );
    return 2;
  }

  if (args.has('--verifier')) return verifier();
  if (args.has('--comptage')) {
    afficherComptage('Comptage en base', await comptage());
    return 0;
  }

  // ------------------------------------------------------------------
  // FERME PAR DEFAUT : pas d'ecluse, pas de seed.
  //
  // C'est le coeur du mecanisme. Une consigne se saute ; un refus de
  // demarrer, non. Trois rafales de 26 deploiements de production ont ete
  // lancees par un seed dont l'operateur avait, chaque fois, la consigne
  // sous les yeux.
  // ------------------------------------------------------------------
  if (!ECLUSE_RETIREE && (ADMIN_EMAIL === '' || ADMIN_MOTDEPASSE === '')) {
    console.error(
      [
        '',
        'SEED REFUSE — l ecluse de publication ne peut pas etre ouverte.',
        '',
        'SEED_STRAPI_ADMIN_EMAIL et SEED_STRAPI_ADMIN_PASSWORD sont requis pour',
        'seeder : le seed republie chaque article, chaque republication declenche',
        'le webhook `' + NOM_WEBHOOK_PUBLICATION + '`, et un corpus complet part',
        'donc en 69 deploiements de PRODUCTION. L ecluse desarme ce webhook le',
        'temps du seed et le remet ensuite ; sans identifiants admin, elle ne peut',
        'ni l un ni l autre — et le jeton d API, meme full-access, n a pas acces a',
        '/admin/webhooks.',
        '',
        'Ce refus remplace une consigne qui a echoue TROIS FOIS SUR TROIS :',
        'runbook de provisionnement, etape 21 bis.',
        '',
        'A EXPORTER (les valeurs vivent dans ~/.claude/.env, hors depot) :',
        '  export SEED_STRAPI_ADMIN_EMAIL="$ECHO_STRAPI_ADMIN_EMAIL"',
        '  export SEED_STRAPI_ADMIN_PASSWORD="$ECHO_STRAPI_ADMIN_PASSWORD"',
        '',
        'Contre un Strapi LOCAL sans webhook de publication, et la seulement :',
        '  SEED_ECLUSE=non npm run seed',
        '',
      ].join('\n')
    );
    return 2;
  }

  if (ECLUSE_RETIREE) {
    console.warn(
      [
        '',
        '⚠️  SEED LANCE SANS ECLUSE (SEED_ECLUSE=non).',
        '   Le webhook de publication n est PAS desarme. Si la cible porte un',
        '   webhook arme sur `entry.publish`, ce seed va declencher un',
        '   deploiement par article publie — 69 sur un corpus complet.',
        '   Cette echappatoire est prevue pour un Strapi local, rien d autre.',
        '',
      ].join('\n')
    );
    return await seeder();
  }

  return await traverser(ecluse(), seeder);
}

/** Le seed lui-meme, ecluse ou non : le travail, et rien que le travail. */
async function seeder(): Promise<number> {
  console.log(`corpus : ${RACINE_DATA}`);
  const corpus = chargerCorpus(RACINE_DATA);
  console.log(
    `lu : ${corpus.medias.length} medias, ${corpus.categories.length} categories, ` +
      `${corpus.tags.length} tags, ${corpus.auteurs.length} auteurs, ` +
      `${corpus.dossiers.length} dossiers, ${corpus.articles.length} articles`
  );

  const client = new ClientHttp(BASE, JETON);
  const debut = Date.now();
  const resultat = await executerSeed(client, corpus, (l) => console.log(`  ${l}`));
  console.log(`\ntermine en ${((Date.now() - debut) / 1000).toFixed(1)} s`);

  const somme = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  // `inchanges` est un registre a part, jamais range en « mises a jour » : une
  // entree sautee n'a produit AUCUNE ecriture, donc aucune republication, donc
  // aucun deploiement. Les confondre ferait mentir le comptage exactement
  // comme il mentait sur les medias.
  console.log(
    `creations : ${somme(resultat.crees)} — mises a jour : ${somme(resultat.misAJour)} — ` +
      `inchanges (aucune ecriture emise) : ${somme(resultat.inchanges)}`
  );
  afficherComptage('Comptage en base', await comptage());
  return 0;
}

/**
 * `--ecluse` : le releve du webhook de publication, sans rien ecrire.
 *
 * Il rattrape aussi une sentinelle laissee par un run mort — c'est la seule
 * sous-commande a le faire sans seeder, ce qui en fait le geste de controle a
 * porter sur une cadence si on veut voir une publication muette sans attendre
 * le prochain seed.
 */
async function etatEcluse(): Promise<number> {
  if (ADMIN_EMAIL === '' || ADMIN_MOTDEPASSE === '') {
    console.error(
      'SEED_STRAPI_ADMIN_EMAIL et SEED_STRAPI_ADMIN_PASSWORD sont requis pour lire\n' +
        "l etat des webhooks : le jeton d API n a pas acces a /admin/webhooks."
    );
    return 2;
  }
  const client = new ClientAdminHttp(BASE, ADMIN_EMAIL, ADMIN_MOTDEPASSE);
  const webhooks = await client.listerWebhooks();
  const publication = webhooks.find((w) => w.name === NOM_WEBHOOK_PUBLICATION);

  console.log(`\nEtat des webhooks de ${BASE} — releve a ${new Date().toISOString()}`);
  for (const w of webhooks) {
    console.log(`  ${w.name.padEnd(24)} isEnabled=${w.isEnabled}  events=[${w.events.join(',')}]`);
    console.log(`  ${''.padEnd(24)} url=${w.url}`);
  }

  const sentinelle = fs.existsSync(SENTINELLE_ECLUSE);
  console.log(`\nsentinelle d ecluse : ${sentinelle ? `PRESENTE (${SENTINELLE_ECLUSE})` : 'absente'}`);

  if (publication === undefined) {
    console.log(`\naucun webhook « ${NOM_WEBHOOK_PUBLICATION} » sur cette instance.`);
    return 0;
  }
  if (!publication.isEnabled) {
    console.error(
      `\n⚠️  PUBLICATION MUETTE : « ${NOM_WEBHOOK_PUBLICATION} » est DESARME.\n` +
        '   Plus aucune publication dans Strapi ne met le site a jour. Rien ne\n' +
        '   casse et rien ne s allume en rouge : le site cesse simplement de\n' +
        '   changer. A remettre en ON (runbook, etape 21 bis).'
    );
    return 1;
  }
  console.log(`\n« ${NOM_WEBHOOK_PUBLICATION} » est ARME : la publication met bien le site a jour.`);
  return 0;
}

/*
 * Le code de sortie se POSE (`process.exitCode`), il ne se force pas
 * (`process.exit()`) : le processus se termine ensuite de lui-meme, quand ses
 * handles se sont fermes.
 *
 * `process.exit()` coupe les handles libuv encore ouverts — ici les sockets
 * keep-alive du client HTTP vers Strapi. Sur Node 24 / Windows, la coupure
 * faisait avorter le processus (« Assertion failed:
 * !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c », code
 * 0xC0000409) APRES avoir imprime « Controle 12 : VERT ». La sortie texte
 * disait vrai, le code de retour disait l'inverse — et c'est le code de retour
 * qui commande une chaine automatisee.
 *
 * `tests/seed-code-sortie.test.ts` exerce les deux sens en sous-processus.
 */
principal()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    if (e instanceof ErreurCorpus) {
      console.error(`\nCORPUS INVALIDE — rien n'a ete ecrit dans Strapi.\n${e.message}`);
    } else if (e instanceof ErreurStrapi) {
      console.error(`\nSTRAPI A REFUSE UNE REQUETE.\n${e.message}`);
    } else {
      console.error(e);
    }
    process.exitCode = 1;
  });
