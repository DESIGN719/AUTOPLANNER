
export type LaborTimes = {
  t1: number;
  t2: number;
  tp: number;
  meca: number;
};

export type AppointmentStatus = 'NON PLANIFIE' | 'PLANIFIE' | 'EN COURS' | 'LIVRE' | 'LIVRE NON TERMINE' | 'FACTURE' | 'PAYE' | 'ANNULE';

export type PRStatus = 'none' | 'a-commander' | 'commande' | 'recu';

export interface Appointment {
  id: string;
  status: AppointmentStatus;
  clientName: string;
  immat: string;
  model: string;
  date: string; 
  appointmentHour: string; 
  exitDate?: string;
  estimatedDuration: number;
  intermediary?: string; 
  insurance: string;
  expert: string;
  workType: string;
  notes?: string;
  laborTimes: LaborTimes;
  prStatus?: PRStatus; 
  hasGeo?: boolean;
  hasClim?: boolean;
  invoiceNumber?: string;
  totalAmount?: number;
  franchise?: number;
  commission?: number;
  vrImmat?: string;
  vrInvoiceNumber?: string;
  vrInvoiceAmount?: number;
  billingDate?: string;
  paymentDate?: string;
  exitHour?: string;
  hasVr?: boolean;
  deletedAt?: string;
}

/**
 * STRUCTURE FLOTTE VR (Correspondance stricte)
 * A: ID
 * B: POSITION
 * C: VISIBLE
 * D: IMMAT.
 * E: MARQUE
 * F: MODELE
 * G: COULEUR
 * H: VIN
 * I: MISE EN CIRCULATION
 * J: ENERGIE
 * K: KILOMETRAGE
 * L: NIV. CARBURANT
 * M: NOTES
 * N: PROPRIETAIRE
 * O: NUM CONTRAT
 * P: DATE ECHEANCE
 * Q: FORFAIT KM
 */
export interface VRData {
  id: string;              // A
  slotPosition: number;    // B
  isVisible: boolean;      // C
  immatriculation: string; // D
  marque: string;          // E
  modele: string;          // F
  color?: string;          // G
  vin?: string;            // H
  firstRegistrationDate?: string; // I
  typeCarburant: string;   // J
  kilometrage: number;     // K
  niveauCarburant: string; // L
  observations?: string;   // M (NOTES)
  proprietaire?: string;   // N
  numContrat?: string;     // O
  dateEcheanceContrat?: string; // P
  kmMax?: number;          // Q
}

export type VRBookingStatus = 'RESERVE' | 'OCCUPE' | 'RETOURNE' | 'ANNULE';

/**
 * STRUCTURE MOUVEMENTS VR (Correspondance stricte)
 * A: ID
 * B: STATUT
 * C: VR
 * D: CLIENT
 * E: ADRESSE
 * F: TELEPHONE
 * G: NUMERO PC
 * H: DATE PC
 * I: AUTRE CONDUCTEUR
 * J: DATE DEPART
 * K: HEURE DEPART
 * L: DATE RETOUR
 * M: HEURE RETOUR
 * N: KM DEPART
 * O: KM RETOUR
 * P: CARB. DEPART
 * Q: CARB. RETOUR
 * R: INFOS
 * S: ID_RDV (Technique)
 */
export interface VRBooking {
  id: string;              // A
  status: VRBookingStatus; // B
  vrId: string;            // C
  clientName: string;      // D
  
  clientAddress?: string;   // E
  clientPhone?: string;     // F
  licenseNumber?: string;   // G
  licenseDate?: string;     // H
  secondaryDriver?: string; // I

  startDate: string;       // J
  startHour: string;       // K
  endDate: string;         // L
  endHour: string;         // M
  startMileage?: number;   // N
  endMileage?: number;     // O
  startFuel?: string;      // P
  endFuel?: string;        // Q
  observations?: string;   // R (INFOS)
  
  appointmentId?: string;  // S (Lien technique)
}

export interface DailyNote {
  id: string;
  date: string;
  content: string;
}

export interface DayOverride {
  date: string;
  reason: string;
}

export interface DayData {
  date: string; 
  appointments: Appointment[];
  note?: string; 
}