/**
 * LE BANC EST DEPLACABLE — sinon la preuve en cassant n est pas rejouable.
 *
 * CE QUI A ETE MESURE (2026-08-12, depot a 8026c0b). `reponseDeFixture(chemin, locale,
 * dossier)` ACCEPTE un troisieme parametre depuis le 2026-08-10 ; `demarrerServeurFixtures`
 * ne le passait JAMAIS (`serveur-fixtures.mjs:175`), et n avait aucun moyen de le recevoir.
 * Le Strapi de substitution etait donc CLOUE sur `tests/fixtures/`.
 *
 * CE QUE CELA A COUTE, une fois, en vrai : pour reproduire un defaut sur un banc modifie
 * sans muter le depot, un run a REECRIT un serveur de vingt lignes dans son scratchpad
 * (tache 5bf5c24b). Ce serveur n est versionne nulle part — le chemin de preuve n existait
 * que dans la tete du run qui l a emprunte, et le suivant devait le reinventer. C est la
 * meme classe que les instruments de mesure non versionnes (bffb2c43) : un projet qui exige
 * de ses gardes qu elles se prouvent EN CASSANT doit versionner de quoi les casser.
 *
 * LE SECOND DEFAUT, PLUS SOURNOIS, ET QUI VIT DANS LA SORTIE. Propager le parametre ne
 * suffisait pas : le MESSAGE d incapacite nommait `tests/fixtures/<nom>.json` en dur
 * (`reponseDeFixture` ligne 163, `messageVerificationImpossible` ligne 110), quel que soit
 * le dossier consulte. Sur un banc temoin, la sortie envoyait donc chercher un fichier
 * ABSENT dans un dossier ou il EXISTE — un message qui ne casse pas la commande, mais qui
 * la fait MENTIR, et la classe de defaut que ce depot nomme deja. Les anciens tests
 * ASSERTAIENT ce mensonge (`banc-absences.test.ts`, deux `assert.equal` sur
 * `'tests/fixtures/…'` alors que le dossier passe etait un `mkdtemp`).
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  demarrerServeurFixtures,
  FIXTURES,
  fixturesDuBanc,
  lireFixture,
  messageVerificationImpossible,
  reponseDeFixture,
} from '../scripts/serveur-fixtures.mjs';
import { LOCALES_SITE } from '../src/lib/routes/registre.ts';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVEUR = path.join(RACINE, 'scripts', 'serveur-fixtures.mjs');

/** La marque qui n existe QUE sur le banc temoin — elle rend le dossier servi reconnaissable. */
const TEMOIN = 'TEMOIN-BANC-ALTERNATIF-4f2a';

/**
 * Un banc TEMOIN : copie complete de `tests/fixtures/`, dont la Configuration francaise
 * porte une marque, et dont on peut retirer des fichiers.
 *
 * La copie est COMPLETE et non partielle : un banc ampute prouverait le deplacement en
 * meme temps qu une absence, et on ne saurait plus lequel des deux la sortie constate.
 */
function bancTemoin(retirer: string[] = []): string {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-temoin-'));
  for (const nom of fixturesDuBanc([...LOCALES_SITE])) {
    if (retirer.includes(nom)) continue;
    fs.copyFileSync(path.join(FIXTURES, `${nom}.json`), path.join(dossier, `${nom}.json`));
  }
  /* La marque se pose DANS le texte du bloc, pas a la place du bloc : `texteFooter` est un
     champ « blocks » de Strapi, et lui substituer une chaine ferait echouer un build reel
     sur `blocksOptionnel` — un banc temoin doit rester constructible, sans quoi il ne sert
     qu aux tests unitaires et le geste de la tache reste impossible. Mesure faite. */
  const config = lireFixture('configuration-fr', dossier);
  config.data.texteFooter[0].children[0].text = TEMOIN;
  fs.writeFileSync(path.join(dossier, 'configuration-fr.json'), JSON.stringify(config, null, 2));
  return dossier;
}

async function corpsDe(url: string, chemin: string): Promise<{ statut: number; texte: string }> {
  const reponse = await fetch(`${url}${chemin}`);
  return { statut: reponse.status, texte: await reponse.text() };
}

// ── 1. LE CAS NORMAL NE BOUGE PAS — c est la premiere garde, pas la derniere ──────────

test('sans parametre, le serveur sert TOUJOURS tests/fixtures/', async () => {
  const serveur = await demarrerServeurFixtures();
  try {
    const { texte } = await corpsDe(serveur.url, '/api/configuration?locale=fr');
    assert.deepEqual(JSON.parse(texte), lireFixture('configuration-fr'));
    assert.ok(!texte.includes(TEMOIN), 'le defaut a change de corpus sans le dire');
  } finally {
    await serveur.arreter();
  }
});

