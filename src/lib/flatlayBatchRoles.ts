/** Seller-adjustable roles for a jean listing's original photographs.
 * The first/last whole-jean guesses follow the application's conventional
 * photo order only. These are NOT automatic visual recognition and MUST be
 * shown to the seller for review before any paid batch generation.
 */
export type ListingPhotoRole = "front" | "back" | "detail" | "skip";

export function defaultListingPhotoRole(index:number, total:number):ListingPhotoRole {
  if(index<0 || total<1 || index>=total) return "skip";
  // The app reserves the fifth image for the handwritten inventory bag.
  if(total===5 && index===4) return "skip";
  const productCount=total===5 ? 4 : total;
  if(index===0) return "front";
  if(productCount>=2 && index===productCount-1) return "back";
  return "detail";
}
export function modeForListingRole(role:ListingPhotoRole): "flatlay" | "detail" | null {
  if(role==="front"||role==="back")return "flatlay";
  if(role==="detail")return "detail";
  return null;
}
export function summarizeListingRoles(roles:ListingPhotoRole[]):{front:number;back:number;detail:number;skip:number;paid:number}{
  const tally={front:0,back:0,detail:0,skip:0,paid:0};
  for(const role of roles) {tally[role]++;if(role!=="skip")tally.paid++;}
  return tally;
}
