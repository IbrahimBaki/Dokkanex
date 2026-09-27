import { describe, expect, it } from 'vitest';
import { formatQuantityForUnit, normalizeQuantityForUnit, quantityInputStepForUnit } from '../../src/lib/quantity';

describe('unit-aware quantities', () => {
  it('requires whole quantities for count-based units', () => {
    expect(normalizeQuantityForUnit('10', 'piece')).toBe('10.000000');
    expect(normalizeQuantityForUnit('3', 'pack')).toBe('3.000000');
    expect(() => normalizeQuantityForUnit('9.999999', 'piece')).toThrow();
    expect(quantityInputStepForUnit('box')).toBe('1');
  });

  it('allows only practical measured-unit precision and formats legacy display safely', () => {
    expect(normalizeQuantityForUnit('0.125', 'kilogram')).toBe('0.125000');
    expect(() => normalizeQuantityForUnit('0.0001', 'kilogram')).toThrow();
    expect(quantityInputStepForUnit('kilogram')).toBe('0.001');
    expect(formatQuantityForUnit('9.999999', 'piece')).toBe('10');
  });
});
