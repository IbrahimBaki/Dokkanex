import { describe, expect, it } from 'vitest';
import { buildShareText, getPdfPageLayout } from '../../src/lib/exportUtils';
import i18n from '../../src/i18n';

describe('PDF export page layout', () => {
  it('keeps a short export on one printable page', () => {
    expect(getPdfPageLayout(1000, 1000, 210, 297)).toEqual([
      { x: 15, y: 58.5, width: 180, height: 180 },
    ]);
  });

  it('clips a long export across pages instead of shrinking the whole image repeatedly', () => {
    expect(getPdfPageLayout(1000, 3000, 210, 297)).toEqual([
      { x: 15, y: 15, width: 180, height: 540 },
      { x: 15, y: -252, width: 180, height: 540 },
      { x: 15, y: -519, width: 180, height: 540 },
    ]);
  });

  it('keeps zero prices in a selected text export', async () => {
    await i18n.changeLanguage('en');
    const text = buildShareText([{ name: 'Free sample', selling_price: 0, wholesale_price: 0 }], ['name', 'selling_price', 'wholesale_price'], {});
    expect(text).toContain('Selling: 0');
    expect(text).toContain('Wholesale: 0');
  });
});
