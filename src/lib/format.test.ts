import { describe, it, expect } from 'vitest'
import { round2, round3, formatQty, unitShort } from './format'

describe('round helpers', () => {
  it('round2 keeps 2 decimals (money)', () => {
    expect(round2(87.499)).toBe(87.5)
    expect(round2(199.994)).toBe(199.99)
  })
  it('round3 keeps 3 decimals (weight, 1g precision)', () => {
    expect(round3(200 / 235)).toBe(0.851)
    expect(round3(0.3334)).toBe(0.333)
  })
})

describe('formatQty', () => {
  it('shows whole numbers plainly', () => {
    expect(formatQty(2)).toBe('2')
    expect(formatQty(10)).toBe('10')
  })
  it('shows fractional weights with trimmed decimals', () => {
    expect(formatQty(0.8)).toBe('0.8')
    expect(formatQty(0.35)).toBe('0.35')
    expect(formatQty(0.851)).toBe('0.851')
  })
})

describe('unitShort', () => {
  it('maps base units to short captions', () => {
    expect(unitShort('kg')).toBe('kg')
    expect(unitShort('litre')).toBe('L')
    expect(unitShort('bottle')).toBe('btl')
    expect(unitShort('piece')).toBe('pcs')
    expect(unitShort('anything-else')).toBe('pcs')
  })
})
