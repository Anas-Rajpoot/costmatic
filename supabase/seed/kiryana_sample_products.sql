-- =============================================================
-- Costmatic — OPTIONAL SEED: representative kiryana products
--
-- Demo / onboarding data showing the real Pakistani kiryana unit-variations
-- (loose staples with bags + wholesale-minimum, oil multi-size, eggs 3-level,
-- masala, chips, biscuits roll, beverage bottle→crate, cigarette pack→outer,
-- price-point candy). NOT a numbered migration — apply per-deployment as needed.
-- Idempotent: skips if the sample set is already present.
-- Categories from migration 0009 are looked up by name.
-- =============================================================

do $$
declare
  v_pid uuid; v_cat uuid; v_p jsonb; v_u jsonb;
  v_specs jsonb := '[
    {"en":"Cheeni (Khula)","ur":"چینی (کھلا)","brand":null,"cat":"Sugar & Salt","kind":"loose","base":"kg","wmin":20,"stock":150,"cost":230,
      "units":[{"u":"kg","f":1,"r":250,"w":235,"re":true,"we":true},{"u":"5kg","f":5,"r":1240,"w":1170,"re":true,"we":false},{"u":"50kg Bag","f":50,"r":0,"w":11500,"re":false,"we":true}]},
    {"en":"Aata Chakki (Khula)","ur":"آٹا چکی (کھلا)","brand":null,"cat":"Atta & Flour","kind":"loose","base":"kg","wmin":20,"stock":300,"cost":105,
      "units":[{"u":"kg","f":1,"r":120,"w":112,"re":true,"we":true},{"u":"5kg","f":5,"r":595,"w":560,"re":true,"we":false},{"u":"20kg Bag","f":20,"r":0,"w":2240,"re":false,"we":true}]},
    {"en":"Masoor Daal (Khula)","ur":"مسور دال (کھلا)","brand":null,"cat":"Pulses (Daal)","kind":"loose","base":"kg","wmin":25,"stock":80,"cost":300,
      "units":[{"u":"kg","f":1,"r":340,"w":320,"re":true,"we":true},{"u":"25kg Bag","f":25,"r":0,"w":8000,"re":false,"we":true}]},
    {"en":"Basmati Super Kernel (Khula)","ur":"باسمتی (کھلا)","brand":null,"cat":"Rice","kind":"loose","base":"kg","wmin":10,"stock":120,"cost":330,
      "units":[{"u":"kg","f":1,"r":360,"w":340,"re":true,"we":true},{"u":"5kg","f":5,"r":1790,"w":1700,"re":true,"we":false},{"u":"25kg Bag","f":25,"r":0,"w":8500,"re":false,"we":true}]},
    {"en":"Dalda Cooking Oil 1L Pouch","ur":"ڈالڈا آئل 1 لیٹر","brand":"Dalda","cat":"Ghee & Cooking Oil","kind":"standard","base":"piece","wmin":null,"stock":72,"cost":540,
      "units":[{"u":"pouch","f":1,"r":580,"w":560,"re":true,"we":true},{"u":"carton (12)","f":12,"r":0,"w":6600,"re":false,"we":true}]},
    {"en":"Dalda Cooking Oil 5L Can","ur":"ڈالڈا آئل 5 لیٹر","brand":"Dalda","cat":"Ghee & Cooking Oil","kind":"standard","base":"piece","wmin":null,"stock":24,"cost":2650,
      "units":[{"u":"can","f":1,"r":2800,"w":2720,"re":true,"we":true},{"u":"carton (4)","f":4,"r":0,"w":10600,"re":false,"we":true}]},
    {"en":"Anday (Eggs)","ur":"انڈے","brand":null,"cat":"Eggs","kind":"standard","base":"piece","wmin":null,"stock":600,"cost":22,
      "units":[{"u":"piece","f":1,"r":25,"w":24,"re":true,"we":true},{"u":"dozen","f":12,"r":300,"w":285,"re":true,"we":true},{"u":"tray (30)","f":30,"r":0,"w":690,"re":false,"we":true}]},
    {"en":"Shan Biryani Masala 50g","ur":"شان بریانی مصالحہ","brand":"Shan","cat":"Masala Mixes","kind":"standard","base":"piece","wmin":null,"stock":96,"cost":115,
      "units":[{"u":"piece","f":1,"r":130,"w":122,"re":true,"we":true},{"u":"outer (12)","f":12,"r":0,"w":1440,"re":false,"we":true}]},
    {"en":"Lays Masala (Rs 50)","ur":"لیز مصالحہ","brand":"Lays","cat":"Chips","kind":"standard","base":"piece","wmin":null,"stock":120,"cost":42,
      "units":[{"u":"piece","f":1,"r":50,"w":46,"re":true,"we":true},{"u":"carton (24)","f":24,"r":0,"w":1080,"re":false,"we":true}]},
    {"en":"Peek Freans Sooper (Rs 20)","ur":"سوپر بسکٹ","brand":"Peek Freans","cat":"Sweet Biscuits","kind":"standard","base":"piece","wmin":null,"stock":240,"cost":16,
      "units":[{"u":"piece","f":1,"r":20,"w":18,"re":true,"we":true},{"u":"roll (24)","f":24,"r":0,"w":420,"re":false,"we":true}]},
    {"en":"Coca-Cola 1.5L","ur":"کوکا کولا 1.5 لیٹر","brand":"Coca-Cola","cat":"Soft Drinks","kind":"standard","base":"bottle","wmin":null,"stock":90,"cost":145,
      "units":[{"u":"bottle","f":1,"r":160,"w":0,"re":true,"we":false},{"u":"crate (6)","f":6,"r":0,"w":900,"re":false,"we":true}]},
    {"en":"Gold Leaf Cigarette","ur":"گولڈ لیف","brand":"Gold Leaf","cat":"Cigarettes","kind":"standard","base":"pack","wmin":null,"stock":200,"cost":270,
      "units":[{"u":"pack","f":1,"r":300,"w":0,"re":true,"we":false},{"u":"outer (10)","f":10,"r":0,"w":2850,"re":false,"we":true}]},
    {"en":"Candyland Toffee (Rs 2)","ur":"ٹافی","brand":"Candyland","cat":"Candies & Toffees","kind":"standard","base":"piece","wmin":null,"stock":1000,"cost":1.4,
      "units":[{"u":"piece","f":1,"r":2,"w":1.7,"re":true,"we":true},{"u":"jar (100)","f":100,"r":0,"w":170,"re":false,"we":true}]}
  ]'::jsonb;
