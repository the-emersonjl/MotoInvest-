
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from './services/supabaseClient';
import { FinancialMentorService } from './services/geminiService';
import { Role, Message, Bill, User, Expense, Profile } from './types';
import { 
  SendIcon, WalletIcon, GraphIcon, BotIcon, 
  TrashIcon, CalendarIcon, ChevronLeftIcon, ChevronRightIcon,
  LogoutIcon, SupportIcon, BellIcon, CameraIcon, MicrophoneIcon,
  AppLogo, WhatsAppIcon
} from './components/Icons';
import MarkdownRenderer from './components/MarkdownRenderer';

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DEV_WHATSAPP = "5511962952615"; 
// COLOQUE SEU LINK DE PAGAMENTO DO MERCADO PAGO AQUI
const MERCADO_PAGO_LINK = "https://www.mercadopago.com.br"; 

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result?.toString().split(',')[1] || '');
    reader.onerror = error => reject(error);
  });
};

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState<{ isAuthorized: boolean; expiresAt: string | null }>({ isAuthorized: false, expiresAt: null });
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [activeTab, setActiveTab] = useState<'chat' | 'ledger' | 'stats' | 'calendar' | 'help'>('chat');
  
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isDataSyncing, setIsDataSyncing] = useState(false);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [dailyEarnings, setDailyEarnings] = useState<any[]>([]);
  const [dailyExpenses, setDailyExpenses] = useState<Expense[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [viewDate, setViewDate] = useState(new Date());
  
  const [inputText, setInputText] = useState('');
  const [tempEarning, setTempEarning] = useState('');
  const [tempExpense, setTempExpense] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<{data: string, mimeType: string}[]>([]);

  const mentorService = useRef<FinancialMentorService | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (activeTab === 'chat') setTimeout(scrollToBottom, 200);
  }, [messages, activeTab, scrollToBottom]);

  const checkAuthorization = async (userEmail: string) => {
    try {
      const { data, error } = await supabase
        .from('authorized_users')
        .select('email, expires_at')
        .eq('email', userEmail.toLowerCase())
        .single();
      
      if (error || !data) {
        setAuthStatus({ isAuthorized: false, expiresAt: null });
        return;
      }

      const expirationDate = new Date(data.expires_at);
      const isExpired = expirationDate < new Date();

      setAuthStatus({ 
        isAuthorized: !isExpired, 
        expiresAt: data.expires_at 
      });
    } catch (e) {
      setAuthStatus({ isAuthorized: false, expiresAt: null });
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        const userEmail = session.user.email!;
        setCurrentUser({ 
          email: userEmail, 
          name: session.user.user_metadata?.name || 'Comandante' 
        });
        checkAuthorization(userEmail);
      }
      setTimeout(() => setIsInitialLoading(false), 1000);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        setCurrentUser({ 
          email: session.user.email!, 
          name: session.user.user_metadata?.name || 'Comandante' 
        });
        checkAuthorization(session.user.email!);
      } else { 
        setCurrentUser(null); 
        setAuthStatus({ isAuthorized: false, expiresAt: null });
        setMessages([]); 
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadAllData = async () => {
    if (!session?.user || !authStatus.isAuthorized) return;
    setIsDataSyncing(true);
    try {
      const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', session.user.id).single();
      if (profile) setUserProfile(profile);

      const [msgsRes, earnsRes, expsRes, blsRes] = await Promise.all([
        supabase.from('chat_messages').select('*').eq('user_id', session.user.id).order('timestamp', { ascending: true }),
        supabase.from('earnings').select('*').eq('user_id', session.user.id).order('date', { ascending: false }),
        supabase.from('expenses').select('*').eq('user_id', session.user.id).order('date', { ascending: false }),
        supabase.from('bills').select('*').eq('user_id', session.user.id).order('dueDate', { ascending: true })
      ]);
      
      if (msgsRes.data && msgsRes.data.length > 0) {
        setMessages(msgsRes.data.map(m => ({ role: m.role, text: m.text, timestamp: m.timestamp })));
      } else {
        setMessages([{ 
          role: Role.MODEL, 
          text: `Salve, **${currentUser?.name || 'Comandante'}**! 🏍️\nSou seu mentor IA. Assinatura confirmada! Como tá o corre hoje?`, 
          timestamp: new Date().toISOString() 
        }]);
      }
      
      if (earnsRes.data) setDailyEarnings(earnsRes.data);
      if (expsRes.data) setDailyExpenses(earnsRes.data);
      if (blsRes.data) setBills(blsRes.data);
    } catch (err) {
      console.error("Sync error:", err);
    } finally {
      setIsDataSyncing(false);
    }
  };

  useEffect(() => {
    if (session?.user && authStatus.isAuthorized) {
      loadAllData();
      mentorService.current = new FinancialMentorService();
    }
  }, [session, currentUser, authStatus.isAuthorized]);

  const totals = useMemo(() => {
    const month = viewDate.getMonth();
    const year = viewDate.getFullYear();
    
    const earnings = dailyEarnings.filter(e => {
      const d = new Date(e.date + 'T12:00:00Z');
      return d.getUTCMonth() === month && d.getUTCFullYear() === year;
    });
    
    const expenses = dailyExpenses.filter(e => {
      const d = new Date(e.date + 'T12:00:00Z');
      return d.getUTCMonth() === month && d.getUTCFullYear() === year;
    });
    
    const currentBills = bills.filter(b => {
      const [bYear, bMonth] = b.dueDate.split('-').map(Number);
      return (bMonth - 1) === month && bYear === year;
    }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const totalEarned = earnings.reduce((acc, curr) => acc + Number(curr.value), 0);
    const totalSpent = expenses.reduce((acc, curr) => acc + Number(curr.value), 0);
    const unpaidBillsTotal = currentBills.filter(b => !b.isPaid).reduce((acc, curr) => acc + curr.amount, 0);

    return { totalEarned, totalSpent, netProfit: totalEarned - totalSpent, currentBills, unpaidBillsTotal };
  }, [dailyEarnings, dailyExpenses, bills, viewDate]);

  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  }, [viewDate]);

  const navigateMonth = (step: number) => {
    const d = new Date(viewDate);
    d.setMonth(d.getMonth() + step);
    setViewDate(d);
  };

  const updateMotoProfile = async (updates: Partial<Profile>) => {
    if (!session?.user || !userProfile) return;
    const newProfile = { ...userProfile, ...updates } as Profile;
    setUserProfile(newProfile);
    await supabase.from('profiles').update(updates).eq('user_id', session.user.id);
  };

  const toggleBillPaid = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase.from('bills').update({ isPaid: !currentStatus }).eq('id', id);
    if (!error) setBills(prev => prev.map(b => b.id === id ? { ...b, isPaid: !currentStatus } : b));
  };

  const processAIPrompt = async (prompt: string) => {
    if (!mentorService.current || isAILoading || (!prompt.trim() && pendingMedia.length === 0)) return;
    const displayMsg = prompt.trim() || (pendingMedia.length > 0 ? "[Mídia enviada]" : "");
    const userMsg = { role: Role.USER, text: displayMsg, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setIsAILoading(true);
    setInputText('');
    const mediaToSend = [...pendingMedia];
    setPendingMedia([]);
    if (session?.user) await supabase.from('chat_messages').insert([{ user_id: session.user.id, ...userMsg }]);
    try {
      const response = await mentorService.current.sendMessage(displayMsg, mediaToSend, async (name, args) => {
        if (name === 'get_financial_summary') {
          return {
            hoje: new Date().toLocaleDateString('pt-BR'),
            lucro_liquido: totals.netProfit,
            assinatura_vence: authStatus.expiresAt ? new Date(authStatus.expiresAt).toLocaleDateString('pt-BR') : 'N/A',
            sonho: userProfile?.goal_name || "Reserva",
            valor_meta: userProfile?.financial_goal,
            progresso: ((totals.netProfit / (userProfile?.financial_goal || 1)) * 100).toFixed(1) + '%'
          };
        }
        if (name === 'add_bill' && session?.user) {
          const { data } = await supabase.from('bills').insert([{ user_id: session.user.id, ...args, isPaid: false }]).select();
          if (data) setBills(prev => [...prev, data[0]]);
          return { status: 'success' };
        }
      });
      const modelMsg = { role: Role.MODEL, text: response.text, timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, modelMsg]);
      if (session?.user) await supabase.from('chat_messages').insert([{ user_id: session.user.id, ...modelMsg }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: Role.MODEL, text: "Visão, deu erro no sistema. Tenta de novo!", timestamp: new Date().toISOString() }]);
    } finally {
      setIsAILoading(false);
    }
  };

  const handleAuth = async () => {
    setIsAuthLoading(true); setGlobalError(null);
    try {
      if (authMode === 'register') {
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
        if (error) throw error;
        setAuthMode('login');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) { setGlobalError(err.message); }
    finally { setIsAuthLoading(false); }
  };

  if (session?.user && authStatus.isAuthorized === false) {
    return (
      <div className="flex flex-col h-screen items-center justify-center p-8 bg-animate text-white text-center">
        <div className="max-w-md w-full space-y-10 animate-in zoom-in duration-500">
          <AppLogo className="w-28 h-28 mx-auto mb-4" />
          <div className="space-y-4">
            <h1 className="text-4xl font-black italic tracking-tighter uppercase leading-tight">ACESSO RESTRITO</h1>
            <p className="text-slate-400 text-sm leading-relaxed px-4">
              Fala, Comandante! O e-mail <span className="text-emerald-400 font-bold">{session.user.email}</span> ainda não está liberado para usar o MotoInvest.
            </p>
          </div>
          
          <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 p-8 rounded-[40px] space-y-4 shadow-2xl">
            {/* BOTÃO MERCADO PAGO */}
            <a 
              href={MERCADO_PAGO_LINK} 
              target="_blank" 
              className="w-full bg-[#009EE3] py-6 rounded-3xl font-black text-xs uppercase text-white shadow-[0_10px_30px_rgba(0,158,227,0.3)] flex items-center justify-center gap-4 active-scale transition-all"
            >
              ADQUIRIR ACESSO AGORA 💳
            </a>

            <div className="flex items-center gap-4 py-2">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-[10px] font-black text-slate-500 uppercase">OU</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            {/* BOTÃO SUPORTE WHATSAPP */}
            <a 
              href={`https://wa.me/${DEV_WHATSAPP}?text=Salve!%20Fiz%20o%20pagamento%20e%20quero%20liberar%20meu%20acesso.%20Email:%20${session.user.email}`} 
              target="_blank" 
              className="w-full bg-white/5 border border-white/10 py-5 rounded-3xl font-black text-xs uppercase text-slate-300 flex items-center justify-center gap-4 active-scale transition-all"
            >
              <WhatsAppIcon className="w-5 h-5" /> JÁ PAGUEI / SUPORTE
            </a>
          </div>

          <button onClick={() => supabase.auth.signOut()} className="text-[10px] font-black uppercase text-slate-500 tracking-widest underline decoration-2 underline-offset-4">Sair da conta</button>
        </div>
      </div>
    );
  }

  if (isInitialLoading) {
    return (
      <div className="h-screen bg-[#020617] flex flex-col items-center justify-center p-6 bg-animate text-white">
        <AppLogo className="w-24 h-24 relative animate-bounce" />
        <h1 className="text-3xl font-black italic uppercase tracking-tighter mt-8">MotoInvest</h1>
        <div className="mt-4 flex gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0s' }} /><div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0.1s' }} /><div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0.2s' }} /></div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex flex-col h-screen items-center justify-center p-6 bg-animate text-white">
        <div className="w-full max-sm:max-w-xs space-y-8 animate-in zoom-in duration-500">
          <div className="text-center"><AppLogo className="w-24 h-24 mx-auto mb-4" /><h1 className="text-4xl font-black italic tracking-tighter uppercase">MotoInvest</h1><p className="text-emerald-400 font-bold text-[10px] tracking-widest uppercase">Gestão para Motocas</p></div>
          <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 p-8 rounded-[40px] space-y-4">
            <div className="flex bg-white/5 p-1 rounded-2xl"><button onClick={() => setAuthMode('login')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase transition-all ${authMode === 'login' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>Entrar</button><button onClick={() => setAuthMode('register')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase transition-all ${authMode === 'register' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>Criar</button></div>
            {authMode === 'register' && <input type="text" placeholder="Nome" value={name} onChange={e => setName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-sm font-bold outline-none" />}
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-sm font-bold outline-none" />
            <input type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-sm font-bold outline-none" />
            {globalError && <p className="text-rose-500 text-[10px] font-bold text-center">{globalError}</p>}
            <button onClick={handleAuth} disabled={isAuthLoading} className="w-full bg-emerald-600 py-4 rounded-2xl font-black uppercase shadow-xl active-scale">{isAuthLoading ? '...' : 'MARCHAR'}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen text-slate-100 overflow-hidden relative">
      <header className="px-6 py-4 bg-slate-900/60 backdrop-blur-xl border-b border-white/5 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3"><AppLogo className="w-8 h-8" /><div><h1 className="text-xs font-black uppercase italic tracking-tighter">MotoInvest</h1><p className="text-[9px] text-emerald-400 font-bold uppercase truncate max-w-[120px]">{currentUser?.name}</p></div></div>
        <button onClick={() => supabase.auth.signOut()} className="p-2.5 bg-white/5 border border-white/10 rounded-xl active-scale"><LogoutIcon className="w-4 h-4 text-slate-400" /></button>
      </header>
      <main className="flex-1 overflow-hidden relative z-10">
        {activeTab === 'chat' && (
          <div className="flex flex-col h-full animate-in fade-in duration-300">
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 custom-scrollbar">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === Role.USER ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}>
                  <div className={`max-w-[90%] p-4 rounded-2xl shadow-xl ${msg.role === Role.USER ? 'bg-emerald-600 text-white rounded-br-none' : 'bg-slate-900/80 backdrop-blur-md border border-white/5 rounded-bl-none'}`}>{msg.role === Role.MODEL && <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/5"><BotIcon className="w-3 h-3 text-emerald-400" /><span className="text-[9px] font-black uppercase text-emerald-400">Mentor IA</span></div>}<MarkdownRenderer content={msg.text} /></div>
                </div>
              ))}
              {isAILoading && <div className="flex items-center gap-2 text-emerald-500 font-black text-[9px] uppercase animate-pulse ml-4"><BotIcon className="w-3 h-3" /> Mentor analisando...</div>}<div ref={messagesEndRef} className="h-4" />
            </div>
            <div className="p-4 bg-slate-900/80 backdrop-blur-xl border-t border-white/5">
              <div className="flex items-center gap-2 max-w-2xl mx-auto"><button onClick={() => imageInputRef.current?.click()} className="p-3.5 bg-white/5 border border-white/10 rounded-2xl text-slate-400 active-scale"><CameraIcon className="w-6 h-6" /></button><input type="file" accept="image/*" className="hidden" ref={imageInputRef} onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; const base64 = await fileToBase64(file); setPendingMedia(p => [...p, { data: base64, mimeType: file.type }]); }} /><input type="text" value={inputText} onChange={e => setInputText(e.target.value)} onKeyPress={e => e.key === 'Enter' && processAIPrompt(inputText)} placeholder="Mandar visão..." className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-sm outline-none" /><button onClick={() => processAIPrompt(inputText)} disabled={isAILoading} className="bg-emerald-600 p-3.5 rounded-2xl active-scale"><SendIcon className="w-6 h-6 text-white" /></button></div>
            </div>
          </div>
        )}
        {activeTab === 'ledger' && (
          <div className="h-full overflow-y-auto p-8 space-y-8 pb-24 custom-scrollbar">
            <h2 className="text-4xl font-black italic uppercase">Meu Corre</h2>
            <div className="space-y-6">
              <div className="bg-emerald-600/90 p-8 rounded-[40px] border border-white/10"><label className="block text-[10px] font-black text-white/70 uppercase mb-2 tracking-widest">Ganhos Hoje</label><div className="flex items-center gap-3"><span className="text-2xl font-black text-white/50">R$</span><input type="number" placeholder="0,00" value={tempEarning} onChange={e => setTempEarning(e.target.value)} className="w-full bg-transparent text-5xl font-black text-white outline-none" /></div></div>
              <div className="bg-rose-600/90 p-8 rounded-[40px] border border-white/10"><label className="block text-[10px] font-black text-white/70 uppercase mb-2 tracking-widest">Gastos Hoje</label><div className="flex items-center gap-3"><span className="text-2xl font-black text-white/50">R$</span><input type="number" placeholder="0,00" value={tempExpense} onChange={e => setTempExpense(e.target.value)} className="w-full bg-transparent text-5xl font-black text-white outline-none" /></div></div>
              <button onClick={() => { const e = parseFloat(tempEarning) || 0; const x = parseFloat(tempExpense) || 0; if (!e && !x) return; setIsDataSyncing(true); const d = new Date().toLocaleDateString('en-CA'); Promise.all([ e ? supabase.from('earnings').insert([{ user_id: session.user.id, value: e, date: d }]) : Promise.resolve(), x ? supabase.from('expenses').insert([{ user_id: session.user.id, value: x, date: d }]) : Promise.resolve() ]).then(() => { setTempEarning(''); setTempExpense(''); loadAllData(); setActiveTab('chat'); processAIPrompt(`Fechei o dia! Ganhos: R$ ${e} | Gastos: R$ ${x}.`); }); }} className="w-full bg-white text-slate-900 py-6 rounded-3xl font-black uppercase shadow-2xl active-scale">SALVAR</button>
            </div>
          </div>
        )}
        {activeTab === 'calendar' && (
          <div className="h-full p-8 overflow-y-auto custom-scrollbar flex flex-col gap-8 pb-24">
             <div className="flex justify-between items-center"><h2 className="text-4xl font-black italic uppercase tracking-tighter">Agenda</h2><div className="flex items-center gap-4 bg-slate-900/80 px-4 py-2 rounded-2xl border border-white/5"><button onClick={() => navigateMonth(-1)} className="p-1 active-scale text-emerald-500"><ChevronLeftIcon className="w-6 h-6" /></button><div className="flex flex-col items-center min-w-[100px]"><span className="text-[8px] font-black uppercase text-slate-500">{viewDate.getFullYear()}</span><span className="text-xs font-black uppercase text-white">{MONTHS[viewDate.getMonth()]}</span></div><button onClick={() => navigateMonth(1)} className="p-1 active-scale text-emerald-500"><ChevronRightIcon className="w-6 h-6" /></button></div></div>
             <div className="bg-slate-900/50 p-6 rounded-[32px] border border-white/5">
                <div className="grid grid-cols-7 gap-1 mb-4">{WEEKDAYS.map(w => <span key={w} className="text-[8px] font-black uppercase text-slate-600 text-center">{w}</span>)}</div>
                <div className="grid grid-cols-7 gap-1">
                   {calendarDays.map((day, idx) => {
                     const isToday = day && day === new Date().getDate() && viewDate.getMonth() === new Date().getMonth();
                     const hasBill = day && totals.currentBills.some(b => new Date(b.dueDate + 'T12:00:00Z').getUTCDate() === day);
                     return (<div key={idx} className={`aspect-square flex flex-col items-center justify-center rounded-xl text-[10px] font-black relative ${day ? 'bg-white/5' : ''} ${isToday ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>{day}{hasBill && !isToday && <div className="absolute bottom-1 w-1 h-1 bg-emerald-500 rounded-full" />}</div>);
                   })}
                </div>
             </div>
             <div className="bg-emerald-600/10 border border-emerald-500/20 p-6 rounded-[32px]"><p className="text-[10px] font-black uppercase text-emerald-500 mb-1 tracking-widest">Contas Pendentes</p><p className="text-3xl font-black text-white italic">R$ {totals.unpaidBillsTotal.toFixed(2)}</p></div>
             <div className="space-y-4">{totals.currentBills.map(bill => (
               <div key={bill.id} className={`bg-slate-900 border ${bill.isPaid ? 'border-emerald-500/30' : 'border-white/5'} p-6 rounded-[32px] flex justify-between items-center`}><div className="flex gap-4 items-center"><div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${bill.isPaid ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-800 text-slate-500'}`}><CalendarIcon className="w-5 h-5" /></div><div><p className={`font-black uppercase text-xs tracking-tight ${bill.isPaid ? 'line-through text-slate-500' : 'text-white'}`}>{bill.name}</p><p className="text-[10px] font-bold text-slate-500">{new Date(bill.dueDate + 'T12:00:00Z').toLocaleDateString('pt-BR')}</p><p className={`text-base font-black ${bill.isPaid ? 'text-emerald-500/50' : 'text-emerald-500'}`}>R$ {bill.amount.toFixed(2)}</p></div></div><button onClick={() => toggleBillPaid(bill.id, bill.isPaid)} className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase active-scale ${bill.isPaid ? 'bg-emerald-600 text-white shadow-lg' : 'bg-white/5 border border-white/10 text-slate-400'}`}>{bill.isPaid ? 'PAGO' : 'PAGAR'}</button></div>
             ))}</div>
          </div>
        )}
        {activeTab === 'stats' && (
          <div className="h-full overflow-y-auto p-8 space-y-8 pb-24 custom-scrollbar">
            <h2 className="text-4xl font-black italic uppercase">Metas</h2>
            <div className="bg-slate-900 border border-white/5 p-8 rounded-[40px] shadow-2xl">
              <p className="text-[10px] font-black uppercase text-emerald-500 mb-1">Sonho Principal</p><h3 className="text-2xl font-black uppercase tracking-tighter italic mb-4">{userProfile?.goal_name}</h3>
              <div className="w-full bg-slate-800 h-4 rounded-full overflow-hidden border border-white/5 mb-4"><div className="bg-emerald-500 h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, (totals.netProfit / (userProfile?.financial_goal || 1)) * 100)}%` }} /></div>
              <div className="flex justify-between items-end"><div><p className="text-[9px] font-black text-slate-500 uppercase">Acumulado</p><p className="text-xl font-black text-white">R$ {totals.netProfit.toFixed(2)}</p></div><div className="text-right"><p className="text-4xl font-black text-emerald-500">{((totals.netProfit / (userProfile?.financial_goal || 1)) * 100).toFixed(1)}%</p></div></div>
            </div>
          </div>
        )}
        {activeTab === 'help' && (
          <div className="h-full overflow-y-auto p-8 space-y-8 pb-24 custom-scrollbar">
            <h2 className="text-4xl font-black italic uppercase">Ajustes</h2>
            <div className="bg-emerald-600/10 border border-emerald-500/30 p-8 rounded-[40px] flex justify-between items-center"><div><p className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">Sua Assinatura</p><p className="text-sm font-black text-white uppercase italic">Status: Ativo ✅</p><p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Expira: {authStatus.expiresAt ? new Date(authStatus.expiresAt).toLocaleDateString('pt-BR') : '--'}</p></div><div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center"><BotIcon className="w-6 h-6 text-emerald-500" /></div></div>
            <div className="bg-slate-900/40 border border-white/5 p-8 rounded-[40px] space-y-6"><h3 className="text-xs font-black uppercase text-emerald-500 tracking-[0.2em]">Sonho & Alvo</h3><div className="space-y-4"><div><label className="block text-[10px] font-black text-slate-500 uppercase mb-2 ml-1">Sonho</label><input type="text" value={userProfile?.goal_name || ''} onChange={e => updateMotoProfile({ goal_name: e.target.value })} className="w-full bg-white/5 rounded-2xl p-4 text-sm font-black outline-none border border-white/5" /></div><div><label className="block text-[10px] font-black text-slate-500 uppercase mb-2 ml-1">Alvo (R$)</label><input type="number" value={userProfile?.financial_goal || ''} onChange={e => updateMotoProfile({ financial_goal: parseFloat(e.target.value) || 0 })} className="w-full bg-white/5 rounded-2xl p-4 text-sm font-black outline-none border border-white/5 text-emerald-500" /></div></div></div>
            <a href={`https://wa.me/${DEV_WHATSAPP}?text=Salve!%20Gostaria%20de%20tirar%20uma%20dúvida.`} target="_blank" className="w-full bg-[#25D366] py-5 rounded-2xl font-black text-xs uppercase text-white shadow-xl flex items-center justify-center gap-3 active-scale"><WhatsAppIcon className="w-6 h-6" /> SUPORTE</a>
          </div>
        )}
      </main>
      <nav className="bg-slate-950/80 backdrop-blur-3xl border-t border-white/5 px-2 py-6 flex justify-around items-center sticky bottom-0 z-50">
        {[ { id: 'chat', icon: BotIcon, label: 'Mentor' }, { id: 'ledger', icon: WalletIcon, label: 'Corre' }, { id: 'calendar', icon: CalendarIcon, label: 'Agenda' }, { id: 'stats', icon: GraphIcon, label: 'Metas' }, { id: 'help', icon: SupportIcon, label: 'Ajustes' } ].map((item) => (
          <button key={item.id} onClick={() => setActiveTab(item.id as any)} className={`flex flex-col items-center gap-2 px-4 transition-all ${activeTab === item.id ? 'text-emerald-400' : 'text-slate-600'}`}><div className={`p-2 rounded-2xl transition-all ${activeTab === item.id ? 'bg-emerald-500/10 scale-110' : ''}`}><item.icon className="w-6 h-6" /></div><span className="text-[8px] font-black uppercase tracking-widest">{item.label}</span></button>
        ))}
      </nav>
    </div>
  );
};

export default App;
