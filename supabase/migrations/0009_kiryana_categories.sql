-- =============================================================
-- Costmatic — Migration 0009: Kiryana category tree (hierarchical)
--
-- Research-based kiryana/general-store taxonomy (from the shopkeeper's own product
-- breakdown) using categories.parent_id. ADDITIVE + idempotent — does not touch the
-- existing (beauty) categories; a shopkeeper can delete those from the UI.
-- =============================================================

do $$
declare
  v_parent uuid;
  v_seed   boolean := not exists (
    select 1 from public.categories where name_en = 'Confectionery & Kids' and parent_id is null
  );
  -- [parent_en, parent_ur, sort, [ [child_en, child_ur], ... ]]
  v_tree jsonb := '[
    ["Confectionery & Kids","بچوں کی اشیاء",10,[["Bubble Gum","ببل گم"],["Candies & Toffees","کینڈی و ٹافی"],["Jellies","جیلی"],["Lollipops","لولی پاپ"],["Chocolates","چاکلیٹ"],["Toys & Surprises","کھلونے"]]],
    ["Chips, Snacks & Nimko","چپس و سنیکس",20,[["Chips","چپس"],["Kurkure & Cheetos","کرکرے"],["Nimko & Peanuts","نمکو و مونگ پھلی"],["Popcorn & Papad","پاپ کارن و پاپڑ"]]],
    ["Cold Drinks, Juices & Water","مشروبات",30,[["Soft Drinks","سافٹ ڈرنکس"],["Juices","جوس"],["Syrups & Tang","شربت و ٹینگ"],["Water","پانی"]]],
    ["Biscuits & Bakery","بسکٹ و بیکری",40,[["Sweet Biscuits","میٹھے بسکٹ"],["Crackers & Salty","نمکین بسکٹ"],["Cream Biscuits","کریم بسکٹ"],["Wafers & Cake","ویفر و کیک"],["Bread & Rusk","بریڈ و رَس"]]],
    ["Ration & Staples","راشن",50,[["Atta & Flour","آٹا"],["Rice","چاول"],["Pulses (Daal)","دالیں"],["Sugar & Salt","چینی و نمک"]]],
    ["Ghee, Oil & Spices","گھی، تیل و مصالحہ",60,[["Ghee & Cooking Oil","گھی و تیل"],["Ground Spices","پسا مصالحہ"],["Masala Mixes","ریسپی مصالحہ"],["Whole Spices","ثابت مصالحہ"]]],
    ["Dairy, Milk & Tea","ڈیری، دودھ و چائے",70,[["Milk (Tetra)","دودھ"],["Milk Powder & Whitener","پاؤڈر دودھ"],["Tea","چائے"],["Coffee","کافی"],["Butter, Cheese & Jam","مکھن، چیز و جیم"],["Eggs","انڈے"]]],
    ["Noodles, Pasta & Sauces","نوڈلز و ساسز",80,[["Instant Noodles","نوڈلز"],["Pasta & Macaroni","پاستا و میکرونی"],["Ketchup & Mayo","کیچپ و میو"],["Pickles & Vinegar","اچار و سرکہ"]]],
    ["Personal Care","پرسنل کیئر",90,[["Soap","صابن"],["Shampoo","شیمپو"],["Toothpaste & Brush","ٹوتھ پیسٹ"],["Creams & Lotions","کریم و لوشن"],["Razors & Blades","ریزر و بلیڈ"]]],
    ["Cleaning & Detergents","صفائی",100,[["Washing Powder","واشنگ پاؤڈر"],["Laundry Soap","دھلائی صابن"],["Dishwash","برتن دھلائی"],["Cleaners & Sprays","کلینر و اسپرے"]]],
    ["Baby Care","بچوں کی دیکھ بھال",110,[["Diapers","ڈائپر"],["Baby Milk & Formula","بے بی دودھ"],["Baby Cereals","سیریلک"],["Baby Wipes","وائپس"]]],
    ["Cigarettes & Counter","سگریٹ و کاؤنٹر",120,[["Cigarettes","سگریٹ"],["Pan, Chalia & Supari","پان و سپاری"],["Matches & Lighters","ماچس و لائٹر"],["Batteries","بیٹری"],["Stationery","اسٹیشنری"]]]
  ]'::jsonb;
  v_p jsonb; v_c jsonb; v_i int := 0;
begin
  if not v_seed then
    raise notice 'Kiryana categories already seeded — skipping.';
    return;
  end if;

  for v_p in select * from jsonb_array_elements(v_tree) loop
    insert into public.categories (name_en, name_ur, parent_id, sort_order)
    values (v_p->>0, v_p->>1, null, (v_p->>2)::int)
    returning id into v_parent;

    v_i := 0;
    for v_c in select * from jsonb_array_elements(v_p->3) loop
      v_i := v_i + 1;
      insert into public.categories (name_en, name_ur, parent_id, sort_order)
      values (v_c->>0, v_c->>1, v_parent, v_i);
    end loop;
  end loop;
end $$;
