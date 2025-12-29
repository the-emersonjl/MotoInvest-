
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from './services/supabaseClient';
import { FinancialMentorService } from './services/geminiService';
import { Role, Message, Bill, User } from './types';
import { 
  SendIcon, WalletIcon, GraphIcon, MotoIcon, BotIcon, 
  BellIcon, AlertIcon, TrashIcon, CalendarIcon, 
  ChevronDownIcon, LogoutIcon, UserIcon, LockIcon, SupportIcon
} from './components/Icons';
import MarkdownRenderer from './components/MarkdownRenderer';

// --- Constantes ---
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const STRATEGY_CONFIG = [
  { label: 'Essencial (50%)', color: 'bg-emerald-500', pct: 0.5, desc: 'Gasolina, Manutenção, Aluguel' },
  { label: 'Lazer (30%)', color: 'bg-blue-500', pct: 0.3, desc: 'Família, Descanso, Comida' },
  { label: 'Independência (20%)', color: 'bg-purple-500', pct: 0.2, desc: 'Futuro, Moto Nova, Reserva' }
];

const TUTORIAL_STEPS = [
  {
    title: "🤖 Mentor IA",
    content: "O MotoInvest AI analisa seu dia e diz exatamente onde colocar cada centavo.",
    tab: 'chat'
  },
  {
    title: "💰 Salvar Diária",
    content: "Registrou, tá salvo! Suas informações ficam seguras na nuvem do Supabase.",
    tab: 'ledger'
  },
  {
    title: "🗓️ Sua Agenda",
    content: "Acompanhe seus dias de glória (verdes) e dias de luta (vermelhos).",
    tab: 'calendar'
  },
  {
    title: "📊 Metas 50/30/20",
    content: "O app divide seu dinheiro automaticamente para você nunca mais ficar no zero.",
    tab: 'stats'
  }
] as const;

// --- Componentes Auxiliares ---

const LoadingScreen = () => (
  <div className="flex flex-col items-center justify-center h-full space-y-4 animate-pulse">
    <MotoIcon className="w-12 h-12 text-emerald-500" />
    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Sincronizando com a nuvem...</p>
  </div>
);

const EmptyState = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center py-12 text-center px-6">
    <div className="bg-slate-800/50 p-4 rounded-full mb-4">
      <AlertIcon className="w-8 h-8 text-slate-600" />
    </div>
    <p className="text-slate-500 text-sm font-medium italic leading-relaxed">{message}</p>
  </div>
);

