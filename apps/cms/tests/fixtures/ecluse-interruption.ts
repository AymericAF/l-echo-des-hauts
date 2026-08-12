/**
 * Fixture du cas 3 de `tests/seed-ecluse.test.ts` : une interruption.
 *
 * Elle tourne en SOUS-PROCESSUS parce que c'est la seule facon d'exercer pour
 * de vrai un chemin de sortie par signal — gestionnaires enregistres, code de
 * sortie, et l'etat REEL du webhook releve APRES coup, par une relecture HTTP.
 *
 * Le Strapi est un stub HTTP local : le test n'a besoin ni de reseau ni de
 * jeton, et il verifie la seule chose qui compte ici — que le reharmement a
 * bien lieu quand le processus est interrompu au milieu du travail.
 *
 * `process.emit('SIGINT')` declenche exactement les listeners que le systeme
 * declencherait sur Ctrl-C. Sur Windows, Node n'accepte pas qu'on s'envoie un
 * SIGINT par `process.kill`, mais il route Ctrl-C vers ces memes listeners :
 * c'est donc le meme chemin de code qui est exerce.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { Ecluse, traverser, ClientAdminHttp, NOM_WEBHOOK_PUBLICATION } from '../../scripts/seed/ecluse.ts';

const DOSSIER = process.env.ECLUSE_DOSSIER!;
const JOURNAL = process.env.ECLUSE_JOURNAL!;
const SENTINELLE = path.join(DOSSIER, '.seed-ecluse.json');

/* --- Stub Strapi admin : un webhook, en memoire ---------------------- */

let webhook = {
  id: 1,
  name: NOM_WEBHOOK_PUBLICATION,
  url: 'http://82.25.116.173:8000/api/v1/deploy?uuid=mft3ounqrorfp4kix266q16q',
  headers: { Authorization: 'Bearer jeton-de-test-non-secret' },
  events: ['entry.publish', 'entry.unpublish'],
  isEnabled: true,
};

const serveur = http.createServer((req, rep) => {
  let corps = '';
  req.on('data', (d) => (corps += d));
  req.on('end', () => {
    rep.setHeader('Content-Type', 'application/json');
    if (req.url === '/admin/login') return rep.end(JSON.stringify({ data: { token: 'jeton-admin' } })); // secret-ok : jeton bidon d un stub HTTP local, aucune valeur reelle
    if (req.method === 'GET' && req.url === '/admin/webhooks')
      return rep.end(JSON.stringify({ data: [webhook] }));
    if (req.method === 'PUT' && req.url === '/admin/webhooks/1') {
      webhook = JSON.parse(corps);
      webhook.id = 1;
      return rep.end(JSON.stringify({ data: webhook }));
    }
    rep.statusCode = 404;
    rep.end();
  });
});

await new Promise<void>((r) => serveur.listen(0, '127.0.0.1', () => r()));
const port = (serveur.address() as any).port;

/* --- Le run interrompu ---------------------------------------------- */

const dit: Record<string, unknown> = {};
// Ecrit AVANT toute sortie : si le processus mourait sans rien ecrire, le test
// echouerait sur un JSON absent plutot que de conclure a tort.
const noter = () => fs.writeFileSync(JOURNAL, JSON.stringify(dit));

const client = new ClientAdminHttp(`http://127.0.0.1:${port}`, 'admin@test', 'motdepasse');
const ecluse = new Ecluse(client, {
  cheminSentinelle: SENTINELLE,
  // Le releve se fait a CHAQUE ligne de journal, et pas dans un `process.on
  // ('exit')` : le chemin de sortie par signal se termine par un
  // `process.kill(self, signal)` — le systeme termine le processus, donc
  // AUCUN handler `exit` ne tourne. Un releve pose la n'existerait pas, et le
  // test conclurait a un echec de reharmement qui n'a pas eu lieu.
  journal: (l) => {
    console.log(`  ${l}`);
    dit.etatApres = webhook.isEnabled;
    dit.sentinelleRestante = fs.existsSync(SENTINELLE);
    noter();
  },
});

try {
  await traverser(ecluse, async () => {
    dit.etatPendant = webhook.isEnabled;
    noter();
    // Ctrl-C au milieu du travail.
    process.emit('SIGINT' as any);
    // Le travail continue de tourner : c'est le gestionnaire qui doit fermer
    // l'ecluse puis sortir. On attend assez longtemps pour que, si le
    // gestionnaire n'existait pas, le travail se termine NORMALEMENT et le
    // test le voie (etatApres serait vrai pour la mauvaise raison — d'ou le
    // controle du code de sortie, qui doit etre non nul).
    await new Promise((r) => setTimeout(r, 5000));
    dit.travailTermineNormalement = true;
    noter();
  });
} catch (e) {
  dit.erreur = String(e);
  noter();
}
