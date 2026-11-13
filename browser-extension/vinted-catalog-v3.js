/* Sascha AI → Vinted v3 catalog resolver.
   Data-driven IDs were observed in the user's real Vinted category search.
   Select ONLY an entry actually returned by the live Vinted form. */
((root) => {
  "use strict";
  const norm = v => String(v??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
  const CATEGORIES = Object.freeze([
    {id:1819,gender:"men",kind:"jeans",fit:"straight",name:"Gerade geschnittene Jeans",term:"Gerade geschnittene Jeans"},
    {id:1818,gender:"men",kind:"jeans",fit:"slim",name:"Jeans mit enger Passform",term:"Jeans mit enger Passform"},
    {id:1817,gender:"men",kind:"jeans",fit:"skinny",name:"Röhrenjeans",term:"Röhrenjeans"},
    {id:1845,gender:"women",kind:"jeans",fit:"straight",name:"Gerade geschnittene Jeans",term:"Gerade geschnittene Jeans"},
    {id:1844,gender:"women",kind:"jeans",fit:"skinny",name:"Röhrenjeans",term:"Röhrenjeans"},
    {id:1841,gender:"women",kind:"jeans",fit:"bootcut",name:"Schlaghosen",term:"Schlaghosen"},
    {id:1839,gender:"women",kind:"jeans",fit:"boyfriend",name:"Boyfriend Jeans",term:"Boyfriend Jeans"},
    {id:1816,gender:"men",kind:"jeans",fit:"ripped",name:"Ripped Jeans",term:"Ripped Jeans"},
    {id:1843,gender:"women",kind:"jeans",fit:"ripped",name:"Ripped Jeans",term:"Ripped Jeans"},
    {id:1840,gender:"women",kind:"jeans",fit:"cropped",name:"Cropped Jeans",term:"Cropped Jeans"},
    {id:1842,gender:"women",kind:"jeans",fit:"high-waist",name:"Jeans mit hoher Taille",term:"Jeans mit hoher Taille"},
    {id:1824,gender:"men",kind:"denim-shorts",fit:"",name:"Jeansshorts",term:"Jeansshorts"},
    {id:538,gender:"women",kind:"denim-shorts",fit:"",name:"Jeansshorts",term:"Jeansshorts"}
  ]);
  const byId=Object.freeze(Object.fromEntries(CATEGORIES.map(c=>[c.id,c])));
  const genderPatterns={
    men:/\b(herren|herrenhose|herrenjeans|manner|mannlich|men|mens|male|homme)\b/,
    women:/\b(damen|damenjeans|damenhose|frauen|weiblich|women|womens|female|femme)\b/,
    children:/\b(kinder|baby|kids|children|jungen|madchen|junior|neugeboren)\b/
  };
  const cutPatterns=[
    ["bootcut",/\b(bootcut|boot cut|boot-cut|flare|flared|schlaghose|schlaghosen|schlagjeans)\b/],
    ["skinny",/\b(skinny|super skinny|rohrenjeans|rohrenhose)\b/],
    ["slim",/\b(slim|slimfit|slim fit|schmal geschnitten|enge passform)\b/],
    ["straight",/\b(straight|regular fit|regular jeans|gerade geschnitten|gerades bein|straight leg|straight cut|regular straight|classic fit)\b/],
    ["boyfriend",/\b(boyfriend|boyfriend jeans)\b/],
    ["wide",/\b(baggy|wide leg|wide fit|loose fit|mom fit|mom jeans|boyfriend fit)\b/]
  ];
  const explicitFit={
    "regular":"straight","regular fit":"straight","regular-fit":"straight",
    "straight fit":"straight","straight-fit":"straight",
    "straight leg":"straight","classic straight":"straight",
    "skinny fit":"skinny","slim fit":"slim","ripped":"ripped",
    "cropped":"cropped","high waist":"high-waist",
    "high-waisted":"high-waist","high rise":"high-waist",
    "flare":"bootcut","flared":"bootcut","mom":"wide"
  };
  // SEO keyword lists may mention several cuts. Do not let them override
  // a single, clear fit from Sascha AI's structured data or product title.
  function fitFromText(raw){
    const value=norm(raw);
    if(!value)return {fit:"",ambiguous:false};
    const direct=explicitFit[value];
    if(direct)return {fit:direct,ambiguous:false};
    const matches=cutPatterns.filter(([,re])=>re.test(value)).map(([key])=>key);
    if(/\b(ripped|distressed)\b/.test(value))matches.push("ripped");
    if(/\bcropped\b/.test(value))matches.push("cropped");
    if(/\b(hochbund|hohe taille|high waist|high rise)\b/.test(value))
      matches.push("high-waist");
    const unique=[...new Set(matches)];
    return {fit:unique.length===1?unique[0]:"",ambiguous:unique.length>1};
  }
  function classifyFit(draft){
    const sources=[
      ["structured",[draft.fit,draft.cut,draft.jeansFit,draft.attributes?.fit]],
      ["title",[draft.title]],
      ["product",[draft.subcategory,draft.productType,draft.itemType]],
      ["description",[String(draft.description||"").slice(0,1000)]]
    ];
    for(const [source,parts] of sources){
      const raw=parts.filter(Boolean).join(" ");
      const result=fitFromText(raw);
      if(result.ambiguous)return {fit:"",source:source+"-ambiguous"};
      if(result.fit)return {fit:result.fit,source};
      // Unsupported exact cuts must not be overwritten by SEO copy.
      if(source==="structured"){
        const unsupported=norm(raw).match(/\b(tapered|loose|baggy|mom|relaxed|wide|weit)\b/);
        if(unsupported)return {fit:"",source:"structured-unsupported",hint:unsupported[1]};
      }
    }
    return {fit:"",source:"unresolved"};
  }
  function oneGender(value){
    const v=norm(value);
    const matched=Object.entries(genderPatterns).filter(([,re])=>re.test(v)).map(([k])=>k);
    return matched.length===1?matched[0]:"";
  }
  function classify(draft){
    const structured=[draft.gender,draft.sex,draft.targetGender,draft.audience,
      draft.department,draft.categoryPath].filter(Boolean).join(" ");
    const heading=[draft.title,draft.subcategory,draft.category,draft.productType,draft.itemType].filter(Boolean).join(" ");
    const description=String(draft.description||"").slice(0,1000);
    const gender=oneGender(structured)||oneGender(heading)||oneGender(description);
    const all=norm([draft.category,draft.categoryPath,draft.productType,draft.title,
      draft.description].filter(Boolean).join(" "));
    const jacket=/\b(jeansjacke|denimjacke|denim jacket|jean jacket)\b/.test(all);
    const denim=/\b(jeans|jeanhose|jeanshose|jeansshorts|denimhose|denim|ripped jeans)\b/.test(all);
    const shorts=/\b(jeansshorts|denim shorts|shorts|kurze jeans)\b/.test(all);
    const kind=jacket?"unsupported":denim?(shorts?"denim-shorts":"jeans"):"unsupported";
    const resolved=classifyFit(draft);
    const fit=kind==="denim-shorts"?"":resolved.fit;
    return {gender,kind,fit,hint:resolved.hint||"",
      source:kind==="denim-shorts"?"not-required":resolved.source};
  }
  // Unsupported fits must use a verified live Vinted option rather than
  // incorrectly substituting Straight or a guessed category ID.
  const FIT_LABELS={
    weit:/\b(weit\w*|baggy|loose|wide|mom|relaxed)\b/,
    wide:/\b(weit\w*|baggy|loose|wide|mom|relaxed)\b/,
    loose:/\b(weit\w*|baggy|loose|wide|mom|relaxed)\b/,
    baggy:/\b(weit\w*|baggy|loose|wide|mom|relaxed)\b/,
    mom:/\b(weit\w*|baggy|loose|wide|mom|relaxed)\b/,
    relaxed:/\b(weit\w*|baggy|loose|wide|mom|relaxed)\b/,
    tapered:/\b(tapered|konisch\w*|karotten\w*)\b/,
    bootcut:/\b(schlaghosen?|bootcut|flare\w*)\b/,
    boyfriend:/\bboyfriend\b/,
    cropped:/\b(cropped|verkurzt\w*|knochel\w*)\b/,
    "high-waist":/\b(hohe\w* taille|high waist\w*)\b/,
    slim:/\b(enger passform|slim\w*|schmal\w*)\b/
  };
  const FIT_TERMS={wide:"Jeans weit",loose:"Jeans weit",baggy:"Jeans weit",mom:"Jeans weit",
    relaxed:"Jeans weit",tapered:"Tapered Jeans",bootcut:"Schlaghosen",
    boyfriend:"Boyfriend Jeans",cropped:"Cropped Jeans","high-waist":"Jeans mit hoher Taille",
    slim:"Jeans mit enger Passform"};
  const GENERIC_LABEL=/\b(andere|sonstige|weitere)\s+jeans\b/;

  function intentForDraft(draft){
    const intent=classify(draft);
    if(!["men","women"].includes(intent.gender))
      return {ok:false,intent,reason:"Herren/Damen nicht eindeutig erkannt"};
    if(!["jeans","denim-shorts"].includes(intent.kind))
      return {ok:false,intent,reason:"Artikeltyp wird noch nicht automatisch kategorisiert"};
    const match=CATEGORIES.find(c=>c.kind===intent.kind&&c.gender===intent.gender&&c.fit===intent.fit);
    if(match)return {ok:true,intent,category:match};
    if(intent.kind!=="jeans")return {ok:false,intent,reason:"Keine bestätigte Kategorie"};
    const fit=intent.fit||intent.hint||"";
    return {ok:true,intent,fallback:true,
      reason:fit?"Schnitt "+fit+" benötigt Live-Suche":"Schnitt unklar – Live-Suche",
      category:{id:null,generic:true,gender:intent.gender,kind:"jeans",fit,
        name:"Andere Jeans",term:FIT_TERMS[fit]||"Jeans",
        terms:[...new Set([FIT_TERMS[fit],"Andere Jeans","Jeans"].filter(Boolean))]}};
  }
  function parseRow(entry){
    const id=Number(entry.id);
    const text=norm([entry.text,entry.name,entry.path].filter(Boolean).join(" "));
    return {id,text};
  }
  function adultAudience(text,category){
    const audience=category.gender==="men"?/\b(herren|men)\b/:/\b(damen|women)\b/;
    return audience.test(text)&&!/\b(kinder|baby|madchen|jungs|jungen|kids)\b/.test(text);
  }
  function matchingRows(rows,category){
    return rows.map(entry=>{
      const {id,text}=parseRow(entry);
      const correctId=id===category.id;
      const correctName=text.includes(norm(category.name));
      const pathLooksAdult=adultAudience(text,category);
      const hasJeans=category.kind==="denim-shorts"?/\b(jeansshorts|denim shorts)\b/.test(text):
        /\b(jeans|jean|schlaghosen)\b/.test(text);
      return {entry,id,correctId,eligible:correctName&&pathLooksAdult&&hasJeans,
        reason:!correctName?"category label differs":!pathLooksAdult?"gender/path not confirmed":
          !hasJeans?"wrong item type":correctId?"verified":"verified (ID changed)"};
    });
  }
  function selectGeneric(rows,category){
    const base=rows.map(entry=>{
      const {id,text}=parseRow(entry);
      return {entry,id,text,eligible:adultAudience(text,category)&&
        /\b(jeans|jean|schlaghosen)\b/.test(text)&&
        !/\b(shorts|jacke|jacken|latzhose|overall)\b/.test(text)};
    });
    const tiers=[];
    const fitRe=FIT_LABELS[category.fit];
    if(fitRe)tiers.push(["fit",x=>fitRe.test(x.text)]);
    tiers.push(["generic",x=>GENERIC_LABEL.test(x.text)]);
    for(const [tier,test] of tiers){
      const hits=base.filter(x=>x.eligible&&test(x));
      if(hits.length===1)return {ok:true,entry:hits[0].entry,id:hits[0].id,generic:true,tier};
      if(hits.length>1)return {ok:false,reason:"Kategorie mehrfach vorhanden",diagnostics:hits.map(x=>x.entry)};
    }
    return {ok:false,reason:"Passende Kategorie ist nicht in den Vinted-Suchergebnissen",diagnostics:base};
  }
  function selectLiveCategory(rows,category){
    if(category.generic)return selectGeneric(rows,category);
    const all=matchingRows(rows,category);
    const eligible=all.filter(x=>x.eligible);
    const exactId=eligible.filter(x=>x.correctId);
    const pick=exactId.length===1?exactId[0]:(exactId.length===0&&eligible.length===1?eligible[0]:null);
    if(!pick)return {ok:false,
      reason:eligible.length?"Kategorie mehrfach vorhanden":"Passende Kategorie ist nicht in den Vinted-Suchergebnissen",
      diagnostics:all};
    return {ok:true,entry:pick.entry,id:pick.id,idDrift:!pick.correctId};
  }
  function sizeChoice(original,visible,draft){
    const raw=norm(original).replace(/\s+/g,"");
    const found=raw.match(/^w?(\d{2})(?:[/_-]?l\d{2})?$/);
    const values=[...new Set(visible.map(norm).filter(Boolean))];
    const exact=values.find(v=>v===raw);
    if(exact)return {ok:true,size:exact,source:"Etikett"};
    if(!found)return {ok:values.includes(raw),size:raw,source:"Etikett"};
    const n=+found[1], waist="w"+n;
    if(values.includes(waist))return {ok:true,size:waist,source:"Etikett"};
    if(values.includes(String(n)))return {ok:true,size:String(n),source:"Etikett"};
    // Vinted's Jeans picker offers a separate "Taillenumfang" group
    // containing real W sizes. Brand charts are unsuitable as a substitute:
    // W36 must never become XXL automatically.
    return {ok:false,reason:"Taillenumfang W"+n+
      " ist nicht sichtbar; keine Umrechnung auf XS–7XL"};
  }
  const api=Object.freeze({norm,CATEGORIES,byId,classify,fitFromText,classifyFit,intentForDraft,matchingRows,
    selectLiveCategory,sizeChoice});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.SaschaVintedCatalogV3=api;
})(typeof window!=="undefined"?window:globalThis);
