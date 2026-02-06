import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Table, Order, Product, Category, Coupon, LoyaltyConfig, OrderStatus, StoreConfig, DailySpecial, LoyaltyUser } from '../types';
import { CloseIcon, TrashIcon, VolumeIcon, PrinterIcon, EditIcon, BackupIcon, RestoreIcon, GasIcon, StarIcon } from './Icons';
import { supabase } from '../lib/supabase';
import { STORE_INFO } from '../constants';

interface AdminPanelProps {
  tables: Table[];
  menuItems: Product[];
  categories: Category[];
  audioEnabled: boolean;
  onToggleAudio: () => void;
  onTestSound: () => void;
  onUpdateTable: (tableId: number, status: 'free' | 'occupied', order?: Order | null) => void;
  onAddToOrder: (tableId: number, product: Product, observation?: string) => void;
  onRefreshData: () => void;
  onLogout: () => void;
  onSaveProduct: (product: Partial<Product>) => void;
  onDeleteProduct: (id: string) => void;
  dbStatus: 'loading' | 'ok';
  storeConfig: StoreConfig;
  onUpdateStoreConfig: (newCfg: StoreConfig) => void;
}

const STATUS_CFG: Record<string, any> = {
  'pending': { label: 'Pendente', color: 'text-orange-600', bg: 'bg-orange-100', border: 'border-orange-200', badge: 'bg-orange-600 text-white' },
  'preparing': { label: 'Preparando', color: 'text-blue-600', bg: 'bg-blue-100', border: 'border-blue-200', badge: 'bg-blue-600 text-white' },
  'ready': { label: 'Pronto', color: 'text-green-600', bg: 'bg-green-100', border: 'border-green-200', badge: 'bg-green-600 text-white' },
  'delivered': { label: 'Entregue', color: 'text-gray-400', bg: 'bg-gray-50', border: 'border-gray-200', badge: 'bg-gray-400 text-white' }
};

