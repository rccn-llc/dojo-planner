import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// dojo-planner-colors.css redefines green-50…400 and breaks Tailwind's
// light→dark order: green-200 (#04770c) and green-300 (#044208) are DARK
// greens. In dark mode they render dark text on a dark background — the
// unreadable "Resolved" badge. Light greens there are green-100 / green-400.
const DARK_GREEN_IN_DARK_MODE = /dark:[\w:-]*-green-(?:200|300)(?!\d)/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return sourceFiles(full);
    }
    return /\.(?:tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('dark-mode greens', () => {
  it('never uses the palette\'s dark green-200/300 for dark mode', () => {
    const offenders = sourceFiles(path.join(process.cwd(), 'src')).flatMap(file =>
      readFileSync(file, 'utf8').split('\n').flatMap((line, i) =>
        DARK_GREEN_IN_DARK_MODE.test(line) ? [`${path.relative(process.cwd(), file)}:${i + 1}`] : []),
    );

    expect(offenders).toEqual([]);
  });

  it('the pattern catches the mistake it guards against', () => {
    expect(DARK_GREEN_IN_DARK_MODE.test('text-green-800 dark:text-green-300')).toBe(true);
    expect(DARK_GREEN_IN_DARK_MODE.test('dark:hover:bg-green-200/30')).toBe(true);
    expect(DARK_GREEN_IN_DARK_MODE.test('dark:text-green-400 dark:text-green-100')).toBe(false);
    expect(DARK_GREEN_IN_DARK_MODE.test('text-green-300')).toBe(false);
  });
});
