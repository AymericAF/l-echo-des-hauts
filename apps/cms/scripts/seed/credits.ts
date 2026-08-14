/**
 * La LIGNE DE CREDIT d'un media : son format, sa liste blanche, sa composition.
 *
 * FORMAT IMPOSE PAR LE CADRAGE (plan editorial §6.5, tableau « Credit /
 * licence ») :
 *
 *     <Auteur ou « Œuvre du projet »> — <Licence> — <modifications si CC BY>
 *
 * Il vit dans le `caption` NATIF de la mediatheque, et nulle part ailleurs :
 * c'est ce qui le fait voyager avec le fichier, donc rester juste partout ou
 * l'image est reutilisee. Depuis le 2026-08-10 il est PUBLIE, sous chaque
 * portrait d'auteur, comme ligne de credit (§13, point 6b, option (ii)).
 *
 * POURQUOI CE MODULE EXISTE. La seule garde qui regardait ce champ exigeait
 * « non vide » (`corpus.ts`, controle 5 du plan). Une phrase quelconque la
 * satisfaisait : les 94 medias du manifeste rendaient une legende editoriale
 * qui ne nommait NI ayant droit NI licence. Un credit qui ne credite rien est
 * pire qu'un credit absent — il a l'air de remplir l'obligation, et personne ne
 * revient dessus. Une garde qui verifie la PRESENCE et non la CONFORMITE ne
 * garde rien.
 *
 * POURQUOI LE CREDIT EST COMPOSE, ET NON RECOPIE. Le manifeste porte deja les
 * champs de la source (`ayantDroit`, `licence`, `modifications`). Composer la
 * ligne a partir d'eux fait de la source la SEULE origine du credit : le jour
 * ou la licence des assets du depot sera arretee (plan editorial §13, point 4),
 * une seule valeur change et les 94 lignes suivent. Stocker la phrase toute
 * faite en ferait une seconde copie de la licence, a diverger — exactement ce
 * que ce depot corrige partout.
 *
 * CE PARI A ETE TENU, ET C'EST DESORMAIS UN FAIT PLUTOT QU'UNE PROMESSE. Le
 * 2026-08-10, la decision `90276751` (branche A) a arrete la licence des assets
 * du depot : **CC0 1.0**. Une seule valeur a change dans
 * `data/medias/manifeste.json` — 94 occurrences du meme champ, aucune ligne de
 * code, aucune migration — et les 94 credits publies sont passes du tautologique
 * « Œuvre du projet — Œuvre du projet » a « Œuvre du projet — CC0 1.0 ».
 */

/** Le separateur du §6.5 : tiret cadratin entoure d'une espace. */
export const SEPARATEUR = '—';
const SEP = ` ${SEPARATEUR} `;

/**
 * Les licences admises — liste blanche du plan editorial §6.2 (« Convient »),
 * etendue par D.3 pour la voie D. Toute autre valeur est refusee, y compris
 * celles que le §6.2 exclut nommement (SA, NC, ND, banques d'images) : une
 * licence absente de cette liste n'est pas « a verifier », elle est refusee.
 *
 * `Œuvre du projet` N'Y FIGURE PLUS — decision `887d2cfd`, branche A,
 * approuvee par Aymeric le 2026-08-11. C'est un STATUT au sens du §6.2 (nous
 * sommes l'ayant droit, aucune attribution tierce n'est due), jamais un
 * identifiant de licence publiable ; depuis que le §13 point 4 est tranche
 * (2026-08-10, decision `90276751`), tout media entrant au corpus porte une
 * licence formelle — `CC0 1.0` pour les 94 —, et le statut ne vaut plus que
 * comme premier segment, l'`ayantDroit`.
 *
 * CE QUE LE RETRAIT NE CASSE PAS, et c'est la raison pour laquelle il est sans
 * risque : cette liste n'est opposee qu'au SECOND segment. L'ayant droit, lui,
 * n'est controle que sur son caractere non vide (`verifierFormatCredit`,
 * ci-dessous). Mesure du 2026-08-10, REFAITE le 2026-08-11 sur le corpus du
 * jour plutot que reprise sur parole : 94 medias charges, 94 en `CC0 1.0` en
 * licence, 94 en « Œuvre du projet » en ayant droit, zero hors format. Aucune
 * des 94 lignes servies ne change d'un caractere.
 *
 * CE QUE LE RETRAIT ACHETE : la ligne tautologique « Œuvre du projet — Œuvre du
 * projet » — celle que le depot publiait avant le 2026-08-10, qui ne credite
 * rien — cesse d'etre representable. Elle etait jusqu'ici refusee par un
 * CONSTAT sur le corpus reel (`tests/seed-corpus.test.ts`, §13 point 4) et non
 * par la garde : un media entrant l'aurait passee sans broncher. Constater un
 * etat et tenir un invariant sont deux choses.
 */