const DAYS_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const AdminPanel: React.FC<AdminPanelProps> = ({ 
  tables = [], menuItems = [], categories = [], audioEnabled, onToggleAudio, onTestSound,
  onUpdateTable, onRefreshData, onLogout, onSaveProduct, onDeleteProduct, dbStatus, onAddToOrder,
  storeConfig, onUpdateStoreConfig
}) => {
  const [activeTab, setActiveTab] = useState<'tables' | 'delivery' | 'menu' | 'marketing' | 'setup'>('tables');
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [isWaiterManagerOpen, setIsWaiterManagerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [productSearchInTable, setProductSearchInTable] = useState('');
  const [isDataProcessing, setIsDataProcessing] = useState(false);
  
  // Modals States
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [newOrderForm, setNewOrderForm] = useState({ customerName: '', type: 'delivery' as 'delivery' | 'takeaway', address: '' });
  
  // Marketing States
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [dailySpecials, setDailySpecials] = useState<DailySpecial[]>([]);
  const [loyalty, setLoyalty] = useState<LoyaltyConfig>({ isActive: false, spendingGoal: 100, scopeType: 'all', scopeValue: '' });
  const [loyaltyUsers, setLoyaltyUsers] = useState<LoyaltyUser[]>([]);
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
  const [couponForm, setCouponForm] = useState({ code: '', percentage: '', scopeType: 'all' as 'all' | 'category' | 'product', selectedItems: [] as string[] });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { 
    fetchMarketing();
    fetchDailySpecials();
  }, []);

  const fetchMarketing = async () => {
    try {
      const { data: cData } = await supabase.from('coupons').select('*').order('code', { ascending: true });
      if (cData) setCoupons(cData.map(c => ({ id: c.id, code: c.code, percentage: c.percentage, isActive: c.is_active, scopeType: c.scope_type, scopeValue: c.scope_value || '' })));
      
      const { data: lConfig } = await supabase.from('loyalty_config').select('*').maybeSingle();
      if (lConfig) setLoyalty({ isActive: lConfig.is_active ?? false, spendingGoal: lConfig.spending_goal ?? 100, scopeType: lConfig.scope_type || 'all', scopeValue: lConfig.scope_value || '' });
      
      const { data: lUsers } = await supabase.from('loyalty_users').select('*').order('accumulated', { ascending: false });
      if (lUsers) setLoyaltyUsers(lUsers);
    } catch (e) { console.error("Error fetching marketing data", e); }
  };

  const fetchDailySpecials = async () => {
    const { data } = await supabase.from('daily_specials').select('*').order('day_of_week');
    if (data) setDailySpecials(data);
  };

  const handleUpdateDailySpecial = async (day: number, productId: string | null) => {
    setIsDataProcessing(true);
    try {
      await supabase.from('daily_specials').upsert({ day_of_week: day, product_id: productId || null });
      fetchDailySpecials();
    } catch (e) { alert("Erro ao salvar oferta do dia."); } finally { setIsDataProcessing(false); }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setIsDataProcessing(true);
    try {
      const { error } = await supabase.from('categories').insert([{ id: 'cat_' + Date.now(), name: newCategoryName.trim() }]);
      if (error) throw error;
      setNewCategoryName('');
      setIsCategoryModalOpen(false);
      onRefreshData();
    } catch (err) { alert('Erro ao salvar categoria.'); } finally { setIsDataProcessing(false); }
  };

  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = couponForm.code.toUpperCase().trim();
    if (!cleanCode || !couponForm.percentage) return;
    setIsDataProcessing(true);
    const scopeValue = couponForm.scopeType === 'all' ? '' : couponForm.selectedItems.join(',');
    const couponData = { code: cleanCode, percentage: Number(couponForm.percentage), is_active: true, scope_type: couponForm.scopeType, scope_value: scopeValue };
    try {
      await supabase.from('coupons').insert([{ id: 'c_'+Date.now(), ...couponData }]); 
      setIsCouponModalOpen(false);
      fetchMarketing();
    } catch (err) { alert(`Erro ao salvar cupom.`); } finally { setIsDataProcessing(false); }
  };

  const handleUpdateLoyalty = async (updates: Partial<LoyaltyConfig>) => {
    const next = { ...loyalty, ...updates };
    setLoyalty(next);
    await supabase.from('loyalty_config').upsert({ id: 1, is_active: next.isActive, spending_goal: next.spendingGoal, scope_type: next.scopeType, scope_value: next.scopeValue }, { onConflict: 'id' });
  };

  const handleDeleteLoyaltyUser = async (phone: string) => {
    if (!confirm('Deseja remover este cliente do programa de fidelidade?')) return;
    try {
      await supabase.from('loyalty_users').delete().eq('phone', phone);
      fetchMarketing();
    } catch (e) { alert('Erro ao remover cliente.'); }
  };

  const handleUpdateTableStatus = async (tableId: number, newStatus: OrderStatus) => {
    const table = tables.find(t => t.id === tableId);
    if (!table || !table.currentOrder) return;
    const updatedOrder = { ...table.currentOrder, status: newStatus, isUpdated: true };
    await onUpdateTable(tableId, 'occupied', updatedOrder);
  };

  const handleExportBackup = () => {
    const backupData = { 
      menuItems, categories, coupons, loyalty, storeConfig, dailySpecials,
      exportedAt: new Date().toISOString() 
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup-moreira-${new Date().getTime()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { alert("Escolha uma imagem de até 2MB."); return; }
      const reader = new FileReader();
      reader.onloadend = () => { setEditingProduct(prev => prev ? { ...prev, image: reader.result as string } : null); };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateNewOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrderForm.customerName) return alert('Nome é obrigatório');
    
    const range = newOrderForm.type === 'delivery' ? [900, 949] : [950, 999];
    const free = tables.find(t => t.id >= range[0] && t.id <= range[1] && t.status === 'free');
    
    if (!free) return alert('Sem slots disponíveis no momento para esta categoria.');

    const newOrder: Order = {
      id: Math.random().toString(36).substr(2, 6).toUpperCase(),
      customerName: newOrderForm.customerName,
      items: [],
      total: 0,
      finalTotal: 0,
      paymentMethod: 'Pendente',
      timestamp: new Date().toISOString(),
      tableId: free.id,
      status: 'pending',
      orderType: newOrderForm.type === 'takeaway' ? 'counter' : 'delivery',
      address: newOrderForm.type === 'delivery' ? newOrderForm.address : undefined
    };

    await onUpdateTable(free.id, 'occupied', newOrder);
    setIsNewOrderModalOpen(false);
    setSelectedTableId(free.id);
  };

  const physicalTables = tables.filter(t => t.id <= 12).sort((a,b) => a.id - b.id);
  const activeDeliveries = tables.filter(t => t.id >= 900 && t.id <= 949 && t.status === 'occupied');
  const activeCounter = tables.filter(t => t.id >= 950 && t.id <= 999 && t.status === 'occupied');
  const filteredMenu = (menuItems || []).filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const tableSearchProducts = (menuItems || []).filter(i => i.isAvailable && i.name.toLowerCase().includes(productSearchInTable.toLowerCase())).slice(0, 5);
  const selectedTable = tables.find(t => t.id === selectedTableId) || null;

  return (
    <div className="w-full">
      {/* HEADER NAVBAR */}
      <div className="bg-blue-950 p-5 rounded-[2.5rem] shadow-2xl mb-8 border-b-4 border-yellow-400 flex flex-col md:flex-row justify-between items-center gap-5">
        <div className="flex items-center gap-4">
          <div className="bg-yellow-400 p-2 rounded-xl rotate-3 shadow-lg"><GasIcon size={24} className="text-blue-950" /></div>
          <div><h2 className="text-xl font-black italic text-yellow-400 uppercase leading-none">{STORE_INFO.name}</h2><p className="text-[8px] text-white/40 uppercase font-black mt-1">PAINEL DE GESTÃO</p></div>
        </div>
        
        <nav className="flex bg-blue-900/40 p-1 rounded-xl gap-1 overflow-x-auto no-scrollbar max-w-full">
          {(['tables', 'delivery', 'menu', 'marketing', 'setup'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-5 py-3 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === tab ? 'bg-yellow-400 text-blue-950 shadow-lg scale-105' : 'text-white/40 hover:text-white'}`}>
              {tab === 'tables' ? 'MESAS' : tab === 'delivery' ? 'EXTERNO' : tab === 'menu' ? 'MENU' : tab === 'marketing' ? 'MARKETING' : 'SETUP'}
            </button>
          ))}
        </nav>

        <div className="flex gap-2 items-center">
          <button onClick={() => window.open(window.location.origin + window.location.pathname + '?view=menu', '_blank')} className="bg-yellow-400 text-blue-950 font-black text-[9px] uppercase px-4 py-3 rounded-xl shadow-xl hover:scale-105 transition-all">Ver Cardápio 📋</button>
          <button onClick={() => window.open(window.location.origin + window.location.pathname + '?view=waiter', '_blank')} className="bg-green-600 text-white font-black text-[9px] uppercase px-4 py-3 rounded-xl shadow-xl hover:scale-105 transition-all">GARÇOM 🤵</button>
          <button onClick={() => setIsWaiterManagerOpen(true)} className="bg-blue-800 text-white font-black text-[9px] uppercase px-4 py-3 rounded-xl shadow-xl hover:scale-105 transition-all">GERENTE GARÇOM ⚙️</button>
          <button onClick={onLogout} className="bg-red-600 text-white font-black text-[9px] uppercase px-4 py-2.5 rounded-xl active:scale-95 transition-all">Sair</button>
        </div>
      </div>

      <div className="animate-in fade-in duration-500 min-h-[60vh]">
        {/* TAB TABLES */}
        {activeTab === 'tables' && (
           <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              {physicalTables.map(t => (
                <button key={t.id} onClick={() => setSelectedTableId(t.id)} className={`h-40 p-5 rounded-[2.5rem] border-2 transition-all flex flex-col items-center justify-center gap-1 relative ${t.status === 'free' ? 'bg-white border-yellow-400 shadow-sm text-blue-950' : 'bg-yellow-400 border-blue-950 shadow-xl scale-105 z-10'}`}>
                  <span className="text-4xl font-black italic text-blue-950 leading-none">{t.id}</span>
                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${t.status === 'free' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-950 text-yellow-400'}`}>{t.status === 'free' ? 'Livre' : STATUS_CFG[t.currentOrder?.status || 'pending'].label}</span>
                  {t.currentOrder && <span className="text-[10px] font-black text-blue-950 uppercase truncate w-full text-center px-2 mt-1">{t.currentOrder.customerName}</span>}
                </button>
              ))}
           </div>
        )}

        {/* TAB DELIVERY / EXTERNAL */}
        {activeTab === 'delivery' && (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black italic uppercase text-blue-950 border-l-4 border-yellow-400 pl-4">Pedidos Externos</h3>
              <button onClick={() => setIsNewOrderModalOpen(true)} className="bg-blue-950 text-yellow-400 px-6 py-3 rounded-xl font-black text-[10px] uppercase shadow-lg">+ Novo Pedido Manual</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...activeDeliveries, ...activeCounter].map(t => (
                <button key={t.id} onClick={() => setSelectedTableId(t.id)} className={`bg-white border-4 p-6 rounded-[3rem] text-left relative overflow-hidden shadow-lg transition-all active:scale-[0.98] ${t.id >= 950 ? 'border-blue-950' : 'border-yellow-400'}`}>
                  <div className={`absolute top-0 right-0 px-4 py-1.5 text-[8px] font-black uppercase ${t.id >= 950 ? 'bg-blue-950 text-yellow-400' : 'bg-yellow-400 text-blue-950'}`}>{t.id >= 950 ? 'Balcão' : 'Entrega'}</div>
                  <h4 className="font-black text-sm uppercase truncate mb-1 text-blue-950">{t.currentOrder?.customerName}</h4>
                  <p className="text-[10px] text-blue-900/40 font-bold uppercase mb-4">#{t.currentOrder?.id}</p>
                  <div className={`${STATUS_CFG[t.currentOrder?.status || 'pending'].badge} text-[8px] font-black px-3 py-1.5 rounded-full inline-block uppercase`}>{STATUS_CFG[t.currentOrder?.status || 'pending'].label}</div>
                </button>
              ))}
              {activeDeliveries.length + activeCounter.length === 0 && (
                <div className="col-span-full py-20 text-center border-4 border-dashed border-yellow-400 rounded-[3rem] bg-yellow-400/10">
                   <p className="text-blue-950/40 font-black uppercase text-xs">Aguardando novos pedidos externos...</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB MENU */}
        {activeTab === 'menu' && (
          <div className="space-y-10">
            <div className="bg-white p-8 rounded-[3rem] shadow-xl border-4 border-yellow-400">
              <div className="flex justify-between items-center mb-8"><h3 className="text-xl font-black italic uppercase text-blue-950">Categorias</h3><button onClick={() => setIsCategoryModalOpen(true)} className="bg-blue-950 text-yellow-400 px-6 py-3 rounded-xl font-black text-[10px] uppercase">+ Adicionar</button></div>
              <div className="flex flex-wrap gap-3">
                {categories.map(cat => (
                  <div key={cat.id} className="bg-yellow-400 px-5 py-3 rounded-xl border-2 border-blue-950 flex items-center gap-3 group">
                    <span className="font-black text-[10px] uppercase text-blue-950">{cat.name}</span>
                    <button onClick={async () => { if(confirm('Excluir categoria?')) { await supabase.from('categories').delete().eq('id', cat.id); onRefreshData(); } }} className="text-red-700 opacity-0 group-hover:opacity-100 transition-all"><TrashIcon size={14}/></button>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-white p-8 rounded-[3rem] shadow-xl border-4 border-blue-950">
              <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-6">
                <h3 className="text-xl font-black italic uppercase text-blue-950">Produtos</h3>
                <div className="flex gap-4 w-full md:w-auto">
                  <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="PESQUISAR..." className="flex-1 md:w-64 bg-yellow-50 border-2 border-yellow-400 rounded-xl px-4 py-3 text-[10px] font-black outline-none" />
                  <button onClick={() => { setEditingProduct({ name: '', price: 0, category: categories[0]?.name || '', image: '', description: '', isAvailable: true }); setIsProductModalOpen(true); }} className="bg-blue-950 text-yellow-400 px-6 py-3 rounded-xl font-black text-[10px] uppercase">+ Novo Item</button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-6">
                {filteredMenu.map(item => (
                  <div key={item.id} className={`bg-white p-4 rounded-[2.5rem] border-2 transition-all shadow-sm flex flex-col ${!item.isAvailable ? 'opacity-60 grayscale' : 'border-yellow-400 hover:border-blue-950'}`}>
                    <img src={item.image} className="w-full aspect-square object-cover rounded-2xl mb-4 shadow-sm" />
                    <h4 className="font-black text-[10px] uppercase truncate mb-1 text-blue-950">{item.name}</h4>
                    <div className="mt-auto flex justify-between items-center">
                      <span className="text-blue-950 font-black italic text-xs">R$ {item.price.toFixed(2)}</span>
                      <div className="flex gap-2">
                         <button onClick={() => { setEditingProduct(item); setIsProductModalOpen(true); }} className="text-blue-700"><EditIcon size={16}/></button>
                         <button onClick={() => onDeleteProduct(item.id)} className="text-red-600"><TrashIcon size={16}/></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB MARKETING */}
        {activeTab === 'marketing' && (
          <div className="space-y-12">
            {/* Ofertas da Semana */}
            <div className="bg-white p-8 rounded-[3rem] shadow-xl border-4 border-yellow-400">
               <h3 className="text-xl font-black italic uppercase text-blue-950 mb-8">🌟 Ofertas da Semana</h3>
               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                 {[1, 2, 3, 4, 5, 6, 0].map(day => {
                   const config = dailySpecials.find(s => s.day_of_week === day);
                   const isToday = new Date().getDay() === day;
                   return (
                     <div key={day} className={`flex flex-col gap-3 p-5 rounded-[2rem] border-2 transition-all shadow-sm ${isToday ? 'bg-yellow-400 border-blue-950 scale-105 z-10' : 'bg-yellow-50 border-yellow-100'}`}>
                       <p className={`text-[10px] font-black uppercase ${isToday ? 'text-blue-950' : 'text-blue-950/60'}`}>{DAYS_NAMES[day]}</p>
                       <select value={config?.product_id || ''} onChange={(e) => handleUpdateDailySpecial(day, e.target.value)} className="w-full bg-white border-2 border-yellow-200 rounded-xl p-2.5 text-[9px] font-black uppercase">
                         <option value="">(Nenhuma)</option>
                         {menuItems.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                       </select>
                     </div>
                   );
                 })}
               </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div className="bg-white p-8 rounded-[3rem] shadow-xl border-4 border-yellow-400">
                  <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-black italic uppercase text-blue-950">💎 Fidelidade</h3><button onClick={() => handleUpdateLoyalty({ isActive: !loyalty.isActive })} className={`px-4 py-2 rounded-xl font-black text-[9px] uppercase ${loyalty.isActive ? 'bg-green-600 text-white' : 'bg-yellow-400 text-blue-950'}`}>{loyalty.isActive ? 'Ativo' : 'Pausado'}</button></div>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div><p className="text-[9px] font-black uppercase text-blue-900/30 mb-1">Meta R$</p><input type="number" value={loyalty.spendingGoal} onChange={e => handleUpdateLoyalty({ spendingGoal: Number(e.target.value) })} className="w-full bg-yellow-50 border-2 border-yellow-400 rounded-xl p-4 font-black" /></div>
                    <div><p className="text-[9px] font-black uppercase text-blue-900/30 mb-1">Abrangência</p><select value={loyalty.scopeType} onChange={e => handleUpdateLoyalty({ scopeType: e.target.value as any, scopeValue: '' })} className="w-full bg-yellow-50 border-2 border-yellow-400 rounded-xl p-4 font-black uppercase text-xs"><option value="all">Toda Loja</option><option value="category">Categorias</option><option value="product">Produtos</option></select></div>
                  </div>
                </div>

                <div className="bg-white p-8 rounded-[3rem] shadow-xl border-4 border-blue-950">
                  <h3 className="text-xl font-black italic uppercase text-blue-950 mb-6">👥 Participantes</h3>
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left">
                      <thead><tr className="border-b-2 border-blue-950/10"><th className="py-3 text-[9px] font-black uppercase text-blue-900/30">Nome</th><th className="py-3 text-[9px] font-black uppercase text-blue-900/30">Celular</th><th className="py-3 text-[9px] font-black uppercase text-blue-900/30">Acumulado</th><th className="py-3"></th></tr></thead>
                      <tbody className="divide-y divide-blue-950/5">
                        {loyaltyUsers.map(u => (
                          <tr key={u.phone} className="group hover:bg-yellow-50 transition-colors">
                            <td className="py-4 font-black text-[10px] text-blue-950 uppercase">{u.name}</td>
                            <td className="py-4 font-bold text-[10px] text-blue-950/60">{u.phone}</td>
                            <td className="py-4 font-black text-xs text-blue-950 italic">R$ {u.accumulated.toFixed(2)}</td>
                            <td className="py-4 text-right"><button onClick={() => handleDeleteLoyaltyUser(u.phone)} className="text-red-500 opacity-0 group-hover:opacity-100 transition-all"><TrashIcon size={14} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              
              <div className="lg:col-span-1 bg-blue-950 p-8 rounded-[3rem] shadow-xl border-4 border-yellow-400 flex flex-col h-fit">
                <div className="flex justify-between items-center mb-8"><h3 className="text-xl font-black italic uppercase text-yellow-400">🎫 Cupons</h3><button onClick={() => setIsCouponModalOpen(true)} className="bg-yellow-400 text-blue-950 px-4 py-2 rounded-xl font-black text-[9px] uppercase">+ Add</button></div>
                <div className="space-y-4 max-h-[400px] overflow-y-auto no-scrollbar">
                  {coupons.map(c => (
                    <div key={c.id} className="p-4 bg-blue-900/40 rounded-2xl border border-yellow-400/20 flex justify-between items-center group text-white">
                      <div className="flex flex-col"><span className="bg-yellow-400 text-blue-950 px-3 py-1 rounded-lg font-black text-[10px] w-fit mb-1">{c.code}</span><span className="text-[9px] font-bold text-green-400 uppercase">{c.percentage}% OFF</span></div>
                      <button onClick={async () => { if(confirm('Excluir cupom?')) { await supabase.from('coupons').delete().eq('id', c.id); fetchMarketing(); } }} className="text-red-500"><TrashIcon size={16}/></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB SETUP */}
        {activeTab === 'setup' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <div className="bg-white p-10 rounded-[3rem] shadow-xl border-4 border-yellow-400">
              <h3 className="text-xl font-black italic uppercase mb-8 text-blue-950">Serviços Ativos</h3>
              <div className="space-y-4">
                {[
                  { key: 'tablesEnabled', label: 'Atendimento Mesas', icon: '🪑' },
                  { key: 'deliveryEnabled', label: 'Serviço Entrega', icon: '🚚' },
                  { key: 'counterEnabled', label: 'Retirada Balcão', icon: '🏪' },
                  { key: 'statusPanelEnabled', label: 'Painel Status Público', icon: '📺' }
                ].map(opt => (
                  <div key={opt.key} className="flex items-center justify-between p-5 bg-yellow-50 rounded-[2rem] border border-yellow-100">
                    <div className="flex items-center gap-4"><span className="text-xl">{opt.icon}</span><span className="font-black text-[10px] uppercase text-blue-950">{opt.label}</span></div>
                    <button onClick={() => onUpdateStoreConfig({ ...storeConfig, [opt.key]: !storeConfig[opt.key as keyof StoreConfig] })} className={`w-14 h-7 rounded-full transition-all relative ${storeConfig[opt.key as keyof StoreConfig] ? 'bg-green-500' : 'bg-gray-300'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${storeConfig[opt.key as keyof StoreConfig] ? 'left-8' : 'left-1'}`} /></button>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-blue-950 p-10 rounded-[3rem] shadow-xl border-4 border-yellow-400 flex flex-col">
              <h3 className="text-xl font-black italic uppercase mb-8 text-yellow-400">Dados e Links</h3>
              <div className="space-y-4">
                 <button onClick={() => window.open(window.location.origin + window.location.pathname + '?view=tv', '_blank')} className="w-full p-6 bg-yellow-400 text-blue-950 rounded-[2rem] flex items-center justify-between shadow-xl"><p className="font-black text-xs uppercase">🖥️ Abrir Painel TV</p></button>
                 <div className="grid grid-cols-2 gap-3">
                   <button onClick={handleExportBackup} className="p-6 bg-blue-900/40 text-yellow-400 border-2 border-dashed border-yellow-400/30 rounded-[2rem] flex flex-col items-center justify-center gap-2">
                      <BackupIcon size={24} /><p className="font-black text-[9px] uppercase">Exportar Backup</p>
                   </button>
                   <button onClick={() => backupInputRef.current?.click()} className="p-6 bg-blue-900/40 text-green-400 border-2 border-dashed border-green-400/30 rounded-[2rem] flex flex-col items-center justify-center gap-2">
                      <RestoreIcon size={24} /><p className="font-black text-[9px] uppercase">Restaurar Backup</p>
                   </button>
                   <input type="file" ref={backupInputRef} className="hidden" />
                 </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL NOVO PEDIDO MANUAL (EXTERNO) */}
      {isNewOrderModalOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-blue-950/90 backdrop-blur-md">
          <div className="bg-yellow-400 w-full max-w-sm rounded-[3rem] p-10 relative border-4 border-blue-950">
             <button onClick={() => setIsNewOrderModalOpen(false)} className="absolute top-8 right-8 p-4 bg-blue-950 text-yellow-400 rounded-full"><CloseIcon size={20}/></button>
             <h3 className="text-2xl font-black italic mb-8 uppercase text-blue-950">Lançamento Manual</h3>
             <form onSubmit={handleCreateNewOrder} className="space-y-4">
                <input type="text" value={newOrderForm.customerName} onChange={e => setNewOrderForm({...newOrderForm, customerName: e.target.value})} placeholder="NOME DO CLIENTE" className="w-full bg-white border-2 border-blue-950 rounded-2xl px-6 py-4 text-xs font-black uppercase outline-none text-blue-950" required />
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setNewOrderForm({...newOrderForm, type: 'delivery'})} className={`py-3 rounded-xl text-[9px] font-black uppercase transition-all ${newOrderForm.type === 'delivery' ? 'bg-blue-950 text-yellow-400 shadow-md' : 'bg-white text-blue-950/40 border-2 border-blue-950/10'}`}>Entrega</button>
                  <button type="button" onClick={() => setNewOrderForm({...newOrderForm, type: 'takeaway'})} className={`py-3 rounded-xl text-[9px] font-black uppercase transition-all ${newOrderForm.type === 'takeaway' ? 'bg-blue-950 text-yellow-400 shadow-md' : 'bg-white text-blue-950/40 border-2 border-blue-950/10'}`}>Balcão</button>
                </div>
                {newOrderForm.type === 'delivery' && (
                  <textarea value={newOrderForm.address} onChange={e => setNewOrderForm({...newOrderForm, address: e.target.value})} placeholder="ENDEREÇO DE ENTREGA..." className="w-full bg-white border-2 border-blue-950 rounded-2xl px-6 py-4 text-xs font-black outline-none h-24 resize-none text-blue-950" required />
                )}
                <button type="submit" className="w-full bg-blue-950 text-yellow-400 py-5 rounded-2xl font-black text-[11px] uppercase shadow-xl">Criar Pedido</button>
             </form>
          </div>
        </div>
      )}

      {/* MODAL GERENTE GARÇOM */}
      {isWaiterManagerOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-blue-950/90 backdrop-blur-md">
          <div className="bg-yellow-400 w-full max-w-sm rounded-[3rem] p-10 relative border-4 border-blue-950">
             <button onClick={() => setIsWaiterManagerOpen(false)} className="absolute top-8 right-8 p-4 bg-blue-950 text-yellow-400 rounded-full"><CloseIcon size={20}/></button>
             <h3 className="text-2xl font-black italic mb-8 uppercase text-blue-950">Gerente de Garçom</h3>
             <div className="space-y-4">
                <div className="flex items-center justify-between p-5 bg-white rounded-2xl border-2 border-blue-950">
                   <p className="font-black text-[10px] uppercase text-blue-950">Finalizar Vendas</p>
                   <button onClick={() => onUpdateStoreConfig({...storeConfig, waiterCanFinalize: !storeConfig.waiterCanFinalize})} className={`w-14 h-7 rounded-full relative transition-all ${storeConfig.waiterCanFinalize ? 'bg-green-600' : 'bg-gray-400'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${storeConfig.waiterCanFinalize ? 'left-8' : 'left-1'}`} /></button>
                </div>
                <div className="flex items-center justify-between p-5 bg-white rounded-2xl border-2 border-blue-950">
                   <p className="font-black text-[10px] uppercase text-blue-950">Cancelar/Excluir Itens</p>
                   <button onClick={() => onUpdateStoreConfig({...storeConfig, waiterCanCancelItems: !storeConfig.waiterCanCancelItems})} className={`w-14 h-7 rounded-full relative transition-all ${storeConfig.waiterCanCancelItems ? 'bg-green-600' : 'bg-gray-400'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${storeConfig.waiterCanCancelItems ? 'left-8' : 'left-1'}`} /></button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* MODAL DETALHES PEDIDO DA MESA */}
      {selectedTable && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-blue-950/95 backdrop-blur-md" onClick={() => setSelectedTableId(null)} />
          <div className="relative bg-white w-full max-w-6xl h-[92vh] rounded-[3rem] flex flex-col md:flex-row overflow-hidden shadow-2xl border-t-8 border-yellow-400 animate-in zoom-in duration-300">
            {/* Lado Esquerdo */}
            <div className="flex-1 flex flex-col h-full bg-white border-r">
               <div className="p-6 border-b flex justify-between items-center bg-white shadow-sm shrink-0">
                  <h3 className="text-2xl font-black uppercase italic text-blue-950">{selectedTable.id >= 950 ? 'Balcão' : selectedTable.id >= 900 ? 'Entrega' : `Mesa ${selectedTable.id}`}</h3>
                  <button onClick={() => setSelectedTableId(null)} className="p-4 bg-yellow-400 text-blue-950 rounded-full"><CloseIcon size={20}/></button>
               </div>
               <div className="flex-1 overflow-y-auto p-6 space-y-6">
                 <div className="bg-yellow-400 p-6 rounded-[2rem] border-2 border-blue-950 flex justify-between items-center">
                    <div><p className="text-[8px] font-black uppercase mb-1">Cliente</p><p className="font-black text-lg uppercase truncate">{selectedTable.currentOrder?.customerName}</p></div>
                    <div className="text-right"><p className="text-[8px] font-black uppercase mb-1">Total</p><p className="text-3xl font-black italic text-blue-950">R$ {(selectedTable.currentOrder?.finalTotal || 0).toFixed(2)}</p></div>
                 </div>
                 <div className="space-y-3">
                   {selectedTable.currentOrder?.items.map((item, i) => (
                     <div key={i} className="flex gap-4 bg-white p-4 rounded-[1.5rem] border-2 border-yellow-100 items-center">
                       <img src={item.image} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                       <div className="flex-1 min-w-0"><h4 className="text-[10px] font-black uppercase truncate text-blue-950">{item.name}</h4><p className="text-[8px] text-blue-900/40 font-bold uppercase">{item.quantity}x R$ {item.price.toFixed(2)}</p></div>
                     </div>
                   ))}
                 </div>
                 <div className="grid grid-cols-2 gap-2">
                    {(['pending', 'preparing', 'ready', 'delivered'] as OrderStatus[]).map(s => (
                       <button key={s} onClick={() => handleUpdateTableStatus(selectedTable.id, s)} className={`py-3.5 rounded-xl text-[9px] font-black uppercase border-2 transition-all ${selectedTable.currentOrder?.status === s ? 'bg-blue-950 text-yellow-400 border-blue-950 shadow-lg' : 'bg-yellow-50 text-blue-900/30 border-yellow-100 hover:border-blue-950'}`}>{STATUS_CFG[s].label}</button>
                    ))}
                 </div>
                 <button onClick={() => { if(confirm('Encerrar conta?')) { onUpdateTable(selectedTable.id, 'free'); setSelectedTableId(null); } }} className="w-full bg-green-600 text-white py-5 rounded-2xl font-black uppercase text-[11px] shadow-xl">Encerrar 🏁</button>
               </div>
            </div>
            {/* Lado Direito - Lançamento */}
            <div className="w-full md:w-80 bg-yellow-50 flex flex-col h-full border-l border-yellow-400">
               <div className="p-6 border-b bg-yellow-400 flex justify-between items-center shrink-0"><h4 className="text-[11px] font-black uppercase text-blue-950">Lançamento</h4></div>
               <div className="p-6 space-y-4 flex flex-col flex-1 overflow-hidden">
                  <input type="text" value={productSearchInTable} onChange={e => setProductSearchInTable(e.target.value)} placeholder="PESQUISAR..." className="w-full bg-white border-2 border-blue-950 rounded-xl px-4 py-3 text-[10px] font-black outline-none" />
                  <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
                    {tableSearchProducts.map(prod => (
                      <button key={prod.id} onClick={() => onAddToOrder(selectedTable.id, prod)} className="w-full flex items-center gap-3 bg-white p-3 rounded-2xl border-2 border-transparent hover:border-blue-950 transition-all text-left">
                        <img src={prod.image} className="w-10 h-10 rounded-lg object-cover" />
                        <div className="flex-1 min-w-0"><h5 className="text-[9px] font-black uppercase truncate text-blue-950">{prod.name}</h5><p className="text-[9px] text-blue-900/40 italic font-black">R$ {prod.price.toFixed(2)}</p></div>
                        <div className="bg-yellow-400 text-blue-950 p-1.5 rounded-lg font-black">+</div>
                      </button>
                    ))}
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CATEGORIA */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-blue-950/90 backdrop-blur-md">
          <div className="bg-yellow-400 w-full max-w-sm rounded-[3rem] p-10 relative border-4 border-blue-950">
             <button onClick={() => setIsCategoryModalOpen(false)} className="absolute top-8 right-8 p-4 bg-blue-950 text-yellow-400 rounded-full"><CloseIcon size={20}/></button>
             <h3 className="text-2xl font-black italic mb-8 uppercase text-blue-950">Nova Categoria</h3>
             <form onSubmit={handleSaveCategory} className="space-y-4">
                <input type="text" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="NOME DA CATEGORIA" className="w-full bg-white border-2 border-blue-950 rounded-2xl px-6 py-4 text-xs font-black uppercase outline-none text-blue-950" required />
                <button type="submit" className="w-full bg-blue-950 text-yellow-400 py-5 rounded-2xl font-black text-[11px] uppercase shadow-xl">Salvar</button>
             </form>
          </div>
        </div>
      )}

      {/* MODAL PRODUTO */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-blue-950/95 backdrop-blur-2xl">
          <div className="bg-white w-full max-w-xl rounded-[3.5rem] p-10 relative shadow-2xl overflow-y-auto max-h-[90vh] no-scrollbar border-4 border-yellow-400">
             <button onClick={() => setIsProductModalOpen(false)} className="absolute top-8 right-8 p-4 bg-yellow-400 rounded-full text-blue-950"><CloseIcon size={20}/></button>
             <h3 className="text-2xl font-black italic mb-8 uppercase text-blue-950">{editingProduct?.id ? 'Editar' : 'Novo'} Produto</h3>
             <form onSubmit={(e) => { e.preventDefault(); onSaveProduct(editingProduct!); setIsProductModalOpen(false); }} className="space-y-6">
                <input type="text" value={editingProduct?.name || ''} onChange={e => setEditingProduct({...editingProduct, name: e.target.value})} placeholder="NOME DO PRODUTO" className="w-full bg-yellow-50 border-2 border-yellow-200 rounded-2xl px-6 py-4 text-xs font-black uppercase outline-none focus:border-blue-950 text-blue-950" required />
                <div className="grid grid-cols-2 gap-4">
                  <input type="number" step="0.01" value={editingProduct?.price || ''} onChange={e => setEditingProduct({...editingProduct, price: parseFloat(e.target.value)})} placeholder="PREÇO R$" className="w-full bg-yellow-50 border-2 border-yellow-200 rounded-2xl px-6 py-4 text-xs font-black outline-none focus:border-blue-950 text-blue-950" required />
                  <select value={editingProduct?.category || ''} onChange={e => setEditingProduct({...editingProduct, category: e.target.value})} className="w-full bg-yellow-50 border-2 border-yellow-200 rounded-2xl px-6 py-4 text-[10px] font-black uppercase outline-none focus:border-blue-950 text-blue-950" required>
                     {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
                  </select>
                </div>
                <textarea value={editingProduct?.description || ''} onChange={e => setEditingProduct({...editingProduct, description: e.target.value})} placeholder="DESCRIÇÃO..." className="w-full bg-yellow-50 border-2 border-yellow-200 rounded-2xl px-6 py-4 text-xs font-black outline-none h-24 resize-none text-blue-950" />
                <div className="flex flex-col items-center gap-4 p-6 bg-yellow-50 rounded-2xl border-2 border-dashed border-yellow-400">
                  {editingProduct?.image && <img src={editingProduct.image} className="w-40 h-40 object-cover rounded-xl shadow-md" />}
                  <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" className="hidden" />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="bg-blue-950 text-yellow-400 px-6 py-3 rounded-xl font-black text-[10px] uppercase">Escolher Foto 📸</button>
                </div>
                <div className="flex items-center justify-between p-5 bg-yellow-400 rounded-[2rem] border-2 border-blue-950">
                  <p className="font-black text-xs uppercase text-blue-950">Vendas Ativas</p>
                  <button type="button" onClick={() => setEditingProduct({...editingProduct, isAvailable: !editingProduct?.isAvailable})} className={`w-14 h-7 rounded-full transition-all relative ${editingProduct?.isAvailable ? 'bg-green-600' : 'bg-red-600'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${editingProduct?.isAvailable ? 'left-8' : 'left-1'}`} /></button>
                </div>
                <button type="submit" className="w-full bg-blue-950 text-yellow-400 py-6 rounded-2xl font-black text-sm uppercase shadow-2xl">Salvar Produto</button>
             </form>
          </div>
        </div>
      )}

      {/* MODAL CUPOM */}
      {isCouponModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-blue-950/95 backdrop-blur-md">
          <div className="bg-yellow-400 w-full max-w-md rounded-[3.5rem] p-10 relative border-4 border-blue-950">
            <button onClick={() => setIsCouponModalOpen(false)} className="absolute top-8 right-8 p-4 bg-blue-950 text-yellow-400 rounded-full"><CloseIcon size={20}/></button>
            <h3 className="text-2xl font-black italic mb-8 uppercase text-blue-950">Novo Cupom</h3>
            <form onSubmit={handleSaveCoupon} className="space-y-4">
              <input value={couponForm.code} onChange={e => setCouponForm({...couponForm, code: e.target.value})} placeholder="CÓDIGO (EX: MOREIRA10)" className="w-full bg-white border-2 border-blue-950 rounded-2xl px-6 py-4 text-xs font-black uppercase text-blue-950" required />
              <input type="number" value={couponForm.percentage} onChange={e => setCouponForm({...couponForm, percentage: e.target.value})} placeholder="PORCENTAGEM %" className="w-full bg-white border-2 border-blue-950 rounded-2xl px-6 py-4 text-xs font-black text-blue-950" required />
              <button type="submit" className="w-full bg-blue-950 text-yellow-400 py-6 rounded-2xl font-black text-sm uppercase shadow-xl">Ativar Cupom</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;