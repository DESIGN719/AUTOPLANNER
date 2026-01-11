
export type LaborTimes = {
  t1: number;
  t2: number;
  tp: number;
  meca: number;
};

export type AppointmentStatus = 'stock' | 'a-venir' | 'en-cours' | 'livre' | 'livre-non-termine' | 'facture' | 'paye' | 'annule';

export type PRStatus = 'none' | 'a-commander' | 'commande' | 'recu';

/**
 * Correspondance Colonnes Google Sheets (ONGLET CHANTIER) :
 * A: id
 * B: status (STATUT)
 * C: clientName (CLIENT)
 * D: immat (IMMAT.)
 * E: model (VEHICULE)
 * F: date (DATE ENTREE)
 * G: appointmentHour (HEURE ENTREE)
 * H: exitDate (DATE SORTIE)
 * I: estimatedDuration (DUREE IMMO)
 * J: intermediary (APPORTEUR)
 * K: insurance (ASSURANCE)
 * L: expert (EXPERT)
 * M: workType (TRAVAUX)
 * N: notes (INFOS)
 * O: t1 (T1)
 * P: t2 (T2)
 * Q: tp (TP)
 * R: meca (MECA)
 * S: prStatus (PR)
 * T: hasGeo (GEO)
 * U: hasClim (CLIM)
 * V: invoiceNumber (FACTURE)
 * W: totalAmount (MONTANT)
 * X: franchise (FRANCHISE)
 * Y: commission (COMMISSION)
 * Z: vrImmat (IMMAT. VR)
 * AA: vrInvoiceNumber (FACTURE VR)
 * AB: vrInvoiceAmount (MONTANT VR)
 * AC: billingDate (DATE FACTURE)
 * AD: paymentDate (DATE REGLEMENT)
 */
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
 * Correspondance Colonnes FLOTTE VR :
 * A: ID, B: MARQUE, C: MODELE, D: IMMATRICULATION, E: VIN, F: ENERGIE,
 * G: KILOMETRAGE, H: NIV. CARBURANT, I: PROPRIETAIRE, J: NUM CONTRAT,
 * K: DATE ECHEANCE, L: FORFAIT KM, M: NOTE
 */
export interface VRData {
  id: string;
  marque: string;
  modele: string;
  immatriculation: string;
  vin?: string;
  typeCarburant: string;
  kilometrage: number;
  niveauCarburant: string;
  proprietaire?: string;
  numContrat?: string;
  dateEcheanceContrat?: string;
  kmMax?: number;
  observations?: string;
  isVisible: boolean;
  slotPosition: number;
}

/**
 * Correspondance Colonnes MOUVEMENTS VR :
 * A: ID, B: STATUT, C: VR, D: CLIENT, E: DATE DEPART, F: HEURE DEPART,
 * G: DATE RETOUR, H: HEURE RETOUR, I: KM DEPART, J: KM RETOUR,
 * K: CARB. DEPART, L: CARB. RETOUR, M: INFOS
 */
export interface VRBooking {
  id: string;              // A
  status: 'active' | 'annule'; // B
  vrId: string;            // C
  clientName: string;      // D
  startDate: string;       // E
  startHour: string;       // F
  endDate: string;         // G
  endHour: string;         // H
  startMileage?: number;   // I
  endMileage?: number;     // J
  startFuel?: string;      // K
  endFuel?: string;        // L
  observations?: string;   // M
  
  // Champs internes techniques
  appointmentId?: string; 
  contractGenerated?: boolean;
}

export interface DailyNote {
  id: string;    // A
  date: string;  // B
  content: string; // C
}

export interface DayData {
  date: string; 
  appointments: Appointment[];
  note?: string; 
}
