
import React from 'react';
import { STORE_INFO } from '../constants';
import { GasIcon } from './Icons';

const Header: React.FC = () => {
  return (
    <header className="bg-yellow-400 pt-8 pb-14 px-6 rounded-b-[3rem] shadow-xl relative overflow-hidden">
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-yellow-300 rounded-full opacity-40 blur-3xl"></div>
      
      <div className="relative z-10 flex flex-col items-center text-center max-w-lg mx-auto">
        <div className="bg-blue-950 w-16 h-16 rounded-2xl mb-4 shadow-2xl flex items-center justify-center shrink-0 rotate-3">
          <GasIcon className="w-8 h-8 text-yellow-400" size={32} />
        </div>
        <h1 className="text-4xl font-black text-blue-950 tracking-tight mb-1">
          {STORE_INFO.name}
        </h1>
        <p className="text-blue-900 font-bold uppercase tracking-[0.2em] text-[10px] mb-4 opacity-80">
          {STORE_INFO.slogan}
        </p>
        <div className="bg-blue-950 text-yellow-400 px-4 py-1.5 rounded-full inline-flex items-center gap-2 shadow-lg">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          <span className="text-[10px] font-black uppercase tracking-wider">{STORE_INFO.hours}</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
