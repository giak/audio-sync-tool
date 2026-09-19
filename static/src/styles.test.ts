// ─── Unit tests: styles.ts — taxonomie style_tranche dérivée des dossiers ──
// Fixture = les 86 dossiers RÉELS de la colonne droite (cache du 2026-09-19,
// EPIC-035) avec leur volume : la taxonomie doit en sortir 25 styles
// (18 datés + 7 hors temps) et 9 tranches multiples de 5.

import { describe, expect, it } from 'vitest';
import type { FileIndex } from './state.js';
import {
  buildTaxonomy,
  deriveHotkeys,
  destFor,
  findEparsEntry,
  parseFolderName,
  TRANCHES,
  trancheOf,
  yearOf,
} from './styles.js';

const ROOT = '/home/giak/Music/select/style/';

// [dossier, nb fichiers] — mesuré sur data/cache.json (1 430 fichiers).
const REAL_FOLDERS: Array<[string, number]> = [
  ['beat_disco', 4],
  ['breakbeat_1990', 3],
  ['breakbeat_1995', 5],
  ['creed_2010', 5],
  ['creed_2015', 21],
  ['creed_2020', 10],
  ['drumbass_2010', 1],
  ['drumbass_2015', 6],
  ['drumbass_2020', 5],
  ['electro_1990', 2],
  ['electro_2000', 2],
  ['electro_2015', 1],
  ['electro_clash', 12],
  ['hardcore_1990', 4],
  ['hardcore_1995', 31],
  ['hardcore_2000', 3],
  ['hardcore_2005', 7],
  ['hardcore_2010', 25],
  ['hardcore_2015', 55],
  ['hardcore_2020', 48],
  ['hardcore_2025', 2],
  ['house_2000', 1],
  ['house_2025', 1],
  ['intro', 9],
  ['italo_disco', 18],
  ['new_beat', 2],
  ['techno_1985', 7],
  ['techno_1990', 185],
  ['techno_1995', 132],
  ['techno_2000', 55],
  ['techno_2005', 42],
  ['techno_2010', 15],
  ['techno_2015', 13],
  ['techno_2020', 78],
  ['techno_2025', 9],
  ['techno_acid_1990', 40],
  ['techno_acid_1995', 18],
  ['techno_acid_2000', 12],
  ['techno_acid_2005', 5],
  ['techno_acid_2010', 10],
  ['techno_acid_2015', 33],
  ['techno_acid_2020', 167],
  ['techno_acid_2025', 13],
  ['techno_acid_hard_1995', 1],
  ['techno_acid_hard_2015', 3],
  ['techno_acid_hard_2020', 6],
  ['techno_acid_hard_2025', 2],
  ['techno_beat_1995', 1],
  ['techno_beat_2000', 4],
  ['techno_beat_2005', 2],
  ['techno_clash_2000', 8],
  ['techno_clash_2005', 5],
  ['techno_clash_2010', 1],
  ['techno_clash_2020', 1],
  ['techno_disco', 1],
  ['techno_hard_1995', 1],
  ['techno_hard_2000', 8],
  ['techno_hard_2010', 4],
  ['techno_hard_2020', 23],
  ['techno_hard_2025', 3],
  ['techno_house_1990', 4],
  ['techno_house_1995', 6],
  ['techno_house_2000', 4],
  ['techno_house_2015', 1],
  ['techno_percu_2005', 1],
  ['techno_trance_1990', 7],
  ['techno_trance_1995', 12],
  ['techno_trance_2000', 11],
  ['techno_trance_2010', 3],
  ['techno_trance_2015', 4],
  ['techno_trance_2020', 16],
  ['techno_trance_2025', 5],
  ['trance_1990', 19],
  ['trance_1995', 56],
  ['trance_2000', 17],
  ['trance_2005', 3],
  ['trance_2010', 4],
  ['trance_2015', 12],
  ['trance_2020', 26],
  ['trance_2025', 12],
  ['trance_acid_1990', 7],
  ['trance_acid_1995', 4],
  ['trance_acid_2020', 1],
  ['trance_acid_2025', 2],
  ['trance_hard_1990', 1],
  ['trance_old', 1],
];

