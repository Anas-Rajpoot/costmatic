import { describe, it, expect } from 'vitest'
import { parseEntry } from './posEntry'

describe('parseEntry', () => {
  it('treats plain text as a search term with quantity 1', () => {
    expect(parseEntry('sugar')).toEqual({ qty: 1, term: 'sugar' })
    expect(parseEntry('  8964000123456  ')).toEqual({ qty: 1, term: '8964000123456' })
  })

  it('reads a quantity prefix with * or x', () => {
    expect(parseEntry('3*sugar')).toEqual({ qty: 3, term: 'sugar' })
    expect(parseEntry('12 x cola')).toEqual({ qty: 12, term: 'cola' })
    expect(parseEntry('2.5*rice')).toEqual({ qty: 2.5, term: 'rice' })
  })

  it('returns an empty term for a bare quantity (sets the selected line)', () => {
    expect(parseEntry('3*')).toEqual({ qty: 3, term: '' })
  })

  it('keeps Urdu search terms intact', () => {
    expect(parseEntry('2*چینی')).toEqual({ qty: 2, term: 'چینی' })
  })

  it('does not mistake a barcode for a quantity prefix', () => {
    expect(parseEntry('8964001234567')).toEqual({ qty: 1, term: '8964001234567' })
  })
})