begin
  if exists (select 1 from public.products where name_en = 'Cheeni (Khula)') then
    raise notice 'Kiryana sample products already seeded — skipping.';
    return;
  end if;

  for v_p in select * from jsonb_array_elements(v_specs) loop
    select id into v_cat from public.categories where name_en = v_p->>'cat' limit 1;

    insert into public.products (name_en, name_ur, brand, category_id, base_unit, product_kind, wholesale_min_qty, is_active)
    values (v_p->>'en', v_p->>'ur', v_p->>'brand', v_cat, v_p->>'base', v_p->>'kind',
            nullif(v_p->>'wmin','null')::numeric, true)
    returning id into v_pid;

    for v_u in select * from jsonb_array_elements(v_p->'units') loop
      insert into public.product_units (product_id, unit_name, factor, retail_price, wholesale_price, retail_eligible, wholesale_eligible)
      values (v_pid, v_u->>'u', (v_u->>'f')::numeric, (v_u->>'r')::numeric, (v_u->>'w')::numeric,
              (v_u->>'re')::boolean, (v_u->>'we')::boolean);
    end loop;

    insert into public.stock (product_id, quantity_in_base_unit) values (v_pid, (v_p->>'stock')::numeric);
    insert into public.product_costs (product_id, cost_price) values (v_pid, (v_p->>'cost')::numeric);
  end loop;
end $$;