function realSourceFiles(): Record<string, FileIndex> {
  const idx: FileIndex = {};
  for (const [dir, n] of REAL_FOLDERS) {
    for (let i = 0; i < n; i++) {
      const fn = `${dir}-${i}.mp3`;
      idx[fn] = { path: `${dir}/${fn}`, year: null, duration: null, codec: null };
    }
  }
  return { [ROOT]: idx };
}

const TIMELESS = ['beat_disco', 'electro_clash', 'intro', 'italo_disco', 'new_beat', 'techno_disco', 'trance_old'];

describe('styles — parseFolderName', () => {
  it('parse style + tranche', () => {
    expect(parseFolderName('techno_acid_1990')).toEqual({ style: 'techno_acid', tranche: 1990 });
    expect(parseFolderName('techno_1985')).toEqual({ style: 'techno', tranche: 1985 });
    expect(parseFolderName('techno_acid_hard_2025')).toEqual({ style: 'techno_acid_hard', tranche: 2025 });
  });
  it('parse style hors temps (sans tranche)', () => {
    expect(parseFolderName('italo_disco')).toEqual({ style: 'italo_disco', tranche: null });
    expect(parseFolderName('intro')).toEqual({ style: 'intro', tranche: null });
    expect(parseFolderName('trance_old')).toEqual({ style: 'trance_old', tranche: null });
  });
  it('rejette les noms hors grammaire', () => {
    expect(parseFolderName('_trash')).toBeNull();
    expect(parseFolderName('Techno_1990')).toBeNull();
    expect(parseFolderName('techno-1990')).toBeNull();
    expect(parseFolderName('techno_90')).toBeNull();
    expect(parseFolderName('')).toBeNull();
    expect(parseFolderName('2008_08')).toBeNull();
  });
  it('parse les 86 dossiers réels', () => {
    for (const [dir] of REAL_FOLDERS) expect(parseFolderName(dir), dir).not.toBeNull();
  });
});

describe('styles — trancheOf / yearOf / TRANCHES', () => {
  it('tranche = palier de 5 ans inférieur', () => {
    expect(trancheOf(1994)).toBe(1990);
    expect(trancheOf(1995)).toBe(1995);
    expect(trancheOf(2008)).toBe(2005);
    expect(trancheOf(2025)).toBe(2025);
    expect(trancheOf(1987)).toBe(1985);
  });
  it('TRANCHES = 9 valeurs 1985…2025 (touches 1-9 de la palette)', () => {
    expect([...TRANCHES]).toEqual([1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025]);
  });
  it('yearOf lit les 4 premiers chiffres, sinon null', () => {
    expect(yearOf({ year: '1994' })).toBe(1994);
    expect(yearOf({ year: '1994-05-01' })).toBe(1994);
    expect(yearOf({ year: null })).toBeNull();
    expect(yearOf({ year: 'abc' })).toBeNull();
    expect(yearOf({ year: '' })).toBeNull();
    expect(yearOf(undefined)).toBeNull();
  });
});

