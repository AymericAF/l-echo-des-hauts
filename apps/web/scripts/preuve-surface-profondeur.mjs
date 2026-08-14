/**
 * PREUVE que la garde de surface publique SAIT ROUGIR sur une fuite EN PROFONDEUR — et
 * qu elle rend `0` quand la meme instance est protegee.
 *
 * POURQUOI ELLE NE POUVAIT PAS S EN PASSER. `verifier-surface-publique.mjs` sonde desormais
 * `?populate=*` et parcourt chaque `publishedAt` du document, relations imbriquees comprises
 * (tache `63963962`). Le jour ou ce parcours regresserait — un `return` trop tot, un scan
 * revenu a la racine, une sonde perdue du plan —, la garde continuerait de rendre `0` sur
 * l instance reelle, qui est saine : `[[quand-succes-et-echec-rendent-la-meme-sortie]]`.
 * Mesurer une instance conforme ne prouve JAMAIS qu une garde detecte quoi que ce soit ;
 * seule sa mise en echec le prouve — `[[un-controle-se-prouve-en-cassant-ce-qu-il-protege]]`.
 *
 * CE QU ELLE CASSE, ET POURQUOI PAS LE MIDDLEWARE LUI-MEME. Le defaut a reproduire est
 * « l instance sert une relation non publiee a un appelant sans credence ». Retirer
 * `global::statut-publie` de `config/middlewares.ts` exigerait une instance Strapi et une
 * base garnie de brouillons ; ce serveur de substitution produit EXACTEMENT la meme sortie
 * HTTP — c est cette sortie, et elle seule, que la garde lit. Il reproduit les deux etats :
 *
 *   `fuite`   — l appelant sans credence obtient une relation a `publishedAt: null`, la
 *               RACINE restant publiee. C est le cas qu un scan limite a la racine laisse
 *               passer, et il est ici le SEUL declencheur : si la garde rend `0`, c est
 *               qu elle ne descend pas.
 *   `protege` — le meme serveur impose `published` partout, comme le middleware.
 *
 * CE QU ELLE NE PROUVE PAS. Ni les permissions de l instance reelle, ni le comportement de
 * Strapi face a `?populate=*` : c est la mesure du 2026-08-14 sur `echoback.ayfiweb.fr` qui
 * a etabli le fait (6 types servis, 311 `publishedAt` recenses, 0 a `null`). Cette preuve-ci
 * porte sur la GARDE, pas sur l instance.
 *
 *   npm run preuve:surface-profondeur
 *
 * Sortie : `0` les deux etats se comportent comme attendu, `1` la garde a manque la fuite ou
 * s est trompee sur l instance protegee, `2` la preuve n a pas pu avoir lieu.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ISSUES } from './issues.mjs';

/** Une date de publication quelconque : seule sa non-nullite compte. */
const PUBLIE = '2026-08-01T10:00:00.000Z';

/** Le chemin de la fuite, tel que la garde doit le NOMMER dans son manquement. */
export const CHEMIN_DE_LA_FUITE = 'tags';

/**
 * Un document de forme Strapi : racine publiee, relations peuplees.
 *
 * `fuite` ne touche QUE la relation — la racine reste publiee. C est ce qui fait de ce banc
 * une preuve du parcours en profondeur, et pas seulement du parcours tout court.
 */
function document(fuite) {
  return {
    id: 1,
    documentId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    publishedAt: PUBLIE,
    auteur: { id: 3, publishedAt: PUBLIE },
    categorie: { id: 4, publishedAt: PUBLIE },
    tags: [{ id: 5, publishedAt: fuite ? null : PUBLIE }],
  };
}

/**
 * Le Strapi de substitution.
 *
 * Il distingue les deux roles comme Strapi les distingue : un `Bearer <jeton>` a deux parties
 * non vides porte une credence, tout le reste retombe sur le role Public — y compris le
 * « Bearer » nu du piege du 2026-08-04.
 *
 * @param {'fuite'|'protege'} mode
 */
export function creerBanc(mode) {
  return http.createServer((requete, reponse) => {
    const url = new URL(requete.url, 'http://interne');
    const entete = requete.headers.authorization ?? '';
    const parties = entete.trim().split(/\s+/);
    const avecCredence = parties.length === 2 && parties[0].toLowerCase() === 'bearer' && parties[1] !== '';

    const repondre = (statut, corps) => {
      reponse.writeHead(statut, { 'Content-Type': 'application/json' });
      reponse.end(JSON.stringify(corps));
    };

    /* Le LISTAGE de la mediatheque est ferme au role Public depuis toujours — la garde le
       sonde encore, et un 200 ici la ferait rougir pour une autre raison que celle qu on
       veut prouver. */
    if (url.pathname === '/api/upload/files') {
      return avecCredence ? repondre(200, []) : repondre(403, { error: { status: 403 } });
    }
    if (!url.pathname.startsWith('/api/')) return repondre(404, { error: { status: 404 } });

    /* Le jeton lit ses brouillons : l application d apercu en depend, et la garde ne doit
       jamais le lui reprocher. */
    if (avecCredence) return repondre(200, { data: [document(true)] });

    /* Role Public. En `protege`, le serveur impose `published` quel que soit le parametre
       recu — c est le comportement du middleware. En `fuite`, il HONORE `?status=draft`,
       et la relation part avec. */
    const brouillonDemande = url.searchParams.get('status') === 'draft';
    const fuit = mode === 'fuite' && brouillonDemande;
    const donnees = url.pathname === '/api/configuration' ? document(fuit) : [document(fuit)];
    return repondre(200, { data: donnees, meta: {} });
  });
}

