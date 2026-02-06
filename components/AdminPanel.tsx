
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

const AdminPanel: React.FC<AdminPanelProps> = ({ 
  tables = [], menuItems = [], categories = [], audioEnabled, onToggleAudio, onTestSound,
  onUpdateTable, onRefreshData, onLogout, onSaveProduct, onDeleteProduct, dbStatus, onAddToOrder,
  storeConfig, onUpdateStoreConfig
}) => {
  const [activeTab, setActiveTab] = useState<'tables' | 'delivery' | 'menu' | 'marketing' | 'setup'>('tables');
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [isWaiterManagerOpen, setIsWaiterManagerOpen] = useState(false);
  const [isDataProcessing, setIsDataProcessing] = useState(false);
  
  // States simplificados para manter o foco na nova funcionalidade
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [productSearchInTable, setProductSearchInTable] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const physicalTables = tables.filter(t => t.id <= 12).sort((a,b) => a.id - b.id);
  const filteredMenu = (menuItems || []).filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const tableSearchProducts = (menuItems || []).filter(i => i.isAvailable && i.name.toLowerCase().includes(productSearchInTable.toLowerCase())).slice(0, 5);

  const handleUpdateTableStatus = async (tableId: number, newStatus: OrderStatus) => {
    const table = tables.find(t => t.id === tableId);
    if (!table || !table.currentOrder) return;
    const updatedOrder = { ...table.currentOrder, status: newStatus, isUpdated: true };
    await onUpdateTable(tableId, 'occupied', updatedOrder);
  };

  const handlePrintOrder = (order: Order) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const itemsHtml = order.items.map(item => `
      <tr><td>${item.quantity}x ${item.name}</td><td style="text-align: right;">R$ ${(item.price * item.quantity).toFixed(2)}</td></tr>
    `).join('');
    printWindow.document.write(`<html><body style="font-family: monospace; width: 72mm; padding: 10px;"><h2>${STORE_INFO.name}</h2><p>PEDIDO: #${order.id}</p><hr/><table>${itemsHtml}</table><hr/><h3>TOTAL: R$ ${order.finalTotal.toFixed(2)}</h3><script>window.print(); setTimeout(() => window.close(), 1000);</script></body></html>`);
    printWindow.document.close();
  };

  return (
    <div className="w-full">
      <div className="bg-blue-950 p-5 rounded-[2.5rem] shadow-2xl mb-8 border-b-4 border-yellow-400 flex flex-col md:flex-row justify-between items-center gap-5">
        <div className="flex items-center gap-4">
          <div className="bg-yellow-400 p-2 rounded-xl rotate-3 shadow-lg"><GasIcon size={24} className="text-blue-950" /></div>
          <div><h2 className="text-xl font-black italic text-yellow-400 uppercase leading-none">{STORE_INFO.name}</h2><p className="text-[8px] text-white/40 uppercase font-black mt-1">PAINEL DE GESTÃO</p></div>
        </div>
        <nav className="flex bg-blue-900/40 p-1 rounded-xl gap-1 overflow-x-auto no-scrollbar max-w-full">
          {(['tables', 'delivery', 'menu', 'marketing', 'setup'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2.5 rounded-lg text-[9px] font-black uppercase transition-all whitespace-nowrap ${activeTab === tab ? 'bg-yellow-400 text-blue-950 shadow-lg scale-105' : 'text-white/40 hover:text-white'}`}>{tab}</button>
          ))}
        </nav>
        <div className="flex gap-2 items-center">
          <button onClick={() => window.open(window.location.origin + window.location.pathname + '?view=waiter', '_blank')} className="bg-green-600 text-white font-black text-[9px] uppercase px-4 py-3 rounded-xl shadow-xl hover:scale-105 transition-all">GARÇOM 🤵</button>
          <button onClick={() => setIsWaiterManagerOpen(true)} className="bg-blue-800 text-white font-black text-[9px] uppercase px-4 py-3 rounded-xl shadow-xl hover:scale-105 transition-all">GERENTE GARÇOM ⚙️</button>
          <button onClick={onLogout} className="bg-red-600 text-white font-black text-[9px] uppercase px-3 py-2.5 rounded-xl active:scale-95 transition-all">Sair</button>
        </div>
      </div>

      <div className="animate-in fade-in duration-500">
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
        
        {/* Adicione outras abas conforme necessário... */}
      </div>

      {/* MODAL GERENTE GARÇOM */}
      {isWaiterManagerOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-blue-950/90 backdrop-blur-md">
          <div className="bg-yellow-400 w-full max-w-sm rounded-[3rem] p-10 relative animate-in zoom-in border-4 border-blue-950">
             <button onClick={() => setIsWaiterManagerOpen(false)} className="absolute top-8 right-8 p-4 bg-blue-950 text-yellow-400 rounded-full hover:bg-red-600 hover:text-white transition-colors"><CloseIcon size={20}/></button>
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

      {/* MODAL DETALHES PEDIDO */}
      {selectedTableId && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-blue-950/95 backdrop-blur-md" onClick={() => setSelectedTableId(null)} />
          <div className="relative bg-white w-full max-w-6xl h-[92vh] rounded-[3rem] flex flex-col md:flex-row overflow-hidden shadow-2xl border-t-8 border-yellow-400 animate-in zoom-in duration-300">
            {/* ... lógica de detalhes igual ao App ... */}
            <div className="flex-1 flex flex-col h-full bg-white border-r">
               <div className="p-6 border-b flex justify-between items-center bg-white shadow-sm shrink-0">
                  <h3 className="text-2xl font-black uppercase italic text-blue-950">Mesa {selectedTableId}</h3>
                  <div className="flex gap-2">
                    <button onClick={() => tables.find(t=>t.id===selectedTableId)?.currentOrder && handlePrintOrder(tables.find(t=>t.id===selectedTableId)!.currentOrder!)} className="p-4 bg-blue-950 text-yellow-400 rounded-full shadow-lg"><PrinterIcon size={20}/></button>
                    <button onClick={() => setSelectedTableId(null)} className="p-4 bg-yellow-400 text-blue-950 rounded-full"><CloseIcon size={20}/></button>
                  </div>
               </div>
               <div className="flex-1 overflow-y-auto p-6 space-y-6">
                 {/* Lista de itens e botões de ação... */}
                 <button onClick={() => { if(confirm('Encerrar?')) { onUpdateTable(selectedTableId!, 'free'); setSelectedTableId(null); } }} className="w-full bg-green-600 text-white py-5 rounded-2xl font-black uppercase text-[11px] shadow-xl">Encerrar e Liberar 🏁</button>
               </div>
            </div>
            {/* Lado Direito: Adição de Itens */}
            <div className="w-full md:w-80 bg-yellow-50 flex flex-col h-full border-l border-yellow-400">
               <div className="p-6 border-b bg-yellow-400 flex justify-between items-center shrink-0"><h4 className="text-[11px] font-black uppercase tracking-widest text-blue-950">Lançamento</h4></div>
               <div className="p-6 space-y-4 flex flex-col flex-1 overflow-hidden">
                  <input type="text" value={productSearchInTable} onChange={e => setProductSearchInTable(e.target.value)} placeholder="BUSCAR..." className="w-full bg-white border-2 border-blue-950 rounded-xl px-4 py-3 text-[10px] font-black outline-none" />
                  <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
                    {tableSearchProducts.map(prod => (
                      <button key={prod.id} onClick={() => onAddToOrder(selectedTableId!, prod)} className="w-full flex items-center gap-3 bg-white p-3 rounded-2xl border-2 border-transparent hover:border-blue-950 transition-all text-left shadow-sm">
                        <img src={prod.image} className="w-10 h-10 rounded-lg object-cover" />
                        <div className="flex-1 min-w-0"><h5 className="text-[9px] font-black uppercase truncate text-blue-950">{prod.name}</h5><p className="text-[9px] text-blue-900/40 font-black italic">R$ {prod.price.toFixed(2)}</p></div>
                        <div className="bg-yellow-400 text-blue-950 p-1.5 rounded-lg font-black">+</div>
                      </button>
                    ))}
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
