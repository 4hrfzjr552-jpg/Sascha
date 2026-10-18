import React, { useEffect, useMemo, useState } from "react";
import type { PantItem, SaleStatus, VintedDraftData } from "../types";
import { isPantEligibleForVintedDraft } from "../lib/vintedDraftUtils";
import { Archive, ArrowDownUp, ArrowLeft, BarChart3, Check, CheckCircle2, ChevronRight, ClipboardList, Cloud, Copy, Download, Grid2X2, Layers3, List, Loader2, Package, Pencil, Plus, Search, ShoppingBag, Sparkles, Trash2, X } from "lucide-react";

interface Props {
  pants: PantItem[];
  drafts: VintedDraftData[];
  userEmail?: string;
  isSyncing?: boolean;
  onCreate: () => Promise<void>;
  onUpdate: (pant: PantItem) => Promise<void>;
  onSaleStatusChange: (pant: PantItem, status: SaleStatus) => void | Promise<void>;
  onPrepareDraft: (pant: PantItem) => void;
  onPrepareMany: (pants: PantItem[]) => Promise<void>;
  onOpenDrafts: () => void;
  onExportCsv: () => void;
  onEditSold: (pant: PantItem) => void;
  onDelete: (id: string) => void;
  onNotify: (message: string, type?: "info" | "success" | "error") => void;
}
type Filter = "all" | SaleStatus;
type Sort = "new" | "old" | "priceHigh" | "priceLow" | "number";
const FILTERS: {id:Filter;label:string}[] = [
  {id:"all",label:"Alle Listings"},{id:"draft",label:"Entwürfe"},
  {id:"ready",label:"Bereit"},{id:"uploaded",label:"Online markiert"},
  {id:"sold",label:"Verkauft"},{id:"archived",label:"Archiviert"}
];
const LABEL:Record<SaleStatus,string> = {
  draft:"Entwurf",ready:"Bereit",uploaded:"Online markiert",sold:"Verkauft",archived:"Archiviert"
};
const PILL:Record<SaleStatus,string> = {
  draft:"bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
  ready:"bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
  uploaded:"bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200",
  sold:"bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
  archived:"bg-stone-100 text-stone-500 dark:bg-stone-800"
};
const money=(n:number)=>new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number.isFinite(n)?n:0);
const price=(p:PantItem)=>typeof p.result?.pricing?.listingPrice==="number"?p.result.pricing.listingPrice:0;
const status=(p:PantItem):SaleStatus=>p.saleStatus||(p.result?"ready":"draft");
const name=(p:PantItem)=>p.result?.title||[p.result?.detected.brand,"Jeans","#"+(p.artikelnummer||p.number)].filter(Boolean).join(" ");
const go=(url:string)=>window.location.assign(url);
const field="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100";
const btn="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-xs font-bold hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800";
const primary="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50";