// --- Componente Principal ---

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [activeTab, setActiveTab] = useState<'chat' | 'ledger' | 'stats' | 'calendar' | 'help'>('chat');
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [dailyEarnings, setDailyEarnings] = useState<any[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [viewDate, setViewDate] = useState(new Date());

  const [inputText, setInputText] = useState('');
  const [tempEarning, setTempEarning] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);

  const [showTutorialPrompt, setShowTutorialPrompt] = useState(false);
  const [activeTutorialStep, setActiveTutorialStep] = useState<number | null>(null);

  const mentorService = useRef<FinancialMentorService | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const totals = useMemo(() => {
    const currentMonth = viewDate.getMonth();
    const currentYear = viewDate.getFullYear();

    const earnings = dailyEarnings.filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const currentBills = bills.filter(b => {
      const d = new Date(b.dueDate);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const totalEarned = earnings.reduce((acc, curr) => acc + Number(curr.value), 0);
    const totalBills = currentBills.reduce((acc, curr) => acc + curr.amount, 0);
    const unpaidCount = currentBills.filter(b => !b.isPaid).length;

    return { totalEarned, totalBills, unpaidCount, earnings, currentBills };
  }, [dailyEarnings, bills, viewDate]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setGlobalError("Configuração do Supabase pendente.");
      setIsInitialLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        setCurrentUser({ email: session.user.email!, name: session.user.user_metadata?.name || 'Comandante' });
        checkFirstTime(session.user.id);
      }
      setIsInitialLoading(false);
    }).catch(err => {
      setGlobalError("Erro na conexão inicial.");
      setIsInitialLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session?.user) {
        setCurrentUser({ email: session.user.email!, name: session.user.user_metadata?.name || 'Comandante' });
        if (event === 'SIGNED_IN') checkFirstTime(session.user.id);
      } else {
        setCurrentUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user || !isSupabaseConfigured()) return;
    
    const loadAppData = async () => {
      const userId = session.user.id;
      try {
        const [msgsRes, earnsRes, billsRes] = await Promise.all([
          supabase.from('chat_messages').select('*').eq('user_id', userId).order('timestamp', { ascending: true }),
          supabase.from('earnings').select('*').eq('user_id', userId).order('date', { ascending: false }),
          supabase.from('bills').select('*').eq('user_id', userId).order('dueDate', { ascending: true })
        ]);

        if (msgsRes.data && msgsRes.data.length > 0) {
          setMessages(msgsRes.data.map(m => ({ role: m.role, text: m.text, timestamp: m.timestamp })));
        } else {
          setMessages([{
            role: Role.MODEL,
            text: `Fala, **${currentUser?.name}**! 🚀\nPronto para organizar o corre de hoje?\n\nRegistre seu ganho ou me pergunte qualquer coisa!`,
            timestamp: new Date().toISOString()
          }]);
        }
        
        if (earnsRes.data) setDailyEarnings(earnsRes.data);
        if (billsRes.data) setBills(billsRes.data);

      } catch (err) {
        console.error("Erro ao carregar dados:", err);
      }
    };

    loadAppData();
    if (process.env.API_KEY) mentorService.current = new FinancialMentorService(process.env.API_KEY);
  }, [session, currentUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTab]);

  const checkFirstTime = (userId: string) => {
    if (!localStorage.getItem(`motoinvest_v2_tutorial_${userId}`)) setShowTutorialPrompt(true);
  };

  const startTutorial = () => { setShowTutorialPrompt(false); setActiveTutorialStep(0); setActiveTab(TUTORIAL_STEPS[0].tab); };
  const nextTutorialStep = () => {
    if (activeTutorialStep !== null && activeTutorialStep < TUTORIAL_STEPS.length - 1) {
      const next = activeTutorialStep + 1;
      setActiveTutorialStep(next);
      setActiveTab(TUTORIAL_STEPS[next].tab);
    } else {
      finishTutorial();
    }
  };
  const finishTutorial = () => {
    if (session?.user) localStorage.setItem(`motoinvest_v2_tutorial_${session.user.id}`, 'true');
    setActiveTutorialStep(null);
    setActiveTab('chat');
  };

  const handleAuth = async () => {
    setIsAuthLoading(true);
    setGlobalError(null);
    try {
      if (authMode === 'register') {
        const { error } = await supabase.auth.signUp({ 
          email, 
          password, 
          options: { data: { name } } 
        });
        if (error) throw error;
        setAuthMode('login');
        alert("Conta criada! Verifique seu e-mail ou faça login.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) { 
      setGlobalError(err.message); 
    } finally { 
      setIsAuthLoading(false); 
    }
  };

  const processAIPrompt = async (prompt: string) => {
    if (!mentorService.current || isAILoading || !prompt.trim()) return;
    
    const userMsg = { role: Role.USER, text: prompt, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setIsAILoading(true);

    if (session?.user) await supabase.from('chat_messages').insert([{ user_id: session.user.id, ...userMsg }]);

    try {
      const modelMsg = { role: Role.MODEL, text: '', timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, modelMsg]);
      let fullText = '';
      
      for await (const chunk of mentorService.current.sendMessageStream(prompt)) {
        fullText += chunk;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...modelMsg, text: fullText };
          return updated;
        });
      }
      
      if (session?.user) await supabase.from('chat_messages').insert([{ user_id: session.user.id, role: Role.MODEL, text: fullText, timestamp: modelMsg.timestamp }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: Role.MODEL, text: "Ops, falhei na conexão. Tente novamente.", timestamp: new Date().toISOString() }]);
    } finally { setIsAILoading(false); }
  };

  const handleAddEarning = async () => {
    const val = parseFloat(tempEarning);
    if (isNaN(val) || val <= 0 || !session?.user) return;

    try {
      const date = new Date().toLocaleDateString('en-CA');
      const { data, error } = await supabase.from('earnings').insert([{ user_id: session.user.id, value: val, date }]).select();
      if (error) throw error;
      if (data) setDailyEarnings(prev => [data[0], ...prev]);
      setTempEarning('');
      setActiveTab('chat');
      processAIPrompt(`Fiz R$ ${val.toFixed(2)} hoje. Como devo dividir?`);
    } catch (e) { 
      setGlobalError("Erro ao salvar diária."); 
    }
  };

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  if (isInitialLoading) return <div className="h-screen bg-[#020617] flex items-center justify-center"><LoadingScreen /></div>;

  if (!currentUser) {
    return (
      <div className="flex flex-col h-screen items-center justify-center p-6 text-slate-100 bg-animate">
        <div className="w-full max-w-sm space-y-8 animate-in fade-in zoom-in-95 duration-700">
          <div className="text-center">
            <div className="bg-emerald-600 w-16 h-16 rounded-[22px] flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-emerald-500/20 active-scale">
              <MotoIcon className="w-10 h-10 text-slate-950" />
            </div>
            <h1 className="text-4xl font-black italic tracking-tighter uppercase">MotoInvest</h1>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.3em] mt-2">Sua liberdade sobre duas rodas</p>
          </div>

          <div className="bg-slate-900/50 backdrop-blur-2xl border border-white/5 p-8 rounded-[40px] shadow-3xl space-y-6">
            <div className="flex bg-white/5 p-1.5 rounded-2xl">
              <button onClick={() => setAuthMode('login')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase transition-all ${authMode === 'login' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500'}`}>Entrar</button>
              <button onClick={() => setAuthMode('register')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase transition-all ${authMode === 'register' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500'}`}>Criar</button>
            </div>

            <div className="space-y-4">
              {authMode === 'register' && (
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 w-4 h-4" />
                  <input type="text" placeholder="Nome Completo" value={name} onChange={e => setName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-white" />
                </div>
              )}
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 w-4 h-4" />
                <input type="email" placeholder="Seu melhor e-mail" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-white" />
              </div>
              <div className="relative">
                <LockIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 w-4 h-4" />
                <input type="password" placeholder="Sua senha secreta" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-white" />
              </div>

              {globalError && <p className="text-[10px] font-black text-rose-500 uppercase text-center bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">{globalError}</p>}

              <button onClick={handleAuth} disabled={isAuthLoading} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-5 rounded-2xl font-black text-lg active-scale shadow-xl disabled:opacity-50">
                {isAuthLoading ? 'AGUARDE...' : (authMode === 'login' ? 'ACESSAR' : 'CADASTRAR')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen text-slate-100 overflow-hidden relative">
      {/* Tutorial Overlay */}
      {showTutorialPrompt && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-lg flex items-center justify-center p-6 animate-in fade-in duration-500">
          <div className="bg-slate-900 border border-emerald-500/30 p-10 rounded-[50px] shadow-4xl text-center space-y-6 max-w-sm">
            <div className="bg-emerald-500/20 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
              <BotIcon className="w-12 h-12 text-emerald-400" />
            </div>
            <h2 className="text-3xl font-black italic tracking-tighter uppercase">Bem-vindo, Chefe!</h2>
            <p className="text-slate-400 text-sm font-medium">O MotoInvest é o braço direito do motoboy. Quer ver como funciona?</p>
            <div className="flex flex-col gap-3 pt-6">
              <button onClick={startTutorial} className="bg-emerald-600 py-5 rounded-2xl font-black uppercase text-sm shadow-2xl active-scale">MOSTRA O CAMINHO!</button>
              <button onClick={finishTutorial} className="py-2 text-slate-600 font-bold text-xs uppercase tracking-[0.2em]">Pular e ir pro corre</button>
            </div>
          </div>
        </div>
      )}

      {activeTutorialStep !== null && (
        <div className="fixed inset-0 z-[100] pointer-events-none">
          <div className="absolute bottom-[140px] left-6 right-6 pointer-events-auto animate-in slide-in-from-bottom-8 duration-500">
            <div className="bg-slate-900 border-2 border-emerald-500 p-8 rounded-[40px] shadow-4xl space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-emerald-400 uppercase italic tracking-tighter">{TUTORIAL_STEPS[activeTutorialStep].title}</h3>
                <span className="text-[10px] font-black text-slate-600">{activeTutorialStep + 1}/4</span>
              </div>
              <p className="text-slate-300 text-sm font-medium leading-relaxed">{TUTORIAL_STEPS[activeTutorialStep].content}</p>
              <button onClick={nextTutorialStep} className="w-full bg-emerald-600 py-4 rounded-2xl font-black uppercase text-sm active-scale">
                {activeTutorialStep === 3 ? 'FINALIZAR' : 'PRÓXIMO PASSO'}
              </button>
            </div>
          </div>
          <div className="absolute inset-0 bg-black/60 -z-10"></div>
        </div>
      )}

      {/* Header */}
      <header className="px-6 py-4 bg-slate-900/60 backdrop-blur-xl border-b border-white/5 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-600 p-2 rounded-xl shadow-lg active-scale">
            <MotoIcon className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <h1 className="text-xs font-black uppercase italic tracking-tighter">MotoInvest</h1>
            <p className="text-[9px] text-emerald-400 font-bold uppercase">{currentUser.name.split(' ')[0]}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-white/5 border border-white/10 px-4 py-1.5 rounded-2xl text-right">
            <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest">{MONTHS[viewDate.getMonth()]}</p>
            <p className="text-xs font-black text-white">R$ {totals.totalEarned.toLocaleString('pt-BR')}</p>
          </div>
          <button onClick={logout} className="p-3 bg-white/5 border border-white/10 rounded-xl active-scale"><LogoutIcon className="w-4 h-4 text-slate-400" /></button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative z-10">
        {activeTab === 'chat' && (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 custom-scrollbar">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === Role.USER ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-4`}>
                  <div className={`max-w-[90%] p-4 rounded-2xl shadow-xl ${
                    msg.role === Role.USER ? 'bg-emerald-600 text-white rounded-br-none' : 'bg-slate-900/80 backdrop-blur-md border border-white/5 rounded-bl-none'
                  }`}>
                    {msg.role === Role.MODEL && (
                      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/5">
                        <BotIcon className="w-3 h-3 text-emerald-400" />
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400">Mentor IA</span>
                      </div>
                    )}
                    <MarkdownRenderer content={msg.text} />
                  </div>
                </div>
              ))}
              {isAILoading && (
                <div className="flex items-center gap-2 text-emerald-500 font-black text-[9px] uppercase tracking-widest animate-pulse">
                  <BotIcon className="w-4 h-4" /> Mentor Pensando...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            
            <div className="p-4 bg-slate-900/80 backdrop-blur-xl border-t border-white/5">
              <div className="flex items-center gap-2 max-w-2xl mx-auto">
                <input 
                  type="text" 
                  value={inputText} 
                  onChange={e => setInputText(e.target.value)} 
                  onKeyPress={e => e.key === 'Enter' && !isAILoading && (processAIPrompt(inputText), setInputText(''))} 
                  placeholder="Dúvida ou diária..." 
                  className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-white" 
                />
                <button 
                  onClick={() => { processAIPrompt(inputText); setInputText(''); }}
                  disabled={isAILoading || !inputText.trim()}
                  className="bg-emerald-600 p-4 rounded-2xl active-scale disabled:opacity-30"
                >
                  <SendIcon className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ledger' && (
          <div className="h-full overflow-y-auto p-8 space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            <h2 className="text-4xl font-black italic tracking-tighter uppercase">Diária</h2>
            <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 p-8 rounded-[40px] shadow-2xl relative overflow-hidden group active-scale">
               <div className="absolute top-0 right-0 p-6 opacity-20"><WalletIcon className="w-16 h-16" /></div>
               <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-4">Faturamento de Hoje</label>
               <div className="flex items-end gap-2">
                 <span className="text-2xl font-black text-white/50 pb-2">R$</span>
                 <input 
                   type="number" 
                   value={tempEarning} 
                   onChange={e => setTempEarning(e.target.value)} 
                   placeholder="0,00" 
                   className="w-full bg-transparent border-b-2 border-white/20 py-2 text-5xl font-black text-white focus:outline-none focus:border-white" 
                 />
               </div>
               <button onClick={handleAddEarning} className="w-full mt-8 bg-slate-950/80 backdrop-blur py-5 rounded-2xl font-black uppercase text-sm shadow-xl active-scale">SALVAR NA NUVEM</button>
            </div>

            <div className="space-y-4 pb-24">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Histórico Recente</h3>
              {totals.earnings.length > 0 ? totals.earnings.slice(0, 10).map((earn, i) => (
                <div key={earn.id || i} className="flex justify-between items-center bg-white/5 p-5 rounded-3xl border border-white/5 active-scale">
                  <div>
                    <p className="text-white font-black text-lg">R$ {Number(earn.value).toFixed(2)}</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">{new Date(earn.date).toLocaleDateString('pt-BR', { weekday: 'long' })}</p>
                  </div>
                  <div className="bg-emerald-500/10 px-3 py-1 rounded-lg text-emerald-500 text-[9px] font-black uppercase">{new Date(earn.date).toLocaleDateString('pt-BR')}</div>
                </div>
              )) : <EmptyState message="Nenhuma diária registrada este mês." />}
            </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="h-full overflow-y-auto p-8 space-y-8 animate-in fade-in duration-500 pb-24">
            <h2 className="text-4xl font-black italic tracking-tighter uppercase">Metas</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 p-6 rounded-[32px] border border-white/5">
                <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Total {MONTHS[viewDate.getMonth()]}</p>
                <p className="text-2xl font-black">R$ {totals.totalEarned.toFixed(2)}</p>
              </div>
              <div className="bg-white/5 p-6 rounded-[32px] border border-white/5">
                <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">Média Diária</p>
                <p className="text-2xl font-black">R$ {totals.earnings.length > 0 ? (totals.totalEarned / totals.earnings.length).toFixed(2) : '0'}</p>
              </div>
            </div>

            <div className="bg-slate-900/50 p-8 rounded-[40px] border border-white/5 space-y-8 shadow-2xl">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest text-center">Estratégia 50/30/20</h3>
              {STRATEGY_CONFIG.map((item, i) => {
                const amount = totals.totalEarned * item.pct;
                return (
                  <div key={i} className="space-y-3">
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-sm font-black uppercase italic tracking-tighter">{item.label}</p>
                        <p className="text-[9px] text-slate-500 font-bold uppercase">{item.desc}</p>
                      </div>
                      <p className="text-lg font-black text-white">R$ {amount.toFixed(2)}</p>
                    </div>
                    <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className={`${item.color} h-full transition-all duration-1000 shadow-lg`} 
                        style={{ width: totals.totalEarned > 0 ? `${item.pct * 100}%` : '0%' }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="h-full p-8 animate-in fade-in duration-500 overflow-y-auto">
             <h2 className="text-4xl font-black italic tracking-tighter uppercase mb-6">Agenda</h2>
             <div className="bg-white/5 p-6 rounded-[40px] border border-white/5 backdrop-blur-md mb-24">
                <div className="grid grid-cols-7 gap-2 mb-6">
                  {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(d => <span key={d} className="text-[9px] font-black text-slate-600 text-center">{d}</span>)}
                </div>
                <div className="grid grid-cols-7 gap-2">
                   {Array.from({ length: 31 }).map((_, i) => (
                     <div key={i} className={`aspect-square flex items-center justify-center rounded-xl border border-white/5 bg-white/5 text-[10px] font-black active-scale`}>
                       {i + 1}
                     </div>
                   ))}
                </div>
             </div>
          </div>
        )}

        {activeTab === 'help' && (
          <div className="h-full overflow-y-auto p-8 space-y-8 animate-in fade-in duration-500 pb-24">
            <h2 className="text-4xl font-black italic tracking-tighter uppercase">Suporte</h2>
            <div className="bg-emerald-600/10 border border-emerald-500/20 p-8 rounded-[40px] space-y-6">
              <div className="text-center space-y-2">
                <h3 className="text-xl font-black italic uppercase tracking-tighter">Falar com Emerson</h3>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Criador do MotoInvest</p>
              </div>
              <div className="grid gap-3">
                <a href="https://wa.me/5511962952615" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center bg-[#25D366] text-white py-5 rounded-2xl font-black uppercase text-sm shadow-xl active-scale">WhatsApp</a>
                <a href="mailto:the.emersonjl@gmail.com" className="flex items-center justify-center bg-white/5 border border-white/10 text-white py-5 rounded-2xl font-black uppercase text-sm active-scale">E-mail</a>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer Navigation */}
      <nav className="bg-slate-950/80 backdrop-blur-3xl border-t border-white/5 px-2 py-6 flex justify-around items-center sticky bottom-0 z-50">
        {[
          { id: 'chat', icon: BotIcon, label: 'Mentor' },
          { id: 'ledger', icon: WalletIcon, label: 'Corre' },
          { id: 'calendar', icon: CalendarIcon, label: 'Agenda' },
          { id: 'stats', icon: GraphIcon, label: 'Metas' },
          { id: 'help', icon: SupportIcon, label: 'Ajuda' },
        ].map((item) => (
          <button 
            key={item.id} 
            onClick={() => setActiveTab(item.id as any)} 
            className={`flex flex-col items-center gap-2 transition-all px-4 ${activeTab === item.id ? 'text-emerald-400' : 'text-slate-600'}`}
          >
            <div className={`p-2 rounded-2xl transition-all active-scale ${activeTab === item.id ? 'bg-emerald-500/10 scale-110 shadow-lg' : ''}`}>
              <item.icon className="w-6 h-6" />
            </div>
            <span className="text-[8px] font-black tracking-widest uppercase">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default App;
