
import React, { useMemo } from 'react';
import { Appointment, VRData } from '../types';
import { Calendar, TrendingUp, Hash, Car } from 'lucide-react';

interface WeeklySummaryBannerProps {
  startDate: string; // Format YYYY-MM-DD (Lundi)
  weekAppointments: Appointment[];
  activeVrs: VRData[];
  zIndex: number;
  onOpenVRManager?: () => void;
}

const getISOWeek = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

const WeeklySummaryBanner: React.FC<WeeklySummaryBannerProps> = ({ startDate, weekAppointments, activeVrs, zIndex, onOpenVRManager }) => {
  const dateObj = new Date(startDate);
  const weekNum = getISOWeek(dateObj);
  
  // Date de fin de semaine (Dimanche)
  const endDateObj = new Date(dateObj);
  endDateObj.setDate(dateObj.getDate() + 6);

  const formattedPeriod = `${dateObj.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }).toUpperCase()} - ${endDateObj.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }).toUpperCase()}`;
  const year = dateObj.getFullYear();

  const stats = useMemo(() => {
    return weekAppointments.reduce((acc, curr) => {
      const hours = curr.laborTimes;
      return {
        count: acc.count + 1,
        t1: acc.t1 + (hours.t1 || 0),
        t2: acc.t2 + (hours.t2 || 0),
        tp: acc.tp + (hours.tp || 0),
        meca: acc.meca + (hours.meca || 0),
        ca: acc.ca + (curr.totalAmount || 0) + (curr.vrInvoiceAmount || 0)
      };
    }, { count: 0, t1: 0, t2: 0, tp: 0, meca: 0, ca: 0 });
  }, [weekAppointments]);

  const totalMO = stats.t1 + stats.t2 + stats.tp + stats.meca;

  // Composant helper pour une stat à largeur fixe
  const StatItem = ({ label, value, colorClass = "text-white" }: { label: string, value: string, colorClass?: string }) => (
    <div className="w-12 flex flex-col items-center justify-center leading-none">
        <span className="text-[8px] font-bold text-slate-400 uppercase mb-0.5">{label}</span>
        <span className={`text-[12px] font-black ${colorClass}`}>{value}</span>
    </div>
  );

  return (
    <div 
      className="sticky top-0 left-0 right-0 flex items-stretch bg-slate-700 border-b border-slate-600 shadow-md h-[30px] select-none text-white overflow-hidden"
      style={{ zIndex }}
    >
      {/* Partie Gauche : En-têtes Colonnes VR (Alignée avec le bloc VR du PlanningDayRow) */}
      <div className="w-[320px] shrink-0 flex border-r border-slate-600 bg-slate-700">
         {/* Espace pour la colonne Heure (32px) - Devient bouton d'accès au manager VR */}
         <div 
            onClick={onOpenVRManager}
            className="w-[32px] shrink-0 border-r border-slate-600/50 flex items-center justify-center bg-black/20 text-blue-300 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
            title="Gérer la flotte VR"
         >
             <Car size={14} />
         </div>

         {/* Colonnes des noms de VR */}
         {activeVrs.map((vr) => (
             <div key={vr.id} className="flex-1 border-r border-slate-600/50 last:border-0 flex flex-col items-center justify-center px-1 overflow-hidden leading-none relative group">
                <span className="text-[8px] font-bold text-white truncate w-full text-center uppercase tracking-tighter mb-0.5">{vr.immatriculation}</span>
                <span className="text-[10px] font-black text-white/90 truncate w-full text-center uppercase tracking-tight">{vr.modele}</span>
             </div>
         ))}
      </div>

      {/* Partie Droite : En-tête Semaine + Stats (Alignement avec le bloc Chantier) */}
      <div className="flex-1 relative flex items-center px-3 bg-slate-700">
        
        {/* Identité Semaine */}
        <div className="flex items-center gap-3 relative z-10 mr-auto">
            <div className="flex items-center gap-2 bg-white/10 px-2 py-0.5 rounded text-white border border-white/20">
            <Calendar size={12} />
            <span className="text-[12px] font-black uppercase tracking-widest">SEMAINE {weekNum}</span>
            </div>
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider truncate">{formattedPeriod} {year}</span>
        </div>
        
        {/* INDICATEURS CENTRAUX */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center">
                <StatItem label="T1" value={stats.t1.toFixed(1)} />
                <StatItem label="T2" value={stats.t2.toFixed(1)} />
                <StatItem label="TP" value={stats.tp.toFixed(1)} />
                <StatItem label="MECA" value={stats.meca.toFixed(1)} />
                
                <div className="w-px h-4 bg-slate-500/50 mx-2"></div>
                
                <div className="w-16 flex flex-col items-center justify-center leading-none">
                    <span className="text-[8px] font-bold text-amber-400/70 uppercase mb-0.5">TOTAL</span>
                    <span className="text-[12px] font-black text-amber-400">{totalMO.toFixed(1)}</span>
                </div>
            </div>
        </div>

        {/* INDICATEURS DROITE (Volume & CA) */}
        <div className="ml-auto flex items-center gap-4 relative z-10 bg-slate-700 pl-6 border-l border-slate-600/50 h-full">
            {/* Volume */}
            <div className="flex items-center gap-2">
                {/* Icône Hash supprimée selon demande */}
                <div className="flex flex-col leading-none">
                    <span className="text-[8px] font-black text-slate-400 uppercase">RDV</span>
                    <span className="text-[12px] font-black text-white">{stats.count}</span>
                </div>
            </div>

            <div className="w-px h-3 bg-slate-500" />

            {/* CA */}
            <div className="flex items-center gap-2 text-emerald-300">
                <TrendingUp size={12} />
                <div className="flex flex-col leading-none">
                    <span className="text-[8px] font-black text-emerald-400/50 uppercase">CA CUMUL</span>
                    <span className="text-[12px] font-black">{stats.ca.toLocaleString('fr-FR')} €</span>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};

export default WeeklySummaryBanner;
