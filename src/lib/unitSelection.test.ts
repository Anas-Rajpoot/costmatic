import { describe, it, expect } from 'vitest'
import { defaultUnitFor } from './pricing'
import type { Product, ProductUnit } from '@/types'

const unit = (u: Partial<ProductUnit> & { unit_name: string; factor: number }): ProductUnit => ({
  id: u.unit_name, product_id: 'p', unit_name: u.unit_name, factor: u.factor,
  retail_price: u.retail_price ?? 0, wholesale_price: u.wholesale_price ?? 0,
  retail_eligible: u.retail_eligible, wholesale_eligible: u.wholesale_eligible,
} as ProductUnit)

const product = (base: string, units: ProductUnit[], kind: 'standard' | 'loose' = 'standard'): Product =>
  ({ id: 'p', name_en: 'X', base_unit: base, product_kind: kind, units } as unknown as Product)

describe('defaultUnitFor', () => {
  it('sells the smallest unit in retail and the bulk unit in wholesale', () => {
    const p = product('piece', [unit({ unit_name: 'piece', factor: 1 }), unit({ unit_name: 'carton', factor: 12 })])
    expect(defaultUnitFor(p, 'retail').unit_name).toBe('piece')
    expect(defaultUnitFor(p, 'wholesale').unit_name).toBe('carton')
  })

  it('picks the biggest bulk unit when a product has several', () => {
    const p = product('piece', [
      unit({ unit_name: 'piece', factor: 1 }),
      unit({ unit_name: 'dozen', factor: 12 }),
      unit({ unit_name: 'carton', factor: 144 }),
    ])
    expect(defaultUnitFor(p, 'wholesale').unit_name).toBe('carton')
  })

  it('keeps the only unit a single-unit product has, in both modes', () => {
    const p = product('piece', [unit({ unit_name: 'piece', factor: 1 })])
    expect(defaultUnitFor(p, 'retail').unit_name).toBe('piece')
    expect(defaultUnitFor(p, 'wholesale').unit_name).toBe('piece')
  })

  it('respects per-unit eligibility flags', () => {
    const p = product('bottle', [
      unit({ unit_name: 'bottle', factor: 1, retail_eligible: true, wholesale_eligible: false }),
      unit({ unit_name: 'crate (6)', factor: 6, retail_eligible: false, wholesale_eligible: true }),
    ])
    expect(defaultUnitFor(p, 'retail').unit_name).toBe('bottle')
    expect(defaultUnitFor(p, 'wholesale').unit_name).toBe('crate (6)')
  })

  it('handles numeric-as-string factors from PostgREST', () => {
    const p = product('piece', [
      unit({ unit_name: 'piece', factor: '1' as unknown as number }),
      unit({ unit_name: 'dozen', factor: '12' as unknown as number }),
      unit({ unit_name: 'carton', factor: '144' as unknown as number }),
    ])
    expect(defaultUnitFor(p, 'wholesale').unit_name).toBe('carton')
    expect(defaultUnitFor(p, 'retail').unit_name).toBe('piece')
  })

  it('falls back to the base unit when nothing is eligible', () => {
    const p = product('piece', [
      unit({ unit_name: 'piece', factor: 1, retail_eligible: false, wholesale_eligible: false }),
    ])
    expect(defaultUnitFor(p, 'wholesale').unit_name).toBe('piece')
  })
})