/** Ouvre le banc sur un port libre et rend son origine. */
export function ecouter(serveur) {
  return new Promise((resoudre, rejeter) => {
    serveur.once('error', rejeter);
    serveur.listen(0, '127.0.0.1', () => resoudre(`http://127.0.0.1:${serveur.address().port}`));
  });
}

/**
 * Lance le VERIFICATEUR REEL contre une origine, en processus fils.
 *
 * Le processus fils n est pas une coquetterie : c est le seul moyen d observer le CODE DE
 * SORTIE, qui est ce que la CI lit. Une preuve qui n appellerait que `jugerSondes` laisserait
 * hors du filet tout ce qui va du plan de sondes a `process.exitCode`.
 */
export function lancerVerificateur(origine) {
  const script = fileURLToPath(new URL('./verifier-surface-publique.mjs', import.meta.url));
  return new Promise((resoudre) => {
    const fils = spawn(process.execPath, [script, origine], {
      /* Jeton FACTICE, et il doit l etre : le banc n a pas de base et ne verifie rien — il
         regarde seulement si l en-tete porte deux parties non vides, comme Strapi. Un vrai
         jeton ici ne servirait a rien et sortirait du .env. */
      env: { ...process.env, ECHO_STRAPI_API_TOKEN_READONLY: 'jeton-de-banc' }, // secret-ok
    });
    let sortie = '';
    fils.stdout.on('data', (d) => { sortie += d; });
    fils.stderr.on('data', (d) => { sortie += d; });
    fils.on('close', (code) => resoudre({ code, sortie }));
  });
}

/** Joue un etat du banc de bout en bout. */
export async function jouer(mode) {
  const serveur = creerBanc(mode);
  const origine = await ecouter(serveur);
  try {
    return await lancerVerificateur(origine);
  } finally {
    await new Promise((r) => serveur.close(r));
  }
}

// --- Usage en ligne de commande -------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manquements = [];

  const casse = await jouer('fuite');
  if (casse.code !== ISSUES.ANOMALIE) {
    manquements.push(
      `banc « fuite » → la garde a rendu ${casse.code}, attendu ${ISSUES.ANOMALIE}. Une relation a ` +
        '`publishedAt: null` est servie a un appelant SANS CREDENCE, racine publiee : si la garde ' +
        'ne rougit pas, c est qu elle ne descend pas dans les relations, et son 0 sur ' +
        'l instance reelle ne vaut rien.\n' + casse.sortie,
    );
  } else if (!casse.sortie.includes(CHEMIN_DE_LA_FUITE)) {
    manquements.push(
      `banc « fuite » → la garde rougit, mais son manquement ne NOMME pas « ${CHEMIN_DE_LA_FUITE} ». ` +
        'Un rouge qui n envoie nulle part se discute au lieu de se corriger.\n' + casse.sortie,
    );
  }

  const sain = await jouer('protege');
  if (sain.code !== ISSUES.CONFORME) {
    manquements.push(
      `banc « protege » → la garde a rendu ${sain.code}, attendu ${ISSUES.CONFORME}. Le meme banc ` +
        'impose `published` a l appelant sans credence, comme le middleware : un rouge ici serait ' +
        'un faux positif, et un faux positif finit par faire desactiver la garde.\n' + sain.sortie,
    );
  }

  if (manquements.length > 0) {
    console.error(`\n✖ ${manquements.length} manquement(s) sur la preuve de profondeur :`);
    for (const m of manquements) console.error(`  - ${m}`);
    process.exitCode = ISSUES.ANOMALIE;
  } else {
    console.log(
      '✔ la garde de surface publique rougit sur une fuite EN RELATION IMBRIQUEE (racine publiee, ' +
        `« ${CHEMIN_DE_LA_FUITE} » nomme dans le manquement) et rend 0 sur le meme banc protege. ` +
        'Les deux etats ont ete joues par le CLI reel, code de sortie compris.',
    );
    process.exitCode = ISSUES.CONFORME;
  }
}
