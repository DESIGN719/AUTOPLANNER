
import { jsPDF } from "jspdf";
import { VRBooking, VRData } from "./types";

// --- CONFIGURATION DE L'ENTREPRISE (A MODIFIER) ---
const COMPANY_INFO = {
  name: "GARAGE AUTOPLANNER",
  address: "123 Avenue de la Mécanique",
  city: "75000 PARIS",
  phone: "01 23 45 67 89",
  email: "contact@autoplanner.pro",
  siret: "SIRET: 123 456 789 00012"
};

// --- CONFIGURATION DU DOCUMENT ---
const MARGIN = 15;
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);
const COLOR_PRIMARY = "#2563eb"; // Bleu
const COLOR_GRAY_BG = "#f8fafc"; // Gris très clair
const COLOR_TEXT = "#0f172a";    // Gris foncé

export const generateVRContract = (booking: VRBooking, vehicle: VRData | undefined) => {
  const doc = new jsPDF();
  
  // Variable curseur vertical (commence en haut)
  let currentY = 20;

  // --- UTILITAIRES ---
  const moveCursor = (amount: number) => { currentY += amount; };
  
  const checkPageBreak = (spaceNeeded: number) => {
    if (currentY + spaceNeeded > 280) {
      doc.addPage();
      currentY = 20;
    }
  };

  const drawSectionTitle = (number: string, title: string) => {
    checkPageBreak(15);
    doc.setFillColor(240, 240, 240);
    doc.rect(MARGIN, currentY, CONTENT_WIDTH, 7, 'F');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(`${number}. ${title}`, MARGIN + 2, currentY + 5);
    moveCursor(12);
  };

  // --- 1. EN-TÊTE ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(COLOR_PRIMARY);
  doc.text("CONTRAT DE PRÊT", PAGE_WIDTH / 2, currentY, { align: "center" });
  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text("VÉHICULE DE REMPLACEMENT", PAGE_WIDTH / 2, currentY + 6, { align: "center" });
  
  // Cadre infos société (Haut Gauche)
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(COMPANY_INFO.name, MARGIN, currentY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(COMPANY_INFO.address, MARGIN, currentY + 4);
  doc.text(COMPANY_INFO.city, MARGIN, currentY + 8);
  doc.text(COMPANY_INFO.phone, MARGIN, currentY + 12);
  
  moveCursor(25);

  // --- 2. OBJET ---
  drawSectionTitle("1", "OBJET DU DOCUMENT");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const textObjet = "Le présent document encadre le prêt d'un véhicule de remplacement par le réparateur au client, pendant la durée d'immobilisation de son véhicule. Ce prêt est accordé à titre temporaire et n'est pas assimilable à une location commerciale.";
  const splitObjet = doc.splitTextToSize(textObjet, CONTENT_WIDTH);
  doc.text(splitObjet, MARGIN, currentY);
  moveCursor(splitObjet.length * 4 + 4);

  // --- 3. IDENTIFICATION ---
  drawSectionTitle("2", "IDENTIFICATION DES PARTIES");
  
  const colWidth = CONTENT_WIDTH / 2 - 5;
  const col2X = MARGIN + colWidth + 10;
  const startYIdent = currentY;

  // Prêteur
  doc.setFont("helvetica", "bold");
  doc.text("LE PRÊTEUR (Le garage)", MARGIN, currentY);
  doc.setFont("helvetica", "normal");
  doc.text(COMPANY_INFO.name, MARGIN, currentY + 5);
  doc.text(COMPANY_INFO.siret, MARGIN, currentY + 9);
  
  // Emprunteur
  doc.setFont("helvetica", "bold");
  doc.text("L'EMPRUNTEUR (Le client)", col2X, currentY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text((booking.clientName || "CLIENT INCONNU").toUpperCase(), col2X, currentY + 6);
  
  doc.setFontSize(8);
  // Logique : Si champ rempli, on l'affiche, sinon on affiche des pointillés pour remplissage manuel
  const addressLine = booking.clientAddress ? `Adresse : ${booking.clientAddress}` : "Adresse : ............................................................................";
  const addressLine2 = booking.clientAddress ? "" : "..............................................................................................";
  const phoneLine = booking.clientPhone ? `Tél : ${booking.clientPhone}` : "Tél : ......................................................................................";
  
  let licenseText = "Permis N° : ..........................................................................";
  if (booking.licenseNumber) {
    licenseText = `Permis N° : ${booking.licenseNumber}`;
    if (booking.licenseDate) {
        licenseText += ` (Délivré le ${new Date(booking.licenseDate).toLocaleDateString('fr-FR')})`;
    }
  }

  doc.text(addressLine, col2X, currentY + 12);
  if (!booking.clientAddress) doc.text(addressLine2, col2X, currentY + 16);
  doc.text(phoneLine, col2X, currentY + 22);
  doc.text(licenseText, col2X, currentY + 28);
  
  if (booking.secondaryDriver) {
      doc.text(`Conducteur secondaire : ${booking.secondaryDriver}`, col2X, currentY + 34);
  } else {
      doc.text("Conducteur secondaire : ..........................................................", col2X, currentY + 34);
  }
  
  moveCursor(40);

  // --- 4. VÉHICULE & ÉTAT ---
  drawSectionTitle("3", "VÉHICULE ET ÉTAT DES LIEUX");
  
  // Cadre gris pour le véhicule
  doc.setFillColor(COLOR_GRAY_BG);
  doc.roundedRect(MARGIN, currentY, CONTENT_WIDTH, 25, 2, 2, 'F');
  
  if (vehicle) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`${vehicle.marque} ${vehicle.modele}`, MARGIN + 5, currentY + 7);
    doc.setFontSize(14);
    doc.text(`${vehicle.immatriculation}`, MARGIN + 5, currentY + 14);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const infoX = MARGIN + 80;
    doc.text(`Carburant : ${vehicle.typeCarburant}`, infoX, currentY + 6);
    doc.text(`VIN : ${vehicle.vin || 'Non renseigné'}`, infoX, currentY + 11);
    doc.text(`Assurance : Couvert par le garage`, infoX, currentY + 16);
  } else {
    doc.text("Véhicule non identifié", MARGIN + 5, currentY + 10);
  }
  
  moveCursor(30);

  // Tableau Départ / Retour
  const tableY = currentY;
  const col1 = MARGIN;
  const col2 = MARGIN + 90;
  
  // Entêtes Colonnes
  doc.setFont("helvetica", "bold");
  doc.text("DÉPART (Mise à disposition)", col1, currentY);
  doc.text("RETOUR (Restitution)", col2, currentY);
  moveCursor(6);
  
  // Ligne Date/Heure
  doc.setFont("helvetica", "normal");
  const dateDep = new Date(booking.startDate).toLocaleDateString('fr-FR');
  doc.text(`Date : ${dateDep} à ${booking.startHour}`, col1, currentY);
  doc.text(`Date prévue : ${new Date(booking.endDate).toLocaleDateString('fr-FR')} à ${booking.endHour}`, col2, currentY);
  moveCursor(6);

  // Ligne KM
  doc.text(`Km départ : ${booking.startMileage || '_______'} km`, col1, currentY);
  doc.text(`Km retour : _______ km`, col2, currentY);
  moveCursor(6);

  // Ligne Carburant (Jauges visuelles)
  const drawGauge = (x: number, level: string | undefined) => {
    const levels = ["R", "1/4", "1/2", "3/4", "F"];
    let xPos = x;
    doc.setFontSize(7);
    doc.text("Carburant:", x, currentY);
    xPos += 15;
    levels.forEach(l => {
        const isSelected = level && (
            (l === "F" && (level === "Full" || level === "Plein")) ||
            (l === "R" && (level === "Réserve")) ||
            (l === level)
        );
        
        doc.rect(xPos, currentY - 2.5, 3, 3); // Checkbox
        if (isSelected) {
            doc.setFont("zapfdingbats");
            doc.text("4", xPos + 0.3, currentY); // Checkmark symbol
            doc.setFont("helvetica", "normal");
        }
        doc.text(l, xPos + 4, currentY);
        xPos += 12;
    });
    doc.setFontSize(9);
  };

  drawGauge(col1, booking.startFuel);
  drawGauge(col2, undefined); // Vide pour le retour
  moveCursor(10);

  // Zone Observations / Schéma
  doc.setDrawColor(200);
  doc.rect(MARGIN, currentY, CONTENT_WIDTH, 40); // Grand cadre vide
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text("Indiquer ci-dessous les dommages existants (rayures, chocs...) ou observations :", MARGIN + 2, currentY + 4);
  
  // Remplissage auto si obs
  if (booking.observations) {
      doc.setTextColor(0);
      doc.setFontSize(9);
      doc.text(booking.observations, MARGIN + 2, currentY + 10, { maxWidth: CONTENT_WIDTH - 4 });
  }

  moveCursor(45);

  // --- 5. CONDITIONS & ENGAGEMENT ---
  drawSectionTitle("4", "CONDITIONS & RESPONSABILITÉS");
  doc.setFontSize(7);
  const terms = [
      "- Le véhicule est assuré par le garage pour un usage normal. En cas de sinistre responsable ou sans tiers identifié, une franchise reste à la charge du client (Montant max: 2000€ TTC).",
      "- Le client s'engage à utiliser le véhicule en bon père de famille, à ne pas le sous-louer, et à respecter le code de la route.",
      "- Toutes les contraventions établies pendant la durée du prêt sont à la charge exclusive du client.",
      "- Le véhicule doit être restitué avec le même niveau de carburant. Tout écart sera facturé."
  ];
  
  terms.forEach(term => {
      const splitTerm = doc.splitTextToSize(term, CONTENT_WIDTH);
      doc.text(splitTerm, MARGIN, currentY);
      moveCursor(splitTerm.length * 3 + 2);
  });
  
  moveCursor(5);

  // --- 6. SIGNATURES ---
  // Ligne de séparation pointillée
  doc.setLineDashPattern([1, 1], 0);
  doc.line(MARGIN, currentY, PAGE_WIDTH - MARGIN, currentY);
  doc.setLineDashPattern([], 0);
  moveCursor(5);

  const todayDate = new Date().toLocaleDateString('fr-FR');
  doc.setFontSize(9);
  doc.text(`Fait à ${COMPANY_INFO.city}, le ${todayDate}`, MARGIN, currentY);
  moveCursor(8);

  // Cadres signatures
  const sigBoxY = currentY;
  const sigBoxH = 30;
  
  // Garage
  doc.rect(MARGIN, sigBoxY, 85, sigBoxH);
  doc.setFont("helvetica", "bold");
  doc.text("LE GARAGE", MARGIN + 2, sigBoxY + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("(Cachet et Signature)", MARGIN + 2, sigBoxY + 9);

  // Client
  doc.rect(MARGIN + 95, sigBoxY, 85, sigBoxH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("LE CLIENT", MARGIN + 97, sigBoxY + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("(Précédé de 'Bon pour accord')", MARGIN + 97, sigBoxY + 9);

  // --- SAUVEGARDE ---
  const safeClientName = (booking.clientName || "Client").replace(/[^a-z0-9]/gi, '_');
  const fileName = `CONTRAT_VR_${safeClientName}_${booking.startDate}.pdf`;
  doc.save(fileName);
};
