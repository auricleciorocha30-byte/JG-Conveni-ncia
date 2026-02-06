
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import HeaderComp from './components/Header';
import MenuItem from './components/MenuItem';
import Cart from './components/Cart';
import AdminPanel from './components/AdminPanel';
import WaiterPanel from './components/WaiterPanel';
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
    statusPanelEnabled: false,
    waiterCanFinalize: true,
    waiterCanCancelItems: true
  });

  const [currentView, setCurrentView] = useState<'login' | 'admin' | 'menu' | 'tv' | 'waiter'>('login');
  const [showCustomerStatusPanel, setShowCustomerStatusPanel] = useState(true);

  const notificationSound = useRef<HTMLAudioElement | null>(null);
  const lastNotifiedOrderId = useRef<string | null>(null);

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
          statusPanelEnabled: configRes.data.status_panel_enabled ?? false,
          waiterCanFinalize: configRes.data.waiter_can_finalize ?? true,
          waiterCanCancelItems: configRes.data.waiter_can_cancel_items ?? true
        });
      }
      if (specialRes.data) setDailySpecials(specialRes.data);
      if (catRes.data) setCategories(catRes.data);
      if (coupRes.data) setActiveCoupons(coupRes.data.map((c: any) => ({ id: c.id, code: c.code, percentage: c.percentage, isActive: c.is_active, scopeType: c.scope_type, scopeValue: c.scope_value })));
      if (prodRes.data) setMenuItems(prodRes.data.map((p: any) => ({ id: p.id, name: p.name, description: p.description || '', price: Number(p.price), category: p.category, image: p.image, isAvailable: p.is_available ?? true })));
      if (tableRes.data) {
        const merged = [...INITIAL_TABLES];
        tableRes.data.forEach((dbT: any) => {
          const idx = merged.findIndex(t => t.id === dbT.id);
          if (idx >= 0) merged[idx] = { id: dbT.id, status: dbT.status, currentOrder: dbT.current_order };
          else merged.push({ id: dbT.id, status: dbT.status, currentOrder: dbT.current_order });
        });
        setTables(merged.sort((a,b) => a.id - b.id));
      }
      setDbStatus('ok');
    } catch (err) { setDbStatus('error'); }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('view');
    if (v === 'tv') setCurrentView('tv');
    else if (v === 'menu') setCurrentView('menu');
    else if (v === 'waiter') setCurrentView('waiter');
    else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) { setIsLoggedIn(true); setIsAdmin(true); setCurrentView('admin'); }
      });
    }
    fetchData();
  }, [fetchData]);

  const handleUpdateTable = async (id: number, status: 'free' | 'occupied', order?: Order | null) => {
    try {
      if (status === 'free') await supabase.from('tables').delete().eq('id', id);
      else await supabase.from('tables').upsert({ id, status, current_order: order || null }, { onConflict: 'id' });
    } catch (e) { console.error(e); }
  };

  const handleAddToOrder = async (tableId: number, product: Product) => {
    const table = tables.find(t => t.id === tableId);
    let order = table?.currentOrder;
    const items = order ? [...order.items] : [];
    const idx = items.findIndex(i => i.id === product.id);
    if (idx >= 0) items[idx].quantity += 1;
    else items.push({ ...product, quantity: 1 });
    const total = items.reduce((a, b) => a + (b.price * b.quantity), 0);
    const newOrder: Order = order ? { ...order, items, total, finalTotal: total } : {
      id: Math.random().toString(36).substr(2, 6).toUpperCase(),
      customerName: `Mesa ${tableId}`, items, total, finalTotal: total,
      paymentMethod: 'Pendente', timestamp: new Date().toISOString(), tableId, status: 'pending', orderType: 'table'
    };
    await handleUpdateTable(tableId, 'occupied', newOrder);
  };

  const handleRemoveItem = async (tableId: number, itemIndex: number) => {
    const table = tables.find(t => t.id === tableId);
    if (!table?.currentOrder) return;
    const items = [...table.currentOrder.items];
    items.splice(itemIndex, 1);
    if (items.length === 0) await handleUpdateTable(tableId, 'free');
    else {
      const total = items.reduce((a, b) => a + (b.price * b.quantity), 0);
      await handleUpdateTable(tableId, 'occupied', { ...table.currentOrder, items, total, finalTotal: total });
    }
  };

  if (currentView === 'waiter') {
    return <WaiterPanel tables={tables} menuItems={menuItems} onUpdateTable={handleUpdateTable} onAddToOrder={handleAddToOrder} onRemoveItem={handleRemoveItem} storeConfig={storeConfig} />;
  }

  if (currentView === 'admin' && isAdmin) {
    return <AdminPanel tables={tables} menuItems={menuItems} categories={categories} audioEnabled={audioEnabled} onToggleAudio={() => setAudioEnabled(!audioEnabled)} onTestSound={() => {}} onUpdateTable={handleUpdateTable} onAddToOrder={handleAddToOrder} onRefreshData={fetchData} onLogout={async () => { await supabase.auth.signOut(); setIsAdmin(false); setCurrentView('login'); }} onSaveProduct={()=>{}} onDeleteProduct={()=>{}} dbStatus="ok" storeConfig={storeConfig} onUpdateStoreConfig={async (c) => { 
      setStoreConfig(c);
      await supabase.from('store_config').upsert({ id: 1, tables_enabled: c.tablesEnabled, delivery_enabled: c.deliveryEnabled, counter_enabled: c.counterEnabled, status_panel_enabled: c.statusPanelEnabled, waiter_can_finalize: c.waiterCanFinalize, waiter_can_cancel_items: c.waiterCanCancelItems });
    }} />;
  }

  // ... Resto do App.tsx (Login, Menu, etc.) ...
  return (
    <div className="min-h-screen bg-yellow-400 flex items-center justify-center p-6">
      <div className="bg-white p-12 rounded-[4rem] w-full max-w-md text-center shadow-2xl">
         <h2 className="text-3xl font-black mb-8 italic uppercase text-blue-950">{STORE_INFO.name}</h2>
         <form onSubmit={async (e) => {
           e.preventDefault();
           const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPass });
           if (!error) { setIsAdmin(true); setCurrentView('admin'); } else alert('Erro no login');
         }} className="space-y-4">
            <input type="email" placeholder="E-MAIL" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} className="w-full bg-yellow-50 border-2 border-yellow-200 rounded-2xl px-6 py-4 outline-none" />
            <input type="password" placeholder="SENHA" value={loginPass} onChange={e => setLoginPass(e.target.value)} className="w-full bg-yellow-50 border-2 border-yellow-200 rounded-2xl px-6 py-4 outline-none" />
            <button type="submit" className="w-full bg-blue-950 text-yellow-400 font-black py-5 rounded-2xl uppercase">Acessar</button>
         </form>
      </div>
    </div>
  );
};

export default App;
