
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from './services/supabaseClient';
import { FinancialMentorService } from './services/geminiService';
import { Role, Message, Bill, User, Expense, Profile } from './types';
import { 
  SendIcon, WalletIcon, GraphIcon, MotoIcon, BotIcon, 
  AlertIcon, TrashIcon, CalendarIcon, ChevronDownIcon,
  ChevronLeftIcon, ChevronRightIcon,
  LogoutIcon, UserIcon, LockIcon, SupportIcon, BellIcon
} from './components/Icons';
import MarkdownRenderer from './components/MarkdownRenderer';

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DAYS_OF_WEEK = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const YEARS = [2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];

const STRATEGY_CONFIG = [
  { label: 'Essencial (50%)', color: 'bg-emerald-500', pct: 0.5, desc: 'Gasolina, Manutenção, Aluguel' },
  { label: 'Lazer (30%)', color: 'bg-blue-500', pct: 0.3, desc: 'Família, Descanso, Comida' },
  { label: 'Independência (20%)', color: 'bg-purple-500', pct: 0.2, desc: 'Futuro, Moto Nova, Reserva' }
];

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [activeTab, setActiveTab] = useState<'chat' | 'ledger' | 'stats' | 'calendar' | 'help'>('chat');
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  
  // Notification State
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  // Onboarding
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingData, setOnboardingData] = useState<Profile>({
    age: '',
    gender: '',
    experience: '',
    tool: '',
    days_week: '',
    hours_day: '',
    platforms: [],
    accident: false,
    challenge: ''
  });

  // Auth states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // App Data
  const [messages, setMessages] = useState<Message[]>([]);
  const [dailyEarnings, setDailyEarnings] = useState<any[]>([]);
  const [dailyExpenses, setDailyExpenses] = useState<Expense[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [viewDate, setViewDate] = useState(new Date());
  
  // UI States
  const [inputText, setInputText] = useState('');
  const [tempEarning, setTempEarning] = useState('');
  const [tempExpense, setTempExpense] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const mentorService = useRef<FinancialMentorService | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Memoized Calculations
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

    return {
      totalEarned,
      totalSpent,
      netProfit: totalEarned - totalSpent,
      earnings,
      currentBills
    };
  }, [dailyEarnings, dailyExpenses, bills, viewDate]);

  // Group bills by week for summary
  const billsByWeek = useMemo(() => {
    const weeks: Record<number, Bill[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    totals.currentBills.forEach(bill => {
      const day = parseInt(bill.dueDate.split('-')[2]);
      const weekNum = Math.ceil(day / 7);
      const clampedWeek = Math.min(weekNum, 5);
      weeks[clampedWeek].push(bill);
    });
    return weeks;
  }, [totals.currentBills]);

  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return { firstDay, daysInMonth };
  }, [viewDate]);

  // Push Notification Logic
  const checkUpcomingBills = useCallback((billsList: Bill[]) => {
    if (notifPermission !== 'granted') return;

    const today = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(today.getDate() + 3);

    const upcoming = billsList.filter(bill => {
      if (bill.isPaid) return false;
      const dueDate = new Date(bill.dueDate + 'T00:00:00');
      return dueDate >= today && dueDate <= threeDaysFromNow;
    });

    upcoming.forEach(bill => {
      const notifKey = `notified_${bill.id}_${new Date().toDateString()}`;
      if (!localStorage.getItem(notifKey)) {
        new Notification("MotoInvest: Conta Vencendo! 🏍️", {
          body: `Sua conta "${bill.name}" de R$ ${bill.amount.toFixed(2)} vence em breve (${new Date(bill.dueDate + 'T00:00:00').toLocaleDateString('pt-BR')}).`,
          icon: 'https://cdn-icons-png.flaticon.com/512/3198/3198336.png'
        });
        localStorage.setItem(notifKey, 'true');
      }
    });
  }, [notifPermission]);

  const requestNotifPermission = async () => {
    if (!('Notification' in window)) {
      alert("Este navegador não suporta notificações.");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotifPermission(permission);
    if (permission === 'granted') {
      new Notification("MotoInvest", { body: "Boa! Agora eu te aviso dos boletos que estão chegando. 🏍️💨" });
    }
  };

  // Initial Load & Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) setCurrentUser({ email: session.user.email!, name: session.user.user_metadata?.name || 'Comandante' });
      setIsInitialLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) setCurrentUser({ email: session.user.email!, name: session.user.user_metadata?.name || 'Comandante' });
      else {
        setCurrentUser(null);
        setShowOnboarding(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Data Sync
  useEffect(() => {
    if (!session?.user) return;
    const loadData = async () => {
      const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', session.user.id).single();
      if (!profile) setShowOnboarding(true);

      const { data: msgs } = await supabase.from('chat_messages').select('*').eq('user_id', session.user.id).order('timestamp', { ascending: true });
      const { data: earns } = await supabase.from('earnings').select('*').eq('user_id', session.user.id).order('date', { ascending: false });
      const { data: exps } = await supabase.from('expenses').select('*').eq('user_id', session.user.id).order('date', { ascending: false });
      const { data: bls } = await supabase.from('bills').select('*').eq('user_id', session.user.id).order('dueDate', { ascending: true });
      
      if (msgs && msgs.length > 0) setMessages(msgs.map(m => ({ role: m.role, text: m.text, timestamp: m.timestamp })));
      else setMessages([{ role: Role.MODEL, text: `Salve, **${currentUser?.name}**! 🏍️\nComo foi o corre hoje? Manda o valor que eu divido pra você!`, timestamp: new Date().toISOString() }]);
      
      if (earns) setDailyEarnings(earns);
      if (exps) setDailyExpenses(exps);
      if (bls) {
        setBills(bls);
        checkUpcomingBills(bls);
      }
    };
    loadData();
    mentorService.current = new FinancialMentorService();
  }, [session, currentUser, checkUpcomingBills]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Actions
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
    const { error } = await supabase.from('profiles').insert([{ user_id: session.user.id, ...onboardingData }]);
    if (!error) {
      setShowOnboarding(false);
      processAIPrompt(`Acabei de completar meu perfil. Sou entregador há ${onboardingData.experience} e meu maior desafio é ${onboardingData.challenge}. Me dê boas-vindas!`);
    }
  };

  const togglePlatform = (plat: string) => {
    setOnboardingData(p => ({ ...p, platforms: p.platforms.includes(plat) ? p.platforms.filter(x => x !== plat) : [...p.platforms, plat] }));
  };

  const executeFunctionCall = async (call: any) => {
    if (call.name === 'add_bill' && session?.user) {
      const { name, amount, dueDate } = call.args;
      const { data, error } = await supabase.from('bills').insert([{ 
        user_id: session.user.id, name, amount: parseFloat(amount), dueDate, isPaid: false 
      }]).select();
      if (!error && data) {
        setBills(prev => [...prev, data[0]]);
        return `Beleza! Adicionei "${name}" de R$ ${amount} pro dia ${new Date(dueDate + 'T00:00:00').toLocaleDateString('pt-BR')}.`;
      }
    }
    return "Tive um problema ao processar esse comando.";
  };

  const processAIPrompt = async (prompt: string) => {
    if (!mentorService.current || isAILoading || !prompt.trim()) return;
    const userMsg = { role: Role.USER, text: prompt, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setIsAILoading(true);
    if (session?.user) await supabase.from('chat_messages').insert([{ user_id: session.user.id, ...userMsg }]);
    try {
      const response = await mentorService.current.sendMessage(prompt);
      if (response.functionCalls) {
        for (const call of response.functionCalls) {
          const resultText = await executeFunctionCall(call);
          const modelMsg = { role: Role.MODEL, text: resultText, timestamp: new Date().toISOString() };
          setMessages(prev => [...prev, modelMsg]);
          if (session?.user) await supabase.from('chat_messages').insert([{ user_id: session.user.id, ...modelMsg }]);
        }
      } else {
        const modelMsg = { role: Role.MODEL, text: response.text, timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, modelMsg]);
        if (session?.user) await supabase.from('chat_messages').insert([{ user_id: session.user.id, ...modelMsg }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: Role.MODEL, text: "Ops, falhei. Tente de novo!", timestamp: new Date().toISOString() }]);
    } finally { setIsAILoading(false); }
  };

  const toggleBillPaid = async (billId: string, currentStatus: boolean) => {
    const { error } = await supabase.from('bills').update({ isPaid: !currentStatus }).eq('id', billId);
    if (!error) setBills(prev => prev.map(b => b.id === billId ? { ...b, isPaid: !currentStatus } : b));
  };

  const deleteBill = async (billId: string) => {
    const { error } = await supabase.from('bills').delete().eq('id', billId);
    if (!error) setBills(prev => prev.filter(b => b.id !== billId));
  };

  const getDayStatus = (day: number) => {
    const dayStr = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayBills = bills.filter(b => b.dueDate === dayStr);
    if (dayBills.length === 0) return null;
    return dayBills.every(b => b.isPaid) ? 'paid' : 'due';
  };

  const navigateMonth = (step: number) => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + step, 1));
    setSelectedDay(null);
  };

  const setViewMonthYear = (month: number, year: number) => {
    setViewDate(new Date(year, month, 1));
    setIsDatePickerOpen(false);
    setSelectedDay(null);
  };

  const handleSaveDay = async () => {
    const earnVal = parseFloat(tempEarning) || 0;
    const expVal = parseFloat(tempExpense) || 0;
    if ((!earnVal && !expVal) || !session?.user) return;
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
    processAIPrompt(`Hoje o corre rendeu R$ ${earnVal} brutos, gastos de R$ ${expVal}. Sobrou R$ ${earnVal - expVal}. Divisão?`);
  };

  if (isInitialLoading) return <div className="h-screen bg-[#020617] flex items-center justify-center animate-pulse text-emerald-500 font-black">CARREGANDO...</div>;

  if (!currentUser) {
    return (
      <div className="flex flex-col h-screen items-center justify-center p-6 bg-animate text-white">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center">
            <div className="bg-emerald-600 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl"><MotoIcon className="w-10 h-10 text-slate-900" /></div>
            <h1 className="text-4xl font-black italic tracking-tighter uppercase">MotoInvest</h1>
          </div>
          <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 p-8 rounded-[40px] space-y-4">
            <div className="flex bg-white/5 p-1 rounded-2xl">
              <button onClick={() => setAuthMode('login')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase ${authMode === 'login' ? 'bg-emerald-600' : 'text-slate-500'}`}>Entrar</button>
              <button onClick={() => setAuthMode('register')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase ${authMode === 'register' ? 'bg-emerald-600' : 'text-slate-500'}`}>Criar</button>
            </div>
            {authMode === 'register' && <input type="text" placeholder="Nome" value={name} onChange={e => setName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-sm" />}
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-sm" />
            <input type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-sm" />
            {globalError && <p className="text-rose-500 text-[10px] font-bold text-center">{globalError}</p>}
            <button onClick={handleAuth} disabled={isAuthLoading} className="w-full bg-emerald-600 py-4 rounded-2xl font-black uppercase shadow-xl active-scale">
              {isAuthLoading ? '...' : (authMode === 'login' ? 'ACESSAR' : 'CADASTRAR')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <div className="fixed inset-0 z-[100] bg-[#020617] text-white flex flex-col p-6 overflow-y-auto custom-scrollbar">
        <div className="max-w-md mx-auto w-full py-8 space-y-10">
          <div className="text-center">
            <h2 className="text-3xl font-black italic tracking-tighter uppercase text-emerald-500">Perfil Inicial</h2>
          </div>
          <div className="space-y-8">
            <section className="space-y-4">
              <label className="block text-xs font-black uppercase text-slate-400">Qual sua idade?</label>
              <input type="number" value={onboardingData.age} onChange={e => setOnboardingData({...onboardingData, age: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-sm" />
              <label className="block text-xs font-black uppercase text-slate-400 mt-6">Gênero</label>
              <div className="grid grid-cols-2 gap-2">
                {['Homem', 'Mulher', 'Trans', 'Outro'].map(g => (
                  <button key={g} onClick={() => setOnboardingData({...onboardingData, gender: g})} className={`py-3 rounded-xl text-[10px] font-black uppercase ${onboardingData.gender === g ? 'bg-emerald-600' : 'bg-white/5 text-slate-500'}`}>{g}</button>
                ))}
              </div>
            </section>
            <section className="space-y-4">
              <h3 className="text-xs font-black uppercase text-emerald-400 border-b border-emerald-900 pb-2">1. Experiência</h3>
              <div className="space-y-2">
                {['Menos de 6 meses', '6 meses a 2 anos', 'Mais de 2 anos'].map(ex => (
                  <button key={ex} onClick={() => setOnboardingData({...onboardingData, experience: ex})} className={`w-full py-3 rounded-xl text-[10px] font-black uppercase text-left px-4 ${onboardingData.experience === ex ? 'bg-emerald-600' : 'bg-white/5 text-slate-500'}`}>{ex}</button>
                ))}
              </div>
            </section>
            <section className="space-y-4">
              <h3 className="text-xs font-black uppercase text-emerald-400 border-b border-emerald-900 pb-2">4. Segurança</h3>
              <label className="block text-[10px] font-black uppercase text-slate-400">Já sofreu acidente nos últimos 12 meses?</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setOnboardingData({...onboardingData, accident: true})} className={`py-3 rounded-xl text-[10px] font-black uppercase ${onboardingData.accident === true ? 'bg-rose-600' : 'bg-white/5 text-slate-500'}`}>SIM</button>
                <button onClick={() => setOnboardingData({...onboardingData, accident: false})} className={`py-3 rounded-xl text-[10px] font-black uppercase ${onboardingData.accident === false ? 'bg-emerald-600' : 'bg-white/5 text-slate-500'}`}>NÃO</button>
              </div>
              <label className="block text-[10px] font-black uppercase text-slate-400 mt-4">Maior desafio</label>
              <div className="grid grid-cols-2 gap-2">
                {['Trânsito', 'Suporte', 'Infraestrutura', 'Clientes'].map(c => (
                  <button key={c} onClick={() => setOnboardingData({...onboardingData, challenge: c})} className={`py-3 rounded-xl text-[10px] font-black uppercase ${onboardingData.challenge === c ? 'bg-emerald-600' : 'bg-white/5 text-slate-500'}`}>{c}</button>
                ))}
              </div>
            </section>
            <button onClick={handleOnboardingSubmit} className="w-full bg-emerald-600 py-6 rounded-2xl font-black uppercase text-sm shadow-2xl active-scale">FINALIZAR PERFIL</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen text-slate-100 overflow-hidden relative">
      <header className="px-6 py-4 bg-slate-900/60 backdrop-blur-xl border-b border-white/5 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-600 p-2 rounded-xl shadow-lg"><MotoIcon className="w-5 h-5 text-slate-950" /></div>
          <div><h1 className="text-xs font-black uppercase italic tracking-tighter">MotoInvest</h1><p className="text-[9px] text-emerald-400 font-bold uppercase">{currentUser.name}</p></div>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="p-3 bg-white/5 border border-white/10 rounded-xl"><LogoutIcon className="w-4 h-4 text-slate-400" /></button>
      </header>

      <main className="flex-1 overflow-hidden relative z-10">
        {activeTab === 'chat' && (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 custom-scrollbar">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === Role.USER ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}>
                  <div className={`max-w-[90%] p-4 rounded-2xl shadow-xl ${msg.role === Role.USER ? 'bg-emerald-600 text-white rounded-br-none' : 'bg-slate-900/80 backdrop-blur-md border border-white/5 rounded-bl-none'}`}>
                    {msg.role === Role.MODEL && <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/5"><BotIcon className="w-3 h-3 text-emerald-400" /><span className="text-[9px] font-black uppercase text-emerald-400">Mentor IA</span></div>}
                    <MarkdownRenderer content={msg.text} />
                  </div>
                </div>
              ))}
              {isAILoading && <div className="flex items-center gap-2 text-emerald-500 font-black text-[9px] uppercase animate-pulse"><BotIcon className="w-4 h-4" /> Mentor Processando...</div>}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-4 bg-slate-900/80 backdrop-blur-xl border-t border-white/5">
              <div className="flex items-center gap-2 max-w-2xl mx-auto">
                <input type="text" value={inputText} onChange={e => setInputText(e.target.value)} onKeyPress={e => e.key === 'Enter' && processAIPrompt(inputText)} placeholder="Manda o valor ou anota um boleto..." className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm focus:outline-none text-white" />
                <button onClick={() => { processAIPrompt(inputText); setInputText(''); }} disabled={isAILoading || !inputText.trim()} className="bg-emerald-600 p-4 rounded-2xl active-scale"><SendIcon className="w-5 h-5 text-white" /></button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ledger' && (
          <div className="h-full overflow-y-auto p-8 space-y-6 animate-in fade-in duration-500 pb-24">
            <h2 className="text-4xl font-black italic tracking-tighter uppercase">Diária</h2>
            <div className="bg-slate-900/40 border border-white/5 p-6 rounded-[32px] flex justify-between items-center mb-2">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Saldo do Corre</span>
              <span className={`text-2xl font-black ${(parseFloat(tempEarning) || 0) - (parseFloat(tempExpense) || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                R$ {((parseFloat(tempEarning) || 0) - (parseFloat(tempExpense) || 0)).toFixed(2)}
              </span>
            </div>
            <div className="bg-emerald-600/80 p-6 rounded-[32px] shadow-xl border border-white/10 relative overflow-hidden active-scale">
               <label className="block text-[10px] font-black text-white/70 uppercase mb-3">Faturamento Bruto</label>
               <div className="flex items-end gap-2">
                 <span className="text-xl font-black text-white/50 pb-2">R$</span>
                 <input type="number" value={tempEarning} onChange={e => setTempEarning(e.target.value)} placeholder="0,00" className="w-full bg-transparent border-b-2 border-white/20 py-1 text-4xl font-black text-white focus:outline-none" />
               </div>
            </div>
            <div className="bg-rose-600/80 p-6 rounded-[32px] shadow-xl border border-white/10 relative overflow-hidden active-scale">
               <label className="block text-[10px] font-black text-white/70 uppercase mb-3">Gastos do Dia</label>
               <div className="flex items-end gap-2">
                 <span className="text-xl font-black text-white/50 pb-2">R$</span>
                 <input type="number" value={tempExpense} onChange={e => setTempExpense(e.target.value)} placeholder="0,00" className="w-full bg-transparent border-b-2 border-white/20 py-1 text-4xl font-black text-white focus:outline-none" />
               </div>
            </div>
            <button onClick={handleSaveDay} className="w-full mt-4 bg-emerald-600 py-6 rounded-2xl font-black uppercase text-sm shadow-2xl active-scale flex items-center justify-center gap-3">
              <WalletIcon className="w-5 h-5" /> FECHAR E ANALISAR COM IA
            </button>
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="h-full p-8 animate-in fade-in duration-500 overflow-y-auto relative custom-scrollbar">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-4xl font-black italic tracking-tighter uppercase">Agenda</h2>
                <div className="text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => navigateMonth(-1)} className="p-1 hover:bg-white/5 rounded-lg"><ChevronLeftIcon /></button>
                    <button onClick={() => setIsDatePickerOpen(!isDatePickerOpen)} className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl flex items-center gap-2 active-scale">
                      <span className="text-[10px] font-black uppercase text-emerald-400">{MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}</span>
                      <ChevronDownIcon className="w-3 h-3 text-emerald-400" />
                    </button>
                    <button onClick={() => navigateMonth(1)} className="p-1 hover:bg-white/5 rounded-lg"><ChevronRightIcon /></button>
                  </div>
                  <p className="text-lg font-black text-emerald-500 mt-1">R$ {totals.totalEarned.toFixed(2)}</p>
                </div>
             </div>
             {isDatePickerOpen && (
               <div className="absolute top-24 right-8 left-8 z-50 bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-[40px] p-6 shadow-3xl">
                 <div className="grid grid-cols-3 gap-2">
                   {MONTHS.map((m, i) => <button key={m} onClick={() => setViewMonthYear(i, viewDate.getFullYear())} className={`py-3 rounded-xl text-[10px] font-black uppercase ${viewDate.getMonth() === i ? 'bg-emerald-600 text-white' : 'bg-white/5 text-slate-400'}`}>{m.slice(0, 3)}</button>)}
                 </div>
               </div>
             )}
             <div className="bg-white/5 p-6 rounded-[40px] border border-white/5 backdrop-blur-md">
                <div className="grid grid-cols-7 gap-2 mb-4">
                  {DAYS_OF_WEEK.map(d => <span key={d} className="text-[10px] font-black text-slate-600 text-center">{d}</span>)}
                </div>
                <div className="grid grid-cols-7 gap-2">
                   {Array.from({ length: calendarDays.firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
                   {Array.from({ length: calendarDays.daysInMonth }).map((_, i) => {
                     const day = i + 1;
                     const status = getDayStatus(day);
                     return (
                       <button key={day} onClick={() => setSelectedDay(day)} className={`aspect-square flex flex-col items-center justify-center rounded-2xl border transition-all active-scale relative ${selectedDay === day ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/5 bg-white/5'}`}>
                         <span className="text-xs font-black">{day}</span>
                         {status === 'due' && <div className="absolute bottom-1.5 w-1 h-1 rounded-full bg-rose-500 shadow-lg shadow-rose-500/50" />}
                         {status === 'paid' && <div className="absolute bottom-1.5 w-1 h-1 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50" />}
                       </button>
                     );
                   })}
                </div>
             </div>
             
             {/* Weekly Summary - Month View */}
             <div className="mt-10 space-y-8 pb-10">
               <div className="flex items-center gap-3">
                 <CalendarIcon className="w-4 h-4 text-emerald-500" />
                 <h3 className="text-sm font-black uppercase italic tracking-tighter text-slate-400">Resumo de {MONTHS[viewDate.getMonth()]}</h3>
               </div>
               
               {[1, 2, 3, 4, 5].map(week => (
                 billsByWeek[week].length > 0 && (
                   <div key={week} className="space-y-3">
                     <div className="flex items-center gap-2">
                       <span className="h-[1px] flex-1 bg-white/5"></span>
                       <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em]">Semana {week}</h4>
                       <span className="h-[1px] flex-1 bg-white/5"></span>
                     </div>
                     <div className="grid gap-2">
                       {billsByWeek[week].map(bill => (
                         <div key={bill.id} className="bg-slate-900/40 border border-white/5 p-4 rounded-2xl flex justify-between items-center">
                            <div className="flex items-center gap-4">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black ${bill.isPaid ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                {bill.dueDate.split('-')[2]}
                              </div>
                              <p className={`text-[11px] font-bold uppercase tracking-tight ${bill.isPaid ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                                {bill.name}
                              </p>
                            </div>
                            <span className={`text-[10px] font-black ${bill.isPaid ? 'text-slate-600' : 'text-emerald-500'}`}>
                              R$ {bill.amount.toFixed(2)}
                            </span>
                         </div>
                       ))}
                     </div>
                   </div>
                 )
               ))}
               
               {totals.currentBills.length === 0 && (
                 <div className="py-10 text-center bg-white/5 rounded-[32px] border border-dashed border-white/10">
                    <p className="text-[10px] font-black uppercase text-slate-600">Nenhum boleto para este mês.</p>
                 </div>
               )}
             </div>

             {/* Selected Day View - Floating/Overlay style when active */}
             {selectedDay && (
               <div className="fixed inset-0 z-[60] bg-[#020617]/95 backdrop-blur-md p-8 flex flex-col animate-in fade-in duration-300">
                 <div className="flex justify-between items-center mb-10">
                   <h3 className="font-black uppercase italic tracking-tighter text-emerald-500 text-2xl">Dia {selectedDay}</h3>
                   <button onClick={() => setSelectedDay(null)} className="p-3 bg-white/5 rounded-full border border-white/10"><ChevronDownIcon className="w-5 h-5 rotate-180" /></button>
                 </div>
                 <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar">
                   {bills.filter(b => b.dueDate === `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`).map(bill => (
                     <div key={bill.id} className="bg-slate-900 border border-white/5 p-6 rounded-[32px] flex justify-between items-center shadow-2xl">
                       <div>
                         <p className={`font-black uppercase text-base ${bill.isPaid ? 'line-through text-slate-600' : 'text-white'}`}>{bill.name}</p>
                         <p className="text-sm font-bold text-emerald-500 mt-1">R$ {bill.amount.toFixed(2)}</p>
                       </div>
                       <div className="flex items-center gap-3">
                         <button onClick={() => toggleBillPaid(bill.id, bill.isPaid)} className={`px-6 py-3 rounded-2xl text-[10px] font-black ${bill.isPaid ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-800 text-slate-400'}`}>{bill.isPaid ? 'PAGO' : 'PAGAR'}</button>
                         <button onClick={() => deleteBill(bill.id)} className="p-3 text-rose-500 bg-rose-500/10 rounded-2xl"><TrashIcon className="w-5 h-5" /></button>
                       </div>
                     </div>
                   ))}
                   {bills.filter(b => b.dueDate === `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`).length === 0 && (
                     <div className="h-full flex items-center justify-center opacity-30 italic text-sm">Nada pra hoje! 🛵</div>
                   )}
                 </div>
                 <button onClick={() => setSelectedDay(null)} className="w-full mt-6 py-5 bg-emerald-600 rounded-3xl font-black uppercase text-xs">Voltar à Agenda</button>
               </div>
             )}
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="h-full overflow-y-auto p-8 space-y-8 pb-24">
            <h2 className="text-4xl font-black italic tracking-tighter uppercase">Metas</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 p-6 rounded-[32px] border border-white/5 text-center">
                <p className="text-[9px] font-black text-emerald-400 uppercase">Total Ganho</p>
                <p className="text-xl font-black">R$ {totals.totalEarned.toFixed(2)}</p>
              </div>
              <div className="bg-white/5 p-6 rounded-[32px] border border-white/5 text-center">
                <p className="text-[9px] font-black text-rose-400 uppercase">Total Gasto</p>
                <p className="text-xl font-black text-rose-300">R$ {totals.totalSpent.toFixed(2)}</p>
              </div>
            </div>
            <div className="bg-emerald-600/20 p-6 rounded-[32px] border border-emerald-500/20 text-center">
              <p className="text-[10px] font-black uppercase text-emerald-400 tracking-widest mb-1">Lucro Real Acumulado</p>
              <p className="text-3xl font-black">R$ {totals.netProfit.toFixed(2)}</p>
            </div>
          </div>
        )}

        {activeTab === 'help' && (
          <div className="h-full overflow-y-auto p-8 space-y-8 pb-24">
            <h2 className="text-4xl font-black italic tracking-tighter uppercase">Configurações</h2>
            
            <div className="bg-slate-900/40 border border-white/5 p-8 rounded-[40px] space-y-6">
              <div className="flex items-center gap-4">
                <div className={`p-4 rounded-2xl ${notifPermission === 'granted' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-800 text-slate-500'}`}>
                  <BellIcon className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-black uppercase italic tracking-tighter">Lembretes de Boletos</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                    {notifPermission === 'granted' ? 'Ativo - Te aviso 3 dias antes' : 'Desativado'}
                  </p>
                </div>
                {notifPermission !== 'granted' && (
                  <button onClick={requestNotifPermission} className="bg-emerald-600 px-4 py-2 rounded-xl text-[9px] font-black uppercase active-scale">ATIVAR</button>
                )}
              </div>
            </div>

            <div className="bg-emerald-600/10 border border-emerald-500/20 p-8 rounded-[40px] space-y-6">
              <div className="text-center space-y-2">
                <h3 className="text-xl font-black italic uppercase tracking-tighter">Falar com Emerson</h3>
              </div>
              <a href="https://wa.me/5511962952615" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center bg-[#25D366] text-white py-5 rounded-2xl font-black uppercase text-sm shadow-xl active-scale">WhatsApp</a>
            </div>
          </div>
        )}
      </main>

      <nav className="bg-slate-950/80 backdrop-blur-3xl border-t border-white/5 px-2 py-6 flex justify-around items-center sticky bottom-0 z-50">
        {[
          { id: 'chat', icon: BotIcon, label: 'Mentor' },
          { id: 'ledger', icon: WalletIcon, label: 'Corre' },
          { id: 'calendar', icon: CalendarIcon, label: 'Agenda' },
          { id: 'stats', icon: GraphIcon, label: 'Metas' },
          { id: 'help', icon: SupportIcon, label: 'Ajustes' },
        ].map((item) => (
          <button key={item.id} onClick={() => setActiveTab(item.id as any)} className={`flex flex-col items-center gap-2 transition-all px-4 ${activeTab === item.id ? 'text-emerald-400' : 'text-slate-600'}`}>
            <div className={`p-2 rounded-2xl transition-all active-scale ${activeTab === item.id ? 'bg-emerald-500/10 scale-110 shadow-lg' : ''}`}><item.icon className="w-6 h-6" /></div>
            <span className="text-[8px] font-black tracking-widest uppercase">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default App;
