/* Sascha AI → Vinted: jeans waist-size ESTIMATE for missing labels.
 * A flat waist measurement is not a reliable manufacturer size.
 * W-sized categories may accept an approximate waist-inch number, but
 * require human review before the Vinted listing is saved as a draft.
 */
((root) => {
  "use strict";
  function isMissingSize(value){
    const text=String(value??"").trim().toLowerCase();
    return !text||/^(?:-|--|n\/a|na|unknown|unbekannt|keine angabe|nicht bekannt|fehlt|ohne gr[oö][ßs]e|size unknown|nicht angegeben|k\.?\s*a\.?)$/.test(text);
  }
  function parseFlatWaistCm(raw) {
    // Sascha AI PantMeasurements.waist specifically means width measured flat.
    // Do not interpret any other field as waistband or circumference.
    if(typeof raw!=="string"&&typeof raw!=="number")return null;
    const value=String(raw).trim();
    const match=value.match(/^(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:cm)?$/i);
    if(!match)return null;
    const n=Number(match[1].replace(",","."));
    // Reject impossible/suspicious values: 90 is circumference, not flat width.
    return Number.isFinite(n)&&n>=28&&n<=62?n:null;
  }
  function estimate(draft,classification){
    if(!isMissingSize(draft?.size))
      return {ok:false,reason:"Etikettgröße ist vorhanden; Maße dürfen sie nicht überschreiben"};
    if(classification?.kind!=="jeans"||!["men","women"].includes(classification?.gender))
      return {ok:false,reason:"Größe nur für eindeutig erkannte Herren-/Damen-Jeans schätzbar"};
    const waistCm=parseFlatWaistCm(draft?.measurements?.waist);
    if(waistCm===null)
      return {ok:false,reason:"Keine gültige flach gemessene Bundweite (cm) vorhanden"};
    const rawInches=waistCm*2/2.54;
    const rounded=Math.round(rawInches);
    if(rounded<23||rounded>48)
      return {ok:false,reason:"Berechneter Taillenumfang außerhalb üblicher W-Größen"};
    // W sizing varies by brand, fabric stretch and fit; this is a guide only.
    // Preserve explicitly measured centimeters alongside the estimate.
    return {
      ok:true,
      size:"W"+rounded,
      estimated:true,
      waistCm,
      circumferenceCm:+(waistCm*2).toFixed(1),
      inches:+rawInches.toFixed(1),
      uncertainty:"±1–2 W-Größen je nach Marke/Schnitt möglich",
      reason:"Nur Näherung aus flach gemessener Bundweite, kein Etikett"
    };
  }
  const api=Object.freeze({isMissingSize,parseFlatWaistCm,estimate});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.SaschaVintedWaistEstimate=api;
})(typeof window!=="undefined"?window:globalThis);
