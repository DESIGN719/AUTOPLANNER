
/**
 * AUTOPLANNER PRO V3 - BACKEND SCRIPT
 * Version : 4.6 - VR COLUMN REORDER (A-Q)
 */

function doGet(e) {
  if (!e || !e.parameter) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: "No parameters provided."}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (e.parameter.action === "read") {
    return readData();
  }
  return ContentService.createTextOutput(JSON.stringify({status: "running"}))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    if (!e || !e.postData) return ContentService.createTextOutput(JSON.stringify({status: "error"}));
    var data = JSON.parse(e.postData.contents);
    if (data.action === "write") {
      saveData(data);
      return ContentService.createTextOutput(JSON.stringify({status: "success"})).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({status: "error"}));
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: error.toString()}));
  }
}

function readData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = { appointments: [], vrFleet: [], vrBookings: [], manualOverrides: [], dailyNotes: {} };

  // CHANTIER
  var sheetChantier = ss.getSheetByName("CHANTIER");
  if (sheetChantier) result.appointments = getDataSafe(sheetChantier).map(mapAppointmentRow);
  
  // FLOTTE VR (Mapping sécurisé A->Q, 17 colonnes)
  var sheetVR = ss.getSheetByName("FLOTTE_VR");
  if (sheetVR) {
    // On demande 17 colonnes pour inclure toutes les données jusqu'à Q
    var data = getDataSafe(sheetVR, 17);
    result.vrFleet = data.map(function(row, index) {
      return {
        id: row[0] || "",                  // A
        slotPosition: row[1] || (index + 1), // B
        isVisible: (row[2] === false || String(row[2]).toUpperCase() === "FALSE") ? false : true, // C
        immatriculation: row[3] || "",     // D
        marque: row[4] || "",              // E
        modele: row[5] || "",              // F
        color: row[6] || "",               // G
        vin: row[7] || "",                 // H
        firstRegistrationDate: formatDate(row[8]), // I
        typeCarburant: row[9] || "",       // J
        kilometrage: row[10] || 0,         // K
        niveauCarburant: row[11] || "",    // L
        observations: row[12] || "",       // M
        proprietaire: row[13] || "",       // N
        numContrat: row[14] || "",         // O
        dateEcheanceContrat: formatDate(row[15]), // P
        kmMax: row[16] || 0                // Q
      };
    });
  }

  // MOUVEMENTS VR (Mapping sécurisé A->S)
  var sheetMvts = ss.getSheetByName("MOUVEMENTS_VR");
  if (sheetMvts) {
    var data = getDataSafe(sheetMvts, 19);
    result.vrBookings = data.map(function(row) {
      return {
        id: row[0] || "",
        status: row[1] || "RESERVE",
        vrId: row[2] || "",
        clientName: row[3] || "",
        clientAddress: row[4] || "",
        clientPhone: row[5] || "",
        licenseNumber: row[6] || "",
        licenseDate: formatDate(row[7]),
        secondaryDriver: row[8] || "",
        startDate: formatDate(row[9]),
        startHour: formatTime(row[10]),
        endDate: formatDate(row[11]),
        endHour: formatTime(row[12]),
        startMileage: row[13],
        endMileage: row[14],
        startFuel: row[15],
        endFuel: row[16],
        observations: row[17] || "",
        appointmentId: row[18] || ""
      };
    });
  }

  // CONFIG
  var sheetConfig = ss.getSheetByName("CONFIG");
  if (sheetConfig) {
    getDataSafe(sheetConfig).forEach(function(row) {
      if (row[0] === "OVERRIDE") result.manualOverrides.push({ date: formatDate(row[1]), reason: row[2] });
      else if (row[0] === "NOTE") result.dailyNotes[formatDate(row[1])] = row[2];
    });
  }

  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function saveData(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  if (data.appointments) updateSheet(ss, "CHANTIER", data.appointments.map(prepareAppointmentRow));

  if (data.vrFleet) {
    var rows = data.vrFleet.map(function(vr, index) {
      return [
        vr.id,                          // A
        vr.slotPosition || (index + 1), // B
        vr.isVisible,                   // C
        vr.immatriculation || "",       // D
        vr.marque || "",                // E
        vr.modele || "",                // F
        vr.color || "",                 // G
        vr.vin || "",                   // H
        vr.firstRegistrationDate || "", // I
        vr.typeCarburant || "",         // J
        vr.kilometrage || 0,            // K
        vr.niveauCarburant || "",       // L
        vr.observations || "",          // M
        vr.proprietaire || "",          // N
        vr.numContrat || "",            // O
        vr.dateEcheanceContrat || "",   // P
        vr.kmMax || 0                   // Q
      ];
    });
    updateSheet(ss, "FLOTTE_VR", rows, 17);
  }

  if (data.vrBookings) {
    var rows = data.vrBookings.map(function(b) {
      return [
        b.id,
        b.status,
        b.vrId,
        b.clientName,
        b.clientAddress || "",
        b.clientPhone || "",
        b.licenseNumber || "",
        b.licenseDate || "",
        b.secondaryDriver || "",
        b.startDate,
        b.startHour,
        b.endDate,
        b.endHour,
        b.startMileage,
        b.endMileage,
        b.startFuel,
        b.endFuel,
        b.observations || "",
        b.appointmentId || ""
      ];
    });
    updateSheet(ss, "MOUVEMENTS_VR", rows, 19);
  }

  var configRows = [];
  if (data.manualOverrides) data.manualOverrides.forEach(o => configRows.push(["OVERRIDE", o.date, o.reason]));
  if (data.dailyNotes) for (var d in data.dailyNotes) configRows.push(["NOTE", d, data.dailyNotes[d]]);
  if (configRows.length > 0) updateSheet(ss, "CONFIG", configRows);
}

