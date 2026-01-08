
import React, { useState } from 'react';
import { DayData, LaborTimes } from '../types';
import AppointmentCard from './AppointmentCard';
import { ROW_HEIGHT_PX } from '../constants';

interface WorkshopDayRowProps {
  dayData: DayData;
  onDropAppointment: (id: string, newDate: string) => void;
  onEditDate: (id: string) => void;
}

const WorkshopDayRow: React.FC<WorkshopDayRowProps> = ({ dayData, onDropAppointment, onEditDate }) => {
  const { date, appointments } = dayData;
  const [isOver, setIsOver] = useState(false);

  const totalTimes = appointments.reduce((acc, curr) => ({
    t1: acc.t1 + curr.laborTimes.t1,
    t2: acc.t2 + curr.laborTimes.t2,
    tp: acc.tp + curr.laborTimes.tp,
    meca: acc.meca + curr.laborTimes.meca,
  }), { t1: 0, t2: 0, tp: 0, meca: 0 } as LaborTimes);

  const formattedDate = new Date(date).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long'
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(true);
  };

  const handleDragLeave = () => {
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    const appointmentId = e.dataTransfer.getData('appointmentId');
    if (appointmentId) {
      onDropAppointment(appointmentId, date);
    }
  };

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col border-b border-slate-300 bg-white transition-colors duration-200 ${isOver ? 'bg-blue-50 ring-2 ring-inset ring-blue-400' : ''}`}
      style={{ height: `${ROW_HEIGHT_PX}px` }}
    >
      {/* Day Header & Summary Bar (h-12 = 48px) */}
      <div className="flex h-12 items-center bg-blue-600 text-white px-4 justify-between sticky left-0 z-10 shrink-0">
        <div className="flex items-center gap-8">
           <div className="text-sm font-bold uppercase tracking-widest min-w-[140px]">{formattedDate}</div>
           <div className="flex items-center gap-4 text-xs">
              <span className="font-semibold text-blue-100 flex items-center gap-1">
                CHANTIERS : <span className="text-white text-base font-bold">{appointments.length}</span>
              </span>
              <div className="h-6 w-[1px] bg-blue-500 mx-2"></div>
              <div className="flex gap-4 font-mono font-medium">
                <div className="flex flex-col items-center">
                    <span className="text-[9px] opacity-70">T1</span>
                    <span className="text-sm">{totalTimes.t1.toFixed(1)}h</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[9px] opacity-70">T2</span>
                    <span className="text-sm">{totalTimes.t2.toFixed(1)}h</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[9px] opacity-70">TP</span>
                    <span className="text-sm">{totalTimes.tp.toFixed(1)}h</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[9px] opacity-70">MECA</span>
                    <span className="text-sm">{totalTimes.meca.toFixed(1)}h</span>
                </div>
              </div>
           </div>
        </div>
        <div className="text-[10px] font-bold bg-blue-700 px-3 py-1 rounded">S 02</div>
      </div>

      {/* Appointments Grid Area (Remaining height: 160 - 48 = 112px = h-28) */}
      <div className="flex-1 flex items-center p-2 gap-4 overflow-x-auto">
        {appointments.length === 0 ? (
          <div className="w-full text-center text-slate-300 italic text-sm">
            Déposez un rendez-vous ici pour le planifier
          </div>
        ) : (
          appointments.map((apt) => (
            // Fix: Replaced onEditDate with onEdit to match AppointmentCardProps
            <AppointmentCard key={apt.id} appointment={apt} onEdit={onEditDate} />
          ))
        )}
      </div>
    </div>
  );
};

export default WorkshopDayRow;
