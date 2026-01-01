
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from './services/supabaseClient';
import { FinancialMentorService } from './services/geminiService';
import { Role, Message, Bill, User, Expense, Profile } from './types';
import { 
  SendIcon, WalletIcon, GraphIcon, BotIcon, 
  TrashIcon, CalendarIcon, ChevronLeftIcon, ChevronRightIcon,
  LogoutIcon, SupportIcon, BellIcon,
  AppLogo
} from './components/Icons';
import MarkdownRenderer from './components/MarkdownRenderer';

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DAYS_OF_WEEK = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const Skeleton = ({ className }: { className: string }) => (
  <div className={`animate-pulse bg-slate-800/50 rounded-2xl ${className}`} />
);

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [activeTab, setActiveTab] = useState<'chat' | 'ledger' | 'stats' | 'calendar' | 'help'>('chat');
  
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isDataSyncing, setIsDataSyncing] = useState(false);
  
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [notifsEnabled, setNotifsEnabled] = useState(() => {
    return localStorage.getItem('moto_notifs_muted') !== 'true';
  });

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingData, setOnboardingData] = useState<Profile>({
    age: '', gender: '', experience: '', tool: '', days_week: '', hours_day: '',
    platforms: [], accident: false, challenge: '',
    financial_goal: 5000, goal_name: 'Reserva de Emergência'
  });

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
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // States for manual bill adding
  const [isAddingManualBill, setIsAddingManualBill] = useState(false);
  const [manualBillName, setManualBillName] = useState('');
  const [manualBillAmount, setManualBillAmount] = useState('');

  const mentorService = useRef<FinancialMentorService | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'chat') {
      setTimeout(scrollToBottom, 200);
    }
  }, [messages, activeTab, scrollToBottom]);

  const totals = useMemo(() => {
    const month = viewDate.getMonth();
    const year = viewDate.getFullYear();
    const earnings = dailyEarnings.filter(e => {
      const d = new Date(e.date);
      return d.getUTCMonth() === month && d.getUTCFullYear() === year;
    });
    const expenses = dailyExpenses.filter(e => {
      const d = new Date(e.date);
      return d.getUTCMonth() === month && d.getUTCFullYear() === year;
    });
    const currentBills = bills.filter(b => {
      const [bYear, bMonth] = b.dueDate.split('-').map(Number);
      return bMonth === (month + 1) && bYear === year;
    }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const totalEarned = earnings.reduce((acc, curr) => acc + Number(curr.value), 0);
    const totalSpent = expenses.reduce((acc, curr) => acc + Number(curr.value), 0);

    return { totalEarned, totalSpent, netProfit: totalEarned - totalSpent, currentBills };
  }, [dailyEarnings, dailyExpenses, bills, viewDate]);

  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return { firstDay, daysInMonth };
  }, [viewDate]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) setCurrentUser({ email: session.user.email!, name: session.user.user_metadata?.name || 'Comandante' });
      setTimeout(() => setIsInitialLoading(false), 1000);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) setCurrentUser({ email: session.user.email!, name: session.user.user_metadata?.name || 'Comandante' });
      else { setCurrentUser(null); setMessages([]); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadAllData = async () => {
    if (!session?.user) return;
    setIsDataSyncing(true);
    try {
      const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', session.user.id).single();
      if (!profile) setShowOnboarding(true);
      else setUserProfile(profile);

      const [msgsRes, earnsRes, expsRes, blsRes] = await Promise.all([
        supabase.from('chat_messages').select('*').eq('user_id', session.user.id).order('timestamp', { ascending: true }),
        supabase.from('earnings').select('*').eq('user_id', session.user.id).order('date', { ascending: false }),
        supabase.from('expenses').select('*').eq('user_id', session.user.id).order('date', { ascending: false }),
        supabase.from('bills').select('*').eq('user_id', session.user.id).order('dueDate', { ascending: true })
      ]);
      
      if (msgsRes.data && msgsRes.data.length > 0) setMessages(msgsRes.data.map(m => ({ role: m.role, text: m.text, timestamp: m.timestamp })));
      else setMessages([{ role: Role.MODEL, text: `Salve, **${currentUser?.name}**! 🏍️\nQuanto rendeu o corre hoje?`, timestamp: new Date().toISOString() }]);
      
      if (earnsRes.data) setDailyEarnings(earnsRes.data);
      if (expsRes.data) setDailyExpenses(expsRes.data);
      if (blsRes.data) setBills(blsRes.data);
    } catch (err) {
      console.error("Sync error:", err);
    } finally {
      setIsDataSyncing(false);
    }
  };

  useEffect(() => {
    if (session?.user) {
      loadAllData();
      mentorService.current = new FinancialMentorService();
    }
  }, [session, currentUser]);

  const navigateMonth = (step: number) => {
    setViewDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + step);
      return newDate;
    });
  };

  const handleAuth = async () => {
    setIsAuthLoading(true);
    setGlobalError(null);
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

  const handleOnboardingSubmit = async () => {
    if (!session?.user) return;
    setIsDataSyncing(true);
    const { error } = await supabase.from('profiles').insert([{ user_id: session.user.id, ...onboardingData }]);
    if (!error) {
      setShowOnboarding(false);
      setUserProfile(onboardingData);
      processAIPrompt("Acabei de criar meu perfil. Me dá umas boas vindas!");
    }
    setIsDataSyncing(false);
  };

  const updateMotoProfile = async (updates: Partial<Profile>) => {
    if (!session?.user) return;
    setIsDataSyncing(true);
    const { error } = await supabase.from('profiles').update(updates).eq('user_id', session.user.id);
    if (!error) setUserProfile(prev => prev ? { ...prev, ...updates } : null);
    setIsDataSyncing(false);
  };

  const getDayStatus = (day: number) => {
    const dateStr = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayBills = bills.filter(b => b.dueDate === dateStr);
    if (dayBills.length === 0) return null;
    return dayBills.every(b => b.isPaid) ? 'paid' : 'due';
  };

  const toggleBillPaid = async (id: string, currentStatus: boolean) => {
    if (!session?.user) return;
    setIsDataSyncing(true);
    const { error } = await supabase.from('bills').update({ isPaid: !currentStatus }).eq('id', id);
    if (!error) {
      setBills(prev => prev.map(b => b.id === id ? { ...b, isPaid: !currentStatus } : b));
    }
    setIsDataSyncing(false);
  };

  const deleteBill = async (id: string) => {
    if (!session?.user) return;
    setIsDataSyncing(true);
    const { error } = await supabase.from('bills').delete().eq('id', id);
    if (!error) {
      setBills(prev => prev.filter(b => b.id !== id));
    }
    setIsDataSyncing(false);
  };

  const handleManualAddBill = async () => {
    if (!manualBillName || !manualBillAmount || !selectedDay || !session?.user) return;
    setIsDataSyncing(true);
    const dateStr = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
    const { data, error } = await supabase.from('bills').insert([{
      user_id: session.user.id,
      name: manualBillName,
      amount: parseFloat(manualBillAmount),
      dueDate: dateStr,
      isPaid: false
    }]).select();

    if (data && !error) {
      setBills(prev => [...prev, data[0]]);
      setManualBillName('');
      setManualBillAmount('');
      setIsAddingManualBill(false);
    }
    setIsDataSyncing(false);
  };

  const toggleNotifs = () => {
    setNotifsEnabled(prev => {
      const newVal = !prev;
      localStorage.setItem('moto_notifs_muted', String(!newVal));
      return newVal;
    });
  };

  const requestNotifPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const permission = await Notification.requestPermission();
    setNotifPermission(permission);
    if (permission === 'granted') {
      setNotifsEnabled(true);
      localStorage.setItem('moto_notifs_muted', 'false');
    }
  };

  const processAIPrompt = async (prompt: string) => {
    if (!mentorService.current || isAILoading || !prompt.trim()) return;
    const userMsg = { role: Role.USER, text: prompt, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setIsAILoading(true);
    if (session?.user) await supabase.from('chat_messages').insert([{ user_id: session.user.id, ...userMsg }]);
    try {
      const response = await mentorService.current.sendMessage(prompt);
      
      if (response.functionCalls && response.functionCalls.length > 0) {
        for (const fc of response.functionCalls) {
          if (fc.name === 'add_bill' && session?.user) {
            const { name, amount, dueDate } = fc.args;
            const { data, error } = await supabase.from('bills').insert([{
              user_id: session.user.id,
              name,
              amount,
              dueDate,
              isPaid: false
            }]).select();
            if (data && !error) setBills(prev => [...prev, data[0]]);
          }
        }
      }

      const modelMsg = { role: Role.MODEL, text: response.text, timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, modelMsg]);
      if (session?.user) await supabase.from('chat_messages').insert([{ user_id: session.user.id, ...modelMsg }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: Role.MODEL, text: "Ops, falhei na conexão.", timestamp: new Date().toISOString() }]);
    } finally { setIsAILoading(false); }
  };

  const handleSaveDay = async () => {
    const earnVal = parseFloat(tempEarning) || 0;
    const expVal = parseFloat(tempExpense) || 0;
    if ((!earnVal && !expVal) || !session?.user) return;
    setIsDataSyncing(true);
    const dateStr = new Date().toLocaleDateString('en-CA');
    if (earnVal) {
      const { data } = await supabase.from('earnings').insert([{ user_id: session.user.id, value: earnVal, date: dateStr }]).select();
      if (data) setDailyEarnings(p => [data[0], ...p]);
    }
    if (expVal) {
      const { data } = await supabase.from('expenses').insert([{ user_id: session.user.id, value: expVal, date: dateStr }]).select();
      if (data) setDailyExpenses(p => [data[0], ...p]);
    }
    setTempEarning(''); setTempExpense(''); setActiveTab('chat');
    setIsDataSyncing(false);
    processAIPrompt(`Fiz R$ ${earnVal} brutos e gastei R$ ${expVal}. Me ajuda a dividir esse lucro?`);
  };

  if (isInitialLoading) {
    return (
      <div className="h-screen bg-[#020617] flex flex-col items-center justify-center p-6 bg-animate">
        <div className="relative">
          <div className="absolute inset-0 bg-emerald-500 blur-3xl opacity-20 animate-pulse rounded-full" />
          <AppLogo className="w-24 h-24 relative animate-bounce" />
        </div>
        <h1 className="text-3xl font-black italic uppercase tracking-tighter mt-8 text-white">MotoInvest</h1>
        <div className="mt-4 flex gap-1">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0s' }} />
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0.1s' }} />
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0.2s' }} />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex flex-col h-screen items-center justify-center p-6 bg-animate text-white overflow-y-auto">
        <div className="w-full max-w-sm space-y-8 animate-in zoom-in duration-500">
          <div className="text-center">
            <AppLogo className="w-24 h-24 mx-auto mb-4" />
            <h1 className="text-4xl font-black italic tracking-tighter uppercase">MotoInvest</h1>
            <p className="text-emerald-400 font-bold text-[10px] tracking-widest uppercase">O Mentor do Motoca</p>
          </div>
          <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 p-8 rounded-[40px] space-y-4">
            <div className="flex bg-white/5 p-1 rounded-2xl">
              <button onClick={() => setAuthMode('login')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase transition-all ${authMode === 'login' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>Entrar</button>
              <button onClick={() => setAuthMode('register')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase transition-all ${authMode === 'register' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>Criar</button>
            </div>
            {authMode === 'register' && (
              <input type="text" placeholder="Seu Nome" value={name} onChange={e => setName(e.target.value)} 
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-sm focus:ring-2 ring-emerald-500/50 outline-none transition-all" />
            )}
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} 
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-sm focus:ring-2 ring-emerald-500/50 outline-none transition-all" />
            <input type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} 
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-sm focus:ring-2 ring-emerald-500/50 outline-none transition-all" />
            
            {globalError && <p className="text-rose-500 text-[10px] font-bold text-center animate-bounce">{globalError}</p>}
            
            <button onClick={handleAuth} disabled={isAuthLoading} className="w-full bg-emerald-600 py-4 rounded-2xl font-black uppercase shadow-xl active-scale disabled:opacity-50 flex items-center justify-center">
              {isAuthLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'COMEÇAR O CORRE'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <div className="fixed inset-0 z-[100] bg-[#020617] text-white flex flex-col p-6 overflow-y-auto bg-animate">
        <div className="max-w-md mx-auto w-full py-8 space-y-10 animate-in fade-in slide-in-from-bottom-8">
          <div className="text-center"><AppLogo className="w-16 h-16 mx-auto mb-4" /><h2 className="text-3xl font-black italic uppercase text-emerald-500">Perfil Inicial</h2></div>
          <div className="space-y-8">
            <section className="space-y-4">
              <label className="block text-xs font-black uppercase text-slate-400 tracking-widest">Gênero</label>
              <div className="grid grid-cols-2 gap-2">
                {['Homem', 'Mulher'].map(g => (
                  <button key={g} onClick={() => setOnboardingData({...onboardingData, gender: g})} className={`py-4 rounded-2xl text-xs font-black uppercase transition-all ${onboardingData.gender === g ? 'bg-emerald-600' : 'bg-white/5 text-slate-500'}`}>{g}</button>
                ))}
              </div>
            </section>
            <section className="space-y-4">
              <label className="block text-xs font-black uppercase text-slate-400 tracking-widest">Qual o seu maior objetivo?</label>
              <div className="grid grid-cols-1 gap-4">
                <div className="bg-white/5 p-4 rounded-2xl">
                  <span className="text-[10px] font-black uppercase text-slate-500 block mb-1">Nome da Meta (ex: Trocar de Moto)</span>
                  <input type="text" value={onboardingData.goal_name || ''} onChange={e => setOnboardingData({...onboardingData, goal_name: e.target.value})} className="bg-transparent text-white w-full text-xl font-black outline-none placeholder:text-white/20" placeholder="Ex: Viagem de Férias" />
                </div>
                <div className="bg-white/5 p-4 rounded-2xl">
                  <span className="text-[10px] font-black uppercase text-slate-500 block mb-1">Valor do Sonho (R$)</span>
                  <input type="number" value={onboardingData.financial_goal || ''} onChange={e => setOnboardingData({...onboardingData, financial_goal: e.target.value === '' ? undefined : parseFloat(e.target.value)})} className="bg-transparent text-white w-full text-xl font-black outline-none" placeholder="0" />
                </div>
              </div>
            </section>
            <button onClick={handleOnboardingSubmit} className="w-full bg-emerald-600 py-6 rounded-2xl font-black uppercase shadow-2xl active-scale">FINALIZAR E ENTRAR</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen text-slate-100 overflow-hidden relative">
      <header className="px-6 py-4 bg-slate-900/60 backdrop-blur-xl border-b border-white/5 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <AppLogo className="w-8 h-8" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs font-black uppercase italic tracking-tighter">MotoInvest</h1>
              {isDataSyncing && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />}
            </div>
            <p className="text-[9px] text-emerald-400 font-bold uppercase truncate max-w-[120px]">{currentUser.name}</p>
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="p-2.5 bg-white/5 border border-white/10 rounded-xl active-scale"><LogoutIcon className="w-4 h-4 text-slate-400" /></button>
      </header>

      <main className="flex-1 overflow-hidden relative z-10">
        {activeTab === 'chat' && (
          <div className="flex flex-col h-full animate-in fade-in duration-300">
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 custom-scrollbar">
              {messages.length === 0 && (
                <div className="space-y-4">
                  <Skeleton className="h-20 w-3/4" />
                  <Skeleton className="h-16 w-1/2 ml-auto" />
                </div>
              )}
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === Role.USER ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}>
                  <div className={`max-w-[90%] p-4 rounded-2xl shadow-xl ${msg.role === Role.USER ? 'bg-emerald-600 text-white rounded-br-none' : 'bg-slate-900/80 backdrop-blur-md border border-white/5 rounded-bl-none'}`}>
                    {msg.role === Role.MODEL && <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/5"><BotIcon className="w-3 h-3 text-emerald-400" /><span className="text-[9px] font-black uppercase text-emerald-400">Mentor IA</span></div>}
                    <MarkdownRenderer content={msg.text} />
                  </div>
                </div>
              ))}
              {isAILoading && (
                <div className="flex items-center gap-2 text-emerald-500 font-black text-[9px] uppercase animate-pulse ml-4">
                  <BotIcon className="w-3 h-3" /> Mentor calculando estratégia...
                </div>
              )}
              <div ref={messagesEndRef} className="h-4" />
            </div>
            <div className="p-4 bg-slate-900/80 backdrop-blur-xl border-t border-white/5">
              <div className="flex items-center gap-2 max-w-2xl mx-auto">
                <input type="text" value={inputText} onChange={e => setInputText(e.target.value)} onKeyPress={e => e.key === 'Enter' && processAIPrompt(inputText)} placeholder="Falar com o Mentor..." className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm outline-none" />
                <button onClick={() => { processAIPrompt(inputText); setInputText(''); }} disabled={isAILoading || !inputText.trim()} className="bg-emerald-600 p-4 rounded-2xl active-scale disabled:opacity-50"><SendIcon className="w-5 h-5 text-white" /></button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ledger' && (
          <div className="h-full overflow-y-auto p-8 space-y-8 pb-24 custom-scrollbar animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-4xl font-black italic uppercase">Meu Corre</h2>
            <div className="space-y-6">
              <div className="bg-emerald-600/90 p-8 rounded-[40px] shadow-2xl border border-white/10 group">
                 <label className="block text-[10px] font-black text-white/70 uppercase mb-2 tracking-widest group-focus-within:text-white">Ganhos de Hoje (Bruto)</label>
                 <div className="flex items-center gap-3">
                   <span className="text-2xl font-black text-white/50">R$</span>
                   <input type="number" placeholder="0,00" value={tempEarning} onChange={e => setTempEarning(e.target.value)} className="w-full bg-transparent text-5xl font-black text-white outline-none placeholder:text-white/20" />
                 </div>
              </div>

              <div className="bg-rose-600/90 p-8 rounded-[40px] shadow-2xl border border-white/10 group">
                 <label className="block text-[10px] font-black text-white/70 uppercase mb-2 tracking-widest group-focus-within:text-white">Gastos do Dia</label>
                 <div className="flex items-center gap-3">
                   <span className="text-2xl font-black text-white/50">R$</span>
                   <input type="number" placeholder="0,00" value={tempExpense} onChange={e => setTempExpense(e.target.value)} className="w-full bg-transparent text-5xl font-black text-white outline-none placeholder:text-white/20" />
                 </div>
              </div>

              <button onClick={handleSaveDay} disabled={isDataSyncing} className="w-full bg-white text-slate-900 py-6 rounded-3xl font-black uppercase shadow-2xl active-scale flex items-center justify-center gap-3 disabled:opacity-50">
                {isDataSyncing ? <div className="w-5 h-5 border-2 border-slate-400 border-t-slate-900 rounded-full animate-spin" /> : <><WalletIcon className="w-5 h-5" /> FECHAR DIA E CALCULAR</>}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="h-full p-8 overflow-y-auto relative custom-scrollbar animate-in fade-in slide-in-from-bottom-4 duration-300">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-4xl font-black italic uppercase">Agenda</h2>
                <div className="text-right flex items-center gap-2">
                    <button onClick={() => navigateMonth(-1)} className="p-1 active-scale"><ChevronLeftIcon /></button>
                    <span className="text-[10px] font-black uppercase text-emerald-400 min-w-[70px] text-center">{MONTHS[viewDate.getMonth()]}</span>
                    <button onClick={() => navigateMonth(1)} className="p-1 active-scale"><ChevronRightIcon /></button>
                </div>
             </div>
             
             <div className="bg-white/5 p-6 rounded-[40px] border border-white/5">
                <div className="grid grid-cols-7 gap-2 mb-4">{DAYS_OF_WEEK.map(d => <span key={d} className="text-[10px] font-black text-slate-600 text-center">{d}</span>)}</div>
                <div className="grid grid-cols-7 gap-2">
                   {Array.from({ length: calendarDays.firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
                   {Array.from({ length: calendarDays.daysInMonth }).map((_, i) => {
                     const day = i + 1;
                     const status = getDayStatus(day);
                     return (
                       <button key={day} onClick={() => setSelectedDay(day)} className={`aspect-square flex flex-col items-center justify-center rounded-2xl border transition-all active-scale relative ${selectedDay === day ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/5 bg-white/5'}`}>
                         <span className="text-xs font-black">{day}</span>
                         {status === 'due' && <div className="absolute bottom-1 w-1 h-1 rounded-full bg-rose-500 shadow-lg shadow-rose-500" />}
                         {status === 'paid' && <div className="absolute bottom-1 w-1 h-1 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500" />}
                       </button>
                     );
                   })}
                </div>
             </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="h-full overflow-y-auto p-8 space-y-8 pb-24 custom-scrollbar animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-4xl font-black italic uppercase">Metas</h2>
            
            {!userProfile ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <div className="bg-slate-900/60 border border-white/5 p-8 rounded-[40px] shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5"><GraphIcon className="w-32 h-32" /></div>
                <div className="flex justify-between items-end mb-4 relative z-10">
                  <div>
                    <p className="text-[10px] font-black uppercase text-emerald-500 mb-1 tracking-[0.2em]">Objetivo Atual</p>
                    <h3 className="text-2xl font-black uppercase tracking-tighter italic leading-tight">{userProfile?.goal_name || 'Minha Meta'}</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-emerald-500">{((totals.netProfit / (userProfile?.financial_goal || 1)) * 100).toFixed(1)}%</p>
                  </div>
                </div>
                <div className="w-full bg-slate-800 h-4 rounded-full overflow-hidden relative z-10">
                  <div className="bg-emerald-500 h-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(16,185,129,0.5)]" style={{ width: `${Math.min(100, (totals.netProfit / (userProfile?.financial_goal || 1)) * 100)}%` }} />
                </div>
                <div className="flex justify-between items-center mt-6 relative z-10">
                  <div className="text-left">
                    <p className="text-[9px] font-black text-slate-500 uppercase">Acumulado</p>
                    <p className="text-lg font-black text-white">R$ {totals.netProfit.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-slate-500 uppercase">Alvo</p>
                    <p className="text-lg font-black text-slate-400">R$ {userProfile?.financial_goal?.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 p-6 rounded-[32px] text-center border border-white/5">
                <p className="text-[9px] font-black text-emerald-400 uppercase">Total Ganhos</p>
                <p className="text-xl font-black">R$ {totals.totalEarned.toFixed(2)}</p>
              </div>
              <div className="bg-white/5 p-6 rounded-[32px] text-center border border-white/5">
                <p className="text-[9px] font-black text-rose-400 uppercase">Total Gastos</p>
                <p className="text-xl font-black text-rose-300">R$ {totals.totalSpent.toFixed(2)}</p>
              </div>
            </div>
            
            <div className="bg-slate-900/40 p-8 rounded-[40px] border border-white/5 text-center">
              <p className="text-[10px] font-black uppercase text-slate-500 mb-2">Estimativa para o Sonho</p>
              {totals.netProfit > 0 ? (
                <p className="text-sm font-bold italic">No ritmo atual, você completa sua meta em breve! Continue firme no corre. 🚀</p>
              ) : (
                <p className="text-sm font-bold italic opacity-50 italic">Feche seu primeiro dia para vermos sua evolução!</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'help' && (
          <div className="h-full overflow-y-auto p-8 space-y-8 pb-24 custom-scrollbar animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-4xl font-black italic uppercase">Ajustes</h2>
            
            <div className="bg-slate-900/40 border border-white/5 p-8 rounded-[40px] space-y-6">
               <h3 className="text-xs font-black uppercase text-emerald-500 tracking-[0.2em]">Mudar Objetivo</h3>
               <div className="space-y-4">
                 <div>
                   <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 ml-1">Nome do Sonho</label>
                   <input 
                     type="text" 
                     placeholder="Ex: Moto Nova, Viagem, Reserva" 
                     value={userProfile?.goal_name || ''} 
                     onChange={e => updateMotoProfile({ goal_name: e.target.value })} 
                     className="w-full bg-white/5 rounded-2xl p-4 text-sm font-black outline-none border border-white/5 focus:ring-2 ring-emerald-500/30 transition-all text-white" 
                   />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 ml-1">Valor Alvo (R$)</label>
                   <div className="bg-white/5 p-4 rounded-2xl flex justify-between items-center border border-white/5">
                     <span className="text-[11px] font-black uppercase text-slate-400 mr-2">R$</span>
                     <input 
                       type="number" 
                       value={userProfile?.financial_goal === undefined || isNaN(userProfile?.financial_goal as number) ? '' : userProfile?.financial_goal} 
                       onChange={e => {
                         const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                         updateMotoProfile({ financial_goal: val });
                       }} 
                       className="flex-1 bg-transparent text-right font-black text-emerald-500 outline-none text-lg p-1" 
                       placeholder="0"
                     />
                   </div>
                 </div>
               </div>
            </div>

            <div className="bg-slate-900/40 border border-white/5 p-8 rounded-[40px] space-y-6">
              <div className="flex items-center gap-4">
                <div className={`p-4 rounded-2xl transition-all ${notifsEnabled ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-800 text-slate-500'}`}><BellIcon className="w-6 h-6" /></div>
                <div className="flex-1">
                  <p className="text-xs font-black uppercase italic">Notificações</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase">{notifsEnabled ? 'Ativadas' : 'Silenciadas'}</p>
                </div>
                {notifPermission === 'granted' ? (
                  <button onClick={toggleNotifs} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all active-scale ${notifsEnabled ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                    {notifsEnabled ? 'DESATIVAR' : 'ATIVAR'}
                  </button>
                ) : (
                  <button onClick={requestNotifPermission} className="bg-emerald-600 px-4 py-2 rounded-xl text-[9px] font-black uppercase active-scale">PERMITIR</button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal de Detalhes do Dia */}
      {selectedDay && (
        <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col animate-in slide-in-from-bottom duration-300">
          <div className="sticky top-0 p-6 pb-4 flex justify-between items-center border-b border-white/5 bg-slate-950/80 backdrop-blur-xl z-[110] safe-top">
            <div>
              <h3 className="font-black uppercase italic text-emerald-500 text-2xl tracking-tighter">Dia {selectedDay}</h3>
              <p className="text-[10px] font-black text-slate-500 uppercase">{MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}</p>
            </div>
            <button 
              onClick={() => {
                setSelectedDay(null);
                setIsAddingManualBill(false);
              }} 
              className="px-6 py-3 bg-rose-600 text-white rounded-2xl font-black text-[11px] uppercase shadow-[0_4px_15px_rgba(225,29,72,0.4)] active-scale transition-all"
            >
              FECHAR
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar pb-10">
            {/* Action Bar for Manual Add */}
            <div className="animate-in fade-in slide-in-from-top-4 duration-500">
              {!isAddingManualBill ? (
                <button 
                  onClick={() => setIsAddingManualBill(true)}
                  className="w-full bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 py-4 rounded-3xl font-black uppercase text-xs flex items-center justify-center gap-2 active-scale transition-all"
                >
                  <span className="text-xl">+</span> ADICIONAR CONTA
                </button>
              ) : (
                <div className="bg-slate-900 border border-emerald-500/30 p-6 rounded-[32px] space-y-4 shadow-2xl animate-in zoom-in duration-300">
                  <h4 className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">Nova Conta Manual</h4>
                  <input 
                    type="text" 
                    placeholder="Descrição (ex: MEI, Gasolina)" 
                    value={manualBillName}
                    onChange={e => setManualBillName(e.target.value)}
                    className="w-full bg-white/5 rounded-2xl p-4 text-sm font-black outline-none border border-white/5 focus:ring-2 ring-emerald-500/30"
                  />
                  <div className="bg-white/5 p-4 rounded-2xl flex justify-between items-center border border-white/5">
                    <span className="text-[11px] font-black uppercase text-slate-400 mr-2">R$</span>
                    <input 
                      type="number" 
                      placeholder="0,00"
                      value={manualBillAmount}
                      onChange={e => setManualBillAmount(e.target.value)}
                      className="flex-1 bg-transparent text-right font-black text-emerald-500 outline-none text-lg"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button 
                      onClick={handleManualAddBill}
                      className="flex-1 bg-emerald-600 py-4 rounded-2xl font-black uppercase text-[10px] active-scale shadow-lg shadow-emerald-500/20"
                    >
                      SALVAR
                    </button>
                    <button 
                      onClick={() => setIsAddingManualBill(false)}
                      className="px-6 bg-white/5 py-4 rounded-2xl font-black uppercase text-[10px] active-scale"
                    >
                      CANCELAR
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {bills.filter(b => b.dueDate === `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`).map(bill => (
                <div key={bill.id} className="bg-slate-900 border border-white/5 p-6 rounded-[32px] flex justify-between items-center shadow-2xl animate-in fade-in slide-in-from-right-4">
                  <div className="flex-1 mr-4">
                    <p className={`font-black uppercase text-base leading-tight ${bill.isPaid ? 'line-through text-slate-600' : 'text-white'}`}>{bill.name}</p>
                    <p className="text-sm font-bold text-emerald-500 mt-1">R$ {bill.amount.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleBillPaid(bill.id, bill.isPaid)} className={`px-5 py-3 rounded-2xl text-[10px] font-black transition-all ${bill.isPaid ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-800 text-slate-400'}`}>{bill.isPaid ? 'PAGO' : 'PAGAR'}</button>
                    <button onClick={() => deleteBill(bill.id)} className="p-3 text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-2xl active-scale transition-all"><TrashIcon className="w-5 h-5" /></button>
                  </div>
                </div>
              ))}
              {bills.filter(b => b.dueDate === `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`).length === 0 && !isAddingManualBill && (
                <div className="py-20 text-center flex flex-col items-center gap-4">
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center opacity-20"><CalendarIcon className="w-8 h-8" /></div>
                  <p className="opacity-30 italic text-sm font-bold uppercase tracking-widest">Nenhuma conta para este dia.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <nav className="bg-slate-950/80 backdrop-blur-3xl border-t border-white/5 px-2 py-6 flex justify-around items-center sticky bottom-0 z-50">
        {[
          { id: 'chat', icon: BotIcon, label: 'Mentor' },
          { id: 'ledger', icon: WalletIcon, label: 'Corre' },
          { id: 'calendar', icon: CalendarIcon, label: 'Agenda' },
          { id: 'stats', icon: GraphIcon, label: 'Metas' },
          { id: 'help', icon: SupportIcon, label: 'Ajustes' },
        ].map((item) => (
          <button key={item.id} onClick={() => setActiveTab(item.id as any)} className={`flex flex-col items-center gap-2 transition-all px-4 ${activeTab === item.id ? 'text-emerald-400' : 'text-slate-600 hover:text-slate-400'}`}>
            <div className={`p-2 rounded-2xl transition-all active-scale ${activeTab === item.id ? 'bg-emerald-500/10 scale-110 shadow-[0_0_20px_rgba(16,185,129,0.2)]' : ''}`}><item.icon className="w-6 h-6" /></div>
            <span className="text-[8px] font-black tracking-widest uppercase">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default App;