// ── 2. LE DEPLACEMENT, QUI EST L OBJET DE LA TACHE ────────────────────────────────────

test('avec un dossier, le serveur sert CE dossier — locale par locale', async () => {
  const dossier = bancTemoin();
  const serveur = await demarrerServeurFixtures(0, dossier);
  try {
    const fr = await corpsDe(serveur.url, '/api/configuration?locale=fr');
    assert.equal(fr.statut, 200);
    assert.equal(JSON.parse(fr.texte).data.texteFooter[0].children[0].text, TEMOIN);

    // L autre locale vient du meme dossier, et n est pas repliee sur le francais.
    const en = await corpsDe(serveur.url, '/api/configuration?locale=en');
    assert.equal(en.statut, 200);
    assert.equal(JSON.parse(en.texte).data.locale, 'en');
    assert.notEqual(JSON.parse(en.texte).data.texteFooter[0].children[0].text, TEMOIN);

    // Et les collections, pas seulement le Single Type.
    const articles = await corpsDe(serveur.url, '/api/articles?locale=fr');
    assert.equal(articles.statut, 200);
    assert.ok(Array.isArray(JSON.parse(articles.texte).data));
  } finally {
    await serveur.arreter();
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});

// ── 3. LA SORTIE NOMME LE DOSSIER REELLEMENT CONSULTE, JAMAIS `tests/fixtures/` ───────

test('sur un banc temoin ampute, le 500 du serveur nomme le dossier CONSULTE', async () => {
  const dossier = bancTemoin(['configuration-en']);
  const serveur = await demarrerServeurFixtures(0, dossier);
  try {
    const { statut, texte } = await corpsDe(serveur.url, '/api/configuration?locale=en');
    assert.equal(statut, 500);
    assert.ok(
      texte.includes(path.join(dossier, 'configuration-en.json').split(path.sep).join('/')),
      `le corps du 500 ne nomme pas le dossier consulte :\n${texte}`,
    );
    assert.ok(
      !/tests\/fixtures\/configuration-en\.json/.test(texte),
      'le corps du 500 envoie chercher dans tests/fixtures/, ou le fichier EXISTE : le message ment',
    );
  } finally {
    await serveur.arreter();
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});

test('reponseDeFixture nomme le dossier consulte, et tests/fixtures/ quand c est lui', () => {
  const dossier = bancTemoin(['articles-en']);
  try {
    const ailleurs = reponseDeFixture('articles', 'en', dossier);
    assert.equal(ailleurs.corps, undefined);
    assert.equal(ailleurs.incapacite, path.join(dossier, 'articles-en.json').split(path.sep).join('/'));
    // Le cas normal garde sa forme courte et relative — c est ce que tout le monde lit.
    assert.equal(reponseDeFixture('articles', 'en').incapacite, undefined);
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});

test('le message de la 3e issue suit le dossier, il ne recopie plus tests/fixtures/', () => {
  const dossier = bancTemoin();
  try {
    const ici = messageVerificationImpossible('banc par defaut', ['configuration-en']);
    assert.match(ici, /tests\/fixtures\/configuration-en\.json/);

    const ailleurs = messageVerificationImpossible('banc temoin', ['configuration-en'], dossier);
    assert.ok(ailleurs.includes(path.join(dossier, 'configuration-en.json').split(path.sep).join('/')));
    assert.doesNotMatch(ailleurs, /tests\/fixtures\/configuration-en\.json/);
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});

// ── 4. LE CHEMIN DE PREUVE EST VERSIONNE : une ligne de commande, pas un scratchpad ───

test('la ligne de commande sert un banc arbitraire — le serveur du scratchpad cesse d exister', async () => {
  const dossier = bancTemoin();
  const enfant = spawn(process.execPath, [SERVEUR, dossier], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const url = await new Promise<string>((resoudre, rejeter) => {
      let vu = '';
      const minuteur = setTimeout(() => rejeter(new Error(`aucune URL annoncee :\n${vu}`)), 10_000);
      enfant.stdout.on('data', (bloc) => {
        vu += String(bloc);
        const trouve = vu.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (trouve) {
          clearTimeout(minuteur);
          resoudre(trouve[0]);
        }
      });
      enfant.stderr.on('data', (bloc) => {
        vu += String(bloc);
      });
      enfant.on('exit', (code) => {
        clearTimeout(minuteur);
        rejeter(new Error(`le serveur est sorti en ${code} :\n${vu}`));
      });
    });

    const { texte } = await corpsDe(url, '/api/configuration?locale=fr');
    assert.equal(JSON.parse(texte).data.texteFooter[0].children[0].text, TEMOIN);
  } finally {
    enfant.kill();
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});
