import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Inbox, Loader2, MessageCircle, Plus, RefreshCw, Search, Send, UserRound, X } from 'lucide-react';
import { Auth } from './Auth';
import { supabase } from '../lib/supabase';

type Account = { id: string; user_id: string; display_name: string; vinted_username: string | null; connection_status: string };
type Thread = { id: string; account_id: string; user_id: string; participant_name: string; item_title: string | null; source_url: string | null; last_message_at: string | null; is_unread: boolean };
type Message = { id: string; thread_id: string; user_id: string; account_id: string; direction: 'incoming' | 'outgoing' | 'system'; message_text: string; sent_at: string };
const timestamp = (value: string) => new Date(value).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
const verifiedVintedUrl = (url: string | null) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    return ['vinted.de','www.vinted.de'].includes(parsed.hostname) ? parsed.toString() : null;
  } catch { return null; }
};

export const InboxWorkspace: React.FC = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [accountFilter, setAccountFilter] = useState('all');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddThread, setShowAddThread] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newParticipant, setNewParticipant] = useState('');
  const [newItem, setNewItem] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newThreadAccount, setNewThreadAccount] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newDirection, setNewDirection] = useState<'incoming' | 'outgoing'>('incoming');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (live) { setUserId(data.session?.user.id ?? null); setAuthLoading(false); }
    }).catch(() => { if (live) setAuthLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (live) { setUserId(session?.user.id ?? null); setAuthLoading(false); }
    });
    return () => { live = false; subscription.unsubscribe(); };
  }, []);

  const refresh = useCallback(async (quiet = false) => {
    if (!userId) return;
    if (!quiet) setLoading(true);
    try {
      const [a,t] = await Promise.all([
        supabase.from('inbox_accounts').select('id,user_id,display_name,vinted_username,connection_status')
          .eq('user_id',userId).order('created_at',{ascending:true}),
        supabase.from('inbox_threads').select('id,account_id,user_id,participant_name,item_title,source_url,last_message_at,is_unread')
          .eq('user_id',userId).order('last_message_at',{ascending:false,nullsFirst:false})
      ]);
      if (a.error) throw a.error;
      if (t.error) throw t.error;
      setAccounts((a.data || []) as Account[]);
      setThreads((t.data || []) as Thread[]);
      if (!quiet) setError(null);
    } catch (e) {
      if (!quiet) setError(e instanceof Error ? e.message : 'Nachrichten konnten nicht geladen werden.');
    } finally { if (!quiet) setLoading(false); }
  }, [userId]);

  useEffect(() => { if (userId) void refresh(); }, [userId, refresh]);
  useEffect(() => {
    if (!userId) return;
    const id = window.setInterval(() => { void refresh(true); }, 15000);
    return () => window.clearInterval(id);
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId || !activeId) { setMessages([]); return; }
    let live = true;
    void supabase.from('inbox_messages')
      .select('id,thread_id,user_id,account_id,direction,message_text,sent_at')
      .eq('user_id',userId).eq('thread_id',activeId).order('sent_at',{ascending:true}).limit(500)
      .then(({data,error:fetchError}) => {
        if (!live) return;
        if (fetchError) setError(fetchError.message);
        else setMessages((data || []) as Message[]);
      });
    return () => { live = false; };
  }, [userId,activeId]);

  const active = threads.find(t => t.id === activeId);
  const getAccount = (id: string) => accounts.find(a => a.id === id);
  const visible = useMemo(() => threads.filter(t =>
    (accountFilter === 'all' || t.account_id === accountFilter) &&
    [t.participant_name,t.item_title,getAccount(t.account_id)?.display_name]
      .join(' ').toLocaleLowerCase('de-DE').includes(search.toLocaleLowerCase('de-DE').trim())
  ), [threads,accounts,accountFilter,search]);

  const submitAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || saving || !newName.trim()) return;
    setSaving(true); setError(null);
    const {error:err} = await supabase.from('inbox_accounts').insert({
      user_id:userId,display_name:newName.trim(),vinted_username:newUsername.trim()||null
    });
    if (err) setError(err.message);
    else { setShowAddAccount(false); setNewName(''); setNewUsername(''); setNotice('Konto angelegt. Noch nicht mit Vinted verbunden.'); await refresh(); }
    setSaving(false);
  };

  const submitThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || saving || !newThreadAccount || !newParticipant.trim()) return;
    if (newUrl.trim() && !verifiedVintedUrl(newUrl.trim())) {
      setError('Bitte nur einen gültigen https://vinted.de/-Chatlink eintragen.'); return;
    }
    setSaving(true); setError(null);
    const {data,error:err} = await supabase.from('inbox_threads')
      .insert({user_id:userId,account_id:newThreadAccount,participant_name:newParticipant.trim(),
        item_title:newItem.trim()||null,source_url:newUrl.trim()||null})
      .select('id').single();
    if (err) setError(err.message);
    else { setShowAddThread(false); setNewParticipant(''); setNewItem(''); setNewUrl(''); setActiveId(data.id); setNotice('Chat angelegt. Es wurden noch keine Nachrichten importiert.'); await refresh(); }
    setSaving(false);
  };

  const addMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !active || saving || !newMessage.trim()) return;
    setSaving(true); setError(null);
    const now = new Date().toISOString();
    const {error:err} = await supabase.from('inbox_messages').insert({
      user_id:userId,account_id:active.account_id,thread_id:active.id,
      direction:newDirection,message_text:newMessage.trim(),sent_at:now
    });
    if (err) setError(err.message);
    else {
      await supabase.from('inbox_threads').update({
        last_message_at:now,is_unread:newDirection==='incoming'
      }).eq('id',active.id).eq('user_id',userId);
      setNewMessage('');
      const {data} = await supabase.from('inbox_messages')
        .select('id,thread_id,user_id,account_id,direction,message_text,sent_at')
        .eq('user_id',userId).eq('thread_id',active.id).order('sent_at',{ascending:true}).limit(500);
      setMessages((data || []) as Message[]);
      await refresh(true);
      setNotice('Nachricht lokal gespeichert – nicht an Vinted gesendet.');
    }
    setSaving(false);
  };

  const markRead = async () => {
    if (!userId || !active || !active.is_unread) return;
    const {error:err} = await supabase.from('inbox_threads').update({is_unread:false})
      .eq('id',active.id).eq('user_id',userId);
    if (err) setError(err.message); else await refresh(true);
  };

  if (authLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin"/></div>;
  if (!userId) return <Auth onSuccess={() => { void supabase.auth.getSession().then(({data}) => setUserId(data.session?.user.id || null)); }}/>;

  return <div className="min-h-screen bg-stone-50 p-3 text-stone-900 dark:bg-stone-950 dark:text-white sm:p-6">
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <a href="/listings" className="mb-2 flex items-center gap-2 text-sm text-stone-500"><ArrowLeft className="h-4 w-4"/> Zurück zu Listings</a>
          <h1 className="flex items-center gap-2 text-2xl font-black"><Inbox className="h-7 w-7 text-emerald-600"/> Nachrichten</h1>
          <p className="mt-1 text-xs text-stone-500">Alle Konten an einem Ort · Daten derzeit manuell gepflegt, keine Live-Synchronisierung</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void refresh()} className="flex items-center gap-1 rounded-xl border px-3 py-2 text-sm dark:border-stone-700" disabled={loading}><RefreshCw className="h-4 w-4"/> Aktualisieren</button>
          <button type="button" onClick={() => setShowAddAccount(true)} className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white"><Plus className="h-4 w-4"/> Konto</button>
        </div>
      </header>
      {error && <div role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {notice && <div role="status" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{notice}</div>}
      <div className="grid min-h-[550px] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900 md:grid-cols-[330px_minmax(0,1fr)]">
        <aside className={(activeId ? 'hidden md:block ' : 'block ') + 'border-r border-stone-200 dark:border-stone-800'}>
          <div className="border-b border-stone-100 p-3 dark:border-stone-800">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              <button type="button" onClick={() => setAccountFilter('all')}
                className={'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ' +
                  (accountFilter==='all'?'bg-emerald-600 text-white':'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200')}>
                Alle ({threads.length})
              </button>
              {accounts.map(a => <button type="button" key={a.id} onClick={() => setAccountFilter(a.id)}
                className={'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ' +
                  (accountFilter===a.id?'bg-emerald-600 text-white':'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200')}>
                {a.display_name} ({threads.filter(t=>t.account_id===a.id).length})
              </button>)}
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-stone-200 px-3 dark:border-stone-700">
              <Search className="h-4 w-4 text-stone-400"/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Chats durchsuchen..." className="w-full bg-transparent py-3 text-sm outline-none"/>
            </label>
            <button type="button" onClick={() => { setNewThreadAccount(accountFilter==='all'?(accounts[0]?.id||''):accountFilter); setShowAddThread(true); }}
              disabled={accounts.length===0} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 py-2 text-sm font-bold disabled:opacity-40 dark:border-stone-700">
              <Plus className="h-4 w-4"/> Chat hinzufügen
            </button>
          </div>
          <div className="max-h-[65vh] overflow-y-auto md:max-h-[690px]">
            {loading && threads.length===0 ? <p className="p-5 text-sm text-stone-500">Lade Chats...</p> :
             visible.length===0 ? <p className="p-5 text-sm text-stone-500">{accounts.length===0?'Lege zuerst ein Konto an.':'Noch keine importierten Chats für diesen Filter.'}</p> :
             visible.map(t => <button type="button" key={t.id} onClick={() => { setActiveId(t.id); setNotice(null); }}
               className={'flex w-full items-center gap-3 border-b border-stone-100 px-4 py-4 text-left hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800 '+(activeId===t.id?'bg-emerald-50 dark:bg-emerald-950/20':'')}>
                 <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-200 dark:bg-stone-800"><UserRound className="h-5 w-5"/></span>
                 <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate text-sm">{t.participant_name}</strong>{t.is_unread&&<span className="h-2 w-2 shrink-0 rounded-full bg-emerald-600"/>}</span>
                   <span className="block truncate text-xs text-stone-500">{getAccount(t.account_id)?.display_name||'Konto'} · {t.item_title||'Unterhaltung'}</span>
                   {t.last_message_at && <span className="mt-1 block text-[10px] text-stone-400">{timestamp(t.last_message_at)}</span>}
                 </span><ChevronRight className="h-4 w-4 text-stone-400"/>
               </button>)}
          </div>
        </aside>
        <section className={(!activeId?'hidden md:flex ':'flex ')+'min-h-[530px] flex-col'}>
          {!active ? <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-stone-500">
            <MessageCircle className="h-12 w-12 text-stone-300"/><strong>Wähle einen Chat</strong>
            <p className="max-w-xs text-sm">Nachrichten erscheinen hier, sobald sie rechtmäßig importiert oder über eine autorisierte Schnittstelle synchronisiert wurden.</p>
          </div> : <>
            <div className="flex items-center gap-3 border-b border-stone-100 px-4 py-3 dark:border-stone-800">
              <button type="button" className="rounded-lg p-2 md:hidden" aria-label="Zur Chatliste" onClick={()=>setActiveId(null)}><ArrowLeft className="h-5 w-5"/></button>
              <div className="min-w-0 flex-1"><h2 className="truncate font-bold">{active.participant_name}</h2>
                <p className="truncate text-xs text-stone-500">{getAccount(active.account_id)?.display_name} · {active.item_title||'Unterhaltung'}</p>
              </div>
              {active.is_unread && <button type="button" onClick={()=>void markRead()} className="rounded-lg border px-2 py-1.5 text-xs dark:border-stone-700">Als gelesen</button>}
              {verifiedVintedUrl(active.source_url) && <a href={verifiedVintedUrl(active.source_url)!} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-2 py-1.5 text-xs dark:border-stone-700">In Vinted öffnen ↗</a>}
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-stone-50 p-4 dark:bg-stone-950/60">
              {messages.length===0 && <p className="mx-auto max-w-xs py-12 text-center text-sm text-stone-500">Für diesen Chat wurden noch keine Nachrichten importiert.</p>}
              {messages.map(m => <div key={m.id} className={'flex '+(m.direction==='outgoing'?'justify-end':'justify-start')}>
                <div className={'max-w-[85%] rounded-2xl px-4 py-3 text-sm '+(m.direction==='outgoing'?'bg-emerald-600 text-white':'border bg-white dark:border-stone-700 dark:bg-stone-800')}>
                  <p className="whitespace-pre-wrap break-words">{m.message_text}</p>
                  <p className={'mt-2 text-[10px] '+(m.direction==='outgoing'?'text-emerald-100':'text-stone-500')}>{timestamp(m.sent_at)}</p>
                </div>
              </div>)}
            </div>
            <form onSubmit={e=>void addMessage(e)} className="border-t border-stone-100 p-3 dark:border-stone-800">
              <p className="mb-2 text-xs font-semibold text-amber-700 dark:text-amber-400">Manueller Gesprächsimport – hier wird nichts an Vinted gesendet.</p>
              <div className="mb-2 flex gap-2">
                <label className="text-xs"><input type="radio" name="direction" checked={newDirection==='incoming'} onChange={()=>setNewDirection('incoming')}/> Empfangene Nachricht</label>
                <label className="text-xs"><input type="radio" name="direction" checked={newDirection==='outgoing'} onChange={()=>setNewDirection('outgoing')}/> Eigene Nachricht</label>
              </div>
              <div className="flex gap-2">
                <textarea value={newMessage} onChange={e=>setNewMessage(e.target.value)} rows={2} maxLength={10000} placeholder="Nachricht aus Vinted einfügen..."
                  className="min-w-0 flex-1 resize-none rounded-xl border border-stone-200 bg-transparent p-3 text-sm outline-none dark:border-stone-700"/>
                <button type="submit" disabled={saving||!newMessage.trim()} className="rounded-xl bg-emerald-600 px-3 text-white disabled:opacity-50" aria-label="Nachricht importieren">
                  {saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>}
                </button>
              </div>
            </form>
          </>}
        </section>
      </div>
    </div>
    {(showAddAccount||showAddThread)&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 text-stone-900 dark:bg-stone-900 dark:text-white">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-black">{showAddAccount?'Vinted-Konto hinzufügen':'Chat hinzufügen'}</h2>
          <button type="button" onClick={()=>{setShowAddAccount(false);setShowAddThread(false);}} aria-label="Schließen"><X className="h-5 w-5"/></button>
        </div>
        {showAddAccount?<form onSubmit={e=>void submitAccount(e)} className="space-y-3">
          <p className="text-xs text-stone-500">Nur eine Kontobezeichnung speichern. Keine Passwörter oder Cookies eingeben.</p>
          <label className="block text-sm">Anzeigename<input required maxLength={80} value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Mein Vinted-Konto" className="mt-1 w-full rounded-xl border p-3 dark:border-stone-700 dark:bg-stone-950"/></label>
          <label className="block text-sm">Benutzername (optional)<input maxLength={80} value={newUsername} onChange={e=>setNewUsername(e.target.value)} placeholder="vinted_username" className="mt-1 w-full rounded-xl border p-3 dark:border-stone-700 dark:bg-stone-950"/></label>
          <button disabled={saving||!newName.trim()} className="w-full rounded-xl bg-emerald-600 p-3 font-bold text-white disabled:opacity-50">Konto anlegen</button>
        </form>:<form onSubmit={e=>void submitThread(e)} className="space-y-3">
          <label className="block text-sm">Konto<select required value={newThreadAccount} onChange={e=>setNewThreadAccount(e.target.value)} className="mt-1 w-full rounded-xl border p-3 dark:border-stone-700 dark:bg-stone-950">
            {accounts.map(a=><option value={a.id} key={a.id}>{a.display_name}</option>)}</select></label>
          <label className="block text-sm">Chatpartner<input required maxLength={120} value={newParticipant} onChange={e=>setNewParticipant(e.target.value)} placeholder="Benutzername" className="mt-1 w-full rounded-xl border p-3 dark:border-stone-700 dark:bg-stone-950"/></label>
          <label className="block text-sm">Artikel (optional)<input value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder="z. B. Diesel Jeans" className="mt-1 w-full rounded-xl border p-3 dark:border-stone-700 dark:bg-stone-950"/></label>
          <label className="block text-sm">Vinted-Chat-Link (optional)<input value={newUrl} onChange={e=>setNewUrl(e.target.value)} placeholder="https://www.vinted.de/..." className="mt-1 w-full rounded-xl border p-3 dark:border-stone-700 dark:bg-stone-950"/></label>
          <button disabled={saving||!newParticipant.trim()||!newThreadAccount} className="w-full rounded-xl bg-emerald-600 p-3 font-bold text-white disabled:opacity-50">Chat anlegen</button>
        </form>}
      </div>
    </div>}
  </div>;
};
