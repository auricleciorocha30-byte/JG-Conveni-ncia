
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Table, Order, Product, Category, Coupon, LoyaltyConfig, LoyaltyUser, OrderStatus, StoreConfig } from '../types';
import { CloseIcon, TrashIcon, VolumeIcon, PrinterIcon, EditIcon, BackupIcon, RestoreIcon, GasIcon } from './Icons';
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

const AdminPanel: React.FC<AdminPanelProps> = ({ 
  tables = [], menuItems = [], categories = [], audioEnabled, onToggleAudio, onTestSound,
  onUpdateTable, onRefreshData, onLogout, onSaveProduct, onDeleteProduct, dbStatus, onAddToOrder,
  storeConfig, onUpdateStoreConfig
}) => {
  const [activeTab, setActiveTab] = useState<'tables' | 'delivery' | 'menu' | 'marketing' | 'setup'>('tables');
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [productSearchInTable, setProductSearchInTable] = useState('');
  const [isDataProcessing, setIsDataProcessing] = useState(false);
  
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  
  const [newOrderForm, setNewOrderForm] = useState({ customerName: '', type: 'delivery' as 'delivery' | 'takeaway', address: '' });
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loyalty, setLoyalty] = useState<LoyaltyConfig>({ isActive: false, spendingGoal: 100, scopeType: 'all', scopeValue: '' });
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Partial<Coupon> | null>(null);
  const [couponForm, setCouponForm] = useState({ code: '', percentage: '', scopeType: 'all' as 'all' | 'category' | 'product', selectedItems: [] as string[] });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchMarketing(); }, []);

  const fetchMarketing = async () => {
    try {
      const { data: cData } = await supabase.from('coupons').select('*').order('code', { ascending: true });
      if (cData) setCoupons(cData.map(c => ({ id: c.id, code: c.code, percentage: c.percentage, isActive: c.is_active, scopeType: c.scope_type, scopeValue: c.scope_value || '' })));
      const { data: lConfig } = await supabase.from('loyalty_config').select('*').maybeSingle();
      if (lConfig) setLoyalty({ isActive: lConfig.is_active ?? false, spendingGoal: lConfig.spending_goal ?? 100, scopeType: lConfig.scope_type || 'all', scopeValue: lConfig.scope_value || '' });
    } catch (e) { console.error("Error fetching marketing data", e); }
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
      if (editingCoupon?.id) await supabase.from('coupons').update(couponData).eq('id', editingCoupon.id);
      else await supabase.from('coupons').insert([{ id: 'c_'+Date.now(), ...couponData }]); 
      setIsCouponModalOpen(false);
      fetchMarketing();
    } catch (err) { alert(`Erro ao salvar cupom.`); } finally { setIsDataProcessing(false); }
  };

  const handleUpdateLoyalty = async (updates: Partial<LoyaltyConfig>) => {
    const next = { ...loyalty, ...updates };
    setLoyalty(next);
    await supabase.from('loyalty_config').upsert({ id: 1, is_active: next.isActive, spending_goal: next.spendingGoal, scope_type: next.scopeType, scope_value: next.scopeValue }, { onConflict: 'id' });
  };

  const toggleLoyaltyItem = (val: string) => {
    const currentItems = loyalty.scopeValue ? loyalty.scopeValue.split(',').filter(Boolean) : [];
    const nextItems = currentItems.includes(val) ? currentItems.filter(i => i !== val) : [...currentItems, val];
    handleUpdateLoyalty({ scopeValue: nextItems.join(',') });
  };

  const toggleCouponItem = (val: string) => {
    setCouponForm(prev => {
      const items = prev.selectedItems.includes(val) ? prev.selectedItems.filter(i => i !== val) : [...prev.selectedItems, val];
      return { ...prev, selectedItems: items };
    });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Imagem muito grande! Escolha uma de até 2MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditingProduct(prev => prev ? { ...prev, image: reader.result as string } : null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExportBackup = () => {
    const backupData = { tables, menuItems, categories, coupons, loyalty, storeConfig, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup-jg-convenient-${new Date().getTime()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const physicalTables = tables.filter(t => t.id <= 12).sort((a,b) => a.id - b.id);
  const activeDeliveries = tables.filter(t => t.id >= 900 && t.id <= 949 && t.status === 'occupied');
  const activeCounter = tables.filter(t => t.id >= 950 && t.id <= 999 && t.status === 'occupied');
  const selectedTable = tables.find(t => t.id === selectedTableId) || null;
  const filteredMenu = (menuItems || []).filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const tableSearchProducts = (menuItems || []).filter(i => i.isAvailable && i.name.toLowerCase().includes(productSearchInTable.toLowerCase())).slice(0, 5);
  const loyaltyScopeItems = useMemo(() => (loyalty.scopeValue || "").split(',').filter(Boolean), [loyalty.scopeValue]);

  const handleUpdateTableStatus = async (tableId: number, newStatus: OrderStatus) => {
    const table = tables.find(t => t.id === tableId);
    if (!table || !table.currentOrder) return;
    const updatedOrder = { ...table.currentOrder, status: newStatus, isUpdated: true };
    await onUpdateTable(tableId, 'occupied', updatedOrder);
  };

  return (
    <div className="w-full">
      <div className="bg-blue-950 p-5 rounded-[2.5rem] shadow-2xl mb-8 border-b-4 border-yellow-400 flex flex-col md:flex-row justify-between items-center gap-5">
        <div className="flex items-center gap-4">
          <div className="bg-yellow-400 p-2 rounded-xl rotate-3 shadow-lg">
            <GasIcon size={24} className="text-blue-950" />
          </div>
          <div>
            <h2 className="text-xl font-black italic text-yellow-400 uppercase leading-none">{STORE_INFO.name}</h2>
            <p className="text-[8px] text-white/40 uppercase font-black mt-1">PAINEL DE GESTÃO</p>
          </div>
        </div>
        <nav className="flex bg-blue-900/40 p-1 rounded-xl gap-1 overflow-x-auto no-scrollbar max-w-full">
          {(['tables', 'delivery', 'menu', 'marketing', 'setup'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2.5 rounded-lg text-[9px] font-black uppercase transition-all whitespace-nowrap ${activeTab === tab ? 'bg-yellow-400 text-blue-950 shadow-lg scale-105' : 'text-white/40 hover:text-white'}`}>
              {tab === 'tables' ? 'Mesas' : tab === 'delivery' ? 'Externo' : tab === 'menu' ? 'Menu' : tab === 'marketing' ? 'Mkt' : 'Setup'}
            </button>
          ))}
        </nav>
        <div className="flex gap-3 items-center">
          <button onClick={() => window.open(window.location.origin + window.location.pathname + '?view=menu', '_blank')} className="bg-yellow-400 text-blue-950 font-black text-[9px] uppercase px-5 py-3 rounded-xl shadow-xl hover:scale-105 transition-all">Ver Cardápio 📋</button>
          <button onClick={onLogout} className="bg-red-600 text-white font-black text-[9px] uppercase px-4 py-2.5 rounded-xl active:scale-95 transition-all">Sair</button>
        </div>
      </div>

      <div className="animate-in fade-in duration-500">
        {activeTab === 'setup' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <div className="bg-white p-10 rounded-[3rem] shadow-xl border-4 border-yellow-400">
              <h3 className="text-xl font-black italic uppercase mb-8 tracking-tighter text-blue-950">Serviços Ativos</h3>
              <div className="space-y-4">
                {[
                  { key: 'tablesEnabled', label: 'Atendimento Mesas', icon: '🪑' },
                  { key: 'deliveryEnabled', label: 'Serviço Entrega', icon: '🚚' },
                  { key: 'counterEnabled', label: 'Retirada Balcão', icon: '🏪' },
                  { key: 'statusPanelEnabled', label: 'Painel Status Público', icon: '📺' }
                ].map(opt => (
                  <div key={opt.key} className="flex items-center justify-between p-5 bg-yellow-50 rounded-[2rem] border border-yellow-100">
                    <div className="flex items-center gap-4"><span className="text-xl">{opt.icon}</span><span className="font-black text-[10px] uppercase tracking-wider text-blue-950">{opt.label}</span></div>
                    <button onClick={() => onUpdateStoreConfig({ ...storeConfig, [opt.key]: !storeConfig[opt.key as keyof StoreConfig] })} className={`w-14 h-7 rounded-full transition-all relative ${storeConfig[opt.key as keyof StoreConfig] ? 'bg-green-500' : 'bg-gray-300'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${storeConfig[opt.key as keyof StoreConfig] ? 'left-8' : 'left-1'}`} /></button>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-blue-950 p-10 rounded-[3rem] shadow-xl border-4 border-yellow-400 flex flex-col">
              <h3 className="text-xl font-black italic uppercase mb-8 tracking-tighter text-yellow-400">Dados e Links</h3>
              <div className="space-y-4">
                 <button onClick={() => window.open(window.location.origin + window.location.pathname + '?view=tv', '_blank')} className="w-full p-6 bg-yellow-400 text-blue-950 rounded-[2rem] flex items-center justify-between hover:scale-[1.02] transition-all shadow-xl"><p className="font-black text-xs uppercase">🖥️ Abrir Painel TV</p></button>
                 <button onClick={handleExportBackup} className="w-full p-6 bg-blue-900/40 text-yellow-400 border-2 border-dashed border-yellow-400/30 rounded-[2rem] flex items-center justify-between hover:bg-blue-900/60 transition-all"><p className="font-black text-xs uppercase">Gerar Backup Local</p><BackupIcon size={20} /></button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'delivery' && (
          <div className="space-y-8">
            <div className="bg-blue-950 p-6 rounded-[2.5rem] border-2 border-yellow-400 shadow-sm flex justify-between items-center">
               <h3 className="text-xl font-black italic uppercase text-yellow-400">Pedidos Externos</h3>
               <button onClick={() => setIsNewOrderModalOpen(true)} className="bg-yellow-400 text-blue-950 px-6 py-3 rounded-xl font-black text-[10px] uppercase shadow-lg hover:brightness-110">+ Novo Pedido</button>
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

        {activeTab === 'menu' && (
          <div className="space-y-8">
            <div className="bg-white p-8 rounded-[3rem] shadow-xl border-4 border-yellow-400">
              <div className="flex justify-between items-center mb-10"><h3 className="text-2xl font-black italic uppercase text-blue-950">Categorias</h3><button onClick={() => setIsCategoryModalOpen(true)} className="bg-blue-950 text-yellow-400 px-6 py-3 rounded-xl font-black text-[10px] uppercase shadow-lg">+ Adicionar</button></div>
              <div className="flex flex-wrap gap-3">
                {categories.map(cat => (
                  <div key={cat.id} className="bg-yellow-400 px-5 py-3 rounded-xl border-2 border-blue-950 flex items-center gap-3 group shadow-sm">
                    <span className="font-black text-[10px] uppercase tracking-wider text-blue-950">{cat.name}</span>
                    <button onClick={async () => { if(confirm('Excluir categoria?')) { await supabase.from('categories').delete().eq('id', cat.id); onRefreshData(); } }} className="text-red-700 opacity-0 group-hover:opacity-100 transition-all"><TrashIcon size={14}/></button>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-white p-8 rounded-[3rem] shadow-xl border-4 border-blue-950">
              <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-6">
                <h3 className="text-2xl font-black italic uppercase text-blue-950">Produtos</h3>
                <div className="flex gap-4 w-full md:w-auto">
                  <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="PESQUISAR PRODUTO..." className="flex-1 md:w-64 bg-yellow-50 border-2 border-yellow-400 rounded-xl px-4 py-3 text-[10px] font-black outline-none focus:border-blue-950" />
                  <button onClick={() => { setEditingProduct({ name: '', price: 0, category: categories[0]?.name || '', image: '', description: '', isAvailable: true }); setIsProductModalOpen(true); }} className="bg-blue-950 text-yellow-400 px-6 py-3 rounded-xl font-black text-[10px] uppercase shadow-xl hover:brightness-125 transition-all">+ Novo Item</button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-6">
                {filteredMenu.map(item => (
                  <div key={item.id} className={`bg-white p-4 rounded-[2.5rem] border-2 transition-all shadow-sm flex flex-col ${!item.isAvailable ? 'opacity-60 grayscale' : 'border-yellow-400 hover:border-blue-950'}`}>
                    <img src={item.image} className="w-full aspect-square object-cover rounded-2xl mb-4 shadow-sm" />
                    <h4 className="font-black text-[10px] uppercase truncate mb-1 text-blue-950">{item.name}</h4>
                    <p className="text-[8px] text-blue-900/40 font-bold uppercase mb-3 line-clamp-1">{item.description || 'Sem descrição'}</p>
                    <div className="mt-auto flex justify-between items-center">
                      <span className="text-blue-950 font-black italic text-xs">R$ {(item.price || 0).toFixed(2)}</span>
                      <div className="flex gap-2">
                         <button onClick={() => { setEditingProduct(item); setIsProductModalOpen(true); }} className="text-blue-700 hover:scale-110 transition-transform"><EditIcon size={16}/></button>
                         <button onClick={() => onDeleteProduct(item.id)} className="text-red-600 hover:scale-110 transition-transform"><TrashIcon size={16}/></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'marketing' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white p-8 rounded-[3rem] shadow-xl border-4 border-yellow-400 flex flex-col min-h-[500px]">
              <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-black italic uppercase text-blue-950">💎 Fidelidade</h3><button onClick={() => handleUpdateLoyalty({ isActive: !loyalty.isActive })} className={`px-4 py-2 rounded-xl font-black text-[9px] uppercase transition-all ${loyalty.isActive ? 'bg-green-600 text-white' : 'bg-yellow-400 text-blue-950'}`}>{loyalty.isActive ? 'Ativo' : 'Pausado'}</button></div>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div><p className="text-[9px] font-black uppercase text-blue-900/30 mb-1">Meta R$</p><input type="number" value={loyalty.spendingGoal} onChange={e => handleUpdateLoyalty({ spendingGoal: Number(e.target.value) })} className="w-full bg-yellow-50 border-2 border-yellow-400 rounded-xl p-4 font-black outline-none focus:border-blue-950 text-blue-950" /></div>
                <div><p className="text-[9px] font-black uppercase text-blue-900/30 mb-1">Abrangência</p><select value={loyalty.scopeType} onChange={e => handleUpdateLoyalty({ scopeType: e.target.value as any, scopeValue: '' })} className="w-full bg-yellow-50 border-2 border-yellow-400 rounded-xl p-4 font-black outline-none focus:border-blue-950 text-xs uppercase text-blue-950"><option value="all">Loja Toda</option><option value="category">Categorias</option><option value="product">Produtos</option></select></div>
              </div>
              {loyalty.scopeType !== 'all' && (
                <div className="flex-1 bg-yellow-50 p-6 rounded-[2rem] border-2 border-dashed border-yellow-400 overflow-y-auto no-scrollbar max-h-80">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {loyalty.scopeType === 'category' ? categories.map(c => (
                      <button key={c.id} onClick={() => toggleLoyaltyItem(c.name)} className={`p-3 rounded-xl border-2 font-black text-[9px] uppercase transition-all ${loyaltyScopeItems.includes(c.name) ? 'bg-blue-950 text-yellow-400 border-blue-950' : 'bg-white border-yellow-100 text-blue-900/30'}`}>{c.name}</button>
                    )) : menuItems.map(p => (
                      <button key={p.id} onClick={() => toggleLoyaltyItem(p.id)} className={`p-3 rounded-xl border-2 font-black text-[9px] uppercase transition-all ${loyaltyScopeItems.includes(p.id) ? 'bg-blue-950 text-yellow-400 border-blue-950' : 'bg-white border-yellow-100 text-blue-900/30 truncate'}`}>{p.name}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="lg:col-span-1 bg-blue-950 p-8 rounded-[3rem] shadow-xl border-4 border-yellow-400 flex flex-col min-h-[500px]">
              <div className="flex justify-between items-center mb-8"><h3 className="text-xl font-black italic uppercase text-yellow-400">🎫 Cupons</h3><button onClick={() => { setEditingCoupon(null); setCouponForm({ code: '', percentage: '', scopeType: 'all', selectedItems: [] }); setIsCouponModalOpen(true); }} className="bg-yellow-400 text-blue-950 px-4 py-2 rounded-xl font-black text-[9px] uppercase shadow-md">+ Adicionar</button></div>
              <div className="space-y-4 overflow-y-auto no-scrollbar flex-1">
                {coupons.map(c => (
                  <div key={c.id} className="p-4 bg-blue-900/40 rounded-2xl border border-yellow-400/20 flex justify-between items-center group text-white"><div className="flex flex-col"><span className="bg-yellow-400 text-blue-950 px-3 py-1 rounded-lg font-black text-[10px] w-fit mb-1 shadow-sm">{c.code}</span><span className="text-[9px] font-bold text-green-400 uppercase">{c.percentage}% DESCONTO</span></div><button onClick={async () => { await supabase.from('coupons').delete().eq('id', c.id); fetchMarketing(); }} className="text-red-500 hover:scale-110 transition-transform"><TrashIcon size={16}/></button></div>
                ))}
              </div>
            </div>
          </div>
        )}

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
      </div>

      {/* MODAL CATEGORIA */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-blue-950/90 backdrop-blur-md">
          <div className="bg-yellow-400 w-full max-w-sm rounded-[3rem] p-10 relative animate-in zoom-in border-4 border-blue-950">
             <button onClick={() => setIsCategoryModalOpen(false)} className="absolute top-8 right-8 p-4 bg-blue-950 text-yellow-400 rounded-full hover:bg-red-600 hover:text-white transition-colors"><CloseIcon size={20}/></button>
             <h3 className="text-2xl font-black italic mb-8 uppercase text-blue-950">Nova Categoria</h3>
             <form onSubmit={handleSaveCategory} className="space-y-4">
                <input type="text" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="NOME DA CATEGORIA" className="w-full bg-white border-2 border-blue-950 rounded-2xl px-6 py-4 text-xs font-black uppercase outline-none focus:ring-4 focus:ring-blue-950/10 transition-all text-blue-950" required />
                <button type="submit" className="w-full bg-blue-950 text-yellow-400 py-5 rounded-2xl font-black text-[11px] uppercase shadow-xl hover:brightness-125 transition-all">Salvar</button>
             </form>
          </div>
        </div>
      )}

      {/* MODAL PRODUTO */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-blue-950/95 backdrop-blur-2xl">
          <div className="bg-white w-full max-w-xl rounded-[3.5rem] p-10 relative shadow-2xl overflow-y-auto max-h-[90vh] no-scrollbar animate-in zoom-in border-4 border-yellow-400">
             <button onClick={() => setIsProductModalOpen(false)} className="absolute top-8 right-8 p-4 bg-yellow-400 rounded-full text-blue-950 hover:bg-red-600 hover:text-white transition-colors"><CloseIcon size={20}/></button>
             <h3 className="text-2xl font-black italic mb-8 uppercase tracking-tighter text-blue-950">{editingProduct?.id ? 'Editar' : 'Novo'} Produto</h3>
             <form onSubmit={(e) => { e.preventDefault(); onSaveProduct(editingProduct!); setIsProductModalOpen(false); }} className="space-y-6 text-blue-950">
                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase text-blue-900/30 ml-2">Nome</p>
                  <input type="text" value={editingProduct?.name || ''} onChange={e => setEditingProduct({...editingProduct, name: e.target.value})} placeholder="EX: HAMBÚRGUER ARTESANAL" className="w-full bg-yellow-50 border-2 border-yellow-200 rounded-2xl px-6 py-4 text-xs font-black outline-none uppercase focus:border-blue-950 transition-all text-blue-950" required />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-[9px] font-black uppercase text-blue-900/30 ml-2">Preço R$</p>
                    <input type="number" step="0.01" value={editingProduct?.price || ''} onChange={e => setEditingProduct({...editingProduct, price: parseFloat(e.target.value)})} placeholder="0.00" className="w-full bg-yellow-50 border-2 border-yellow-200 rounded-2xl px-6 py-4 text-xs font-black outline-none focus:border-blue-950 transition-all text-blue-950" required />
                  </div>
                  <div className="space-y-2">
                    <p className="text-[9px] font-black uppercase text-blue-900/30 ml-2">Categoria</p>
                    <select value={editingProduct?.category || ''} onChange={e => setEditingProduct({...editingProduct, category: e.target.value})} className="w-full bg-yellow-50 border-2 border-yellow-200 rounded-2xl px-6 py-4 text-[10px] font-black outline-none uppercase focus:border-blue-950 transition-all text-blue-950" required>
                       <option value="">ESCOLHA UMA CATEGORIA</option>
                       {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase text-blue-900/30 ml-2">Descrição</p>
                  <textarea value={editingProduct?.description || ''} onChange={e => setEditingProduct({...editingProduct, description: e.target.value})} placeholder="DETALHES DO PRODUTO..." className="w-full bg-yellow-50 border-2 border-yellow-200 rounded-2xl px-6 py-4 text-xs font-black outline-none h-24 resize-none focus:border-blue-950 transition-all text-blue-950" />
                </div>

                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase text-blue-900/30 ml-2">Foto</p>
                  <div className="flex flex-col items-center gap-4 p-6 bg-yellow-50 rounded-2xl border-2 border-dashed border-yellow-400">
                    {editingProduct?.image ? (
                      <div className="relative w-40 h-40 group">
                        <img src={editingProduct.image} className="w-full h-full object-cover rounded-xl shadow-md border-2 border-blue-950" />
                        <button type="button" onClick={() => setEditingProduct({...editingProduct, image: ''})} className="absolute -top-2 -right-2 bg-red-600 text-white p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"><TrashIcon size={14}/></button>
                      </div>
                    ) : (
                      <div className="w-40 h-40 bg-white rounded-xl flex items-center justify-center text-yellow-200">
                         <PrinterIcon size={40} />
                      </div>
                    )}
                    <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" className="hidden" />
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="bg-blue-950 text-yellow-400 px-6 py-3 rounded-xl font-black text-[10px] uppercase shadow-lg hover:brightness-125 transition-all">Tirar/Subir Foto 📸</button>
                    <p className="text-[8px] font-bold text-blue-900/30 uppercase text-center italic">Imagens até 2MB</p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-5 bg-yellow-400 rounded-[2rem] border-2 border-blue-950 shadow-inner">
                  <div>
                    <p className="font-black text-xs uppercase mb-1 text-blue-950">Vendas Ativas</p>
                    <p className="text-[8px] font-bold text-blue-900/40 uppercase">{editingProduct?.isAvailable ? 'SIM, ESTÁ DISPONÍVEL' : 'NÃO, ESTÁ ESGOTADO'}</p>
                  </div>
                  <button type="button" onClick={() => setEditingProduct({...editingProduct, isAvailable: !editingProduct?.isAvailable})} className={`w-14 h-7 rounded-full transition-all relative ${editingProduct?.isAvailable ? 'bg-green-600' : 'bg-red-600'}`}>
                    <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${editingProduct?.isAvailable ? 'left-8' : 'left-1'}`} />
                  </button>
                </div>

                <button type="submit" className="w-full bg-blue-950 text-yellow-400 py-6 rounded-2xl font-black text-sm uppercase shadow-2xl hover:brightness-125 transition-all">Salvar Produto</button>
             </form>
          </div>
        </div>
      )}

      {/* MODAL NOVO PEDIDO EXTERNO */}
      {isNewOrderModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-blue-950/95 backdrop-blur-md">
          <div className="bg-yellow-400 w-full max-w-sm rounded-[3.5rem] p-10 relative shadow-2xl animate-in zoom-in border-4 border-blue-950">
             <button onClick={() => setIsNewOrderModalOpen(false)} className="absolute top-8 right-8 p-4 bg-blue-950 text-yellow-400 rounded-full hover:bg-red-600 hover:text-white transition-colors"><CloseIcon size={20}/></button>
             <h3 className="text-2xl font-black italic mb-8 uppercase tracking-tighter text-blue-950">Lançar Externo</h3>
             <form onSubmit={async (e) => {
               e.preventDefault();
               const range = newOrderForm.type === 'delivery' ? [900, 949] : [950, 999];
               const free = tables.find(t => t.id >= range[0] && t.id <= range[1] && t.status === 'free');
               if (!free) return alert('Sem vagas disponíveis para esta modalidade.');
               
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
             }} className="space-y-4">
                <input type="text" value={newOrderForm.customerName} onChange={e => setNewOrderForm({...newOrderForm, customerName: e.target.value})} placeholder="NOME DO CLIENTE" className="w-full bg-white border-2 border-blue-950 rounded-2xl px-6 py-4 text-xs font-black uppercase outline-none focus:ring-4 focus:ring-blue-950/10 transition-all text-blue-950" required />
                <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setNewOrderForm({...newOrderForm, type: 'delivery'})} className={`py-3 rounded-xl text-[9px] font-black uppercase border-2 transition-all ${newOrderForm.type === 'delivery' ? 'bg-blue-950 text-yellow-400 shadow-md' : 'bg-white text-blue-900/30'}`}>Entrega</button><button type="button" onClick={() => setNewOrderForm({...newOrderForm, type: 'takeaway'})} className={`py-3 rounded-xl text-[9px] font-black uppercase border-2 transition-all ${newOrderForm.type === 'takeaway' ? 'bg-blue-950 text-yellow-400 shadow-md' : 'bg-white text-blue-900/30'}`}>Balcão</button></div>
                {newOrderForm.type === 'delivery' && (<textarea value={newOrderForm.address} onChange={e => setNewOrderForm({...newOrderForm, address: e.target.value})} placeholder="ENDEREÇO DE ENTREGA" className="w-full bg-white border-2 border-blue-950 rounded-2xl px-6 py-4 text-xs font-black outline-none h-24 resize-none focus:ring-4 focus:ring-blue-950/10 transition-all text-blue-950" required />)}
                <button type="submit" className="w-full bg-blue-950 text-yellow-400 py-5 rounded-2xl font-black text-[10px] uppercase shadow-xl hover:brightness-125 transition-all">Lançar Agora</button>
             </form>
          </div>
        </div>
      )}

      {/* MODAL DETALHES PEDIDO DA MESA / EXTERNO */}
      {selectedTable && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-blue-950/95 backdrop-blur-md" onClick={() => setSelectedTableId(null)} />
          <div className="relative bg-white w-full max-w-6xl h-[92vh] rounded-[3rem] flex flex-col md:flex-row overflow-hidden shadow-2xl border-t-8 border-yellow-400 animate-in zoom-in duration-300">
            {/* Lado Esquerdo: Itens e Ações */}
            <div className="flex-1 flex flex-col h-full bg-white border-r">
               <div className="p-6 border-b flex justify-between items-center bg-white shadow-sm shrink-0">
                  <div>
                    <h3 className="text-2xl font-black uppercase italic tracking-tighter text-blue-950">{selectedTable.id >= 950 ? 'Balcão' : selectedTable.id >= 900 ? 'Entrega' : `Mesa ${selectedTable.id}`}</h3>
                    <p className="text-[10px] font-black text-blue-900/40 uppercase mt-1">ID: #{selectedTable.currentOrder?.id} • {STATUS_CFG[selectedTable.currentOrder?.status || 'pending'].label}</p>
                  </div>
                  <button onClick={() => setSelectedTableId(null)} className="md:hidden p-4 bg-yellow-400 text-blue-950 rounded-full transition-colors"><CloseIcon size={20}/></button>
               </div>
               
               <div className="flex-1 overflow-y-auto p-6 space-y-6">
                 <div className="bg-yellow-400 p-6 rounded-[2rem] border-2 border-blue-950 flex justify-between items-center shadow-xl">
                    <div><p className="text-[8px] font-black text-blue-950/60 uppercase tracking-widest leading-none mb-1 text-blue-950">Cliente</p><p className="font-black text-lg uppercase tracking-tight truncate leading-none text-blue-950">{selectedTable.currentOrder?.customerName}</p></div>
                    <div className="text-right"><p className="text-[8px] font-black text-blue-950/60 uppercase tracking-widest leading-none mb-1 text-blue-950">Subtotal</p><p className="text-3xl font-black italic text-blue-950 leading-none">R$ {(selectedTable.currentOrder?.finalTotal || 0).toFixed(2)}</p></div>
                 </div>

                 <div className="space-y-3">
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-900/30 ml-2">Lista de Itens</h4>
                   {selectedTable.currentOrder?.items.map((item, i) => (
                     <div key={i} className="flex gap-4 bg-white p-4 rounded-[1.5rem] border-2 border-yellow-100 shadow-sm items-center group relative">
                       <img src={item.image} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                       <div className="flex-1 min-w-0"><h4 className="text-[10px] font-black uppercase leading-tight truncate text-blue-950">{item.name}</h4><p className="text-[8px] text-blue-900/40 font-bold uppercase">{item.quantity}x R$ {item.price.toFixed(2)}</p></div>
                       <div className="text-right font-black shrink-0 text-blue-950"><p className="text-xs italic">R$ {(item.price * item.quantity).toFixed(2)}</p></div>
                     </div>
                   ))}
                   {(!selectedTable.currentOrder?.items || selectedTable.currentOrder.items.length === 0) && (
                      <p className="text-center py-10 text-yellow-600 font-black uppercase text-[10px] italic">Nenhum item adicionado ainda</p>
                   )}
                 </div>

                 <div className="space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-900/30 ml-2">Status do Pedido</h4>
                    <div className="grid grid-cols-2 gap-2">
                       {(['pending', 'preparing', 'ready', 'delivered'] as OrderStatus[]).map(s => (
                          <button key={s} onClick={() => handleUpdateTableStatus(selectedTable.id, s)} className={`py-3.5 rounded-xl text-[9px] font-black uppercase border-2 transition-all ${selectedTable.currentOrder?.status === s ? 'bg-blue-950 text-yellow-400 border-blue-950 shadow-lg' : 'bg-yellow-50 text-blue-900/30 border-yellow-100 hover:border-blue-950'}`}>{STATUS_CFG[s].label}</button>
                       ))}
                    </div>
                 </div>

                 <button onClick={() => { if(confirm('Encerrar conta e liberar?')) { onUpdateTable(selectedTable.id, 'free'); setSelectedTableId(null); } }} className="w-full bg-green-600 text-white py-5 rounded-2xl font-black uppercase text-[11px] shadow-xl hover:brightness-110 active:scale-95 transition-all">Encerrar e Liberar 🏁</button>
               </div>
            </div>

            {/* Lado Direito: Adição de Itens */}
            <div className="w-full md:w-80 bg-yellow-50 flex flex-col h-full border-l border-yellow-400">
               <div className="p-6 border-b bg-yellow-400 flex justify-between items-center shrink-0">
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-blue-950">Lançamento</h4>
                  <button onClick={() => setSelectedTableId(null)} className="hidden md:block p-3 bg-blue-950 text-yellow-400 rounded-full shadow-sm"><CloseIcon size={18}/></button>
               </div>
               
               <div className="p-6 space-y-4 flex flex-col flex-1 overflow-hidden">
                  <div className="relative">
                    <input type="text" value={productSearchInTable} onChange={e => setProductSearchInTable(e.target.value)} placeholder="PESQUISAR..." className="w-full bg-white border-2 border-blue-950 rounded-xl px-4 py-3 text-[10px] font-black outline-none shadow-sm focus:ring-4 focus:ring-blue-950/10 text-blue-950" />
                  </div>
                  
                  <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
                    {tableSearchProducts.map(prod => (
                      <button key={prod.id} onClick={() => onAddToOrder(selectedTable.id, prod)} className="w-full flex items-center gap-3 bg-white p-3 rounded-2xl border-2 border-transparent hover:border-blue-950 transition-all group text-left shadow-sm">
                        <img src={prod.image} className="w-10 h-10 rounded-lg object-cover group-hover:scale-110 transition-transform" />
                        <div className="flex-1 min-w-0">
                          <h5 className="text-[9px] font-black uppercase truncate leading-none mb-1 text-blue-950">{prod.name}</h5>
                          <p className="text-[9px] text-blue-900/40 font-black italic leading-none">R$ {prod.price.toFixed(2)}</p>
                        </div>
                        <div className="bg-yellow-400 text-blue-950 p-1.5 rounded-lg font-black group-hover:bg-blue-950 group-hover:text-yellow-400 transition-colors">+</div>
                      </button>
                    ))}
                    {productSearchInTable && tableSearchProducts.length === 0 && (
                      <p className="text-center py-4 text-[9px] font-black text-yellow-600 uppercase">Não encontrado</p>
                    )}
                    {!productSearchInTable && (
                      <p className="text-center py-10 text-[9px] font-black text-blue-900/20 uppercase tracking-widest opacity-40 italic text-center">Digite para buscar produtos</p>
                    )}
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CUPOM */}
      {isCouponModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-blue-950/95 backdrop-blur-md">
          <div className="bg-yellow-400 w-full max-w-md rounded-[3.5rem] p-10 relative shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in border-4 border-blue-950">
            <button onClick={() => setIsCouponModalOpen(false)} className="absolute top-8 right-8 p-4 bg-blue-950 text-yellow-400 rounded-full hover:bg-red-600 hover:text-white transition-colors"><CloseIcon size={20}/></button>
            <h3 className="text-2xl font-black italic mb-8 uppercase text-blue-950">Novo Cupom</h3>
            <form onSubmit={handleSaveCoupon} className="space-y-6 overflow-y-auto no-scrollbar pr-1">
              <input value={couponForm.code} onChange={e => setCouponForm({...couponForm, code: e.target.value})} placeholder="CÓDIGO (EX: JG10)" className="w-full bg-white border-2 border-blue-950 rounded-2xl px-6 py-4 text-xs font-black uppercase outline-none focus:ring-4 focus:ring-blue-950/10 text-blue-950" required />
              <input type="number" value={couponForm.percentage} onChange={e => setCouponForm({...couponForm, percentage: e.target.value})} placeholder="PORCENTAGEM %" className="w-full bg-white border-2 border-blue-950 rounded-2xl px-6 py-4 text-xs font-black outline-none focus:ring-4 focus:ring-blue-950/10 text-blue-950" required />
              <div className="flex bg-blue-900/20 p-1 rounded-xl gap-1">
                {(['all', 'category', 'product'] as const).map(s => (
                  <button key={s} type="button" onClick={() => setCouponForm({...couponForm, scopeType: s, selectedItems: []})} className={`flex-1 py-3 rounded-lg text-[8px] font-black uppercase transition-all ${couponForm.scopeType === s ? 'bg-blue-950 text-yellow-400 shadow-md' : 'text-blue-950/40'}`}>{s === 'all' ? 'Geral' : s === 'category' ? 'Cats' : 'Prods'}</button>
                ))}
              </div>
              {couponForm.scopeType !== 'all' && (
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto no-scrollbar p-2 bg-white/40 rounded-xl border-2 border-dashed border-blue-950/20">
                  {couponForm.scopeType === 'category' ? categories.map(cat => (
                    <button key={cat.id} type="button" onClick={() => toggleCouponItem(cat.name)} className={`p-2 rounded-lg border-2 text-[8px] font-black uppercase transition-all ${couponForm.selectedItems.includes(cat.name) ? 'bg-blue-950 text-yellow-400 border-blue-950' : 'bg-white border-transparent text-blue-950/40'}`}>{cat.name}</button>
                  )) : menuItems.map(prod => (
                    <button key={prod.id} type="button" onClick={() => toggleCouponItem(prod.id)} className={`p-2 rounded-lg border-2 text-[8px] font-black uppercase transition-all ${couponForm.selectedItems.includes(prod.id) ? 'bg-blue-950 text-yellow-400 border-blue-950' : 'bg-white border-transparent text-blue-950/40 truncate'}`}>{prod.name}</button>
                  ))}
                </div>
              )}
              <button type="submit" className="w-full bg-blue-950 text-yellow-400 py-6 rounded-2xl font-black text-sm uppercase shadow-xl hover:brightness-125 transition-all">Ativar Cupom</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
