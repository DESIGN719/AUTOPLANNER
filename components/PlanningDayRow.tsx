
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DayData, LaborTimes, VRBooking, VRData } from '../types';
import AppointmentCard from './AppointmentCard';
import { ROW_HEIGHT_PX, FRENCH_HOLIDAYS_2026 } from '../constants';
import { Plus, Lock, Unlock, StickyNote, Car, Calendar as CalendarIcon, Wrench } from 'lucide-react';

interface PlanningDayRowProps {
  dayData: DayData;
  activeVrs: VRData[];
  allVrBookings: VRBooking[];
  isBlocked: boolean; 
  onToggleBlock: () => void;
  onDropAppointment: (id: string, newDate: string) => void;
  onDropNote: (sourceDate: string, targetDate: string) => void;
  onEditAppointment: (id: string) => void;
  onEditVRBooking: (id: string) => void;
  onResizeVRStart: (id: string, part: 'start' | 'end') => void;
  onMoveVRBooking: (id: string, newVrId: string) => void;
  onUpdateVRBookingTime?: (id: string, part: 'start' | 'end', newHour: number, dayOffset: number) => void;
  onAddAppointment: (date: string) => void;
  onEditNote: (date: string) => void;
  onCreateVRFromAppointment: (aptId: string, vid: string, date: string, hour: number) => void;
  zIndex: number;
}

const getISOWeek = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

