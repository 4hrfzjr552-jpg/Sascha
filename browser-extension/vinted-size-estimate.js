/* Sascha AI → Vinted size proposals.
 * Men's jeans: W size estimated from flat waist only when size label missing.
 * Women's jeans: Vinted's letter-size picker (XS/S/M/L/XL...) needs an
 * APPROXIMATE letter size, not a men's W size. Preserve real letter labels,
 * and flag all measurements/W/explicit US or EU conversions for review.
 * Measurements are garment widths, NOT a brand's official body-size chart.
 * NEVER use these guesses to silently save a Vinted listing in batch mode.
 */
((root) => {
  "use strict";
  const WOMEN_LETTERS=Object.freeze(["XS","S","M","L","XL","XXL","3XL"]);
  function isMissingSize(value){
    const text=String(value??"").trim().toLowerCase();
    // OCR/AI may output a textual reason instead of a size. These are
    // explicit "no readable label" markers, not manufacturer sizes.
    // Never treat an arbitrary unfamiliar size as missing.
    return !text||/^(?:-|--|n\/a|na|unknown|unbekannt|keine angabe|nicht bekannt|fehlt|ohne gr[oö][ßs]e|size unknown|nicht angegeben|k\.?\s*a\.?|nicht lesbar|nicht erkennbar|nicht zu erkennen|unleserlich|unlesbar|kaum lesbar|nicht entzifferbar|gr[oö][ßs]e nicht lesbar|gr[oö][ßs]e unleserlich|size unreadable|unreadable|illegible|not readable|not legible|not visible)$/.test(text);
  }
  function parseFlatWaistCm(raw){
    if(typeof raw!=="string"&&typeof raw!=="number")return null;
    const match=String(raw).trim().match(/^(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:cm)?$/i);
    if(!match)return null;
    const cm=Number(match[1].replace(",","."));
    return Number.isFinite(cm)&&cm>=28&&cm<=62?cm:null;
  }
  // Approximate NON-BRAND-SPECIFIC women's letter-size chart by waistband
  // circumference in cm. Jeans are not standardized, and stretch/fit matter.
  // This is only a suggested selection, requiring confirmation by the seller.
  function womenLetterFromCircumference(cm){
    if(!Number.isFinite(cm)||cm<56||cm>102)return null;
    const ceilings=[66,72,78,84,90,96,102];
    const index=ceilings.findIndex(upper=>cm<=upper);
    return index<0?null:WOMEN_LETTERS[index];
  }
  function estimate(draft,classification){
    if(!isMissingSize(draft?.size))
      return {ok:false,reason:"Etikettgröße ist vorhanden; Maße dürfen sie nicht überschreiben"};
    if(classification?.kind!=="jeans"||!["men","women"].includes(classification?.gender))
      return {ok:false,reason:"Größe nur für eindeutig erkannte Herren-/Damen-Jeans schätzbar"};
    const waistCm=parseFlatWaistCm(draft?.measurements?.waist);
    if(waistCm===null)
      return {ok:false,reason:"Keine gültige flach gemessene Bundweite (cm) vorhanden"};
    const circumferenceCm=+(waistCm*2).toFixed(1);
    const inches=+(circumferenceCm/2.54).toFixed(1);
    if(classification.gender==="women"){
      const letter=womenLetterFromCircumference(circumferenceCm);
      if(!letter)return {ok:false,reason:"Bundweite außerhalb der vorsichtig unterstützten Damen-Größentabelle"};
      return {ok:true,size:letter,estimated:true,waistCm,circumferenceCm,inches,
        source:"measured-waist",reason:"Damen-Buchstabengröße nur aus gemessener Bundweite geschätzt, kein Etikett",
        uncertainty:"Je nach Marke, Dehnung und Schnitt kann die Buchstabengröße abweichen"};
    }
    const rounded=Math.round(circumferenceCm/2.54);
    if(rounded<23||rounded>48)
      return {ok:false,reason:"Berechneter Taillenumfang außerhalb üblicher W-Größen"};
    return {ok:true,size:"W"+rounded,estimated:true,waistCm,circumferenceCm,inches,
      source:"measured-waist",reason:"Nur Näherung aus flach gemessener Bundweite, kein Etikett",
      uncertainty:"±1–2 W-Größen je nach Marke/Schnitt möglich"};
  }

  // Explicit women's W, US and EU labels sometimes cannot be entered in
  // Vinted's alphabetic-only size picker. Convert to a *provisional* choice.
  // Bare "36" is deliberately NOT converted: EU 36 and W36 differ greatly.
  function convertWomenLabel(raw,classification){
    if(classification?.gender!=="women"||classification?.kind!=="jeans")
      return {ok:false,reason:"Nur für Damenjeans"};
    const label=String(raw??"").trim().toUpperCase();
    let chosen=null,source="",detail="";
    const w=label.match(/^W\s?(\d{2})(?:\s*[/_-]\s*L\s?\d{2})?$/);
    if(w){
      const n=Number(w[1]);
      if(n<23||n>42)return {ok:false,reason:"W-Größe außerhalb plausibler Damen-Größen"};
      chosen=womenLetterFromCircumference(n*2.54);
      source="w-label";detail="W"+n;
    }
    const us=label.match(/^US\s?(\d{1,2})$/);
    if(us){
      const n=Number(us[1]);
      // Approximate US women's clothing-size conversion.
      const pairs=[["XS",0,2],["S",4,6],["M",8,10],["L",12,14],
        ["XL",16,18],["XXL",20,22],["3XL",24,26]];
      chosen=pairs.find(([,lo,hi])=>n>=lo&&n<=hi)?.[0]||null;
      source="us-label";detail="US "+n;
    }
    const eu=label.match(/^(?:EU|DE)\s?(\d{2})$/);
    if(eu){
      const n=Number(eu[1]);
      chosen=({32:"XS",34:"XS",36:"S",38:"M",40:"L",
        42:"XL",44:"XXL",46:"3XL"})[n]||null;
      source="eu-label";detail="EU "+n;
    }
    if(!chosen)return {ok:false,reason:"Keine eindeutig konvertierbare W-/US-/EU-Etikettgröße"};
    return {ok:true,size:chosen,estimated:true,converted:true,source,
      originalLabel:detail,
      reason:"Etikett "+detail+" vorläufig als Damen-Buchstabengröße "+chosen+
        " umgerechnet; Marke/Schnitt kontrollieren",
      uncertainty:"Nur Orientierung – Vinted-Auswahl muss manuell überprüft werden"};
  }
  // Bare numeric women's labels (e.g. "6" or "36") are ambiguous:
  // US/UK 6, EU 36, or a jeans-size notation can mean different things.
  // If Vinted does not offer that number, derive a provisional letter size
  // ONLY from an actual flat waist measurement, never from the numeral.
  // Preserve the original label in the explanation; do not overwrite it.
  function estimateWomenNumericByWaist(draft,classification){
    if(classification?.gender!=="women"||classification?.kind!=="jeans")
      return {ok:false,reason:"Nur für eindeutig erkannte Damenjeans"};
    const originalLabel=String(draft?.size??"").trim();
    if(!/^\d{1,2}$/.test(originalLabel))
      return {ok:false,reason:"Keine alleinstehende numerische Damengröße"};
    const waistCm=parseFlatWaistCm(draft?.measurements?.waist);
    if(waistCm===null)
      return {ok:false,reason:"Etikettgröße "+originalLabel+
        " ist in Vinted nicht auswählbar; keine gültige flach gemessene Bundweite (cm) für eine Schätzung vorhanden"};
    const approximation=estimate({
      ...draft,size:"",measurements:{...draft.measurements,waist:waistCm}
    },classification);
    if(!approximation.ok)return approximation;
    return {...approximation,source:"ambiguous-label-waist",
      originalLabel,
      converted:true,
      reason:"Etikettgröße "+originalLabel+" ist ohne Größenformat (z. B. US oder EU) "+
        "nicht eindeutig umrechenbar; "+approximation.size+
        " nur aus Bundweite "+waistCm+" cm geschätzt – Etikett vor Veröffentlichung prüfen",
      uncertainty:"Der Etikettwert wurde nicht in eine US-/EU-Größe umgedeutet"};
  }
  function letterAliases(size){
    if(size==="XXL")return ["XXL","2XL"];
    if(size==="3XL")return ["3XL","XXXL"];
    return [size];
  }
  const api=Object.freeze({isMissingSize,parseFlatWaistCm,estimate,
    womenLetterFromCircumference,convertWomenLabel,estimateWomenNumericByWaist,letterAliases});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.SaschaVintedWaistEstimate=api;
})(typeof window!=="undefined"?window:globalThis);
