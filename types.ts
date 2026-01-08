
export type LaborTimes = {
  t1: number;
  t2: number;
  tp: number;
  meca: number;
};

export type AppointmentStatus = 'stock' | 'a-venir' | 'en-cours' | 'livre' | 'livre-non-termine' | 'facture' | 'paye' | 'annule';

export type PRStatus = 'none' | 'a-commander' | 'commande' | 'recu';

export interface Appointment {
  id: string;
  clientName: string;
  intermediary?: string; 
  insurance: string;
  expert: string;
  immat: string;
  model: string;
  workType: string;
  laborTimes: LaborTimes;
  date: string; 
  appointmentHour: string; 
  status: AppointmentStatus;
  
  // Prestations spécifiques
  hasGeo?: boolean;
  hasClim?: boolean;
  prStatus?: PRStatus; 
  
  exitDate?: string;
  exitHour?: string;
  estimatedDuration?: string; 
  
  billingDate?: string;
  invoiceNumber?: string;
  totalAmount?: number; 
  paymentDate?: string;
  commission?: number;
  franchise?: number;
  
  hasVr?: boolean;
  vrImmat?: string;
  vrModel?: string;
  isVrInvoiced?: boolean;
  vrInvoiceNumber?: string;
  vrInvoiceAmount?: number;
  
  notes?: string;
  deletedAt?: string; // Date d'annulation pour traçabilité
}

export interface VRData {
  id: string;
  immatriculation: string;
  marque: string;
  modele: string;
  vin?: string;
  dateMiseEnCirculation: string;
  typeCarburant: string;
  niveauCarburant: string; 
  kilometrage: number;
  observations?: string;
  proprietaire?: string;
  numContrat?: string;
  kmMax?: number;
  dateEcheanceContrat?: string;
  isVisible: boolean;
  slotPosition: number;
}

export interface VRBooking {
  id: string;
  vrId: string; 
  clientName: string;
  startDate: string; 
  startHour: string; 
  endDate: string;   
  endHour: string;   
  startMileage?: number;
  endMileage?: number;
  startFuel?: string; 
  endFuel?: string;   
  appointmentId?: string; 
  contractGenerated?: boolean;
  observations?: string;
  status?: 'active' | 'annule';
}

export interface DayData {
  date: string; 
  appointments: Appointment[];
  note?: string; 
}
