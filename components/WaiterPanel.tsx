
import React, { useState } from 'react';
import { Table, Product, Order, OrderStatus, StoreConfig } from '../types';
import { GasIcon, CloseIcon, TrashIcon, PrinterIcon } from './Icons';
import { STORE_INFO } from '../constants';

interface WaiterPanelProps {
  tables: Table[];
  menuItems: Product[];
  onUpdateTable: (id: number, status: 'free' | 'occupied', order?: Order | null) => void;
  onAddToOrder: (tableId: number, product: Product) => void;
  onRemoveItem: (tableId: number, itemIndex: number) => void;
  storeConfig: StoreConfig;
}

const WaiterPanel: React.FC<WaiterPanelProps> = ({ tables, menuItems, onUpdateTable, onAddToOrder, onRemoveItem, storeConfig }) => {
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const selectedTable = tables.find(t => t.id === selectedTableId);
  const filteredProducts = menuItems.filter(p => p.isAvailable && p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8);

  return (
    <div className="min-h-screen bg-yellow-400 font-sans">
      <header className="bg-blue-950 text-yellow-400 p-6 flex justify-between items-center shadow-xl border-b-4 border-yellow-500">
        <div className="flex items-center gap-3">
          <div className="bg-yellow-400 p-2 rounded-xl"><GasIcon size={24} className="text-blue-950" /></div>
          <h1 className="font-black italic uppercase text-lg tracking-tighter">GARÇOM - {STORE_INFO.name}</h1>
        </div>
        <button onClick={() => window.close()} className="text-[10px] font-black uppercase bg-red-600 text-white px-4 py-2 rounded-xl">Fechar</button>
      </header>

      <main className="p-6">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {tables.filter(t => t.id <= 12).map(t => (
            <button key={t.id} onClick={() => setSelectedTableId(t.id)} className={`h-24 rounded-[2rem] border-2 font-black flex flex-col items-center justify-center transition-all ${t.status === 'free' ? 'bg-white border-yellow-500 text-blue-950' : 'bg-blue-950 border-white text-yellow-400 shadow-xl scale-105'}`}>
              <span className="text-2xl italic leading-none">{t.id}</span>
              <span className="text-[8px] uppercase tracking-widest">{t.status === 'free' ? 'LIVRE' : 'OCUPADA'}</span>
            </button>
          ))}
        </div>
      </main>

      {selectedTableId && (
        <div className="fixed inset-0 z-[500] flex flex-col bg-white animate-in zoom-in">
           <header className="p-6 bg-yellow-400 border-b-4 border-blue-950 flex justify-between items-center">
              <h2 className="text-xl font-black italic uppercase text-blue-950">Mesa {selectedTableId}</h2>
              <button onClick={() => setSelectedTableId(null)} className="p-3 bg-blue-950 text-yellow-400 rounded-full"><CloseIcon size={20}/></button>
           </header>
           
           <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              <div className="flex-1 p-6 overflow-y-auto border-r bg-white space-y-4">
                 <h3 className="text-[10px] font-black uppercase text-blue-950/40 tracking-widest">Itens do Pedido</h3>
                 {selectedTable?.currentOrder?.items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-4 bg-yellow-50 rounded-2xl border-2 border-yellow-100">
                       <img src={item.image} className="w-10 h-10 rounded-lg object-cover" />
                       <div className="flex-1 min-w-0">
                          <p className="font-black text-[10px] uppercase truncate text-blue-950">{item.name}</p>
                          <p className="text-[9px] font-black italic text-blue-900/40">{item.quantity}x R$ {item.price.toFixed(2)}</p>
                       </div>
                       {storeConfig.waiterCanCancelItems && (
                          <button onClick={() => onRemoveItem(selectedTableId, idx)} className="p-2 text-red-600"><TrashIcon size={16}/></button>
                       )}
                    </div>
                 ))}
                 {!selectedTable?.currentOrder?.items.length && <p className="text-center py-10 text-[9px] font-black uppercase text-blue-950/20 italic">Nenhum item lançado</p>}
              </div>

              <div className="w-full md:w-96 bg-yellow-50 p-6 flex flex-col border-t md:border-t-0">
                 <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="BUSCAR PRODUTO..." className="w-full bg-white border-2 border-blue-950 rounded-xl px-4 py-3 text-[10px] font-black uppercase mb-4" />
                 <div className="flex-1 grid grid-cols-2 gap-2 overflow-y-auto no-scrollbar">
                    {filteredProducts.map(p => (
                       <button key={p.id} onClick={() => onAddToOrder(selectedTableId, p)} className="bg-white p-3 rounded-2xl border-2 border-yellow-200 flex flex-col items-center text-center group active:scale-95 transition-all">
                          <img src={p.image} className="w-12 h-12 rounded-lg object-cover mb-2" />
                          <p className="text-[8px] font-black uppercase truncate w-full text-blue-950">{p.name}</p>
                          <p className="text-[9px] font-black italic text-blue-950/60">R$ {p.price.toFixed(2)}</p>
                       </button>
                    ))}
                 </div>
              </div>
           </div>

           <footer className="p-6 bg-blue-950 text-yellow-400 flex items-center justify-between shadow-2xl">
              <div>
                 <p className="text-[8px] uppercase tracking-widest opacity-60">Total da Mesa</p>
                 <p className="text-3xl font-black italic">R$ {selectedTable?.currentOrder?.finalTotal.toFixed(2) || '0,00'}</p>
              </div>
              {storeConfig.waiterCanFinalize && selectedTable?.status === 'occupied' && (
                 <button onClick={() => { if(confirm('Encerrar Mesa?')) { onUpdateTable(selectedTableId, 'free'); setSelectedTableId(null); } }} className="bg-green-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] shadow-xl">Finalizar Venda 🏁</button>
              )}
           </footer>
        </div>
      )}
    </div>
  );
};

export default WaiterPanel;
