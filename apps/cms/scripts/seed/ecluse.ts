/**
 * L'ECLUSE DE PUBLICATION — desarme le webhook `publish_to_coolify` le temps
 * du seed, et le RESTAURE sur tous les chemins de sortie.
 *
 * ------------------------------------------------------------------------
 * POURQUOI CE FICHIER EXISTE
 * ------------------------------------------------------------------------
 * Le seed reecrit chaque article avec `?status=published` ; Strapi 5 republie
 * le document MEME QUAND PAS UN OCTET NE CHANGE ; le webhook
 * `publish_to_coolify` est abonne a `entry.publish` ; chaque republication est
 * donc un deploiement de production. Un corpus complet emet 69 requetes.
 *
 * La consigne d'exploitation « couper le webhook avant un seed » existait,
 * chiffree, a l'endroit exact ou passe celui qui seede (runbook, etape 21 bis).
 * Elle a echoue TROIS FOIS SUR TROIS — 2026-08-07, 2026-08-10, 2026-08-12 —
 * la troisieme fois le jour meme ou une borne etait posee pour la contenir.
 * Une consigne qui n'est jamais suivie n'est pas une consigne mal ecrite :
 * c'est une garantie qui n'existe pas. Elle est donc remplacee par un
 * mecanisme, que personne n'a plus a se rappeler.
 *
 * ------------------------------------------------------------------------
 * LE PIEGE, QUI EST LE VRAI SUJET
 * ------------------------------------------------------------------------
 * Desarmer est facile ; ne pas oublier de reharmer est tout le probleme. Un
 * webhook laisse coupe ne casse rien tout de suite : il fait seulement
 * qu'AUCUNE PUBLICATION NE MET PLUS JAMAIS LE SITE A JOUR. Panne muette, et un
 * mode d'echec PIRE que la rafale qu'on vient d'eviter. D'ou :
 *
 *  1. `try/finally` — le reharmement suit le succes ET l'echec ;
 *  2. gestionnaires de SIGINT / SIGTERM / SIGBREAK / SIGHUP — Ctrl-C compris ;
 *  3. `uncaughtException` / `unhandledRejection` — ce que le `finally` du
 *     travail ne voit pas ;
 *  4. le reharmement est PROUVE par relecture, jamais par le code HTTP de
 *     l'ecriture, et REESSAYE trois fois ;
 *  5. s'il echoue quand meme, l'ecluse HURLE et laisse un code de sortie non
 *     nul : elle ne rapporte jamais un succes qu'elle n'a pas prouve ;
 *  6. une SENTINELLE sur le disque survit a ce qu'aucun gestionnaire ne peut
 *     attraper (SIGKILL, coupure de courant, plantage du noyau) : le prochain
 *     seed la trouve et RATTRAPE le run mort avant de commencer le sien.
 *
 * Le point 6 est la borne honnete de ce mecanisme : entre la mort brutale d'un
 * run et le seed suivant, la publication reste muette. Ce que le rattrapage
 * garantit est qu'elle ne le reste pas indefiniment, et que le trou se referme
 * a l'endroit ou passe forcement celui qui seede.
 *
 * ------------------------------------------------------------------------
 * ET UNE GARDE QU'ON N'ATTENDAIT PAS : L'URL EST UN ETAT ARBITRE
 * ------------------------------------------------------------------------
 * L'API admin de Strapi REFUSE un PUT partiel — mesure sur l'instance le
 * 2026-08-12 :
 *   PUT /admin/webhooks/1  {isEnabled:false}  ->  400 ValidationError
 *     « name is a required field »
 *     « url is a required field »
 *     « Url is not supported because it isn't reachable over the public internet »
 * Basculer l'activation exige donc de RETRANSMETTRE L'OBJET COMPLET : l'URL —
 * etat arbitre par la decision `fae6cd9c` branche A, retrait de `&force=false`
 * — et l'en-tete `Authorization` qui porte le jeton Coolify. Un mecanisme qui
 * reconstruirait mal cet objet ecraserait un arbitrage en silence, ou
 * perdrait le jeton. L'ecluse relit donc l'objet avant chaque ecriture, le
 * retransmet tel quel, et VERIFIE APRES COUP par une empreinte que rien
 * d'autre que `isEnabled` n'a bouge. Sinon elle s'arrete.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Le nom porte par l'instance — avec des SOULIGNES (l'instance fait foi). */