describe('styles — buildTaxonomy', () => {
  it('86 dossiers réels → 25 styles, 7 hors temps, 9 tranches', () => {
    const tax = buildTaxonomy(realSourceFiles(), []);
    expect(tax).not.toBeNull();
    expect(tax!.root).toBe(ROOT);
    expect(tax!.styles.size).toBe(25);
    const timeless = [...tax!.styles.values()]
      .filter(s => s.timeless)
      .map(s => s.id)
      .sort();
    expect(timeless).toEqual(TIMELESS);
    const tranches = new Set<number>();
    for (const s of tax!.styles.values()) for (const f of s.folders) tranches.add(parseFolderName(f)!.tranche ?? -1);
    tranches.delete(-1);
    expect([...tranches].sort()).toEqual([1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025]);
  });
  it('compte les fichiers par style (ordre des hotkeys)', () => {
    const tax = buildTaxonomy(realSourceFiles(), []);
    expect(tax!.styles.get('techno')!.count).toBe(536);
    expect(tax!.styles.get('techno_acid')!.count).toBe(298);
    expect(tax!.styles.get('techno_acid')!.root).toBe('techno');
    expect(tax!.styles.get('techno_acid')!.folders.has('techno_acid_1990')).toBe(true);
  });
  it('sourceFiles vide → null', () => {
    expect(buildTaxonomy({}, [])).toBeNull();
    expect(buildTaxonomy({ [ROOT]: {} }, [])).toBeNull();
  });
  it('extra dir sous la racine ajouté (dossier vide créé via ➕, joint serveur OU UI), hors racine ignoré', () => {
    const tax = buildTaxonomy(realSourceFiles(), [
      `${ROOT}techno_percu_2010`, // os.path.join côté serveur (slash simple)
      `${ROOT}/trance_hard_2020`, // convention UI (double slash)
      '/elsewhere/house_1990',
    ]);
    expect(tax!.styles.get('techno_percu')!.folders.has('techno_percu_2010')).toBe(true);
    expect(tax!.styles.get('techno_percu')!.count).toBe(1);
    expect(tax!.styles.get('trance_hard')!.folders.has('trance_hard_2020')).toBe(true);
    expect(tax!.styles.get('house')!.folders.has('house_1990')).toBe(false);
  });
  it('fichier à la racine ou dossier hors grammaire → ignorés sans erreur', () => {
    const files: FileIndex = {
      'a.mp3': { path: 'a.mp3', year: null, duration: null, codec: null },
      'b.mp3': { path: 'Misc Stuff/b.mp3', year: null, duration: null, codec: null },
      'c.mp3': { path: 'techno_1990/c.mp3', year: null, duration: null, codec: null },
    };
    const tax = buildTaxonomy({ [ROOT]: files }, []);
    expect([...tax!.styles.keys()]).toEqual(['techno']);
  });
});

describe('styles — destFor', () => {
  const tax = buildTaxonomy(realSourceFiles(), [])!;
  it('style daté + année → dossier existant — chemin = racine + "/" + nom (convention sourceTree/dupDetect/copyFilesTo, double slash si la racine porte un slash final)', () => {
    expect(destFor(tax, 'techno_acid', 1992)).toEqual({
      name: 'techno_acid_1990',
      dir: `${ROOT}/techno_acid_1990`,
      exists: true,
      needsYear: false,
    });
    // Le dossier calculé doit être reconnu par la recherche de racine de copyFilesTo.
    const dir = destFor(tax, 'techno_acid', 1992)!.dir;
    expect(dir === ROOT || dir.startsWith(`${ROOT}/`)).toBe(true);
  });
  it('style daté sans année → needsYear', () => {
    expect(destFor(tax, 'techno_acid', null)).toEqual({ name: 'techno_acid', dir: '', exists: false, needsYear: true });
  });
  it('style hors temps → dossier sans tranche, année ignorée', () => {
    expect(destFor(tax, 'italo_disco', null)).toEqual({
      name: 'italo_disco',
      dir: `${ROOT}/italo_disco`,
      exists: true,
      needsYear: false,
    });
    expect(destFor(tax, 'italo_disco', 1983)!.name).toBe('italo_disco');
  });
  it('dossier inexistant → exists false (sera créé par /copy)', () => {
    expect(destFor(tax, 'techno_percu', 2012)).toEqual({
      name: 'techno_percu_2010',
      dir: `${ROOT}/techno_percu_2010`,
      exists: false,
      needsYear: false,
    });
  });
  it('tranche forcée prime sur l’année', () => {
    expect(destFor(tax, 'techno', 1994, 2020)!.name).toBe('techno_2020');
    expect(destFor(tax, 'techno', null, 1985)!.name).toBe('techno_1985');
  });
  it('style inconnu → null', () => {
    expect(destFor(tax, 'polka', 1994)).toBeNull();
  });
  it('racine sans slash final → chemin correct', () => {
    const t2 = buildTaxonomy(
      { '/x/style': { 'a.mp3': { path: 'techno_1990/a.mp3', year: null, duration: null, codec: null } } },
      [],
    )!;
    expect(destFor(t2, 'techno', 1991)!.dir).toBe('/x/style/techno_1990');
  });
});

