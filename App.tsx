
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Calendar, Settings, X, Save, Plus, Inbox, Car, BarChart3, Clock, Search, StickyNote, Trash2, Eye, EyeOff, History, Cloud, RefreshCw, Snowflake, Compass, Package, Printer, UserCircle, Copy, TrendingUp, Euro, FileText, Target, AlertCircle } from 'lucide-react';
import { DayData, Appointment, VRBooking, VRData, AppointmentStatus, PRStatus } from './types';
import { FRENCH_HOLIDAYS_2026, STATUS_CONFIG } from './constants';
import PlanningDayRow from './components/PlanningDayRow';
import AppointmentCard from './components/AppointmentCard';

const STORAGE_KEYS = {
  APPOINTMENTS: 'autoplanner_appointments',
  STOCK: 'autoplanner_stock',
  VR_BOOKINGS: 'autoplanner_vr',
  VR_FLEET: 'autoplanner_vr_fleet',
  OVERRIDES: 'autoplanner_manual_overrides',
  DAILY_NOTES: 'autoplanner_daily_notes',
  SHEETS_URL: 'autoplanner_sheets_url'
};

const DEFAULT_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbyrWMfidSUH1b800rEAdSjuneTZEgKLRdzBzwhJ-p5vyi5rO9ZDWGIEf6i-VfvSpYiuAg/exec';

const MOCK_APPOINTMENTS: Appointment[] = [
  { id: '1', clientName: 'ABITBOL LOLA', insurance: 'AXA', expert: 'BOUVET', immat: 'DRS635', model: 'VW T-ROC', workType: 'CHOC AVANT GAUCHE - DEMONTAGE COMPLET', date: '2026-01-06', appointmentHour: '08:30', status: 'en-cours', laborTimes: { t1: 2.5, t2: 1.5, tp: 3, meca: 0 }, hasVr: true, vrImmat: 'AA-123-BB', hasGeo: true, prStatus: 'recu', exitDate: '2026-01-08', exitHour: '17:00', totalAmount: 2450 },
  { id: '2', clientName: 'DUMONT JEAN', insurance: 'MACIF', expert: 'LEGRAND', immat: 'HG-022-DD', model: 'PEUGEOT 208', workType: 'REVISION DES 60.000 KM + FREINS', date: '2026-01-07', appointmentHour: '09:00', status: 'a-venir', laborTimes: { t1: 0, t2: 0, tp: 0, meca: 3.5 }, hasVr: false, hasClim: true, prStatus: 'commande', totalAmount: 480, exitDate: '2026-01-07' },
  { id: '3', clientName: 'MARTIN SOPHIE', insurance: 'ALLIANZ', expert: 'PETIT', immat: 'CC-999-ZZ', model: 'RENAULT CLIO IV', workType: 'REMPLACEMENT PARE-CHOC ARRIERE', date: '2026-01-05', appointmentHour: '08:00', status: 'livre', laborTimes: { t1: 1, t2: 0, tp: 1.5, meca: 0 }, hasVr: true, vrImmat: 'BB-456-CC', prStatus: 'recu', exitDate: '2026-01-05', exitHour: '18:00', totalAmount: 890 }
];

const MOCK_STOCK: Appointment[] = [
  { id: 's1', clientName: 'DUBOIS ALAIN', insurance: 'AXA', expert: 'BOUVET', immat: 'NN-000-JJ', model: 'NISSAN QASHQAI', workType: 'VANDALISME - RAYURES COTE GAUCHE', date: '', appointmentHour: '', status: 'stock', laborTimes: { t1: 0, t2: 8, tp: 10, meca: 0 }, hasVr: false, totalAmount: 4500, prStatus: 'a-commander' }
];

const FUEL_OPTIONS = ['Full', '3/4', '1/2', '1/4', 'Réserve'];

const getSafeStorage = (key: string, fallback: any) => {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved);
    if (parsed === null || parsed === undefined) return fallback;
    return parsed;
  } catch (e) {
    console.error(`Error loading storage ${key}:`, e);
    return fallback;
  }
};

const safeSetStorage = (key: string, value: any) => {
  try {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    localStorage.setItem(key, stringValue);
  } catch (e) {
    console.warn(`Failed to save to localStorage key "${key}":`, e);
  }
};

