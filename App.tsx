
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import HeaderComp from './components/Header';
import MenuItem from './components/MenuItem';
import Cart from './components/Cart';
import AdminPanel from './components/AdminPanel';
import { MENU_ITEMS as STATIC_MENU, INITIAL_TABLES, STORE_INFO } from './constants';
import { Product, CartItem, Table, Order, Category, Coupon, StoreConfig } from './types';
import { supabase } from './lib/supabase';
import { CloseIcon, GasIcon } from './components/Icons';

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
      
      const [catRes, coupRes, prodRes, tableRes, configRes] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('coupons').select('*').eq('is_active', true),
        supabase.from('products').select('*').order('name'),
        supabase.from('tables').select('*').order('id'),
        supabase.from('store_config').select('*').maybeSingle()
      ]);

      if (configRes.data) {
        setStoreConfig({
          tablesEnabled: configRes.data.tables_enabled ?? true,
          deliveryEnabled: configRes.data.delivery_enabled ?? true,
          counterEnabled: configRes.data.counter_enabled ?? true,
          statusPanelEnabled: configRes.data.status_panel_enabled ?? false
        });
      }

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

  if (currentView === 'tv') {
     const preparingOrders = activeStatusOrders.filter(o => o.status === 'pending' || o.status === 'preparing');
     const readyOrders = activeStatusOrders.filter(o => o.status === 'ready');
     return (
       <div className="fixed inset-0 bg-yellow-400 text-blue-950 flex flex-col font-black overflow-hidden select-none" onClick={handleUnlockAudio}>
         <div className="h-24 bg-blue-950 text-yellow-400 flex items-center justify-between px-10 shadow-2xl border-b-8 border-blue-800">
            <div className="flex items-center gap-6">
               <div className="bg-yellow-400 p-3 rounded-2xl shadow-xl"><GasIcon size={32} className="text-blue-950" /></div>
               <h1 className="text-4xl italic uppercase tracking-tighter">SITUAÇÃO DO PEDIDO</h1>
            </div>
            <div className="flex items-center gap-8">
               <div className="text-right"><p className="text-[10px] uppercase tracking-widest opacity-60">Status ao Vivo</p><h2 className="text-2xl italic leading-none">{STORE_INFO.name.toUpperCase()}</h2></div>
               <button onClick={() => { setCurrentView('login'); window.history.pushState({}, '', window.location.pathname); }} className="bg-yellow-400 text-blue-950 px-6 py-3 rounded-2xl text-sm font-black uppercase border-2 border-blue-950/20 hover:bg-red-600 hover:text-white">Sair</button>
            </div>
         </div>
         <div className="flex-1 flex gap-2 p-4">
            <div className="flex-1 bg-white/40 rounded-[3rem] p-8 border-4 border-white/20 flex flex-col overflow-hidden">
               <div className="flex items-center justify-between mb-8 border-b-4 border-blue-950/10 pb-4"><h3 className="text-3xl uppercase italic text-blue-950">🕒 PREPARANDO...</h3><span className="bg-blue-950 text-yellow-400 px-4 py-1 rounded-full text-xl">{preparingOrders.length}</span></div>
               <div className="flex-1 grid grid-cols-1 gap-4 overflow-y-auto no-scrollbar">
                  {preparingOrders.map(o => (<div key={o.id} className="bg-white border-l-[1rem] border-blue-950 p-6 rounded-3xl flex items-center justify-between shadow-lg"><div className="min-w-0 flex-1"><p className="text-5xl uppercase truncate leading-tight text-blue-950">{o.customerName}</p><p className="text-xl text-blue-900 opacity-60">#{o.id} • {o.tableId >= 950 ? 'BALCÃO' : `MESA ${o.tableId}`}</p></div></div>))}
               </div>
            </div>
            <div className="flex-1 bg-green-900/10 rounded-[3rem] p-8 border-4 border-green-500/30 flex flex-col overflow-hidden">
               <div className="flex items-center justify-between mb-8 border-b-4 border-green-500 pb-4"><h3 className="text-3xl uppercase italic text-green-700">🚀 PRONTO</h3><span className="bg-green-600 text-white px-4 py-1 rounded-full text-xl">{readyOrders.length}</span></div>
               <div className="flex-1 grid grid-cols-1 gap-4 overflow-y-auto no-scrollbar">
                  {readyOrders.map(o => (<div key={o.id} className="bg-green-600 p-8 rounded-3xl flex items-center justify-between animate-[pulse_2s_infinite] shadow-2xl"><div className="min-w-0 flex-1"><p className="text-6xl uppercase truncate leading-tight text-white">{o.customerName}</p><p className="text-2xl text-white/80">CÓDIGO: <span className="text-green-900 bg-white px-3 rounded-lg">#{o.id}</span></p></div></div>))}
               </div>
            </div>
         </div>
       </div>
     );
  }

  if (currentView === 'admin' && isAdmin) {
    return (
      <div className="min-h-screen bg-yellow-50 p-6">
        {activeAlert && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-md px-6 animate-in slide-in-from-top duration-700">
            <div className={`${activeAlert.isUpdate ? 'bg-blue-600' : 'bg-blue-950 border-yellow-400'} text-white p-5 rounded-[2.5rem] shadow-2xl border-4 flex items-center gap-5`}>
              <div className="bg-yellow-400 text-blue-950 w-12 h-12 rounded-xl flex items-center justify-center font-black shrink-0 shadow-lg">{activeAlert.isUpdate ? '🔄' : '🔔'}</div>
              <div className="flex-1 font-black text-white">
                <h4 className="text-[10px] uppercase text-yellow-400 tracking-widest mb-0.5">{activeAlert.msg}</h4>
                <p className="text-lg italic uppercase tracking-tighter leading-none">{activeAlert.type} #{activeAlert.id}</p>
              </div>
              <button onClick={() => setActiveAlert(null)} className="p-2 bg-white/10 rounded-full"><CloseIcon size={18}/></button>
            </div>
          </div>
        )}
        <AdminPanel 
          tables={tables} menuItems={menuItems} categories={categories} audioEnabled={audioEnabled} onToggleAudio={() => setAudioEnabled(!audioEnabled)} onTestSound={testSound}
          onUpdateTable={async (id, status, ord) => { 
            try {
              if (status === 'free') await supabase.from('tables').delete().eq('id', id);
              else await supabase.from('tables').upsert({ id, status, current_order: ord || null }, { onConflict: 'id' });
            } catch (e) { console.error("Table update error", e); }
          }}
          onAddToOrder={(tableId, product, observation) => {
            const table = tables.find(t => t.id === tableId);
            let current = table?.currentOrder;
            const items = current ? [...(current.items || [])] : [];
            const ex = items.findIndex(i => i.id === product.id && (i.observation || '') === (observation || ''));
            if (ex >= 0) items[ex].quantity += 1;
            else items.push({ ...product, quantity: 1, observation });
            const total = items.reduce((a, b) => a + (b.price * b.quantity), 0);
            handlePlaceOrder(current ? { ...current, items, total, finalTotal: total - (current.discount || 0) } : { id: Math.random().toString(36).substr(2, 6).toUpperCase(), customerName: tableId >= 950 ? 'Balcão' : tableId >= 900 ? 'Entrega' : `Mesa ${tableId}`, items, total, finalTotal: total, paymentMethod: 'Pendente', timestamp: new Date().toISOString(), tableId, status: 'pending', orderType: tableId >= 950 ? 'counter' : tableId >= 900 ? 'delivery' : 'table' });
          }}
          onRefreshData={() => fetchData()} onLogout={async () => { await supabase.auth.signOut(); setIsLoggedIn(false); setIsAdmin(false); setCurrentView('login'); }}
          onSaveProduct={async (p) => { try { const data = { id: p.id || 'p_' + Date.now(), name: p.name, price: p.price, category: p.category, description: p.description, image: p.image, is_available: p.isAvailable }; await supabase.from('products').upsert([data], { onConflict: 'id' }); fetchData(true); } catch (e) { console.error("Save product error", e); } }}
          onDeleteProduct={async (id) => { try { await supabase.from('products').delete().eq('id', id); fetchData(true); } catch (e) { console.error("Delete product error", e); } }} dbStatus={dbStatus === 'loading' ? 'loading' : 'ok'}
          storeConfig={storeConfig}
          onUpdateStoreConfig={async (newCfg) => {
            setStoreConfig(newCfg);
            try { await supabase.from('store_config').upsert({ id: 1, tables_enabled: newCfg.tablesEnabled, delivery_enabled: newCfg.deliveryEnabled, counter_enabled: newCfg.counterEnabled, status_panel_enabled: newCfg.statusPanelEnabled }, { onConflict: 'id' }); } catch (e) { console.error("Config update error", e); }
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-yellow-50 flex flex-col font-sans relative" onClick={handleUnlockAudio}>
      <HeaderComp />
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 -mt-8 relative z-20 flex-1 pb-40">
        {isStoreClosed ? (
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
        ) : (
          <>
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
      </main>
      {!isStoreClosed && cartItems.length > 0 && (
        <div className="fixed bottom-8 left-0 right-0 flex justify-center px-6 z-40">
          <button onClick={() => { setIsCartOpen(true); handleUnlockAudio(); }} className="w-full max-w-md bg-blue-950 text-yellow-400 rounded-[2.5rem] p-5 flex items-center justify-between shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] ring-4 ring-yellow-400/30 font-black scale-100 hover:scale-105 transition-all"><span className="text-xs uppercase">Sacola ({cartItems.reduce((a,b)=>a+b.quantity,0)})</span><span className="text-white text-lg italic">R$ {cartItems.reduce((a,b)=>a+(b.price*b.quantity),0).toFixed(2)}</span></button>
        </div>
      )}
      <Cart isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} items={cartItems} onUpdateQuantity={(id, d) => setCartItems(p => p.map(i => i.id === id ? {...i, quantity: Math.max(1, i.quantity + d)} : i))} onRemove={id => setCartItems(p => p.filter(i => i.id !== id))} onAdd={() => {}} onPlaceOrder={handlePlaceOrder} storeConfig={storeConfig} />
    </div>
  );
};

export default App;
