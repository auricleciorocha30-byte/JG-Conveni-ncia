
import React, { useState, useMemo, useEffect } from 'react';
import { CartItem, Product, Order, OrderType, Coupon, LoyaltyConfig, StoreConfig } from '../types';
// Fixed: Added GasIcon to imports to resolve "Cannot find name 'GasIcon'" error
import { CloseIcon, TrashIcon, GasIcon } from './Icons';
import { supabase } from '../lib/supabase';
import { STORE_INFO } from '../constants';

interface CartProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onAdd: (product: Product) => void;
  onPlaceOrder: (order: Order) => Promise<boolean>;
  storeConfig: StoreConfig;
}

const Cart: React.FC<CartProps> = ({ isOpen, onClose, items, onUpdateQuantity, onRemove, onAdd, onPlaceOrder, storeConfig }) => {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupons, setAppliedCoupons] = useState<Coupon[]>([]);
  const [loyaltyConfig, setLoyaltyConfig] = useState<LoyaltyConfig | null>(null);
  const [tableNumber, setTableNumber] = useState('');
  const [orderType, setOrderType] = useState<OrderType>('table');
  const [address, setAddress] = useState('');
  const [observation, setObservation] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Dinheiro' | 'Pix' | 'Cartão'>('Pix');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (storeConfig.tablesEnabled) setOrderType('table');
    else if (storeConfig.deliveryEnabled) setOrderType('delivery');
    else if (storeConfig.counterEnabled) setOrderType('takeaway');
  }, [storeConfig]);

  useEffect(() => {
    if (isOpen) {
      supabase.from('loyalty_config').select('*').maybeSingle().then(({ data }) => { 
        if (data) setLoyaltyConfig({
          isActive: data.is_active,
          spendingGoal: data.spending_goal,
          scopeType: data.scope_type,
          scopeValue: data.scope_value || ''
        }); 
      });
    } else {
      if (!isOpen) setTimeout(() => setIsSuccess(false), 500);
    }
  }, [isOpen]);

  const subtotal = useMemo(() => items.reduce((acc, item) => acc + item.price * item.quantity, 0), [items]);
  
  const discount = useMemo(() => {
    if (appliedCoupons.length === 0) return 0;
    
    return items.reduce((totalDiscount, item) => {
      const validCoupons = appliedCoupons.filter(c => {
        if (!c.isActive) return false;
        if (c.scopeType === 'all') return true;
        const scopeValues = (c.scopeValue || '').split(',');
        if (c.scopeType === 'category') return scopeValues.includes(item.category);
        if (c.scopeType === 'product') return scopeValues.includes(item.id);
        return false;
      });

      if (validCoupons.length === 0) return totalDiscount;
      const bestCoupon = validCoupons.reduce((prev, curr) => (curr.percentage > prev.percentage) ? curr : prev);
      return totalDiscount + (item.price * item.quantity * bestCoupon.percentage / 100);
    }, 0);
  }, [appliedCoupons, items]);

  const finalTotal = subtotal - discount;

  const handleValidateCoupon = async () => {
    if (!couponCode.trim()) return;
    try {
      const { data, error } = await supabase.from('coupons').select('*').eq('code', couponCode.trim().toUpperCase()).eq('is_active', true).maybeSingle();
      if (error) throw error;
      if (data) setAppliedCoupons([{ id: data.id, code: data.code, percentage: data.percentage, isActive: data.is_active, scopeType: data.scope_type, scopeValue: data.scope_value || '' }]);
      else alert('Cupom não encontrado ou expirado.');
    } catch (err) { alert('Erro ao processar cupom.'); }
  };

  const handleCheckout = async () => {
    if (items.length === 0) return;
    if (!customerName.trim()) return alert('Diga-nos seu nome para o pedido.');
    if (orderType === 'table' && !tableNumber) return alert('Em qual mesa você está?');
    if (orderType === 'delivery' && !address.trim()) return alert('Onde devemos entregar?');

    setIsProcessing(true);
    let targetTableId = orderType === 'table' ? (parseInt(tableNumber) || 0) : orderType === 'delivery' ? -900 : -950;
    
    const newOrder: Order = {
      id: Math.random().toString(36).substr(2, 6).toUpperCase(),
      customerName, customerPhone: customerPhone.trim() || undefined,
      items: [...items], total: subtotal, discount, finalTotal, paymentMethod,
      timestamp: new Date().toISOString(), tableId: targetTableId,
      orderType: orderType === 'takeaway' ? 'counter' : orderType,
      address: orderType === 'delivery' ? address : undefined, status: 'pending', 
      couponCode: appliedCoupons.length > 0 ? appliedCoupons[0].code : undefined,
      observation: observation.trim() || undefined
    };

    try {
      if (loyaltyConfig?.isActive && customerPhone.trim()) {
        const eligibleValues = (loyaltyConfig.scopeValue || '').split(',');
        const grossEligible = items.reduce((acc, item) => {
          const ok = loyaltyConfig.scopeType === 'all' || 
                    (loyaltyConfig.scopeType === 'category' && eligibleValues.includes(item.category)) || 
                    (loyaltyConfig.scopeType === 'product' && eligibleValues.includes(item.id));
          return ok ? acc + (item.price * item.quantity) : acc;
        }, 0);
        
        const pointRatio = subtotal > 0 ? (finalTotal / subtotal) : 0;
        const finalEligible = grossEligible * pointRatio;
        const { data: user } = await supabase.from('loyalty_users').select('*').eq('phone', customerPhone).maybeSingle();
        if (user) await supabase.from('loyalty_users').update({ accumulated: Number(user.accumulated) + finalEligible }).eq('phone', customerPhone);
        else await supabase.from('loyalty_users').insert([{ phone: customerPhone, name: customerName, accumulated: finalEligible }]);
      }

      const success = await onPlaceOrder(newOrder);
      if (success) {
        setIsSuccess(true);
        setAppliedCoupons([]);
        setCouponCode('');
        setObservation('');
      }
    } catch (err) { alert('Erro ao finalizar. Tente novamente.'); } finally { setIsProcessing(false); }
  };

  return (
    <>
      <div className={`fixed inset-0 bg-blue-950/80 backdrop-blur-sm z-[50] transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={onClose}/>
      <div className={`fixed right-0 top-0 h-full w-full max-w-md bg-yellow-400 z-[60] shadow-2xl transition-transform duration-500 transform ${isOpen ? 'translate-x-0' : 'translate-x-full'} flex flex-col border-l-8 border-blue-950`}>
        {isSuccess ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center font-black animate-in fade-in zoom-in duration-500">
            <div className="w-24 h-24 bg-blue-950 text-yellow-400 rounded-full flex items-center justify-center mx-auto mb-8 animate-bounce shadow-2xl">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-4xl mb-4 italic uppercase tracking-tighter text-blue-950">Confirmado!</h2>
            <p className="text-blue-900/60 uppercase text-[10px] tracking-widest leading-relaxed">Já estamos preparando seu pedido na {STORE_INFO.name}. Acompanhe pelo painel!</p>
            <button onClick={onClose} className="w-full bg-blue-950 text-yellow-400 py-6 rounded-[2.5rem] uppercase mt-12 text-[11px] font-black tracking-widest shadow-2xl active:scale-95 transition-all">Voltar ao Menu</button>
          </div>
        ) : (
          <>
            <div className="p-8 border-b-4 border-blue-950/10 flex justify-between items-center bg-yellow-400 sticky top-0 z-10 font-black italic">
              <div><h2 className="text-3xl uppercase tracking-tighter text-blue-950">Sua Sacola</h2><span className="text-[10px] text-blue-900 not-italic uppercase tracking-widest">{items.length} ITENS ESCOLHIDOS</span></div>
              <button onClick={onClose} className="p-3 bg-blue-950 text-yellow-400 rounded-full transition-all active:scale-90 shadow-xl"><CloseIcon size={24} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 no-scrollbar pb-32 bg-white/30">
              {items.length > 0 ? (
                <>
                  <div className="bg-white p-6 rounded-[2.5rem] border-4 border-blue-950 space-y-6 font-black uppercase shadow-2xl">
                    <div className="space-y-2">
                      <p className="text-[8px] tracking-[0.2em] text-blue-900/40 ml-2">Suas Informações</p>
                      <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="QUAL SEU NOME?" className="w-full bg-yellow-50 border-2 border-yellow-200 rounded-2xl px-6 py-4 text-xs outline-none shadow-sm focus:border-blue-950 transition-all text-blue-950"/>
                      <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="CELULAR (P/ FIDELIDADE)" className="w-full bg-yellow-50 border-2 border-yellow-200 rounded-2xl px-6 py-4 text-xs outline-none shadow-sm focus:border-blue-950 transition-all text-blue-950"/>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[8px] tracking-[0.2em] text-blue-900/40 ml-2">Como vai Receber?</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {storeConfig.tablesEnabled && (
                          <button onClick={() => setOrderType('table')} className={`py-3.5 rounded-2xl text-[8px] border-2 transition-all ${orderType === 'table' ? 'bg-blue-950 text-yellow-400 border-blue-950 shadow-md' : 'bg-white text-blue-900/30 border-yellow-100'}`}>Mesa</button>
                        )}
                        {storeConfig.counterEnabled && (
                          <button onClick={() => setOrderType('takeaway')} className={`py-3.5 rounded-2xl text-[8px] border-2 transition-all ${orderType === 'takeaway' ? 'bg-blue-950 text-yellow-400 border-blue-950 shadow-md' : 'bg-white text-blue-900/30 border-yellow-100'}`}>Balcão</button>
                        )}
                        {storeConfig.deliveryEnabled && (
                          <button onClick={() => setOrderType('delivery')} className={`py-3.5 rounded-2xl text-[8px] border-2 transition-all ${orderType === 'delivery' ? 'bg-blue-950 text-yellow-400 border-blue-950 shadow-md' : 'bg-white text-blue-900/30 border-yellow-100'}`}>Entrega</button>
                        )}
                      </div>
                    </div>

                    {orderType === 'table' && (
                      <div className="space-y-2">
                        <p className="text-[8px] tracking-[0.2em] text-blue-900/40 ml-2">Qual a Mesa?</p>
                        <div className="grid grid-cols-4 gap-2">{Array.from({ length: 12 }, (_, i) => i + 1).map(num => (
                          <button key={num} onClick={() => setTableNumber(num.toString())} className={`py-2.5 rounded-xl text-xs transition-all ${tableNumber === num.toString() ? 'bg-blue-950 text-yellow-400 border-blue-950 shadow-md' : 'bg-white text-blue-900/20 border-2 border-yellow-100'}`}>{num}</button>
                        ))}</div>
                      </div>
                    )}

                    {orderType === 'delivery' && (
                      <div className="space-y-2">
                        <p className="text-[8px] tracking-[0.2em] text-blue-900/40 ml-2">Endereço</p>
                        <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="ENDEREÇO COMPLETO..." className="w-full bg-yellow-50 border-2 border-yellow-200 rounded-2xl px-6 py-4 text-xs outline-none h-24 resize-none shadow-sm focus:border-blue-950 transition-all text-blue-950"/>
                      </div>
                    )}

                    <div className="space-y-2">
                      <p className="text-[8px] tracking-[0.2em] text-blue-900/40 ml-2">Forma de Pagamento</p>
                      <div className="grid grid-cols-3 gap-1.5">{(['Pix', 'Dinheiro', 'Cartão'] as const).map(method => (
                        <button key={method} onClick={() => setPaymentMethod(method)} className={`py-3.5 rounded-2xl text-[9px] border-2 transition-all ${paymentMethod === method ? 'bg-blue-950 text-yellow-400 border-blue-950 shadow-md' : 'bg-white text-blue-900/30 border-yellow-100'}`}>{method}</button>
                      ))}</div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[8px] tracking-[0.2em] text-blue-900/40 ml-2">Observações</p>
                      <textarea value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="EX: SEM CEBOLA, SEM GELO..." className="w-full bg-yellow-50 border-2 border-yellow-200 rounded-2xl px-6 py-4 text-xs outline-none h-20 resize-none shadow-sm focus:border-blue-950 transition-all text-blue-950"/>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <input type="text" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="TEM CUPOM?" className="flex-1 bg-yellow-50 border-2 border-yellow-200 rounded-2xl px-6 py-4 text-[10px] outline-none shadow-sm focus:border-blue-950 transition-all uppercase text-blue-950"/>
                      <button onClick={handleValidateCoupon} className="bg-blue-950 text-yellow-400 px-6 py-4 rounded-2xl text-[10px] shadow-lg active:scale-95 transition-all">Verificar</button>
                    </div>

                    {appliedCoupons.length > 0 && (
                      <div className="text-green-700 text-[9px] font-black px-4 py-3 bg-green-50 rounded-xl flex items-center justify-between border-2 border-green-100 shadow-inner">
                        <span>✓ CUPOM: {appliedCoupons[0].code}</span>
                        <span>{appliedCoupons[0].percentage}% OFF</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <p className="text-[10px] font-black uppercase text-blue-950 tracking-widest ml-4 italic">Resumo do Pedido</p>
                    {items.map(item => (
                      <div key={item.id} className="flex gap-4 bg-white p-4 rounded-[2rem] border-4 border-blue-950/10 items-center relative group shadow-xl hover:border-blue-950 transition-all overflow-hidden">
                        <button onClick={() => onRemove(item.id)} className="absolute top-4 right-4 text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors z-10">
                          <TrashIcon size={16} />
                        </button>
                        
                        <img src={item.image} className="w-16 h-16 rounded-2xl object-cover shrink-0 shadow-md" />
                        
                        <div className="flex-1 font-black min-w-0 pr-8">
                          <h4 className="text-[11px] uppercase leading-none truncate mb-1 text-blue-950">{item.name}</h4>
                          <p className="text-yellow-600 text-xs italic font-black">R$ {item.price.toFixed(2)}</p>
                          
                          <div className="mt-3 flex items-center gap-2 bg-yellow-400/20 p-1 rounded-xl font-black w-fit">
                            <button onClick={() => onUpdateQuantity(item.id, -1)} className="w-7 h-7 rounded-lg bg-white shadow-sm flex items-center justify-center hover:bg-blue-950 hover:text-yellow-400 transition-colors text-lg text-blue-950">-</button>
                            <span className="text-[11px] w-6 text-center text-blue-950">{item.quantity}</span>
                            <button onClick={() => onUpdateQuantity(item.id, 1)} className="w-7 h-7 rounded-lg bg-white shadow-sm flex items-center justify-center hover:bg-blue-950 hover:text-yellow-400 transition-colors text-lg text-blue-950">+</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-32">
                  <div className="w-24 h-24 bg-blue-950/5 rounded-full flex items-center justify-center mb-6">
                    {/* Fixed: Used imported GasIcon component */}
                    <GasIcon className="text-blue-950/20 w-12 h-12" size={48} />
                  </div>
                  <p className="font-black uppercase text-xs tracking-[0.2em] text-blue-950/40">Sua sacola está vazia</p>
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="p-8 md:p-10 border-t-8 border-blue-950 bg-yellow-400 sticky bottom-0 rounded-t-[3.5rem] z-20 font-black italic shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <span className="text-[9px] text-blue-900/60 not-italic uppercase tracking-widest">Valor a Pagar</span>
                    <span className="text-4xl block tracking-tighter text-blue-950">R$ {finalTotal.toFixed(2).replace('.', ',')}</span>
                  </div>
                  {discount > 0 && (
                    <div className="text-right">
                      <span className="text-green-700 text-sm block font-black">- R$ {discount.toFixed(2).replace('.', ',')}</span>
                      <span className="text-[9px] text-green-700/60 not-italic uppercase font-black">Desconto JG</span>
                    </div>
                  )}
                </div>
                <button 
                  onClick={handleCheckout} 
                  disabled={isProcessing} 
                  className="w-full bg-blue-950 text-yellow-400 py-6 rounded-[2.5rem] uppercase text-[11px] font-black tracking-widest shadow-2xl active:scale-95 transition-all hover:brightness-125 flex items-center justify-center gap-3"
                >
                  {isProcessing ? 'Processando...' : 'Finalizar e Enviar'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
};

export default Cart;
