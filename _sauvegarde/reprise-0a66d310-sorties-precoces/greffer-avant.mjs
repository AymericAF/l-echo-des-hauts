import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEPOT = 'C:/Users/aymer/projects/echo-code';
const SCRIPTS = `${DEPOT}/apps/web/scripts`;
const SCRATCH =
  'C:/Users/aymer/AppData/Local/Temp/claude/C--Users-aymer--claude/83358187-7dba-4918-ae32-4dd0532d0856/scratchpad';

// La version D AVANT la transformation : celle de main au commit 0c07982.
const source = execFileSync('git', ['show', '0c07982:apps/web/scripts/preuve-rendu.mjs'], {
  cwd: DEPOT,
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024,
});
const harnais = fs.readFileSync(path.join(SCRATCH, 'harnais.txt'), 'utf8');

const ancre = "const dist = path.join(RACINE, 'dist');";
if (!source.includes(ancre)) throw new Error('ancre introuvable');

fs.writeFileSync(
  path.join(SCRIPTS, 'preuve-rendu-AVANT-TEMPORAIRE.mjs'),
  source.replace(ancre, ancre + '\n' + harnais),
);
console.log('greffe AVANT ecrite');
