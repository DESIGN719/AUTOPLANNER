
import React from 'react';
import { Appointment, PRStatus } from '../types';
import { Clock, User, Wrench, Calendar, Truck, Car, Snowflake, Compass, Package, AlertCircle } from 'lucide-react';
import { STATUS_CONFIG } from '../constants';

interface AppointmentCardProps {
  appointment: Appointment;
  variant?: 'summary' | 'full' | 'list';
  onEdit?: (id: string) => void;
  onCyclePR?: (id: string) => void;
  className?: string;
}

const AppointmentCard: React.FC<AppointmentCardProps> = ({ appointment, variant = 'summary', onEdit, onCyclePR, className = "" }) => {
  const handleDragStart = (e: React.DragEvent) => {
    if (appointment.status === 'annule') return;
    e.dataTransfer.setData('appointmentId', appointment.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const currentStatus = STATUS_CONFIG[appointment.status || 'a-venir'];
  const totalLaborHours = (appointment.laborTimes.t1 + appointment.laborTimes.t2 + appointment.laborTimes.tp + appointment.laborTimes.meca);
  const isAnnule = appointment.status === 'annule';

  const handlePRClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onCyclePR && !isAnnule) onCyclePR(appointment.id);
  };

  const getPRStyle = (status?: PRStatus, isPlanningView = false) => {
    if (isAnnule) return 'bg-slate-200 text-slate-400 border-slate-300 opacity-50';
    switch (status) {
      case 'a-commander': return 'bg-rose-600 text-white animate-pr-blink border-rose-700';
      case 'commande': return 'bg-amber-500 text-white border-amber-600';
      case 'recu': return 'bg-emerald-600 text-white border-emerald-700';
      default: return isPlanningView 
        ? 'bg-slate-50 text-slate-200 border-slate-100' 
        : 'bg-slate-800 text-slate-600 border-slate-700 opacity-20';
    }
  };

  if (variant === 'list') {
    return (
      <div 
        onDoubleClick={() => onEdit?.(appointment.id)}
        className={`flex items-center bg-[#1e293b]/40 border border-slate-700/50 hover:border-blue-500/40 rounded-lg p-2 gap-3 transition-all cursor-pointer relative overflow-hidden text-[10px] uppercase group ${className} ${isAnnule ? 'opacity-50 grayscale' : ''}`}
      >
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${currentStatus.color.replace('text-', 'bg-')}`} />
        
        <div className="w-[180px] shrink-0 min-w-0">
          <div className="flex items-center gap-1.5 overflow-hidden">
            {isAnnule ? <AlertCircle size={12} className="text-rose-500 shrink-0" /> : <User size={12} className="text-blue-400 shrink-0" />}
            <span className={`text-[11px] font-black truncate tracking-tight ${isAnnule ? 'text-slate-400' : 'text-white'}`}>{appointment.clientName || "SANS NOM"} {isAnnule && "(ANNULÉ)"}</span>
          </div>
          <div className="flex items-center gap-2 text-[8.5px] font-bold text-slate-500 truncate pl-[18px]">
            <span className="text-blue-300 shrink-0">{appointment.immat || "NO-IMMAT"}</span>
            <span className="opacity-20">|</span>
            <span className="truncate opacity-70">{appointment.model || "MODÈLE INCONNU"}</span>
          </div>
        </div>

        <div className="flex-1 min-w-0 flex items-center gap-3 bg-slate-900/40 px-3 py-1.5 rounded-md border border-slate-700/30">
          <Wrench size={14} className="text-blue-500/40 shrink-0" />
          <span className="text-blue-100 font-bold text-[8.5px] tracking-tight truncate uppercase">
            {appointment.workType || "TRAVAUX À DÉFINIR"}
          </span>
        </div>

        <div className="w-[320px] shrink-0 flex items-center justify-between bg-black/20 px-3 py-1.5 rounded-md border border-slate-700/50">
           <div className="flex items-center gap-1">
             {['t1','t2','tp','meca'].map(k => (
               <div key={k} className="flex flex-col items-center w-7">
                 <span className="text-[6px] text-slate-500 font-black">{k.toUpperCase()}</span>
                 <span className={`text-[10px] font-black ${(appointment.laborTimes as any)[k] > 0 ? 'text-white' : 'text-slate-800'}`}>
                   {(appointment.laborTimes as any)[k] || '0'}
                 </span>
               </div>
             ))}
           </div>
           
           <div className="w-px h-6 bg-slate-700 mx-1" />
           
           <div className="flex flex-col items-center px-1 min-w-[40px]">
             <span className="text-[6px] text-slate-500 font-black">TOTAL</span>
             <span className="text-[11px] font-black text-blue-400 leading-none">{totalLaborHours.toFixed(1)}H</span>
           </div>

           <div className="w-px h-6 bg-slate-700 mx-1" />

           <div className="flex items-center gap-2">
              <button onClick={handlePRClick} className={`p-1 rounded border transition-all ${getPRStyle(appointment.prStatus)}`}>
                <Package size={14} />
              </button>
              
              <div className="flex items-center gap-2 px-1">
                <span title="Géométrie">
                  <Compass size={16} className={appointment.hasGeo ? "text-amber-500" : "text-slate-800 opacity-10"} />
                </span>
                <span title="Climatisation">
                  <Snowflake size={16} className={appointment.hasClim ? "text-sky-400" : "text-slate-800 opacity-10"} />
                </span>
              </div>
           </div>
        </div>

        <div className="w-[110px] shrink-0 flex flex-col justify-center border-l border-slate-700/50 pl-3">
           <div className="flex items-center gap-2">
             <Calendar size={10} className="text-slate-500" />
             <span className="text-white font-black text-[9px]">{appointment.date ? new Date(appointment.date).toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit'}) : '--/--'}</span>
           </div>
           <div className="flex items-center gap-2">
             <Truck size={10} className="text-emerald-500" />
             <span className="text-emerald-400 font-black text-[9px]">{appointment.exitDate ? new Date(appointment.exitDate).toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit'}) : '--/--'}</span>
           </div>
        </div>

        <div className="w-[160px] shrink-0 flex items-center justify-end gap-3 border-l border-slate-700/50 pl-3">
          <div className="flex flex-col items-end min-w-[70px]">
            <span className="text-[6px] text-slate-500 font-black uppercase">MONTANT CA</span>
            <span className="text-white font-black text-[13px] leading-none tracking-tight">{(appointment.totalAmount || 0).toLocaleString('fr-FR')}€</span>
          </div>
          
          <div className="w-[60px] flex justify-end">
            {appointment.hasVr ? (
               <div className="bg-yellow-400 text-slate-900 border border-yellow-500 px-1.5 py-0.5 rounded flex flex-col items-center justify-center shadow-sm">
                  <Car size={10} fill="currentColor" />
                  <span className="text-[7px] font-black leading-none mt-0.5 truncate w-full text-center">{appointment.vrImmat || "VR"}</span>
               </div>
            ) : (
              <div className="bg-slate-800/30 border border-slate-700/20 px-1.5 py-0.5 rounded flex flex-col items-center justify-center opacity-5">
                <Car size={10} />
                <span className="text-[7px] font-black leading-none mt-0.5">--</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      draggable={!isAnnule}
      onDragStart={handleDragStart}
      onDoubleClick={() => onEdit?.(appointment.id)}
      className={`flex shrink-0 border border-slate-200 rounded shadow h-[94px] w-[240px] transition-all uppercase overflow-hidden ${isAnnule ? 'opacity-50 grayscale border-slate-300' : 'cursor-move bg-white hover:border-blue-400'} ${className}`}
    >
      <div className={`${isAnnule ? 'bg-slate-400' : 'bg-[#1e293b]'} text-white flex flex-col justify-between w-[68px] p-1 shrink-0 border-r border-slate-700/50`}>
        <div className="flex flex-col gap-0.5 overflow-hidden">
          <span className="text-[9px] font-black leading-tight line-clamp-2">{appointment.model || "-"}</span>
          <span className="text-[8px] font-bold text-slate-400 truncate">{appointment.immat || "-"}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1 bg-black/20 border border-white/10 px-1 py-0.5 rounded-sm">
            <Clock size={8} className="text-blue-300" />
            <span className="text-[9px] font-black">{appointment.appointmentHour || "--:--"}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col p-1.5 relative min-w-0 bg-white">
        <div className="mb-1 flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            {isAnnule ? <AlertCircle size={9} className="text-rose-400" /> : <User size={9} className="text-slate-400" />}
            <span className={`text-[10px] font-black truncate tracking-tight ${isAnnule ? 'text-slate-400' : 'text-slate-900'}`}>{appointment.clientName}</span>
            {appointment.hasVr && (
              <div className="bg-yellow-400 text-slate-900 px-0.5 rounded flex items-center gap-0.5 shadow-sm">
                <Car size={8} fill="currentColor" />
                <span className="text-[5px] font-black">VR</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 pl-3 leading-none min-w-0">
             <span className="text-[7px] font-black text-blue-600 truncate uppercase">
                {appointment.insurance || "SANS ASS."}
             </span>
             <span className="text-[7px] font-bold text-slate-300">|</span>
             <span className="text-[7px] font-bold text-slate-400 truncate uppercase">
                {appointment.expert || "SANS EXP."}
             </span>
          </div>
        </div>

        <div className={`border-l-2 px-1 py-0.5 mb-1 flex-1 overflow-hidden ${isAnnule ? 'bg-slate-50 border-slate-300' : 'bg-blue-50/60 border-blue-500'}`}>
          <span className={`text-[7px] font-black leading-[1.1] line-clamp-3 uppercase tracking-tight ${isAnnule ? 'text-slate-400' : 'text-blue-900'}`}>
            {appointment.workType || "TRAVAUX..."}
          </span>
        </div>

        <div className="flex items-center justify-between border-t border-slate-50 pt-1 mt-auto">
          <div className="flex gap-1 items-center w-full">
            <div className="flex gap-1 items-center">
              {['t1','t2','tp','meca'].map(k => (
                <div key={k} className="flex flex-col items-center">
                  <span className="text-[5px] text-slate-400 font-black leading-none">{k.toUpperCase()}</span>
                  <span className={`text-[8px] font-black leading-none ${(appointment.laborTimes as any)[k] > 0 ? (k === 'meca' ? 'text-blue-600' : 'text-slate-800') : 'text-slate-200'}`}>
                    {(appointment.laborTimes as any)[k] || "0"}
                  </span>
                </div>
              ))}
            </div>
            
            <div className="w-px h-3 bg-slate-100 mx-0.5" />
            
            <div className={`rounded-[2px] px-1 py-0.5 text-[8.5px] font-black font-mono leading-none border ${isAnnule ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-slate-900 text-white border-slate-700'}`}>
              {totalLaborHours.toFixed(1)}H
            </div>

            <div className="flex items-center gap-1 ml-auto">
              <button onClick={handlePRClick} className={`p-0.5 rounded border transition-all ${getPRStyle(appointment.prStatus, true)}`}>
                <Package size={10} />
              </button>
              <Compass size={11} className={appointment.hasGeo ? "text-amber-500" : "text-slate-100"} />
              <Snowflake size={11} className={appointment.hasClim ? "text-sky-400" : "text-slate-100"} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppointmentCard;
