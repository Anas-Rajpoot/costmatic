import { writeFileSync } from 'node:fs'
import { buildReceiptHtml, type ReceiptData, type ShopInfo } from '@/lib/receipt'

const cash: ReceiptData = {
  invoice_no: 'INV-2026-0041', date: '2026-08-15', customer_name: 'Malik hassan',
  items: [
    { product_name: 'سلطان گھی', unit_name: 'pouch', quantity: 1, unit_price: 580, discount_pct: 0, line_total: 580 },
    { product_name: 'باسمتی چاول کھلا', unit_name: 'kg', quantity: 2.5, unit_price: 320, discount_pct: 5, line_total: 760 },
    { product_name: 'Lipstick Red', unit_name: 'dozen', quantity: 2, unit_price: 1650, discount_pct: 0, line_total: 3300 },
    { product_name: 'کوکا کولا 1.5 لیٹر بوتل', unit_name: 'bottle', quantity: 3, unit_price: 220, discount_pct: 0, line_total: 660 },
  ],
  subtotal: 5300, total: 5300, paid: 5300, due: 0, tendered: 6000, change: 700,
  previous_balance: 810, khata_paid: 810, new_balance: 0,
}

// Credit sale: part cash, rest udhaar on top of an old balance
const credit: ReceiptData = {
  invoice_no: 'INV-2026-0042', date: '2026-08-15', customer_name: 'Malik hassan',
  items: [
    { product_name: 'سلطان گھی', unit_name: 'pouch', quantity: 2, unit_price: 580, discount_pct: 0, line_total: 1160 },
    { product_name: 'Face Powder', unit_name: 'piece', quantity: 1, unit_price: 250, discount_pct: 0, line_total: 250 },
  ],
  subtotal: 1410, total: 1410, paid: 400, due: 1010, tendered: 400,
  previous_balance: 810, new_balance: 1820,
}

const shop = (widthMm: 58 | 80): ShopInfo => ({
  name: 'Costmatic Kiryana Store', address: 'Main Bazar, Sahiwal',
  phone: '0300-1234567', footer: 'Thank you for your business!', widthMm,
})

const out = process.argv[2] ?? '.'
writeFileSync(`${out}/receipt-80.html`, buildReceiptHtml(cash, shop(80)))
writeFileSync(`${out}/receipt-58.html`, buildReceiptHtml(cash, shop(58)))
writeFileSync(`${out}/receipt-udhaar.html`, buildReceiptHtml(credit, shop(80)))
console.log('written')