export const NOM_WEBHOOK_PUBLICATION = 'publish_to_coolify';

const TENTATIVES_REHARMEMENT = 3;
const ATTENTE_ENTRE_TENTATIVES_MS = 1500;

export interface Webhook {
  id: number | string;
  name: string;
  url: string;
  headers: Record<string, string>;
  events: string[];
  isEnabled: boolean;
}

export interface AdminStrapi {
  listerWebhooks(): Promise<Webhook[]>;
  /** Reecrit le webhook COMPLET : un PUT partiel rend 400 (cf. en-tete). */
  ecrireWebhook(webhook: Webhook): Promise<void>;
}

export type Journal = (ligne: string) => void;

/**
 * Ce qui NE DOIT PAS bouger quand on bascule l'activation.
 *
 * `isEnabled` en est volontairement absent : c'est le seul champ que l'ecluse
 * a le droit de changer. Tout le reste — nom, URL arbitree, evenements,
 * en-tetes — est compare a l'identique apres chaque ecriture.
 */
export function empreinte(webhook: Webhook): string {
  const entetes = Object.keys(webhook.headers ?? {})
    .sort()
    .map((cle) => `${cle}=${webhook.headers[cle]}`);
  return JSON.stringify([webhook.name, webhook.url, [...webhook.events].sort(), entetes]);
}

/** Ce que l'empreinte peut dire sans imprimer un secret. */
function empreinteLisible(webhook: Webhook): string {
  const entetes = Object.entries(webhook.headers ?? {})
    .map(([cle, valeur]) => `${cle}(${String(valeur).length} car.)`)
    .join(',');
  return `url=${webhook.url} events=[${webhook.events.join(',')}] entetes=${entetes || '(aucun)'}`;
}

class ErreurEcluse extends Error {}

interface Sentinelle {
  nom: string;
  etatAvant: boolean;
  ouvertA: string;
}

export interface OptionsEcluse {
  cheminSentinelle: string;
  journal?: Journal;
  /** Nom du webhook a desarmer. Defaut : `publish_to_coolify`. */
  nom?: string;
  attenteEntreTentativesMs?: number;
}

export class Ecluse {
  private readonly admin: AdminStrapi;
  private readonly cheminSentinelle: string;
  private readonly journal: Journal;
  private readonly nom: string;
  private readonly attente: number;

  /** `null` = rien a restaurer (webhook absent, ou trouve deja desarme). */
  private etatARestaurer: boolean | null = null;
  private idWebhook: Webhook['id'] | null = null;
  private fermee = false;

  constructor(admin: AdminStrapi, options: OptionsEcluse) {
    this.admin = admin;
    this.cheminSentinelle = options.cheminSentinelle;
    this.journal = options.journal ?? ((l) => console.log(l));
    this.nom = options.nom ?? NOM_WEBHOOK_PUBLICATION;
    this.attente = options.attenteEntreTentativesMs ?? ATTENTE_ENTRE_TENTATIVES_MS;
  }

  private async lireWebhook(): Promise<Webhook | null> {
    const tous = await this.admin.listerWebhooks();
    return tous.find((w) => w.name === this.nom) ?? null;
  }

