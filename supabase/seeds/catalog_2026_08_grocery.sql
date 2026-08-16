-- =============================================================
-- Costmatic — catalog seed: ghee, matches, papar, biscuits, detergent
--
-- Beverages used to live here as guesses from a WhatsApp list. They are gone:
-- the real thing is catalog_beverages_pakistan.sql, generated from the
-- beverage spreadsheet, and that file also deletes these placeholders.
--
-- NOT a migration. This is one shop's stock at one moment, so it must not run
-- against staging or another shop's project. Apply it by hand, once:
--
--   psql "$DATABASE_URL" -f supabase/seeds/catalog_2026_08_grocery.sql
--
-- Safe to run twice: every product is skipped if the name already exists.
--
-- ── Units ───────────────────────────────────────────────────
-- Stock is held in the base unit and every sellable pack is a product_units
-- row with a factor, so selling 1 carton of matches takes 1,000 pieces off
-- the shelf. The ladders below come straight from the shopkeeper:
--
--   matches   carton 20 bundle = 4,340 | bundle 5 box = 230 | box 10 pcs = 60 | pc 5
--   papar     bora 10 bundle = 5,600   | bundle 6 pack = 560 | pack 100
--   lifebuoy  carton 30 lari = 4,300   | lari 16 pcs = 160   | pc 10
--
-- ── Products left INACTIVE on purpose ───────────────────────
-- Anything without a selling price is inserted with is_active = false so it
-- can never be billed at Rs 0 by accident. Price it in Products, then tick it
-- active. Sooper (box price missing) and Surf Excel (single-piece price
-- missing) are waiting on those figures.
-- =============================================================

do $$
declare
  -- [name_en, name_ur, category_en, base_unit, is_active,
  --   [ [unit_name, factor, retail_price, wholesale_price], ... ] ]
  v_items jsonb := '[
    ["Samoli Papar","سمولی پاپڑ","Popcorn & Papad","pack",true,
      [["pack",1,100,100],["bundle",6,560,560],["bora",60,5600,5600]]],
    ["Hockey Matches","ہاکی ماچس","Matches & Lighters","piece",true,
      [["piece",1,5,5],["box",10,60,60],["bundle",50,230,230],["carton",1000,4340,4340]]],
    ["Sultan Ghee 1 Kg","سلطان گھی ۱ کلو","Ghee & Cooking Oil","piece",true,
      [["piece",1,530,530],["carton",10,5240,5240]]],
    ["Sultan Ghee Half Kg","سلطان گھی آدھا کلو","Ghee & Cooking Oil","piece",true,
      [["piece",1,270,270],["carton",20,5240,5240]]],
    ["Sultan Ghee Pao","سلطان گھی پاؤ","Ghee & Cooking Oil","piece",true,
      [["piece",1,130,130],["carton",40,5240,5240]]],

    ["Sooper Biscuit Rs 50","سوپر بسکٹ ۵۰","Sweet Biscuits","piece",false,
      [["piece",1,50,50],["box",8,0,0],["carton",144,6610,6610]]],
    ["Surf Excel","سرف ایکسل","Washing Powder","piece",false,
      [["piece",1,0,0],["lari",12,560,560]]]
  ]'::jsonb;

  v_it   jsonb;
  v_u    jsonb;
  v_pid  uuid;
  v_cat  uuid;
  v_new  int := 0;
  v_skip int := 0;
begin
  for v_it in select * from jsonb_array_elements(v_items) loop
    -- Skip anything already in the catalog: this file is re-runnable and must
    -- never create a second copy of a product the shop is already selling.
    if exists (select 1 from products where lower(name_en) = lower(v_it->>0)) then
      v_skip := v_skip + 1;
      continue;
    end if;

    select id into v_cat from categories where name_en = v_it->>2 limit 1;
    if v_cat is null then
      raise notice 'Category % not found — % filed uncategorised', v_it->>2, v_it->>0;
    end if;

    insert into products (name_en, name_ur, category_id, base_unit, product_kind,
                          min_stock_level, is_active)
    values (v_it->>0, v_it->>1, v_cat, v_it->>3, 'standard', 0, (v_it->>4)::boolean)
    returning id into v_pid;

    -- Cost is unknown at seed time; the admin fills it in and only they can
    -- read it back (product_costs is admin-only by RLS).
    insert into product_costs (product_id, cost_price) values (v_pid, 0)
    on conflict (product_id) do nothing;

    for v_u in select * from jsonb_array_elements(v_it->5) loop
      insert into product_units (product_id, unit_name, factor,
                                 retail_price, wholesale_price)
      values (v_pid, v_u->>0, (v_u->>1)::numeric, (v_u->>2)::numeric, (v_u->>3)::numeric);
    end loop;

    insert into stock (product_id, quantity_in_base_unit)
    values (v_pid, 0)
    on conflict (product_id) do nothing;

    v_new := v_new + 1;
  end loop;

  raise notice 'Catalog seed: % added, % already present.', v_new, v_skip;
end $$;
