import fs from 'node:fs';
import path from 'node:path';

const SCRIPTS = 'C:/Users/aymer/projects/echo-code/apps/web/scripts';
const SCRATCH =
  'C:/Users/aymer/AppData/Local/Temp/claude/C--Users-aymer--claude/83358187-7dba-4918-ae32-4dd0532d0856/scratchpad';

const source = fs.readFileSync(path.join(SCRIPTS, 'preuve-rendu.mjs'), 'utf8');
const harnais = fs.readFileSync(path.join(SCRATCH, 'harnais.txt'), 'utf8');

const ancre = "const dist = path.join(RACINE, 'dist');";
if (!source.includes(ancre)) throw new Error('ancre introuvable');

const greffe = source.replace(ancre, ancre + '\n' + harnais);
fs.writeFileSync(path.join(SCRIPTS, 'preuve-rendu-ECART-TEMPORAIRE.mjs'), greffe);
console.log('greffe ecrite —', greffe.split('\n').length, 'lignes');
