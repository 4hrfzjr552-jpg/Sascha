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
    ["bootcut",/\b(bootcut|boot cut|flare|flared|schlaghose|schlaghosen|schlagjeans)\b/],
    ["skinny",/\b(skinny|super skinny|rohrenjeans|rohrenhose)\b/],
    ["slim",/\b(slim|slimfit|schmal geschnitten|enge passform)\b/],
    ["straight",/\b(straight|regular fit|regular jeans|gerade geschnitten|gerades bein|straight leg)\b/],
    ["boyfriend",/\b(boyfriend|boyfriend jeans)\b/],
    ["wide",/\b(baggy|wide leg|wide fit|loose fit|mom fit|mom jeans|boyfriend fit)\b/]
  ];
  const explicitFit={
    "regular":"straight","regular fit":"straight","straight leg":"straight",
    "skinny fit":"skinny","slim fit":"slim","ripped":"ripped",
    "cropped":"cropped","high waist":"high-waist",
    "high-waisted":"high-waist","high rise":"high-waist",
    "flare":"bootcut","flared":"bootcut","mom":"wide"
  };
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
    const supplied=norm([draft.fit,draft.cut,draft.jeansFit,draft.attributes?.fit].filter(Boolean).join(" "));
    const source=supplied||norm(heading+" "+description);
    const declared=explicitFit[source]||"";
    const matches=cutPatterns.filter(([,re])=>re.test(source)).map(([key])=>key);
    const unique=[...new Set(matches)];
    let fit=declared || (unique.length===1?unique[0]:"");
    if(!fit && /(?:^|\b)ripped(?:\b|$)/.test(source))fit="ripped";
    if(!fit && /\bcropped\b/.test(source))fit="cropped";
    if(!fit && /\b(hochbund|hohe taille|high waist|high rise)\b/.test(source))fit="high-waist";
    if(kind==="denim-shorts")fit="";
    return {gender,kind,fit,source:fit?(supplied?"structured":"text"):"unresolved"};
  }
  function intentForDraft(draft){
    const intent=classify(draft);
    if(!["men","women"].includes(intent.gender))return {ok:false,intent,reason:"Herren/Damen nicht eindeutig erkannt"};
    if(!["jeans","denim-shorts"].includes(intent.kind))return {ok:false,intent,reason:"Artikeltyp wird noch nicht automatisch kategorisiert"};
    if(intent.kind==="jeans"&&!intent.fit)return {ok:false,intent,reason:"Jeans-Schnitt nicht eindeutig erkannt"};
    const match=CATEGORIES.find(c=>c.kind===intent.kind&&c.gender===intent.gender&&c.fit===intent.fit);
    if(!match)return {ok:false,intent,reason:"Für Geschlecht und Schnitt ist noch keine bestätigte Vinted-Kategorie hinterlegt"};
    return {ok:true,intent,category:match};
  }
  function parseRow(entry){
    const id=Number(entry.id);
    const text=norm([entry.text,entry.name,entry.path].filter(Boolean).join(" "));
    return {id,text};
  }
  function matchingRows(rows,category) {
    return rows.map(entry=>{
      const {id,text}=parseRow(entry);
      const known=byId[id];
      // ID alone is not enough: confirm the label and audience shown by Vinted.
      const correctId=id===category.id;
      const correctName=text.includes(norm(category.name));
      const audience=category.gender==="men"?/\b(herren|men)\b/:/\b(damen|women)\b/;
      const pathLooksAdult=audience.test(text)&&!/\b(kinder|baby|madchen|jungs|jungen|kids)\b/.test(text);
      const hasJeans=category.kind==="denim-shorts"?/\b(jeansshorts|denim shorts)\b/.test(text):
        /\b(jeans|jean|schlaghosen)\b/.test(text);
      return {entry,id,eligible:correctId&&correctName&&pathLooksAdult&&hasJeans,
        reason:!correctId?"other category ID":!correctName?"category label differs":
          !pathLooksAdult?"gender/path not confirmed":!hasJeans?"wrong item type":"verified"};
    });
  }
  function selectLiveCategory(rows,category){
    const matches=matchingRows(rows,category).filter(x=>x.eligible);
    if(matches.length!==1)return {ok:false,reason:matches.length?"Kategorie mehrfach vorhanden":"Passende Kategorie ist nicht in den Vinted-Suchergebnissen",diagnostics:matchingRows(rows,category)};
    return {ok:true,entry:matches[0].entry,id:category.id};
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
    // Approximate size tables: ALWAYS return needsReview so the original W
    // label is never silently represented as a verified clothing size.
    const product=classify(draft);
    if(product.kind!=="jeans" || !["men","women"].includes(product.gender))
      return {ok:false,reason:"Artikelart oder Herren/Damen-Größe nicht eindeutig"};
    const brand=norm(draft.brand);
    let letter="",reference="";
    if(product.gender==="men" && brand==="diesel"){
      const diesel={26:"XS",27:"S",28:"S",29:"M",30:"M",31:"L",32:"L",
        33:"XL",34:"XL",36:"XXL",38:"XXXL",40:"4XL"};
      letter=diesel[n]||"";
      reference="Diesel-Herrenjeans-Größentabelle";
    }else if(product.gender==="men"){
      const chart=[[23,27,"XS"],[29,31,"S"],[32,34,"M"],[35,36,"L"],
        [38,40,"XL"],[41,44,"XXL"],[46,50,"XXXL"],[51,55,"4XL"]];
      letter=chart.find(([min,max])=>n>=min&&n<=max)?.[2]||"";
      reference="Vinted-Herrenbekleidung-Größentabelle";
    }else{
      const women={26:"XS",27:"S",28:"S",29:"M",30:"M",31:"L",32:"L",
        33:"XL",34:"XL",35:"XXL",36:"XXL",37:"XXXL",38:"XXXL",
        39:"4XL",40:"4XL",41:"5XL",42:"5XL",43:"6XL",44:"6XL",
        45:"7XL",46:"7XL"};
      letter=women[n]||"";
      reference="Vinted-Damenjeans-Größentabelle";
    }
    const special=norm(letter).replace(/^xxxl$/,"3xl").replace(/^xxl$/,"2xl");
    const candidate=values.find(v=>v===norm(letter)||v===special);
    if(candidate)return {ok:false,size:candidate,needsReview:true,source:reference,
      reason:"Buchstabengröße aus einer Größentabelle, keine Etikettbestätigung"};
    return {ok:false,reason:"Keine identische Vinted-Größe verfügbar; manuelle Zuordnung erforderlich"};
  }
  const api=Object.freeze({norm,CATEGORIES,byId,classify,intentForDraft,matchingRows,
    selectLiveCategory,sizeChoice});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.SaschaVintedCatalogV3=api;
})(typeof window!=="undefined"?window:globalThis);
