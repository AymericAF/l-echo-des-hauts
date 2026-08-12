/**
 * `npm run credits` — ECRIT `CREDITS.md` a la racine du depot depuis le corpus
 * versionne (plan editorial §6.7).
 *
 * Il n'ecrit rien d'autre et ne parle a aucun service : le registre se derive du
 * corpus sur disque, jamais de la base. `--verifier` n'ecrit pas et sort en code
 * non nul si le fichier versionne a diverge — c'est ce que le test rejoue, et ce
 * qui rend la garde utilisable en ligne de commande.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chargerCorpus } from './seed/corpus.ts';
import { composerRegistre } from './seed/registre.ts';
import { ErreurCorpus } from './seed/erreurs.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
export const RACINE_DATA = path.join(ICI, '..', 'data');
export const CHEMIN_CREDITS = path.join(ICI, '..', '..', '..', 'CREDITS.md');

function principal(): number {
  const verifier = process.argv.slice(2).includes('--verifier');
  const attendu = composerRegistre(chargerCorpus(RACINE_DATA));

  if (!verifier) {
    fs.writeFileSync(CHEMIN_CREDITS, attendu, 'utf8');
    console.log(`CREDITS.md ecrit — ${attendu.split('\n').length} lignes`);
    return 0;
  }

  // La fin de ligne n'est pas le sujet : git materialise en CRLF sur Windows et
  // en LF sur le runner. On compare le CONTENU, pas les octets de retour ligne.
  const surDisque = fs.existsSync(CHEMIN_CREDITS)
    ? fs.readFileSync(CHEMIN_CREDITS, 'utf8').replace(/\r\n/g, '\n')
    : null;
  if (surDisque === attendu) {
    console.log('CREDITS.md est a jour.');
    return 0;
  }
  console.error(
    surDisque === null
      ? 'ROUGE : CREDITS.md absent. Lancer `npm run credits`.'
      : 'ROUGE : CREDITS.md a diverge du corpus. Lancer `npm run credits`.'
  );
  return 1;
}

try {
  process.exitCode = principal();
} catch (e) {
  if (e instanceof ErreurCorpus) {
    console.error(`\nCORPUS INVALIDE — CREDITS.md n'a pas ete touche.\n${e.message}`);
  } else {
    console.error(e);
  }
  process.exitCode = 1;
}
