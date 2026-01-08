
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DayData, LaborTimes, VRBooking, VRData } from '../types';
import AppointmentCard from './AppointmentCard';
import { ROW_HEIGHT_PX, FRENCH_HOLIDAYS_2026 } from '../constants';
import { Plus, Lock, Unlock, StickyNote, Car, Wrench, AlertTriangle } from 'lucide-react';

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
  const CONTENT_HEIGHT = ROW_HEIGHT_PX - BANNER_HEIGHT;
  const hourHeight = CONTENT_HEIGHT / 10;
  const dateObj = useMemo(() => new Date(date), [date]);
  const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
  const holidayName = FRENCH_HOLIDAYS_2026[date];
  const isVisuallyClosed = isWeekend || !!holidayName || isBlocked;
  const isToday = useMemo(() => date === currentTime.toISOString().split('T')[0], [date, currentTime]);

  const totalTimes = appointments.reduce((acc, curr) => ({
    t1: acc.t1 + curr.laborTimes.t1, t2: acc.t2 + curr.laborTimes.t2, tp: acc.tp + curr.laborTimes.tp, meca: acc.meca + curr.laborTimes.meca,
  }), { t1: 0, t2: 0, tp: 0, meca: 0 } as LaborTimes);

  const timeToDecimal = (timeStr: string): number => {
    if (!timeStr) return 8;
    const [h, m] = timeStr.split(':').map(Number);
    const decimal = h + (m / 60);
    return Math.max(8, Math.min(18, decimal));
  };

  const calculateTop = (timeStr: string) => {
    const decimal = timeToDecimal(timeStr);
    return (decimal - 8) * hourHeight;
  };

  const getBannerStyles = () => {
    if (isBlocked || holidayName || isWeekend) return 'bg-amber-600 border-amber-700';
    if (isToday) return 'bg-[#0369a1] border-sky-800';
    return 'bg-[#1e40af] border-blue-900/10';
  };

  const redLineTop = useMemo(() => {
    if (!isToday) return null;
    const hours = currentTime.getHours();
    if (hours < 8 || hours >= 18) return null;
    return (hours + currentTime.getMinutes() / 60 - 8) * hourHeight;
  }, [isToday, currentTime, hourHeight]);

  // Calcul complexe des réservations avec détection de chevauchement et index d'empilement
  const processedVrBookings = useMemo(() => {
    const carData: Record<string, any[]> = {};
    
    activeVrs.forEach(vr => {
      // 1. Filtrer et trier les réservations du jour pour ce VR
      const dayBookings = allVrBookings
        .filter(b => b.vrId === vr.id && b.startDate <= date && b.endDate >= date && b.status !== 'annule')
        .map(b => ({
          ...b,
          startDec: b.startDate < date ? 8 : timeToDecimal(b.startHour),
          endDec: b.endDate > date ? 18 : timeToDecimal(b.endHour)
        }))
        .sort((a, b) => a.startDec - b.startDec || a.endDec - b.endDec);

      // 2. Assigner un index d'empilement (overlapIndex) pour le décalage horizontal
      const assigned = dayBookings.map((b, i) => {
        let overlapIndex = 0;
        let hasConflict = false;
        
        // Comparer avec toutes les autres réservations du jour pour ce véhicule
        for (let j = 0; j < dayBookings.length; j++) {
          if (i === j) continue;
          const other = dayBookings[j];
          
          // Détection de chevauchement temporel
          const isOverlapping = b.startDec < other.endDec && other.startDec < b.endDec;
          
          if (isOverlapping) {
            hasConflict = true;
            // On incrémente l'index seulement si l'autre réservation a commencé avant 
            // ou si elle a commencé en même temps mais possède un index plus petit (ordre du tableau)
            if (other.startDec < b.startDec || (other.startDec === b.startDec && j < i)) {
              overlapIndex++;
            }
          }
        }
        return { ...b, overlapIndex, hasConflict };
      });

      carData[vr.id] = assigned;
    });

    return carData;
  }, [activeVrs, allVrBookings, date]);

  return (
    <div className={`flex flex-col border-b border-slate-200/50 relative overflow-visible ${isVisuallyClosed ? 'opacity-90' : ''}`} style={{ zIndex }}>
      <div className={`flex items-center text-white justify-between sticky left-0 z-10 border-b shadow-sm ${getBannerStyles()}`} style={{ height: `${BANNER_HEIGHT}px` }}>
        <div className={`w-[320px] shrink-0 h-full border-r flex items-center bg-black/20 ${isVisuallyClosed ? 'border-amber-700/20' : 'border-slate-300/10'}`}>
          <div className="w-[28px] shrink-0 h-full border-r border-white/5 flex items-center justify-center bg-black/10">
            <Car size={10} className="text-yellow-400" />
          </div>
          <div className="flex-1 flex h-full">
            {activeVrs.map((vr) => (
              <div key={vr.id} className="flex-1 h-full flex flex-col items-center justify-center border-r last:border-0 border-white/5 bg-black/5 overflow-hidden">
                <span className="text-[7px] font-black uppercase tracking-tighter whitespace-nowrap">{vr.immatriculation}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 flex items-center justify-between px-3 h-full">
          <div className="flex items-center gap-3 h-full">
            <button onClick={onToggleBlock} className={`p-1 rounded hover:bg-white/10 transition-colors ${isBlocked ? 'text-amber-200' : 'text-white/40'}`}>
              {isBlocked ? <Lock size={12} /> : <Unlock size={12} />}
            </button>
            <span className="text-[9px] font-black uppercase tracking-widest min-w-[200px] flex items-center gap-2">
              <Wrench size={10} className="text-sky-300 opacity-60" />
              {dateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }).toUpperCase()}
            </span>
            <div className="flex items-center gap-1.5 ml-2 h-full">
              {!isBlocked && (
                <button onClick={() => onAddAppointment(date)} className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-400 text-white px-3 h-[20px] rounded text-[7px] font-black uppercase shadow-sm transition-all active:scale-95 self-center">
                  <Plus size={10} /> RDV
                </button>
              )}
              <button onClick={() => onEditNote(date)} className={`flex items-center gap-1.5 px-3 h-[20px] rounded text-[7px] font-black uppercase transition-all shadow-sm border self-center ${note ? 'bg-yellow-400 text-slate-900 border-yellow-500' : 'bg-white/10 text-white border-white/10'}`}>
                <StickyNote size={10} /> NOTE
              </button>
            </div>
          </div>
          {!isBlocked && (
            <div className="flex items-center gap-3 bg-black/10 px-2 py-0.5 rounded-full border border-white/5 font-mono text-[8px] font-black tracking-tighter">
              <div className="flex gap-2">
                <span>T1:{totalTimes.t1.toFixed(1)}</span>
                <span>T2:{totalTimes.t2.toFixed(1)}</span>
                <span>TP:{totalTimes.tp.toFixed(1)}</span>
                <span className="text-sky-300">MC:{totalTimes.meca.toFixed(1)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div ref={containerRef} className="flex overflow-visible relative" style={{ height: `${CONTENT_HEIGHT}px` }}>
        {/* BLOC VR (GAUCHE) */}
        <div className={`w-[320px] flex border-r-2 border-slate-300 shrink-0 relative z-20 ${isVisuallyClosed ? 'bg-amber-50/10 border-amber-100/30' : isToday ? 'bg-sky-50/50 border-sky-100' : 'bg-slate-50 border-slate-200'}`}>
           <div className="w-[28px] shrink-0 h-full border-r border-slate-200/50 flex flex-col pointer-events-none bg-slate-100/30">
              {Array.from({length: 10}).map((_, i) => (
                <div key={i} className="flex-1 flex items-center justify-center border-b border-slate-200/20 text-[6px] font-black text-slate-400">
                  {i+8}H
                </div>
              ))}
           </div>
           {redLineTop !== null && <div className="absolute left-[28px] right-0 border-t border-red-500/80 z-[150]" style={{ top: `${redLineTop}px` }}><div className="absolute -left-1 -top-[4px] w-2 h-2 rounded-full bg-red-600 shadow-sm" /></div>}
           {activeVrs.map((vr) => (
             <div key={vr.id} className={`flex-1 border-r last:border-0 relative flex flex-col ${isVisuallyClosed ? 'border-amber-200/20' : 'border-slate-200/40'}`}>
               {Array.from({ length: 10 }).map((_, h) => (
                 <div key={h} onDragOver={(e) => { e.preventDefault(); if (!isBlocked) setDragOverVR({vrId: vr.id, hour: h+8}); }} onDragLeave={() => setDragOverVR(null)} onDrop={(e) => { e.preventDefault(); setDragOverVR(null); if (isBlocked) return; const bid = e.dataTransfer.getData('vrBookingId'); const aid = e.dataTransfer.getData('appointmentId'); if (bid) onMoveVRBooking(bid, vr.id); else if (aid) onCreateVRFromAppointment(aid, vr.id, date, h+8); }} className={`flex-1 border-b border-slate-200/10 relative ${dragOverVR?.vrId === vr.id && dragOverVR?.hour === h+8 ? 'bg-yellow-500/20' : ''}`}></div>
               ))}
               {(processedVrBookings[vr.id] || []).map(booking => {
                  const top = calculateTop(booking.startDate < date ? '08:00' : booking.startHour);
                  const bottom = calculateTop(booking.endDate > date ? '18:00' : booking.endHour);
                  const height = Math.max(14, bottom - top);
                  
                  const isReturned = booking.endMileage !== undefined && booking.endMileage > 0;
                  const todayStr = new Date().toISOString().split('T')[0];
                  const isFuture = booking.startDate > todayStr;
                  const isCurrent = !isReturned && !isFuture;

                  let colorClass = 'bg-yellow-400 border-yellow-500 text-slate-900'; 
                  if (isReturned) colorClass = 'bg-emerald-500 border-emerald-600 text-white';
                  else if (isCurrent) colorClass = 'bg-blue-500 border-blue-600 text-white';
                  
                  // Calcul de la marge à gauche et de la réduction de largeur en cas de conflit
                  const horizontalOffset = booking.overlapIndex * 8;
                  const widthAdjustment = booking.overlapIndex * 4;
                  const zIndexBase = 100 + booking.overlapIndex;

                  return (
                    <div 
                      key={booking.id} 
                      draggable={!isBlocked} 
                      onDragStart={(e) => { if (isBlocked) return; e.dataTransfer.setData('vrBookingId', booking.id); }} 
                      onDoubleClick={(e) => { e.stopPropagation(); onEditVRBooking(booking.id); }} 
                      className={`absolute border rounded shadow-md flex flex-col cursor-move overflow-hidden transition-all duration-150 ${isBlocked ? 'opacity-40' : 'opacity-100'} ${colorClass} group/vr ${booking.hasConflict ? 'animate-blink-overlap' : ''}`} 
                      style={{ 
                        top: `${top + 1}px`, 
                        height: `${height - 2}px`,
                        left: `${1 + horizontalOffset}px`,
                        right: `${1}px`,
                        width: `calc(100% - ${2 + horizontalOffset + widthAdjustment}px)`,
                        zIndex: zIndexBase
                      }}
                    >
                       <div className="flex-1 px-1 flex flex-col items-center justify-center text-center overflow-hidden pointer-events-none">
                         {booking.hasConflict && <AlertTriangle size={10} className="mb-0.5 shrink-0" />}
                         <span className="text-[7px] font-black uppercase leading-tight truncate w-full px-0.5">{booking.clientName}</span>
                       </div>
                    </div>
                  );
               })}
             </div>
           ))}
        </div>

        {/* BLOC CHANTIER (DROITE) */}
        <div onDragOver={(e) => { e.preventDefault(); setIsOverWorkshop(true); }} onDragLeave={() => setIsOverWorkshop(false)} onDrop={(e) => { e.preventDefault(); setIsOverWorkshop(false); const aid = e.dataTransfer.getData('appointmentId'); const noteSourceDate = e.dataTransfer.getData('noteDate'); if (aid) onDropAppointment(aid, date); if (noteSourceDate) onDropNote(noteSourceDate, date); }} className={`flex-1 flex items-center p-1.5 gap-2 overflow-x-auto min-h-full relative ${isOverWorkshop ? 'bg-blue-600/10' : isVisuallyClosed ? 'bg-amber-50/10' : 'bg-white'}`}>
          {note && (
            <div draggable={!isBlocked} onDragStart={(e) => { if (!isBlocked) e.dataTransfer.setData('noteDate', date); }} onClick={() => onEditNote(date)} className={`shrink-0 w-[180px] h-[94px] bg-yellow-50/50 border border-yellow-200/50 border-dashed rounded p-1.5 flex flex-col gap-1 cursor-pointer hover:bg-yellow-100/30 transition-colors ${!isBlocked ? 'cursor-move' : ''}`}>
               <div className="flex items-center gap-1 text-yellow-700 font-black text-[7px] uppercase tracking-widest"><StickyNote size={8} /> Note du jour</div>
               <div className="text-[8px] font-bold text-slate-600 leading-tight overflow-hidden line-clamp-6 whitespace-pre-wrap uppercase">{note}</div>
            </div>
          )}
          {appointments.length === 0 && !note ? (
            <div className="w-full text-center text-[10px] font-black uppercase tracking-[0.4em] opacity-5 select-none">CHANTIERS</div>
          ) : (
            appointments.map((apt) => <AppointmentCard key={apt.id} appointment={apt} variant="summary" onEdit={onEditAppointment} />)
          )}
        </div>
      </div>
    </div>
  );
};

export default PlanningDayRow;
