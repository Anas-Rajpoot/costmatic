import { describe, it, expect } from 'vitest'
import { getListPrice, computeLine, computeAmountLine } from './pricing'
import type { ProductUnit } from '@/types'

// Minimal ProductUnit factory for tests.
function unit(over: Partial<ProductUnit> = {}): ProductUnit {
  return {
    id: 'u', product_id: 'p', unit_name: 'kg', factor: 1,
    wholesale_price: 235, retail_price: 250, barcode: null,
    retail_eligible: true, wholesale_eligible: true, created_at: '',
    ...over,
  }
}

describe('getListPrice', () => {
  it('picks the retail vs wholesale column by mode', () => {
    expect(getListPrice(unit(), 'retail')).toBe(250)
    expect(getListPrice(unit(), 'wholesale')).toBe(235)
  })
  it('coerces numeric-as-string prices from PostgREST', () => {
    const u = unit({ retail_price: '250' as unknown as number, wholesale_price: '235' as unknown as number })
    expect(getListPrice(u, 'retail')).toBe(250)
    expect(getListPrice(u, 'wholesale')).toBe(235)
  })
})

describe('computeLine (weight / pack / counted)', () => {
  it('multiplies rate by fractional weight', () => {
    // 0.35 kg @ 250/kg = 87.5
    expect(computeLine(unit(), 0.35, 0, 'retail').line_total).toBe(87.5)
  })
  it('applies a percentage discount to the line', () => {
    // 250 * 0.9 * 2 = 450
    const r = computeLine(unit(), 2, 10, 'retail')
    expect(r.unit_price).toBe(225)
    expect(r.line_total).toBe(450)
  })
  it('rounds the line total to 2 decimals', () => {
    // 0.333 kg @ 250 = 83.25
    expect(computeLine(unit(), 0.333, 0, 'retail').line_total).toBe(83.25)
  })
  it('uses the wholesale rate in wholesale mode', () => {
    expect(computeLine(unit(), 1, 0, 'wholesale').line_total).toBe(235)
  })
})

describe('computeAmountLine (loose "Rs X worth")', () => {
  it('pins line total to the exact amount and derives the weight', () => {
    // Rs 200 @ 250/kg -> 0.8 kg, line stays 200
    const r = computeAmountLine(unit(), 200, 'retail')
    expect(r.line_total).toBe(200)
    expect(r.quantity).toBe(0.8)
  })
  it('derives weight from the wholesale rate in wholesale mode', () => {
    // Rs 200 @ 235/kg -> round3(0.851063…) = 0.851, line stays 200
    const r = computeAmountLine(unit(), 200, 'wholesale')
    expect(r.line_total).toBe(200)
    expect(r.quantity).toBe(0.851)
  })
  it('never divides by zero when the mode has no price', () => {
    const u = unit({ wholesale_price: 0 })
    const r = computeAmountLine(u, 200, 'wholesale')
    expect(r.quantity).toBe(0)
    expect(r.line_total).toBe(200)
  })
})
