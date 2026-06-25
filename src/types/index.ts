export type Role = 'admin' | 'employee'

export interface Profile {
  id: string
  email: string
  full_name: string
  username: string | null
  role: Role
  discount_limit: number
  is_active: boolean
  created_at: string
}

export interface Category {
  id: string
  name_en: string
  name_ur: string
  parent_id: string | null
  sort_order: number
  created_at: string
}

export interface ProductUnit {
  id: string
  product_id: string
  unit_name: string
  factor: number
  wholesale_price: number
  retail_price: number
  barcode: string | null
  created_at: string
}

export interface Stock {
  id: string
  product_id: string
  quantity_in_base_unit: number
  batch_no: string | null
  expiry_date: string | null
  updated_at: string
}

export interface Customer {
  id: string
  name: string
  phone: string | null
  address: string | null
  customer_type: 'wholesale' | 'retail'
  opening_balance: number
  current_balance: number
  created_at: string
}

export interface Sale {
  id: string
  invoice_no: string
  customer_id: string | null
  date: string
  subtotal: number
  discount: number
  tax: number
  total: number
  paid: number
  due: number
  payment_type: 'cash' | 'udhaar' | 'mixed'
  created_by: string | null
  is_void: boolean
  created_at: string
  customer?: Pick<Customer, 'id' | 'name'> | null
  items?: SaleItem[]
}

export interface SaleItem {
  id: string
  sale_id: string
  product_id: string
  unit_name: string
  quantity: number
  unit_price: number
  discount_pct: number
  line_total: number
}

export interface CustomerLedger {
  id: string
  customer_id: string
  type: 'opening' | 'sale' | 'payment' | 'return' | 'adjustment'
  amount: number
  ref_sale_id: string | null
  date: string
  note: string | null
  created_by: string | null
  created_at: string
}

export interface Supplier {
  id: string
  name: string
  phone: string | null
  address: string | null
  opening_balance: number
  current_balance: number
  created_at: string
}

export interface Purchase {
  id: string
  supplier_id: string
  invoice_no: string | null
  date: string
  subtotal: number
  discount: number
  total: number
  paid: number
  due: number
  note: string | null
  created_by: string | null
  created_at: string
  supplier?: Pick<Supplier, 'id' | 'name'>
  items?: PurchaseItem[]
}

export interface PurchaseItem {
  id: string
  purchase_id: string
  product_id: string
  unit_name: string
  quantity: number
  unit_cost: number
  line_total: number
}

export interface SupplierLedger {
  id: string
  supplier_id: string
  type: 'opening' | 'purchase' | 'payment' | 'return' | 'adjustment'
  amount: number
  ref_purchase_id: string | null
  date: string
  note: string | null
  created_by: string | null
  created_at: string
}

export interface Product {
  id: string
  name_en: string
  name_ur: string
  category_id: string | null
  brand: string | null
  barcode: string | null
  image_url: string | null
  base_unit: string
  min_stock_level: number
  has_expiry: boolean
  is_active: boolean
  created_at: string
  // joined via select
  category?: Pick<Category, 'id' | 'name_en' | 'name_ur'> | null
  units?: ProductUnit[]
  stock?: Stock[] // PostgREST returns as array; use stock[0]
  // cost_price lives in the admin-only product_costs table; this embed is
  // empty for employees (RLS) and holds one row for admins.
  product_costs?: { cost_price: number }[]
}