  /**
   * Ecrit `isEnabled` sur le webhook, en retransmettant l'objet complet
   * RELU juste avant, puis PROUVE le resultat par une seconde relecture.
   *
   * Deux choses sont verifiees, et pas une : l'etat demande, et le fait que
   * rien d'autre n'a bouge. La seconde garde l'URL arbitree.
   */
  private async basculerEtProuver(vers: boolean): Promise<void> {
    const avant = await this.lireWebhook();
    if (avant === null) throw new ErreurEcluse(`webhook « ${this.nom} » introuvable sur l'instance`);
    const attendue = empreinte(avant);

    await this.admin.ecrireWebhook({ ...avant, isEnabled: vers });

    const apres = await this.lireWebhook();
    if (apres === null) throw new ErreurEcluse(`webhook « ${this.nom} » disparu apres l'ecriture`);
    if (apres.isEnabled !== vers) {
      throw new ErreurEcluse(
        `l'ecriture n'a pas pris : isEnabled attendu ${vers}, relu ${apres.isEnabled}`
      );
    }
    if (empreinte(apres) !== attendue) {
      throw new ErreurEcluse(
        "l'empreinte du webhook a CHANGE — l'URL est un etat arbitre (fae6cd9c branche A), " +
          `elle ne doit pas bouger.\n  avant : ${empreinteLisible(avant)}\n  apres : ${empreinteLisible(apres)}`
      );
    }
  }

  private lireSentinelle(): Sentinelle | null {
    try {
      return JSON.parse(fs.readFileSync(this.cheminSentinelle, 'utf8')) as Sentinelle;
    } catch {
      return null;
    }
  }

  private poserSentinelle(etatAvant: boolean): void {
    fs.mkdirSync(path.dirname(this.cheminSentinelle), { recursive: true });
    const contenu: Sentinelle = { nom: this.nom, etatAvant, ouvertA: new Date().toISOString() };
    fs.writeFileSync(this.cheminSentinelle, JSON.stringify(contenu, null, 2));
  }

  private retirerSentinelle(): void {
    try {
      fs.rmSync(this.cheminSentinelle);
    } catch {
      /* deja absente : rien a faire */
    }
  }

  /**
   * Rattrape un run precedent mort sans reharmer.
   *
   * C'est le filet que ni `finally` ni un gestionnaire de signal ne peuvent
   * tendre : un SIGKILL, une coupure de courant, un plantage du noyau ne
   * laissent tourner AUCUN code. Ce qui reste est ce qui est sur le disque.
   */
  private async rattraper(): Promise<void> {
    const sentinelle = this.lireSentinelle();
    if (sentinelle === null) return;

    this.journal(
      `RATTRAPAGE — une sentinelle du ${sentinelle.ouvertA} est sur le disque : un seed ` +
        `precedent est mort sans reharmer « ${sentinelle.nom} ». Etat a restaurer : ` +
        `isEnabled=${sentinelle.etatAvant}.`
    );
    const actuel = await this.lireWebhook();
    if (actuel === null) {
      this.journal(`RATTRAPAGE — webhook « ${sentinelle.nom} » introuvable : rien a restaurer.`);
    } else if (actuel.isEnabled === sentinelle.etatAvant) {
      this.journal('RATTRAPAGE — sans objet : le webhook porte deja son etat d avant.');
    } else {
      await this.basculerEtProuver(sentinelle.etatAvant);
      this.journal(
        `RATTRAPAGE fait et PROUVE par relecture : isEnabled=${sentinelle.etatAvant}. ` +
          `La publication etait muette depuis le ${sentinelle.ouvertA}.`
      );
    }
    this.retirerSentinelle();
  }

