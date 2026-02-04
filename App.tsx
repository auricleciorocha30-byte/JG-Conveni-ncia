
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import HeaderComp from './components/Header';
import MenuItem from './components/MenuItem';
import Cart from './components/Cart';
import AdminPanel from './components/AdminPanel';
import { MENU_ITEMS as STATIC_MENU, INITIAL_TABLES, STORE_INFO } from './constants';
import { Product, CartItem, Table, Order, Category, Coupon, StoreConfig, DailySpecial } from './types';
import { supabase } from './lib/supabase';
import { CloseIcon, GasIcon, StarIcon } from './components/Icons';

const DAYS_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const App: React.FC = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [isLoadingLogin, setIsLoadingLogin] = useState(false);
  
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  
  const [tables, setTables] = useState<Table[]>(INITIAL_TABLES);
  const [menuItems, setMenuItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCoupons, setActiveCoupons] = useState<Coupon[]>([]);
  const [dailySpecials, setDailySpecials] = useState<DailySpecial[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [dbStatus, setDbStatus] = useState<'loading' | 'ok' | 'error' | 'syncing'>('loading');
  const [activeAlert, setActiveAlert] = useState<{ id: number; type: string; msg: string; isUpdate?: boolean; timestamp: number } | null>(null);
  
  const [storeConfig, setStoreConfig] = useState<StoreConfig>({
    tablesEnabled: true,
    deliveryEnabled: true,
    counterEnabled: true,
    statusPanelEnabled: false
  });

  const [currentView, setCurrentView] = useState<'login' | 'admin' | 'menu' | 'tv'>('login');
  const [showCustomerStatusPanel, setShowCustomerStatusPanel] = useState(true);

  const notificationSound = useRef<HTMLAudioElement | null>(null);
  const lastNotifiedOrderId = useRef<string | null>(null);
  const lastNotifiedStatus = useRef<string | null>(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'tv') setCurrentView('tv');
      else if (params.get('view') === 'menu') setCurrentView('menu');

      notificationSound.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      notificationSound.current.load();
    } catch (e) {
      console.error("Audio init error", e);
    }
  }, []);

  const handleUnlockAudio = useCallback(() => {
    if (!audioUnlocked && notificationSound.current) {
      notificationSound.current.play()
        .then(() => {
          notificationSound.current?.pause();
          if (notificationSound.current) notificationSound.current.currentTime = 0;
          setAudioUnlocked(true);
        })
        .catch(err => console.warn("Aguardando interação...", err));
    }
  }, [audioUnlocked]);

  const testSound = () => {
    if (notificationSound.current) {
      notificationSound.current.currentTime = 0;
      notificationSound.current.play().catch(e => alert("Clique na tela primeiro para autorizar o som!"));
    }
  };

  const fetchData = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setDbStatus('loading');
      
      const [catRes, coupRes, prodRes, tableRes, configRes, specialRes] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('coupons').select('*').eq('is_active', true),
        supabase.from('products').select('*').order('name'),
        supabase.from('tables').select('*').order('id'),
        supabase.from('store_config').select('*').maybeSingle(),
        supabase.from('daily_specials').select('*')
      ]);

      if (configRes.data) {
        setStoreConfig({
          tablesEnabled: configRes.data.tables_enabled ?? true,
          deliveryEnabled: configRes.data.delivery_enabled ?? true,
          counterEnabled: configRes.data.counter_enabled ?? true,
          statusPanelEnabled: configRes.data.status_panel_enabled ?? false
        });
      }

      if (specialRes.data) setDailySpecials(specialRes.data);
      if (catRes.data) setCategories(catRes.data);
      if (coupRes.data) setActiveCoupons(coupRes.data.map((c: any) => ({ id: c.id, code: c.code, percentage: c.percentage, isActive: c.is_active, scopeType: c.scope_type, scopeValue: c.scope_value })));
      
      if (prodRes.data && prodRes.data.length > 0) {
        setMenuItems(prodRes.data.map((p: any) => ({ id: p.id, name: p.name, description: p.description || '', price: Number(p.price), category: p.category, image: p.image, isAvailable: p.is_available ?? true })));
      } else {
        setMenuItems(STATIC_MENU);
      }
      
      if (tableRes.data && tableRes.data.length > 0) {
        setTables(prev => {
          const merged = [...INITIAL_TABLES];
          tableRes.data?.forEach((dbT: any) => {
            const idx = merged.findIndex(t => t.id === dbT.id);
            if (idx >= 0) merged[idx] = { id: dbT.id, status: dbT.status, currentOrder: dbT.current_order };
            else merged.push({ id: dbT.id, status: dbT.status, currentOrder: dbT.current_order });
          });
          return merged.sort((a,b) => a.id - b.id);
        });
      }
      setDbStatus('ok');
    } catch (err) { 
      console.error("Fetch error:", err);
      setDbStatus('error'); 
    }
  }, []);

  useEffect(() => {
    const checkInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) { 
          setIsLoggedIn(true); 
          setIsAdmin(true);
          if (currentView === 'login') setCurrentView('admin');
        }
      } catch (e) {
        console.error("Session check error", e);
      }
      fetchData();
    };
    checkInitialSession();
  }, [fetchData]);

  useEffect(() => {
    const channel = supabase.channel('jg_realtime_v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, (payload) => {
        const newRec = payload.new as any;
        const oldRec = payload.old as any;
        if (payload.eventType === 'DELETE' && oldRec) {
           setTables(current => current.map(t => t.id === oldRec.id ? { id: oldRec.id, status: 'free', currentOrder: null } : t));
           return;
        }
        if (!newRec) return;
        setTables(current => {
          const exists = current.find(t => t.id === newRec.id);
          if (exists) {
            return current.map(t => t.id === newRec.id ? { id: newRec.id, status: newRec.status, currentOrder: newRec.current_order } : t);
          } else {
            return [...current, { id: newRec.id, status: newRec.status, currentOrder: newRec.current_order }].sort((a,b) => a.id - b.id);
          }
        });

        if (newRec.status === 'occupied' && newRec.current_order) {
          const orderId = newRec.current_order.id;
          const status = newRec.current_order.status;
          const tableType = newRec.id >= 950 ? 'Balcão' : newRec.id >= 900 ? 'Entrega' : 'Mesa';
          if (orderId !== lastNotifiedOrderId.current) {
            lastNotifiedOrderId.current = orderId;
            lastNotifiedStatus.current = status;
            if ((isAdmin || currentView === 'tv') && audioEnabled && notificationSound.current) {
              notificationSound.current.currentTime = 0;
              notificationSound.current.play().catch(() => {});
            }
            if (isAdmin) {
              setActiveAlert({ id: newRec.id, type: tableType, msg: 'Novo Pedido!', timestamp: Date.now() });
              setTimeout(() => setActiveAlert(null), 10000);
            }
          } 
          else if (isAdmin && status !== lastNotifiedStatus.current) {
            lastNotifiedStatus.current = status;
            const statusLabels: any = { pending: 'Pendente', preparing: 'Em Preparo', ready: 'Pronto p/ Entrega', delivered: 'Entregue' };
            setActiveAlert({ id: newRec.id, type: tableType, msg: `Status: ${statusLabels[status] || status}`, isUpdate: true, timestamp: Date.now() });
            setTimeout(() => setActiveAlert(null), 6000);
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_config' }, (payload) => {
        const newCfg = payload.new as any;
        if (newCfg) {
          setStoreConfig({
            tablesEnabled: newCfg.tables_enabled,
            deliveryEnabled: newCfg.delivery_enabled,
            counterEnabled: newCfg.counter_enabled,
            statusPanelEnabled: newCfg.status_panel_enabled
          });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => fetchData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_specials' }, () => fetchData(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [audioEnabled, fetchData, isAdmin, currentView]);

  const handlePlaceOrder = async (order: Order) => {
    try {
      let targetId = order.tableId;
      if (targetId === -900 || targetId === -950) {
        const range = targetId === -900 ? [900, 949] : [950, 999];
        const free = tables.find(t => t.id >= range[0] && t.id <= range[1] && t.status === 'free');
        targetId = free ? free.id : (Math.max(...tables.filter(t => t.id >= range[0] && t.id <= range[1]).map(t => t.id), range[0] - 1) + 1);
      }
      const finalTableId = Number(targetId);
      const { error } = await supabase.from('tables').upsert({ id: finalTableId, status: 'occupied', current_order: { ...order, tableId: finalTableId } }, { onConflict: 'id' });
      if (error) {
        alert(`❌ Erro: ${error.message}`);
        return false;
      } else {
        setCartItems([]);
        return true;
      }
    } catch (e) {
      console.error("Order error", e);
      return false;
    }
  };

  const isStoreClosed = !storeConfig.tablesEnabled && !storeConfig.deliveryEnabled && !storeConfig.counterEnabled;
  const categoryNames = useMemo(() => ['Todos', ...(categories || []).map(c => c.name)], [categories]);
  const filteredItems = useMemo(() => (menuItems || []).filter(i => selectedCategory === 'Todos' || i.category === selectedCategory), [menuItems, selectedCategory]);
  
  const todaySpecialItem = useMemo(() => {
    const today = new Date().getDay(); // 0-6
    const config = dailySpecials.find(s => s.day_of_week === today);
    if (!config || !config.product_id) return null;
    return menuItems.find(p => p.id === config.product_id && p.isAvailable) || null;
  }, [dailySpecials, menuItems]);

  const weeklySchedule = useMemo(() => {
    // Retorna apenas os dias que possuem produto agendado
    return dailySpecials
      .filter(s => s.product_id !== null)
      .map(s => {
        const product = menuItems.find(p => p.id === s.product_id);
        return { day: s.day_of_week, product };
      })
      .filter(item => item.product !== undefined)
      .sort((a, b) => {
        // Ordena começando por segunda (1) até domingo (0)
        const order = [1, 2, 3, 4, 5, 6, 0];
        return order.indexOf(a.day) - order.indexOf(b.day);
      });
  }, [dailySpecials, menuItems]);

  const activeStatusOrders = useMemo(() => tables.filter(t => t.status === 'occupied' && t.currentOrder && t.currentOrder.status !== 'delivered' && (t.id <= 12 || t.id >= 950)).map(t => t.currentOrder!).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), [tables]);
  const statusLabel = (s: string) => ({ pending: 'Pendente', preparing: 'Preparando', ready: 'PRONTO! 🚀' }[s] || s);

  if (currentView === 'login') {
    return (
      <div className="min-h-screen bg-yellow-400 flex items-center justify-center p-6" onClick={handleUnlockAudio}>
        <div className="absolute inset-0 opacity-10 bg-[url('https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&q=80&w=1974')] bg-cover bg-center"></div>
        <div className="bg-white p-12 rounded-[4rem] w-full max-w-md text-center animate-in zoom-in shadow-2xl relative z-10 border-b-8 border-blue-950">
           <div className="bg-blue-950 w-20 h-20 rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-xl rotate-3">
              <GasIcon size={40} className="text-yellow-400" />
           </div>
           <h2 className="text-3xl font-black mb-2 italic uppercase tracking-tighter text-blue-950">{STORE_INFO.name}</h2>
           <p className="text-[10px] font-black uppercase text-blue-900/60 tracking-widest mb-8">Administração</p>
           <form onSubmit={async (e) => {
             e.preventDefault(); setIsLoadingLogin(true);
             try {
               const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPass });
               if (!error && data.session) { setIsLoggedIn(true); setIsAdmin(true); setCurrentView('admin'); fetchData(); }
               else alert('Acesso Negado. Verifique os dados.');
             } catch (err) { alert('Erro de conexão com servidor.'); }
             setIsLoadingLogin(false);
           }} className="space-y-4">
              <input type="email" placeholder="E-MAIL" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} className="w-full bg-yellow-50 border-2 border-yellow-200 rounded-2xl px-6 py-4 text-xs font-black uppercase outline-none focus:border-blue-950 transition-all text-blue-950" required />
              <input type="password" placeholder="SENHA" value={loginPass} onChange={e => setLoginPass(e.target.value)} className="w-full bg-yellow-50 border-2 border-yellow-200 rounded-2xl px-6 py-4 text-xs font-black uppercase outline-none focus:border-blue-950 transition-all text-blue-950" required />
              <button type="submit" disabled={isLoadingLogin} className="w-full bg-blue-950 text-yellow-400 font-black py-5 rounded-2xl uppercase text-[11px] tracking-widest shadow-xl hover:brightness-110 active:scale-95 transition-all">
                {isLoadingLogin ? 'Autenticando...' : 'Acessar Painel'}
              </button>
           </form>
           <p className="mt-8 text-[9px] text-blue-950/40 uppercase font-black tracking-widest">© 2024 {STORE_INFO.name.toUpperCase()} - 24H</p>
        </div>
      </div>
    );
  }

  // ... (TV view remains same) ...

  return (
    <div className="min-h-screen bg-yellow-50 flex flex-col font-sans relative" onClick={handleUnlockAudio}>
      <HeaderComp />
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 -mt-8 relative z-20 flex-1 pb-40">
        {!isStoreClosed && (
          <>
            {/* Destaque de Hoje */}
            {todaySpecialItem && (
               <div className="bg-white p-1 rounded-[3rem] shadow-2xl border-4 border-yellow-400 mb-12 overflow-hidden group">
                  <div className="flex flex-col md:flex-row items-center">
                    <div className="w-full md:w-2/5 aspect-[4/3] md:aspect-square overflow-hidden relative">
                       <img src={todaySpecialItem.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="Especial" />
                       <div className="absolute top-6 left-6 bg-blue-950 text-yellow-400 px-6 py-2 rounded-full font-black uppercase text-[10px] shadow-2xl flex items-center gap-2">
                          <StarIcon size={16} /> Especial de Hoje
                       </div>
                    </div>
                    <div className="w-full md:w-3/5 p-8 md:p-12">
                       <h2 className="text-3xl font-black italic uppercase text-blue-950 mb-3 tracking-tighter leading-none">{todaySpecialItem.name}</h2>
                       <p className="text-blue-900/50 text-sm font-bold uppercase italic mb-8 leading-relaxed line-clamp-2">{todaySpecialItem.description}</p>
                       <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-black uppercase text-blue-900/30 tracking-widest mb-1">Oferta Exclusiva</p>
                            <p className="text-4xl font-black italic text-blue-950 leading-none">R$ {todaySpecialItem.price.toFixed(2).replace('.', ',')}</p>
                          </div>
                          <button 
                            onClick={() => setCartItems(prev => { 
                              const ex = prev.find(i => i.id === todaySpecialItem!.id); 
                              if (ex) return prev.map(i => i.id === todaySpecialItem!.id ? {...i, quantity: i.quantity + 1} : i); 
                              return [...prev, { ...todaySpecialItem!, quantity: 1 }]; 
                            })}
                            className="bg-blue-950 text-yellow-400 px-8 py-4 rounded-2xl font-black uppercase text-[11px] shadow-xl hover:scale-105 active:scale-95 transition-all"
                          >
                            Pedir Agora +
                          </button>
                       </div>
                    </div>
                  </div>
               </div>
            )}

            {/* Cronograma da Semana (Opcional - Visível se houver agendamento) */}
            {weeklySchedule.length > 0 && (
              <div className="mb-12 bg-blue-950 rounded-[3rem] p-8 shadow-2xl border-b-8 border-yellow-400">
                 <div className="flex items-center gap-4 mb-8">
                    <div className="bg-yellow-400 p-2 rounded-xl rotate-6"><StarIcon size={20} className="text-blue-950" /></div>
                    <h3 className="text-xl font-black italic uppercase text-yellow-400 tracking-tighter">Cronograma de Ofertas</h3>
                 </div>
                 <div className="flex overflow-x-auto gap-4 no-scrollbar pb-2">
                   {weeklySchedule.map(item => {
                     const isToday = new Date().getDay() === item.day;
                     return (
                       <div key={item.day} className={`shrink-0 w-44 p-5 rounded-3xl border-2 transition-all ${isToday ? 'bg-yellow-400 border-white scale-105 shadow-xl' : 'bg-blue-900/40 border-blue-800'}`}>
                          <p className={`text-[10px] font-black uppercase mb-3 ${isToday ? 'text-blue-950' : 'text-yellow-400/60'}`}>{DAYS_NAMES[item.day]}</p>
                          <img src={item.product?.image} className="w-full aspect-video rounded-xl object-cover mb-3 shadow-md" />
                          <p className={`font-black text-[10px] uppercase truncate ${isToday ? 'text-blue-950' : 'text-white'}`}>{item.product?.name}</p>
                          <p className={`text-[11px] font-black italic mt-1 ${isToday ? 'text-blue-950/70' : 'text-yellow-400'}`}>R$ {item.product?.price.toFixed(2)}</p>
                       </div>
                     );
                   })}
                 </div>
              </div>
            )}

            {/* ... (Existing Status Panel and Category Filters) ... */}
            {storeConfig.statusPanelEnabled && activeStatusOrders.length > 0 && showCustomerStatusPanel && (
              <div className="bg-blue-950 text-white p-6 rounded-[2.5rem] mb-10 shadow-2xl border-4 border-yellow-400 overflow-hidden relative">
                <button onClick={() => setShowCustomerStatusPanel(false)} className="absolute top-4 right-4 z-10 p-2 bg-white/10 rounded-full"><CloseIcon size={16} className="text-yellow-400" /></button>
                <div className="flex justify-between items-center mb-4 pr-8 text-white"><h3 className="text-[10px] font-black uppercase tracking-widest text-yellow-400">PEDIDOS NO FORNO</h3></div>
                <div className="flex overflow-x-auto gap-4 no-scrollbar pb-2">
                  {activeStatusOrders.map((o: any) => (
                    <div key={o.id} className={`shrink-0 w-44 p-4 rounded-2xl border-2 ${o.status === 'ready' ? 'bg-green-600 border-white animate-pulse' : 'bg-blue-900/40 border-blue-800'}`}>
                       <div className="flex justify-between items-start mb-1"><span className="text-[8px] font-black uppercase opacity-60">#{o.id}</span><span className={`text-[7px] font-black uppercase px-2 py-0.5 rounded-full ${o.status === 'ready' ? 'bg-white text-green-600' : 'bg-yellow-400 text-blue-950'}`}>{statusLabel(o.status)}</span></div>
                       <p className="font-black text-xs uppercase truncate text-white">{o.customerName}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex overflow-x-auto gap-2.5 pb-8 no-scrollbar mask-fade pt-4">
              {categoryNames.map(cat => (<button key={cat} onClick={() => setSelectedCategory(cat)} className={`whitespace-nowrap px-6 py-3.5 rounded-2xl font-black text-[10px] uppercase shadow-md transition-all ${selectedCategory === cat ? 'bg-blue-950 text-yellow-400' : 'bg-white text-blue-950 border border-yellow-200 hover:border-blue-950'}`}>{cat}</button>))}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredItems.map(item => <MenuItem key={item.id} product={item} activeCoupons={activeCoupons} onAdd={(p) => setCartItems(prev => { const ex = prev.find(i => i.id === p.id); if (ex) return prev.map(i => i.id === p.id ? {...i, quantity: i.quantity + 1} : i); return [...prev, { ...p, quantity: 1 }]; })} />)}
            </div>
          </>
        )}

        {isStoreClosed && (
          <div className="bg-white p-12 rounded-[4rem] text-center shadow-2xl border-t-8 border-blue-950 animate-in fade-in zoom-in duration-500">
             <div className="bg-red-500 w-24 h-24 rounded-full mx-auto mb-8 flex items-center justify-center shadow-xl animate-pulse">
                <CloseIcon size={48} className="text-white" />
             </div>
             <h2 className="text-4xl font-black italic uppercase tracking-tighter mb-4 text-blue-950">LOJA FECHADA</h2>
             <p className="text-blue-900/50 uppercase text-xs font-black tracking-widest leading-relaxed max-w-sm mx-auto">No momento não estamos aceitando novos pedidos. Tente mais tarde!</p>
             <div className="mt-12 bg-yellow-400 p-6 rounded-[2.5rem] border-2 border-yellow-500 shadow-xl">
                <p className="text-[10px] font-black uppercase text-blue-950/40 mb-2">Funcionamento</p>
                <p className="font-black text-blue-950 uppercase tracking-tight italic">{STORE_INFO.hours}</p>
             </div>
          </div>
        )}
      </main>
      
      {!isStoreClosed && <div className="fixed bottom-8 left-0 right-0 flex justify-center px-6 z-40">
        {cartItems.length > 0 && (
          <button onClick={() => { setIsCartOpen(true); handleUnlockAudio(); }} className="w-full max-w-md bg-blue-950 text-yellow-400 rounded-[2.5rem] p-5 flex items-center justify-between shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] ring-4 ring-yellow-400/30 font-black scale-100 hover:scale-105 transition-all"><span className="text-xs uppercase">Sacola ({cartItems.reduce((a,b)=>a+b.quantity,0)})</span><span className="text-white text-lg italic">R$ {cartItems.reduce((a,b)=>a+(b.price*b.quantity),0).toFixed(2)}</span></button>
        )}
      </div>}
      
      <Cart isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} items={cartItems} onUpdateQuantity={(id, d) => setCartItems(p => p.map(i => i.id === id ? {...i, quantity: Math.max(1, i.quantity + d)} : i))} onRemove={id => setCartItems(p => p.filter(i => i.id !== id))} onAdd={() => {}} onPlaceOrder={handlePlaceOrder} storeConfig={storeConfig} />
    </div>
  );
};

export default App;
