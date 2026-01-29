
import React from 'react';
import { Product, Coupon } from '../types';

interface MenuItemProps {
  product: Product;
  onAdd: (product: Product) => void;
  activeCoupons: Coupon[];
}

const MenuItem: React.FC<MenuItemProps> = ({ product, onAdd, activeCoupons }) => {
  const isCombo = product.category === 'Combos';
  const isAvailable = product.isAvailable !== false;

  const validCoupons = activeCoupons.filter(c => {
    if (!c.isActive) return false;
    if (c.scopeType === 'all') return true;
    
    const scopeValues = (c.scopeValue || '').split(',');
    if (c.scopeType === 'product') return scopeValues.includes(product.id);
    if (c.scopeType === 'category') return scopeValues.includes(product.category);
    
    return false;
  });

  const applicableCoupon = validCoupons.length > 0 
    ? validCoupons.reduce((prev, curr) => (curr.percentage > prev.percentage) ? curr : prev)
    : null;

  const savingsValue = applicableCoupon 
    ? (product.price * (applicableCoupon.percentage / 100)) 
    : 0;

  return (
    <div className={`group bg-white rounded-[2rem] shadow-md border overflow-hidden flex flex-col relative transition-all duration-300 ${!isAvailable ? 'opacity-70' : 'hover:shadow-2xl hover:-translate-y-1'} ${isCombo ? 'border-yellow-400 border-4' : 'border-yellow-100'}`}>
      {isCombo && isAvailable && (
        <div className="absolute top-4 left-4 z-10 bg-blue-950 text-yellow-400 text-[10px] font-black uppercase px-3 py-1.5 rounded-full shadow-lg border border-yellow-400/20">
          Combo Sugerido 🔥
        </div>
      )}

      {applicableCoupon && isAvailable && (
        <div className="absolute top-4 right-4 z-10 bg-green-600 text-white text-[9px] font-black uppercase px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1 border-b-2 border-green-800">
          <span>{applicableCoupon.percentage}% OFF</span> 🎫
        </div>
      )}

      {!isAvailable && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-blue-950/80 backdrop-blur-[2px] p-6 text-center">
          <div className="bg-red-600 text-white font-black text-[12px] uppercase tracking-[0.2em] px-6 py-3 rounded-full shadow-2xl mb-2 animate-pulse">
            Esgotado 🚫
          </div>
          <p className="text-yellow-400/80 text-[9px] font-bold uppercase tracking-widest italic">Voltaremos em Breve</p>
        </div>
      )}
      
      <div className="aspect-[4/3] overflow-hidden relative bg-yellow-50">
        <img 
          src={product.image} 
          alt={product.name} 
          className={`w-full h-full object-cover transition-transform duration-700 ${!isAvailable ? 'grayscale scale-105' : 'group-hover:scale-110'}`}
        />
        {isAvailable && (
          <div className={`absolute bottom-3 right-3 ${isCombo ? 'bg-blue-950 text-yellow-400' : 'bg-yellow-400 text-blue-950'} font-black px-4 py-1.5 rounded-full text-sm shadow-xl border-2 border-white/20`}>
            R$ {product.price.toFixed(2).replace('.', ',')}
          </div>
        )}
      </div>
      
      <div className="p-6 flex flex-col flex-1">
        <h3 className="font-extrabold text-blue-950 text-xl mb-1 leading-tight">{product.name}</h3>
        <p className="text-blue-900/60 text-xs mb-5 flex-1 line-clamp-2 leading-relaxed italic">{product.description}</p>
        
        {savingsValue > 0 && isAvailable && (
          <div className="mb-4">
            <span className="bg-green-50 text-green-700 text-[10px] font-black px-3 py-1.5 rounded-lg uppercase tracking-wider flex items-center gap-1.5 w-fit border border-green-100">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
              Economize R$ {savingsValue.toFixed(2).replace('.', ',')}
            </span>
          </div>
        )}
        
        <button 
          onClick={() => isAvailable && onAdd(product)}
          disabled={!isAvailable}
          className={`w-full ${!isAvailable ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : isCombo ? 'bg-blue-950 text-yellow-400' : 'bg-yellow-400 text-blue-950'} font-black py-4 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg ${isAvailable ? 'hover:brightness-110' : ''}`}
        >
          <span className="text-sm uppercase tracking-widest">
            {!isAvailable ? 'Em Falta' : isCombo ? 'Aproveitar Combo' : 'Adicionar Item'}
          </span>
          {isAvailable && (
            <svg width="20" height="20" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};

export default MenuItem;
