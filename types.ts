
export type LaborTimes = {
  t1: number;
  t2: number;
  tp: number;
  meca: number;
};

export type AppointmentStatus = 'stock' | 'a-venir' | 'en-cours' | 'livre' | 'livre-non-termine' | 'facture' | 'paye' | 'annule';

export type PRStatus = 'none' | 'a-commander' | 'commande' | 'recu';

/**
 * Correspondance Colonnes Google Sheets :
 * A: id, B: status, C: clientName, D: immat, E: model, F: date, G: appointmentHour, 
 * H: exitDate, I: estimatedDuration, J: intermediary, K: insurance, L: expert, 
 * M: workType, N: notes, O: t1, P: t2, Q: tp, R: meca, S: prStatus, T: hasGeo, 
 * U: hasClim, V: invoiceNumber, W: totalAmount, X: franchise, Y: commission, 
 * Z: vrImmat, AA: vrInvoiceNumber, AB: vrInvoiceAmount, AC: billingDate, AD: paymentDate
 */
export interface Appointment {
  // A - E
  id: string;
  status: AppointmentStatus;
  clientName: string;
  immat: string;
  model: string;
  
  // F - I
  date: string; 
  appointmentHour: string; 
  exitDate?: string;
  estimatedDuration: number; // Durée Immo en jours
  
  // J - N
  intermediary?: string; 
  insurance: string;
  expert: string;
  workType: string;
  notes?: string;

  // O - R
  laborTimes: LaborTimes;
  
  // S - U
  prStatus?: PRStatus; 
  hasGeo?: boolean;
  hasClim?: boolean;
  
  // V - Y
  invoiceNumber?: string;
  totalAmount?: number; // Montant Travaux HT
  franchise?: number;
  commission?: number;
  
  // Z - AB
  vrImmat?: string;
  vrInvoiceNumber?: string;
  vrInvoiceAmount?: number;
  
  // AC - AD
  billingDate?: string;
  paymentDate?: string;

  // Champs utilitaires UI
  exitHour?: string;
  hasVr?: boolean;
  deletedAt?: string;
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