export const LICENCES_ADMISES = [
  "Photographie d'Aymeric Filliot",
  'CC0 1.0',
  'Public Domain Mark 1.0',
  'Domaine public',
  'CC BY 4.0',
] as const;

export type Licence = (typeof LICENCES_ADMISES)[number];

/** Les licences dont l'attribution est obligatoire exigent le 3e segment. */
const ATTRIBUTION_OBLIGATOIRE = (licence: string) => licence.startsWith('CC BY ');

export type Verdict = { conforme: true } | { conforme: false; motif: string };

export type SourceCredit = {
  /** L'ayant droit : le nom de l'auteur, ou « Œuvre du projet ». */
  ayantDroit: string;
  /** L'identifiant EXACT de la licence, releve a la source (§6.8). */
  licence: string;
  /** Les modifications apportees — obligatoire sous CC BY (§6.5). */
  modifications?: string;
};

const listeBlanche = () => LICENCES_ADMISES.join(', ');

/**
 * Le motif du refus « hors liste blanche », ecrit UNE fois pour les deux points
 * de controle — la garde de format et le composeur. Deux copies d'un meme motif
 * finissent par diverger, et c'est le lecteur du refus qui paie l'ecart.
 *
 * POURQUOI IL NOMME LE SEGMENT PLUTOT QUE LE SEUL « §6.2 ». La formulation
 * d'origine opposait la valeur lue au « §6.2 » et s'arretait la. Or le §6.2 du
 * plan editorial est une table EDITORIALE : elle recense ce qu'on a le droit
 * d'employer comme SOURCE — des licences ET des statuts d'ayant droit. « Œuvre
 * du projet » y figure sous « Convient », et il y RESTE (§13, point 4). Un
 * lecteur envoye la par ce message y lisait donc l'inverse de ce qu'il venait
 * de subir, et concluait a un ecart entre le code et le cadrage. Il n'y en a
 * pas : cette liste-ci ne juge que le SECOND segment. Le motif le dit
 * desormais lui-meme, sans qu'il faille ouvrir le plan pour lever le doute.
 */
const horsListeBlanche = (licence: string) =>
  `licence "${licence}" hors liste blanche — SECOND segment de la ligne de credit, ` +
  'celui qui doit nommer une licence. Le §6.2 du plan editorial recense aussi des ' +
  'STATUTS d ayant droit, qui relevent du PREMIER segment : les y trouver ne ' +
  `contredit pas ce refus. Licences admises : ${listeBlanche()}.`;

/**
 * Le format du §6.5, exerce segment par segment.
 *
 * Le motif rendu doit dire CE QUI MANQUE : « non conforme » oblige a rouvrir le
 * cadrage pour savoir quoi corriger, et c'est ce qui fait desarmer une garde.
 */
