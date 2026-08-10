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
 * ou la licence des assets du depot sera arretee (plan editorial §13, point 4 —
 * CC0 1.0 ou CC BY 4.0, decision d'Aymeric, NON PRISE a ce jour), une seule
 * valeur change et les 94 lignes suivent. Stocker la phrase toute faite en
 * ferait une seconde copie de la licence, a diverger — exactement ce que ce
 * depot corrige partout.
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
 * `Œuvre du projet` y figure comme STATUT au sens du §6.2 : nous sommes
 * l'ayant droit, aucune attribution tierce n'est due. Ce n'est pas encore un
 * identifiant de licence publiable — c'est precisement l'objet du §13, point 4,
 * qui reste ouvert.
 */
export const LICENCES_ADMISES = [
  'Œuvre du projet',
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
    return {
      conforme: false,
      motif:
        `licence "${licence.trim()}" hors liste blanche du §6.2. ` +
        `Licences admises : ${listeBlanche()}.`,
    };
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
    echec(`licence "${licence}" hors liste blanche du §6.2. Licences admises : ${listeBlanche()}.`);
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