function updateSheet(ss, name, rows, minCols) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  var maxCols = sheet.getMaxColumns();
  var reqCols = Math.max(minCols || 0, (rows[0] || []).length);
  
  // Si le nombre de colonnes requis est supérieur à ce qui existe, on ajoute les colonnes manquantes
  if (reqCols > maxCols) {
    sheet.insertColumnsAfter(maxCols, reqCols - maxCols);
  }
  
  var lastRow = sheet.getLastRow();
  // Efface le contenu existant pour réécrire propre
  if (lastRow > 1) {
    // Attention : on n'efface que les colonnes qui existent
    var colsToClear = Math.min(sheet.getMaxColumns(), reqCols);
    sheet.getRange(2, 1, lastRow - 1, colsToClear).clearContent();
  }
  
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
}

// Fonction de lecture robuste qui ne plante pas si les colonnes n'existent pas encore
function getDataSafe(sheet, minCols) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return []; // Pas de données (juste header ou vide)
  
  // On lit uniquement les colonnes qui existent réellement pour éviter l'erreur "Out of bounds"
  var existingCols = sheet.getLastColumn();
  if (existingCols === 0) return [];
  
  var data = sheet.getRange(2, 1, lastRow - 1, existingCols).getValues();

  // Si on attendait plus de colonnes (minCols) que ce qui existe, on complète les lignes avec des vides en JS
  if (minCols && existingCols < minCols) {
    return data.map(function(row) {
      // On crée un tableau de la bonne taille
      var newRow = [];
      for (var i = 0; i < minCols; i++) {
        // On copie la donnée si elle existe, sinon ""
        newRow[i] = (i < row.length) ? row[i] : "";
      }
      return newRow;
    });
  }
  
  return data;
}

function prepareAppointmentRow(a) {
  return [a.id, a.status, a.clientName, a.immat, a.model, a.date, a.appointmentHour, a.exitDate, a.estimatedDuration, a.intermediary, a.insurance, a.expert, a.workType, a.notes, a.laborTimes?.t1||0, a.laborTimes?.t2||0, a.laborTimes?.meca||0, a.prStatus, a.hasGeo, a.hasClim, a.invoiceNumber, a.totalAmount, a.franchise, a.commission, a.vrImmat, a.vrInvoiceNumber, a.vrInvoiceAmount, a.billingDate, a.paymentDate];
}

function mapAppointmentRow(row) {
  // Sécurisation des index : si row[x] n'existe pas, on met ""
  var r = function(i) { return (row && i < row.length) ? row[i] : ""; };
  
  return { 
    id: r(0), status: r(1), clientName: r(2), immat: r(3), model: r(4), 
    date: formatDate(r(5)), appointmentHour: formatTime(r(6)), exitDate: formatDate(r(7)), 
    estimatedDuration: Number(r(8)) || 0, intermediary: r(9), insurance: r(10), expert: r(11), 
    workType: r(12), notes: r(13), 
    laborTimes: {t1: Number(r(14))||0, t2: Number(r(15))||0, tp: Number(r(16))||0, meca: Number(r(17))||0}, 
    prStatus: r(18), hasGeo: r(19), hasClim: r(20), invoiceNumber: r(21), 
    totalAmount: Number(r(22))||0, franchise: Number(r(23))||0, commission: Number(r(24))||0, 
    vrImmat: r(25), vrInvoiceNumber: r(26), vrInvoiceAmount: Number(r(27))||0, 
    billingDate: formatDate(r(28)), paymentDate: formatDate(r(29)) 
  };
}

function formatDate(d) { if(!d)return""; if(typeof d==='string')return d.split('T')[0]; try{return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2);}catch(e){return"";} }
function formatTime(v) { if(!v)return""; if(typeof v==='string')return v; try{return ("0"+v.getHours()).slice(-2)+":"+("0"+v.getMinutes()).slice(-2);}catch(e){return"";} }