const App: React.FC = () => {
  const [viewStartDate, setViewStartDate] = useState('2026-01-05'); 
  const [currentView, setCurrentView] = useState<'calendar' | 'workshop'>('calendar');
  const [editingAptId, setEditingAptId] = useState<string | null>(null);
  const [newAptData, setNewAptData] = useState<Appointment | null>(null);
  const [editingVRBookingId, setEditingVRBookingId] = useState<string | null>(null);
  const [editingNoteDate, setEditingNoteDate] = useState<string | null>(null);
  const [isStockOpen, setIsStockOpen] = useState(true);
  const [isVRManagerOpen, setIsVRManagerOpen] = useState(false);
  const [editingVrDataId, setEditingVrDataId] = useState<string | null>(null);
  const [showingHistoryForVrId, setShowingHistoryForVrId] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [workshopSearch, setWorkshopSearch] = useState('');
  const [activeStatusFilters, setActiveStatusFilters] = useState<AppointmentStatus[]>(['stock', 'a-venir', 'en-cours', 'livre', 'livre-non-termine', 'facture', 'paye']);
  
  const [tempApt, setTempApt] = useState<Appointment | null>(null);
  const [tempVRBooking, setTempVRBooking] = useState<VRBooking | null>(null);
  const [tempNoteText, setTempNoteText] = useState('');
  const [showVrSelector, setShowVrSelector] = useState(false);
  
  const [sheetsUrl, setSheetsUrl] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.SHEETS_URL) || DEFAULT_SHEETS_URL;
    } catch {
      return DEFAULT_SHEETS_URL;
    }
  });
  
  const mainContentRef = useRef<HTMLDivElement>(null);

  const [appointments, setAppointments] = useState<Appointment[]>(() => getSafeStorage(STORAGE_KEYS.APPOINTMENTS, MOCK_APPOINTMENTS));
  const [stockAppointments, setStockAppointments] = useState<Appointment[]>(() => getSafeStorage(STORAGE_KEYS.STOCK, MOCK_STOCK));
  const [vrFleet, setVrFleet] = useState<VRData[]>(() => getSafeStorage(STORAGE_KEYS.VR_FLEET, [
    { id: 'vr-1', immatriculation: 'AA-123-BB', marque: 'PEUGEOT', modele: '208', vin: 'VF3...', dateMiseEnCirculation: '2022-01-01', typeCarburant: 'Essence', niveauCarburant: 'Full', kilometrage: 12500, isVisible: true, slotPosition: 1, proprietaire: 'GARAGE PRO / SOCIÉTÉ X' },
    { id: 'vr-2', immatriculation: 'BB-456-CC', marque: 'RENAULT', modele: 'CLIO', vin: 'VF1...', dateMiseEnCirculation: '2021-06-15', typeCarburant: 'Diesel', niveauCarburant: '3/4', kilometrage: 45000, isVisible: true, slotPosition: 2, proprietaire: 'GARAGE PRO / SOCIÉTÉ X' }
  ]));
  const [vrBookings, setVrBookings] = useState<VRBooking[]>(() => getSafeStorage(STORAGE_KEYS.VR_BOOKINGS, []));
  const [manualOverrides, setManualOverrides] = useState<string[]>(() => getSafeStorage(STORAGE_KEYS.OVERRIDES, []));
  const [dailyNotes, setDailyNotes] = useState<Record<string, string>>(() => getSafeStorage(STORAGE_KEYS.DAILY_NOTES, { '2026-01-06': 'LIVRAISON PRÉVUE À 17H POUR ABITBOL.\nVÉRIFIER NIVEAUX VR.' }));

  const isDateBlocked = useCallback((dateStr: string) => {
    const date = new Date(dateStr);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const isHoliday = !!FRENCH_HOLIDAYS_2026[dateStr];
    return (isWeekend || isHoliday) ? !manualOverrides.includes(dateStr) : manualOverrides.includes(dateStr);
  }, [manualOverrides]);

  const addBusinessDays = useCallback((startDateStr: string, days: number): string => {
    if (!startDateStr || isNaN(days) || days < 0) return startDateStr;
    let date = new Date(startDateStr);
    let added = 0;
    while (added < Math.floor(days)) {
      date.setDate(date.getDate() + 1);
      const dateStr = date.toISOString().split('T')[0];
      if (!isDateBlocked(dateStr)) added++;
    }
    while (isDateBlocked(date.toISOString().split('T')[0])) {
      date.setDate(date.getDate() + 1);
    }
    return date.toISOString().split('T')[0];
  }, [isDateBlocked]);

  const calculateExitInfo = (startDateStr: string, startHour: string, durationDays: number) => {
    if (!startDateStr || isNaN(durationDays) || durationDays < 0 || !startHour) return { date: startDateStr, hour: startHour };
    
    const roundedDays = Math.round(durationDays * 2) / 2;
    const [startH, startM] = startHour.split(':').map(Number);
    let currentHour = startH + (startM / 60);
    let remainingHours = roundedDays * 10;
    let currentDateStr = startDateStr;
    
    while (isDateBlocked(currentDateStr)) {
      currentDateStr = addBusinessDays(currentDateStr, 1);
      currentHour = 8;
    }

    if (currentHour < 8) currentHour = 8;
    if (currentHour >= 18) { 
      currentDateStr = addBusinessDays(currentDateStr, 1); 
      currentHour = 8; 
    }
    
    while (remainingHours > 0) {
      const availableToday = 18 - currentHour;
      if (remainingHours <= availableToday) { 
        currentHour += remainingHours; 
        remainingHours = 0; 
      } else { 
        remainingHours -= availableToday; 
        currentDateStr = addBusinessDays(currentDateStr, 1); 
        currentHour = 8; 
      }
    }
    const h = Math.floor(currentHour); const m = Math.round((currentHour - h) * 60);
    return { date: currentDateStr, hour: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
  };

  const calculateDurationFromExit = (startDateStr: string, startHour: string, endDateStr: string, endHour: string): number => {
    if (!startDateStr || !startHour || !endDateStr || !endHour) return 0;
    const [startH, startM] = startHour.split(':').map(Number);
    const [endH, endM] = endHour.split(':').map(Number);
    let sTime = Math.max(8, Math.min(18, startH + startM / 60));
    let eTime = Math.max(8, Math.min(18, endH + endM / 60));
    
    let totalHours = 0;
    let current = new Date(startDateStr);
    
    if (current.toISOString().split('T')[0] > endDateStr) return 0;

    while (current.toISOString().split('T')[0] <= endDateStr) {
      const currentStr = current.toISOString().split('T')[0];
      if (!isDateBlocked(currentStr)) {
        if (currentStr === startDateStr && currentStr === endDateStr) {
          totalHours += Math.max(0, eTime - sTime);
        } else if (currentStr === startDateStr) {
          totalHours += (18 - sTime);
        } else if (currentStr === endDateStr) {
          totalHours += (eTime - 8);
        } else {
          totalHours += 10;
        }
      }
      current.setDate(current.getDate() + 1);
    }
    return Math.round((totalHours / 10) * 2) / 2;
  };

  useEffect(() => {
    safeSetStorage(STORAGE_KEYS.APPOINTMENTS, appointments);
    safeSetStorage(STORAGE_KEYS.STOCK, stockAppointments);
    safeSetStorage(STORAGE_KEYS.VR_BOOKINGS, vrBookings);
    safeSetStorage(STORAGE_KEYS.VR_FLEET, vrFleet);
    safeSetStorage(STORAGE_KEYS.OVERRIDES, manualOverrides);
    safeSetStorage(STORAGE_KEYS.DAILY_NOTES, dailyNotes);
    safeSetStorage(STORAGE_KEYS.SHEETS_URL, sheetsUrl);
  }, [appointments, stockAppointments, vrBookings, vrFleet, manualOverrides, dailyNotes, sheetsUrl]);

  const handleLoadFromSheets = async (silent = false) => {
    if (!sheetsUrl || sheetsUrl === DEFAULT_SHEETS_URL) return;
    if (!silent) setIsSyncing(true);
    try {
      const response = await fetch(`${sheetsUrl}?action=read`);
      if (response.ok) {
        const data = await response.json();
        if (data.appointments) setAppointments(data.appointments);
        if (data.stockAppointments) setStockAppointments(data.stockAppointments);
        if (data.vrBookings) setVrBookings(data.vrBookings);
        if (data.vrFleet) setVrFleet(data.vrFleet);
        if (data.manualOverrides) setManualOverrides(data.manualOverrides);
        if (data.dailyNotes) setDailyNotes(data.dailyNotes);
        setLastSaved(new Date());
        setSyncError(false);
      } else { setSyncError(true); }
    } catch (err) { setSyncError(true); } finally { if (!silent) setIsSyncing(false); }
  };

  const handleSyncToSheets = async () => {
    if (!sheetsUrl || sheetsUrl === DEFAULT_SHEETS_URL) return;
    setIsSyncing(true);
    try {
      const payload = { action: 'write', appointments, stockAppointments, vrBookings, vrFleet, manualOverrides, dailyNotes, timestamp: new Date().toISOString() };
      await fetch(sheetsUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
      setLastSaved(new Date());
      setSyncError(false);
    } catch (err) { setSyncError(true); } finally { setIsSyncing(false); }
  };

  const handleDeleteAppointment = (id: string) => {
    const choice = window.confirm("Souhaitez-vous ANNULER ce dossier (Conserver trace) ?\n\nOK = Annuler (Archiver)\nAnnuler = Supprimer définitivement");
    
    if (choice) {
      const markAnnule = (list: Appointment[]) => list.map(a => a.id === id ? { ...a, status: 'annule' as AppointmentStatus, deletedAt: new Date().toISOString() } : a);
      setAppointments(prev => markAnnule(prev));
      setStockAppointments(prev => markAnnule(prev));
    } else {
      if (window.confirm("Êtes-vous certain de vouloir supprimer définitivement ce dossier ?")) {
        setAppointments(prev => prev.filter(a => a.id !== id));
        setStockAppointments(prev => prev.filter(a => a.id !== id));
        setVrBookings(prev => prev.filter(b => b.appointmentId !== id));
      }
    }
    setEditingAptId(null);
    setNewAptData(null);
    setTempApt(null);
    handleSyncToSheets();
  };

  const handleDeleteVRBooking = (id: string) => {
    const choice = window.confirm("Annuler cette réservation VR ?\n\nOK = Archiver comme annulée\nAnnuler = Supprimer définitivement");
    
    if (choice) {
      setVrBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'annule' } : b));
    } else {
      if (window.confirm("Supprimer définitivement la réservation ?")) {
        const bookingToDelete = vrBookings.find(b => b.id === id);
        if (bookingToDelete?.appointmentId) {
          setAppointments(prev => prev.map(a => 
            a.id === bookingToDelete.appointmentId ? { ...a, hasVr: false, vrImmat: undefined } : a
          ));
        }
        setVrBookings(prev => prev.filter(b => b.id !== id));
      }
    }
    setEditingVRBookingId(null);
    setTempVRBooking(null);
    setShowVrSelector(false);
    handleSyncToSheets();
  };

  const cyclePRStatus = useCallback((id: string) => {
    const findAndCycle = (list: Appointment[]) => list.map(a => {
      if (a.id === id) {
        const current = a.prStatus || 'none';
        const next: PRStatus = current === 'none' ? 'a-commander' : current === 'a-commander' ? 'commande' : current === 'commande' ? 'recu' : 'none';
        return { ...a, prStatus: next };
      }
      return a;
    });
    setAppointments(prev => findAndCycle(prev));
    setStockAppointments(prev => findAndCycle(prev));
  }, []);

  const dayData = useMemo<DayData[]>(() => {
    const days: DayData[] = [];
    const start = new Date(viewStartDate);
    for (let i = 0; i < 14; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      // On masque les annulés du planning visuel
      days.push({ 
        date: dateStr, 
        appointments: appointments.filter(a => a.date === dateStr && a.status !== 'annule'), 
        note: dailyNotes[dateStr] 
      });
    }
    return days;
  }, [viewStartDate, appointments, dailyNotes]);

  const activityGroups = useMemo(() => {
    const statusOrder: AppointmentStatus[] = ['stock', 'a-venir', 'en-cours', 'livre', 'livre-non-termine', 'facture', 'paye', 'annule'];
    const search = workshopSearch.toLowerCase();
    const allItems = [...appointments, ...stockAppointments];
    const filtered = allItems.filter(a => {
      const matchSearch = (a.clientName || "").toLowerCase().includes(search) || (a.immat || "").toLowerCase().includes(search) || (a.model || "").toLowerCase().includes(search);
      const matchFilter = activeStatusFilters.includes(a.status || 'a-venir');
      return matchSearch && matchFilter;
    });
    return statusOrder.map(status => ({
      status, items: filtered.filter(a => (a.status || 'a-venir') === status).sort((a, b) => {
        if (!a.date) return 1; if (!b.date) return -1;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      })
    })).filter(g => g.items.length > 0);
  }, [appointments, stockAppointments, workshopSearch, activeStatusFilters]);

  const kpis = useMemo(() => {
    const now = new Date();
    const allApts = [...appointments, ...stockAppointments].filter(a => a.status !== 'annule');

    const getStartOfWeek = (d: Date) => {
      const date = new Date(d);
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(date.setDate(diff));
    };

    const calculateForRange = (start: Date, end: Date) => {
      const sStr = start.toISOString().split('T')[0];
      const eStr = end.toISOString().split('T')[0];
      const filtered = allApts.filter(a => !!a.exitDate && a.exitDate >= sStr && a.exitDate <= eStr);
      return {
        count: filtered.length,
        ca: filtered.reduce((acc, curr) => acc + (curr.totalAmount || 0) + (curr.vrInvoiceAmount || 0), 0),
        hours: filtered.reduce((acc, curr) => acc + (curr.laborTimes.t1 + curr.laborTimes.t2 + curr.laborTimes.tp + curr.laborTimes.meca), 0),
        clim: filtered.filter(a => a.hasClim).length,
        geo: filtered.filter(a => a.hasGeo).length
      };
    };

    const startS = getStartOfWeek(now);
    const endS = new Date(startS); endS.setDate(startS.getDate() + 6);
    const startSminus1 = new Date(startS); startSminus1.setDate(startS.getDate() - 7);
    const endSminus1 = new Date(startSminus1); endSminus1.setDate(startSminus1.getDate() + 6);
    const startSplus1 = new Date(startS); startSplus1.setDate(startS.getDate() + 7);
    const endSplus1 = new Date(startSplus1); endSplus1.setDate(startSplus1.getDate() + 6);

    const startM = new Date(now.getFullYear(), now.getMonth(), 1);
    const endM = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const startMminus1 = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endMminus1 = new Date(now.getFullYear(), now.getMonth(), 0);
    const startMplus1 = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const endMplus1 = new Date(now.getFullYear(), now.getMonth() + 2, 0);

    const startN = new Date(now.getFullYear(), 0, 1);
    const endN = new Date(now.getFullYear(), 11, 31);
    const startNminus1 = new Date(now.getFullYear() - 1, 0, 1);
    const endNminus1 = new Date(now.getFullYear() - 1, 11, 31);
    const startNplus1 = new Date(now.getFullYear() + 1, 0, 1);
    const endNplus1 = new Date(now.getFullYear() + 1, 11, 31);

    return {
      weeks: {
        prev: calculateForRange(startSminus1, endSminus1),
        curr: calculateForRange(startS, endS),
        next: calculateForRange(startSplus1, endSplus1)
      },
      months: {
        prev: calculateForRange(startMminus1, endMminus1),
        curr: calculateForRange(startM, endM),
        next: calculateForRange(startMplus1, endMplus1)
      },
      years: {
        prev: calculateForRange(startNminus1, endNminus1),
        curr: calculateForRange(startN, endN),
        next: calculateForRange(startNplus1, endNplus1)
      }
    };
  }, [appointments, stockAppointments]);

  const handleSaveAppointment = (rawUpdated: Appointment) => {
    let finalStatus = rawUpdated.status || 'a-venir'; let finalDate = rawUpdated.date;
    if (finalStatus === 'stock') finalDate = '';
    const updated: Appointment = {
      ...rawUpdated, status: finalStatus, date: finalDate, clientName: (rawUpdated.clientName || "").toUpperCase(), immat: (rawUpdated.immat || "").toUpperCase(), model: (rawUpdated.model || "").toUpperCase(), workType: (rawUpdated.workType || "").toUpperCase(), intermediary: rawUpdated.intermediary?.toUpperCase(), insurance: (rawUpdated.insurance || "").toUpperCase(), expert: (rawUpdated.expert || "").toUpperCase(), notes: rawUpdated.notes?.toUpperCase(), vrImmat: rawUpdated.vrImmat?.toUpperCase()
    };
    setAppointments(prev => {
      const exists = prev.some(a => a.id === updated.id);
      if (updated.date) return exists ? prev.map(a => a.id === updated.id ? updated : a) : [...prev, updated];
      return prev.filter(a => a.id !== updated.id);
    });
    setStockAppointments(prev => {
      const exists = prev.some(a => a.id === updated.id);
      if (!updated.date) return exists ? prev.map(a => a.id === updated.id ? updated : a) : [...prev, updated];
      return prev.filter(a => a.id !== updated.id);
    });
    setEditingAptId(null); setNewAptData(null); setTempApt(null);
    handleSyncToSheets();
  };

  const handleDuplicateAppointment = (apt: Appointment) => {
    const duplicated: Appointment = {
      ...apt,
      id: Math.random().toString(36).substring(2, 11),
      date: '', 
      status: 'stock',
      invoiceNumber: '',
      billingDate: '',
      paymentDate: '',
      totalAmount: 0,
      commission: 0,
      franchise: 0,
      hasVr: false,
      vrImmat: undefined,
      vrInvoiceNumber: '',
      vrInvoiceAmount: 0,
      exitDate: '',
      exitHour: ''
    };
    setNewAptData(duplicated);
    setTempApt(duplicated);
    setEditingAptId(null);
  };

  const handleSaveVRBooking = (updated: VRBooking) => {
    setVrBookings(prev => {
      let newBookings = prev.map(b => b.id === updated.id ? updated : b);
      if (!prev.some(b => b.id === updated.id)) newBookings = [...newBookings, updated];
      return newBookings;
    });

    if (updated.endMileage && updated.endMileage > 0 && updated.status !== 'annule') {
      setVrFleet(prev => prev.map(v => v.id === updated.vrId ? {
        ...v,
        kilometrage: updated.endMileage!,
        niveauCarburant: updated.endFuel || v.niveauCarburant,
        observations: updated.observations || v.observations
      } : v));
    }

    if (updated.appointmentId && updated.status !== 'annule') {
      const newVr = vrFleet.find(v => v.id === updated.vrId);
      setAppointments(prev => prev.map(a => a.id === updated.appointmentId ? { 
        ...a, 
        clientName: updated.clientName.toUpperCase(),
        vrImmat: newVr?.immatriculation,
        hasVr: true
      } : a));
    }
    
    setEditingVRBookingId(null);
    setTempVRBooking(null);
    setShowVrSelector(false);
    handleSyncToSheets();
  };

  const handleDropAppointment = useCallback((aid: string, newDate: string) => {
    const existingApt = appointments.find(a => a.id === aid);
    const stockApt = stockAppointments.find(a => a.id === aid);
    const apt = existingApt || stockApt;

    if (!apt || apt.status === 'annule') return;
    const oldDate = apt.date;
    
    if (stockApt) {
      setStockAppointments(prev => prev.filter(a => a.id !== aid));
      setAppointments(prev => [...prev, { ...stockApt, date: newDate, status: 'a-venir' }]);
    } else if (existingApt) {
      const deltaMs = oldDate ? (new Date(newDate).getTime() - new Date(oldDate).getTime()) : 0;
      const deltaDays = Math.round(deltaMs / (1000 * 3600 * 24));
      
      setAppointments(prev => prev.map(a => {
        if (a.id === aid) {
          const updated = { ...a, date: newDate };
          if (a.exitDate && deltaDays !== 0) {
            const exitDateObj = new Date(a.exitDate);
            exitDateObj.setDate(exitDateObj.getDate() + deltaDays);
            updated.exitDate = exitDateObj.toISOString().split('T')[0];
          }
          return updated;
        }
        return a;
      }));

      if (deltaDays !== 0) {
        setVrBookings(prev => prev.map(b => {
          if (b.appointmentId === aid && b.status !== 'annule') {
            const s = new Date(b.startDate);
            s.setDate(s.getDate() + deltaDays);
            const e = new Date(b.endDate);
            e.setDate(e.getDate() + deltaDays);
            return {
              ...b,
              startDate: s.toISOString().split('T')[0],
              endDate: e.toISOString().split('T')[0]
            };
          }
          return b;
        }));
      }
    }
    handleSyncToSheets();
  }, [appointments, stockAppointments]);

  const handleDropNote = useCallback((sourceDate: string, targetDate: string) => {
    if (sourceDate === targetDate) return;
    const noteContent = dailyNotes[sourceDate];
    if (!noteContent) return;

    const newNotes = { ...dailyNotes };
    if (newNotes[targetDate]) {
        newNotes[targetDate] += '\n' + noteContent;
    } else {
        newNotes[targetDate] = noteContent;
    }
    delete newNotes[sourceDate];
    setDailyNotes(newNotes);
    handleSyncToSheets();
  }, [dailyNotes]);

  const currentEditingApt = useMemo(() => newAptData || (editingAptId ? appointments.find(a => a.id === editingAptId) || stockAppointments.find(a => a.id === editingAptId) : null), [newAptData, editingAptId, appointments, stockAppointments]);
  const tempAptTotalHours = useMemo(() => {
    if (!tempApt) return 0;
    return (tempApt.laborTimes.t1 + tempApt.laborTimes.t2 + tempApt.laborTimes.tp + tempApt.laborTimes.meca);
  }, [tempApt]);

  useEffect(() => {
    if (currentEditingApt && !tempApt) {
      const initialApt = { ...currentEditingApt, hasVr: currentEditingApt.hasVr || false, hasGeo: currentEditingApt.hasGeo || false, hasClim: currentEditingApt.hasClim || false, prStatus: currentEditingApt.prStatus || 'none' };
      if (initialApt.date && initialApt.appointmentHour && initialApt.estimatedDuration) {
        const exit = calculateExitInfo(initialApt.date, initialApt.appointmentHour, parseFloat(initialApt.estimatedDuration));
        initialApt.exitDate = exit.date;
        initialApt.exitHour = exit.hour;
      }
      setTempApt(initialApt);
    } else if (!currentEditingApt) setTempApt(null);
  }, [currentEditingApt]);

  useEffect(() => {
    if (editingVRBookingId) {
      const booking = vrBookings.find(b => b.id === editingVRBookingId);
      if (booking) {
        const vr = vrFleet.find(v => v.id === booking.vrId);
        setTempVRBooking({ ...booking, observations: booking.observations || vr?.observations || '' });
      }
    } else {
      setTempVRBooking(null);
    }
  }, [editingVRBookingId, vrBookings, vrFleet]);

  useEffect(() => {
    if (editingNoteDate) setTempNoteText(dailyNotes[editingNoteDate] || '');
    else setTempNoteText('');
  }, [editingNoteDate, dailyNotes]);

  const handleModalChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (!tempApt) return;
    const { name, value, type } = e.target;
    let newValue: any = value; 
    if (type === 'number') newValue = value === '' ? 0 : parseFloat(value);
    if (type === 'checkbox') newValue = (e.target as HTMLInputElement).checked;

    if (['t1', 't2', 'tp', 'meca'].includes(name)) {
      setTempApt(prev => prev ? { ...prev, laborTimes: { ...prev.laborTimes, [name]: newValue } } : null);
      return;
    }

    let updated = { ...tempApt, [name]: newValue };
    
    if (name === 'date' || name === 'estimatedDuration' || name === 'appointmentHour') {
      let duration = parseFloat(updated.estimatedDuration || '0');
      if (name === 'estimatedDuration') {
        duration = Math.round(duration * 2) / 2;
        updated.estimatedDuration = String(duration);
      }
      if (updated.date && !isNaN(duration) && updated.appointmentHour) {
        const exit = calculateExitInfo(updated.date, updated.appointmentHour, duration);
        updated.exitDate = exit.date; updated.exitHour = exit.hour;
      }
    } else if (name === 'exitDate') {
      if (updated.date && updated.appointmentHour && updated.exitDate) {
        const currentExitHour = updated.exitHour || '18:00';
        const newDuration = calculateDurationFromExit(updated.date, updated.appointmentHour, updated.exitDate, currentExitHour);
        updated.estimatedDuration = String(newDuration);
      }
    }
    setTempApt(updated);
  };

  const immobilizationDays = useMemo(() => {
    if (!tempApt || !tempApt.estimatedDuration) return 0;
    const val = parseFloat(tempApt.estimatedDuration);
    return Math.round(val * 2) / 2;
  }, [tempApt?.estimatedDuration]);

  const handleUpdateVrFleetMember = (id: string, updates: Partial<VRData>) => {
    setVrFleet(prev => prev.map(v => v.id === id ? { ...v, ...updates } : v));
  };

  const handleAddNewVR = () => {
    const newVr: VRData = {
      id: `vr-${Date.now()}`, immatriculation: 'NOUVEAU', marque: 'MARQUE', modele: 'MODÈLE', dateMiseEnCirculation: new Date().toISOString().split('T')[0], typeCarburant: 'Essence', niveauCarburant: 'Full', kilometrage: 0, isVisible: true, slotPosition: vrFleet.length + 1, proprietaire: 'GARAGE PRO / SOCIÉTÉ X'
    };
    setVrFleet(prev => [...prev, newVr]);
    setEditingVrDataId(newVr.id);
  };

  const handleDeleteVR = (id: string) => {
    if (window.confirm('Voulez-vous vraiment supprimer ce véhicule de la flotte ?')) {
      setVrFleet(prev => prev.filter(v => v.id !== id));
      if (editingVrDataId === id) setEditingVrDataId(null);
      setVrBookings(prev => prev.filter(b => b.vrId !== id));
    }
  };

  const editingVrData = useMemo(() => vrFleet.find(v => v.id === editingVrDataId), [vrFleet, editingVrDataId]);

  const handleAddStock = () => {
    const newStock: Appointment = {
      id: Math.random().toString(36).substring(2, 11), clientName: '', insurance: '', expert: '', intermediary: '', immat: '', model: '', workType: '', date: '', appointmentHour: '', laborTimes: { t1: 0, t2: 0, tp: 0, meca: 0 }, status: 'stock', hasGeo: false, hasClim: false, prStatus: 'none', estimatedDuration: '3.5', invoiceNumber: '', vrInvoiceNumber: '', totalAmount: 0, vrInvoiceAmount: 0
    };
    setNewAptData(newStock);
  };

  return (
    <div className="min-h-screen flex flex-col select-none overflow-hidden h-screen bg-[#101827]">
      <header className="bg-white border-b border-slate-200 px-4 py-1.5 flex items-center justify-between shrink-0 z-[100] shadow-sm text-slate-800 h-[48px]">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-1.5 rounded-lg text-white shadow-md"><Calendar size={16} /></div>
          <div><h1 className="text-sm font-black tracking-tight uppercase">AUTOPLANNER <span className="text-blue-600">PRO</span></h1><p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">LOGISTIQUE ATELIER</p></div>
        </div>
        <div className="flex-1 flex justify-center px-4">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
             <button onClick={() => setCurrentView('calendar')} className={`px-4 py-1 rounded-lg text-[9px] font-black uppercase transition-all flex items-center gap-1.5 ${currentView === 'calendar' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><Calendar size={12} /> Planning</button>
             <button onClick={() => setCurrentView('workshop')} className={`px-4 py-1 rounded-lg text-[9px] font-black uppercase transition-all flex items-center gap-1.5 ${currentView === 'workshop' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><BarChart3 size={12} /> Activité</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsVRManagerOpen(true)} className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all border flex items-center gap-1.5 shadow-sm bg-white text-slate-600 border-slate-200 hover:bg-slate-50`}><Car size={12} /> Flotte VR</button>
          <button onClick={() => setIsStockOpen(!isStockOpen)} title={currentView === 'calendar' ? "Dossiers en stock" : "Tableau KPI"} className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all ${isStockOpen ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>{currentView === 'calendar' ? <Inbox size={12} /> : <TrendingUp size={12} />}</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <main ref={mainContentRef} className="flex-1 overflow-auto bg-[#101827]">
          {currentView === 'calendar' ? (
            <div className="min-w-[1350px] flex flex-col pb-40">
              {dayData.map((day, idx) => (
                <PlanningDayRow key={day.date} dayData={day} activeVrs={vrFleet.filter(v => v.isVisible)} allVrBookings={vrBookings.filter(b => b.status !== 'annule')} isBlocked={isDateBlocked(day.date)} onToggleBlock={() => setManualOverrides(prev => prev.includes(day.date) ? prev.filter(d => d !== day.date) : [...prev, day.date])} onDropAppointment={handleDropAppointment} onDropNote={handleDropNote} onEditAppointment={setEditingAptId} onEditVRBooking={setEditingVRBookingId} onResizeVRStart={(id, part) => {}} onMoveVRBooking={(bid, vid) => {
                  setVrBookings(prev => prev.map(b => b.id === bid ? { ...b, vrId: vid } : b));
                  const booking = vrBookings.find(b => b.id === bid);
                  if (booking?.appointmentId) {
                    const newVr = vrFleet.find(v => v.id === vid);
                    if (newVr) setAppointments(prev => prev.map(a => a.id === booking.appointmentId ? { ...a, vrImmat: newVr.immatriculation } : a));
                  }
                }} onUpdateVRBookingTime={(bid, part, newHour, dayOffset) => {
                  setVrBookings(prev => prev.map(b => {
                    if (b.id !== bid) return b;
                    const timeStr = `${String(newHour).padStart(2, '0')}:00`;
                    if (part === 'end') {
                      const startDateObj = new Date(b.startDate);
                      const targetDate = new Date(startDateObj);
                      targetDate.setDate(startDateObj.getDate() + dayOffset);
                      const targetDateStr = targetDate.toISOString().split('T')[0];
                      if (targetDateStr < b.startDate || (targetDateStr === b.startDate && newHour <= parseInt(b.startHour.split(':')[0]))) {
                        return { ...b, endDate: b.startDate, endHour: String(parseInt(b.startHour.split(':')[0]) + 1).padStart(2, '0') + ':00' };
                      }
                      return { ...b, endDate: targetDateStr, endHour: timeStr };
                    }
                    return { ...b, startHour: timeStr };
                  }));
                }} onAddAppointment={(date) => setNewAptData({ 
                  id: Math.random().toString(36).substring(2, 11), clientName: '', insurance: '', expert: '', intermediary: '', immat: '', model: '', workType: '', date, appointmentHour: '08:00', laborTimes: { t1: 0, t2: 0, tp: 0, meca: 0 }, status: 'a-venir', hasGeo: false, hasClim: false, prStatus: 'none', estimatedDuration: '3.5', invoiceNumber: '', vrInvoiceNumber: '', totalAmount: 0, vrInvoiceAmount: 0
                })} onEditNote={setEditingNoteDate} onCreateVRFromAppointment={(aid, vid, date, hour) => { 
                  const apt = appointments.find(a => a.id === aid) || stockAppointments.find(a => a.id === aid); 
                  if (apt) {
                    const v = vrFleet.find(vf => vf.id === vid);
                    const sortedBookings = [...vrBookings].filter(b => b.vrId === vid && b.status !== 'annule').sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
                    const lastBooking = sortedBookings[0];
                    const startFuel = lastBooking?.endFuel ?? v?.niveauCarburant ?? 'Full';
                    setVrBookings(prev => [...prev, { 
                      id: `bk-${Date.now()}`, vrId: vid, clientName: apt.clientName, startDate: date, startHour: apt.appointmentHour || '08:00', endDate: apt.exitDate || date, endHour: apt.exitHour || '18:00', appointmentId: aid, startMileage: lastBooking?.endMileage ?? v?.kilometrage ?? 0, startFuel: startFuel, endFuel: startFuel, observations: v?.observations || '', status: 'active'
                    }]);
                    setAppointments(prev => prev.map(a => a.id === aid ? { ...a, hasVr: true, vrImmat: v?.immatriculation } : a));
                  }
                }} zIndex={100 - idx} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col h-full bg-[#0f172a] p-6 space-y-6 overflow-y-auto">
              <div className="bg-[#1e293b] rounded-2xl p-4 flex items-center justify-between shadow-sm shrink-0 gap-8">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input type="text" placeholder="RECHERCHE CLIENT, IMMAT..." value={workshopSearch} onChange={(e) => setWorkshopSearch(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 pl-11 text-white text-[10px] font-black outline-none uppercase tracking-widest focus:ring-2 focus:ring-blue-500/50" />
                </div>
                <div className="flex gap-1.5 flex-wrap justify-end">
                  {(Object.keys(STATUS_CONFIG) as AppointmentStatus[]).map(status => (
                    <button key={status} onClick={() => setActiveStatusFilters(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status])} className={`px-3 py-2 rounded-xl text-[8px] font-black uppercase border transition-all ${activeStatusFilters.includes(status) ? `${STATUS_CONFIG[status].bg} ${STATUS_CONFIG[status].color} ${STATUS_CONFIG[status].border} shadow-lg shadow-${STATUS_CONFIG[status].color.split('-')[1]}-500/10` : 'bg-slate-800 text-slate-500 border-slate-700 opacity-30 hover:opacity-50'}`}>
                      {STATUS_CONFIG[status].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-4 pb-40">
                {activityGroups.map(group => {
                  const totalCA = group.items.reduce((acc, curr) => acc + (curr.totalAmount || 0) + (curr.vrInvoiceAmount || 0), 0);
                  const totalHours = group.items.reduce((acc, curr) => acc + (curr.laborTimes.t1 + curr.laborTimes.t2 + curr.laborTimes.tp + curr.laborTimes.meca), 0);
                  return (
                    <div key={group.status} className="space-y-1">
                      <div className={`sticky top-0 z-10 flex items-center justify-between py-1.5 px-4 rounded border ${STATUS_CONFIG[group.status].bg} ${STATUS_CONFIG[group.status].border} shadow-sm backdrop-blur-md`}>
                         <h3 className={`text-[9px] font-black uppercase tracking-[0.2em] ${STATUS_CONFIG[group.status].color}`}>{STATUS_CONFIG[group.status].label}</h3>
                         <div className="flex items-center gap-6">
                            <div className="flex flex-col items-end leading-none"><span className="text-[6px] font-black opacity-30 uppercase tracking-tighter">VOL.</span><span className={`text-[9px] font-black ${STATUS_CONFIG[group.status].color}`}>{group.items.length}</span></div>
                            <div className="flex flex-col items-end leading-none"><span className="text-[6px] font-black opacity-30 uppercase tracking-tighter">CA HT</span><span className={`text-[9px] font-black ${STATUS_CONFIG[group.status].color}`}>{totalCA.toLocaleString('fr-FR')} €</span></div>
                            <div className="flex flex-col items-end leading-none"><span className="text-[6px] font-black opacity-30 uppercase tracking-tighter">MO</span><span className={`text-[9px] font-black ${STATUS_CONFIG[group.status].color}`}>{totalHours.toFixed(1)} H</span></div>
                         </div>
                      </div>
                      <div className="flex flex-col gap-1">{group.items.map(apt => <AppointmentCard key={apt.id} appointment={apt} variant="list" onEdit={setEditingAptId} onCyclePR={cyclePRStatus} className="w-full" />)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>

        {isStockOpen && (
          <aside className="w-[260px] border-l border-slate-800 bg-[#1e293b] flex flex-col shrink-0 z-50 animate-in slide-in-from-right duration-300 shadow-2xl overflow-hidden">
            {currentView === 'calendar' ? (
              <>
                <div className="p-4 bg-slate-900 border-b border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Inbox size={16} className="text-blue-400" />
                    <h2 className="text-[10px] font-black text-white uppercase tracking-widest leading-none">NON PLANIFIE ({stockAppointments.filter(a => a.status !== 'annule').length})</h2>
                  </div>
                  <button onClick={handleAddStock} className="text-blue-400 hover:text-white transition-colors" title="Nouveau dossier">
                    <Plus size={18} />
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-2.5 space-y-3 custom-scrollbar">
                  {stockAppointments.filter(a => a.status !== 'annule').length > 0 ? (stockAppointments.filter(a => a.status !== 'annule').map(apt => (<AppointmentCard key={apt.id} appointment={apt} variant="summary" onEdit={setEditingAptId} className="mx-auto" />))) : (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6 opacity-20 select-none"><Inbox size={40} className="mb-4" /><p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">Aucun dossier<br/>en stock</p></div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="p-4 bg-slate-900 border-b border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={16} className="text-emerald-400" />
                    <h2 className="text-[10px] font-black text-white uppercase tracking-widest leading-none">Indicateurs KPI</h2>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900/50 p-2 space-y-5">
                   {(() => {
                      const KPIGrid = ({ title, data, colors, labels }: { title: string, data: { prev: any, curr: any, next: any }, colors: string[], labels: string[] }) => (
                        <div className="bg-slate-800/40 rounded-xl border border-slate-800 overflow-hidden uppercase font-black">
                           <div className="p-2 border-b border-slate-800 bg-slate-800/20 text-center">
                              <span className="text-[9px] text-white tracking-[0.2em]">{title}</span>
                           </div>
                           <div className="flex flex-col text-[7px]">
                              {/* Headers Row */}
                              <div className="grid grid-cols-5 bg-slate-800/10 text-slate-500 py-1 border-b border-slate-800/30">
                                <div className="col-span-2 px-2">INDI.</div>
                                <div className="text-center">{labels[0]}</div>
                                <div className={`text-center ${colors[1]}`}>{labels[1]}</div>
                                <div className={`text-center ${colors[2]}`}>{labels[2]}</div>
                              </div>
                              {/* Volume Row */}
                              <div className="grid grid-cols-5 border-t border-slate-800/30 items-center py-1.5">
                                <div className="col-span-2 px-2 flex items-center gap-1.5"><FileText size={8} className="text-slate-600" /> VOLUME</div>
                                <div className="text-center text-[9px] text-slate-500">{data.prev.count}</div>
                                <div className={`text-center text-[10px] ${colors[1]}`}>{data.curr.count}</div>
                                <div className={`text-center text-[9px] ${colors[2]}`}>{data.next.count}</div>
                              </div>
                              {/* CA HT Row */}
                              <div className="grid grid-cols-5 border-t border-slate-800/30 items-center py-1.5 bg-white/[0.01]">
                                <div className="col-span-2 px-2 flex items-center gap-1.5"><Euro size={8} className="text-emerald-600" /> CA HT (€)</div>
                                <div className="text-center text-[8px] text-slate-500">{Math.round(data.prev.ca).toLocaleString('fr-FR')}</div>
                                <div className={`text-center text-[9px] ${colors[1]}`}>{Math.round(data.curr.ca).toLocaleString('fr-FR')}</div>
                                <div className={`text-center text-[8px] ${colors[2]}`}>{Math.round(data.next.ca).toLocaleString('fr-FR')}</div>
                              </div>
                              {/* MO Row */}
                              <div className="grid grid-cols-5 border-t border-slate-800/30 items-center py-1.5">
                                <div className="col-span-2 px-2 flex items-center gap-1.5"><Clock size={8} className="text-amber-600" /> H MO</div>
                                <div className="text-center text-[9px] text-slate-500">{data.prev.hours.toFixed(0)}</div>
                                <div className={`text-center text-[10px] ${colors[1]}`}>{data.curr.hours.toFixed(0)}</div>
                                <div className={`text-center text-[9px] ${colors[2]}`}>{data.next.hours.toFixed(0)}</div>
                              </div>
                              {/* Clim Row */}
                              <div className="grid grid-cols-5 border-t border-slate-800/30 items-center py-1.5 bg-sky-500/[0.02]">
                                <div className="col-span-2 px-2 flex items-center gap-1.5"><Snowflake size={8} className="text-sky-500" /> CLIM</div>
                                <div className="text-center text-[9px] text-slate-500">{data.prev.clim}</div>
                                <div className={`text-center text-[10px] ${colors[1]}`}>{data.curr.clim}</div>
                                <div className={`text-center text-[9px] ${colors[2]}`}>{data.next.clim}</div>
                              </div>
                              {/* Géo Row */}
                              <div className="grid grid-cols-5 border-t border-slate-800/30 items-center py-1.5">
                                <div className="col-span-2 px-2 flex items-center gap-1.5"><Compass size={8} className="text-amber-500" /> GÉO</div>
                                <div className="text-center text-[9px] text-slate-500">{data.prev.geo}</div>
                                <div className={`text-center text-[10px] ${colors[1]}`}>{data.curr.geo}</div>
                                <div className={`text-center text-[9px] ${colors[2]}`}>{data.next.geo}</div>
                              </div>
                           </div>
                        </div>
                      );

                      return (
                        <>
                          <KPIGrid 
                            title="SEMAINE" 
                            labels={['S-1', 'S', 'S+1']} 
                            data={kpis.weeks} 
                            colors={['text-slate-500', 'text-blue-400', 'text-purple-400']} 
                          />
                          <KPIGrid 
                            title="MOIS" 
                            labels={['M-1', 'M', 'M+1']} 
                            data={kpis.months} 
                            colors={['text-slate-500', 'text-emerald-400', 'text-purple-400']} 
                          />
                          <KPIGrid 
                            title="ANNEE" 
                            labels={['N-1', 'N', 'N+1']} 
                            data={kpis.years} 
                            colors={['text-slate-500', 'text-indigo-400', 'text-purple-400']} 
                          />
                          <div className="p-3 text-[7px] text-slate-500 italic text-center uppercase tracking-tighter opacity-50">Basé sur la date de sortie renseignée</div>
                        </>
                      );
                   })()}
                </div>
              </>
            )}
          </aside>
        )}
      </div>

      <footer className="bg-[#101827] border-t border-slate-800 px-4 py-1.5 flex items-center justify-between text-[8px] text-slate-500 font-black uppercase shrink-0 z-[200] h-[40px]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_6px_rgba(59,130,246,0.6)]" /><span className="tracking-widest opacity-60">AUTO-PLANNER PRO</span></div>
          <div className="h-3 w-px bg-slate-800"></div>
          <div className="flex gap-3"><span>CHANTIERS : <span className="text-white font-black">{appointments.filter(a => a.status !== 'annule').length + stockAppointments.filter(a => a.status !== 'annule').length}</span></span><span>VR : <span className="text-white font-black">{vrBookings.filter(b => b.status !== 'annule').length}</span></span></div>
        </div>
        <div className="flex items-center gap-2">
          {lastSaved && <div className={`flex items-center gap-1.5 px-2 py-1 border border-dashed rounded ${syncError ? 'border-rose-500/50 text-rose-500' : 'border-emerald-500/50 text-emerald-500'}`}><Cloud size={12} /><span className="font-black tracking-[0.05em]">{syncError ? 'ERREUR' : `SYNC: ${lastSaved.toLocaleTimeString('fr-FR')}`}</span></div>}
          <div className="flex items-center gap-1 bg-slate-800 p-0.5 rounded-lg border border-slate-700 shadow-inner">
            <button onClick={() => handleLoadFromSheets()} title="Recharger" className={`p-1 rounded transition-all hover:bg-slate-700 ${isSyncing ? 'animate-spin text-blue-400' : 'text-blue-400'}`}><RefreshCw size={12} /></button>
            <button onClick={handleSyncToSheets} disabled={isSyncing} className={`px-2 py-1 rounded text-[8px] font-black uppercase transition-all flex items-center gap-1 ${isSyncing ? 'bg-blue-900/50 text-blue-300 opacity-50 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-50'}`}><Cloud size={10} /> {isSyncing ? '...' : 'CLOUD'}</button>
          </div>
        </div>
      </footer>

      {tempApt && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col uppercase text-slate-900 my-4 animate-in fade-in zoom-in-95 duration-200 print-modal">
            <div className={`px-6 py-2 flex items-center justify-between text-white font-black shrink-0 h-[48px] ${tempApt.status === 'annule' ? 'bg-rose-900' : 'bg-blue-600'}`}>
              <div className="flex items-center gap-4"><h2 className="text-xs tracking-widest flex items-center gap-2 uppercase"><Settings size={14} /> FICHE CHANTIER : {tempApt.clientName || 'NOUVEAU'} {tempApt.status === 'annule' && "(ANNULÉ)"}</h2></div>
              <div className="flex items-center gap-12">
                <div className="flex flex-col items-center leading-none"><span className="text-[7px] opacity-60 uppercase mb-0.5 tracking-tighter text-white">IMMOBILISATION</span><span className="text-[14px] font-black text-blue-50">{immobilizationDays} J</span></div>
                <div className="flex flex-col items-center leading-none"><span className="text-[7px] opacity-60 uppercase mb-0.5 tracking-tighter text-white">MO TOTAL</span><span className="text-[14px] font-black text-blue-50">{tempAptTotalHours.toFixed(1)} H</span></div>
                <div className="flex flex-col items-end leading-none"><span className="text-[7px] opacity-60 uppercase mb-0.5 tracking-tighter text-white">MONTANT TOTAL HT</span><span className="text-[16px] font-black text-emerald-300">{(tempApt.totalAmount || 0).toLocaleString('fr-FR')} €</span></div>
              </div>
              <button onClick={() => { setEditingAptId(null); setNewAptData(null); setTempApt(null); }} className="hover:rotate-90 transition-transform no-print"><X size={18}/></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleSaveAppointment(tempApt); }} className="flex flex-col h-full overflow-hidden bg-white">
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                {tempApt.status === 'annule' && (
                  <div className="bg-rose-50 border border-rose-200 p-3 rounded-lg flex items-center gap-3 text-rose-700 font-black text-[10px] mb-2 animate-pulse">
                    <AlertCircle size={20} /> DOSSIER ANNULÉ LE {new Date(tempApt.deletedAt || "").toLocaleDateString('fr-FR')} - VISIBLE UNIQUEMENT DANS L'HISTORIQUE ET ACTIVITÉ
                  </div>
                )}
                <div className="border border-slate-100 p-3 rounded-xl bg-slate-50/10 space-y-3">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-0.5"><label className="text-[7px] font-black text-blue-600 uppercase">Client</label><input name="clientName" value={tempApt.clientName} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-[10px] uppercase outline-none focus:ring-2 focus:ring-blue-500/20 text-black" required /></div>
                    <div className="space-y-0.5"><label className="text-[7px] font-black text-blue-600 uppercase">Immatriculation</label><input name="immat" value={tempApt.immat} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-[10px] uppercase outline-none focus:ring-2 focus:ring-blue-500/20 text-black" /></div>
                    <div className="space-y-0.5"><label className="text-[7px] font-black text-blue-600 uppercase">VEHICULE</label><input name="model" value={tempApt.model} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-[10px] uppercase outline-none focus:ring-2 focus:ring-blue-500/20 text-black" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-0.5"><label className="text-[7px] font-black text-blue-600 uppercase">Apporteur</label><input name="intermediary" value={tempApt.intermediary || ''} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-[10px] uppercase outline-none focus:ring-2 focus:ring-blue-500/20 text-black" /></div>
                    <div className="space-y-0.5"><label className="text-[7px] font-black text-blue-600 uppercase">Assurance</label><input name="insurance" value={tempApt.insurance} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-[10px] uppercase outline-none focus:ring-2 focus:ring-blue-500/20 text-black" /></div>
                    <div className="space-y-0.5"><label className="text-[7px] font-black text-blue-600 uppercase">Expert</label><input name="expert" value={tempApt.expert} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-[10px] uppercase outline-none focus:ring-2 focus:ring-blue-500/20 text-black" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-0.5"><label className="text-[7px] font-black text-blue-600 uppercase">Travaux à effectuer</label><textarea name="workType" value={tempApt.workType} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 font-bold text-[10px] resize-none h-14 uppercase outline-none text-black" required /></div>
                    <div className="space-y-0.5"><label className="text-[7px] font-black text-blue-600 uppercase">Infos complémentaires</label><textarea name="notes" value={tempApt.notes || ''} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 font-bold text-[10px] resize-none h-14 uppercase outline-none text-black" /></div>
                  </div>
                </div>
                <div className="grid grid-cols-12 gap-5">
                  <div className="col-span-6 space-y-3">
                    <div className="border border-emerald-200 p-3 rounded-xl bg-sky-50/10 space-y-4 h-full">
                      <div className="grid grid-cols-7 gap-2">
                        {['t1', 't2', 'tp', 'meca'].map(k => (
                          <div key={k} className="flex-1 space-y-0.5">
                            <label className="text-[7px] font-black text-emerald-600 uppercase">{k.toUpperCase()}</label>
                            <input type="number" step="0.5" name={k} value={(tempApt.laborTimes as any)[k]} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-1 py-1 font-black text-[10px] text-center outline-none text-black" />
                          </div>
                        ))}
                        <div className="space-y-0.5"><label className="text-[7px] font-black text-emerald-600 uppercase">PR</label><button type="button" onClick={() => { const current = tempApt.prStatus || 'none'; const next: PRStatus = current === 'none' ? 'a-commander' : current === 'a-commander' ? 'commande' : current === 'commande' ? 'recu' : 'none'; setTempApt({...tempApt, prStatus: next}); }} className={`w-full p-1 rounded-lg border shadow-sm flex items-center justify-center h-[25px] ${tempApt.prStatus === 'recu' ? 'bg-emerald-600 border-emerald-700 text-white' : tempApt.prStatus === 'commande' ? 'bg-amber-500 border-amber-600 text-white' : tempApt.prStatus === 'a-commander' ? 'bg-rose-600 border-rose-700 text-white animate-pr-blink' : 'bg-slate-50 border-slate-200 text-slate-400 opacity-40'}`}><Package size={14} /></button></div>
                        <div className="space-y-0.5"><label className="text-[7px] font-black text-emerald-600 uppercase">GEO</label><button type="button" onClick={() => setTempApt({...tempApt, hasGeo: !tempApt.hasGeo})} className={`w-full p-1 rounded-lg border shadow-sm flex items-center justify-center h-[25px] ${tempApt.hasGeo ? 'bg-amber-100 border-amber-500 text-amber-600' : 'bg-slate-50 border-slate-200 text-slate-400 opacity-40'}`}><Compass size={14} /></button></div>
                        <div className="space-y-0.5"><label className="text-[7px] font-black text-emerald-600 uppercase">CLIM</label><button type="button" onClick={() => setTempApt({...tempApt, hasClim: !tempApt.hasClim})} className={`w-full p-1 rounded-lg border shadow-sm flex items-center justify-center h-[25px] ${tempApt.hasClim ? 'bg-sky-100 border-sky-500 text-sky-600' : 'bg-slate-50 border-slate-200 text-slate-400 opacity-40'}`}><Snowflake size={14} /></button></div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-0.5"><label className="text-[7px] font-black text-emerald-600 uppercase">Date Entrée</label><input type="date" name="date" value={tempApt.date} onChange={handleModalChange} className="w-full h-8 bg-white border border-slate-200 rounded-lg px-2 py-1 font-bold text-[10px] outline-none text-black" /></div>
                        <div className="space-y-0.5"><label className="text-[7px] font-black text-emerald-600 uppercase">HEURE ENTREE</label><input type="time" name="appointmentHour" step="900" value={tempApt.appointmentHour} onChange={handleModalChange} className="w-full h-8 bg-white border border-slate-200 rounded-lg px-2 py-1 font-bold text-[10px] outline-none text-black" /></div>
                        <div className="space-y-0.5"><label className="text-[7px] font-black text-emerald-600 uppercase">DUREE IMMO (jours)</label><input type="number" step="0.5" name="estimatedDuration" value={tempApt.estimatedDuration || ''} onChange={handleModalChange} className="w-full h-8 bg-white border border-slate-200 rounded-lg px-2 py-1 font-black text-[10px] outline-none text-black" /></div>
                        <div className="space-y-0.5"><label className="text-[7px] font-black text-emerald-600 uppercase">DATE SORTIE</label><input type="date" name="exitDate" value={tempApt.exitDate || ''} onChange={handleModalChange} className="w-full h-8 bg-white border border-slate-200 rounded-lg px-2 py-1 font-bold text-[10px] outline-none text-black" /></div>
                      </div>
                    </div>
                  </div>
                  <div className="col-span-6 space-y-3">
                    <div className="border border-rose-200 p-3 rounded-xl bg-rose-50/10 grid grid-cols-2 gap-3 h-full">
                      <div className="space-y-0.5"><label className="text-[7px] font-black text-rose-600 uppercase">N° Facture</label><input name="invoiceNumber" value={tempApt.invoiceNumber || ''} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 font-bold text-[10px] outline-none text-black" placeholder="---" /></div>
                      <div className="space-y-0.5"><label className="text-[7px] font-black text-rose-600 uppercase">MONTANT TRAVAUX HT (€)</label><input type="number" name="totalAmount" value={tempApt.totalAmount || 0} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 font-black text-[10px] outline-none text-black" /></div>
                      <div className="space-y-0.5"><label className="text-[7px] font-black text-rose-600 uppercase">Comm. (€)</label><input type="number" name="commission" value={tempApt.commission || 0} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 font-black text-[10px] outline-none text-black" /></div>
                      <div className="space-y-0.5"><label className="text-[7px] font-black text-rose-600 uppercase">FRANCHISE (€)</label><input type="number" name="franchise" value={tempApt.franchise || 0} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 font-black text-[10px] outline-none text-black" /></div>
                      <div className="space-y-0.5"><label className="text-[7px] font-black text-rose-600 uppercase">Date Facture</label><input type="date" name="billingDate" value={tempApt.billingDate || ''} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 font-bold text-[10px] outline-none text-black" /></div>
                      <div className="space-y-0.5"><label className="text-[7px] font-black text-rose-600 uppercase">DATE RÈGLEMENT</label><input type="date" name="paymentDate" value={tempApt.paymentDate || ''} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 font-bold text-[10px] outline-none text-black" /></div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-12 gap-4 items-end border border-amber-200 p-3 rounded-xl bg-amber-50/10">
                  <div className="col-span-6 flex flex-col gap-1">
                    <label className="text-[7px] font-black text-amber-600 uppercase">SELECTION VR (NON MODIFIABLE ICI)</label>
                    <div className="flex items-center gap-2">
                      <select disabled name="vrImmat" value={tempApt.vrImmat || ''} className="flex-1 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1.5 font-black text-[10px] uppercase outline-none text-slate-500 cursor-not-allowed">
                        <option value="">-- PAS DE RESERVATION --</option>
                        {vrFleet.map(v => <option key={v.id} value={v.immatriculation}>{v.immatriculation} - {v.modele}</option>)}
                      </select>
                      {tempApt.hasVr && (
                        <div onClick={() => { 
                            const booking = vrBookings.find(b => b.appointmentId === tempApt.id && b.status !== 'annule');
                            if (booking) setEditingVRBookingId(booking.id);
                            else alert("Détails de réservation introuvables ou annulés.");
                        }} className="bg-amber-400 text-slate-900 px-3 py-1.5 rounded-lg font-black text-[9px] shadow-sm flex items-center gap-2 shrink-0 cursor-pointer hover:bg-amber-300 transition-colors"><Car size={12} /> VR ACTIF</div>
                      )}
                    </div>
                  </div>
                  <div className="col-span-3 space-y-0.5"><label className="text-[7px] font-black text-amber-600 uppercase">N° Facture VR</label><input name="vrInvoiceNumber" value={tempApt.vrInvoiceNumber || ''} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-[10px] outline-none text-black" placeholder="FA-VR-..." /></div>
                  <div className="col-span-3 space-y-0.5"><label className="text-[7px] font-black text-amber-600 uppercase">Montant VR HT (€)</label><input type="number" name="vrInvoiceAmount" value={tempApt.vrInvoiceAmount || 0} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-black text-[10px] outline-none text-black" /></div>
                </div>
              </div>
              <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between no-print shrink-0">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">STATUT ACTUEL</span>
                    <select name="status" value={tempApt.status} onChange={handleModalChange} className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-blue-600 font-black text-[10px] uppercase focus:ring-2 focus:ring-blue-500/20 cursor-pointer shadow-sm min-w-[140px]">
                      {(Object.keys(STATUS_CONFIG) as AppointmentStatus[]).map(s => (<option key={s} value={s}>{STATUS_CONFIG[s].label.toUpperCase()}</option>))}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => handleDuplicateAppointment(tempApt)} title="Dupliquer ce chantier" className="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-200 text-blue-600 bg-white hover:bg-blue-50 transition-all active:scale-95 font-black text-[9px] uppercase shadow-sm">
                    <Copy size={14}/> DUPLIQUER
                  </button>
                  <div className="w-px h-6 bg-slate-200 mx-1" />
                  <button type="button" onClick={() => window.print()} title="Imprimer la fiche" className="p-2 rounded-lg border border-slate-200 text-slate-500 bg-white hover:bg-slate-50 transition-all active:scale-95 shadow-sm">
                    <Printer size={18}/>
                  </button>
                  <button type="button" onClick={() => handleDeleteAppointment(tempApt.id)} title="Supprimer ou Annuler" className="p-2 rounded-lg border border-rose-200 text-rose-500 bg-white hover:bg-rose-50 transition-all active:scale-95 shadow-sm">
                    <Trash2 size={18}/>
                  </button>
                  <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all active:scale-95 border border-blue-400/10">
                    <Save size={16}/> ENREGISTRER LE DOSSIER
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {tempVRBooking && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col uppercase text-slate-900 border border-white/20">
            {(() => {
              const linkedVr = vrFleet.find(v => v.id === tempVRBooking.vrId);
              return (
                <>
                  <div className={`px-6 py-2 flex items-center justify-between text-white font-black shrink-0 h-[48px] ${tempVRBooking.status === 'annule' ? 'bg-rose-900' : 'bg-blue-600'}`}>
                    <h2 className="text-xs tracking-widest flex items-center gap-2 uppercase"><Car size={14} /> RESERVATION {linkedVr?.immatriculation} - {linkedVr?.modele} | {tempVRBooking.clientName} {tempVRBooking.status === 'annule' && "(ANNULÉE)"}</h2>
                    <button onClick={() => { setEditingVRBookingId(null); setTempVRBooking(null); setShowVrSelector(false); }} className="hover:rotate-90 transition-transform"><X size={18}/></button>
                  </div>
                  <div className="p-6 space-y-6 overflow-y-auto max-h-[85vh]">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between mb-4">
                       <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600"><Car size={16}/></div>
                          <div>
                             <div className="text-[9px] font-black text-slate-400 uppercase">VÉHICULE ACTUEL</div>
                             <div className="text-[11px] font-black text-slate-900">{linkedVr?.immatriculation} - {linkedVr?.marque} {linkedVr?.modele}</div>
                          </div>
                       </div>
                       {!showVrSelector && tempVRBooking.status !== 'annule' && (
                          <button onClick={() => setShowVrSelector(true)} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase shadow-sm transition-all">CHANGER DE VR</button>
                       )}
                    </div>

                    <div className="grid grid-cols-4 gap-4 items-end">
                      <div className="space-y-1"><label className="text-[7px] font-black text-blue-600 uppercase">Date Départ</label><input type="date" name="startDate" value={tempVRBooking.startDate} onChange={(e) => setTempVRBooking({...tempVRBooking, startDate: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-[11px] uppercase outline-none text-black h-9" /></div>
                      <div className="space-y-1"><label className="text-[7px] font-black text-blue-600 uppercase">Heure Départ</label><input type="time" name="startHour" value={tempVRBooking.startHour} onChange={(e) => setTempVRBooking({...tempVRBooking, startHour: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-[11px] uppercase outline-none text-black h-9" /></div>
                      <div className="space-y-1"><label className="text-[7px] font-black text-blue-600 uppercase">Kilométrage Départ</label><input type="number" name="startMileage" value={tempVRBooking.startMileage || 0} onChange={(e) => setTempVRBooking({...tempVRBooking, startMileage: parseInt(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-[11px] uppercase outline-none text-black h-9" /></div>
                      <div className="space-y-1"><label className="text-[7px] font-black text-blue-600 uppercase">Carburant Départ</label><select name="startFuel" value={tempVRBooking.startFuel || 'Full'} onChange={(e) => setTempVRBooking({...tempVRBooking, startFuel: e.target.value, endFuel: tempVRBooking.endFuel === '' || tempVRBooking.endFuel === undefined ? e.target.value : tempVRBooking.endFuel})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-[11px] outline-none text-black h-9">{FUEL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select></div>
                    </div>
                    <div className="grid grid-cols-4 gap-4 items-end">
                      <div className="space-y-1"><label className="text-[7px] font-black text-rose-600 uppercase">Date Retour</label><input type="date" name="endDate" value={tempVRBooking.endDate} onChange={(e) => setTempVRBooking({...tempVRBooking, endDate: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-[11px] uppercase outline-none text-black h-9" /></div>
                      <div className="space-y-1"><label className="text-[7px] font-black text-rose-600 uppercase">Heure Retour</label><input type="time" name="endHour" value={tempVRBooking.endHour} onChange={(e) => setTempVRBooking({...tempVRBooking, endHour: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-[11px] uppercase outline-none text-black h-9" /></div>
                      <div className="space-y-1"><label className="text-[7px] font-black text-rose-600 uppercase">Kilométrage Retour</label><input type="number" name="endMileage" value={tempVRBooking.endMileage ?? ''} onChange={(e) => setTempVRBooking({...tempVRBooking, endMileage: e.target.value === '' ? undefined : parseInt(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-[11px] uppercase outline-none text-black h-9" placeholder={`${tempVRBooking.startMileage ?? 'KM DEPART'}`} /></div>
                      <div className="space-y-1"><label className="text-[7px] font-black text-rose-600 uppercase">Carburant Retour</label><select name="endFuel" value={tempVRBooking.endFuel || ''} onChange={(e) => setTempVRBooking({...tempVRBooking, endFuel: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-[11px] outline-none text-black h-9"><option value="">-- {tempVRBooking.startFuel || 'Full'} --</option>{FUEL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select></div>
                    </div>
                    <div className="space-y-1 pt-2"><label className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Observations permanent</label><textarea name="observations" value={tempVRBooking.observations || ''} onChange={(e) => setTempVRBooking({...tempVRBooking, observations: e.target.value.toUpperCase()})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-[11px] uppercase outline-none text-black min-h-[120px] resize-none" placeholder="REMARQUES SUR L'ÉTAT DU VÉHICULE..." /></div>
                    <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-100">
                      <button type="button" onClick={() => handleDeleteVRBooking(tempVRBooking.id)} className="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase border border-rose-500 text-rose-500 hover:bg-rose-500 hover:text-white flex items-center gap-2"><Trash2 size={16}/> {tempVRBooking.status === 'annule' ? 'SUPPRIMER DÉF.' : 'ANNULER RÉSER.'}</button>
                      <button type="button" onClick={() => handleSaveVRBooking(tempVRBooking)} className="px-10 py-2.5 rounded-xl text-[10px] font-black uppercase bg-blue-600 text-white hover:bg-blue-50 shadow-xl flex items-center gap-2 transition-all active:scale-95"><Save size={16}/> ENREGISTRER</button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {editingNoteDate && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col uppercase text-slate-900">
            <div className="bg-yellow-500 px-6 py-2.5 flex items-center justify-between text-white font-black shrink-0 h-[48px]">
              <h2 className="text-xs tracking-widest flex items-center gap-2 uppercase"><StickyNote size={16} /> NOTE DU {new Date(editingNoteDate).toLocaleDateString('fr-FR', {day: '2-digit', month: 'long'}).toUpperCase()}</h2>
              <button onClick={() => setEditingNoteDate(null)} className="hover:rotate-90 transition-transform"><X size={18}/></button>
            </div>
            <div className="p-5 space-y-4">
              <textarea autoFocus value={tempNoteText} onChange={(e) => setTempNoteText(e.target.value.toUpperCase())} className="w-full bg-yellow-50/30 border border-yellow-200 rounded-lg px-3 py-2 font-bold text-[11px] h-32 uppercase outline-none focus:ring-2 focus:ring-yellow-500/20 text-black" />
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => { 
                    if (!window.confirm("Supprimer cette note ?")) return;
                    const newNotes = { ...dailyNotes }; 
                    delete newNotes[editingNoteDate]; 
                    setDailyNotes(newNotes); 
                    setEditingNoteDate(null); 
                    handleSyncToSheets(); 
                }} className="p-2.5 rounded-lg border border-rose-500 text-rose-500 hover:bg-rose-500 hover:text-white transition-all active:scale-95 shadow-sm">
                    <Trash2 size={20}/>
                </button>
                <button type="button" onClick={() => { 
                    setDailyNotes(prev => ({ ...prev, [editingNoteDate]: tempNoteText.toUpperCase() })); 
                    setEditingNoteDate(null); 
                    handleSyncToSheets(); 
                }} className="flex-1 bg-yellow-500 text-white py-2.5 rounded-lg font-black text-[10px] uppercase tracking-[0.1em] flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 border border-yellow-600/10 hover:bg-yellow-600">
                    <Save size={18} /> ENREGISTRER LA NOTE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isVRManagerOpen && (
        <div className="fixed inset-0 z-[800] flex items-center justify-center bg-slate-900/95 backdrop-blur-md p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] overflow-hidden flex flex-col uppercase text-slate-900 border border-white/20">
            <div className="bg-[#1e293b] px-6 py-3 flex items-center justify-between text-white font-black shrink-0 h-[48px]"><h2 className="text-xs tracking-[0.2em] flex items-center gap-3"><Car size={18} className="text-blue-400" /> ADMINISTRATION DE LA FLOTTE VR</h2><button onClick={() => setIsVRManagerOpen(false)} className="hover:rotate-90 transition-transform p-1.5 bg-slate-800 rounded-full"><X size={16}/></button></div>
            <div className="flex-1 overflow-hidden flex">
              <div className="w-[300px] border-r border-slate-200 bg-slate-50 overflow-y-auto p-3 space-y-2 flex flex-col shrink-0">
                <button onClick={handleAddNewVR} className="w-full flex items-center justify-center gap-2 bg-[#2563eb] text-white rounded-xl py-2.5 font-black text-[9px] uppercase tracking-widest shadow-lg active:scale-95"><Plus size={16} /> AJOUTER UN VÉHICULE</button>
                <div className="space-y-2 flex-1">{vrFleet.map(vr => { const todayStr = new Date().toISOString().split('T')[0]; const currentBooking = vrBookings.find(b => b.vrId === vr.id && b.status !== 'annule' && b.startDate <= todayStr && b.endDate >= todayStr && (!b.endMileage || b.endMileage === 0)); return (<div key={vr.id} className={`p-3 rounded-xl border-2 transition-all cursor-pointer flex flex-col gap-2 relative ${!vr.isVisible ? 'bg-slate-200/50 grayscale' : 'bg-white shadow-sm hover:shadow-md'} ${editingVrDataId === vr.id ? 'border-[#2563eb] ring-1 ring-[#2563eb]/20' : 'border-slate-100'}`} onClick={() => setEditingVrDataId(vr.id)}><div className="flex items-center justify-between relative z-10"><div className="min-w-0"><div className="text-[11px] font-black text-slate-900 truncate uppercase">{vr.immatriculation}</div><div className="text-[7.5px] font-bold text-slate-400 truncate uppercase">{vr.marque} {vr.modele}</div></div><div className="flex items-center gap-1"><button onClick={(e) => { e.stopPropagation(); handleUpdateVrFleetMember(vr.id, { isVisible: !vr.isVisible }); }} className={`p-1 rounded-lg ${vr.isVisible ? 'text-emerald-500 bg-emerald-50' : 'text-slate-400 bg-slate-100'}`}>{vr.isVisible ? <Eye size={12}/> : <EyeOff size={12}/>}</button><button onClick={(e) => { e.stopPropagation(); handleDeleteVR(vr.id); }} className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={12}/></button></div></div><div className="flex flex-col gap-1"><div className={`text-[7.5px] font-black px-2 py-0.5 rounded-md inline-flex items-center gap-1.5 uppercase ${vr.isVisible ? (currentBooking ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600') : 'bg-slate-100 text-slate-500'}`}><div className={`w-1.5 h-1.5 rounded-full ${vr.isVisible ? (currentBooking ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse') : 'bg-slate-400'}`} />{vr.isVisible ? (currentBooking ? 'En Location' : 'Disponible') : 'Inactif'}</div>{currentBooking && (<div className="bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100 flex flex-col gap-0.5"><div className="flex items-center gap-1.5"><UserCircle size={10}/><span className="text-[8px] font-black uppercase truncate">{currentBooking.clientName}</span></div><div className="flex items-center gap-1.5"><Clock size={10}/><span className="text-[7.5px] font-bold">RETOUR : {new Date(currentBooking.endDate).toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit'})}</span></div></div>)}</div></div>); })}</div>
              </div>
              <div className="flex-1 bg-white overflow-y-auto">
                {editingVrData ? (
                  <div className="p-5 max-w-4xl mx-auto space-y-5 relative">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-[#2563eb] shadow-inner"><Car size={24} /></div><div><h3 className="text-xl font-black text-slate-900 tracking-tight leading-none mb-1">{editingVrData.immatriculation}</h3><p className="text-slate-400 text-[8px] font-black uppercase">Édition des caractéristiques véhicule</p></div></div><button onClick={() => setShowingHistoryForVrId(editingVrData.id)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all font-black text-[9px] uppercase"><History size={14}/> Historique</button></div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <div className="space-y-1"><label className="text-[8px] font-black text-slate-500 uppercase">Marque</label><input value={editingVrData.marque} onChange={(e) => handleUpdateVrFleetMember(editingVrData.id, { marque: e.target.value.toUpperCase() })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-black text-[10px] text-black h-9" /></div>
                      <div className="space-y-1"><label className="text-[8px] font-black text-slate-500 uppercase">Modèle</label><input value={editingVrData.modele} onChange={(e) => handleUpdateVrFleetMember(editingVrData.id, { modele: e.target.value.toUpperCase() })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-black text-[10px] text-black h-9" /></div>
                      <div className="space-y-1"><label className="text-[8px] font-black text-slate-500 uppercase">Immatriculation</label><input value={editingVrData.immatriculation} onChange={(e) => handleUpdateVrFleetMember(editingVrData.id, { immatriculation: e.target.value.toUpperCase() })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-black text-[10px] text-black h-9" /></div>
                      <div className="space-y-1"><label className="text-[8px] font-black text-slate-500 uppercase">Numéro VIN</label><input value={editingVrData.vin || ''} onChange={(e) => handleUpdateVrFleetMember(editingVrData.id, { vin: e.target.value.toUpperCase() })} placeholder="VF3..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-black text-[10px] text-black h-9" /></div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1"><label className="text-[8px] font-black text-slate-500 uppercase">Énergie</label><select value={editingVrData.typeCarburant} onChange={(e) => handleUpdateVrFleetMember(editingVrData.id, { typeCarburant: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-black text-[10px] text-black h-9"><option value="Essence">Essence</option><option value="Diesel">Diesel</option><option value="Hybride">Hybride</option><option value="Électrique">Électrique</option></select></div>
                      <div className="space-y-1"><label className="text-[8px] font-black text-slate-500 uppercase">Niveau Carburant</label><select value={editingVrData.niveauCarburant} onChange={(e) => handleUpdateVrFleetMember(editingVrData.id, { niveauCarburant: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-black text-[10px] text-black h-9">{FUEL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select></div>
                      <div className="space-y-1"><label className="text-[8px] font-black text-slate-500 uppercase">Kilométrage Actuel</label><input type="number" value={editingVrData.kilometrage} onChange={(e) => handleUpdateVrFleetMember(editingVrData.id, { kilometrage: parseInt(e.target.value) || 0 })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-black text-[10px] text-black h-9" /></div>
                    </div>
                    <div className="space-y-1"><label className="text-[8px] font-black text-slate-500 uppercase">Observations permanent</label><textarea value={editingVrData.observations || ''} onChange={(e) => handleUpdateVrFleetMember(editingVrData.id, { observations: e.target.value.toUpperCase() })} placeholder="ÉTAT, ACCESSOIRES, ÉRAFLURES..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-black text-[11px] text-black h-32 resize-none" /></div>
                    <div className="pt-2"><div className="flex items-center gap-3 mb-3"><h4 className="text-[9px] font-black text-[#2563eb] uppercase">Section Contrat & Propriété</h4><div className="flex-1 h-px bg-slate-100" /></div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <div className="space-y-1"><label className="text-[8px] font-black text-slate-500 uppercase">Propriétaire</label><input value={editingVrData.proprietaire || ''} onChange={(e) => handleUpdateVrFleetMember(editingVrData.id, { proprietaire: e.target.value.toUpperCase() })} placeholder="GARAGE PRO / SOCIÉTÉ X" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-black text-[10px] text-black h-9" /></div>
                        <div className="space-y-1"><label className="text-[8px] font-black text-slate-500 uppercase">Numéro de contrat</label><input value={editingVrData.numContrat || ''} onChange={(e) => handleUpdateVrFleetMember(editingVrData.id, { numContrat: e.target.value.toUpperCase() })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-black text-[10px] text-black h-9" /></div>
                        <div className="space-y-1"><label className="text-[8px] font-black text-slate-500 uppercase">Date échéance contrat</label><input type="date" value={editingVrData.dateEcheanceContrat || ''} onChange={(e) => handleUpdateVrFleetMember(editingVrData.id, { dateEcheanceContrat: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-black text-[10px] text-black h-9" /></div>
                        <div className="space-y-1"><label className="text-[8px] font-black text-slate-500 uppercase">Forfait KM Max</label><input type="number" value={editingVrData.kmMax || ''} onChange={(e) => handleUpdateVrFleetMember(editingVrData.id, { kmMax: parseInt(e.target.value) || 0 })} placeholder="Ex: 60000" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-black text-[10px] text-black h-9" /></div>
                      </div>
                    </div>
                    <div className="flex justify-end pt-4 border-t border-slate-50"><button onClick={() => { setIsVRManagerOpen(false); handleSyncToSheets(); }} className="px-8 py-2.5 bg-[#0f172a] text-white rounded-xl font-black text-[10px] uppercase flex items-center gap-3 shadow-xl active:scale-95"><Save size={18} /> Valider & Synchroniser</button></div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center space-y-3 opacity-30 select-none"><div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400"><Car size={40} /></div><p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Sélectionnez un véhicule à administrer</p></div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showingHistoryForVrId && (
        <div className="fixed inset-0 z-[900] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col uppercase text-slate-900">
            <div className="bg-slate-800 px-6 py-3 flex items-center justify-between text-white font-black shrink-0"><h2 className="text-xs tracking-[0.2em] flex items-center gap-3"><History size={16} /> Historique des mouvements : {vrFleet.find(v => v.id === showingHistoryForVrId)?.immatriculation}</h2><button onClick={() => setShowingHistoryForVrId(null)} className="hover:rotate-90 transition-transform p-1 bg-white/10 rounded-full"><X size={16}/></button></div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
               {vrBookings.filter(b => b.vrId === showingHistoryForVrId).sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()).map(booking => (
                 <div key={booking.id} className={`bg-white border rounded-xl p-4 shadow-sm grid grid-cols-12 gap-4 ${booking.status === 'annule' ? 'opacity-50 grayscale bg-rose-50' : ''}`}>
                    <div className="col-span-3"><span className="text-[7px] font-black text-slate-400 block mb-1">CLIENT</span><span className="text-[11px] font-black text-slate-900">{booking.clientName} {booking.status === 'annule' && "(ANNULÉ)"}</span></div>
                    <div className="col-span-2"><span className="text-[7px] font-black text-slate-400 block mb-1">SORTIE</span><span className="text-[10px] font-bold text-blue-600">{new Date(booking.startDate).toLocaleDateString('fr-FR')} - {booking.startHour}</span><div className="text-[8px] font-black text-slate-500 mt-1">{booking.startMileage} KM | {booking.startFuel}</div></div>
                    <div className="col-span-2"><span className="text-[7px] font-black text-slate-400 block mb-1">RETOUR</span><span className="text-[10px] font-bold text-emerald-600">{new Date(booking.endDate).toLocaleDateString('fr-FR')} - {booking.endHour}</span><div className="text-[8px] font-black text-slate-500 mt-1">{booking.endMileage || '---'} KM | {booking.endFuel || '---'}</div></div>
                    <div className="col-span-5 border-l border-slate-100 pl-4"><span className="text-[7px] font-black text-slate-400 block mb-1">OBSERVATIONS</span><p className="text-[9px] font-bold text-slate-600 italic line-clamp-3">{booking.observations || "AUCUNE OBSERVATION"}</p></div>
                 </div>
               ))}
               {vrBookings.filter(b => b.vrId === showingHistoryForVrId).length === 0 && (<div className="h-64 flex items-center justify-center text-slate-400 font-black text-[10px] tracking-[0.2em]">AUCUN MOUVEMENT ENREGISTRÉ</div>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
