import { describe, it, expect } from 'vitest'
import { formatPKR } from './format'
import { buildReceiptHtml, type ReceiptData, type ShopInfo } from './receipt'

const shop: ShopInfo = {
  name: 'Test Store', address: 'Main Bazar', phone: '0300-1234567',
  footer: 'Thanks', widthMm: 80,
}

const base: ReceiptData = {
  invoice_no: 'INV-2026-0001',
  date: '2026-08-15',
  customer_name: 'Malik hassan',
  items: [{ product_name: 'Sultan Ghee', unit_name: 'pouch', quantity: 1, unit_price: 580, discount_pct: 0, line_total: 580 }],
  subtotal: 580, total: 580, paid: 580, due: 0,
}

describe('receipt', () => {
  it('sizes the page for the shop\'s thermal roll', () => {
    expect(buildReceiptHtml(base, shop)).toContain('@page{size:80mm auto;margin:0}')
    expect(buildReceiptHtml(base, { ...shop, widthMm: 58 })).toContain('@page{size:58mm auto;margin:0}')
  })

  it('prints the khata block: previous balance, khata payment, balance due', () => {
    const html = buildReceiptHtml(
      { ...base, tendered: 2000, change: 610, previous_balance: 810, khata_paid: 810, new_balance: 0 },
      shop,
    )
    expect(html).toContain('ACCOUNT (KHATA)')
    expect(html).toContain('Previous Balance')
    expect(html).toContain('- Paid to Khata')
    expect(html).toContain('Balance Due')
    expect(html).toContain(formatPKR(610)) // change returned (Intl uses a NBSP)
  })

  it('omits the khata block for a walk-in cash sale', () => {
    const html = buildReceiptHtml({ ...base, customer_name: null }, shop)
    expect(html).not.toContain('ACCOUNT (KHATA)')
  })

  it('shows this bill\'s udhaar on a credit sale', () => {
    const html = buildReceiptHtml(
      { ...base, paid: 200, due: 380, previous_balance: 810, new_balance: 1190 },
      shop,
    )
    expect(html).toContain('Udhaar (This Bill)')
    expect(html).toContain('+ This Bill Udhaar')
  })

  it('escapes product names instead of injecting markup', () => {
    const html = buildReceiptHtml(
      { ...base, items: [{ ...base.items[0], product_name: '<img src=x onerror=alert(1)>' }] },
      shop,
    )
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img')
  })
})
