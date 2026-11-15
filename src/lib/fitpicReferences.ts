/**
 * Explicit seller photo roles for paid FLUX try-ons. The order below is ONLY a
 * starting suggestion, never AI image recognition. Require seller review
 * before submitting references (default inventory bag at #5; users can move it).
 */
export type TryonView="front"|"back";
export type TryonRole="front"|"back"|"detail"|"skip";
export function suggestedFitpicRole(index:number,total:number):TryonRole{
  if(index<0||index>=total)return "skip";
  if(total===5&&index===4)return "skip";
  if(index===0)return "front";
  if(index===3&&total>=4)return "back";
  if(total===2&&index===1)return "back";
  return "detail";
}
export interface FitpicReferenceSelection{index:number;role:Exclude<TryonRole,"skip">}
export function selectFitpicReferenceIndices(
  imageIds:string[], roleMap:Record<string,TryonRole>, view:TryonView,
):FitpicReferenceSelection[]{
  if(view!=="front"&&view!=="back")throw Error("Bitte Vorder- oder Rückansicht für das Fitpic auswählen.");
  const entries=imageIds.slice(0,5).map((id,index)=>({
    index,
    // #5 is only the default bag position. The seller can override it
    // if a real jeans photo is there and the bag is elsewhere.
    role:(roleMap[id]||suggestedFitpicRole(index,imageIds.length)) as TryonRole,
  })).filter((entry):entry is FitpicReferenceSelection=>entry.role!=="skip");
  const ranked=entries.sort((a,b)=>{
    const score=(role:TryonRole)=>role===view?0:role==="detail"?1:2;
    return score(a.role)-score(b.role)||a.index-b.index;
  });
  if(!ranked.length||ranked[0].role!==view)
    throw Error(`Es fehlt ein vollständiges Originalfoto der ${view==="front"?"Vorderseite":"Rückseite"}. Bitte die Foto-Zuordnung in Sascha AI korrigieren.`);
  if(ranked.length<2)
    throw Error("Bitte mindestens zwei echte Jeansfotos auswählen (Ganzansicht und weitere Ansicht/Detail).");
  return ranked.slice(0,4);
}
