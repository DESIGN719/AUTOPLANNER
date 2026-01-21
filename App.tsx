
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Calendar, Settings, X, Save, Plus, Inbox, Car, BarChart3, Clock, Search, StickyNote, Trash2, Eye, EyeOff, History, Cloud, Snowflake, Compass, Package, Printer, UserCircle, Copy, TrendingUp, Euro, FileText, Target, AlertCircle, CheckCircle2, Info, ChevronLeft, ChevronRight, Wrench, CloudOff, Ban, Lock, Key, FileSignature } from 'lucide-react';
import { DayData, Appointment, VRBooking, VRData, AppointmentStatus, PRStatus, DayOverride, VRBookingStatus } from './types';
import { FRENCH_HOLIDAYS_2026, STATUS_CONFIG } from './constants';
import PlanningDayRow from './components/PlanningDayRow';
import AppointmentCard from './components/AppointmentCard';
import WeeklySummaryBanner from './components/WeeklySummaryBanner';
import { generateVRContract } from './pdfGenerator';

const STORAGE_KEYS = {
  APPOINTMENTS: 'autoplanner_appointments',
  // STOCK key removed, integrated into APPOINTMENTS
  VR_BOOKINGS: 'autoplanner_vr',
  VR_FLEET: 'autoplanner_vr_fleet',
  OVERRIDES: 'autoplanner_manual_overrides',
  DAILY_NOTES: 'autoplanner_daily_notes',
  APP_PASSWORD: 'autoplanner_password'
};

// URL fournie par l'utilisateur (Nouveau déploiement v4.1)
const DEFAULT_SHEETS_URL = 'https://script.google.com/macros/s/AKfycby6oYYBdW7pjZYaV1jg7WlroUT5aYnvsglW1qkTI8AYoKztLUiArPRudnoupQKE6SWuqA/exec';

const FUEL_OPTIONS = ['Full', '3/4', '1/2', '1/4', 'Réserve'];

const getMonday = (d: Date) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
};

const toLocalDateStr = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Fonctions SAFE pour manipulation de dates (évite les problèmes de fuseau horaire)
const parseDateSafe = (dateStr: string) => {
    if (!dateStr) return new Date();
    const [y, m, d] = dateStr.split('-').map(Number);
    // On force midi pour éviter les décalages DST
    return new Date(y, m - 1, d, 12, 0, 0);
};

const addDaysSafe = (dateStr: string, days: number): string => {
    const date = parseDateSafe(dateStr);
    date.setDate(date.getDate() + days);
    return toLocalDateStr(date);
};

const getDiffInDays = (d1Str: string, d2Str: string): number => {
    const d1 = parseDateSafe(d1Str);
    const d2 = parseDateSafe(d2Str);
    const diffTime = d2.getTime() - d1.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
};

const getISOWeek = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

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

const normalizeAppointmentStatus = (status: string): AppointmentStatus => {
  const map: Record<string, AppointmentStatus> = {
    'stock': 'NON PLANIFIE',
    'a-venir': 'PLANIFIE',
    'en-cours': 'EN COURS',
    'livre': 'LIVRE',
    'livre-non-termine': 'LIVRE NON TERMINE',
    'facture': 'FACTURE',
    'paye': 'PAYE',
    'annule': 'ANNULE'
  };
  return (map[status.toLowerCase()] || status) as AppointmentStatus;
};

// Fonction de calcul des statuts VR (RESERVE, OCCUPE, RETOURNE, ANNULE)
const normalizeVRStatus = (status: string, booking: any): VRBookingStatus => {
  if (status === 'annule' || status === 'ANNULE') return 'ANNULE';
  if (booking.endMileage && booking.endMileage > 0) return 'RETOURNE';
  
  const today = new Date().toISOString().split('T')[0];
  if (booking.startDate > today) return 'RESERVE';
  
  return 'OCCUPE';
};

interface VRBookingFormData extends VRBooking {
  vrNote?: string;
}

