import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Cloud, Loader2, Play, RefreshCw, AlertCircle, Clock3, XCircle } from 'lucide-react';
import { Auth } from './Auth';
import { supabase, fetchPantsFromSupabase } from '../lib/supabase';
import type { PantItem } from '../types';

type CloudJob = {
  id: string;
  pant_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  error: string | null;
  created_at: string;
  finished_at: string | null;
};
const formatDate = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
const itemNumber = (pant: PantItem) => String(pant.artikelnummer || pant.number);
const eligible = (pant: PantItem) =>
  Boolean(String(pant.artikelnummer ?? '').trim()) &&
  pant.images.some(img => Boolean(img.storagePath)) &&
  pant.saleStatus !== 'sold' && pant.saleStatus !== 'archived';

export const CloudWorkspace: React.FC = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [items, setItems] = useState<PantItem[]>([]);
  const [jobs, setJobs] = useState<CloudJob[]>([]);
  const [selection, setSelection] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUserId(data.session?.user.id || null);
      setAuthLoading(false);
    }).catch(() => { if (active) setAuthLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) { setUserId(session?.user.id || null); setAuthLoading(false); }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const refresh = useCallback(async (quiet = false) => {
    if (!userId) return;
    if (!quiet) setIsLoading(true);
    try {
      const [pants, result] = await Promise.all([
        quiet ? Promise.resolve(null) : fetchPantsFromSupabase(userId),
        supabase.from('cloud_jobs').select('id,pant_id,status,error,created_at,finished_at')
          .eq('user_id', userId).order('created_at', { ascending: false }).limit(100)
      ]);
      if (result.error) throw result.error;
      if (pants) setItems(pants);
      setJobs((result.data || []) as CloudJob[]);
      if (!quiet) setError(null);
    } catch (e) {
      if (!quiet) setError(e instanceof Error ? e.message : 'Cloud-Daten konnten nicht geladen werden.');
    } finally {
      if (!quiet) setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void refresh();
    const id = window.setInterval(() => { void refresh(true); }, 8000);
    return () => window.clearInterval(id);
  }, [userId, refresh]);

  const available = useMemo(() => items.filter(eligible), [items]);
  const active = useMemo(() =>
    new Set(jobs.filter(job => job.status === 'queued' || job.status === 'running').map(job => job.pant_id)),
    [jobs]);
  const pending = jobs.filter(j => j.status === 'queued').length;
  const running = jobs.filter(j => j.status === 'running').length;
  const completed = jobs.filter(j => j.status === 'completed').length;
  const failed = jobs.filter(j => j.status === 'failed').length;
  const selectable = available.filter(p => !active.has(p.id));
  const chosen = selectable.filter(p => selection.includes(p.id)).slice(0, 100);
  const toggle = (id: string) =>
    setSelection(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);

  const submit = async () => {
    if (!userId || chosen.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitted(0);
    setError(null);
    setNotice(null);
    let accepted = 0, skipped = 0;
    for (const pant of chosen) {
      const { data, error: enqueueError } = await supabase.rpc('enqueue_cloud_analysis_job', {
        p_pant_id: pant.id
      });
      if (enqueueError) {
        setError('Cloud-Warteschlange: ' + enqueueError.message);
        break;
      }
      if (data) accepted++; else skipped++;
      setSubmitted(accepted + skipped);
    }
    setSelection([]);
    setNotice(accepted + ' Aufträge eingeplant' + (skipped ? ', ' + skipped + ' schon in Bearbeitung.' : '.'));
    setIsSubmitting(false);
    await refresh();
  };

  if (authLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" aria-label="Anmeldung wird geprüft"/></div>;
  if (!userId) return <Auth onSuccess={() => { void supabase.auth.getSession().then(({data}) => setUserId(data.session?.user.id || null)); }} />;

  return <div className="min-h-screen bg-stone-50 px-4 py-7 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
    <main className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <a href="/listings" className="inline-flex items-center gap-2 text-sm font-semibold text-stone-600 dark:text-stone-300"><ArrowLeft className="h-4 w-4"/> Listings</a>
        <button type="button" onClick={() => void refresh()} disabled={isLoading || isSubmitting} className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold dark:border-stone-700 dark:bg-stone-900"><RefreshCw className="h-4 w-4"/> Aktualisieren</button>
      </div>
      <div className="rounded-2xl bg-stone-900 p-6 text-white">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-300"><Cloud className="h-5 w-5"/> Sascha AI Cloud</div>
        <h1 className="text-3xl font-black">Cloud-Aufträge</h1>
        <p className="mt-2 text-sm text-stone-300">Starte KI-Analysen vom Handy. Ein separat eingerichteter Cloud-Worker übernimmt sie auch bei geschlossenem Browser. Hier werden keine Vinted-Artikel veröffentlicht.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Wartend',pending,'text-amber-600'],['In Arbeit',running,'text-sky-600'],
          ['Fertig',completed,'text-emerald-600'],['Fehler',failed,'text-rose-600']
        ].map(([title,value,color]) => <div key={title} className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
          <div className="text-xs text-stone-500">{title}</div><div className={'mt-1 text-2xl font-black '+color}>{value}</div>
        </div>)}
      </div>
      {error && <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="h-5 w-5 shrink-0"/>{error}</div>}
      {notice && <div role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</div>}
      <section className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-black">Artikel analysieren</h2>
            <p className="mt-1 text-xs text-stone-500">Nur Artikel mit Nummer und synchronisierten Fotos. Bis zu 100 Aufträge pro 24 Stunden.</p>
          </div>
          <button type="button" className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-bold dark:border-stone-700" onClick={() => setSelection(selectable.slice(0, 100).map(p => p.id))}>Bis zu 100 auswählen</button>
        </div>
        <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
          {isLoading && items.length === 0 ? <p className="p-3 text-sm text-stone-500">Lade Artikel...</p>
            : available.length === 0 ? <p className="p-3 text-sm text-stone-500">Keine passenden Artikel. Bitte Fotos erst in Sascha AI synchronisieren.</p>
            : available.map(pant => <label key={pant.id} className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-stone-50 dark:hover:bg-stone-800">
                <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={selection.includes(pant.id)} disabled={active.has(pant.id) || isSubmitting} onChange={() => toggle(pant.id)}/>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">#{itemNumber(pant)} · {pant.result?.title || 'Noch nicht analysiert'}</span>
                <span className="shrink-0 text-[11px] text-stone-500">{active.has(pant.id) ? 'In Queue' : pant.result ? 'Erneut' : 'Neu'}</span>
              </label>)}
        </div>
        <button type="button" onClick={() => void submit()} disabled={isSubmitting || chosen.length === 0}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white disabled:opacity-40">
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Play className="h-4 w-4"/>}
          {isSubmitting ? 'Eingeplant: ' + submitted + '/' + chosen.length : chosen.length + ' ausgewählte Artikel starten'}
        </button>
      </section>
      <section className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <h2 className="mb-3 text-lg font-black">Letzte Aufträge</h2>
        {jobs.length === 0 ? <p className="text-sm text-stone-500">Noch keine Cloud-Aufträge.</p> : <div className="space-y-2">
          {jobs.map(job => <div key={job.id} className="flex items-start gap-3 rounded-xl border border-stone-100 p-3 dark:border-stone-800">
            {job.status === 'completed' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600"/> :
              job.status === 'failed' ? <XCircle className="h-5 w-5 shrink-0 text-rose-600"/> :
              job.status === 'running' ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-sky-600"/> :
              <Clock3 className="h-5 w-5 shrink-0 text-amber-600"/>}
            <div className="min-w-0 flex-1"><div className="text-sm font-semibold">Artikel #{itemNumber(items.find(p => p.id === job.pant_id) || ({number: 0,artikelnummer: job.pant_id} as PantItem))} · {({queued:'Wartend',running:'In Arbeit',completed:'Fertig',failed:'Fehler'})[job.status]}</div>
              <p className="mt-1 text-xs text-stone-500">{formatDate(job.created_at)}</p>
              {job.error && <p className="mt-1 break-words text-xs text-rose-600">{job.error}</p>}</div>
          </div>)}
        </div>}
      </section>
    </main>
  </div>;
};