describe('styles — findEparsEntry', () => {
  const epars: Record<string, FileIndex> = {
    '/media/epars': {
      'a.mp3': { path: '_schranz/a.mp3', year: '1999', duration: null, codec: null },
      'b.mp3': { path: 'b.mp3', year: null, duration: null, codec: null },
    },
    '/other': { 'a.mp3': { path: 'a.mp3', year: null, duration: null, codec: null } },
  };
  it('retrouve dossier, nom et entrée depuis le fullpath (homonymes dans 2 racines distingués)', () => {
    expect(findEparsEntry(epars, '/media/epars/_schranz/a.mp3')).toEqual({
      eparDir: '/media/epars',
      filename: 'a.mp3',
      entry: epars['/media/epars']['a.mp3'],
    });
    expect(findEparsEntry(epars, '/other/a.mp3')!.eparDir).toBe('/other');
    expect(findEparsEntry(epars, '/media/epars/b.mp3')!.filename).toBe('b.mp3');
  });
  it('inconnu → null', () => {
    expect(findEparsEntry(epars, '/media/epars/a.mp3')).toBeNull(); // mauvais sous-dossier
    expect(findEparsEntry(epars, '/nope/x.mp3')).toBeNull();
  });
});

describe('styles — deriveHotkeys', () => {
  it('25 styles réels → 25 lettres distinctes, initiales de segment d’abord', () => {
    const tax = buildTaxonomy(realSourceFiles(), [])!;
    const keys = deriveHotkeys(tax);
    expect(keys.size).toBe(25);
    const letters = [...keys.values()];
    expect(letters.every(k => k !== null && /^[a-z]$/.test(k))).toBe(true);
    expect(new Set(letters).size).toBe(25);
    // Les gros volumes gagnent leur initiale la plus naturelle.
    expect(keys.get('techno')).toBe('t');
    expect(keys.get('techno_acid')).toBe('a');
    expect(keys.get('hardcore')).toBe('h');
    expect(keys.get('trance')).toBe('r');
    expect(keys.get('italo_disco')).toBe('i');
  });
  it('déterministe (même entrée → même attribution)', () => {
    const tax = buildTaxonomy(realSourceFiles(), [])!;
    expect([...deriveHotkeys(tax)]).toEqual([...deriveHotkeys(tax)]);
  });
  it('plus de styles que de lettres → null pour les derniers', () => {
    // 30 styles distincts « aa » … « bd », tous datés 1990 → 26 lettres puis null.
    const files: FileIndex = {};
    for (let i = 0; i < 30; i++) {
      const dir = `${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))}_1990`;
      files[`f${i}.mp3`] = { path: `${dir}/f${i}.mp3`, year: null, duration: null, codec: null };
    }
    const tax = buildTaxonomy({ '/r': files }, [])!;
    expect(tax.styles.size).toBe(30);
    const keys = deriveHotkeys(tax);
    const letters = [...keys.values()].filter((k): k is string => k !== null);
    expect(letters.length).toBe(26);
    expect(new Set(letters).size).toBe(26);
    expect([...keys.values()].filter(k => k === null).length).toBe(4);
  });
});