const PlanningDayRow: React.FC<PlanningDayRowProps> = ({ 
  dayData, activeVrs, allVrBookings, isBlocked, onToggleBlock, onDropAppointment, onDropNote, onEditAppointment, onEditVRBooking, onResizeVRStart, onMoveVRBooking, onUpdateVRBookingTime, onAddAppointment, onEditNote, onCreateVRFromAppointment, zIndex
}) => {
  const { date, appointments, note } = dayData;
  const [isOverWorkshop, setIsOverWorkshop] = useState(false);
  const [dragOverVR, setDragOverVR] = useState<{vrId: string, hour: number} | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const BANNER_HEIGHT = 26; 
  const GRID_HEIGHT = ROW_HEIGHT_PX - BANNER_HEIGHT; 
  const hourHeight = GRID_HEIGHT / 10; 
  
  const dateObj = useMemo(() => new Date(date), [date]);
  const weekNum = useMemo(() => getISOWeek(dateObj), [dateObj]);
  const holidayName = FRENCH_HOLIDAYS_2026[date];
  
  const todayStr = useMemo(() => currentTime.toISOString().split('T')[0], [currentTime]);
  const isToday = date === todayStr;

  const blockReason = useMemo(() => {
    if (!isBlocked) return "";
    if (holidayName) return holidayName.toUpperCase();
    const day = dateObj.getDay();
    if (day === 0 || day === 6) return "WEEK-END";
    return "JOUR FERMÉ";
  }, [isBlocked, holidayName, dateObj]);

  const headerBgClass = useMemo(() => {
    if (isBlocked) return 'bg-[#ea580c]'; 
    if (isToday) return 'bg-blue-600';     
    return 'bg-[#1e293b]';                
  }, [isBlocked, isToday]);

  const timeToDecimal = (timeStr: string): number => {
    if (!timeStr) return 8;
    const [h, m] = timeStr.split(':').map(Number);
    return Math.max(8, Math.min(18, h + (m / 60)));
  };

  const calculateTop = (timeStr: string) => (timeToDecimal(timeStr) - 8) * hourHeight;

  const redLineTop = useMemo(() => {
    if (!isToday || isBlocked) return null;
    const hours = currentTime.getHours();
    if (hours < 8 || hours >= 18) return null;
    return (hours + currentTime.getMinutes() / 60 - 8) * hourHeight;
  }, [isToday, currentTime, hourHeight, isBlocked]);

  const processedVrBookings = useMemo(() => {
    const carData: Record<string, any[]> = {};
    activeVrs.forEach(vr => {
      const dayBookings = allVrBookings
        .filter(b => b.vrId === vr.id && b.startDate <= date && b.endDate >= date && b.status !== 'annule')
        .map(b => ({
          ...b,
          startDec: b.startDate < date ? 8 : timeToDecimal(b.startHour),
          endDec: b.endDate > date ? 18 : timeToDecimal(b.endHour)
        }))
        .sort((a, b) => a.startDec - b.startDec || a.endDec - b.endDec);

      carData[vr.id] = dayBookings.map((b, i) => {
        let overlapIndex = 0;
        let hasConflict = false;
        for (let j = 0; j < dayBookings.length; j++) {
          if (i === j) continue;
          const other = dayBookings[j];
          if (b.startDec < other.endDec && other.startDec < b.endDec) {
            hasConflict = true;
            if (other.startDec < b.startDec || (other.startDec === b.startDec && j < i)) overlapIndex++;
          }
        }
        return { ...b, overlapIndex, hasConflict };
      });
    });
    return carData;
  }, [activeVrs, allVrBookings, date]);

  const dayName = dateObj.toLocaleDateString('fr-FR', { weekday: 'short' }).toUpperCase();
  const dayDate = dateObj.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }).toUpperCase();

  return (
    <div 
      className={`flex flex-col border-b border-slate-700/50 relative overflow-visible transition-all duration-300 ${isBlocked ? 'bg-[#0f172a]' : 'bg-[#101827]'}`} 
      style={{ zIndex, minHeight: isBlocked ? `${BANNER_HEIGHT}px` : `${ROW_HEIGHT_PX}px` }}
    >
      
      {/* 1. HEADER COMPACT (26px) */}
      <div className={`flex items-stretch sticky top-0 left-0 z-[110] shadow-sm border-b border-white/5 ${headerBgClass}`} style={{ height: `${BANNER_HEIGHT}px` }}>
        
        {/* Identifiant VR - Layout plus compact avec icône voiture et modèle */}
        <div className="w-[320px] shrink-0 border-r-2 border-slate-800/50 flex bg-black/10">
           {/* Icône voiture en début de bandeau */}
           <div className="w-8 shrink-0 flex items-center justify-center border-r border-white/5 text-white/40">
             <Car size={14} />
           </div>
           {activeVrs.map((vr) => (
             <div key={vr.id} className="flex-1 border-r border-white/5 last:border-0 flex flex-col items-center justify-center px-1 overflow-hidden leading-none gap-0.5">
               <span className="text-[8px] font-black text-white truncate w-full text-center uppercase tracking-tighter">{vr.immatriculation}</span>
               <span className="text-[6.5px] font-bold text-white/40 truncate w-full text-center uppercase">{vr.modele}</span>
             </div>
           ))}
        </div>

        {/* Info Jour et Actions - Alignement horizontal serré */}
        <div className="flex-1 flex items-center px-3 justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onToggleBlock} className="text-white/30 hover:text-white transition-colors">
              {isBlocked ? <Lock size={11} /> : <Unlock size={11} />}
            </button>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black text-white tracking-wider">{dayName}</span>
              <span className="text-[11px] font-black text-white/40">{dayDate}</span>
              <div className="w-px h-3 bg-white/10 mx-0.5" />
              <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">S{String(weekNum).padStart(2, '0')}</span>
            </div>
          </div>

          {!isBlocked ? (
            <div className="flex items-center gap-2">
              <button onClick={() => onEditNote(date)} title="Note du jour" className={`p-1 rounded transition-all ${note ? 'bg-yellow-400 text-slate-950 shadow-sm' : 'text-white/30 hover:text-white'}`}>
                <StickyNote size={12}/>
              </button>
              <button onClick={() => onAddAppointment(date)} className="bg-white/95 text-blue-700 h-[18px] px-2 rounded-md text-[8px] font-black uppercase hover:bg-white transition-all flex items-center gap-1 active:scale-95 shadow-sm">
                <Plus size={10}/> RDV
              </button>
            </div>
          ) : (
            <div className="flex items-center">
               <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/60 italic">
                 {blockReason}
               </span>
            </div>
          )}
        </div>
      </div>

      {/* 2. ZONE DE CONTENU */}
      {!isBlocked && (
        <div ref={containerRef} className="flex relative flex-1 overflow-hidden" style={{ height: `${GRID_HEIGHT}px` }}>
          
          {/* BLOC VR (Timeline) */}
          <div className="w-[320px] shrink-0 flex border-r-2 border-slate-700 bg-slate-900/10 relative z-20">
             <div className="w-[32px] shrink-0 h-full border-r border-slate-800/40 flex flex-col pointer-events-none bg-black/5">
                {Array.from({length: 10}).map((_, i) => (
                  <div key={i} className="flex items-center justify-center border-b border-slate-800/20 text-[6.5px] font-black text-slate-600" style={{ height: `${hourHeight}px` }}>
                    {i+8}H
                  </div>
                ))}
             </div>
             
             {redLineTop !== null && (
               <div className="absolute left-0 right-[-1000px] border-t border-red-500/60 z-[100] pointer-events-none" style={{ top: `${redLineTop}px` }}>
                 <div className="absolute left-[29px] -top-[3.5px] w-2 h-2 rounded-full bg-red-600 shadow-[0_0_10px_rgba(239,68,68,0.9)]" />
               </div>
             )}

             {activeVrs.map((vr) => (
               <div key={vr.id} className="flex-1 border-r border-slate-800/30 last:border-0 relative flex flex-col group/vr-col">
                 {Array.from({ length: 10 }).map((_, h) => {
                   const slotHour = 8 + h;
                   return (
                     <div 
                      key={h} 
                      onDragOver={(e) => { e.preventDefault(); setDragOverVR({vrId: vr.id, hour: slotHour}); }} 
                      onDragLeave={() => setDragOverVR(null)} 
                      onDrop={(e) => { 
                        e.preventDefault(); 
                        setDragOverVR(null); 
                        const bid = e.dataTransfer.getData('vrBookingId'); 
                        const aid = e.dataTransfer.getData('appointmentId'); 
                        if (bid) onMoveVRBooking(bid, vr.id); 
                        else if (aid) onCreateVRFromAppointment(aid, vr.id, date, slotHour); 
                      }} 
                      className={`border-b border-white/[0.02] transition-colors ${dragOverVR?.vrId === vr.id && dragOverVR?.hour === slotHour ? 'bg-blue-600/30' : 'hover:bg-white/[0.01]'}`}
                      style={{ height: `${hourHeight}px` }}
                     />
                   );
                 })}

                 {(processedVrBookings[vr.id] || []).map(booking => {
                    const top = calculateTop(booking.startDate < date ? '08:00' : booking.startHour);
                    const bottom = calculateTop(booking.endDate > date ? '18:00' : booking.endHour);
                    const height = bottom - top;
                    
                    const isReturned = booking.endMileage !== undefined && booking.endMileage > 0;
                    const isCurrent = !isReturned && booking.startDate <= todayStr && booking.endDate >= todayStr;
                    
                    let bgColor = 'bg-[#fbbf24] border-[#d97706] text-slate-950'; 
                    if (isReturned) bgColor = 'bg-emerald-600 border-emerald-400 text-white'; 
                    if (isCurrent) bgColor = 'bg-blue-600 border-blue-400 text-white'; 

                    const horizontalOffset = booking.overlapIndex * 3;

                    return (
                      <div 
                        key={booking.id} 
                        draggable 
                        onDragStart={(e) => e.dataTransfer.setData('vrBookingId', booking.id)} 
                        onDoubleClick={(e) => { e.stopPropagation(); onEditVRBooking(booking.id); }} 
                        className={`absolute border rounded-md shadow-sm flex flex-col cursor-pointer overflow-hidden transition-all group/booking box-border ${bgColor} ${booking.hasConflict ? 'animate-blink-overlap' : 'hover:z-[200]'}`} 
                        style={{ 
                          top: `${top}px`,
                          height: `${height}px`,
                          left: `${horizontalOffset}px`,
                          width: `calc(100% - ${horizontalOffset}px)`, 
                          zIndex: 10 + booking.overlapIndex
                        }}
                      >
                         <div className="flex-1 px-1 flex flex-col items-center justify-center text-center overflow-hidden pointer-events-none leading-none">
                           <span className="text-[7.5px] font-black uppercase truncate w-full tracking-tighter">{booking.clientName}</span>
                         </div>
                      </div>
                    );
                 })}
               </div>
             ))}
          </div>

          {/* BLOC CHANTIER */}
          <div 
            onDragOver={(e) => { e.preventDefault(); setIsOverWorkshop(true); }} 
            onDragLeave={() => setIsOverWorkshop(false)} 
            onDrop={(e) => { 
              e.preventDefault(); 
              setIsOverWorkshop(false); 
              const aid = e.dataTransfer.getData('appointmentId'); 
              const noteSourceDate = e.dataTransfer.getData('noteDate'); 
              if (aid) onDropAppointment(aid, date); 
              if (noteSourceDate) onDropNote(noteSourceDate, date); 
            }} 
            className={`flex-1 flex items-center px-4 py-1 gap-4 overflow-x-auto relative transition-colors duration-300 ${isOverWorkshop ? 'bg-blue-600/5' : ''}`}
            style={{ overflowY: 'hidden' }}
          >
            {note && (
              <div 
                draggable 
                onDragStart={(e) => e.dataTransfer.setData('noteDate', date)} 
                onClick={() => onEditNote(date)} 
                className="shrink-0 w-[240px] h-[94px] bg-yellow-400/5 border border-yellow-400/30 border-dashed rounded-xl p-3 flex flex-col gap-1.5 cursor-pointer hover:bg-yellow-400/10 transition-all cursor-move group"
              >
                 <div className="flex items-center gap-1.5 text-yellow-500 font-black text-[8px] uppercase tracking-widest group-hover:scale-105 transition-transform origin-left">
                    <StickyNote size={11} /> Note du jour
                 </div>
                 <div className="text-[9px] font-bold text-slate-400 leading-tight overflow-hidden line-clamp-4 whitespace-pre-wrap uppercase">
                    {note}
                 </div>
              </div>
            )}

            {appointments.length === 0 && !note && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
                <Wrench size={40} className="text-white" />
              </div>
            )}

            {appointments.map((apt) => (
              <AppointmentCard key={apt.id} appointment={apt} variant="summary" onEdit={onEditAppointment} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanningDayRow;