  /** Desarme le webhook, apres avoir rattrape un eventuel run mort. */
  async ouvrir(): Promise<void> {
    await this.rattraper();

    const webhook = await this.lireWebhook();
    if (webhook === null) {
      this.journal(
        `ecluse : aucun webhook nomme « ${this.nom} » sur cette instance — rien a desarmer. ` +
          'Un seed contre un Strapi local est dans ce cas.'
      );
      this.etatARestaurer = null;
      return;
    }

    this.idWebhook = webhook.id;
    if (!webhook.isEnabled) {
      this.journal(
        `ecluse : « ${this.nom} » est DEJA DESARME — laisse tel quel, l'ecluse restaure ce ` +
          "qu'elle trouve, elle n'arme rien d'autorite. ⚠️ Une PUBLICATION MUETTE preexiste " +
          'donc a ce seed : plus aucune publication ne met le site a jour tant que ce webhook ' +
          'reste coupe.'
      );
      this.etatARestaurer = null;
      return;
    }

    // La sentinelle est posee AVANT l'ecriture : si le processus meurt entre
    // les deux, le rattrapage restaurera `true` sur un webhook deja a `true`
    // — sans objet, donc inoffensif. L'ordre inverse laisserait un webhook
    // desarme sans aucune trace sur le disque.
    this.poserSentinelle(true);
    await this.basculerEtProuver(false);
    this.etatARestaurer = true;
    this.journal(
      `ecluse OUVERTE : « ${this.nom} » DESARME et prouve par relecture (isEnabled=false). ` +
        'Les publications du seed n emettent plus aucun appel de deploiement. ' +
        `Empreinte inchangee : ${empreinteLisible(webhook)}`
    );
  }

  /**
   * Restaure l'etat trouve a l'ouverture. Rend `false` si — et seulement si —
   * la restauration n'a pas pu etre PROUVEE.
   */
  async fermer(): Promise<boolean> {
    if (this.fermee) return true;
    this.fermee = true;

    if (this.etatARestaurer === null) {
      this.retirerSentinelle();
      this.journal('ecluse FERMEE : rien a restaurer.');
      return true;
    }

    const cible = this.etatARestaurer;
    let derniere: unknown = null;
    for (let tentative = 1; tentative <= TENTATIVES_REHARMEMENT; tentative += 1) {
      try {
        await this.basculerEtProuver(cible);
        this.retirerSentinelle();
        this.journal(
          `ecluse FERMEE : « ${this.nom} » REHARME et prouve par relecture ` +
            `(isEnabled=${cible})${tentative > 1 ? ` — a la tentative ${tentative}` : ''}.`
        );
        return true;
      } catch (e) {
        derniere = e;
        this.journal(
          `ecluse : tentative ${tentative}/${TENTATIVES_REHARMEMENT} de reharmement echouee — ${
            e instanceof Error ? e.message : String(e)
          }`
        );
        if (tentative < TENTATIVES_REHARMEMENT) {
          await new Promise((r) => setTimeout(r, this.attente));
        }
      }
    }

    this.journal(
      [
        '',
        '################################################################',
        '#  PUBLICATION MUETTE — LE WEBHOOK EST RESTE DESARME.          #',
        '################################################################',
        '',
        `Le webhook « ${this.nom} » (id ${this.idWebhook ?? '?'}) a ete desarme pour ce seed et`,
        `n'a PAS pu etre reharme en ${TENTATIVES_REHARMEMENT} tentatives.`,
        `Derniere erreur : ${derniere instanceof Error ? derniere.message : String(derniere)}`,
        '',
        'CE QUE CELA VEUT DIRE, MAINTENANT : plus aucune publication dans Strapi',
        'ne met le site a jour. Rien ne casse, rien ne s allume en rouge — le site',
        'se contente de ne plus jamais changer. Ce mode d echec est PIRE que la',
        'rafale de deploiements que ce desarmement evitait.',
        '',
        'A FAIRE A LA MAIN, MAINTENANT :',
        `  back-office Strapi -> Settings -> Webhooks -> ${this.nom} -> Enabled = ON`,
        '  puis PROUVER la remise par relecture (runbook, etape 21 bis).',
        '',
        `La sentinelle est laissee sur le disque : ${this.cheminSentinelle}`,
        'Le prochain `npm run seed` la trouvera et rattrapera tout seul.',
        '################################################################',
        '',
      ].join('\n')
    );
    return false;
  }
}

const SIGNAUX = ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP'] as const;