const App: React.FC = () => {
  // --- AUTHENTIFICATION ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState(false);
  // Chargement du mot de passe stocké ou par défaut '1234'
  const [storedPassword, setStoredPassword] = useState(() => getSafeStorage(STORAGE_KEYS.APP_PASSWORD, '1234'));
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState('');

  // --- ETATS EXISTANTS ---
  const [viewStartDate, setViewStartDate] = useState(() => {
    return toLocalDateStr(getMonday(new Date()));
  });
  
  const [currentView, setCurrentView] = useState<'calendar' | 'workshop'>('calendar');
  const [editingAptId, setEditingAptId] = useState<string | null>(null);
  const [newAptData, setNewAptData] = useState<Appointment | null>(null);
  const [editingVRBookingId, setEditingVRBookingId] = useState<string | null>(null);
  const [editingNoteDate, setEditingNoteDate] = useState<string | null>(null);
  const [isStockOpen, setIsStockOpen] = useState(true);
  const [isVRManagerOpen, setIsVRManagerOpen] = useState(false);
  
  // Gestion édition VR (avec état temporaire)
  const [editingVrDataId, setEditingVrDataId] = useState<string | null>(null);
  const [tempVrData, setTempVrData] = useState<VRData | null>(null);
  
  const [showingHistoryForVrId, setShowingHistoryForVrId] = useState<string | null>(null);
  
  // États de synchronisation
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  
  // Nouveau système de délai de sauvegarde (Debounce)
  // pendingSaveTimestamp contient l'heure de la dernière modification
  const [pendingSaveTimestamp, setPendingSaveTimestamp] = useState<number | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [workshopSearch, setWorkshopSearch] = useState('');
  const [activeStatusFilters, setActiveStatusFilters] = useState<AppointmentStatus[]>(['NON PLANIFIE', 'PLANIFIE', 'EN COURS', 'LIVRE', 'LIVRE NON TERMINE', 'FACTURE', 'PAYE']);
  
  const [tempApt, setTempApt] = useState<Appointment | null>(null);
  const [tempVRBooking, setTempVRBooking] = useState<VRBookingFormData | null>(null);
  const [tempNoteText, setTempNoteText] = useState('');
  
  const [sheetsUrl] = useState(DEFAULT_SHEETS_URL);
  
  const mainContentRef = useRef<HTMLDivElement>(null);

  const [appointments, setAppointments] = useState<Appointment[]>(() => getSafeStorage(STORAGE_KEYS.APPOINTMENTS, []));
  
  // VR Fleet Initialisation vide
  const [vrFleet, setVrFleet] = useState<VRData[]>(() => getSafeStorage(STORAGE_KEYS.VR_FLEET, []));
  
  const [vrBookings, setVrBookings] = useState<VRBooking[]>(() => getSafeStorage(STORAGE_KEYS.VR_BOOKINGS, []));
  
  const [manualOverrides, setManualOverrides] = useState<DayOverride[]>(() => {
    const stored = getSafeStorage(STORAGE_KEYS.OVERRIDES, []);
    if (Array.isArray(stored) && stored.length > 0 && typeof stored[0] === 'string') {
      return stored.map((d: string) => ({ date: d, reason: 'JOUR BLOQUE' }));
    }
    return stored;
  });
  
  const [dailyNotes, setDailyNotes] = useState<Record<string, string>>(() => getSafeStorage(STORAGE_KEYS.DAILY_NOTES, {}));

  // Fonctions utilitaires de date
  const isDateBlocked = useCallback((dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const isHoliday = !!FRENCH_HOLIDAYS_2026[dateStr];
    const isDefaultBlocked = isWeekend || isHoliday;
    const override = manualOverrides.find(o => o.date === dateStr);
    if (override) return !isDefaultBlocked; 
    return isDefaultBlocked;
  }, [manualOverrides]);

  const addBusinessDays = useCallback((startDateStr: string, days: number): string => {
    if (!startDateStr || isNaN(days) || days < 0) return startDateStr;
    const [y, m, d] = startDateStr.split('-').map(Number);
    let date = new Date(y, m - 1, d);
    let added = 0;
    while (added < Math.floor(days)) {
      date.setDate(date.getDate() + 1);
      const dateStr = toLocalDateStr(date);
      if (!isDateBlocked(dateStr)) added++;
    }
    while (isDateBlocked(toLocalDateStr(date))) {
      date.setDate(date.getDate() + 1);
    }
    return toLocalDateStr(date);
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
    const [sy, sm, sd] = startDateStr.split('-').map(Number);
    let current = new Date(sy, sm - 1, sd);
    
    if (toLocalDateStr(current) > endDateStr) return 0;

    while (toLocalDateStr(current) <= endDateStr) {
      const currentStr = toLocalDateStr(current);
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

  // Persistance LocalStorage
  useEffect(() => {
    safeSetStorage(STORAGE_KEYS.APPOINTMENTS, appointments);
    safeSetStorage(STORAGE_KEYS.VR_BOOKINGS, vrBookings);
    safeSetStorage(STORAGE_KEYS.VR_FLEET, vrFleet);
    safeSetStorage(STORAGE_KEYS.OVERRIDES, manualOverrides);
    safeSetStorage(STORAGE_KEYS.DAILY_NOTES, dailyNotes);
  }, [appointments, vrBookings, vrFleet, manualOverrides, dailyNotes, sheetsUrl]);

  // Chargement depuis Sheets
  const handleLoadFromSheets = useCallback(async (silent = false) => {
    if (!sheetsUrl) return; 
    if (!silent) {
        setIsSyncing(true);
    }
    try {
      const response = await fetch(`${sheetsUrl}?action=read`);
      if (response.ok) {
        const data = await response.json();
        
        if (data.appointments) {
            const normAppointments = data.appointments.map((a: any) => ({
                ...a,
                status: normalizeAppointmentStatus(a.status || 'PLANIFIE')
            }));
            setAppointments(normAppointments);
        }
        
        if (data.vrBookings) {
            const normVR = data.vrBookings.map((b: any) => ({
                ...b,
                status: normalizeVRStatus(b.status, b)
            }));
            setVrBookings(normVR);
        }
        if (data.vrFleet) setVrFleet(data.vrFleet);
        if (data.manualOverrides) {
           const overrides: DayOverride[] = data.manualOverrides.map((item: any) => {
              if (typeof item === 'string') return { date: item, reason: 'JOUR BLOQUE' };
              return item;
           });
           setManualOverrides(overrides);
        }
        if (data.dailyNotes) setDailyNotes(data.dailyNotes);
        setLastSaved(new Date());
        setSyncError(false);
      } else { if (!silent) setSyncError(true); }
    } catch (err) { if (!silent) setSyncError(true); } 
    finally { 
        if (!silent) {
            setIsSyncing(false); 
        }
    }
  }, [sheetsUrl]);

  // Synchronisation vers Sheets
  const handleSyncToSheets = useCallback(async () => {
    if (!sheetsUrl) return;
    setIsSyncing(true);
    try {
      // On envoie tout dans "appointments", le backend trie ou met tout dans CHANTIER
      const payload = { 
        action: 'write', 
        appointments, 
        // stockAppointments: removed
        vrBookings, 
        vrFleet, 
        manualOverrides, 
        dailyNotes, 
        timestamp: new Date().toISOString() 
      };
      
      await fetch(sheetsUrl, { 
        method: 'POST', 
        mode: 'no-cors', 
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload) 
      });

      // On met juste à jour le timestamp de sauvegarde locale
      // SANS recharger les données pour ne pas casser l'UI
      setLastSaved(new Date());
      setSyncError(false);
    } catch (err) { 
      console.error("Erreur de synchronisation", err);
      setSyncError(true); 
    } finally { 
      setIsSyncing(false); 
    }
  }, [appointments, vrBookings, vrFleet, manualOverrides, dailyNotes, sheetsUrl]);

  // Trigger automatique de la synchro avec Debounce
  const triggerAutoSave = useCallback(() => {
    // On met à jour le timestamp de la dernière modif
    setPendingSaveTimestamp(Date.now());
  }, []);

  // Effect qui gère le délai de sauvegarde
  useEffect(() => {
    if (pendingSaveTimestamp !== null) {
      // Si un timer existe déjà (action précédente), on l'annule
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // On lance un nouveau timer de 5 secondes
      saveTimeoutRef.current = setTimeout(() => {
        handleSyncToSheets();
        setPendingSaveTimestamp(null); // Reset une fois la synchro lancée
        saveTimeoutRef.current = null;
      }, 5000); // 5000ms = 5 secondes

      // Cleanup function : si le composant est démonté ou si pendingSaveTimestamp change avant la fin
      return () => {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
      };
    }
  }, [pendingSaveTimestamp, handleSyncToSheets]);

  // 1. Gestion Authentification & Chargement Initial
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === storedPassword) { // Comparaison avec le mot de passe stocké
        setIsAuthenticated(true);
        setLoginError(false);
    } else {
        setLoginError(true);
    }
  };

  const handleSavePassword = () => {
    if (newPasswordInput.length < 4) {
        alert("Le mot de passe doit contenir au moins 4 caractères.");
        return;
    }
    setStoredPassword(newPasswordInput);
    safeSetStorage(STORAGE_KEYS.APP_PASSWORD, newPasswordInput);
    setIsPasswordModalOpen(false);
    setNewPasswordInput('');
    alert("Mot de passe modifié avec succès. Il sera requis à la prochaine connexion.");
  };

  // Chargement des données UNIQUEMENT après connexion
  useEffect(() => {
    if (isAuthenticated) {
        handleLoadFromSheets(false);
    }
  }, [isAuthenticated, handleLoadFromSheets]); 

  // 2. Auto-refresh périodique (toutes les 2 minutes), SEULEMENT SI CONNECTÉ
  useEffect(() => {
    const interval = setInterval(() => {
      // On ne recharge PAS si :
      // - Une modif est en attente de sauvegarde (pendingSaveTimestamp !== null)
      // - Une synchronisation est déjà en cours (isSyncing)
      // - L'utilisateur n'est pas authentifié
      if (pendingSaveTimestamp === null && !isSyncing && isAuthenticated) {
        handleLoadFromSheets(true); // Silent refresh
      }
    }, 120000); 
    return () => clearInterval(interval);
  }, [handleLoadFromSheets, pendingSaveTimestamp, isSyncing, isAuthenticated]);

  // --- ACTIONS ---

  const handleDeleteAppointment = (id: string) => {
    if (window.confirm("Confirmer l'annulation ?")) {
      const markAnnule = (list: Appointment[]) => list.map(a => a.id === id ? { ...a, status: 'ANNULE' as AppointmentStatus, deletedAt: new Date().toISOString() } : a);
      setAppointments(prev => markAnnule(prev));
      
      // On annule aussi la réservation VR associée (sans toucher à l'historique global)
      setVrBookings(prev => prev.map(b => b.appointmentId === id ? { ...b, status: 'ANNULE' } : b));
      
      setEditingAptId(null);
      setNewAptData(null);
      setTempApt(null);
      triggerAutoSave();
    }
  };

  const handleDeleteVRBooking = (id: string) => {
    if (window.confirm("Confirmer l'annulation ?")) {
      // 1. Marquer la réservation comme ANNULÉE (reste dans l'historique, disparait du planning visuel grâce aux filtres existants)
      setVrBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'ANNULE' } : b));
      
      // 2. Mettre à jour le RDV associé pour indiquer qu'il n'a plus de VR actif
      const booking = vrBookings.find(b => b.id === id);
      if (booking?.appointmentId) {
        setAppointments(prev => prev.map(a => 
          a.id === booking.appointmentId ? { ...a, hasVr: false, vrImmat: undefined } : a
        ));
      }
      
      setEditingVRBookingId(null);
      setTempVRBooking(null);
      triggerAutoSave();
    }
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
  }, []);

  const handleToggleBlock = (dateStr: string) => {
    setManualOverrides(prev => {
      const exists = prev.find(o => o.date === dateStr);
      if (exists) {
        return prev.filter(o => o.date !== dateStr);
      } else {
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        const isDefaultBlocked = date.getDay() === 0 || date.getDay() === 6 || !!FRENCH_HOLIDAYS_2026[dateStr];
        
        if (isDefaultBlocked) {
             return [...prev, { date: dateStr, reason: "OUVERTURE EXCEPTIONNELLE" }];
        } else {
             return [...prev, { date: dateStr, reason: "JOUR BLOQUE" }];
        }
      }
    });
    triggerAutoSave();
  };

  const dayData = useMemo(() => {
    const days: DayData[] = [];
    const [sy, sm, sd] = viewStartDate.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd);
    for (let i = 0; i < 31; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const dateStr = toLocalDateStr(d);
      days.push({ 
        date: dateStr, 
        appointments: appointments.filter(a => a.date === dateStr && a.status !== 'ANNULE'), 
        note: dailyNotes[dateStr] 
      });
    }
    return days;
  }, [viewStartDate, appointments, dailyNotes]);

  const weeksData = useMemo(() => {
    const weeks: DayData[][] = [];
    let currentWeek: DayData[] = [];
    dayData.forEach((day, index) => {
      const dayDate = new Date(day.date);
      if (dayDate.getDay() === 1 && currentWeek.length > 0) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      currentWeek.push(day);
      if (index === dayData.length - 1 && currentWeek.length > 0) weeks.push(currentWeek);
    });
    return weeks;
  }, [dayData]);

  const activityGroups = useMemo(() => {
    const statusOrder: AppointmentStatus[] = ['NON PLANIFIE', 'PLANIFIE', 'EN COURS', 'LIVRE', 'LIVRE NON TERMINE', 'FACTURE', 'PAYE', 'ANNULE'];
    const search = workshopSearch.toLowerCase();
    const allItems = [...appointments];
    const filtered = allItems.filter(a => {
      const matchSearch = (a.clientName || "").toLowerCase().includes(search) || (a.immat || "").toLowerCase().includes(search) || (a.model || "").toLowerCase().includes(search);
      const matchFilter = activeStatusFilters.includes(a.status || 'PLANIFIE');
      return matchSearch && matchFilter;
    });
    return statusOrder.map(status => ({
      status, items: filtered.filter(a => (a.status || 'PLANIFIE') === status).sort((a, b) => {
        if (!a.date) return 1; if (!b.date) return -1;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      })
    })).filter(g => g.items.length > 0);
  }, [appointments, workshopSearch, activeStatusFilters]);

  // "Stock" is now just unplanned appointments from the main list
  const unplannedAppointments = useMemo(() => {
    return appointments.filter(a => a.status === 'NON PLANIFIE');
  }, [appointments]);

  const kpis = useMemo(() => {
    const now = new Date();
    const allApts = appointments.filter(a => a.status !== 'ANNULE');
    const calculateForRange = (start: Date, end: Date) => {
      const sStr = toLocalDateStr(start);
      const eStr = toLocalDateStr(end);
      const filtered = allApts.filter(a => !!a.exitDate && a.exitDate >= sStr && a.exitDate <= eStr);
      return {
        count: filtered.length,
        ca: filtered.reduce((acc, curr) => acc + (curr.totalAmount || 0) + (curr.vrInvoiceAmount || 0), 0),
        hours: filtered.reduce((acc, curr) => acc + (curr.laborTimes.t1 + curr.laborTimes.t2 + curr.laborTimes.tp + curr.laborTimes.meca), 0),
        clim: filtered.filter(a => a.hasClim).length,
        geo: filtered.filter(a => a.hasGeo).length
      };
    };
    const startS = getMonday(now);
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
      weeks: { prev: calculateForRange(startSminus1, endSminus1), curr: calculateForRange(startS, endS), next: calculateForRange(startSplus1, endSplus1) },
      months: { prev: calculateForRange(startMminus1, endMminus1), curr: calculateForRange(startM, endM), next: calculateForRange(startMplus1, endMplus1) },
      years: { prev: calculateForRange(startNminus1, endNminus1), curr: calculateForRange(startN, endN), next: calculateForRange(startNplus1, endNplus1) }
    };
  }, [appointments]);

  const handleSaveAppointment = (rawUpdated: Appointment) => {
    let finalStatus = rawUpdated.status || 'PLANIFIE'; 
    let finalDate = rawUpdated.date;
    let finalHour = rawUpdated.appointmentHour; 

    if (finalStatus === 'NON PLANIFIE') {
        finalDate = '';
        finalHour = '';
    } else if (finalDate && !finalHour) {
        finalHour = '08:00';
    }

    // SANITIZATION: Convert string numbers back to real numbers for saving
    const sanitizeNumber = (val: any) => {
       if (val === '' || val === undefined || val === null) return 0;
       if (typeof val === 'number') return val;
       const parsed = parseFloat(String(val).replace(',', '.'));
       return isNaN(parsed) ? 0 : parsed;
    };

    const updated: Appointment = {
      ...rawUpdated, 
      status: finalStatus, 
      date: finalDate, 
      appointmentHour: finalHour, 
      clientName: (rawUpdated.clientName || "").toUpperCase(), 
      immat: (rawUpdated.immat || "").toUpperCase(), 
      model: (rawUpdated.model || "").toUpperCase(), 
      workType: (rawUpdated.workType || "").toUpperCase(), 
      intermediary: rawUpdated.intermediary?.toUpperCase(), 
      insurance: (rawUpdated.insurance || "").toUpperCase(), 
      expert: (rawUpdated.expert || "").toUpperCase(), 
      notes: rawUpdated.notes?.toUpperCase(), 
      vrImmat: rawUpdated.vrImmat?.toUpperCase(),
      // Ensure numeric fields are actually numbers
      estimatedDuration: sanitizeNumber(rawUpdated.estimatedDuration),
      totalAmount: sanitizeNumber(rawUpdated.totalAmount),
      commission: sanitizeNumber(rawUpdated.commission),
      franchise: sanitizeNumber(rawUpdated.franchise),
      vrInvoiceAmount: sanitizeNumber(rawUpdated.vrInvoiceAmount),
      laborTimes: {
          t1: sanitizeNumber(rawUpdated.laborTimes.t1),
          t2: sanitizeNumber(rawUpdated.laborTimes.t2),
          tp: sanitizeNumber(rawUpdated.laborTimes.tp),
          meca: sanitizeNumber(rawUpdated.laborTimes.meca),
      }
    };

    setAppointments(prev => {
      const exists = prev.some(a => a.id === updated.id);
      // Logic simplified: just update or add to single list
      if (exists) return prev.map(a => a.id === updated.id ? updated : a);
      return [...prev, updated];
    });

    if (updated.hasVr && updated.date && updated.exitDate) {
        setVrBookings(prev => prev.map(b => {
             if (b.appointmentId === updated.id && b.status !== 'ANNULE') {
                 const newStartHour = updated.appointmentHour || '08:00';
                 const newEndHour = updated.exitHour || '18:00';
                 const needsUpdate = b.startDate !== updated.date || b.endDate !== updated.exitDate || b.startHour !== newStartHour || b.endHour !== newEndHour;
                 if (needsUpdate) {
                     return { ...b, startDate: updated.date, startHour: newStartHour, endDate: updated.exitDate!, endHour: newEndHour, status: normalizeVRStatus(b.status, { ...b, startDate: updated.date }) };
                 }
             }
             return b;
        }));
    }

    setEditingAptId(null); setNewAptData(null); setTempApt(null);
    triggerAutoSave();
  };

  const handleDuplicateAppointment = (apt: Appointment) => {
    const duplicated: Appointment = {
      ...apt,
      id: Math.random().toString(36).substring(2, 11),
      date: '', status: 'NON PLANIFIE', invoiceNumber: '', billingDate: '', paymentDate: '', totalAmount: 0, commission: 0, franchise: 0, hasVr: false, vrImmat: undefined, vrInvoiceNumber: '', vrInvoiceAmount: 0, exitDate: '', exitHour: ''
    };
    setNewAptData(duplicated); setTempApt(duplicated); setEditingAptId(null);
  };

  const handleSaveVRBooking = (updated: VRBookingFormData) => {
    const newStatus = normalizeVRStatus(updated.status === 'ANNULE' ? 'ANNULE' : 'active', updated);
    const bookingToSave = { ...updated, status: newStatus };

    setVrBookings(prev => {
      let newBookings = prev.map(b => b.id === bookingToSave.id ? bookingToSave : b);
      if (!prev.some(b => b.id === bookingToSave.id)) newBookings = [...newBookings, bookingToSave];
      return newBookings;
    });
    if (updated.vrNote !== undefined) {
        setVrFleet(prev => prev.map(v => v.id === updated.vrId ? { ...v, observations: updated.vrNote } : v));
    }
    if (updated.endMileage && updated.endMileage > 0 && updated.status !== 'ANNULE') {
      setVrFleet(prev => prev.map(v => v.id === updated.vrId ? { ...v, kilometrage: updated.endMileage!, niveauCarburant: updated.endFuel || v.niveauCarburant } : v));
    }
    if (updated.appointmentId && updated.status !== 'ANNULE') {
      const newVr = vrFleet.find(v => v.id === updated.vrId);
      setAppointments(prev => prev.map(a => a.id === updated.appointmentId ? { ...a, clientName: updated.clientName.toUpperCase(), vrImmat: newVr?.immatriculation, hasVr: true } : a));
    }
    setEditingVRBookingId(null); setTempVRBooking(null);
    triggerAutoSave();
  };

  const handleDropAppointment = useCallback((aid: string, newDate: string) => {
    const existingApt = appointments.find(a => a.id === aid);
    if (!existingApt || existingApt.status === 'ANNULE') return;

    if (newDate === 'STOCK') {
        // Mouvement vers le Stock : On annule VR, on met statut 'NON PLANIFIE'
        setVrBookings(prev => prev.map(b => {
            if (b.appointmentId === aid && b.status !== 'ANNULE') return { ...b, status: 'ANNULE' };
            return b;
        }));
        
        setAppointments(prev => prev.map(a => {
            if (a.id === aid) {
                return { ...a, date: '', status: 'NON PLANIFIE', hasVr: false, vrImmat: undefined };
            }
            return a;
        }));
        
        triggerAutoSave();
        return;
    }

    const oldDate = existingApt.date;
    const deltaDays = oldDate ? getDiffInDays(oldDate, newDate) : 0;

    // Mise à jour de l'appointment
    setAppointments(prev => prev.map(a => {
      if (a.id === aid) {
        const updated = { ...a, date: newDate };
        // Si c'était non planifié, on passe à planifié
        if (updated.status === 'NON PLANIFIE') updated.status = 'PLANIFIE';
        if (!updated.appointmentHour) updated.appointmentHour = '08:00';
        
        // Recalcul de la date de sortie si on déplace un RDV existant
        if (a.exitDate && deltaDays !== 0) {
          updated.exitDate = addDaysSafe(a.exitDate, deltaDays);
        } else if (!a.exitDate && updated.estimatedDuration) {
           // Calcul initial sortie si nouveau planning
           const exit = calculateExitInfo(newDate, updated.appointmentHour, updated.estimatedDuration);
           updated.exitDate = exit.date;
           updated.exitHour = exit.hour;
        }
        return updated;
      }
      return a;
    }));

    // Mise à jour VR associé si existant
    if (deltaDays !== 0 && existingApt.hasVr) {
      setVrBookings(prev => prev.map(b => {
        if (b.appointmentId === aid && b.status !== 'ANNULE') {
          const updatedBooking = { ...b, startDate: addDaysSafe(b.startDate, deltaDays), endDate: addDaysSafe(b.endDate, deltaDays) };
          return { ...updatedBooking, status: normalizeVRStatus(b.status, updatedBooking) };
        }
        return b;
      }));
    }
    triggerAutoSave();
  }, [appointments]);

  const handleDropNote = useCallback((sourceDate: string, targetDate: string) => {
    if (sourceDate === targetDate) return;
    const noteContent = dailyNotes[sourceDate];
    if (!noteContent) return;
    const newNotes = { ...dailyNotes };
    if (newNotes[targetDate]) newNotes[targetDate] += '\n' + noteContent;
    else newNotes[targetDate] = noteContent;
    delete newNotes[sourceDate];
    setDailyNotes(newNotes);
    triggerAutoSave();
  }, [dailyNotes]);

  const currentEditingApt = useMemo(() => newAptData || (editingAptId ? appointments.find(a => a.id === editingAptId) : null), [newAptData, editingAptId, appointments]);
  const tempAptTotalHours = useMemo(() => {
    if (!tempApt) return 0;
    // Helper to allow string sum
    const val = (v: any) => v === '' ? 0 : Number(String(v).replace(',', '.'));
    return (val(tempApt.laborTimes.t1) + val(tempApt.laborTimes.t2) + val(tempApt.laborTimes.tp) + val(tempApt.laborTimes.meca));
  }, [tempApt]);

  useEffect(() => {
    if (currentEditingApt && !tempApt) {
      const initialApt = { ...currentEditingApt, hasVr: currentEditingApt.hasVr || false, hasGeo: currentEditingApt.hasGeo || false, hasClim: currentEditingApt.hasClim || false, prStatus: currentEditingApt.prStatus || 'none' };
      if (initialApt.date && initialApt.appointmentHour && initialApt.estimatedDuration) {
        const exit = calculateExitInfo(initialApt.date, initialApt.appointmentHour, initialApt.estimatedDuration);
        initialApt.exitDate = exit.date; initialApt.exitHour = exit.hour;
      }
      setTempApt(initialApt);
    } else if (!currentEditingApt) setTempApt(null);
  }, [currentEditingApt]);

  useEffect(() => {
    if (editingVRBookingId) {
      const booking = vrBookings.find(b => b.id === editingVRBookingId);
      if (booking) {
        const vr = vrFleet.find(v => v.id === booking.vrId);
        setTempVRBooking({ ...booking, observations: booking.observations || '', vrNote: vr?.observations || '' });
      }
    } else setTempVRBooking(null);
  }, [editingVRBookingId, vrBookings, vrFleet]);

  useEffect(() => {
    if (editingNoteDate) setTempNoteText(dailyNotes[editingNoteDate] || '');
    else setTempNoteText('');
  }, [editingNoteDate, dailyNotes]);

  const handleModalChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (!tempApt) return;
    const { name, value, type } = e.target;
    let newValue: any = value; 
    if (type === 'checkbox') newValue = (e.target as HTMLInputElement).checked;

    // Gestion spéciale des champs numériques en mode texte pour permettre la saisie fluide
    if (['t1', 't2', 'tp', 'meca', 'totalAmount', 'commission', 'franchise', 'vrInvoiceAmount', 'estimatedDuration'].includes(name)) {
        // Remplacement auto de la virgule par un point
        const normalized = value.replace(',', '.');
        
        // Autoriser le vide (ne pas forcer 0) ou un format nombre partiel (ex: "12.")
        if (normalized === '' || /^-?\d*\.?\d*$/.test(normalized)) {
            // On stocke la chaîne telle quelle dans le state temporaire pour l'affichage
            // TypeScript va râler car l'interface attend number, on force le cast temporairement
            if (['t1', 't2', 'tp', 'meca'].includes(name)) {
                setTempApt({ ...tempApt, laborTimes: { ...tempApt.laborTimes, [name]: normalized } } as any);
            } else {
                setTempApt({ ...tempApt, [name]: normalized } as any);
            }
            
            // Logique de recalcul automatique de la date de sortie si la durée change
            if (name === 'estimatedDuration') {
                const duration = parseFloat(normalized) || 0; // Use 0 for calc if empty/invalid
                if (!isNaN(duration) && tempApt.date && tempApt.appointmentHour) {
                    const roundedDuration = Math.round(duration * 2) / 2;
                    // On ne met à jour la date que si la durée est valide, mais on laisse la saisie libre
                    const exit = calculateExitInfo(tempApt.date, tempApt.appointmentHour, roundedDuration);
                    // On met à jour sans écraser la valeur 'normalized' de estimatedDuration saisie par l'user
                    setTempApt(prev => prev ? { ...prev, estimatedDuration: normalized as any, exitDate: exit.date, exitHour: exit.hour } : null);
                    return; // Return here specifically for duration to avoid double set
                }
            }
            return;
        } else {
            // Caractère invalide ignoré
            return;
        }
    }

    // Gestion standard pour les autres champs
    let updated = { ...tempApt, [name]: newValue };
    
    // Auto-set 08:00 si une date est sélectionnée et que l'heure est vide
    if (name === 'date' && newValue && !updated.appointmentHour) {
        updated.appointmentHour = '08:00';
    }

    if (name === 'date' || name === 'appointmentHour') {
      const duration = Number(updated.estimatedDuration) || 0;
      if (updated.date && !isNaN(duration) && updated.appointmentHour) {
        const exit = calculateExitInfo(updated.date, updated.appointmentHour, duration);
        updated.exitDate = exit.date; updated.exitHour = exit.hour;
      }
    } else if (name === 'exitDate') {
      if (updated.date && updated.appointmentHour && updated.exitDate) {
        const currentExitHour = updated.exitHour || '18:00';
        const newDuration = calculateDurationFromExit(updated.date, updated.appointmentHour, updated.exitDate, currentExitHour);
        updated.estimatedDuration = newDuration;
      }
    }
    setTempApt(updated);
  };

  const immobilizationDays = useMemo(() => {
    if (!tempApt) return 0;
    const val = parseFloat(String(tempApt.estimatedDuration).replace(',', '.')) || 0;
    return Math.round(val * 2) / 2;
  }, [tempApt?.estimatedDuration]);

  // Gestion mise à jour Flotte VR via tempVrData
  const handleUpdateVrFleetMember = (id: string, updates: Partial<VRData>) => {
    // Si on est en mode édition, on met à jour l'état temporaire
    if (editingVrDataId === id && tempVrData) {
        setTempVrData({ ...tempVrData, ...updates });
    } 
    // Sinon (ex: drag n drop ou toggle visibility), on met à jour direct
    else {
        setVrFleet(prev => prev.map(v => v.id === id ? { ...v, ...updates } : v));
        triggerAutoSave();
    }
  };
  
  // Sauvegarde des changements depuis le mode édition
  const handleSaveVrEdit = () => {
      if (tempVrData && editingVrDataId) {
          setVrFleet(prev => prev.map(v => v.id === editingVrDataId ? tempVrData : v));
          setEditingVrDataId(null);
          setTempVrData(null);
          triggerAutoSave();
      }
  };
  
  // Annulation des changements
  const handleCancelVrEdit = () => {
      // Si c'est un nouveau véhicule qui n'a jamais été sauvegardé (pas dans vrFleet), on pourrait vouloir le supprimer
      // Mais ici l'ajout se fait direct dans vrFleet avant l'édition, donc "Annuler" revient juste à l'état précédent (vide ou défaut)
      // Si l'utilisateur vient de créer le véhicule, "Annuler" le laisse dans la liste tel qu'il était avant l'édit (défaut).
      setEditingVrDataId(null);
      setTempVrData(null);
  };

  const handleAddNewVR = () => {
    const newVr: VRData = {
      id: `vr-${Date.now()}`, immatriculation: '', marque: '', modele: '', typeCarburant: 'Essence', niveauCarburant: 'Full', kilometrage: 0, isVisible: true, slotPosition: vrFleet.length + 1, proprietaire: '', color: '', firstRegistrationDate: ''
    };
    // On ajoute d'abord à la liste (pour qu'il existe)
    setVrFleet(prev => [...prev, newVr]); 
    // Puis on active le mode édition sur cet élément avec l'état temporaire
    setTempVrData(newVr);
    setEditingVrDataId(newVr.id);
  };

  const handleDeleteVR = (id: string) => {
    if (window.confirm('Voulez-vous vraiment supprimer ce véhicule de la flotte ?')) {
      setVrFleet(prev => prev.filter(v => v.id !== id));
      if (editingVrDataId === id) {
          setEditingVrDataId(null);
          setTempVrData(null);
      }
      setVrBookings(prev => prev.filter(b => b.vrId !== id));
      triggerAutoSave();
    }
  };
  
  // Lancer l'édition d'un VR existant
  const startEditingVr = (vr: VRData) => {
      setTempVrData({...vr});
      setEditingVrDataId(vr.id);
  };

  const handleVrDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('vrSortId', id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleVrDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleVrDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('vrSortId');
    if (!sourceId || sourceId === targetId) return;
    const sortedFleet = [...vrFleet].sort((a, b) => (a.slotPosition || 0) - (b.slotPosition || 0));
    const sourceIndex = sortedFleet.findIndex(v => v.id === sourceId);
    const targetIndex = sortedFleet.findIndex(v => v.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    const [movedVr] = sortedFleet.splice(sourceIndex, 1);
    sortedFleet.splice(targetIndex, 0, movedVr);
    const updatedFleet = sortedFleet.map((v, index) => ({ ...v, slotPosition: index + 1 }));
    setVrFleet(updatedFleet);
    triggerAutoSave();
  };

  const handleAddStock = () => {
    const newStock: Appointment = {
      id: Math.random().toString(36).substring(2, 11), clientName: '', insurance: '', expert: '', intermediary: '', immat: '', model: '', workType: '', date: '', appointmentHour: '', laborTimes: { t1: 0, t2: 0, tp: 0, meca: 0 }, status: 'NON PLANIFIE', hasGeo: false, hasClim: false, prStatus: 'none', estimatedDuration: 3.5, invoiceNumber: '', vrInvoiceNumber: '', totalAmount: 0, vrInvoiceAmount: 0
    };
    setNewAptData(newStock);
  };

  const handleReturnToToday = useCallback(() => {
    const todayMonday = getMonday(new Date());
    setViewStartDate(toLocalDateStr(todayMonday));
    if (mainContentRef.current) mainContentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const navigateWeek = (direction: number) => {
    const [y, m, d] = viewStartDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + (direction * 7));
    setViewStartDate(toLocalDateStr(getMonday(date)));
    if (mainContentRef.current) mainContentRef.current.scrollTo({ top: 0, behavior: 'auto' });
  };

  const weekNumber = useMemo(() => {
    const [y, m, d] = viewStartDate.split('-').map(Number);
    return getISOWeek(new Date(y, m - 1, d));
  }, [viewStartDate]);
  
  const viewYear = useMemo(() => viewStartDate.split('-')[0], [viewStartDate]);

  // Si non connecté, afficher l'écran de login
  if (!isAuthenticated) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#101827] text-slate-900 select-none">
            <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-300">
                <div className="flex flex-col items-center mb-8 gap-3">
                    <div className="bg-blue-600 p-3 rounded-xl text-white shadow-lg shadow-blue-500/30">
                        <Lock size={32} />
                    </div>
                    <div className="text-center">
                        <h1 className="text-2xl font-black tracking-tight uppercase text-slate-800">AUTOPLANNER <span className="text-blue-600">PRO</span></h1>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Accès sécurisé Atelier</p>
                    </div>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Mot de passe</label>
                        <div className="relative">
                            <input 
                                type="password" 
                                autoFocus
                                value={passwordInput}
                                onChange={(e) => { setPasswordInput(e.target.value); setLoginError(false); }}
                                className={`w-full bg-slate-50 border-2 rounded-xl px-4 py-3 font-bold text-center text-lg outline-none transition-all placeholder:text-slate-300 ${loginError ? 'border-rose-500 text-rose-600 bg-rose-50 focus:ring-4 focus:ring-rose-500/20' : 'border-slate-200 text-slate-800 focus:border-blue-500 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20'}`}
                                placeholder="••••"
                            />
                        </div>
                        {loginError && <p className="text-[10px] font-bold text-rose-500 text-center animate-pulse">Mot de passe incorrect</p>}
                    </div>

                    <button 
                        type="submit" 
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3.5 rounded-xl font-black text-sm uppercase tracking-widest shadow-xl shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <span>Se connecter</span>
                        <div className="bg-white/20 p-1 rounded-full"><ChevronRight size={12} /></div>
                    </button>
                </form>
                
                <div className="mt-8 text-center">
                    <p className="text-[11px] text-slate-400 font-medium">AutoPlanner V3.0 &copy; 2026</p>
                </div>
            </div>
        </div>
    );
  }

  // --- RENDU PRINCIPAL (Si connecté) ---
  return (
    <div className="min-h-screen flex flex-col select-none overflow-hidden h-screen bg-[#101827]">
      {/* ... (Header conservé à l'identique) ... */}
      <header className="bg-white border-b border-slate-200 px-4 py-1.5 flex items-center justify-between shrink-0 z-[100] shadow-sm text-slate-800 h-[48px]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-1.5 rounded-lg text-white shadow-md"><Calendar size={16} /></div>
            <div><h1 className="text-base font-black tracking-tight uppercase">AUTOPLANNER <span className="text-blue-600">PRO</span></h1><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">LOGISTIQUE ATELIER</p></div>
          </div>
          
          <div className="h-8 w-px bg-slate-200" />

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
             <button onClick={() => setCurrentView('calendar')} className={`px-4 h-[32px] rounded-lg text-[11px] font-black uppercase transition-all flex items-center gap-1.5 ${currentView === 'calendar' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><Calendar size={12} /> Planning</button>
             <button onClick={() => setCurrentView('workshop')} className={`px-4 h-[32px] rounded-lg text-[11px] font-black uppercase transition-all flex items-center gap-1.5 ${currentView === 'workshop' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><BarChart3 size={12} /> Activité</button>
          </div>
        </div>
        
        <div className="flex-1 flex justify-center px-4 items-center">
          {currentView === 'calendar' ? (
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
              <button onClick={() => navigateWeek(-1)} title="Semaine Précédente" className="p-1 h-[32px] w-[32px] flex items-center justify-center text-slate-500 hover:text-blue-600 transition-colors"><ChevronLeft size={16}/></button>
              <div className="flex flex-col items-center min-w-[140px] px-2">
                <span className="text-[12px] font-black uppercase text-blue-600 tracking-tighter">SEMAINE {weekNumber}</span>
                <span className="text-[10px] font-bold uppercase text-slate-400 leading-none">{viewYear}</span>
              </div>
              <button onClick={() => navigateWeek(1)} title="Semaine Suivante" className="p-1 h-[32px] w-[32px] flex items-center justify-center text-slate-500 hover:text-blue-600 transition-colors"><ChevronRight size={16}/></button>
              <div className="w-px h-6 bg-slate-200 mx-1" />
              <button onClick={handleReturnToToday} className="h-[32px] px-4 rounded-lg text-[11px] font-black uppercase bg-white text-blue-600 shadow-sm hover:bg-blue-50 transition-colors flex items-center">Aujourd'hui</button>
            </div>
          ) : (
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input type="text" placeholder="RECHERCHE CLIENT, IMMAT..." value={workshopSearch} onChange={(e) => setWorkshopSearch(e.target.value)} className="w-full bg-slate-100 border-none rounded-xl h-[34px] pl-10 text-slate-800 text-[12px] font-black outline-none uppercase tracking-widest focus:ring-2 focus:ring-blue-500/20" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Bouton Flotte VR supprimé ici */}
          <button onClick={() => setIsStockOpen(!isStockOpen)} title={currentView === 'calendar' ? "Dossiers en stock" : "Tableau KPI"} className={`h-[32px] px-3 rounded-lg text-[11px] font-black uppercase transition-all ${isStockOpen ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>{currentView === 'calendar' ? <Inbox size={12} /> : <TrendingUp size={12} />}</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <main ref={mainContentRef} className="flex-1 overflow-auto bg-[#101827] custom-scrollbar">
          {currentView === 'calendar' ? (
            <div className="min-w-[1350px] flex flex-col pb-40">
              {weeksData.map((week, weekIndex) => {
                const mondayDate = week[0].date;
                const sundayDateObj = new Date(mondayDate); sundayDateObj.setDate(sundayDateObj.getDate() + 6);
                const sundayStr = toLocalDateStr(sundayDateObj);
                const weekAppointments = appointments.filter(a => a.date >= mondayDate && a.date <= sundayStr && a.status !== 'ANNULE');

                return (
                  <div key={`week-${weekIndex}`} className="relative">
                    <WeeklySummaryBanner startDate={mondayDate} weekAppointments={weekAppointments} activeVrs={[...vrFleet].filter(v => v.isVisible).sort((a, b) => (a.slotPosition || 0) - (b.slotPosition || 0))} zIndex={200 - weekIndex} onOpenVRManager={() => setIsVRManagerOpen(true)} />
                    <div className="flex flex-col">
                      {week.map((day, dayIndex) => (
                        <PlanningDayRow 
                          key={day.date}
                          dayData={day} 
                          activeVrs={[...vrFleet].filter(v => v.isVisible).sort((a, b) => (a.slotPosition || 0) - (b.slotPosition || 0))} 
                          allVrBookings={vrBookings.filter(b => b.status !== 'ANNULE')} 
                          isBlocked={isDateBlocked(day.date)} 
                          isAlternate={dayIndex % 2 !== 0}
                          customReason={manualOverrides.find(o => o.date === day.date)?.reason}
                          onToggleBlock={() => handleToggleBlock(day.date)} 
                          onDropAppointment={handleDropAppointment} 
                          onDropNote={handleDropNote} 
                          onEditAppointment={setEditingAptId} 
                          onEditVRBooking={setEditingVRBookingId} 
                          onResizeVRStart={(id, part) => {}} 
                          onMoveVRBooking={(bid, vid) => {
                            setVrBookings(prev => prev.map(b => b.id === bid ? { ...b, vrId: vid } : b));
                            const booking = vrBookings.find(b => b.id === bid);
                            if (booking?.appointmentId) {
                              const newVr = vrFleet.find(v => v.id === vid);
                              if (newVr) setAppointments(prev => prev.map(a => a.id === booking.appointmentId ? { ...a, vrImmat: newVr.immatriculation } : a));
                            }
                            triggerAutoSave();
                          }} 
                          onUpdateVRBookingTime={(bid, part, newHour, dayOffset) => {
                            setVrBookings(prev => prev.map(b => {
                              if (b.id !== bid) return b;
                              const timeStr = `${String(newHour).padStart(2, '0')}:00`;
                              if (part === 'end') {
                                const startDateObj = new Date(b.startDate);
                                const targetDate = new Date(startDateObj);
                                targetDate.setDate(startDateObj.getDate() + dayOffset);
                                const targetDateStr = toLocalDateStr(targetDate);
                                if (targetDateStr < b.startDate || (targetDateStr === b.startDate && newHour <= parseInt(b.startHour.split(':')[0]))) {
                                  return { ...b, endDate: b.startDate, endHour: String(parseInt(b.startHour.split(':')[0]) + 1).padStart(2, '0') + ':00' };
                                }
                                return { ...b, endDate: targetDateStr, endHour: timeStr };
                              }
                              return { ...b, startHour: timeStr };
                            }));
                            triggerAutoSave();
                          }} 
                          onAddAppointment={(date) => setNewAptData({ 
                            id: Math.random().toString(36).substring(2, 11), clientName: '', insurance: '', expert: '', intermediary: '', immat: '', model: '', workType: '', date, appointmentHour: '08:00', laborTimes: { t1: 0, t2: 0, tp: 0, meca: 0 }, status: 'PLANIFIE', hasGeo: false, hasClim: false, prStatus: 'none', estimatedDuration: 3.5, invoiceNumber: '', vrInvoiceNumber: '', totalAmount: 0, vrInvoiceAmount: 0
                          })} 
                          onEditNote={setEditingNoteDate} 
                          onCreateVRFromAppointment={(aid, vid, date, hour) => { 
                            const apt = appointments.find(a => a.id === aid); 
                            if (apt) {
                              const v = vrFleet.find(vf => vf.id === vid);
                              const sortedBookings = [...vrBookings].filter(b => b.vrId === vid && b.status !== 'ANNULE').sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
                              const lastBooking = sortedBookings[0];
                              const startFuel = lastBooking?.endFuel ?? v?.niveauCarburant ?? 'Full';
                              const newBooking: VRBooking = { 
                                id: `bk-${Date.now()}`, vrId: vid, clientName: apt.clientName, startDate: date, startHour: '08:00', endDate: apt.exitDate || date, endHour: apt.exitHour || '18:00', appointmentId: aid, startMileage: lastBooking?.endMileage ?? v?.kilometrage ?? 0, startFuel: startFuel, endFuel: startFuel, observations: '', status: 'OCCUPE' // Initial status, refined by calculation
                              };
                              // Recalculate status immediately
                              newBooking.status = normalizeVRStatus('active', newBooking);

                              setVrBookings(prev => [...prev, newBooking]);
                              setAppointments(prev => prev.map(a => a.id === aid ? { ...a, hasVr: true, vrImmat: v?.immatriculation } : a));
                              triggerAutoSave();
                            }
                          }} 
                          zIndex={100 - dayIndex} 
                          headerTopOffset={30}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // ... (Vue Workshop conservée à l'identique) ...
            <div className="flex flex-col h-full bg-[#0f172a] p-6 space-y-6 overflow-y-auto custom-scrollbar">
              <div className="bg-[#1e293b] rounded-2xl p-4 flex items-center justify-between shadow-sm shrink-0 gap-8">
                <div className="flex gap-1.5 flex-wrap">
                  {(Object.keys(STATUS_CONFIG) as AppointmentStatus[]).map(status => (
                    <button key={status} onClick={() => setActiveStatusFilters(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status])} className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase border transition-all ${activeStatusFilters.includes(status) ? `${STATUS_CONFIG[status].bg} ${STATUS_CONFIG[status].color} ${STATUS_CONFIG[status].border} shadow-lg shadow-${STATUS_CONFIG[status].color.split('-')[1]}-500/10` : 'bg-slate-800 text-slate-500 border-slate-700 opacity-30 hover:opacity-50'}`}>
                      {STATUS_CONFIG[status].label}
                    </button>
                  ))}
                </div>
                <button onClick={handleAddStock} className="bg-blue-600 text-white px-4 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-widest hover:bg-blue-500 transition-all flex items-center gap-2 shadow-lg active:scale-95 shrink-0">
                    <Plus size={16} /> NOUVEAU DOSSIER
                </button>
              </div>
              <div className="space-y-4 pb-40">
                {activityGroups.map(group => {
                  const totalCA = group.items.reduce((acc, curr) => acc + (curr.totalAmount || 0) + (curr.vrInvoiceAmount || 0), 0);
                  const totalHours = group.items.reduce((acc, curr) => acc + (curr.laborTimes.t1 + curr.laborTimes.t2 + curr.laborTimes.tp + curr.laborTimes.meca), 0);
                  
                  return (
                    <div key={group.status} className="space-y-1">
                      <div className={`sticky top-0 z-10 flex items-center justify-between py-1.5 px-4 rounded border ${STATUS_CONFIG[group.status].bg} ${STATUS_CONFIG[group.status].border} shadow-sm backdrop-blur-md`}>
                         <h3 className={`text-[11px] font-black uppercase tracking-[0.2em] ${STATUS_CONFIG[group.status].color}`}>{STATUS_CONFIG[group.status].label}</h3>
                         <div className="flex items-center gap-6">
                            <div className="flex flex-col items-end leading-none"><span className="text-[8px] font-black opacity-30 uppercase tracking-tighter">VOL.</span><span className={`text-[12px] font-black ${STATUS_CONFIG[group.status].color}`}>{group.items.length}</span></div>
                            <div className="flex flex-col items-end leading-none"><span className="text-[8px] font-black opacity-30 uppercase tracking-tighter">CA HT</span><span className={`text-[12px] font-black ${STATUS_CONFIG[group.status].color}`}>{totalCA.toLocaleString('fr-FR')} €</span></div>
                            <div className="flex flex-col items-end leading-none"><span className="text-[8px] font-black opacity-30 uppercase tracking-tighter">MO</span><span className={`text-[12px] font-black ${STATUS_CONFIG[group.status].color}`}>{totalHours.toFixed(1)} H</span></div>
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
          <aside 
            className="w-[260px] border-l border-slate-800 bg-[#1e293b] flex flex-col shrink-0 z-50 animate-in slide-in-from-right duration-300 shadow-2xl overflow-hidden"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
                e.preventDefault();
                const aid = e.dataTransfer.getData('appointmentId');
                if (aid) handleDropAppointment(aid, 'STOCK');
            }}
          >
            {/* ... (Contenu Sidebar conservé à l'identique) ... */}
            {currentView === 'calendar' ? (
              <>
                <div className="p-4 bg-slate-900 border-b border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Inbox size={16} className="text-blue-400" />
                    <h2 className="text-[12px] font-black text-white uppercase tracking-widest leading-none">NON PLANIFIE ({unplannedAppointments.length})</h2>
                  </div>
                  <button onClick={handleAddStock} className="text-blue-400 hover:text-white transition-colors" title="Nouveau dossier">
                    <Plus size={18} />
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-2.5 space-y-3 custom-scrollbar">
                  {unplannedAppointments.length > 0 ? (unplannedAppointments.map(apt => (<AppointmentCard key={apt.id} appointment={apt} variant="summary" onEdit={setEditingAptId} className="mx-auto" />))) : (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6 opacity-20 select-none"><Inbox size={40} className="mb-4" /><p className="text-[12px] font-black uppercase tracking-widest leading-relaxed">Aucun dossier<br/>en stock</p></div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="p-4 bg-slate-900 border-b border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={16} className="text-emerald-400" />
                    <h2 className="text-[12px] font-black text-white uppercase tracking-widest leading-none">Indicateurs KPI</h2>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900/50 p-2 space-y-5">
                   {/* KPI Grid Content */}
                   {(() => {
                      const KPIGrid = ({ title, data, colors, labels }: { title: string, data: { prev: any, curr: any, next: any }, colors: string[], labels: string[] }) => (
                        <div className="bg-slate-800/40 rounded-xl border border-slate-800 overflow-hidden uppercase font-black text-[9px]">
                           <div className="p-2 border-b border-slate-800 bg-slate-800/20 text-center">
                              <span className="text-[11px] text-white tracking-[0.2em]">{title}</span>
                           </div>
                           <div className="flex flex-col">
                              <div className="grid grid-cols-5 bg-slate-800/10 text-slate-500 py-1 border-b border-slate-800/30">
                                <div className="col-span-2 px-2">INDI.</div>
                                <div className="text-center">{labels[0]}</div>
                                <div className={`text-center ${colors[1]}`}>{labels[1]}</div>
                                <div className={`text-center ${colors[2]}`}>{labels[2]}</div>
                              </div>
                              <div className="grid grid-cols-5 border-t border-slate-800/30 items-center py-1.5">
                                <div className="col-span-2 px-2 flex items-center gap-1.5"><FileText size={8} className="text-slate-600" /> VOLUME</div>
                                <div className="text-center text-slate-500">{data.prev.count}</div>
                                <div className={`text-center text-[12px] ${colors[1]}`}>{data.curr.count}</div>
                                <div className={`text-center text-[12px] ${colors[2]}`}>{data.next.count}</div>
                              </div>
                              <div className="grid grid-cols-5 border-t border-slate-800/30 items-center py-1.5 bg-white/[0.01]">
                                <div className="col-span-2 px-2 flex items-center gap-1.5"><Euro size={8} className="text-emerald-600" /> CA HT</div>
                                <div className="text-center text-slate-500">{Math.round(data.prev.ca).toLocaleString('fr-FR')}</div>
                                <div className={`text-center ${colors[1]}`}>{Math.round(data.curr.ca).toLocaleString('fr-FR')}</div>
                                <div className={`text-center ${colors[2]}`}>{Math.round(data.next.ca).toLocaleString('fr-FR')}</div>
                              </div>
                              <div className="grid grid-cols-5 border-t border-slate-800/30 items-center py-1.5">
                                <div className="col-span-2 px-2 flex items-center gap-1.5"><Clock size={8} className="text-amber-600" /> H MO</div>
                                <div className="text-center text-slate-500">{data.prev.hours.toFixed(0)}</div>
                                <div className={`text-center ${colors[1]}`}>{data.curr.hours.toFixed(0)}</div>
                                <div className={`text-center ${colors[2]}`}>{data.next.hours.toFixed(0)}</div>
                              </div>
                              <div className="grid grid-cols-5 border-t border-slate-800/30 items-center py-1.5 bg-white/[0.01]">
                                <div className="col-span-2 px-2 flex items-center gap-1.5"><Compass size={8} className="text-indigo-400" /> GÉO</div>
                                <div className="text-center text-slate-500">{data.prev.geo}</div>
                                <div className={`text-center ${colors[1]}`}>{data.curr.geo}</div>
                                <div className={`text-center ${colors[2]}`}>{data.next.geo}</div>
                              </div>
                              <div className="grid grid-cols-5 border-t border-slate-800/30 items-center py-1.5">
                                <div className="col-span-2 px-2 flex items-center gap-1.5"><Snowflake size={8} className="text-sky-400" /> CLIM</div>
                                <div className="text-center text-slate-500">{data.prev.clim}</div>
                                <div className={`text-center ${colors[1]}`}>{data.curr.clim}</div>
                                <div className={`text-center ${colors[2]}`}>{data.next.clim}</div>
                              </div>
                           </div>
                        </div>
                      );

                      return (
                        <>
                          <KPIGrid title="SEMAINE" labels={['S-1', 'S', 'S+1']} data={kpis.weeks} colors={['text-slate-500', 'text-blue-400', 'text-purple-400']} />
                          <KPIGrid title="MOIS" labels={['M-1', 'M', 'M+1']} data={kpis.months} colors={['text-slate-500', 'text-emerald-400', 'text-purple-400']} />
                          <KPIGrid title="ANNÉE" labels={['A-1', 'A', 'A+1']} data={kpis.years} colors={['text-slate-500', 'text-orange-400', 'text-purple-400']} />
                          <div className="p-3 text-[9px] text-slate-500 italic text-center uppercase tracking-tighter opacity-50">Basé sur la date de sortie renseignée</div>
                        </>
                      );
                   })()}
                </div>
              </>
            )}
          </aside>
        )}
      </div>
      
      <footer className="bg-[#101827] border-t border-slate-800 px-4 flex items-center justify-end text-[10px] text-slate-500 font-black uppercase shrink-0 z-[200] h-[28px]">
        {/* Footer conservé à l'identique */}
        <div className="flex items-center gap-3">
           <button onClick={() => setIsPasswordModalOpen(true)} className="text-slate-600 hover:text-slate-400 transition-colors" title="Réglages"><Settings size={14}/></button>
           {lastSaved && <span className="text-[11px] font-bold text-slate-600 uppercase tracking-widest hidden sm:block">Dernière svgd : {lastSaved.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}</span>}
           <div className={`transition-all duration-300 ${syncError ? 'text-rose-500' : isSyncing ? 'text-blue-400 animate-pulse' : pendingSaveTimestamp ? 'text-amber-400' : 'text-emerald-500'}`} title={syncError ? "Erreur Sync" : isSyncing ? "Enregistrement..." : pendingSaveTimestamp ? "Modifications en attente..." : "Synchronisé"}>
              {syncError ? <CloudOff size={14} /> : <Cloud size={14} fill={pendingSaveTimestamp || isSyncing || !syncError ? "currentColor" : "none"} className={isSyncing ? "opacity-100" : pendingSaveTimestamp ? "opacity-100" : "opacity-40"} />}
           </div>
        </div>
      </footer>

      {tempApt && (
          // ... (Modale Appointment conservée) ...
          <div className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col uppercase text-slate-900 my-4 animate-in fade-in zoom-in-95 duration-200 print-modal">
            <div className={`px-6 py-2 flex items-center justify-between text-white font-black shrink-0 h-[48px] ${tempApt.status === 'ANNULE' ? 'bg-rose-900' : 'bg-blue-600'}`}>
              <div className="flex items-center gap-4"><h2 className="text-sm tracking-widest flex items-center gap-2 uppercase"><Settings size={14} /> FICHE CHANTIER : {tempApt.clientName || 'NOUVEAU'} {tempApt.status === 'ANNULE' && "(ANNULÉ)"}</h2></div>
              <div className="flex items-center gap-12">
                <div className="flex flex-col items-center leading-none"><span className="text-[10px] opacity-60 uppercase mb-0.5 tracking-tighter text-white">DUREE IMMO</span><span className="text-[16px] font-black text-blue-50">{immobilizationDays} J</span></div>
                <div className="flex flex-col items-center leading-none"><span className="text-[10px] opacity-60 uppercase mb-0.5 tracking-tighter text-white">MO TOTAL</span><span className="text-[16px] font-black text-blue-50">{tempAptTotalHours.toFixed(1)} H</span></div>
                <div className="flex flex-col items-end leading-none"><span className="text-[10px] opacity-60 uppercase mb-0.5 tracking-tighter text-white">MONTANT TOTAL HT</span><span className="text-[18px] font-black text-emerald-300">{(Number(tempApt.totalAmount) || 0).toLocaleString('fr-FR')} €</span></div>
              </div>
              <button onClick={() => { setEditingAptId(null); setNewAptData(null); setTempApt(null); }} className="hover:rotate-90 transition-transform no-print"><X size={18}/></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleSaveAppointment(tempApt); }} className="flex flex-col h-full overflow-hidden bg-white">
              {/* ... (Contenu du formulaire identique, non répété pour brièveté, mais la fonction handleSaveAppointment est mise à jour) ... */}
              <div className="p-4 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                {tempApt.status === 'ANNULE' && (
                  <div className="bg-rose-50 border border-rose-200 p-3 rounded-lg flex items-center gap-3 text-rose-700 font-black text-[12px] mb-2 animate-pulse">
                    <AlertCircle size={20} /> DOSSIER ANNULÉ LE {new Date(tempApt.deletedAt || "").toLocaleDateString('fr-FR')}
                  </div>
                )}
                <div className="border border-slate-100 p-3 rounded-xl bg-slate-50/10 space-y-3">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-0.5"><label className="text-[9px] font-black text-blue-600 uppercase">CLIENT</label><input name="clientName" value={tempApt.clientName} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-[12px] uppercase outline-none focus:ring-2 focus:ring-blue-500/20 text-black" required /></div>
                    <div className="space-y-0.5"><label className="text-[9px] font-black text-blue-600 uppercase">IMMAT.</label><input name="immat" value={tempApt.immat} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-[12px] uppercase outline-none focus:ring-2 focus:ring-blue-500/20 text-black" /></div>
                    <div className="space-y-0.5"><label className="text-[9px] font-black text-blue-600 uppercase">VEHICULE</label><input name="model" value={tempApt.model} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-[12px] uppercase outline-none focus:ring-2 focus:ring-blue-500/20 text-black" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-0.5"><label className="text-[9px] font-black text-blue-600 uppercase">APPORTEUR</label><input name="intermediary" value={tempApt.intermediary || ''} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-[12px] uppercase outline-none focus:ring-2 focus:ring-blue-500/20 text-black" /></div>
                    <div className="space-y-0.5"><label className="text-[9px] font-black text-blue-600 uppercase">ASSURANCE</label><input name="insurance" value={tempApt.insurance} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-[12px] uppercase outline-none focus:ring-2 focus:ring-blue-500/20 text-black" /></div>
                    <div className="space-y-0.5"><label className="text-[9px] font-black text-blue-600 uppercase">EXPERT</label><input name="expert" value={tempApt.expert} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-[12px] uppercase outline-none focus:ring-2 focus:ring-blue-500/20 text-black" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-0.5"><label className="text-[9px] font-black text-blue-600 uppercase">TRAVAUX</label><textarea name="workType" value={tempApt.workType} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 font-bold text-[12px] resize-none h-14 uppercase outline-none text-black" required /></div>
                    <div className="space-y-0.5"><label className="text-[9px] font-black text-blue-600 uppercase">INFOS (complémentaires)</label><textarea name="notes" value={tempApt.notes || ''} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 font-bold text-[12px] resize-none h-14 uppercase outline-none text-black" /></div>
                  </div>
                </div>
                <div className="grid grid-cols-12 gap-5">
                  <div className="col-span-6 space-y-3">
                    <div className="border border-emerald-200 p-3 rounded-xl bg-sky-50/10 space-y-4 h-full">
                      <div className="grid grid-cols-7 gap-2">
                        {['t1', 't2', 'tp', 'meca'].map(k => (
                          <div key={k} className="flex-1 space-y-0.5">
                            <label className="text-[9px] font-black text-emerald-600 uppercase">{k.toUpperCase()}</label>
                            <input type="text" inputMode="decimal" name={k} value={(tempApt.laborTimes as any)[k]} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-1 py-1 font-black text-[12px] text-center outline-none text-black" />
                          </div>
                        ))}
                        <div className="space-y-0.5"><label className="text-[9px] font-black text-emerald-600 uppercase">PR</label><button type="button" onClick={() => { const current = tempApt.prStatus || 'none'; const next: PRStatus = current === 'none' ? 'a-commander' : current === 'a-commander' ? 'commande' : current === 'commande' ? 'recu' : 'none'; setTempApt({...tempApt, prStatus: next}); }} className={`w-full p-1 rounded-lg border shadow-sm flex items-center justify-center h-[25px] ${tempApt.prStatus === 'recu' ? 'bg-emerald-600 border-emerald-700 text-white' : tempApt.prStatus === 'commande' ? 'bg-amber-500 border-amber-600 text-white' : tempApt.prStatus === 'a-commander' ? 'bg-rose-600 border-rose-700 text-white animate-pr-blink' : 'bg-slate-50 border-slate-200 text-slate-400 opacity-40'}`}><Package size={14} /></button></div>
                        <div className="space-y-0.5"><label className="text-[9px] font-black text-emerald-600 uppercase">GEO</label><button type="button" onClick={() => setTempApt({...tempApt, hasGeo: !tempApt.hasGeo})} className={`w-full p-1 rounded-lg border shadow-sm flex items-center justify-center h-[25px] ${tempApt.hasGeo ? 'bg-amber-100 border-amber-500 text-amber-600' : 'bg-slate-50 border-slate-200 text-slate-400 opacity-40'}`}><Compass size={14} /></button></div>
                        <div className="space-y-0.5"><label className="text-[9px] font-black text-emerald-600 uppercase">CLIM</label><button type="button" onClick={() => setTempApt({...tempApt, hasClim: !tempApt.hasClim})} className={`w-full p-1 rounded-lg border shadow-sm flex items-center justify-center h-[25px] ${tempApt.hasClim ? 'bg-sky-100 border-sky-500 text-sky-600' : 'bg-slate-50 border-slate-200 text-slate-400 opacity-40'}`}><Snowflake size={14} /></button></div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-0.5"><label className="text-[9px] font-black text-emerald-600 uppercase">DATE ENTREE</label><input type="date" name="date" value={tempApt.date} onChange={handleModalChange} className="w-full h-8 bg-white border border-slate-200 rounded-lg px-2 font-bold text-[12px] outline-none text-black" /></div>
                        <div className="space-y-0.5"><label className="text-[9px] font-black text-emerald-600 uppercase">HEURE ENTREE</label><input type="time" name="appointmentHour" value={tempApt.appointmentHour} onChange={handleModalChange} className="w-full h-8 bg-white border border-slate-200 rounded-lg px-2 font-bold text-[12px] outline-none text-black" /></div>
                        <div className="space-y-0.5"><label className="text-[9px] font-black text-emerald-600 uppercase">DUREE IMMO (jours)</label><input type="text" inputMode="decimal" name="estimatedDuration" value={tempApt.estimatedDuration || ''} onChange={handleModalChange} className="w-full h-8 bg-white border border-slate-200 rounded-lg px-2 py-1 font-black text-[12px] outline-none text-black" /></div>
                        <div className="space-y-0.5"><label className="text-[9px] font-black text-emerald-600 uppercase">DATE SORTIE</label><input type="date" name="exitDate" value={tempApt.exitDate || ''} onChange={handleModalChange} className="w-full h-8 bg-white border border-slate-200 rounded-lg px-2 font-bold text-[12px] outline-none text-black" /></div>
                      </div>
                    </div>
                  </div>
                  <div className="col-span-6 space-y-3">
                    <div className="border border-rose-200 p-3 rounded-xl bg-rose-50/10 grid grid-cols-2 gap-3 h-full">
                      <div className="space-y-0.5"><label className="text-[9px] font-black text-rose-600 uppercase">FACTURE (numéro)</label><input name="invoiceNumber" value={tempApt.invoiceNumber || ''} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 font-bold text-[12px] outline-none text-black" /></div>
                      <div className="space-y-0.5"><label className="text-[9px] font-black text-rose-600 uppercase">MONTANT (Travaux HT)</label><input type="text" inputMode="decimal" name="totalAmount" value={tempApt.totalAmount || ''} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 font-black text-[12px] outline-none text-black" /></div>
                      <div className="space-y-0.5"><label className="text-[9px] font-black text-rose-600 uppercase">COMMISSION (€)</label><input type="text" inputMode="decimal" name="commission" value={tempApt.commission || ''} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 font-black text-[12px] outline-none text-black" /></div>
                      <div className="space-y-0.5"><label className="text-[9px] font-black text-rose-600 uppercase">FRANCHISE (€)</label><input type="text" inputMode="decimal" name="franchise" value={tempApt.franchise || ''} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 font-black text-[12px] outline-none text-black" /></div>
                      <div className="space-y-0.5"><label className="text-[9px] font-black text-rose-600 uppercase">DATE FACTURE</label><input type="date" name="billingDate" value={tempApt.billingDate || ''} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 font-bold text-[12px] outline-none text-black" /></div>
                      <div className="space-y-0.5"><label className="text-[9px] font-black text-rose-600 uppercase">DATE RÈGLEMENT</label><input type="date" name="paymentDate" value={tempApt.paymentDate || ''} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 font-bold text-[12px] outline-none text-black" /></div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-12 gap-4 items-end border border-amber-200 p-3 rounded-xl bg-amber-50/10">
                  <div className="col-span-6 flex flex-col gap-1">
                    <label className="text-[9px] font-black text-amber-600 uppercase">VEHICULE DE REMPLACEMENT</label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1.5 font-black text-[12px] uppercase outline-none text-slate-500 h-[32px] flex items-center">
                        {tempApt.vrImmat || 'PAS DE RESERVATION'}
                      </div>
                      <button 
                        type="button"
                        disabled={!tempApt.hasVr}
                        onClick={() => { 
                            const booking = vrBookings.find(b => b.appointmentId === tempApt.id && b.status !== 'ANNULE');
                            if (booking) setEditingVRBookingId(booking.id);
                            else alert("Détails de réservation introuvables ou annulés.");
                        }} 
                        className={`px-3 h-[32px] rounded-lg font-black text-[11px] shadow-sm flex items-center gap-2 shrink-0 transition-colors ${tempApt.hasVr ? 'bg-amber-400 text-slate-900 cursor-pointer hover:bg-amber-300' : 'bg-slate-100 text-slate-300 border border-slate-200 cursor-not-allowed opacity-50'}`}
                      >
                        <Car size={12} /> VR {tempApt.hasVr ? 'ACTIF' : ''}
                      </button>
                      {tempApt.hasVr && (
                        <button
                            type="button"
                            onClick={() => {
                                const booking = vrBookings.find(b => b.appointmentId === tempApt.id && b.status !== 'ANNULE');
                                if (booking) {
                                    if (window.confirm("Voulez-vous vraiment annuler la réservation VR associée ?")) {
                                        setVrBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'ANNULE' } : b));
                                        setAppointments(prev => prev.map(a => a.id === tempApt.id ? { ...a, hasVr: false, vrImmat: undefined } : a));
                                        setTempApt(prev => prev ? { ...prev, hasVr: false, vrImmat: undefined } : null);
                                        triggerAutoSave();
                                    }
                                }
                            }}
                            className="h-[32px] px-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors shadow-sm flex items-center justify-center"
                            title="Annuler la réservation VR"
                        >
                            <Ban size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="col-span-3 space-y-0.5"><label className="text-[9px] font-black text-amber-600 uppercase">FACTURE VR (numéro)</label><input name="vrInvoiceNumber" value={tempApt.vrInvoiceNumber || ''} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-[12px] outline-none text-black" /></div>
                  <div className="col-span-3 space-y-0.5"><label className="text-[9px] font-black text-amber-600 uppercase">MONTANT VR HT (€)</label><input type="text" inputMode="decimal" name="vrInvoiceAmount" value={tempApt.vrInvoiceAmount || ''} onChange={handleModalChange} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-black text-[12px] outline-none text-black" /></div>
                </div>
              </div>
              <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between no-print shrink-0">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">STATUT ACTUEL</span>
                    <select name="status" value={tempApt.status} onChange={handleModalChange} className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-blue-600 font-black text-[12px] uppercase focus:ring-2 focus:ring-blue-500/20 cursor-pointer shadow-sm min-w-[140px]">
                      {(Object.keys(STATUS_CONFIG) as AppointmentStatus[]).map(s => (<option key={s} value={s}>{STATUS_CONFIG[s].label.toUpperCase()}</option>))}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => handleDuplicateAppointment(tempApt)} title="Dupliquer ce chantier" className="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-200 text-blue-600 bg-white hover:bg-blue-50 transition-all active:scale-95 font-black text-[11px] uppercase shadow-sm">
                    <Copy size={14}/> DUPLIQUER
                  </button>
                  <div className="w-px h-6 bg-slate-200 mx-1" />
                  <button type="button" onClick={() => window.print()} title="Imprimer la fiche" className="p-2 rounded-lg border border-slate-200 text-slate-500 bg-white hover:bg-slate-50 transition-all active:scale-95 shadow-sm">
                    <Printer size={18}/>
                  </button>
                  <button type="button" onClick={() => handleDeleteAppointment(tempApt.id)} title="Supprimer ou Annuler" className="p-2 rounded-lg border border-rose-200 text-rose-500 bg-white hover:bg-rose-50 transition-all active:scale-95 shadow-sm">
                    <Trash2 size={18}/>
                  </button>
                  <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2 rounded-lg font-black text-[11px] uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all active:scale-95 border border-blue-400/10">
                    <Save size={16}/> ENREGISTRER LE DOSSIER
                  </button>
                </div>
              </div>
            </form>
          </div>
          </div>
      )}

      {/* ... (Autres modals conservées) ... */}
      
      {/* MODAL PASSWORD SETTINGS */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col uppercase text-slate-900 animate-in fade-in zoom-in-95 duration-200">
                <div className="bg-slate-800 px-6 py-3 flex items-center justify-between text-white font-black shrink-0 h-[48px]">
                    <h2 className="text-sm tracking-widest flex items-center gap-2 uppercase"><Key size={14} /> Sécurité</h2>
                    <button onClick={() => setIsPasswordModalOpen(false)} className="hover:rotate-90 transition-transform"><X size={18}/></button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="space-y-1">
                        <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Nouveau mot de passe</label>
                        <input 
                            type="text" 
                            autoFocus
                            value={newPasswordInput}
                            onChange={(e) => setNewPasswordInput(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 font-bold text-center text-lg outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                            placeholder="••••"
                        />
                        <p className="text-[10px] text-slate-400 italic text-center mt-1">Minimum 4 caractères</p>
                    </div>
                    <button 
                        onClick={handleSavePassword}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-black text-sm uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <Save size={14} /> Enregistrer
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* MODAL GESTION FLOTTE VR */}
      {isVRManagerOpen && (
        <div className="fixed inset-0 z-[800] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col uppercase text-slate-900 border border-white/20 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-800 px-6 py-3 flex items-center justify-between text-white font-black shrink-0 h-[48px]">
              <h2 className="text-sm tracking-widest flex items-center gap-2 uppercase"><Car size={14} /> GESTION DE LA FLOTTE</h2>
              <button onClick={() => setIsVRManagerOpen(false)} className="hover:rotate-90 transition-transform"><X size={18}/></button>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto custom-scrollbar bg-slate-50 space-y-3 max-h-[80vh]">
               {vrFleet.sort((a, b) => (a.slotPosition || 0) - (b.slotPosition || 0)).map((vr) => (
                 <div 
                    key={vr.id}
                    draggable
                    onDragStart={(e) => handleVrDragStart(e, vr.id)}
                    onDragOver={handleVrDragOver}
                    onDrop={(e) => handleVrDrop(e, vr.id)}
                    className={`bg-white border p-3 rounded-xl shadow-sm transition-all ${editingVrDataId === vr.id ? 'border-blue-500 ring-2 ring-blue-500/20 z-10' : 'border-slate-200 hover:border-blue-300'}`}
                 >
                    {editingVrDataId === vr.id && tempVrData ? (
                        <div className="flex flex-col gap-3 p-1">
                            {/* ROW 1: IMMAT | MARQUE | MODELE | COULEUR */}
                            <div className="grid grid-cols-4 gap-3">
                                <div className="space-y-0.5">
                                    <label className="text-[9px] font-black text-slate-400">IMMATRICULATION</label>
                                    <input type="text" value={tempVrData.immatriculation} onChange={(e) => handleUpdateVrFleetMember(vr.id, { immatriculation: e.target.value.toUpperCase() })} className="w-full font-black text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 h-7 outline-none focus:border-blue-500" />
                                </div>
                                <div className="space-y-0.5">
                                    <label className="text-[9px] font-black text-slate-400">MARQUE</label>
                                    <input type="text" value={tempVrData.marque} onChange={(e) => handleUpdateVrFleetMember(vr.id, { marque: e.target.value.toUpperCase() })} className="w-full font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 h-7 outline-none focus:border-blue-500" />
                                </div>
                                <div className="space-y-0.5">
                                    <label className="text-[9px] font-black text-slate-400">MODÈLE</label>
                                    <input type="text" value={tempVrData.modele} onChange={(e) => handleUpdateVrFleetMember(vr.id, { modele: e.target.value.toUpperCase() })} className="w-full font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 h-7 outline-none focus:border-blue-500" />
                                </div>
                                <div className="space-y-0.5">
                                    <label className="text-[9px] font-black text-slate-400">COULEUR</label>
                                    <input type="text" value={tempVrData.color || ''} onChange={(e) => handleUpdateVrFleetMember(vr.id, { color: e.target.value.toUpperCase() })} className="w-full font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 h-7 outline-none focus:border-blue-500" placeholder="COULEUR" />
                                </div>
                            </div>

                            {/* ROW 2: VIN (2) | 1ERE MEC (1) | TYPE CARB (1) */}
                            <div className="grid grid-cols-4 gap-3">
                                <div className="space-y-0.5 col-span-2">
                                    <label className="text-[9px] font-black text-slate-400">VIN</label>
                                    <input type="text" value={tempVrData.vin || ''} onChange={(e) => handleUpdateVrFleetMember(vr.id, { vin: e.target.value.toUpperCase() })} className="w-full font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 h-7 outline-none focus:border-blue-500" placeholder="VIN" />
                                </div>
                                <div className="space-y-0.5 col-span-1">
                                    <label className="text-[9px] font-black text-slate-400">1ÈRE MISE CIRC.</label>
                                    <input type="date" value={tempVrData.firstRegistrationDate || ''} onChange={(e) => handleUpdateVrFleetMember(vr.id, { firstRegistrationDate: e.target.value })} className="w-full font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 h-7 outline-none focus:border-blue-500" />
                                </div>
                                <div className="space-y-0.5 col-span-1">
                                    <label className="text-[9px] font-black text-slate-400">CARBURANT</label>
                                    <select value={tempVrData.typeCarburant} onChange={(e) => handleUpdateVrFleetMember(vr.id, { typeCarburant: e.target.value })} className="w-full font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 h-7 outline-none focus:border-blue-500">
                                        <option value="Essence">Essence</option>
                                        <option value="Diesel">Diesel</option>
                                        <option value="Hybride">Hybride</option>
                                        <option value="Electrique">Electrique</option>
                                        <option value="GPL">GPL</option>
                                        <option value="Ethanol">Ethanol</option>
                                    </select>
                                </div>
                            </div>

                            {/* ROW 3: EMPTY (2) | KM (1) | NIV CARB (1) */}
                            <div className="grid grid-cols-4 gap-3">
                                <div className="col-span-2"></div>
                                <div className="space-y-0.5 col-span-1">
                                    <label className="text-[9px] font-black text-slate-400">KILOMÉTRAGE ACTUEL</label>
                                    <input type="number" value={tempVrData.kilometrage} onChange={(e) => handleUpdateVrFleetMember(vr.id, { kilometrage: parseInt(e.target.value) || 0 })} className="w-full font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 h-7 outline-none focus:border-blue-500" />
                                </div>
                                <div className="space-y-0.5 col-span-1">
                                    <label className="text-[9px] font-black text-slate-400">NIVEAU CARB.</label>
                                    <select value={tempVrData.niveauCarburant} onChange={(e) => handleUpdateVrFleetMember(vr.id, { niveauCarburant: e.target.value })} className="w-full font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 h-7 outline-none focus:border-blue-500">
                                        {FUEL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* ROW 4: NOTES */}
                            <div className="space-y-0.5">
                                <label className="text-[9px] font-black text-slate-400">NOTES</label>
                                <textarea 
                                    value={tempVrData.observations || ''} 
                                    onChange={(e) => handleUpdateVrFleetMember(vr.id, { observations: e.target.value.toUpperCase() })} 
                                    className="w-full bg-slate-100 border border-slate-200 rounded px-2 py-1 text-[11px] font-medium min-h-[60px] resize-none outline-none focus:border-blue-500"
                                    placeholder="NOTES PERMANENTES SUR L'ÉTAT DU VÉHICULE..."
                                />
                            </div>

                            {/* ROW 5: PROPRIETAIRE | CONTRAT | ECHEANCE | KM MAX */}
                            <div className="grid grid-cols-4 gap-3 border-t border-slate-100 pt-3 mt-1">
                                <div className="space-y-0.5">
                                    <label className="text-[9px] font-black text-slate-400">PROPRIÉTAIRE</label>
                                    <input type="text" value={tempVrData.proprietaire || ''} onChange={(e) => handleUpdateVrFleetMember(vr.id, { proprietaire: e.target.value.toUpperCase() })} className="w-full font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 h-7 outline-none focus:border-blue-500" placeholder="NOM PROPRIÉTAIRE" />
                                </div>
                                <div className="space-y-0.5">
                                    <label className="text-[9px] font-black text-slate-400">N° CONTRAT</label>
                                    <input type="text" value={tempVrData.numContrat || ''} onChange={(e) => handleUpdateVrFleetMember(vr.id, { numContrat: e.target.value.toUpperCase() })} className="w-full font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 h-7 outline-none focus:border-blue-500" placeholder="REF. CONTRAT" />
                                </div>
                                <div className="space-y-0.5">
                                    <label className="text-[9px] font-black text-slate-400">DATE ÉCHÉANCE</label>
                                    <input type="date" value={tempVrData.dateEcheanceContrat || ''} onChange={(e) => handleUpdateVrFleetMember(vr.id, { dateEcheanceContrat: e.target.value })} className="w-full font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 h-7 outline-none focus:border-blue-500" />
                                </div>
                                <div className="space-y-0.5">
                                    <label className="text-[9px] font-black text-slate-400">FORFAIT KM</label>
                                    <input type="number" value={tempVrData.kmMax || ''} onChange={(e) => handleUpdateVrFleetMember(vr.id, { kmMax: parseInt(e.target.value) || 0 })} className="w-full font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 h-7 outline-none focus:border-blue-500" placeholder="EX: 10000" />
                                </div>
                            </div>

                            {/* ACTION BUTTONS */}
                            <div className="flex items-center justify-end gap-3 mt-2 pt-2">
                                <button onClick={handleCancelVrEdit} className="px-4 py-1.5 rounded-lg border border-slate-300 text-slate-500 font-black text-[10px] uppercase hover:bg-slate-50 transition-colors">
                                    ANNULER
                                </button>
                                <button onClick={handleSaveVrEdit} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-black text-[10px] uppercase hover:bg-blue-700 transition-colors shadow-sm">
                                    ENREGISTRER
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 cursor-move">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-white ${vr.isVisible ? 'bg-slate-700' : 'bg-slate-300'}`}>
                                    {vr.slotPosition}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-black text-slate-900">{vr.immatriculation}</span>
                                        <span className="text-xs font-bold text-slate-500">{vr.marque} {vr.modele}</span>
                                        {vr.color && <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 rounded uppercase">{vr.color}</span>}
                                        {!vr.isVisible && <span className="bg-slate-200 text-slate-500 text-[9px] px-1.5 py-0.5 rounded font-black">MASQUÉ</span>}
                                    </div>
                                    <div className="flex items-center gap-3 text-[10px] font-medium text-slate-400">
                                        <span>{vr.kilometrage} KM</span>
                                        <span>{vr.typeCarburant}</span>
                                        <span>{vr.niveauCarburant}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setShowingHistoryForVrId(vr.id)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Historique">
                                    <History size={16} />
                                </button>
                                <button onClick={() => handleUpdateVrFleetMember(vr.id, { isVisible: !vr.isVisible })} className={`p-2 rounded transition-colors ${vr.isVisible ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-100' : 'text-slate-300 hover:text-slate-500'}`} title={vr.isVisible ? "Masquer du planning" : "Afficher sur le planning"}>
                                    {vr.isVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                                </button>
                                <button onClick={() => startEditingVr(vr)} className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors" title="Modifier">
                                    <Wrench size={16} />
                                </button>
                                <button onClick={() => handleDeleteVR(vr.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors" title="Supprimer">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    )}
                 </div>
               ))}
               
               <button onClick={handleAddNewVR} className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-400 font-black text-xs uppercase hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all flex items-center justify-center gap-2">
                  <Plus size={16} /> Ajouter un véhicule
               </button>
            </div>
          </div>
        </div>
      )}

      {/* ... (Le reste des modals VR Booking, Note, VR Manager, History reste identique) ... */}
      {tempVRBooking && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col uppercase text-slate-900 border border-white/20">
            {/* Contenu identique au fichier précédent */}
            {(() => {
              const linkedVr = vrFleet.find(v => v.id === tempVRBooking.vrId);
              return (
                <>
                  <div className={`px-6 py-2 flex items-center justify-between text-white font-black shrink-0 h-[48px] ${tempVRBooking.status === 'ANNULE' ? 'bg-rose-900' : 'bg-blue-600'}`}>
                    <h2 className="text-sm tracking-widest flex items-center gap-2 uppercase"><Car size={14} /> RESERVATION {linkedVr?.immatriculation} - {linkedVr?.marque} {linkedVr?.modele} | {tempVRBooking.clientName} {tempVRBooking.status === 'ANNULE' && "(ANNULÉ)"}</h2>
                    <button onClick={() => { setEditingVRBookingId(null); setTempVRBooking(null); }} className="hover:rotate-90 transition-transform"><X size={18}/></button>
                  </div>
                  <div className="p-6 space-y-6 overflow-y-auto max-h-[85vh] custom-scrollbar">
                    {/* ... Inputs de réservation identiques ... */}
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between mb-4">
                       <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600"><Car size={16}/></div>
                          <div>
                             <div className="text-[11px] font-black text-slate-400 uppercase">VÉHICULE ACTUEL</div>
                             <div className="text-[13px] font-black text-slate-900">{linkedVr?.immatriculation} - {linkedVr?.marque} {linkedVr?.modele}</div>
                          </div>
                       </div>
                    </div>

                    {/* NOUVELLE SECTION INFORMATIONS CONDUCTEUR */}
                    <div className="bg-slate-50/50 border border-slate-200 rounded-lg p-3 space-y-3 mb-4">
                        <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <UserCircle size={12} />
                            <span>Informations Conducteur (Pour Contrat)</span>
                        </div>
                        <div className="grid grid-cols-12 gap-3">
                             <div className="col-span-8 space-y-0.5">
                                <label className="text-[9px] font-black text-slate-500 uppercase">ADRESSE</label>
                                <input 
                                    type="text" 
                                    value={tempVRBooking.clientAddress || ''} 
                                    onChange={(e) => setTempVRBooking({...tempVRBooking, clientAddress: e.target.value.toUpperCase()})} 
                                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-[12px] uppercase outline-none text-black placeholder:text-slate-300"
                                    placeholder="ADRESSE COMPLETE..."
                                />
                             </div>
                             <div className="col-span-4 space-y-0.5">
                                <label className="text-[9px] font-black text-slate-500 uppercase">TELEPHONE</label>
                                <input 
                                    type="text" 
                                    value={tempVRBooking.clientPhone || ''} 
                                    onChange={(e) => setTempVRBooking({...tempVRBooking, clientPhone: e.target.value.toUpperCase()})} 
                                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-[12px] uppercase outline-none text-black"
                                />
                             </div>
                             <div className="col-span-4 space-y-0.5">
                                <label className="text-[9px] font-black text-slate-500 uppercase">NUMERO PC</label>
                                <input 
                                    type="text" 
                                    value={tempVRBooking.licenseNumber || ''} 
                                    onChange={(e) => setTempVRBooking({...tempVRBooking, licenseNumber: e.target.value.toUpperCase()})} 
                                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-[12px] uppercase outline-none text-black"
                                />
                             </div>
                             <div className="col-span-4 space-y-0.5">
                                <label className="text-[9px] font-black text-slate-500 uppercase">DATE PC</label>
                                <input 
                                    type="date" 
                                    value={tempVRBooking.licenseDate || ''} 
                                    onChange={(e) => setTempVRBooking({...tempVRBooking, licenseDate: e.target.value})} 
                                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-[12px] uppercase outline-none text-black"
                                />
                             </div>
                             <div className="col-span-4 space-y-0.5">
                                <label className="text-[9px] font-black text-slate-500 uppercase">AUTRE CONDUCTEUR</label>
                                <input 
                                    type="text" 
                                    value={tempVRBooking.secondaryDriver || ''} 
                                    onChange={(e) => setTempVRBooking({...tempVRBooking, secondaryDriver: e.target.value.toUpperCase()})} 
                                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-[12px] uppercase outline-none text-black"
                                />
                             </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-4 gap-4 items-end">
                      <div className="space-y-1"><label className="text-[9px] font-black text-blue-600 uppercase">DATE DEPART</label><input type="date" name="startDate" value={tempVRBooking.startDate} onChange={(e) => setTempVRBooking({...tempVRBooking, startDate: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-[13px] uppercase outline-none text-black h-9" /></div>
                      <div className="space-y-1"><label className="text-[9px] font-black text-blue-600 uppercase">HEURE DEPART</label><input type="time" name="startHour" value={tempVRBooking.startHour} onChange={(e) => setTempVRBooking({...tempVRBooking, startHour: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-[13px] uppercase outline-none text-black h-9" /></div>
                      <div className="space-y-1"><label className="text-[9px] font-black text-blue-600 uppercase">KM DEPART</label><input type="number" name="startMileage" value={tempVRBooking.startMileage || 0} onChange={(e) => setTempVRBooking({...tempVRBooking, startMileage: parseInt(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-[13px] uppercase outline-none text-black h-9" /></div>
                      <div className="space-y-1"><label className="text-[9px] font-black text-blue-600 uppercase">CARB. DEPART</label><select name="startFuel" value={tempVRBooking.startFuel || 'Full'} onChange={(e) => setTempVRBooking({...tempVRBooking, startFuel: e.target.value, endFuel: tempVRBooking.endFuel === '' || tempVRBooking.endFuel === undefined ? e.target.value : tempVRBooking.endFuel})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-[13px] outline-none text-black h-9">{FUEL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select></div>
                    </div>
                    <div className="grid grid-cols-4 gap-4 items-end">
                      <div className="space-y-1"><label className="text-[9px] font-black text-rose-600 uppercase">DATE RETOUR</label><input type="date" name="endDate" value={tempVRBooking.endDate} onChange={(e) => setTempVRBooking({...tempVRBooking, endDate: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-[13px] uppercase outline-none text-black h-9" /></div>
                      <div className="space-y-1"><label className="text-[9px] font-black text-rose-600 uppercase">HEURE RETOUR</label><input type="time" name="endHour" value={tempVRBooking.endHour} onChange={(e) => setTempVRBooking({...tempVRBooking, endHour: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-[13px] uppercase outline-none text-black h-9" /></div>
                      <div className="space-y-1"><label className="text-[9px] font-black text-rose-600 uppercase">KM RETOUR</label><input type="number" name="endMileage" value={tempVRBooking.endMileage ?? ''} onChange={(e) => setTempVRBooking({...tempVRBooking, endMileage: e.target.value === '' ? undefined : parseInt(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-[13px] uppercase outline-none text-black h-9" placeholder={`${tempVRBooking.startMileage ?? 'KM DEPART'}`} /></div>
                      <div className="space-y-1"><label className="text-[9px] font-black text-rose-600 uppercase">CARB. RETOUR</label><select name="endFuel" value={tempVRBooking.endFuel || ''} onChange={(e) => setTempVRBooking({...tempVRBooking, endFuel: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-[13px] outline-none text-black h-9"><option value="">-- {tempVRBooking.startFuel || 'Full'} --</option>{FUEL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select></div>
                    </div>
                    <div className="space-y-4 pt-2">
                        <div className="space-y-1"><label className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5"><Info size={10}/> INFOS</label><textarea name="observations" value={tempVRBooking.observations || ''} onChange={(e) => setTempVRBooking({...tempVRBooking, observations: e.target.value.toUpperCase()})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-[13px] uppercase outline-none text-black min-h-[80px] resize-none" placeholder="DÉTAILS SPÉCIFIQUES À CETTE RÉSERVATION..." /></div>
                        <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Car size={10}/> NOTES</label><textarea name="vrNote" value={tempVRBooking.vrNote || ''} onChange={(e) => setTempVRBooking({...tempVRBooking, vrNote: e.target.value.toUpperCase()})} className="w-full bg-slate-100/50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-[13px] uppercase outline-none text-black min-h-[80px] resize-none" placeholder="OBSERVATIONS PERMANENTES SUR L'ÉTAT DU VÉHICULE..." /></div>
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-6 border-t border-slate-100">
                      <button 
                        type="button" 
                        onClick={() => generateVRContract(tempVRBooking, linkedVr)}
                        className="px-6 py-2.5 rounded-xl text-[11px] font-black uppercase border border-slate-300 text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-all active:scale-95"
                      >
                        <FileSignature size={16}/> IMPRIMER CONTRAT
                      </button>

                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => handleDeleteVRBooking(tempVRBooking.id)} className="px-6 py-2.5 rounded-xl text-[11px] font-black uppercase border border-rose-500 text-rose-500 hover:bg-rose-500 hover:text-white flex items-center gap-2"><Trash2 size={16}/> {tempVRBooking.status === 'ANNULE' ? 'SUPPRIMER DÉF.' : 'ANNULER RÉSER.'}</button>
                        <button type="button" onClick={() => handleSaveVRBooking(tempVRBooking)} className="px-10 py-2.5 rounded-xl text-[11px] font-black uppercase bg-blue-600 text-white hover:bg-blue-50 shadow-xl flex items-center gap-2 transition-all active:scale-95"><Save size={16}/> ENREGISTRER</button>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {showingHistoryForVrId && (
        <div className="fixed inset-0 z-[900] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col uppercase text-slate-900 border border-white/20 animate-in fade-in zoom-in-95 duration-200">
             <div className="bg-[#1e293b] px-6 py-3 flex items-center justify-between text-white font-black shrink-0 h-[48px]">
                <h2 className="text-sm tracking-[0.2em] flex items-center gap-3"><History size={18} className="text-blue-400" /> HISTORIQUE VÉHICULE</h2>
                <button onClick={() => setShowingHistoryForVrId(null)} className="hover:rotate-90 transition-transform p-1.5 bg-slate-800 rounded-full"><X size={16}/></button>
             </div>
             <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar bg-slate-50">
                {(() => {
                    const historyBookings = vrBookings.filter(b => b.vrId === showingHistoryForVrId).sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
                    if (historyBookings.length === 0) {
                        return (
                            <div className="h-64 flex flex-col items-center justify-center text-slate-300 gap-3">
                                <History size={48} />
                                <span className="text-[12px] font-black uppercase tracking-widest">Aucun historique disponible</span>
                            </div>
                        );
                    }
                    return historyBookings.map(b => (
                        <div key={b.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${b.status === 'ANNULE' ? 'bg-rose-50 text-rose-500' : 'bg-blue-50 text-blue-500'}`}>
                                    <Car size={20} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[13px] font-black text-slate-900 uppercase">{b.clientName}</span>
                                        {b.status === 'ANNULE' && <span className="text-[10px] font-bold text-white bg-rose-500 px-1.5 py-0.5 rounded">ANNULÉ</span>}
                                    </div>
                                    <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 mt-0.5">
                                        <Calendar size={10} />
                                        <span>{new Date(b.startDate).toLocaleDateString('fr-FR')} - {new Date(b.endDate).toLocaleDateString('fr-FR')}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <div className="text-[12px] font-black text-slate-700 bg-slate-100 px-2 py-1 rounded-lg">
                                    {b.startMileage || 0} km <span className="text-slate-400">→</span> {b.endMileage || '...'} km
                                </div>
                                {b.endFuel && <div className="text-[10px] font-bold text-slate-400">Retour: {b.endFuel}</div>}
                            </div>
                        </div>
                    ));
                })()}
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;