import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * UIKitML's stylesheet reader takes no CSS comments: a `/* … *\/` in a
 * <style> block failed the whole level load at runtime (2026-11-01,
 * "Unsupported stylesheet selector"), while the parse step accepts it —
 * so it is checked here. Comments belong in `<!-- -->` outside <style>.
 */
const UI_DIR = 'public/ui';

describe('UIKitML stylesheets', () => {
  const files = readdirSync(UI_DIR).filter((f) => f.endsWith('.uikitml'));
  it.each(files)('%s has no CSS comment inside <style>', (file) => {
    const source = readFileSync(`${UI_DIR}/${file}`, 'utf8');
    for (const [, css = ''] of source.matchAll(/<style>([\s\S]*?)<\/style>/g)) {
      expect(css).not.toMatch(/\/\*/);
    }
  });
});
