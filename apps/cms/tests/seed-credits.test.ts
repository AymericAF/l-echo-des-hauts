/**
 * La LIGNE DE CREDIT d'un media, et la garde qui exige son FORMAT.
 *
 * Ce que ce fichier protege, et pourquoi il existe. Le `caption` natif de la
 * mediatheque est, depuis le 2026-08-10, PUBLIE sous chaque portrait d'auteur
 * comme ligne de credit. Jusque-la il dormait dans la mediatheque, et la seule
 * garde qui le regardait exigeait « non vide » : n'importe quelle phrase la
 * satisfaisait. Les medias du manifeste rendaient donc une phrase qui ne
 * nommait NI ayant droit NI licence — un credit qui ne credite rien, ce qui est
 * pire qu'un credit absent puisqu'il a l'air de remplir l'obligation.
 *
 * Le format est impose par le cadrage (plan editorial §6.5) :
 *
 *     <Auteur ou « Œuvre du projet »> — <Licence> — <modifications si CC BY>
 *
 * Une garde qui verifie la PRESENCE et non la CONFORMITE ne garde rien : c'est
 * le motif que ce projet ferme partout. Les cas ci-dessous exercent les deux
 * sens — ce qui doit passer, et ce qui doit etre REFUSE EN NOMMANT ce qui
 * manque. Le refus muet est un echec de test au meme titre que l'acceptation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LICENCES_ADMISES,
  SEPARATEUR,
  composerCredit,
  verifierFormatCredit,
} from '../scripts/seed/credits.ts';

/* ------------------------------------------------------------------ */
/* Le format lui-meme                                                  */
/* ------------------------------------------------------------------ */

test('un credit au format, sans modifications, est accepte', () => {
  const verdict = verifierFormatCredit('Œuvre du projet — CC0 1.0');
  assert.equal(verdict.conforme, true);
});

test('un credit au format avec la mention des modifications est accepte', () => {
  const verdict = verifierFormatCredit('Jeanne Aubry — CC BY 4.0 — recadre en carre, converti en AVIF');
  assert.equal(verdict.conforme, true);
});

test('un credit VIDE reste refuse — la garde precedente n est pas perdue', () => {
  for (const vide of ['', '   ', '\n']) {
    const verdict = verifierFormatCredit(vide);
    assert.equal(verdict.conforme, false, `"${vide}" aurait du etre refuse`);
    assert.match(verdict.motif, /vide/i);
  }
});

test('un credit absent (non-chaine) reste refuse', () => {
  for (const absent of [undefined, null, 42, {}]) {
    const verdict = verifierFormatCredit(absent as never);
    assert.equal(verdict.conforme, false);
    assert.match(verdict.motif, /vide|absent/i);
  }
});

test('une phrase quelconque — ce que le depot publiait — est REFUSEE', () => {
  // Le texte exact des cinq portraits publies le 2026-08-10.
  const verdict = verifierFormatCredit(
    "Portrait graphique genere ; aucune personne reelle n'est representee"
  );
  assert.equal(verdict.conforme, false);
  // Le motif doit dire CE QUI MANQUE, pas seulement « non conforme ».
  assert.match(verdict.motif, /separateur|format/i);
  assert.match(verdict.motif, /—/);
});

test('un credit a un seul segment est refuse : il ne nomme pas de licence', () => {
  const verdict = verifierFormatCredit('Œuvre du projet');
  assert.equal(verdict.conforme, false);
  assert.match(verdict.motif, /licence/i);
});

test('un credit a quatre segments est refuse : le format en compte deux ou trois', () => {
  const verdict = verifierFormatCredit('A — CC BY 4.0 — recadre — et autre chose');
  assert.equal(verdict.conforme, false);
  assert.match(verdict.motif, /deux|trois|segment/i);
});

test('un ayant droit vide est refuse, et le motif le nomme', () => {
  const verdict = verifierFormatCredit(' — CC0 1.0');
  assert.equal(verdict.conforme, false);
  assert.match(verdict.motif, /ayant droit/i);
});

test('une licence hors liste blanche est refusee, et le motif CITE la licence lue', () => {
  const verdict = verifierFormatCredit('Jeanne Aubry — CC BY-SA 4.0');
  assert.equal(verdict.conforme, false);
  assert.match(verdict.motif, /CC BY-SA 4\.0/);
  assert.match(verdict.motif, /liste blanche|admise/i);
});

test('CC BY sans mention des modifications est refuse — §6.5 l exige', () => {
  const verdict = verifierFormatCredit('Jeanne Aubry — CC BY 4.0');
  assert.equal(verdict.conforme, false);
  assert.match(verdict.motif, /modification/i);
});

