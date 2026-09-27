import Decimal from 'decimal.js-light';

const SCALE = 6;
const QUANTITY_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

function sourceText(value) {
  if (value instanceof Decimal) return value.toFixed(SCALE);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Quantity must be finite');
    return String(value);
  }
  if (typeof value !== 'string') throw new Error('Quantity must be a number or string');
  const text = value.trim();
  if (!QUANTITY_PATTERN.test(text)) throw new Error('Quantity is not a valid decimal');
  return text;
}

export function toDecimal(value) {
  const text = sourceText(value);
  const decimal = new Decimal(text);
  return decimal;
}

export function normalizeQuantity(value) {
  const text = sourceText(value);
  const decimal = new Decimal(text);
  if (decimal.decimalPlaces() > SCALE) {
    // Extra trailing zeroes are mathematically equivalent and safe to accept.
    const rounded = decimal.toDecimalPlaces(SCALE);
    if (!decimal.equals(rounded)) throw new Error('Quantity supports at most six decimal places');
  }
  return decimal.toFixed(SCALE);
}

const UNIT_DECIMAL_PLACES = Object.freeze({ piece: 0, pack: 0, box: 0, gram: 0, meter: 3, kilogram: 3, liter: 3 });

export function quantityDecimalPlacesForUnit(unit) {
  // Legacy products can have no reliable unit yet, so retain full precision
  // until the product is explicitly classified.
  return Object.prototype.hasOwnProperty.call(UNIT_DECIMAL_PLACES, unit) ? UNIT_DECIMAL_PLACES[unit] : SCALE;
}

export function normalizeQuantityForUnit(value, unit) {
  const normalized = normalizeQuantity(value);
  if (toDecimal(normalized).decimalPlaces() > quantityDecimalPlacesForUnit(unit)) {
    throw new Error('Quantity precision is not allowed for this unit');
  }
  return normalized;
}

export function formatQuantityForUnit(value, unit) {
  const rounded = toDecimal(value).toDecimalPlaces(quantityDecimalPlacesForUnit(unit), Decimal.ROUND_HALF_UP);
  return formatQuantity(rounded);
}

export function quantityInputStepForUnit(unit) {
  const places = quantityDecimalPlacesForUnit(unit);
  return places === 0 ? '1' : '0.' + '0'.repeat(places - 1) + '1';
}

export function addQuantities(left, right) {
  return normalizeQuantity(toDecimal(left).plus(toDecimal(right)));
}

export function subtractQuantities(left, right) {
  return normalizeQuantity(toDecimal(left).minus(toDecimal(right)));
}

export function compareQuantities(left, right) {
  return toDecimal(left).comparedTo(toDecimal(right));
}

export function formatQuantity(value) {
  const normalized = normalizeQuantity(value);
  const trimmed = normalized.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  return trimmed === '-0' ? '0' : trimmed;
}

export const QUANTITY_SCALE = SCALE;
export const normalizeMoney = normalizeQuantity;
export const multiplyMoney = (left, right) => toDecimal(left).times(toDecimal(right)).toDecimalPlaces(SCALE).toFixed(SCALE);
