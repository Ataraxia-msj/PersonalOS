import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import { expect, it } from 'vitest';
const localByDefault = createRequire(import.meta.url)('next/dist/compiled/postcss-modules-local-by-default');
it('compiles every affairs selector in Next CSS Modules pure mode', async () => {
 const css = readFileSync('src/features/affairs/components/affairs.module.css','utf8');
 await expect(postcss([localByDefault({mode:'pure'})]).process(css,{from:'affairs.module.css'})).resolves.toBeDefined();
});