test('une licence sans attribution obligatoire n exige PAS de troisieme segment', () => {
  for (const licence of LICENCES_ADMISES.filter((l) => !l.startsWith('CC BY '))) {
    const verdict = verifierFormatCredit(`Œuvre du projet ${SEPARATEUR} ${licence}`);
    assert.equal(verdict.conforme, true, `${licence} aurait du passer`);
  }
});

test('le separateur est le tiret cadratin entoure d espaces, pas un tiret court', () => {
  // La licence est admise dans les deux cas : ce qui doit faire echouer ici est
  // le SEPARATEUR et lui seul, sinon le test passerait pour la mauvaise raison.
  assert.equal(verifierFormatCredit('Œuvre du projet - CC0 1.0').conforme, false);
  assert.equal(verifierFormatCredit('Œuvre du projet–CC0 1.0').conforme, false);
});

/* ------------------------------------------------------------------ */
/* La composition depuis les champs de la source                       */
/* ------------------------------------------------------------------ */

/**
 * `assert.throws` rend `undefined` : il verifie qu'on jette, jamais CE QU'ON
 * DIT. Or tout l'enjeu ici est le MESSAGE — un refus qui ne nomme ni le media
 * ni ce qui manque oblige a chercher sur une centaine d'entrees, et c'est ce
 * qui fait desarmer une garde. On capture donc l'erreur pour la lire.
 */
function capturer(fn: () => unknown): Error {
  try {
    fn();
  } catch (e) {
    return e as Error;
  }
  assert.fail('aucune erreur jetee — le refus attendu n a pas eu lieu');
}

test('composerCredit rend une chaine qui passe sa propre garde', () => {
  const credit = composerCredit(
    { ayantDroit: 'Œuvre du projet', licence: 'CC0 1.0' },
    'auteurs/x.svg'
  );
  assert.equal(credit, 'Œuvre du projet — CC0 1.0');
  assert.equal(verifierFormatCredit(credit).conforme, true);
});

test('composerCredit reporte la mention des modifications quand elle est donnee', () => {
  const credit = composerCredit(
    { ayantDroit: 'Jeanne Aubry', licence: 'CC BY 4.0', modifications: 'recadre en carre' },
    'auteurs/y.jpg'
  );
  assert.equal(credit, 'Jeanne Aubry — CC BY 4.0 — recadre en carre');
});

test('composerCredit NOMME LE MEDIA et ce qui manque quand un champ est absent', () => {
  const erreur = capturer(() => composerCredit({ licence: 'CC0 1.0' } as never, 'couvertures/A01.svg'));
  assert.match(erreur.message, /couvertures\/A01\.svg/);
  assert.match(erreur.message, /ayantDroit/);
});

test('composerCredit refuse une licence hors liste blanche en la citant', () => {
  const erreur = capturer(() =>
    composerCredit({ ayantDroit: 'X', licence: 'Unsplash' }, 'blocs/A01-poste-source.svg')
  );
  assert.match(erreur.message, /blocs\/A01-poste-source\.svg/);
  assert.match(erreur.message, /Unsplash/);
});

test('composerCredit refuse un ayant droit qui porte le separateur — il casserait le format', () => {
  const erreur = capturer(() =>
    composerCredit({ ayantDroit: 'A — B', licence: 'CC0 1.0' }, 'identite/logo.svg')
  );
  assert.match(erreur.message, /identite\/logo\.svg/);
  assert.match(erreur.message, /—/);
});

test('la liste blanche est celle du §6.2 / D.3, et elle ne contient aucune licence exclue', () => {
  for (const exclue of ['CC BY-SA 4.0', 'CC BY-NC 4.0', 'CC BY-ND 4.0', 'Unsplash', 'Pexels']) {
    assert.equal(
      LICENCES_ADMISES.includes(exclue as never),
      false,
      `${exclue} est exclue par le §6.2 et ne doit pas figurer en liste blanche`
    );
  }
  assert.ok(LICENCES_ADMISES.includes('CC BY 4.0' as never));
  assert.ok(LICENCES_ADMISES.includes('CC0 1.0' as never));
});

