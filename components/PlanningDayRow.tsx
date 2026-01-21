
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DayData, LaborTimes, VRBooking, VRData } from '../types';
import AppointmentCard from './AppointmentCard';
import { ROW_HEIGHT_PX, FRENCH_HOLIDAYS_2026 } from '../constants';
import { Plus, Lock, Unlock, StickyNote, Calendar as CalendarIcon, Wrench, Ban } from 'lucide-react';

interface PlanningDayRowProps {
  dayData: DayData;
  activeVrs: VRData[];
  allVrBookings: VRBooking[];
  isBlocked: boolean; 
  isAlternate?: boolean;
  customReason?: string;
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
  headerTopOffset?: number;
}

const getISOWeek = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

const PlanningDayRow: React.FC<PlanningDayRowProps> = ({ 
  dayData, activeVrs, allVrBookings, isBlocked, isAlternate = false, customReason, onToggleBlock, onDropAppointment, onDropNote, onEditAppointment, onEditVRBooking, onResizeVRStart, onMoveVRBooking, onUpdateVRBookingTime, onAddAppointment, onEditNote, onCreateVRFromAppointment, zIndex, headerTopOffset = 0
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

  const WORKSHOP_HEADER_HEIGHT = 26;
  const VR_START_HOUR = 7;
  const VR_END_HOUR = 19;
  const VR_HOURS_COUNT = VR_END_HOUR - VR_START_HOUR;
  
  // Si bloqué, on affiche une ligne réduite de 26px
  const currentRowHeight = isBlocked ? WORKSHOP_HEADER_HEIGHT : ROW_HEIGHT_PX;
  const vrHourHeight = currentRowHeight / VR_HOURS_COUNT;
  
  const dateObj = useMemo(() => new Date(date), [date]);
  const weekNum = useMemo(() => getISOWeek(dateObj), [dateObj]);
  const holidayName = FRENCH_HOLIDAYS_2026[date];
  
  const todayStr = useMemo(() => currentTime.toISOString().split('T')[0], [currentTime]);
  const isToday = date === todayStr;

  const dailyStats = useMemo(() => {
    return appointments.reduce((acc, curr) => ({
      t1: acc.t1 + (curr.laborTimes.t1 || 0),
      t2: acc.t2 + (curr.laborTimes.t2 || 0),
      tp: acc.tp + (curr.laborTimes.tp || 0),
      meca: acc.meca + (curr.laborTimes.meca || 0)
    }), { t1: 0, t2: 0, tp: 0, meca: 0 });
  }, [appointments]);

  const totalHours = dailyStats.t1 + dailyStats.t2 + dailyStats.tp + dailyStats.meca;

  const blockReason = useMemo(() => {
    if (!isBlocked) return "";
    if (customReason) return customReason.toUpperCase();
    if (holidayName) return holidayName.toUpperCase();
    const day = dateObj.getDay();
    if (day === 0 || day === 6) return "WEEK-END";
    return "JOUR BLOQUE";
  }, [isBlocked, holidayName, dateObj, customReason]);

  const rowBgClass = useMemo(() => {
    if (isBlocked) return 'bg-[#0f172a]';
    // Alternance plus marquée : Slate 900 (Foncé) / Slate 800 (Plus clair)
    return isAlternate ? 'bg-[#1e293b]' : 'bg-[#0f172a]';
  }, [isBlocked, isAlternate]);

  const headerBgClass = useMemo(() => {
    if (isBlocked) return 'bg-[#ea580c]'; 
    if (isToday) return 'bg-blue-600';     
    // L'en-tête reprend exactement la couleur de la ligne pour se fondre
    return isAlternate ? 'bg-[#1e293b]' : 'bg-[#0f172a]';               
  }, [isBlocked, isToday, isAlternate]);

  const leftBlockBgClass = useMemo(() => {
    if (isBlocked) return 'bg-[#ea580c]';
    // Le bloc de gauche ajoute une teinte sombre par transparence pour se distinguer légèrement
    return 'bg-slate-900/20';
  }, [isBlocked]);

  const timeToDecimal = (timeStr: string): number => {
    if (!timeStr) return VR_START_HOUR;
    const [h, m] = timeStr.split(':').map(Number);
    return Math.max(VR_START_HOUR, Math.min(VR_END_HOUR, h + (m / 60)));
  };

  const calculateTop = (timeStr: string) => (timeToDecimal(timeStr) - VR_START_HOUR) * vrHourHeight;

  const redLineTop = useMemo(() => {
    if (!isToday) return null; 
    const hours = currentTime.getHours();
    if (hours < VR_START_HOUR || hours >= VR_END_HOUR) return null;
    return (hours + currentTime.getMinutes() / 60 - VR_START_HOUR) * vrHourHeight;
  }, [isToday, currentTime, vrHourHeight]);

  const processedVrBookings = useMemo(() => {
    const carData: Record<string, any[]> = {};
    activeVrs.forEach(vr => {
      const dayBookings = allVrBookings
        .filter(b => b.vrId === vr.id && b.startDate <= date && b.endDate >= date && b.status !== 'ANNULE')
        .map(b => ({
          ...b,
          startDec: b.startDate < date ? VR_START_HOUR : timeToDecimal(b.startHour),
          endDec: b.endDate > date ? VR_END_HOUR : timeToDecimal(b.endHour)
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

  const StatItem = ({ label, value, colorClass = "text-white" }: { label: string, value: string, colorClass?: string }) => (
    <div className="w-12 flex flex-col items-center justify-center leading-none">
        <span className="text-[8px] font-bold text-white/50 uppercase mb-0.5">{label}</span>
        <span className={`text-[11px] font-black ${colorClass}`}>{value}</span>
    </div>
  );

  return (
    <div 
      className={`flex border-b border-slate-700/50 relative overflow-visible transition-colors duration-200 ${rowBgClass}`} 
      style={{ zIndex, height: `${currentRowHeight}px` }} 
    >
      
      {/* 1. BLOC GAUCHE : VR (Hauteur complète 128px ou 26px si bloqué) */}
      <div className={`w-[320px] shrink-0 flex border-r-2 border-slate-700 ${leftBlockBgClass} relative z-20`}>
        
        {/* Colonne des heures (07h-19h) */}
        <div className="w-[32px] shrink-0 h-full border-r border-slate-800/40 flex flex-col pointer-events-none bg-black/5">
            {!isBlocked && Array.from({length: VR_HOURS_COUNT}).map((_, i) => (
                <div key={i} className="flex items-center justify-center border-b border-slate-800/20 text-[9px] font-black text-slate-600" style={{ height: `${vrHourHeight}px` }}>
                {i + VR_START_HOUR}H
                </div>
            ))}
        </div>

        {/* Ligne rouge "Maintenant" */}
        {!isBlocked && redLineTop !== null && (
            <div className="absolute left-0 right-0 border-t border-red-500/60 z-[150] pointer-events-none" style={{ top: `${redLineTop}px` }}>
                <div className="absolute left-[29px] -top-[3.5px] w-2 h-2 rounded-full bg-red-600 shadow-[0_0_10px_rgba(239,68,68,0.9)]" />
            </div>
        )}

        {/* Colonnes des VRs */}
        {activeVrs.map((vr) => (
            <div key={vr.id} className="flex-1 border-r border-slate-800/30 last:border-0 relative flex flex-col group/vr-col">
                {!isBlocked && Array.from({ length: VR_HOURS_COUNT }).map((_, h) => {
                    const slotHour = VR_START_HOUR + h;
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
                        style={{ height: `${vrHourHeight}px` }}
                        />
                    );
                })}

                {(processedVrBookings[vr.id] || []).map(booking => {
                    const top = calculateTop(booking.startDate < date ? '07:00' : booking.startHour);
                    const bottom = calculateTop(booking.endDate > date ? '19:00' : booking.endHour);
                    const height = Math.max(bottom - top, vrHourHeight / 4); // Min height
                    
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
                            zIndex: 100 + booking.overlapIndex
                        }}
                        >
                            <div className="flex-1 px-1 flex flex-col items-center justify-center text-center overflow-hidden leading-none relative">
                                <span className="text-[8px] font-black uppercase tracking-tighter w-full whitespace-nowrap overflow-x-auto no-scrollbar scroll-on-hover">{booking.clientName}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        ))}
      </div>


      {/* 2. BLOC DROIT : CHANTIER (Vertical : Header + Content) */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Header Chantier (26px) - La couleur de fond s'adapte via headerBgClass */}
        <div className={`flex items-center px-3 justify-between relative shadow-sm border-b border-white/5 shrink-0 ${headerBgClass}`} style={{ height: `${WORKSHOP_HEADER_HEIGHT}px` }}>
            
            {/* Info Jour */}
            <div className="flex items-center gap-3 relative z-10">
                <button onClick={onToggleBlock} className="text-white/30 hover:text-white transition-colors" title={isBlocked ? "Débloquer" : "Bloquer"}>
                    {isBlocked ? <Lock size={11} /> : <Unlock size={11} />}
                </button>
                <div className="flex items-center gap-2">
                    <span className="text-[13px] font-black text-white tracking-wider">{dayName}</span>
                    <span className="text-[13px] font-black text-white/40">{dayDate}</span>
                    <div className="w-px h-3 bg-white/10 mx-0.5" />
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">S{String(weekNum).padStart(2, '0')}</span>
                </div>
            </div>

            {/* Boutons Actions */}
            {!isBlocked && (
                <div className="absolute left-[220px] top-1/2 -translate-y-1/2 z-20 flex items-center gap-2">
                    <button onClick={() => onEditNote(date)} title="Note du jour" className={`p-1 rounded transition-all ${note ? 'bg-yellow-400 text-slate-950 shadow-sm' : 'text-white/30 hover:text-white'}`}>
                        <StickyNote size={12}/>
                    </button>
                    <button onClick={() => onAddAppointment(date)} className="bg-white/95 text-blue-700 h-[18px] px-2 rounded-md text-[9px] font-black uppercase hover:bg-white transition-all flex items-center gap-1 active:scale-95 shadow-sm">
                        <Plus size={10}/> RDV
                    </button>
                </div>
            )}

            {/* Stats du jour */}
            {!isBlocked && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="flex items-center opacity-90">
                        <StatItem label="T1" value={dailyStats.t1.toFixed(1)} />
                        <StatItem label="T2" value={dailyStats.t2.toFixed(1)} />
                        <StatItem label="TP" value={dailyStats.tp.toFixed(1)} />
                        <StatItem label="MECA" value={dailyStats.meca.toFixed(1)} />
                        
                        <div className="w-px h-4 bg-white/20 mx-2"></div>
                        
                        <div className="w-16 flex flex-col items-center justify-center leading-none">
                            <span className="text-[8px] font-bold text-white/50 uppercase mb-0.5">TOTAL</span>
                            <span className="text-[11px] font-black text-white">{totalHours.toFixed(1)}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Info Blocage */}
            <div className="flex items-center gap-2 relative z-10 ml-auto">
                {isBlocked && (
                <div className="flex items-center gap-2 mr-4">
                    <Ban size={12} className="text-white/50" />
                    <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/90">
                        {blockReason}
                    </span>
                </div>
                )}
            </div>
        </div>

        {/* Content Chantier (Rest of height) */}
        {!isBlocked && (
            <div className="flex-1 relative flex overflow-hidden">
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
                    className={`absolute inset-0 flex items-center px-4 py-1 gap-4 overflow-x-auto transition-colors duration-300 ${isOverWorkshop ? 'bg-blue-600/5' : ''}`}
                    style={{ overflowY: 'hidden' }}
                 >
                    {appointments.length === 0 && !note && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
                            <Wrench size={40} className="text-white" />
                        </div>
                    )}

                    {appointments.map((apt) => (
                        <AppointmentCard key={apt.id} appointment={apt} variant="summary" onEdit={onEditAppointment} />
                    ))}

                    {note && (
                        <div 
                        draggable 
                        onDragStart={(e) => e.dataTransfer.setData('noteDate', date)} 
                        onClick={() => onEditNote(date)} 
                        className="shrink-0 w-[240px] h-[94px] bg-yellow-400/5 border border-yellow-400/30 border-dashed rounded-xl p-3 flex flex-col gap-1.5 cursor-pointer hover:bg-yellow-400/10 transition-all cursor-move group ml-auto"
                        >
                            <div className="flex items-center gap-1.5 text-yellow-500 font-black text-[10px] uppercase tracking-widest group-hover:scale-105 transition-transform origin-left">
                                <StickyNote size={11} /> Note du jour
                            </div>
                            <div className="text-[11px] font-bold text-slate-400 leading-tight overflow-hidden line-clamp-4 whitespace-pre-wrap uppercase">
                                {note}
                            </div>
                        </div>
                    )}
                 </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default PlanningDayRow;