function Thumbnail({pant,large=false}:{pant:PantItem;large?:boolean}){
  const img=pant.images.find(i=>i.dataUrl)?.dataUrl;
  return <div className={"shrink-0 overflow-hidden rounded-xl bg-stone-100 dark:bg-stone-800 "+(large?"h-44 w-full":"h-14 w-14 sm:h-16 sm:w-16")}>
    {img?<img src={img} alt={name(pant)} className="h-full w-full object-cover" loading="lazy"/>:
      <div className="flex h-full w-full items-center justify-center text-stone-400"><ShoppingBag className="h-6 w-6"/></div>}
  </div>;
}
export const ListingsWorkspace:React.FC<Props>=({
  pants,drafts,userEmail,isSyncing,onCreate,onUpdate,onSaleStatusChange,
  onPrepareDraft,onPrepareMany,onOpenDrafts,onExportCsv,onEditSold,onDelete,onNotify
})=>{
  const [filter,setFilter]=useState<Filter>("all");
  const [query,setQuery]=useState("");
  const [sort,setSort]=useState<Sort>("new");
  const [grid,setGrid]=useState(false);
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [activeId,setActiveId]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [editTitle,setEditTitle]=useState("");
  const [editDescription,setEditDescription]=useState("");
  const [editPrice,setEditPrice]=useState("");
  const [editNotes,setEditNotes]=useState("");
  const active=pants.find(p=>p.id===activeId);
  const draftsByPant=useMemo(()=>new Set(drafts.map(d=>d.pantId)),[drafts]);
  const totals=useMemo(()=>{
    const res:Record<Filter,number>={all:pants.length,draft:0,ready:0,uploaded:0,sold:0,archived:0};
    pants.forEach(p=>res[status(p)]++);
    return res;
  },[pants]);
  const revenue=pants.filter(p=>status(p)==="sold").reduce((a,p)=>a+(p.salePrice||0),0);
  const inventoryValue=pants.filter(p=>["ready","uploaded"].includes(status(p))).reduce((a,p)=>a+price(p),0);
  const filtered=useMemo(()=>{
    const search=query.trim().toLocaleLowerCase("de-DE");
    return pants.filter(p=>(filter==="all"||status(p)===filter) &&
      (!search||[p.artikelnummer,p.number,p.result?.title,p.result?.description,
        p.result?.detected.brand,p.result?.detected.model,p.result?.detected.size]
        .join(" ").toLocaleLowerCase("de-DE").includes(search))).sort((a,b)=>{
          if(sort==="priceHigh")return price(b)-price(a);
          if(sort==="priceLow")return price(a)-price(b);
          if(sort==="old")return a.createdAt-b.createdAt;
          if(sort==="number")return (Number(b.artikelnummer)||b.number)-(Number(a.artikelnummer)||a.number);
          return b.createdAt-a.createdAt;
        });
  },[pants,filter,query,sort]);
  useEffect(()=>setSelected(prev=>new Set([...prev].filter(id=>pants.some(p=>p.id===id)))),[pants]);
  useEffect(()=>{
    if(!active)return;
    setEditTitle(active.result?.title||"");
    setEditDescription(active.result?.description||"");
    setEditPrice(price(active)?String(price(active)):"");
    setEditNotes(active.customNotes||"");
  },[activeId,active?.updatedAt]);
  const toggle=(id:string)=>setSelected(old=>{
    const next=new Set(old);next.has(id)?next.delete(id):next.add(id);return next;
  });
  const toggleAll=()=>{
    const ids=filtered.map(p=>p.id);
    const all=ids.length>0&&ids.every(id=>selected.has(id));
    setSelected(prev=>{const next=new Set(prev);ids.forEach(id=>all?next.delete(id):next.add(id));return next;});
  };
  const selectedPants=pants.filter(p=>selected.has(p.id));
  const prepare=async()=>{
    const candidates=selectedPants.filter(isPantEligibleForVintedDraft);
    if(!candidates.length){onNotify("Kein ausgewählter Artikel ist für Vinted vorbereitet.","error");return;}
    setBusy(true);
    try{await onPrepareMany(candidates);setSelected(new Set());}
    finally{setBusy(false);}
  };
  const bulkStatus=async(next:SaleStatus)=>{
    setBusy(true);
    try{
      for(const p of selectedPants)await onSaleStatusChange(p,next);
      onNotify(selectedPants.length+" Artikel aktualisiert.","success");
      setSelected(new Set());
    }finally{setBusy(false);}
  };
  const save=async()=>{
    if(!active?.result){onNotify("Zuerst im KI-Studio die Anzeige generieren.","error");return;}
    const numeric=Number(editPrice.replace(",","."));
    if(!editPrice.trim()||!Number.isFinite(numeric)||numeric<0||numeric>100000){
      onNotify("Ungültiger Angebotspreis.","error");return;
    }
    setBusy(true);
    try{
      await onUpdate({...active,customNotes:editNotes,updatedAt:Date.now(),result:{
        ...active.result,title:editTitle.trim().slice(0,100),description:editDescription,
        pricing:active.result.pricing?{...active.result.pricing,listingPrice:numeric}:{
          listingPrice:numeric,realisticPrice:numeric,quickSalePrice:numeric,
          minimumPrice:numeric,reasoning:"Manuell bearbeitet"
        }
      }});
      onNotify("Listing gespeichert.","success");
    }finally{setBusy(false);}
  };
  const copy=async(text:string)=>{
    try{await navigator.clipboard.writeText(text);onNotify("Kopiert.","success");}
    catch{onNotify("Kopieren im Browser nicht möglich.","error");}
  };
  const card=(label:string,val:string,sub:string,icon:React.ReactNode)=>
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <div className="flex justify-between gap-3"><span className="text-xs font-semibold text-stone-500">{label}</span><span className="rounded-lg bg-stone-50 p-2 text-stone-500 dark:bg-stone-800">{icon}</span></div>
      <div className="mt-3 text-2xl font-black tracking-tight">{val}</div><p className="mt-1 text-xs text-stone-500">{sub}</p>
    </div>;
  return <div className="min-h-screen bg-[#f8faf8] text-stone-900 dark:bg-stone-950 dark:text-stone-100">
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900 lg:flex">
        <button type="button" onClick={()=>go("/")} className="flex items-center gap-3 text-left"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-xl font-black text-white">S</span><span><strong className="block text-lg font-black">Sascha AI</strong><small className="text-[10px] font-semibold tracking-[0.12em] text-stone-400">SELLER WORKSPACE</small></span></button>
        <div className="mt-10 text-[10px] font-bold uppercase tracking-[0.17em] text-stone-400">Arbeitsbereich</div>
        <nav className="mt-3 space-y-1" aria-label="Navigation">
          <button type="button" onClick={()=>go("/")} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"><Sparkles className="h-4 w-4"/> KI-Studio</button>
          <span className="flex items-center gap-3 rounded-xl bg-emerald-50 px-3 py-3 text-sm font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><Layers3 className="h-4 w-4"/> Listings <span className="ml-auto text-xs">{pants.length}</span></span>
          <button type="button" onClick={onOpenDrafts} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"><ClipboardList className="h-4 w-4"/> Vinted-Entwürfe <span className="ml-auto text-xs">{drafts.length}</span></button>
          <button type="button" onClick={()=>go("/cloud")} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"><Cloud className="h-4 w-4"/> Cloud-Aufträge</button>
           <button type="button" onClick={onExportCsv} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"><Download className="h-4 w-4"/> CSV-Export</button>
        </nav>
        <div className="mt-auto rounded-2xl bg-stone-950 p-4 text-xs leading-relaxed text-stone-300 dark:bg-stone-800"><div className="mb-2 font-bold text-white">Dein Shop, dein Überblick</div>Diese Daten stammen aus Sascha AI. Vinted-Aufrufe und Favoriten werden hier noch nicht live synchronisiert.</div>
        <p className="mt-4 truncate text-xs text-stone-400">{userEmail}</p>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex min-h-[68px] items-center justify-between gap-3 border-b border-stone-200 bg-white/95 px-4 backdrop-blur dark:border-stone-800 dark:bg-stone-900/95 sm:px-7">
          <div className="flex items-center gap-2 text-sm"><button type="button" onClick={()=>go("/")} className="flex items-center gap-1 font-semibold text-stone-500 lg:hidden"><ArrowLeft className="h-4 w-4"/> Studio</button><span className="hidden text-stone-400 sm:block">Workspace /</span><span className="font-bold">Listings</span></div>
          <div className="flex items-center gap-3 text-xs text-stone-500">{isSyncing&&<Loader2 className="h-4 w-4 animate-spin"/>}<span className="hidden sm:block">Bestandsverwaltung</span><span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700">S</span></div>
        </header>
        <main className="mx-auto max-w-[1440px] space-y-6 px-4 py-8 sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-700">DEIN VERKAUFSCOCKPIT</p><h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Meine Listings</h1><p className="mt-2 text-sm text-stone-500">Artikel, Preise und Entwürfe auf einen Blick.</p></div>
            <div className="flex flex-wrap gap-2"><button type="button" className={btn} onClick={()=>go("/cloud")}><Cloud className="h-4 w-4"/> Cloud-Aufträge</button><button type="button" className={btn} onClick={onOpenDrafts}><ClipboardList className="h-4 w-4"/> Vinted-Entwürfe <span>{drafts.length}</span></button><button type="button" className={primary} onClick={async()=>{await onCreate();go("/");}}><Plus className="h-4 w-4"/> Neuer Artikel</button></div>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {card("Artikel gesamt",String(totals.all),totals.ready+" bereit",<ShoppingBag className="h-4 w-4"/>)}
            {card("Online markiert",String(totals.uploaded),"Manuell gepflegter Status",<Package className="h-4 w-4"/>)}
            {card("Warenwert",money(inventoryValue),"Bereit + online markiert",<BarChart3 className="h-4 w-4"/>)}
            {card("Umsatz",money(revenue),totals.sold+" Verkäufe erfasst",<CheckCircle2 className="h-4 w-4"/>)}
          </div>
          <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900" aria-label="Listings">
            <div className="border-b border-stone-100 px-4 pt-5 dark:border-stone-800 sm:px-6">
              <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-black">Artikelübersicht</h2><p className="mt-1 text-xs text-stone-500">{filtered.length} von {pants.length} Artikeln</p></div><div className="flex gap-2"><button type="button" onClick={onExportCsv} className={btn}><Download className="h-4 w-4"/> CSV</button><div className="flex rounded-xl border border-stone-200 p-1 dark:border-stone-700"><button type="button" aria-label="Liste" aria-pressed={!grid} className={"rounded-lg p-2 "+(!grid?"bg-stone-100 text-emerald-700 dark:bg-stone-800":"text-stone-400")} onClick={()=>setGrid(false)}><List className="h-4 w-4"/></button><button type="button" aria-label="Karten" aria-pressed={grid} className={"rounded-lg p-2 "+(grid?"bg-stone-100 text-emerald-700 dark:bg-stone-800":"text-stone-400")} onClick={()=>setGrid(true)}><Grid2X2 className="h-4 w-4"/></button></div></div></div>
              <div className="mt-5 flex flex-wrap gap-4">{FILTERS.map(f=><button type="button" key={f.id} onClick={()=>setFilter(f.id)} className={"-mb-px flex items-center gap-1.5 border-b-2 pb-3 text-xs font-bold "+(filter===f.id?"border-emerald-600 text-emerald-700":"border-transparent text-stone-500 hover:text-stone-900 dark:hover:text-stone-100")}>{f.label}<span className="rounded-lg bg-stone-100 px-1.5 py-0.5 text-[10px] dark:bg-stone-800">{totals[f.id]}</span></button>)}</div>
            </div>
            <div className="flex flex-wrap gap-3 p-4 sm:px-6"><label className="relative min-w-40 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"/><input type="search" aria-label="Artikel suchen" value={query} onChange={e=>setQuery(e.target.value)} className={field+" pl-9"} placeholder="SKU, Titel, Marke, Größe suchen ..."/></label><label className="relative"><span className="sr-only">Sortieren</span><ArrowDownUp className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"/><select className={field+" pl-9"} value={sort} onChange={e=>setSort(e.target.value as Sort)}><option value="new">Neueste zuerst</option><option value="old">Älteste zuerst</option><option value="number">Artikelnummer ↓</option><option value="priceHigh">Preis hoch → niedrig</option><option value="priceLow">Preis niedrig → hoch</option></select></label></div>
            {selected.size>0&&<div className="flex flex-wrap items-center gap-2 border-y border-emerald-100 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/30 sm:px-6"><strong className="mr-2 text-sm text-emerald-800 dark:text-emerald-300">{selected.size} ausgewählt</strong><button type="button" disabled={busy} onClick={()=>void prepare()} className={btn}><Sparkles className="h-4 w-4"/> Entwürfe vorbereiten</button><button type="button" disabled={busy} onClick={()=>void bulkStatus("ready")} className={btn}><Check className="h-4 w-4"/> Bereit</button><button type="button" disabled={busy} onClick={()=>void bulkStatus("archived")} className={btn}><Archive className="h-4 w-4"/> Archivieren</button><button type="button" onClick={()=>setSelected(new Set())} className="ml-auto p-2" aria-label="Auswahl aufheben"><X className="h-4 w-4"/></button></div>}
            {filtered.length===0?<div className="px-5 py-16 text-center text-sm text-stone-500">Keine passenden Artikel. <button type="button" onClick={()=>{setQuery("");setFilter("all");}} className="font-bold text-emerald-700">Filter zurücksetzen</button></div>:grid?
              <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-3 2xl:grid-cols-4">{filtered.map(p=><div key={p.id} className="rounded-2xl border border-stone-200 p-3 dark:border-stone-700"><div className="relative"><Thumbnail pant={p} large/><input type="checkbox" checked={selected.has(p.id)} onChange={()=>toggle(p.id)} aria-label={"Artikel #"+(p.artikelnummer||p.number)+" auswählen"} className="absolute left-3 top-3 h-4 w-4 accent-emerald-600"/></div><p className="mt-3 line-clamp-2 text-sm font-bold">{name(p)}</p><div className="mt-2 flex items-center justify-between gap-2"><strong className="text-sm">{money(price(p))}</strong><span className={"rounded-full px-2 py-1 text-[11px] font-semibold "+PILL[status(p)]}>{LABEL[status(p)]}</span></div><button type="button" onClick={()=>setActiveId(p.id)} className={btn+" mt-3 w-full"}>Artikel öffnen <ChevronRight className="h-3.5 w-3.5"/></button></div>)}</div>:
              <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead><tr className="border-y border-stone-100 bg-stone-50/70 text-[11px] uppercase tracking-wide text-stone-500 dark:border-stone-800 dark:bg-stone-900"><th className="p-4"><input type="checkbox" checked={filtered.length>0&&filtered.every(p=>selected.has(p.id))} onChange={toggleAll} aria-label="Alle auswählen" className="accent-emerald-600"/></th><th className="px-2 py-3">Artikel</th><th className="p-3">SKU</th><th className="p-3">Preis</th><th className="p-3">Status</th><th className="p-3">Vinted</th><th className="p-3">Aktion</th></tr></thead><tbody>{filtered.map(p=><tr key={p.id} className="border-b border-stone-100 hover:bg-stone-50/80 dark:border-stone-800 dark:hover:bg-stone-800/30"><td className="p-4"><input type="checkbox" checked={selected.has(p.id)} onChange={()=>toggle(p.id)} aria-label={"Artikel #"+(p.artikelnummer||p.number)+" auswählen"} className="accent-emerald-600"/></td><td className="px-2 py-3"><button type="button" className="flex max-w-sm items-center gap-3 text-left" onClick={()=>setActiveId(p.id)}><Thumbnail pant={p}/><span className="min-w-0"><strong className="block truncate text-sm">{name(p)}</strong><small className="mt-1 block truncate text-xs text-stone-500">{p.result?.detected.brand||"Marke offen"} · {p.result?.detected.size||"Größe offen"}</small></span></button></td><td className="p-3 text-stone-600 dark:text-stone-300">#{p.artikelnummer||p.number}</td><td className="p-3 font-bold">{price(p)?money(price(p)):"–"}</td><td className="p-3"><span className={"whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold "+PILL[status(p)]}>{LABEL[status(p)]}</span></td><td className="p-3">{draftsByPant.has(p.id)?<span className="flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5"/> Vorbereitet</span>:<span className="text-stone-400">–</span>}</td><td className="p-3"><button type="button" onClick={()=>setActiveId(p.id)} className={btn}>Ansehen <ChevronRight className="h-3 w-3"/></button></td></tr>)}</tbody></table></div>}
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 px-4 py-4 text-xs text-stone-500 dark:border-stone-800 sm:px-6"><button type="button" onClick={toggleAll} className="font-bold text-emerald-700">{filtered.length>0&&filtered.every(p=>selected.has(p.id))?"Auswahl aufheben":"Sichtbare auswählen"}</button><span>{filtered.length} angezeigt · {selected.size} ausgewählt</span></footer>
          </section>
          <p className="text-xs leading-relaxed text-stone-500">Diese Listings stammen aus deinem Sascha-AI-Bestand. Online-Status wird manuell gepflegt; die Seite behauptet keinen Live-Zugriff auf Vinted-Statistiken. Ein Vinted-Entwurf ist keine Veröffentlichung.</p>
        </main>
      </div>
    </div>
    {active&&<div className="fixed inset-0 z-50 flex justify-end"><button type="button" className="absolute inset-0 bg-stone-950/50" aria-label="Schließen" onClick={()=>setActiveId(null)}/><section role="dialog" aria-modal="true" aria-label={"Artikel #"+(active.artikelnummer||active.number)} className="relative flex h-full w-full max-w-[520px] flex-col overflow-y-auto border-l border-stone-200 bg-white p-5 shadow-2xl dark:border-stone-800 dark:bg-stone-900 sm:p-7">
      <div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">ARTIKELDETAILS</p><h2 className="mt-1 text-xl font-black">#{active.artikelnummer||active.number} bearbeiten</h2></div><button type="button" onClick={()=>setActiveId(null)} aria-label="Schließen" className={btn}><X className="h-4 w-4"/></button></div>
      <div className="mt-5 flex items-start gap-4"><div className="w-28"><Thumbnail pant={active} large/></div><div className="space-y-2"><span className={"inline-flex rounded-full px-2 py-1 text-xs font-bold "+PILL[status(active)]}>{LABEL[status(active)]}</span><p className="text-xs text-stone-500">{active.images.length} Fotos · {active.result?.detected.brand||"Marke offen"} · {active.result?.detected.size||"Größe offen"}</p></div></div>
      <div className="mt-6 space-y-4">
        <label className="block space-y-1"><span className="text-xs font-bold">Titel</span><input className={field} maxLength={100} disabled={!active.result} value={editTitle} onChange={e=>setEditTitle(e.target.value)}/></label>
        <label className="block space-y-1"><span className="text-xs font-bold">Beschreibung</span><textarea className={field} disabled={!active.result} rows={7} value={editDescription} onChange={e=>setEditDescription(e.target.value)}/></label>
        <div className="grid grid-cols-2 gap-3"><label className="space-y-1"><span className="text-xs font-bold">Preis (€)</span><input className={field} disabled={!active.result} inputMode="decimal" value={editPrice} onChange={e=>setEditPrice(e.target.value)}/></label><label className="space-y-1"><span className="text-xs font-bold">Status</span><select className={field} value={status(active)} onChange={e=>{const next=e.target.value as SaleStatus;if(next==="sold")onEditSold(active);else onSaleStatusChange(active,next);}}>{FILTERS.filter(f=>f.id!=="all").map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></label></div>
        <label className="block space-y-1"><span className="text-xs font-bold">Interne Notizen</span><textarea className={field} rows={2} value={editNotes} onChange={e=>setEditNotes(e.target.value)}/></label>
        {!active.result&&<p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Bitte erst die Anzeige im KI-Studio generieren. Dann sind Titel, Beschreibung und Preis bearbeitbar.</p>}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2"><button type="button" disabled={busy||!active.result} className={primary} onClick={()=>void save()}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Check className="h-4 w-4"/>} Speichern</button><button type="button" className={btn+" disabled:opacity-40"} disabled={!isPantEligibleForVintedDraft(active)} onClick={()=>onPrepareDraft(active)}><Sparkles className="h-4 w-4"/> Vinted-Entwurf</button><button type="button" disabled={!active.result} className={btn} onClick={()=>void copy(editTitle)}><Copy className="h-4 w-4"/> Titel kopieren</button><button type="button" disabled={!active.result} className={btn} onClick={()=>void copy(editDescription)}><Copy className="h-4 w-4"/> Text kopieren</button></div>
      <div className="mt-5 flex justify-between border-t border-stone-200 pt-5 dark:border-stone-700"><button type="button" className="flex items-center gap-1 text-xs font-bold text-rose-600" onClick={()=>{onDelete(active.id);setActiveId(null);}}><Trash2 className="h-4 w-4"/> Löschen</button><button type="button" className="flex items-center gap-1 text-xs font-bold text-stone-600" onClick={()=>go("/")}><Pencil className="h-4 w-4"/> KI-Studio <ChevronRight className="h-4 w-4"/></button></div>
    </section></div>}
  </div>;
};