/* ------------------------------------------------------------------ */
/* « Œuvre du projet » N EST PLUS UNE LICENCE — decision 887d2cfd,      */
/* branche A, approuvee par Aymeric le 2026-08-11.                      */
/*                                                                      */
/* Ce qui est retire est un STATUT qui se faisait passer pour une        */
/* licence. Depuis que le §13 point 4 est tranche (decision 90276751,    */
/* CC0 1.0), tout media entrant au corpus porte une licence formelle :   */
/* accepter encore « Œuvre du projet » en second segment laissait la     */
/* porte ouverte a la ligne tautologique « Œuvre du projet — Œuvre du    */
/* projet », qui ne credite rien et que la garde de format laissait      */
/* passer sans broncher.                                                 */
/*                                                                      */
/* CE QUE CE RETRAIT NE TOUCHE PAS, et c est tout l enjeu : la liste     */
/* blanche n est opposee qu au SECOND segment. « Œuvre du projet » reste */
/* l AYANT DROIT des medias du corpus — premier segment, controle sur    */
/* son seul caractere non vide. Les tests ci-dessous exercent les deux   */
/* sens : ce qui doit desormais etre REFUSE, et ce qui doit rester       */
/* ACCEPTE au caractere pres.                                            */
/* ------------------------------------------------------------------ */

test('« Œuvre du projet » ne figure PLUS en liste blanche des licences', () => {
  assert.equal(
    LICENCES_ADMISES.includes('Œuvre du projet' as never),
    false,
    'le statut d ayant droit n est pas un identifiant de licence publiable ' +
      '(decision 887d2cfd, branche A)'
  );
});

test('un credit qui annonce « Œuvre du projet » en LICENCE est REFUSE, motif a l appui', () => {
  const verdict = verifierFormatCredit('Œuvre du projet — Œuvre du projet');
  assert.equal(verdict.conforme, false, 'la ligne tautologique doit etre refusee');
  // Le motif doit CITER la valeur lue et dire d ou vient le refus, sinon il
  // oblige a rouvrir le cadrage pour savoir quoi corriger.
  assert.match(verdict.motif, /Œuvre du projet/);
  assert.match(verdict.motif, /liste blanche|admise/i);
});

test('composerCredit refuse « Œuvre du projet » en licence EN NOMMANT LE MEDIA', () => {
  const erreur = capturer(() =>
    composerCredit(
      { ayantDroit: 'Œuvre du projet', licence: 'Œuvre du projet' },
      'couvertures/A05.svg'
    )
  );
  // Un refus qui ne dit pas sur quel fichier il porte oblige a chercher sur une
  // centaine d entrees : c est ce qui fait desarmer une garde.
  assert.match(erreur.message, /couvertures\/A05\.svg/, 'le refus doit NOMMER le media');
  assert.match(erreur.message, /Œuvre du projet/);
  assert.match(erreur.message, /liste blanche/i);
});

test('LE CAS NORMAL EST INTACT — « Œuvre du projet » reste l AYANT DROIT des medias du corpus', () => {
  // C est exactement la ligne que portent les medias du corpus reel, et
  // celle qui est PUBLIEE sous les cinq portraits d auteur.
  const credit = composerCredit(
    { ayantDroit: 'Œuvre du projet', licence: 'CC0 1.0' },
    'auteurs/theo-brissac.svg'
  );
  assert.equal(credit, 'Œuvre du projet — CC0 1.0');
  assert.equal(verifierFormatCredit(credit).conforme, true);
});

/* ------------------------------------------------------------------ */
/* Le refus NOMME LE SEGMENT qu il controle — sinon il envoie lire une  */
/* contradiction qui n existe pas.                                      */
/* ------------------------------------------------------------------ */

/**
 * Le §6.2 du plan editorial est une table EDITORIALE : elle recense ce qu on a
 * le droit d employer comme SOURCE, licences ET statuts d ayant droit. « Œuvre
 * du projet » y figure sous « Convient », et il y reste (§13, point 4).
 *
 * `LICENCES_ADMISES`, elle, n est opposee qu au SECOND segment de la ligne de
 * credit. Les deux enonces sont compatibles — mais un motif de refus qui
 * n oppose que « le §6.2 » envoie le lecteur y verifier un ecart qui n existe
 * pas, et ce qu il y trouvera lui donnera l air d avoir raison. Le motif doit
 * donc dire de lui-meme QUEL segment il juge, sans qu on ait a ouvrir le plan.
 */
test('le refus nomme le SECOND segment, et le distingue du PREMIER', () => {
  const verdict = verifierFormatCredit('Œuvre du projet — Œuvre du projet');
  assert.equal(verdict.conforme, false);
  assert.match(verdict.motif, /second segment/i, 'le motif doit nommer le segment controle');
  assert.match(verdict.motif, /premier segment/i, 'et le distinguer de celui de l ayant droit');
});

test('composerCredit nomme lui aussi le segment — c est le message que lit qui ajoute un media', () => {
  const erreur = capturer(() =>
    composerCredit({ ayantDroit: 'X', licence: 'Unsplash' }, 'blocs/A01-poste-source.svg')
  );
  assert.match(erreur.message, /second segment/i);
  assert.match(erreur.message, /premier segment/i);
});