export function verifierFormatCredit(credit: unknown): Verdict {
  if (typeof credit !== 'string' || credit.trim() === '') {
    return {
      conforme: false,
      motif:
        'ligne de credit vide ou absente. Format attendu (§6.5) : ' +
        `<Auteur ou « Œuvre du projet »>${SEP}<Licence>${SEP}<modifications si CC BY>`,
    };
  }

  const segments = credit.split(SEP);
  if (segments.length < 2) {
    return {
      conforme: false,
      motif:
        `separateur « ${SEPARATEUR} » absent : la ligne ne nomme pas de licence. ` +
        `Format attendu (§6.5) : <Auteur ou « Œuvre du projet »>${SEP}<Licence>` +
        `${SEP}<modifications si CC BY>. Lu : "${credit}"`,
    };
  }
  if (segments.length > 3) {
    return {
      conforme: false,
      motif:
        `${segments.length} segments : le format du §6.5 en compte deux ou trois ` +
        `(ayant droit, licence, et les modifications sous CC BY). Lu : "${credit}"`,
    };
  }

  const [ayantDroit, licence, modifications] = segments;

  if (ayantDroit.trim() === '') {
    return {
      conforme: false,
      motif:
        'ayant droit vide : le premier segment nomme l auteur, ou porte ' +
        '« Œuvre du projet ». Il ne se devine pas et ne s invente jamais (§6.8).',
    };
  }
  if (!(LICENCES_ADMISES as readonly string[]).includes(licence.trim())) {
    return { conforme: false, motif: horsListeBlanche(licence.trim()) };
  }
  if (ATTRIBUTION_OBLIGATOIRE(licence.trim()) && (modifications ?? '').trim() === '') {
    return {
      conforme: false,
      motif:
        `licence "${licence.trim()}" : l attribution est obligatoire, le §6.5 exige ` +
        'un troisieme segment nommant les modifications apportees (recadrage, ' +
        'conversion, jeu de tailles).',
    };
  }

  return { conforme: true };
}

/**
 * Compose la ligne de credit depuis les champs de la source, et NOMME LE MEDIA
 * quand elle ne peut pas l'etre. Une erreur qui ne dit pas sur quel fichier
 * elle porte oblige a chercher, sur 94 entrees.
 */
export function composerCredit(source: SourceCredit, cle: string): string {
  const echec = (motif: string): never => {
    throw new Error(
      `manifeste des medias, "${cle}" : ${motif}\n` +
        `  Le credit se compose depuis la source ; il ne se recopie pas (§6.5).`
    );
  };

  const ayantDroit = typeof source?.ayantDroit === 'string' ? source.ayantDroit.trim() : '';
  const licence = typeof source?.licence === 'string' ? source.licence.trim() : '';
  const modifications =
    typeof source?.modifications === 'string' ? source.modifications.trim() : '';

  if (ayantDroit === '') {
    echec(
      'champ `ayantDroit` vide ou absent. Il nomme l ayant droit du fichier — ' +
        'le nom de l auteur, ou « Œuvre du projet ». Il se releve, il ne s invente jamais (§6.8).'
    );
  }
  if (licence === '') {
    echec(
      'champ `licence` vide ou absent. Il porte l identifiant EXACT releve a la ' +
        `source. Licences admises (§6.2) : ${listeBlanche()}.`
    );
  }
  if (!(LICENCES_ADMISES as readonly string[]).includes(licence)) {
    echec(horsListeBlanche(licence));
  }
  for (const [nom, valeur] of [
    ['ayantDroit', ayantDroit],
    ['licence', licence],
    ['modifications', modifications],
  ] as const) {
    if (valeur.includes(SEPARATEUR)) {
      echec(
        `le champ \`${nom}\` porte le separateur « ${SEPARATEUR} » ("${valeur}") : ` +
          'il decouperait la ligne en segments qui ne veulent rien dire.'
      );
    }
  }
  if (ATTRIBUTION_OBLIGATOIRE(licence) && modifications === '') {
    echec(
      `licence "${licence}" : l attribution est obligatoire, le §6.5 exige la mention ` +
        'des modifications apportees. Renseigner le champ `modifications`.'
    );
  }

  const credit = [ayantDroit, licence, ...(modifications === '' ? [] : [modifications])].join(SEP);

  // La composition doit passer sa propre garde. Sans ce controle, une evolution
  // du composeur pourrait fabriquer une ligne que la garde refuserait ailleurs :
  // le seed serait vert et le registre faux.
  const verdict = verifierFormatCredit(credit);
  if (!verdict.conforme) echec(`la ligne composee ne passe pas sa propre garde — ${verdict.motif}`);

  return credit;
}
