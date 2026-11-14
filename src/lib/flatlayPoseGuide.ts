/**
 * Geometry-only FLUX.2 reference. It is not a photograph or a second
 * garment, so it cannot contribute fake pockets, logos, brand labels or wash.
 * Two deliberately bent leg paths end with their inner cuff edges touching.
 *
 * FLUX treats this as an additional composition reference; exact fidelity
 * remains unguaranteed. Human inspection before Vinted export is mandatory.
 */
export function flatlayPoseGuideSvg():string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#fff"/>
  <g stroke-linejoin="round" stroke-linecap="round" fill="none">
    <path d="M 210 143 L 171 228 L 204 309 L 172 387 L 221 463" stroke="#222" stroke-width="75"/>
    <path d="M 210 143 L 171 228 L 204 309 L 172 387 L 221 463" stroke="#f4f4f4" stroke-width="67"/>
    <path d="M 302 143 L 341 228 L 308 309 L 340 387 L 291 463" stroke="#222" stroke-width="75"/>
    <path d="M 302 143 L 341 228 L 308 309 L 340 387 L 291 463" stroke="#f4f4f4" stroke-width="67"/>
  </g>
  <path d="M143 55 L369 55 L371 111 L318 174 L256 198 L194 174 L141 111 Z" fill="#f4f4f4" stroke="#222" stroke-width="5" stroke-linejoin="round"/>
  <path d="M143 91 L369 91" stroke="#999" stroke-width="3"/>
  <path d="M185 466 L256 466 L256 477 L185 477" fill="#f4f4f4" stroke="#222" stroke-width="4"/>
  <path d="M256 466 L327 466 L327 477 L256 477" fill="#f4f4f4" stroke="#222" stroke-width="4"/>
</svg>`;
}

/** Render the neutral silhouette to a compact JPEG for BFL input_image_2. */
export async function createFlatlayPoseGuide():Promise<string> {
  const source="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(flatlayPoseGuideSvg());
  const img=new Image();
  await new Promise<void>((resolve,reject)=>{
    img.onload=()=>resolve();
    img.onerror=()=>reject(new Error("Flatlay-Umrissvorlage konnte nicht erzeugt werden."));
    img.src=source;
  });
  const canvas=document.createElement("canvas");
  canvas.width=512;canvas.height=512;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw new Error("Flatlay-Umrissvorlage wird auf diesem Gerät nicht unterstützt.");
  ctx.fillStyle="#fff";
  ctx.fillRect(0,0,512,512);
  ctx.drawImage(img,0,0,512,512);
  const jpeg=canvas.toDataURL("image/jpeg",0.83);
  if(!jpeg.startsWith("data:image/jpeg;base64,"))throw Error("Flatlay-Umrissvorlage ungültig.");
  return jpeg;
}