/**
 * Fait traverser l'ecluse a un travail : desarme avant, restaure APRES, quel
 * que soit le chemin de sortie.
 *
 * Le contrat qui compte : cette fonction ne rend la main sans avoir ferme
 * l'ecluse dans AUCUN cas qu'elle peut observer. Si la fermeture n'est pas
 * prouvee, elle leve — un appelant qui rapporterait un succes serait en train
 * de certifier une publication muette.
 */
export async function traverser<T>(ecluse: Ecluse, travail: () => Promise<T>): Promise<T> {
  await ecluse.ouvrir();

  let sortiePrise = false;

  /**
   * Ferme l'ecluse puis quitte — pour les chemins que `finally` ne voit pas.
   *
   * Le geste de sortie n'est PAS `process.exit()`. Ce depot a deja paye ce
   * defaut une fois (`tests/seed-code-sortie.test.ts`) : `process.exit()` coupe
   * les handles libuv encore ouverts — ici les sockets keep-alive vers Strapi —
   * et, sur Node 24 / Windows, fait AVORTER le processus (« Assertion failed:
   * !(handle->flags & UV_HANDLE_CLOSING), file src\\win\\async.c », 0xC0000409)
   * APRES avoir imprime la bonne sortie. Le texte dirait vrai, le code de
   * retour mentirait — et c'est le code de retour que lit une chaine
   * automatisee.
   *
   * Pour un signal, on retablit donc la disposition par defaut et on SE
   * RENVOIE le signal : le systeme termine le processus lui-meme, sans
   * demontage libuv. C'est aussi ce qui donne le bon statut (128+N la ou les
   * signaux existent).
   */
  const sortirEnFermant = async (motif: string, quitter: (ok: boolean) => void) => {
    if (sortiePrise) return;
    sortiePrise = true;
    console.error(`\n${motif} — fermeture de l'ecluse avant de sortir.`);
    const ok = await ecluse.fermer();
    quitter(ok);
  };

  const surSignal: Record<string, () => void> = {};
  for (const signal of SIGNAUX) {
    surSignal[signal] = () => {
      void sortirEnFermant(`INTERRUPTION (${signal})`, (ok) => {
        if (!ok) {
          // Reharmement non prouve : le code de sortie doit le dire, et un
          // statut de signal ne le dirait pas. Ici, et ici seulement, on force.
          process.exitCode = 1;
          process.exit(1);
        }
        process.off(signal, surSignal[signal]);
        process.kill(process.pid, signal);
      });
    };
    process.on(signal, surSignal[signal]);
  }
  const surException = (e: unknown) => {
    void sortirEnFermant(
      `EXCEPTION NON RATTRAPEE (${e instanceof Error ? e.message : String(e)})`,
      // Pas de signal a se renvoyer ici : il faut bien sortir soi-meme. Le
      // code est non nul dans les deux cas, ce qui est la seule chose qu'une
      // chaine automatisee doit pouvoir croire.
      () => process.exit(1)
    );
  };
  process.on('uncaughtException', surException);
  process.on('unhandledRejection', surException);

  const derenregistrer = () => {
    for (const signal of SIGNAUX) process.off(signal, surSignal[signal]);
    process.off('uncaughtException', surException);
    process.off('unhandledRejection', surException);
  };

  try {
    return await travail();
  } finally {
    derenregistrer();
    if (!sortiePrise) {
      const ok = await ecluse.fermer();
      if (!ok) {
        throw new ErreurEcluse(
          'le webhook de publication n a pas pu etre reharme — cf. le bloc ci-dessus.'
        );
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Le client HTTP de l'API admin                                       */
/* ------------------------------------------------------------------ */

/**
 * `POST /admin/login` rend un jeton, `GET|PUT /admin/webhooks` s'en servent.
 *
 * Ce chemin est celui du runbook, et c'est un choix, pas un defaut : la table
 * `strapi_webhooks` est atteignable en SQL sur cette instance (aucune colonne
 * `encrypted`, en-tetes en clair dans un `jsonb`), mais une ecriture SQL
 * contournerait la validation de Strapi et son cache de webhooks. On passe par
 * l'API, jamais par la base.
 *
 * ⚠️ LE JETON EST MIS EN CACHE, ET CE N'EST PAS UNE OPTIMISATION — C'EST LA
 * CONDITION DU REHARMEMENT. `POST /admin/login` est limite en debit par Strapi
 * (429 constate sur l'instance le 2026-08-12, apres quelques ouvertures
 * rapprochees). Une ecluse qui se reconnecterait pour fermer pourrait donc se
 * voir REFUSER le droit de reharmer, et laisserait la publication muette — le
 * mode d'echec exact que tout ce fichier existe pour empecher. Un seul login,
 * au tout debut, reutilise jusqu'a la fermeture : le reharmement ne depend
 * d'aucune requete qui puisse etre limitee en debit. `tests/seed-ecluse.test.ts`
 * le tient.
 *
 * Corollaire, benin par comparaison : un 429 a l'OUVERTURE fait echouer
 * `ouvrir()`, donc refuser le seed — rien n'est ecrit, rien n'est desarme.
 * Echouer ferme est le bon sens de l'echec.
 */
export class ClientAdminHttp implements AdminStrapi {
  private readonly base: string;
  private readonly email: string;
  private readonly motDePasse: string;
  private jeton: string | null = null;

  constructor(base: string, email: string, motDePasse: string) {
    this.base = base.replace(/\/+$/, '');
    this.email = email;
    this.motDePasse = motDePasse;
  }

  private async seConnecter(): Promise<string> {
    if (this.jeton !== null) return this.jeton;
    const url = `${this.base}/admin/login`;
    const reponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.motDePasse }),
    });
    const texte = await reponse.text();
    if (!reponse.ok) {
      // Le corps d'un echec de login peut porter l'email : on ne le recopie pas.
      const explication =
        reponse.status === 429
          ? " — Strapi limite le debit de /admin/login. Attendre quelques minutes ; rien n'a ete ecrit ni desarme."
          : reponse.status === 400 || reponse.status === 401
            ? ' — identifiants admin refuses (SEED_STRAPI_ADMIN_EMAIL / SEED_STRAPI_ADMIN_PASSWORD).'
            : '';
      throw new ErreurEcluse(`POST /admin/login -> ${reponse.status}${explication}`);
    }
    const jeton = JSON.parse(texte)?.data?.token;
    if (typeof jeton !== 'string' || jeton === '') {
      throw new ErreurEcluse('POST /admin/login -> 200 mais aucun jeton dans la reponse');
    }
    this.jeton = jeton;
    return jeton;
  }

  async listerWebhooks(): Promise<Webhook[]> {
    const jeton = await this.seConnecter();
    const url = `${this.base}/admin/webhooks`;
    const reponse = await fetch(url, { headers: { Authorization: `Bearer ${jeton}` } });
    const texte = await reponse.text();
    if (!reponse.ok) throw new ErreurEcluse(`GET /admin/webhooks -> ${reponse.status} ${texte}`);
    return JSON.parse(texte)?.data ?? [];
  }

  async ecrireWebhook(webhook: Webhook): Promise<void> {
    const jeton = await this.seConnecter();
    const url = `${this.base}/admin/webhooks/${webhook.id}`;
    // L'OBJET COMPLET : un PUT partiel rend 400 (cf. en-tete de fichier).
    const corps = {
      name: webhook.name,
      url: webhook.url,
      headers: webhook.headers,
      events: webhook.events,
      isEnabled: webhook.isEnabled,
    };
    const reponse = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    const texte = await reponse.text();
    if (!reponse.ok) {
      // Le corps d'un 4xx de cette route ne contient pas le jeton du webhook
      // (il valide des champs, il ne les recopie pas) : il est sur a citer.
      throw new ErreurEcluse(`PUT /admin/webhooks/${webhook.id} -> ${reponse.status} ${texte}`);
    }
  }
}
