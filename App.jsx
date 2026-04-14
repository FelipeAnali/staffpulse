const { useState, useMemo, useRef, useEffect } = React;
const {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis
} = Recharts;


/* Fuente moderna */
const _fontLink = document.createElement("link");
_fontLink.rel = "stylesheet";
_fontLink.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";
document.head.appendChild(_fontLink);

/* === THEME: SUPERTIENDAS CAÑAVERAL === */
var C = {
  /* surfaces */
  bg:"#f0f5f1",sf:"#ffffff",sa:"#f7fbf8",bd:"#daeade",bd2:"#c3d9c9",
  /* brand */
  p:"#1f6b2e",pd:"#165022",pl:"#2d8a41",pg:"rgba(31,107,46,0.08)",ph:"rgba(31,107,46,0.14)",
  /* accent & states */
  s:"#0284c7",ac:"#c47a0a",dg:"#dc2626",
  /* text */
  t:"#111a14",tm:"#344e3a",td:"#6b7f70",
  /* legacy compat */
  w:"#111a14",bg2:"#4ade80",lg:"#166534",
  /* sidebar */
  nav:"#060f08",navSf:"#0a1a0d",navBd:"rgba(74,222,128,0.08)",
  navT:"#ecfdf0",navTm:"#7aab85",navAct:"#4ade80",
  /* util */
  zebra:"rgba(31,107,46,0.03)",gridHi:"rgba(31,107,46,0.11)",btnTxt:"#fff"
};

var USERS={admin:{pw:"admin2026",role:"admin",name:"Administrador"},supervisor:{pw:"super2026",role:"supervisor",name:"Supervisor"},gerencia:{pw:"gerencia2026",role:"gerencia",name:"Gerencia"}};

var HC=["0:00","4:00","5:00","6:00","7:00","8:00","9:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00","22:00","23:00"];
var HL=["12am","4am","5am","6am","7am","8am","9am","10am","11am","12pm","1pm","2pm","3pm","4pm","5pm","6pm","7pm","8pm","9pm","10pm","11pm"];


/* === TIME PARSING === 
   SheetJS sin cellDates devuelve horas como fraccion del dia (0 a 1)
   Ej: 5:46 AM = 0.2403, 13:29 = 0.5618
   Con cellDates devuelve Date objects
   Tambien puede venir como string "5:46:00"
*/
function parseHora(val) {
  if (val == null) return 0;
  // Es un numero fraccionario (SheetJS default) 
  if (typeof val === "number") {
    if (val >= 0 && val <= 1) return val * 24; // fraccion del dia -> horas
    if (val > 1 && val <= 24) return val; // ya es horas
    return 0;
  }
  // Es un Date object (SheetJS con cellDates:true)
  if (typeof val === "object" && val !== null) {
    if (typeof val.getHours === "function") {
      return val.getHours() + val.getMinutes() / 60;
    }
    return 0;
  }
  // Es un string "HH:MM" o "HH:MM:SS"
  if (typeof val === "string") {
    var m = val.match(/(\d+):(\d+)/);
    if (m) return parseInt(m[1]) + parseInt(m[2]) / 60;
  }
  return 0;
}

/* === NORMALIZACIÓN DE NOMBRES DE SEDE ===
   Unifica: "SC VILLANUEVA"="VILLANUEVA", "SCVILLAGORGONA"="VILLAGORGONA",
            "S.C. ZARZAL"="ZARZAL", "S C PALMIRA"="PALMIRA", etc. */
function normSede(raw) {
  if (!raw) return "";
  var s = String(raw).trim().toUpperCase().replace(/\s+/g, " ");
  // Quitar cualquier variante del prefijo primero
  s = s.replace(/^S\.C\.\s*/, "");    // S.C. VILLANUEVA  → VILLANUEVA
  s = s.replace(/^S\.C\s*/, "");    // S.C VILLANUEVA   → VILLANUEVA
  s = s.replace(/^S C\s+/, "");       // S C VILLANUEVA   → VILLANUEVA
  s = s.replace(/^SC\s+/, "");        // SC VILLANUEVA    → VILLANUEVA
  s = s.replace(/^SC(?=[A-Z\u00C0-\u00FF])/, ""); // SCVILLAGORGONA → VILLAGORGONA
  s = s.trim();
  // Ahora siempre agregar "SC " al inicio
  return "SC " + s;                   // → SC VILLANUEVA, SC ZARZAL, SC PASOANCHO
}

/* === PROCESS BASE DE DATOS MARCACIONES === */
function procBase(rows) {
  if (!rows || rows.length < 2) return [];
  
  // Mapear headers
  const headers = rows[0] || [];
  const colMap = {};
  for (let i = 0; i < headers.length; i++) {
    if (headers[i] != null) colMap[String(headers[i]).trim().toUpperCase()] = i;
  }
  
  const iID = colMap["IDENTIFICACION"] != null ? colMap["IDENTIFICACION"] : colMap["CODEMPLEADO"];
  const iNombre = colMap["EMPLEADO"];
  const iFecha = colMap["FECHA"];
  const iHora = colMap["HORA"];
  const iFuncion = colMap["FUNCION"];
  const iDep = colMap["DEPENDENCIA"];
  const iCargo = colMap["CARGO"];
  const iCCosto = colMap["CENTROCOSTO"];

  if (iID == null || iFecha == null || iHora == null || iFuncion == null) {
    console.error("Columnas faltantes:", headers);
    return [];
  }

  // Agrupar por empleado+fecha
  const grouped = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const id = String(row[iID] || "").trim();
    /* Fecha: puede ser string "2026.01.02", Date object, o serial number de Excel */
    let fechaRaw = row[iFecha];
    let fecha;
    if (typeof fechaRaw === "number" && fechaRaw > 40000) {
      /* Excel serial number: convertir a YYYY.MM.DD */
      const d = new Date((fechaRaw - 25569) * 86400000);
      fecha = d.getFullYear() + "." + String(d.getMonth()+1).padStart(2,"0") + "." + String(d.getDate()).padStart(2,"0");
    } else if (fechaRaw && typeof fechaRaw === "object" && typeof fechaRaw.getFullYear === "function") {
      /* Date object de SheetJS con cellDates */
      fecha = fechaRaw.getFullYear() + "." + String(fechaRaw.getMonth()+1).padStart(2,"0") + "." + String(fechaRaw.getDate()).padStart(2,"0");
    } else {
      fecha = String(fechaRaw || "").trim();
    }
    if (!id || !fecha) continue;
    const key = id + "|" + fecha;
    if (!grouped[key]) {
      grouped[key] = {
        id, nombre: String(row[iNombre] || "").trim(), fecha,
        dep: normSede(row[iDep]), cargo: String(row[iCargo] || "").trim(),
        ccosto: String(row[iCCosto] || "").trim(), marcaciones: [],
      };
    }
    grouped[key].marcaciones.push({ hora: parseHora(row[iHora]), funcion: String(row[iFuncion] || "").trim().toUpperCase() });
  }

  const diasSem = ["Domingo","Lunes","Martes","Miercoles","Jueves","Viernes","Sabado"];
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  
  /* -- UMBRALES DE CLASIFICACION DE BREAKS --
     < 45 min        = BREAK CORTO (normal, politica dice max 15min + 3min tolerancia = 18min)
     >= 45min < 170min = TURNO PARTIDO ILEGAL (no cumple minimo legal de 2h50m)
     >= 170min        = TURNO PARTIDO LEGAL (cumple el minimo de 2 horas con 50 minutos)
  */
  const UMBRAL_TURNO_PARTIDO = 45;  // minutos: de aqui para arriba es turno partido
  const UMBRAL_TP_LEGAL = 170;      // minutos: 2h50m = turno partido legal
  
  const results = [];
  const fmtH = (h) => h !== null ? Math.floor(h) + ":" + String(Math.round((h % 1) * 60)).padStart(2, "0") : "-";

  Object.values(grouped).forEach((emp) => {
    emp.marcaciones.sort((a, b) => a.hora - b.hora);

    let entrada = null, salida = null;
    const breakPairs = [];
    let breakOutH = null;

    for (const marc of emp.marcaciones) {
      const h = marc.hora;
      const fn = marc.funcion;

      if (fn === "ENTRADA" && entrada === null) entrada = h;
      if (fn === "SALIDA") salida = h;
      if (fn === "FALLIDA") continue;

      // SALIDA A BREAK / SALIDA A BREAK 1 / SALIDA A BREAK 2
      if (fn.startsWith("SALIDA A BREAK")) {
        breakOutH = h;
      }
      
      // LLEGADA DE BREAK / LLEGADA DE BREAK 1 / LLEGADA DE BREAK 2
      if (fn.startsWith("LLEGADA DE BREAK") && breakOutH !== null) {
        const duracionMin = Math.round((h - breakOutH) * 60);
        
        let tipo;
        if (duracionMin < UMBRAL_TURNO_PARTIDO) {
          tipo = "BREAK_CORTO";
        } else if (duracionMin < UMBRAL_TP_LEGAL) {
          tipo = "TP_ILEGAL";
        } else {
          tipo = "TP_LEGAL";
        }

        breakPairs.push({
          salidaH: breakOutH, llegadaH: h,
          duracionMin: Math.max(0, duracionMin), tipo,
        });
        breakOutH = null;
      }
    }

    // -- Clasificar breaks --
    const breaksCortos = breakPairs.filter((b) => b.tipo === "BREAK_CORTO");
    const todosTP = breakPairs.filter((b) => b.tipo === "TP_LEGAL" || b.tipo === "TP_ILEGAL");
    const tpLegales = breakPairs.filter((b) => b.tipo === "TP_LEGAL");
    const tpIlegales = breakPairs.filter((b) => b.tipo === "TP_ILEGAL");

    const totalBreakCortoMin = breaksCortos.reduce((s, b) => s + b.duracionMin, 0);
    const totalTPMin = todosTP.reduce((s, b) => s + b.duracionMin, 0);
    const totalBreakH = breakPairs.reduce((s, b) => s + b.duracionMin, 0) / 60;
    const breakCortoMaxMin = breaksCortos.length > 0 ? Math.max(...breaksCortos.map((b) => b.duracionMin)) : 0;

    // -- Tipo de jornada --
    let tipo = "Jorn Con";
    if (entrada === null && salida === null) tipo = "Sin Marcacion";
    else if (tpLegales.length > 0) tipo = "Tur Par Legal";
    else if (tpIlegales.length > 0) tipo = "Tur Par Ilegal";
    
    // -- Grilla horaria (excluyendo bloques de turno partido de la presencia) --
    const hg = {};
    for (const hc of HC) hg[hc] = 0;
    
    if (entrada !== null && salida !== null && salida > entrada) {
      for (const hc of HC) {
        const hNum = parseInt(hc.split(":")[0]);
        if (hNum >= Math.floor(entrada) && hNum < Math.ceil(salida)) {
          let enBreakTP = false;
          for (const bp of breakPairs) {
            if (bp.duracionMin >= UMBRAL_TURNO_PARTIDO && hNum >= Math.floor(bp.salidaH) && hNum < Math.ceil(bp.llegadaH)) {
              enBreakTP = true;
              break;
            }
          }
          hg[hc] = enBreakTP ? 0 : 1;
        }
      }
    }
    
    const totalH = (entrada !== null && salida !== null) ? Math.max(0, salida - entrada - totalBreakH) : 0;
    
    // -- Parsear fecha --
    let dObj = null;
    const fs = String(emp.fecha);
    if (typeof emp.fecha === "number" && emp.fecha > 40000) {
      // Excel serial number: days since 1899-12-30
      dObj = new Date((emp.fecha - 25569) * 86400000);
    } else if (fs.includes(".")) {
      const parts = fs.split(".");
      dObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    } else if (fs.includes("-")) {
      dObj = new Date(fs);
    } else if (fs.includes("/")) {
      const parts = fs.split("/");
      dObj = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
    
    let dsm = "", me = "", di = "", sem = "";
    if (dObj && !isNaN(dObj.getTime())) {
      dsm = diasSem[dObj.getDay()];
      me = meses[dObj.getMonth()];
      di = dObj.getDate();
      const sw = new Date(dObj);
      const dw = dObj.getDay() === 0 ? 7 : dObj.getDay();
      sw.setDate(dObj.getDate() - dw + 1);
      const ew = new Date(sw);
      ew.setDate(sw.getDate() + 6);
      sem = sw.getDate() + " AL " + ew.getDate() + " DE " + meses[sw.getMonth()].toUpperCase() + " " + sw.getFullYear();
    }
    
    // -- Quincena retail --
    let esQuincena = "No";
    if (di) {
      const dNum = Number(di);
      const mesIdx = dObj ? dObj.getMonth() : -1;
      if ([1,2,3,15,16,17,30,31].includes(dNum)) esQuincena = "Si";
      if (mesIdx === 1 && dNum === 28) esQuincena = "Si";
    }
    
    // -- Detalle de breaks (para tabla y politicas) --
    const breakDetalle = breakPairs.map((b) => {
      const tipoLabel = b.tipo === "BREAK_CORTO" ? "Corto" : b.tipo === "TP_LEGAL" ? "TP Legal" : "TP Ilegal";
      return fmtH(b.salidaH) + "-" + fmtH(b.llegadaH) + " (" + b.duracionMin + "min " + tipoLabel + ")";
    }).join(" | ");
    
    const record = {
      IDENTIFICACION: emp.id, EMPLEADO: emp.nombre, DEPENDENCIA: emp.dep,
      CARGO: emp.cargo, CENTROCOSTO: emp.ccosto, FECHA: emp.fecha,
      TIPO_JORNADA: tipo,
      TOTAL_HORAS: Math.round(totalH * 100) / 100,
      TOTAL_BREAK: Math.round(totalBreakH * 100) / 100,
      // -- Detalle de breaks --
      BREAKS_CORTOS: breaksCortos.length,
      BREAK_CORTO_TOTAL_MIN: totalBreakCortoMin,
      BREAK_CORTO_MAX_MIN: breakCortoMaxMin,
      TURNOS_PARTIDOS: todosTP.length,
      TP_LEGALES: tpLegales.length,
      TP_ILEGALES: tpIlegales.length,
      TP_TOTAL_MIN: totalTPMin,
      BREAK_DETALLE: breakDetalle,
      BREAK_PAIRS: breakPairs,
      // -- Compat --
      TURNO_PARTIDO: todosTP.length,
      MES: me, DIA: di, DIA_SEMANA: dsm, SEMANA: sem,
      ENTRADA_H: fmtH(entrada), SALIDA_H: fmtH(salida),
      QUINCENA: esQuincena,
    };
    for (const hc of HC) record[hc] = hg[hc];
    results.push(record);
  });
  
  return results;
}

/* === PROCESS FACTURAS === */
function procFact(rows) {
  if (!rows || rows.length < 2) return [];
  /* Mapear columnas por nombre de header en vez de posición fija */
  var headers = (rows[0]||[]).map(function(h){ return String(h||"").trim().toUpperCase(); });
  var iSeccion = headers.findIndex(function(h){ return h.indexOf("DESC_CRI")>=0 || h.indexOf("SECCION")>=0; });
  var iClase   = headers.findIndex(function(h){ return h === "CLASE"; });
  var iSede    = headers.findIndex(function(h){ return h.indexOf("F285")>=0 || h.indexOf("SEDE")>=0 || h.indexOf("DESCRIPCION")>=0; });
  var iHora    = headers.findIndex(function(h){ return h === "HORAS" || h === "HORA"; });
  var iMes     = headers.findIndex(function(h){ return h.indexOf("MES")>=0; });
  var iDia     = headers.findIndex(function(h){ return h.indexOf("DÍA")>=0 || h.indexOf("DIA")>=0; });
  var iNFact   = headers.findIndex(function(h){ return h.indexOf("# FACT")>=0 || h.indexOf("FACT")>=0 && h.indexOf("FECHA")<0; });
  var iCantReg = headers.findIndex(function(h){ return h.indexOf("CANT REG")>=0 || h.indexOf("CANT_REG")>=0; });
  var iVenta   = headers.findIndex(function(h){ return h === "VENTA" || h.indexOf("VENTA")>=0; });
  
  /* Fallback a posiciones fijas si no se encuentran headers */
  if (iSeccion < 0) iSeccion = 0;
  if (iClase < 0) iClase = 1;
  if (iSede < 0) iSede = 2;
  if (iHora < 0) iHora = 3;
  if (iMes < 0) iMes = 4;
  if (iDia < 0) iDia = 5;
  if (iNFact < 0) iNFact = 6;
  if (iVenta < 0) iVenta = headers.length - 1;

  var results = [];
  for (var i = 1; i < rows.length; i++) {
    var w = rows[i];
    if (!w) continue;
    var hora = w[iHora], mes = w[iMes], dia = w[iDia], nf = w[iNFact];
    if (hora != null && !isNaN(Number(hora)) && String(hora) !== "Total"
      && mes != null && String(mes) !== "Total"
      && dia != null && String(dia) !== "Total"
      && nf != null && String(nf) !== "Total") {
      results.push({seccion:String(w[iSeccion]||""),clase:String(w[iClase]||""),sede:normSede(w[iSede]),hora:Number(hora),mes:String(mes),dia:Number(dia)||0,nfact:Number(nf)||0,venta:Number(w[iVenta])||0});
    }
  }
  return results;
}

/* === BUILD CHART DATA === */
// Precalcular los índices numéricos de HC una sola vez
var HC_NUM = HC.map(function(hc){ return parseInt(hc.split(":")[0]); });

function buildChart(marc, fact, f) {
  // -- Aplicar todos los filtros en UN SOLO recorrido sobre marcaciones --
  const quincenaVal = f.quincena && f.quincena !== "Todos" ? (f.quincena === "Quincena" ? "Si" : "No") : null;
  const fm = marc.filter(function(m) {
    if (f.sede    !== "Todas"  && m.DEPENDENCIA  !== f.sede)    return false;
    if (f.seccion !== "Todas"  && m.CENTROCOSTO  !== f.seccion) return false;
    if (f.mes     !== "Todos"  && m.MES          !== f.mes)     return false;
    if (f.dsem    !== "Todos"  && m.DIA_SEMANA   !== f.dsem)    return false;
    if (f.semana  !== "Todas"  && m.SEMANA       !== f.semana)  return false;
    if (f.dia     !== "Todos"  && String(m.DIA)  !== f.dia)     return false;
    if (quincenaVal !== null   && m.QUINCENA     !== quincenaVal) return false;
    return true;
  });

  // -- Filtrar facturas en un solo recorrido --
  const ff = fact.filter(function(x) {
    if (f.sede  !== "Todas" && x.sede  !== f.sede)  return false;
    if (f.clase !== "Todas" && x.clase !== f.clase) return false;
    if (f.mes   !== "Todos" && x.mes   !== f.mes)   return false;
    return true;
  });

  // -- Contar fechas únicas una sola vez --
  const fechasSet = {};
  fm.forEach(function(m){ fechasSet[m.FECHA] = true; });
  const nd = Object.keys(fechasSet).length || 1;

  // -- Acumular colaboradores por hora en un solo recorrido --
  const coByHora = new Float64Array(HC.length); // array tipado, más rápido que objeto
  fm.forEach(function(m) {
    for (var i = 0; i < HC.length; i++) coByHora[i] += (m[HC[i]] || 0);
  });

  // -- Acumular transacciones por hora en un solo recorrido --
  const ttByHora  = new Float64Array(HC.length);
  const dfByHora  = new Array(HC.length).fill(null).map(function(){ return {}; });
  ff.forEach(function(x) {
    var idx = HC_NUM.indexOf(x.hora);
    if (idx >= 0) {
      ttByHora[idx] += x.nfact;
      dfByHora[idx][x.dia + x.mes] = true;
    }
  });

  return HC.map(function(hc, i) {
    var df = Object.keys(dfByHora[i]).length || 1;
    return {
      hora: HL[i],
      colaboradores: Math.round(coByHora[i] / nd * 10) / 10,
      transacciones: Math.round(ttByHora[i] / df * 10) / 10,
    };
  });
}

/* === PARAMETROS DE POLITICAS (DEFAULTS EDITABLES) === */
/* === PARAMETROS DE POLITICAS (DEFAULTS EDITABLES) === */
const PARAMS_DEFAULT = {
  jornadaNormal: 7,           // Horas de jornada normal
  jornadaMaxDia: 9,           // Max horas que puede trabajar en un dia (pol 3)
  jornadaExtendidaHoras: 10,  // Umbral para jornada extendida sin descanso (pol 1)
  breakMinimoMin: 8,          // Break minimo en minutos (pol 2)
  breakNormalMax: 15,         // Break corto permitido (15min, pol 2 referencia)
  breakTolerancia: 3,         // Tolerancia adicional sobre el break normal
  breakMaxPermitido: 45,      // Break corto maximo (>esto = turno partido) (pol 5)
  turnoPartidoLegalMin: 170,  // Min para TP legal: 2h50m = 170min
  turnoPartidoMaxSemana: 2,   // Max turnos partidos por semana (pol 4)
  turnoPartidoAplicaCargos: "",
  domingoMaxSupervisores: 2,  // Max domingos/mes para supervisores (pol 6)
  cargosSupervisor: "SUPERVISOR,COORDINADOR,ADMINISTRADOR",
  domingoMinDescansoBase: 1,  // Min domingos libres/mes para personal base (pol 7)
  horasExtraMaxDia: 2,        // Max HE por dia (pol 9)
  horasExtraMaxSemana: 12,    // Max HE por semana (pol 8)
};

/* === DEFINICION DE LAS 9 POLITICAS === */
const POLITICAS_DEF = [
  { id: "JEX", num: 1, nombre: "Jornadas Extendidas sin Descanso", icono: "!",
    descFn: function(p) { return "Jornada mayor a " + p.jornadaExtendidaHoras + "h con break menor a " + p.breakMinimoMin + "min"; } },
  { id: "BRK", num: 2, nombre: "Break Menor al Minimo", icono: "*",
    descFn: function(p) { return "Break corto inferior a " + p.breakMinimoMin + " minutos (normal: " + p.breakNormalMax + "min + " + p.breakTolerancia + "min tol)"; } },
  { id: "JXC", num: 3, nombre: "Jornadas Excesivas", icono: "#",
    descFn: function(p) { return "Jornada normal " + p.jornadaNormal + "h, max permitido " + p.jornadaMaxDia + "h/dia"; } },
  { id: "TPE", num: 4, nombre: "Turnos Partidos Excesivos", icono: "%",
    descFn: function(p) { return "Max " + p.turnoPartidoMaxSemana + "/semana. Legal min " + p.turnoPartidoLegalMin + "min, Ilegal menor"; } },
  { id: "EBR", num: 5, nombre: "Extension de Breaks", icono: "+",
    descFn: function(p) { return "Break corto mayor a " + (p.breakNormalMax + p.breakTolerancia) + "min (normal " + p.breakNormalMax + "min + " + p.breakTolerancia + "min tol)"; } },
  { id: "DSU", num: 6, nombre: "Domingos Supervisores", icono: "D",
    descFn: function(p) { return "Supervisores ocasionales: max " + p.domingoMaxSupervisores + " domingos/mes"; } },
  { id: "DBA", num: 7, nombre: "Domingos Personal de Base", icono: "B",
    descFn: function(p) { return "Equilibrio: min " + p.domingoMinDescansoBase + " domingo(s) libre(s)/mes"; } },
  { id: "HES", num: 8, nombre: "HE Semanal (Max por Semana)", icono: "S",
    descFn: function(p) { return "Max " + p.horasExtraMaxSemana + "h extra acumuladas por semana"; } },
  { id: "HED", num: 9, nombre: "HE Diaria (Max por Dia)", icono: "H",
    descFn: function(p) { return "Max " + p.horasExtraMaxDia + "h extra por dia (jornada normal " + p.jornadaNormal + "h)"; } },
];

/* === EVALUACION DE POLITICAS === */
function evaluarPoliticas(marcaciones, params, sedeFiltro) {
  const datos = sedeFiltro && sedeFiltro !== "Todas"
    ? marcaciones.filter((m) => m.DEPENDENCIA === sedeFiltro)
    : marcaciones;

  // Agrupar por empleado
  const porEmpleado = {};
  datos.forEach((m) => {
    const id = m.IDENTIFICACION;
    if (!porEmpleado[id]) {
      porEmpleado[id] = {
        id, nombre: m.EMPLEADO, cargo: m.CARGO || "",
        sede: m.DEPENDENCIA, seccion: m.CENTROCOSTO, registros: [],
      };
    }
    porEmpleado[id].registros.push(m);
  });

  const empleados = Object.values(porEmpleado);
  const totalEmpleados = empleados.length;

  const parseCargos = (str) => (str || "").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
  const cargosSup = parseCargos(params.cargosSupervisor);
  const cargosTPartido = parseCargos(params.turnoPartidoAplicaCargos);

  const esSupervisor = (cargo) => {
    if (!cargosSup.length) return false;
    const c = (cargo || "").toUpperCase();
    return cargosSup.some((s) => c.includes(s));
  };

  const esCargoTP = (cargo) => {
    if (!cargosTPartido.length) return true;
    const c = (cargo || "").toUpperCase();
    return cargosTPartido.some((s) => c.includes(s));
  };

  // Inicializar
  const resultados = {};
  POLITICAS_DEF.forEach((p) => {
    resultados[p.id] = { ...p, desc: p.descFn(params), violadores: [] };
  });

  const breakLimiteExtension = params.breakNormalMax + params.breakTolerancia; // 15+3 = 18min

  // -- Precalcular domingos únicos por mes UNA SOLA VEZ (evita filter O(n) dentro del loop de empleados) --
  const totalDomingosPorMesGlobal = {};
  {
    const fechasDomPorMes = {};
    datos.forEach((d) => {
      if (d.DIA_SEMANA === "Domingo" && d.MES) {
        if (!fechasDomPorMes[d.MES]) fechasDomPorMes[d.MES] = {};
        fechasDomPorMes[d.MES][d.FECHA] = 1;
      }
    });
    Object.keys(fechasDomPorMes).forEach((mes) => {
      totalDomingosPorMesGlobal[mes] = Math.max(Object.keys(fechasDomPorMes[mes]).length, 4);
    });
  }

  empleados.forEach((emp) => {
    const regs = emp.registros;
    const base = { id: emp.id, nombre: emp.nombre, cargo: emp.cargo, sede: emp.sede, seccion: emp.seccion };

    // --- POR DIA ---
    regs.forEach((r) => {
      const horas = r.TOTAL_HORAS || 0;
      const horasExtra = Math.max(0, horas - params.jornadaNormal);
      const breakPairs = r.BREAK_PAIRS || [];
      const breaksCortos = breakPairs.filter((b) => b.tipo === "BREAK_CORTO");
      const tpIlegales = breakPairs.filter((b) => b.tipo === "TP_ILEGAL");
      const breakCortoMaxMin = r.BREAK_CORTO_MAX_MIN || 0;
      const breakCortoTotalMin = r.BREAK_CORTO_TOTAL_MIN || 0;
      const detBreak = r.BREAK_DETALLE || "";

      // POL 1: Jornada extendida sin descanso
      // Trabaja >10h y su break corto total fue <8min (no descanso real)
      if (horas > params.jornadaExtendidaHoras && breakCortoTotalMin < params.breakMinimoMin) {
        resultados.JEX.violadores.push({
          ...base, fecha: r.FECHA,
          detalle: `${horas.toFixed(1)}h trabajadas, break corto total: ${breakCortoTotalMin}min (min ${params.breakMinimoMin}min) | ${detBreak || "sin breaks"}`,
          valor: horas,
        });
      }

      // POL 2: Break menor al minimo
      // Al menos tuvo break corto pero fue <8min
      if (breaksCortos.length > 0 && breakCortoMaxMin < params.breakMinimoMin) {
        resultados.BRK.violadores.push({
          ...base, fecha: r.FECHA,
          detalle: `Break corto max: ${breakCortoMaxMin}min (min ${params.breakMinimoMin}min) | ${detBreak}`,
          valor: breakCortoMaxMin,
        });
      }

      // POL 3: Jornada excesiva
      if (horas > params.jornadaMaxDia) {
        resultados.JXC.violadores.push({
          ...base, fecha: r.FECHA,
          detalle: `${horas.toFixed(1)}h trabajadas (max ${params.jornadaMaxDia}h, excede ${(horas - params.jornadaMaxDia).toFixed(1)}h) | ${detBreak || "sin breaks"}`,
          valor: horas,
        });
      }

      // POL 5: Extension de breaks
      // Un break CORTO (<45min) que supera el permitido (15min + 3min tolerancia = 18min)
      breaksCortos.forEach((b) => {
        if (b.duracionMin > breakLimiteExtension) {
          const sH = Math.floor(b.salidaH) + ":" + String(Math.round((b.salidaH % 1) * 60)).padStart(2, "0");
          const lH = Math.floor(b.llegadaH) + ":" + String(Math.round((b.llegadaH % 1) * 60)).padStart(2, "0");
          resultados.EBR.violadores.push({
            ...base, fecha: r.FECHA,
            detalle: `Break de ${b.duracionMin}min (${sH}-${lH}). Permitido: ${params.breakNormalMax}min + ${params.breakTolerancia}min tol = ${breakLimiteExtension}min. Excede ${b.duracionMin - breakLimiteExtension}min`,
            valor: b.duracionMin,
          });
        }
      });

      // Tambien reportar TP ilegales como extension (>45min pero <170min)
      tpIlegales.forEach((b) => {
        const sH = Math.floor(b.salidaH) + ":" + String(Math.round((b.salidaH % 1) * 60)).padStart(2, "0");
        const lH = Math.floor(b.llegadaH) + ":" + String(Math.round((b.llegadaH % 1) * 60)).padStart(2, "0");
        resultados.EBR.violadores.push({
          ...base, fecha: r.FECHA,
          detalle: "TP ILEGAL: " + b.duracionMin + "min (" + sH + "-" + lH + "). No es break corto (mayor a " + params.breakMaxPermitido + "min) ni TP legal (menor a " + params.turnoPartidoLegalMin + "min)",
          valor: b.duracionMin,
        });
      });

      // POL 9: HE diaria
      if (horasExtra > params.horasExtraMaxDia) {
        resultados.HED.violadores.push({
          ...base, fecha: r.FECHA,
          detalle: `${horasExtra.toFixed(1)}h extra (jornada ${params.jornadaNormal}h + max ${params.horasExtraMaxDia}h HE = ${params.jornadaNormal + params.horasExtraMaxDia}h). Total: ${horas.toFixed(1)}h`,
          valor: horasExtra,
        });
      }
    });

    // --- POR SEMANA ---
    const porSemana = {};
    regs.forEach((r) => {
      const sem = r.SEMANA || "Sin semana";
      if (!porSemana[sem]) porSemana[sem] = [];
      porSemana[sem].push(r);
    });

    Object.entries(porSemana).forEach(([semana, regsS]) => {
      const horasExtraSemana = regsS.reduce((s, r) => s + Math.max(0, (r.TOTAL_HORAS || 0) - params.jornadaNormal), 0);
      // Contar dias con cualquier tipo de turno partido
      const diasTP = regsS.filter((r) => (r.TURNOS_PARTIDOS || r.TURNO_PARTIDO || 0) > 0).length;

      // POL 4: Turnos partidos excesivos
      if (esCargoTP(emp.cargo) && diasTP > params.turnoPartidoMaxSemana) {
        // Detalle: cuantos legales vs ilegales
        const legales = regsS.reduce((s, r) => s + (r.TP_LEGALES || 0), 0);
        const ilegales = regsS.reduce((s, r) => s + (r.TP_ILEGALES || 0), 0);
        resultados.TPE.violadores.push({
          ...base, fecha: semana,
          detalle: `${diasTP} dias con TP en semana (max ${params.turnoPartidoMaxSemana}). Legales: ${legales}, Ilegales: ${ilegales}`,
          valor: diasTP,
        });
      }

      // POL 8: HE semanal
      if (horasExtraSemana > params.horasExtraMaxSemana) {
        resultados.HES.violadores.push({
          ...base, fecha: semana,
          detalle: `${horasExtraSemana.toFixed(1)}h extra en semana (max ${params.horasExtraMaxSemana}h, excede ${(horasExtraSemana - params.horasExtraMaxSemana).toFixed(1)}h)`,
          valor: horasExtraSemana,
        });
      }
    });

    // --- POR MES: DOMINGOS ---
    const domingosPorMes = {};

    regs.forEach((r) => {
      if (r.DIA_SEMANA === "Domingo") {
        const mes = r.MES || "Sin mes";
        domingosPorMes[mes] = (domingosPorMes[mes] || 0) + 1;
      }
    });

    Object.entries(domingosPorMes).forEach(([mes, trabajados]) => {
      const totalDom = totalDomingosPorMesGlobal[mes] || 4;

      // POL 6: Domingos supervisores
      if (esSupervisor(emp.cargo) && trabajados > params.domingoMaxSupervisores) {
        resultados.DSU.violadores.push({
          ...base, fecha: mes,
          detalle: `${trabajados} domingos en ${mes} (max ${params.domingoMaxSupervisores} para supervisores/ocasionales)`,
          valor: trabajados,
        });
      }

      // POL 7: Domingos personal base
      if (!esSupervisor(emp.cargo)) {
        const libres = totalDom - trabajados;
        if (libres < params.domingoMinDescansoBase) {
          resultados.DBA.violadores.push({
            ...base, fecha: mes,
            detalle: `${trabajados}/${totalDom} domingos trabajados, solo ${libres} libre(s) (min ${params.domingoMinDescansoBase}). Sin equilibrio`,
            valor: trabajados,
          });
        }
      }
    });
  });

  // -- Metricas --
  const politicas = POLITICAS_DEF.map((pd) => {
    const r = resultados[pd.id];
    const unicos = {};
    r.violadores.forEach((v) => { unicos[v.id] = true; });
    const empleadosAfectados = Object.keys(unicos).length;
    return {
      ...r, empleadosAfectados,
      totalViolaciones: r.violadores.length,
      porcentaje: totalEmpleados > 0 ? empleadosAfectados / totalEmpleados : 0,
      cumplimiento: totalEmpleados > 0 ? Math.round((1 - empleadosAfectados / totalEmpleados) * 100) : 100,
    };
  });

  return { politicas, totalEmpleados };
}

/* === SMALL COMPONENTS === */
function PillItem({ o, isSelected, onClick }) {
  var _h = useState(false), hov = _h[0], setHov = _h[1];
  return (
    <button
      onClick={onClick}
      onMouseEnter={function(){setHov(true);}}
      onMouseLeave={function(){setHov(false);}}
      style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        width:"100%", textAlign:"left", padding:"8px 12px",
        borderRadius:6, fontSize:11, border:"none", cursor:"pointer",
        background: isSelected ? C.pg : hov ? C.sa : "transparent",
        color: isSelected ? C.p : hov ? C.t : C.tm,
        fontWeight: isSelected ? 700 : 400,
        transition:"background 0.1s, color 0.1s",
      }}>
      <span>{o}</span>
      {isSelected && <span style={{fontSize:10, color:C.p, fontWeight:700}}>✓</span>}
    </button>
  );
}

function Pill(props) {
  var label = props.label, value = props.value, options = props.options, onChange = props.onChange;
  var ref = useRef(null);
  var btnRef = useRef(null);
  var _s = useState(false), open = _s[0], setOpen = _s[1];
  var _pos = useState({top:0,left:0}), dropPos = _pos[0], setDropPos = _pos[1];

  useEffect(function() {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return function() { document.removeEventListener("mousedown", handler); };
  }, []);

  function handleOpen() {
    if (!open && btnRef.current) {
      var r = btnRef.current.getBoundingClientRect();
      // Si el dropdown se saldría por la derecha de la pantalla, alinearlo a la derecha del botón
      var left = r.left;
      if (left + 200 > window.innerWidth) left = r.right - 200;
      setDropPos({ top: r.bottom + 6, left: left });
    }
    setOpen(function(v){ return !v; });
  }

  var act = value && value !== options[0];
  return (
    <div ref={ref} style={{position:"relative"}}>
      <button ref={btnRef} onClick={handleOpen} style={{
        padding:"6px 10px", borderRadius:8, fontSize:11, fontWeight:500,
        background: open ? (act ? C.p : C.bd) : (act ? C.pg : C.sa),
        border:"1px solid "+(act ? C.p : C.bd),
        color: open ? (act ? "#fff" : C.t) : (act ? C.p : C.tm),
        cursor:"pointer", display:"flex", alignItems:"center", gap:5,
        whiteSpace:"nowrap", transition:"all 0.15s",
        boxShadow: open ? "0 2px 8px rgba(31,107,46,0.15)" : "none",
      }}>
        <span style={{opacity:0.65, fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.3px"}}>{label}</span>
        <span style={{width:1, height:10, background:"currentColor", opacity:0.2}} />
        <span style={{fontWeight:700, maxWidth:100, overflow:"hidden", textOverflow:"ellipsis"}}>{value}</span>
        <span style={{fontSize:8, opacity:0.6, marginLeft:1}}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{
          position:"fixed", top:dropPos.top, left:dropPos.left,
          background:C.sf, border:"1px solid "+C.bd, borderRadius:10, padding:4,
          minWidth:190, maxHeight:240, overflowY:"auto",
          boxShadow:"0 12px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(31,107,46,0.08)",
          zIndex:9999,
        }}>
          {/* Header del dropdown */}
          <div style={{padding:"6px 12px 4px", borderBottom:"1px solid "+C.bd, marginBottom:3}}>
            <span style={{fontSize:9, fontWeight:700, color:C.td, textTransform:"uppercase", letterSpacing:"0.5px"}}>{label}</span>
          </div>
          {options.map(function(o) {
            return <PillItem key={o} o={o} isSelected={o===value} onClick={function(){onChange(o);setOpen(false);}} />;
          })}
        </div>
      )}
    </div>
  );
}

function Tip(props) {
  if (!props.active || !props.payload || !props.payload.length) return null;
  return (
    <div style={{background:"rgba(10,15,26,0.95)",border:"1px solid "+C.bd,borderRadius:9,padding:"9px 13px"}}>
      <p style={{color:C.w,fontWeight:600,fontSize:12,margin:"0 0 5px"}}>{props.label}</p>
      {props.payload.map(function(p,i) {
        return <div key={i} style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}>
          <div style={{width:7,height:7,borderRadius:2,background:p.color}} />
          <span style={{color:C.tm,fontSize:10}}>{p.name}:</span>
          <span style={{color:C.w,fontSize:11,fontWeight:600}}>{p.value}</span>
        </div>;
      })}
    </div>
  );
}

/* === DASHBOARD VIEW === */
function DashView({ marc: marcaciones = [], fact: facturas = [] }) {
  const hasMarc = marcaciones.length > 0;
  const hasFact = facturas.length > 0;

  const filtrosDefault = {
    sede: "Todas", seccion: "Todas", clase: "Todas", mes: "Todos",
    dsem: "Todos", semana: "Todas", dia: "Todos", quincena: "Todos"
  };

  const [filtros, setFiltros] = useState(filtrosDefault);
  const [vistaActual, setVistaActual] = useState("ambos");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(0);
  const REGISTROS_POR_PAGINA = 50;

  /* Reset filtros cuando cambian los datos cargados */
  useEffect(() => { setFiltros(filtrosDefault); setPagina(0); setBusqueda(""); }, [marcaciones.length, facturas.length]);

  // -- Opciones dinamicas de filtros --
  const opcionesFiltros = useMemo(() => {
    const sedes = {}, secciones = {}, clases = {}, meses = {}, semanas = {}, dias = {}, sedesFacturas = {};

    marcaciones.forEach((m) => {
      if (m.DEPENDENCIA) sedes[m.DEPENDENCIA] = 1;
      if (m.CENTROCOSTO) secciones[m.CENTROCOSTO] = 1;
      if (m.MES) meses[m.MES] = 1;
      if (m.SEMANA) semanas[m.SEMANA] = 1;
      if (m.DIA != null && String(m.DIA) !== "undefined" && String(m.DIA) !== "") dias[String(m.DIA)] = 1;
    });

    facturas.forEach((f) => {
      if (f.clase) clases[f.clase] = 1;
      if (f.sede) sedesFacturas[f.sede] = 1;
      if (f.seccion) secciones[f.seccion] = 1;
      if (f.mes) meses[f.mes] = 1;
    });

    Object.keys(sedesFacturas).forEach((k) => { sedes[k] = 1; });

    return {
      sedes: ["Todas", ...Object.keys(sedes)],
      secciones: ["Todas", ...Object.keys(secciones)],
      clases: ["Todas", ...Object.keys(clases)],
      meses: ["Todos", ...Object.keys(meses)],
      diasSemana: ["Todos", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"],
      semanas: ["Todas", ...Object.keys(semanas)],
      dias: ["Todos", ...Object.keys(dias).sort((a, b) => (+a) - (+b))],
    };
  }, [marcaciones, facturas]);

  // -- Marcaciones filtradas (para tabla) — un solo recorrido en vez de 7 filter encadenados --
  const marcacionesFiltradas = useMemo(() => {
    const quincenaVal = filtros.quincena !== "Todos" ? (filtros.quincena === "Quincena" ? "Si" : "No") : null;
    const query = busqueda.trim().toLowerCase();

    return marcaciones.filter((m) => {
      if (filtros.sede    !== "Todas"  && m.DEPENDENCIA !== filtros.sede)    return false;
      if (filtros.seccion !== "Todas"  && m.CENTROCOSTO !== filtros.seccion) return false;
      if (filtros.mes     !== "Todos"  && m.MES         !== filtros.mes)     return false;
      if (filtros.dsem    !== "Todos"  && m.DIA_SEMANA  !== filtros.dsem)    return false;
      if (filtros.semana  !== "Todas"  && m.SEMANA      !== filtros.semana)  return false;
      if (filtros.dia     !== "Todos"  && String(m.DIA) !== filtros.dia)     return false;
      if (quincenaVal !== null         && m.QUINCENA    !== quincenaVal)     return false;
      if (query) {
        const emp  = m.EMPLEADO    ? m.EMPLEADO.toLowerCase()    : "";
        const id   = m.IDENTIFICACION ? String(m.IDENTIFICACION) : "";
        const dep  = m.DEPENDENCIA ? m.DEPENDENCIA.toLowerCase() : "";
        const sec  = m.CENTROCOSTO ? m.CENTROCOSTO.toLowerCase() : "";
        if (!emp.includes(query) && !id.includes(query) && !dep.includes(query) && !sec.includes(query)) return false;
      }
      return true;
    });
  }, [marcaciones, filtros, busqueda]);

  // -- Datos del grafico --
  const datosGrafico = useMemo(() => buildChart(marcaciones, facturas, filtros), [marcaciones, facturas, filtros]);

  const hayDatosColab = datosGrafico.some((d) => d.colaboradores > 0);
  const hayDatosTrans = datosGrafico.some((d) => d.transacciones > 0);

  let tituloGrafico = "ANALISIS POR INTERVALO DE TIEMPO";
  if (hayDatosColab && hayDatosTrans) tituloGrafico = "CURVA DE VENTA VS. NIVEL DE PERSONAL";
  else if (hayDatosColab) tituloGrafico = "NIVEL DE PERSONAL POR HORA";
  else if (hayDatosTrans) tituloGrafico = "CURVA DE TRANSACCIONES POR HORA";

  // -- Estadisticas --
  const estadisticas = useMemo(() => {
    const empleadosUnicos = {}, fechasUnicas = {};
    marcacionesFiltradas.forEach((m) => { empleadosUnicos[m.IDENTIFICACION] = 1; fechasUnicas[m.FECHA] = 1; });

    const promedioHoras = marcacionesFiltradas.length > 0
      ? (marcacionesFiltradas.reduce((sum, m) => sum + (m.TOTAL_HORAS || 0), 0) / marcacionesFiltradas.length).toFixed(1)
      : "0";

    let maxColaboradores = 0, maxTransacciones = 0, ventaTotal = 0;
    datosGrafico.forEach((x) => { if (x.colaboradores > maxColaboradores) maxColaboradores = x.colaboradores; });
    datosGrafico.forEach((x) => { if (x.transacciones > maxTransacciones) maxTransacciones = x.transacciones; });
    facturas.forEach((f) => { ventaTotal += f.venta || 0; });

    return {
      empleados: Object.keys(empleadosUnicos).length,
      dias: Object.keys(fechasUnicas).length,
      promedioHoras,
      maxColaboradores: maxColaboradores.toFixed(0),
      maxTransacciones: maxTransacciones.toFixed(0),
      ventaTotal,
    };
  }, [marcacionesFiltradas, facturas, datosGrafico]);

  // -- Helpers --
  const aplicarFiltro = (clave, valor) => {
    setPagina(0);
    setFiltros((prev) => ({ ...prev, [clave]: valor }));
  };

  const limpiarTodo = () => { setFiltros(filtrosDefault); setBusqueda(""); setPagina(0); };

  // -- Tarjetas de stats (dinamicas) --
  const tarjetasStats = [];
  if (hasMarc) {
    tarjetasStats.push({ l: "Empleados", v: estadisticas.empleados, c: C.p });
    tarjetasStats.push({ l: "Prom Hrs/Dia", v: estadisticas.promedioHoras, c: C.s });
    tarjetasStats.push({ l: "Max Pers/Hora", v: estadisticas.maxColaboradores, c: C.ac });
    tarjetasStats.push({ l: "Dias", v: estadisticas.dias, c: "#8b5cf6" });
  }
  if (hasFact) {
    tarjetasStats.push({ l: "Max Trans/Hora", v: estadisticas.maxTransacciones, c: "#ec4899" });
    if (estadisticas.ventaTotal > 0) tarjetasStats.push({ l: "Venta Total", v: "$" + Math.round(estadisticas.ventaTotal).toLocaleString(), c: "#06b6d4" });
  }

  // -- Filtros visibles (dinamicos) --
  const filtrosVisibles = [];
  if (opcionesFiltros.sedes.length > 1) filtrosVisibles.push({ label: "Sede", key: "sede", opts: opcionesFiltros.sedes });
  if (hasMarc && opcionesFiltros.secciones.length > 1) filtrosVisibles.push({ label: "Seccion", key: "seccion", opts: opcionesFiltros.secciones });
  if (hasFact && opcionesFiltros.clases.length > 1) filtrosVisibles.push({ label: "Clase", key: "clase", opts: opcionesFiltros.clases });
  if (opcionesFiltros.meses.length > 1) filtrosVisibles.push({ label: "Mes", key: "mes", opts: opcionesFiltros.meses });
  if (hasMarc) filtrosVisibles.push({ label: "DiaSem", key: "dsem", opts: opcionesFiltros.diasSemana });
  if (hasMarc && opcionesFiltros.semanas.length > 1) filtrosVisibles.push({ label: "Semana", key: "semana", opts: opcionesFiltros.semanas });
  if (hasMarc && opcionesFiltros.dias.length > 1) filtrosVisibles.push({ label: "Dia", key: "dia", opts: opcionesFiltros.dias });
  if (hasMarc) filtrosVisibles.push({ label: "Quincena", key: "quincena", opts: ["Todos", "Quincena", "No Quincena"] });

  // -- Paginacion --
  const totalPaginas = Math.ceil(marcacionesFiltradas.length / REGISTROS_POR_PAGINA);
  const marcacionesPagina = marcacionesFiltradas.slice(pagina * REGISTROS_POR_PAGINA, (pagina + 1) * REGISTROS_POR_PAGINA);

  const mostrarGrafico = vistaActual === "grafico" || vistaActual === "ambos";
  const mostrarTabla = vistaActual === "tabla" || vistaActual === "ambos";

  const botonVista = (modo, texto) => {
    const activo = vistaActual === modo;
    return <button key={modo} onClick={() => setVistaActual(modo)} style={{padding:"6px 14px",borderRadius:7,fontSize:11,fontWeight:activo?600:400,background:activo?C.pg:"transparent",border:"1px solid "+(activo?C.p:C.bd),color:activo?C.p:C.tm,cursor:"pointer"}}>{texto}</button>;
  };

  const subtituloDatos = hasMarc && hasFact
    ? "Marcaciones + Facturacion"
    : hasMarc ? "Solo marcaciones - sube facturas para curva de venta"
    : "Solo facturas - sube marcaciones para ver personal";

  const tituloHeader = hayDatosColab && hayDatosTrans
    ? "Curva de Venta vs. Personal"
    : hayDatosColab ? "Personal por Hora"
    : "Transacciones por Hora";

  const columnasTabla = ["Empleado", "Sede", "Seccion", "Fecha", "Entrada", "Salida", "Jornada", "Quinc.", ...HC, "Total"];

  return (
    <div>
      {/* Header + Toggle de vista */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <h2 style={{color:C.w,fontSize:18,fontWeight:700,margin:0}}>{tituloHeader}</h2>
          <p style={{color:C.td,fontSize:11,margin:"3px 0 0"}}>{subtituloDatos}</p>
        </div>
        <div style={{display:"flex",gap:4,alignItems:"center"}}>
          {botonVista("grafico", "Grafico")}
          {botonVista("tabla", "Tabla")}
          {botonVista("ambos", "Ambos")}
          <button onClick={limpiarTodo} style={{padding:"6px 10px",borderRadius:7,fontSize:10,background:C.sa,border:"1px solid "+C.bd,color:C.tm,cursor:"pointer",marginLeft:6}}>Limpiar</button>
        </div>
      </div>

      {/* Filtros */}
      {filtrosVisibles.length > 0 && (
        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:16,padding:10,borderRadius:10,background:"rgba(255,255,255,0.85)",border:"1px solid "+C.bd}}>
          {filtrosVisibles.map((fp) => (
            <Pill key={fp.key} label={fp.label} value={filtros[fp.key]} options={fp.opts} onChange={(v) => aplicarFiltro(fp.key, v)} />
          ))}
        </div>
      )}

      {/* Tarjetas */}
      <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:16}}>
        {tarjetasStats.map((s, i) => (
          <div key={i} style={{padding:16,borderRadius:12,background:C.sf,border:"1px solid "+C.bd,flex:"1 1 140px",position:"relative",overflow:"hidden",boxShadow:"0 1px 4px rgba(31,107,46,0.07)"}}>
            <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:s.c,borderRadius:"12px 12px 0 0"}} />
            <div style={{color:C.td,fontSize:10,fontWeight:600,marginBottom:6,marginTop:4,textTransform:"uppercase",letterSpacing:"0.4px"}}>{s.l}</div>
            <div style={{fontSize:26,fontWeight:800,color:s.c,lineHeight:1}}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Grafico */}
      {mostrarGrafico && (
        <div style={{padding:20,borderRadius:16,background:C.sf,border:"1px solid "+C.bd,marginBottom:mostrarTabla?16:0,boxShadow:"0 1px 4px rgba(31,107,46,0.07)"}}>
          <h3 style={{color:C.w,fontSize:12,fontWeight:600,margin:"0 0 14px"}}>{tituloGrafico}</h3>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={datosGrafico} margin={{top:10,right:25,left:0,bottom:10}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.bd} />
              <XAxis dataKey="hora" tick={{fill:C.tm,fontSize:9}} />
              {hayDatosColab && <YAxis yAxisId="left" tick={{fill:C.tm,fontSize:9}} />}
              {hayDatosTrans && <YAxis yAxisId="right" orientation={hayDatosColab ? "right" : "left"} tick={{fill:C.tm,fontSize:9}} />}
              {!hayDatosColab && !hayDatosTrans && <YAxis yAxisId="left" tick={{fill:C.tm,fontSize:9}} />}
              <Tooltip content={<Tip />} />
              <Legend wrapperStyle={{fontSize:11}} />
              {hayDatosColab && <Bar yAxisId="left" dataKey="colaboradores" name="Colaboradores" fill={C.bg2} radius={[3,3,0,0]} barSize={20} />}
              {hayDatosTrans && <Line yAxisId="right" dataKey="transacciones" name="Transacciones" stroke={C.lg} strokeWidth={3} dot={{fill:C.lg,r:2}} type="monotone" />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabla */}
      {mostrarTabla && hasMarc && (
        <div style={{padding:20,borderRadius:16,background:C.sf,border:"1px solid "+C.bd,overflowX:"auto",boxShadow:"0 1px 4px rgba(31,107,46,0.07)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <h3 style={{color:C.w,fontSize:12,fontWeight:600,margin:0}}>Tabla de Marcaciones ({marcacionesFiltradas.length} registros)</h3>
            <input
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setPagina(0); }}
              placeholder="Buscar empleado, sede, seccion..."
              style={{padding:"7px 12px",borderRadius:8,fontSize:12,background:C.sa,border:"1px solid "+C.bd,color:C.t,outline:"none",width:260,boxSizing:"border-box"}}
            />
          </div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
            <thead><tr>
              {columnasTabla.map((h) => (
                <th key={h} style={{padding:"7px 5px",textAlign:"left",color:C.tm,fontWeight:700,borderBottom:"2px solid "+C.bd,whiteSpace:"nowrap",position:"sticky",top:0,background:"#f8fcf9",fontSize:9,textTransform:"uppercase",letterSpacing:"0.4px"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {marcacionesPagina.map((m, i) => {
                const fondoFila = i % 2 === 0 ? "transparent" : C.zebra;
                return (
                  <tr key={pagina * REGISTROS_POR_PAGINA + i} style={{background:fondoFila}}>
                    <td style={{padding:4,color:C.t,whiteSpace:"nowrap",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis"}} title={m.EMPLEADO}>{m.EMPLEADO}</td>
                    <td style={{padding:4,color:C.tm,whiteSpace:"nowrap"}}>{m.DEPENDENCIA}</td>
                    <td style={{padding:4,color:C.tm,whiteSpace:"nowrap"}}>{m.CENTROCOSTO}</td>
                    <td style={{padding:4,color:C.tm}}>{m.FECHA}</td>
                    <td style={{padding:4,color:C.p,fontWeight:600}}>{m.ENTRADA_H}</td>
                    <td style={{padding:4,color:C.dg,fontWeight:600}}>{m.SALIDA_H}</td>
                    <td style={{padding:4,color:C.tm}}>{m.TIPO_JORNADA}</td>
                    <td style={{padding:4,color:m.QUINCENA==="Si"?C.ac:C.td,fontWeight:m.QUINCENA==="Si"?600:400,fontSize:9}}>{m.QUINCENA === "Si" ? "QNC" : "-"}</td>
                    {HC.map((h) => (
                      <td key={h} style={{padding:"3px 2px",textAlign:"center",background:m[h]===1?C.gridHi:"transparent",color:m[h]===1?C.p:C.td,fontWeight:m[h]===1?700:400}}>{m[h]}</td>
                    ))}
                    <td style={{padding:4,color:C.w,fontWeight:600}}>{m.TOTAL_HORAS}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {totalPaginas > 1 && (
            <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:6,marginTop:12}}>
              <button onClick={() => setPagina(Math.max(0, pagina - 1))} disabled={pagina === 0} style={{padding:"5px 10px",borderRadius:6,fontSize:11,background:pagina===0?C.bg:C.sa,border:"1px solid "+C.bd,color:pagina===0?C.td:C.t,cursor:pagina===0?"default":"pointer"}}>Anterior</button>
              <span style={{color:C.tm,fontSize:11}}>Pag {pagina + 1} de {totalPaginas}</span>
              <button onClick={() => setPagina(Math.min(totalPaginas - 1, pagina + 1))} disabled={pagina >= totalPaginas - 1} style={{padding:"5px 10px",borderRadius:6,fontSize:11,background:pagina>=totalPaginas-1?C.bg:C.sa,border:"1px solid "+C.bd,color:pagina>=totalPaginas-1?C.td:C.t,cursor:pagina>=totalPaginas-1?"default":"pointer"}}>Siguiente</button>
              <span style={{color:C.td,fontSize:10,marginLeft:8}}>{REGISTROS_POR_PAGINA} por pagina</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* === COMPONENT: PARAM INPUT === */
function ParamInput({ label, value, onChange, tipo, ayuda }) {
  return (
    <div style={{marginBottom:8}}>
      <label style={{color:C.tm,fontSize:10,fontWeight:600,display:"block",marginBottom:3}}>{label}</label>
      {tipo === "text" ? (
        <input value={value} onChange={(e) => onChange(e.target.value)}
          style={{width:"100%",padding:"6px 8px",borderRadius:6,fontSize:12,background:C.bg,border:"1px solid "+C.bd,color:C.t,outline:"none",boxSizing:"border-box"}} />
      ) : (
        <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))}
          style={{width:"100%",padding:"6px 8px",borderRadius:6,fontSize:12,background:C.bg,border:"1px solid "+C.bd,color:C.t,outline:"none",boxSizing:"border-box"}} />
      )}
      {ayuda && <span style={{color:C.td,fontSize:9,marginTop:1,display:"block"}}>{ayuda}</span>}
    </div>
  );
}

/* === POLICIES VIEW === */
/* INFORME: ANOTACIONES POR NIVEL */
function getAnotacion(cumplimiento, nombre) {
  if (cumplimiento >= 95) return {
    anotacion: "Excelente resultado. El equipo demuestra un alto nivel de disciplina y compromiso con la politica de " + nombre + ". Este logro refleja una gestion operativa solida.",
    recomendacion: "Reconocer al equipo. Mantener los controles actuales y reforzar la induccion al nuevo personal para que adopten esta cultura.",
    prioridad: "Baja", color: "#7dd105"
  };
  if (cumplimiento >= 80) return {
    anotacion: "Buen nivel con oportunidades de mejora puntuales. Los casos de incumplimiento son aislados y corregibles con seguimiento focalizado.",
    recomendacion: "Identificar colaboradores puntuales en incumplimiento y realizar acompanamiento individual. Verificar si las causas son operativas o de desconocimiento.",
    prioridad: "Media", color: "#f59e0b"
  };
  if (cumplimiento >= 50) return {
    anotacion: "El nivel de incumplimiento es significativo y requiere atencion inmediata. Se evidencia una desviacion importante de los estandares.",
    recomendacion: "Activar plan de correccion centrado en causas raiz. Supervision mas constante y capacitacion obligatoria al equipo.",
    prioridad: "Alta", color: "#ef4444"
  };
  return {
    anotacion: "Incumplimiento critico que sugiere una falla severa en la gestion. Se requiere acompanamiento urgente y medidas correctivas inmediatas.",
    recomendacion: "Plan de Accion con seguimiento diario. Capacitacion obligatoria inmediata. Redistribuir cargas y evaluar refuerzo de personal.",
    prioridad: "Critica", color: "#ef4444"
  };
}

/* INFORME VIEW (React puro, sin HTML strings) */
function InformeView({ politicas, totalEmpleados, sede, mes, parametros, marcaciones, onCerrar }) {
  const mesesNombres = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const hoy = new Date();
  const fechaEmision = hoy.getDate() + " de " + mesesNombres[hoy.getMonth()].toLowerCase() + " del " + hoy.getFullYear();

  // Usar el mes seleccionado si está filtrado, si no detectar el más frecuente
  let mesNombre;
  if (mes && mes !== "Todos") {
    mesNombre = mes.charAt(0).toUpperCase() + mes.slice(1);
  } else {
    const mesesData = {};
    marcaciones.forEach((m) => { if (m.MES) mesesData[m.MES] = (mesesData[m.MES] || 0) + 1; });
    const mesTop = Object.entries(mesesData).sort((a, b) => b[1] - a[1])[0];
    mesNombre = mesTop ? mesTop[0].charAt(0).toUpperCase() + mesTop[0].slice(1) : mesesNombres[hoy.getMonth()];
  }

  const promedio = politicas.length ? Math.round(politicas.reduce((s, p) => s + p.cumplimiento, 0) / politicas.length) : 0;

  const descargarPDF = () => {
    const pctColor = (c) => c >= 90 ? "#16a34a" : c >= 70 ? "#d97706" : "#dc2626";

    const politicasHTML = politicas.map((pol) => {
      const info = getAnotacion(pol.cumplimiento, pol.nombre.toLowerCase());
      const pctInc = (100 - pol.cumplimiento).toFixed(1);
      const pc = pctColor(pol.cumplimiento);

      const unicosMap = {};
      pol.violadores.forEach((v) => {
        if (!unicosMap[v.id]) unicosMap[v.id] = { nombre: v.nombre, cargo: v.cargo, count: 0 };
        unicosMap[v.id].count++;
      });
      const topV = Object.values(unicosMap).sort((a, b) => b.count - a.count).slice(0, 5);

      const topVHTML = topV.length > 0 ? `
        <table class="tbl" style="margin-bottom:8px"><tbody>
          <tr><td colspan="2" class="tdWarn">Colaboradores con mayor incidencia</td></tr>
          ${topV.map(v => `<tr><td class="tdL">${v.nombre} (${v.cargo})</td><td class="tdR">${v.count} evento(s)</td></tr>`).join("")}
        </tbody></table>` : "";

      return `
        <div class="pol-block">
          <div class="polH">${pol.num}. ${pol.nombre.toUpperCase()}</div>
          <div class="polD">${pol.desc}</div>
          <table class="tbl"><tbody>
            <tr><td class="tdL">Total de colaboradores evaluados</td><td class="tdR">${totalEmpleados}</td></tr>
            <tr><td class="tdL">Colaboradores en incumplimiento</td><td class="tdR">${pol.empleadosAfectados}</td></tr>
            <tr><td class="tdL">% de Incumplimiento</td><td class="tdR" style="color:${pc}">${pctInc}%</td></tr>
            <tr><td class="tdL">Total de violaciones registradas</td><td class="tdR">${pol.totalViolaciones}</td></tr>
            <tr><td class="tdL">Cumplimiento</td><td class="tdR" style="color:${pc}">${pol.cumplimiento}%</td></tr>
          </tbody></table>
          ${topVHTML}
          <div class="nota"><b class="label">ANOTACION:</b><br/>${info.anotacion}</div>
          <div class="reco"><b class="label">RECOMENDACION:</b><br/>${info.recomendacion}</div>
        </div>`;
    }).join("");

    const semaforoHTML = politicas.map((pol) => {
      const info = getAnotacion(pol.cumplimiento, pol.nombre);
      return `<tr>
        <td class="semTd">${pol.nombre}</td>
        <td class="semTd"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${info.color};vertical-align:middle;margin-right:6px"></span>${pol.cumplimiento}%</td>
        <td class="semTd">${info.prioridad}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Reporte Seguimiento App - ${mesNombre}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1a1a1a; background: #fff; }
    .page { max-width: 820px; margin: 0 auto; padding: 40px; }
    h1 { text-align:center; font-size:17pt; color:#1C5A2A; margin-bottom:4px; letter-spacing:1px; }
    h2 { text-align:center; font-size:13pt; color:#4a4a4a; font-weight:400; margin-bottom:18px; }
    h3.secH { color:#1C5A2A; font-size:13pt; border-bottom:2px solid #1C5A2A; padding-bottom:4px; margin-top:25px; margin-bottom:10px; }
    .meta p { margin: 2px 0; font-size:11pt; }
    .meta b { color:#1C5A2A; }
    .intro { text-align:justify; margin-bottom:22px; font-size:10.5pt; color:#333; border-left:3px solid #1C5A2A; padding-left:12px; line-height:1.6; }
    .polH { background:#1C5A2A; color:#fff; padding:8px 14px; font-size:12.5pt; font-weight:700; margin-top:22px; border-radius:4px 4px 0 0; }
    .polD { background:#e8eef5; padding:6px 14px; font-size:9.5pt; color:#4a4a4a; margin-bottom:10px; border-radius:0 0 4px 4px; font-style:italic; }
    .tbl { width:100%; border-collapse:collapse; margin-bottom:10px; font-size:10.5pt; }
    .tbl td, .tbl th { padding:5px 10px; border:1px solid #ccc; }
    .tdL { background:#f5f7fa; font-weight:500; width:60%; }
    .tdR { text-align:center; font-weight:700; }
    .tdWarn { background:#fff3cd; text-align:center; font-size:9pt; font-weight:600; }
    .semTh { background:#1C5A2A; color:#fff; padding:7px; text-align:left; font-size:10pt; }
    .semTd { padding:5px 10px; border:1px solid #ccc; font-size:10.5pt; }
    .nota { background:#f0f9ff; border-left:3px solid #3b82f6; padding:8px 12px; margin-bottom:8px; font-size:10pt; line-height:1.5; }
    .reco { background:#fefce8; border-left:3px solid #f59e0b; padding:8px 12px; margin-bottom:18px; font-size:10pt; line-height:1.5; }
    .label { font-size:9pt; text-transform:uppercase; letter-spacing:0.5px; font-weight:700; }
    .firma-line { border-bottom:1px solid #333; width:280px; display:inline-block; margin-left:8px; }
    .print-btn { display:block; margin:0 auto 20px; padding:10px 28px; background:#1C5A2A; color:#fff; border:none; border-radius:8px; font-size:12pt; cursor:pointer; font-family:inherit; }
    @media print {
      .print-btn { display:none !important; }
      body { font-size:10pt; }
      .page { padding:0; }
      @page { margin:15mm; size:A4; }
    }
  </style>
</head>
<body>
  <div class="page">
    <button class="print-btn" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
    <h1>REPORTE MENSUAL DE CUMPLIMIENTO</h1>
    <h2>Politica de Horarios y Marcaciones</h2>
    <div class="meta" style="margin-bottom:18px">
      <p><b>Sede:</b> ${sede === "Todas" ? "TODAS LAS SEDES" : sede}</p>
      <p><b>Mes de Reporte:</b> ${mesNombre}</p>
      <p><b>Fecha de Emision:</b> ${fechaEmision}</p>
      <p><b>Cumplimiento General:</b> <span style="font-size:15pt;font-weight:700;color:${pctColor(promedio)}">${promedio}%</span></p>
    </div>
    <div class="intro">
      El presente reporte consolida el cumplimiento de la politica de horarios del personal durante el periodo evaluado.
      Se evaluaron <b>${totalEmpleados}</b> colaboradores (jornada normal: ${parametros.jornadaNormal}h, max dia: ${parametros.jornadaMaxDia}h,
      break min: ${parametros.breakMinimoMin}min, HE max/dia: ${parametros.horasExtraMaxDia}h, HE max/sem: ${parametros.horasExtraMaxSemana}h).
    </div>
    <h3 class="secH">INDICADORES DE CUMPLIMIENTO</h3>
    ${politicasHTML}
    <h3 class="secH">SEMAFORO DE CUMPLIMIENTO GENERAL</h3>
    <table class="tbl"><thead><tr>
      <th class="semTh">Indicador</th><th class="semTh">Estado</th><th class="semTh">Prioridad</th>
    </tr></thead><tbody>${semaforoHTML}</tbody></table>
    <h3 class="secH">PLAN DE ACCION SUGERIDO</h3>
    <ol style="font-size:10.5pt;padding-left:25px;line-height:1.8">
      <li>Identificar colaboradores recurrentes en multiples indicadores de riesgo</li>
      <li>Revisar programacion de turnos para el proximo periodo</li>
      <li>Verificar causas raiz de jornadas extendidas y breaks irregulares</li>
      <li>Implementar mejoras en la planificacion de horarios</li>
      <li>Capacitar a supervisores en registro correcto de marcaciones</li>
      <li>Redistribuir cargas de trabajo para equilibrar jornadas</li>
    </ol>
    <h3 class="secH">OBSERVACIONES Y COMENTARIOS</h3>
    <div style="border:1px solid #ccc;min-height:70px;padding:10px;border-radius:4px;color:#999;font-size:10pt">
      [Espacio para comentarios del administrador de tienda]
    </div>
    <div style="margin-top:35px">
      <h3 class="secH">COMPROMISOS Y SEGUIMIENTO</h3>
      <p style="margin:3px 0;font-size:10.5pt"><b>Administrador de Tienda:</b></p>
      <p style="margin:8px 0;font-size:10.5pt">Nombre: <span class="firma-line"></span></p>
      <p style="margin:8px 0;font-size:10.5pt">Firma: <span class="firma-line"></span></p>
      <p style="margin:8px 0;font-size:10.5pt">Fecha: <span class="firma-line"></span></p>
      <p style="margin:14px 0 0;font-size:10.5pt"><b>Proxima revision:</b> [DD/MM/AAAA]</p>
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SeguimientoApp_Reporte_${mesNombre}_${sede !== "Todas" ? sede + "_" : ""}${new Date().toISOString().slice(0,10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const S = {
    page: { fontFamily:"Calibri,Arial,sans-serif", fontSize:11, color:"#1a1a1a", lineHeight:"1.5", maxWidth:820, margin:"0 auto", padding:40, background:"#fff" },
    h1: { textAlign:"center", fontSize:17, color:"#1C5A2A", margin:"0 0 4px", letterSpacing:1, fontWeight:700 },
    h2: { textAlign:"center", fontSize:13, color:"#4a4a4a", fontWeight:400, margin:"0 0 18px" },
    metaP: { margin:"2px 0", fontSize:11 },
    metaB: { color:"#1C5A2A" },
    intro: { textAlign:"justify", marginBottom:22, fontSize:10.5, color:"#333", borderLeft:"3px solid #1C5A2A", paddingLeft:12 },
    polH: { background:"#1C5A2A", color:"#fff", padding:"8px 14px", fontSize:12.5, fontWeight:700, margin:"22px 0 0", borderRadius:"4px 4px 0 0" },
    polD: { background:"#e8eef5", padding:"6px 14px", fontSize:9.5, color:"#4a4a4a", margin:"0 0 10px", borderRadius:"0 0 4px 4px", fontStyle:"italic" },
    tbl: { width:"100%", borderCollapse:"collapse", marginBottom:10, fontSize:10.5 },
    tdL: { padding:"5px 10px", border:"1px solid #ccc", background:"#f5f7fa", fontWeight:500, width:"60%" },
    tdR: { padding:"5px 10px", border:"1px solid #ccc", textAlign:"center", fontWeight:700 },
    tdWarn: { padding:"5px 10px", border:"1px solid #ccc", background:"#fff3cd", textAlign:"center", fontSize:9, fontWeight:600 },
    nota: { background:"#f0f9ff", borderLeft:"3px solid #3b82f6", padding:"8px 12px", marginBottom:8, fontSize:10 },
    reco: { background:"#fefce8", borderLeft:"3px solid #f59e0b", padding:"8px 12px", marginBottom:18, fontSize:10 },
    label: { fontSize:9, textTransform:"uppercase", letterSpacing:0.5, fontWeight:700 },
    secH: { color:"#1C5A2A", fontSize:14, borderBottom:"2px solid #1C5A2A", paddingBottom:4, marginTop:25 },
    semTh: { background:"#1C5A2A", color:"#fff", padding:7, textAlign:"left", fontSize:10 },
    semTd: { padding:"5px 10px", border:"1px solid #ccc", fontSize:10.5 },
    dot: (c) => ({ display:"inline-block", width:13, height:13, borderRadius:"50%", background:c, verticalAlign:"middle", marginRight:6 }),
    firmaLine: { borderBottom:"1px solid #333", width:280, display:"inline-block", marginLeft:8 },
  };

  const pctColor = (c) => c >= 90 ? "#16a34a" : c >= 70 ? "#d97706" : "#dc2626";

  return (
    <div id="seguimiento-informe-print" style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:9999,background:"rgba(0,0,0,0.92)",display:"flex",flexDirection:"column",alignItems:"center",overflow:"auto"}}>
      <div className="informe-toolbar" style={{position:"sticky",top:0,zIndex:10,display:"flex",gap:8,padding:"10px 0",background:"rgba(0,0,0,0.8)",width:"100%",justifyContent:"center"}}>
        <button onClick={descargarPDF} style={{padding:"8px 20px",borderRadius:8,fontSize:12,fontWeight:600,background:"linear-gradient(135deg,#1C5A2A,#7dd105)",border:"none",color:"#fff",cursor:"pointer",boxShadow:"0 2px 8px rgba(28,90,42,0.4)"}}>⬇ Descargar PDF</button>
        <button onClick={onCerrar} style={{padding:"8px 20px",borderRadius:8,fontSize:12,fontWeight:500,background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.3)",color:"#fca5a5",cursor:"pointer"}}>Cerrar Informe</button>
      </div>

      <div className="informe-page" style={S.page}>
        <h1 style={S.h1}>REPORTE MENSUAL DE CUMPLIMIENTO</h1>
        <h2 style={S.h2}>Politica de Horarios y Marcaciones</h2>

        <div style={{marginBottom:18}}>
          <p style={S.metaP}><b style={S.metaB}>Sede:</b> {sede === "Todas" ? "TODAS LAS SEDES" : sede}</p>
          <p style={S.metaP}><b style={S.metaB}>Mes de Reporte:</b> {mesNombre}</p>
          <p style={S.metaP}><b style={S.metaB}>Fecha de Emision:</b> {fechaEmision}</p>
          <p style={S.metaP}><b style={S.metaB}>Cumplimiento General:</b> <span style={{fontSize:15,fontWeight:700,color:pctColor(promedio)}}>{promedio}%</span></p>
        </div>

        <div style={S.intro}>
          El presente reporte consolida el cumplimiento de la politica de horarios del personal durante el periodo evaluado.
          Se evaluaron <b>{totalEmpleados}</b> colaboradores (jornada normal: {parametros.jornadaNormal}h, max dia: {parametros.jornadaMaxDia}h, break min: {parametros.breakMinimoMin}min, HE max/dia: {parametros.horasExtraMaxDia}h, HE max/sem: {parametros.horasExtraMaxSemana}h).
        </div>

        <h3 style={S.secH}>INDICADORES DE CUMPLIMIENTO</h3>

        {politicas.map((pol) => {
          const info = getAnotacion(pol.cumplimiento, pol.nombre.toLowerCase());
          const pctInc = 100 - pol.cumplimiento;
          const pc = pctColor(pol.cumplimiento);

          const unicosMap = {};
          pol.violadores.forEach((v) => { if (!unicosMap[v.id]) unicosMap[v.id] = { nombre: v.nombre, cargo: v.cargo, count: 0 }; unicosMap[v.id].count++; });
          const topV = Object.values(unicosMap).sort((a, b) => b.count - a.count).slice(0, 5);

          return (
            <div key={pol.id}>
              <div style={S.polH}>{pol.num}. {pol.nombre.toUpperCase()}</div>
              <div style={S.polD}>{pol.desc}</div>
              <table style={S.tbl}><tbody>
                <tr><td style={S.tdL}>Total de colaboradores evaluados</td><td style={S.tdR}>{totalEmpleados}</td></tr>
                <tr><td style={S.tdL}>Colaboradores en incumplimiento</td><td style={S.tdR}>{pol.empleadosAfectados}</td></tr>
                <tr><td style={S.tdL}>% de Incumplimiento</td><td style={{...S.tdR,color:pc}}>{pctInc.toFixed(1)}%</td></tr>
                <tr><td style={S.tdL}>Total de violaciones registradas</td><td style={S.tdR}>{pol.totalViolaciones}</td></tr>
                <tr><td style={S.tdL}>Cumplimiento</td><td style={{...S.tdR,color:pc}}>{pol.cumplimiento}%</td></tr>
              </tbody></table>

              {topV.length > 0 && (
                <table style={{...S.tbl,marginBottom:8}}><tbody>
                  <tr><td colSpan={2} style={S.tdWarn}>Colaboradores con mayor incidencia</td></tr>
                  {topV.map((v, i) => <tr key={i}><td style={S.tdL}>{v.nombre} ({v.cargo})</td><td style={S.tdR}>{v.count} evento(s)</td></tr>)}
                </tbody></table>
              )}

              <div style={S.nota}><b style={S.label}>Anotacion:</b><br/>{info.anotacion}</div>
              <div style={S.reco}><b style={S.label}>Recomendacion:</b><br/>{info.recomendacion}</div>
            </div>
          );
        })}

        <h3 style={S.secH}>SEMAFORO DE CUMPLIMIENTO GENERAL</h3>
        <table style={S.tbl}><thead><tr>
          <th style={S.semTh}>Indicador</th><th style={S.semTh}>Estado</th><th style={S.semTh}>Prioridad</th>
        </tr></thead><tbody>
          {politicas.map((pol) => {
            const info = getAnotacion(pol.cumplimiento, pol.nombre);
            return (<tr key={pol.id}>
              <td style={S.semTd}>{pol.nombre}</td>
              <td style={S.semTd}><span style={S.dot(info.color)} />{pol.cumplimiento}%</td>
              <td style={S.semTd}>{info.prioridad}</td>
            </tr>);
          })}
        </tbody></table>

        <h3 style={S.secH}>PLAN DE ACCION SUGERIDO</h3>
        <ol style={{fontSize:10.5,paddingLeft:25}}>
          <li style={{marginBottom:4}}>Identificar colaboradores recurrentes en multiples indicadores de riesgo</li>
          <li style={{marginBottom:4}}>Revisar programacion de turnos para el proximo periodo</li>
          <li style={{marginBottom:4}}>Verificar causas raiz de jornadas extendidas y breaks irregulares</li>
          <li style={{marginBottom:4}}>Implementar mejoras en la planificacion de horarios</li>
          <li style={{marginBottom:4}}>Capacitar a supervisores en registro correcto de marcaciones</li>
          <li style={{marginBottom:4}}>Redistribuir cargas de trabajo para equilibrar jornadas</li>
        </ol>

        <h3 style={S.secH}>OBSERVACIONES Y COMENTARIOS</h3>
        <div style={{border:"1px solid #ccc",minHeight:70,padding:10,borderRadius:4,color:"#999",fontSize:10}}>
          [Espacio para comentarios del administrador de tienda]
        </div>

        <div style={{marginTop:35}}>
          <h3 style={S.secH}>COMPROMISOS Y SEGUIMIENTO</h3>
          <p style={{margin:"3px 0",fontSize:10.5}}><b>Administrador de Tienda:</b></p>
          <p style={{margin:"3px 0",fontSize:10.5}}>Nombre: <span style={S.firmaLine} /></p>
          <p style={{margin:"3px 0",fontSize:10.5}}>Firma: <span style={S.firmaLine} /></p>
          <p style={{margin:"3px 0",fontSize:10.5}}>Fecha: <span style={S.firmaLine} /></p>
          <p style={{margin:"12px 0 0",fontSize:10.5}}><b>Proxima revision:</b> [DD/MM/AAAA]</p>
        </div>
      </div>
    </div>
  );
}

function PolView({ marc: marcaciones = [] }) {
  const [parametros, setParametros] = useState({ ...PARAMS_DEFAULT });
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [sedeSel, setSedeSel] = useState("Todas");
  const [mesSel, setMesSel] = useState("Todos");
  const [polSeleccionada, setPolSeleccionada] = useState(null);
  const [mostrarInforme, setMostrarInforme] = useState(false);
  const [busquedaPol, setBusquedaPol] = useState("");
  const [paginaPol, setPaginaPol] = useState(0);
  const [mostrarModalExcel, setMostrarModalExcel] = useState(false);
  const [polsParaExcel, setPolsParaExcel] = useState(null); // null = no iniciado
  const VIOL_POR_PAGINA = 30;

  const sedes = useMemo(() => {
    const s = {};
    marcaciones.forEach((m) => { if (m.DEPENDENCIA) s[m.DEPENDENCIA] = 1; });
    return ["Todas", ...Object.keys(s)];
  }, [marcaciones]);

  const meses = useMemo(() => {
    const ORDEN = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    const s = {};
    marcaciones.forEach((m) => { if (m.MES) s[m.MES] = 1; });
    const lista = Object.keys(s).sort((a, b) => ORDEN.indexOf(a.toLowerCase()) - ORDEN.indexOf(b.toLowerCase()));
    return ["Todos", ...lista];
  }, [marcaciones]);

  // Marcaciones filtradas por sede Y mes antes de evaluar políticas
  const marcacionesFiltradas = useMemo(() => {
    return marcaciones.filter((m) => {
      if (sedeSel !== "Todas" && m.DEPENDENCIA !== sedeSel) return false;
      if (mesSel  !== "Todos" && m.MES         !== mesSel)  return false;
      return true;
    });
  }, [marcaciones, sedeSel, mesSel]);

  const [resultado, setResultado] = useState({ politicas: [], totalEmpleados: 0 });
  const [calculando, setCalculando] = useState(false);
  const [progresoPol, setProgresoPol] = useState(0);

  useEffect(() => {
    if (marcacionesFiltradas.length === 0) {
      setResultado({ politicas: POLITICAS_DEF.map(p => ({...p, desc: p.descFn(parametros), violadores:[], empleadosAfectados:0, totalViolaciones:0, porcentaje:0, cumplimiento:100})), totalEmpleados: 0 });
      return;
    }
    setCalculando(true);
    setProgresoPol(0);
    let cancelled = false;

    /* Procesar en chunks asincrónicos para no congelar el navegador */
    const CHUNK = 800;
    const datos = marcacionesFiltradas;
    const porEmpleado = {};
    datos.forEach(m => {
      const id = m.IDENTIFICACION;
      if (!porEmpleado[id]) porEmpleado[id] = { id, nombre: m.EMPLEADO, cargo: m.CARGO || "", sede: m.DEPENDENCIA, seccion: m.CENTROCOSTO, registros: [] };
      porEmpleado[id].registros.push(m);
    });
    const empleados = Object.values(porEmpleado);
    const totalEmpleados = empleados.length;
    const parseCargos = str => (str||"").split(",").map(c=>c.trim().toUpperCase()).filter(Boolean);
    const cargosSup = parseCargos(parametros.cargosSupervisor);
    const cargosTPartido = parseCargos(parametros.turnoPartidoAplicaCargos);
    const esSupervisor = cargo => { const c=(cargo||"").toUpperCase(); return cargosSup.some(s=>c.includes(s)); };
    const esCargoTP = cargo => { if(!cargosTPartido.length)return true; const c=(cargo||"").toUpperCase(); return cargosTPartido.some(s=>c.includes(s)); };
    const resultados = {};
    POLITICAS_DEF.forEach(p => { resultados[p.id] = { ...p, desc: p.descFn(parametros), violadores: [] }; });
    const breakLimiteExtension = parametros.breakNormalMax + parametros.breakTolerancia;
    const totalDomingosPorMesGlobal = {};
    { const fechasDomPorMes = {}; datos.forEach(d => { if(d.DIA_SEMANA==="Domingo"&&d.MES){ if(!fechasDomPorMes[d.MES])fechasDomPorMes[d.MES]={}; fechasDomPorMes[d.MES][d.FECHA]=1; } }); Object.keys(fechasDomPorMes).forEach(mes => { totalDomingosPorMesGlobal[mes] = Math.max(Object.keys(fechasDomPorMes[mes]).length,4); }); }

    let idx = 0;
    function processChunk() {
      if (cancelled) return;
      const end = Math.min(idx + CHUNK, empleados.length);
      for (let ei = idx; ei < end; ei++) {
        const emp = empleados[ei];
        const regs = emp.registros;
        const base = { id:emp.id, nombre:emp.nombre, cargo:emp.cargo, sede:emp.sede, seccion:emp.seccion };
        regs.forEach(r => {
          const horas = r.TOTAL_HORAS||0;
          const horasExtra = Math.max(0,horas-parametros.jornadaNormal);
          const breakPairs = r.BREAK_PAIRS||[];
          const breaksCortos = breakPairs.filter(b=>b.tipo==="BREAK_CORTO");
          const tpIlegales = breakPairs.filter(b=>b.tipo==="TP_ILEGAL");
          const breakCortoMaxMin = r.BREAK_CORTO_MAX_MIN||0;
          const breakCortoTotalMin = r.BREAK_CORTO_TOTAL_MIN||0;
          const detBreak = r.BREAK_DETALLE||"";
          if(horas>parametros.jornadaExtendidaHoras&&breakCortoTotalMin<parametros.breakMinimoMin) resultados.JEX.violadores.push({...base,fecha:r.FECHA,detalle:horas.toFixed(1)+"h, break total: "+breakCortoTotalMin+"min (min "+parametros.breakMinimoMin+"min)",valor:horas});
          if(breaksCortos.length>0&&breakCortoMaxMin<parametros.breakMinimoMin) resultados.BRK.violadores.push({...base,fecha:r.FECHA,detalle:"Break max: "+breakCortoMaxMin+"min (min "+parametros.breakMinimoMin+"min)",valor:breakCortoMaxMin});
          if(horas>parametros.jornadaMaxDia) resultados.JXC.violadores.push({...base,fecha:r.FECHA,detalle:horas.toFixed(1)+"h (max "+parametros.jornadaMaxDia+"h, excede "+(horas-parametros.jornadaMaxDia).toFixed(1)+"h)",valor:horas});
          breaksCortos.forEach(b => { if(b.duracionMin>breakLimiteExtension){ const sH=Math.floor(b.salidaH)+":"+String(Math.round((b.salidaH%1)*60)).padStart(2,"0"); const lH=Math.floor(b.llegadaH)+":"+String(Math.round((b.llegadaH%1)*60)).padStart(2,"0"); resultados.EBR.violadores.push({...base,fecha:r.FECHA,detalle:"Break "+b.duracionMin+"min ("+sH+"-"+lH+"). Excede "+(b.duracionMin-breakLimiteExtension)+"min",valor:b.duracionMin}); } });
          tpIlegales.forEach(b => { const sH=Math.floor(b.salidaH)+":"+String(Math.round((b.salidaH%1)*60)).padStart(2,"0"); const lH=Math.floor(b.llegadaH)+":"+String(Math.round((b.llegadaH%1)*60)).padStart(2,"0"); resultados.EBR.violadores.push({...base,fecha:r.FECHA,detalle:"TP ILEGAL: "+b.duracionMin+"min ("+sH+"-"+lH+")",valor:b.duracionMin}); });
          if(horasExtra>parametros.horasExtraMaxDia) resultados.HED.violadores.push({...base,fecha:r.FECHA,detalle:horasExtra.toFixed(1)+"h extra (max "+parametros.horasExtraMaxDia+"h). Total: "+horas.toFixed(1)+"h",valor:horasExtra});
        });
        const porSemana = {};
        regs.forEach(r => { const sem=r.SEMANA||"Sin semana"; if(!porSemana[sem])porSemana[sem]=[]; porSemana[sem].push(r); });
        Object.entries(porSemana).forEach(([semana,regsS]) => {
          const heS = regsS.reduce((s,r)=>s+Math.max(0,(r.TOTAL_HORAS||0)-parametros.jornadaNormal),0);
          const diasTP = regsS.filter(r=>(r.TURNOS_PARTIDOS||r.TURNO_PARTIDO||0)>0).length;
          if(esCargoTP(emp.cargo)&&diasTP>parametros.turnoPartidoMaxSemana){ const leg=regsS.reduce((s,r)=>s+(r.TP_LEGALES||0),0); const ile=regsS.reduce((s,r)=>s+(r.TP_ILEGALES||0),0); resultados.TPE.violadores.push({...base,fecha:semana,detalle:diasTP+" dias TP (max "+parametros.turnoPartidoMaxSemana+"). Leg:"+leg+" Ile:"+ile,valor:diasTP}); }
          if(heS>parametros.horasExtraMaxSemana) resultados.HES.violadores.push({...base,fecha:semana,detalle:heS.toFixed(1)+"h extra en semana (max "+parametros.horasExtraMaxSemana+"h)",valor:heS});
        });
        const domingosPorMes = {};
        regs.forEach(r => { if(r.DIA_SEMANA==="Domingo"){ const mes=r.MES||"Sin mes"; domingosPorMes[mes]=(domingosPorMes[mes]||0)+1; } });
        Object.entries(domingosPorMes).forEach(([mes,trabajados]) => {
          const totalDom = totalDomingosPorMesGlobal[mes]||4;
          if(esSupervisor(emp.cargo)&&trabajados>parametros.domingoMaxSupervisores) resultados.DSU.violadores.push({...base,fecha:mes,detalle:trabajados+" domingos en "+mes+" (max "+parametros.domingoMaxSupervisores+")",valor:trabajados});
          if(!esSupervisor(emp.cargo)){ const libres=totalDom-trabajados; if(libres<parametros.domingoMinDescansoBase) resultados.DBA.violadores.push({...base,fecha:mes,detalle:trabajados+"/"+totalDom+" domingos, "+libres+" libre(s) (min "+parametros.domingoMinDescansoBase+")",valor:trabajados}); }
        });
      }
      idx = end;
      if (!cancelled) setProgresoPol(Math.round(idx / empleados.length * 100));
      if (idx < empleados.length) {
        setTimeout(processChunk, 0);
      } else {
        const politicas = POLITICAS_DEF.map(pd => {
          const r = resultados[pd.id];
          const unicos = {}; r.violadores.forEach(v => { unicos[v.id]=true; });
          const ea = Object.keys(unicos).length;
          return { ...r, empleadosAfectados:ea, totalViolaciones:r.violadores.length, porcentaje:totalEmpleados>0?ea/totalEmpleados:0, cumplimiento:totalEmpleados>0?Math.round((1-ea/totalEmpleados)*100):100 };
        });
        if (!cancelled) { setResultado({ politicas, totalEmpleados }); setCalculando(false); }
      }
    }
    setTimeout(processChunk, 50);
    return () => { cancelled = true; };
  }, [marcacionesFiltradas, parametros]);

  const { politicas, totalEmpleados } = resultado;

  const setParam = (clave, valor) => setParametros((prev) => ({ ...prev, [clave]: valor }));
  const resetParams = () => setParametros({ ...PARAMS_DEFAULT });

  // Graficos
  const barData = politicas.map((p) => ({
    name: p.id, cumple: totalEmpleados - p.empleadosAfectados, noCumple: p.empleadosAfectados,
  }));
  const radarData = politicas.map((p) => ({ ind: p.id, val: p.cumplimiento }));

  // Violadores filtrados
  const violadoresFiltrados = useMemo(() => {
    if (!polSeleccionada) return [];
    const pol = politicas.find((p) => p.id === polSeleccionada);
    if (!pol) return [];
    let viols = pol.violadores;
    if (busquedaPol.trim()) {
      const q = busquedaPol.trim().toLowerCase();
      viols = viols.filter((v) =>
        v.nombre.toLowerCase().includes(q) || String(v.id).includes(q) ||
        (v.cargo && v.cargo.toLowerCase().includes(q)) || (v.seccion && v.seccion.toLowerCase().includes(q))
      );
    }
    return viols;
  }, [polSeleccionada, politicas, busquedaPol]);

  const totalPaginasViol = Math.ceil(violadoresFiltrados.length / VIOL_POR_PAGINA);
  const violadoresPagina = violadoresFiltrados.slice(paginaPol * VIOL_POR_PAGINA, (paginaPol + 1) * VIOL_POR_PAGINA);

  const colorCumpl = (cum) => cum >= 90 ? C.p : cum >= 70 ? C.ac : C.dg;

  const polActiva = politicas.find((p) => p.id === polSeleccionada);

  const resumen = useMemo(() => {
    if (!politicas.length) return { peor: { id: "-", cumplimiento: 0 }, mejor: { id: "-", cumplimiento: 100 }, promedio: 0 };
    const peor = politicas.reduce((min, p) => p.cumplimiento < min.cumplimiento ? p : min, politicas[0]);
    const mejor = politicas.reduce((max, p) => p.cumplimiento > max.cumplimiento ? p : max, politicas[0]);
    const promedio = Math.round(politicas.reduce((s, p) => s + p.cumplimiento, 0) / politicas.length);
    return { peor, mejor, promedio };
  }, [politicas]);

  /* Exportar politicas a Excel estilizado (HTML-Excel, soporta colores y formatos) */
  const exportarPolExcel = (polsSeleccionadas) => {
    const fecha = new Date().toISOString().slice(0, 10);
    // Filtrar solo las políticas elegidas en el modal
    const politicasFiltradas = politicas.filter(p => polsSeleccionadas.has(p.id));
    const colorCump = (c) => c >= 90 ? "#d4edda" : c >= 70 ? "#fff3cd" : "#f8d7da";
    const colorCumpText = (c) => c >= 90 ? "#155724" : c >= 70 ? "#856404" : "#721c24";

    const estilosBase = `
      <style>
        body { font-family: Calibri, sans-serif; font-size: 11pt; }
        table { border-collapse: collapse; width: 100%; }
        th { background: #1f6b2e; color: #ffffff; font-weight: bold; padding: 8px 10px; text-align: left; border: 1px solid #155722; font-size: 10pt; }
        td { padding: 6px 10px; border: 1px solid #d0e4d4; font-size: 10pt; vertical-align: top; }
        tr:nth-child(even) td { background: #f4faf5; }
        .titulo { background: #0f1f13; color: #fff; padding: 14px 18px; font-size: 16pt; font-weight: bold; margin-bottom: 0; }
        .subtitulo { background: #1f6b2e; color: #e8f5eb; padding: 6px 18px; font-size: 10pt; margin-bottom: 20px; }
        .section-header { background: #1f6b2e; color: white; padding: 10px 14px; font-size: 13pt; font-weight: bold; margin: 24px 0 0; border-radius: 4px 4px 0 0; page-break-before: auto; }
        .section-desc { background: #e8f5eb; padding: 5px 14px; font-size: 9pt; color: #3a5e42; margin: 0 0 8px; border: 1px solid #c8dece; font-style: italic; border-radius: 0 0 4px 4px; }
        .badge-ok { background: #d4edda; color: #155724; padding: 2px 8px; border-radius: 12px; font-weight: bold; font-size: 9pt; display: inline-block; }
        .badge-warn { background: #fff3cd; color: #856404; padding: 2px 8px; border-radius: 12px; font-weight: bold; font-size: 9pt; display: inline-block; }
        .badge-bad { background: #f8d7da; color: #721c24; padding: 2px 8px; border-radius: 12px; font-weight: bold; font-size: 9pt; display: inline-block; }
        .meta-box { background: #f4faf5; border: 1px solid #c8dece; padding: 12px 18px; margin-bottom: 20px; border-radius: 6px; }
        .meta-box td { border: none; padding: 3px 16px 3px 0; background: transparent; }
        .meta-label { color: #3a5e42; font-weight: bold; font-size: 10pt; }
        .no-violations { color: #888; font-style: italic; padding: 10px; }
        @media print { .section-header { page-break-before: always; } }
      </style>`;

    const badgeHtml = (c) => {
      if (c >= 90) return `<span class="badge-ok">${c}%</span>`;
      if (c >= 70) return `<span class="badge-warn">${c}%</span>`;
      return `<span class="badge-bad">${c}%</span>`;
    };

    // Hoja 1: RESUMEN
    const filasPol = politicasFiltradas.map((p, i) => {
      const bg = i % 2 === 0 ? "" : "background:#f4faf5";
      return `<tr style="${bg}">
        <td style="font-weight:bold;color:#1f6b2e">${p.num}</td>
        <td>${p.nombre}</td>
        <td style="text-align:center">${badgeHtml(p.cumplimiento)}</td>
        <td style="text-align:center;color:#b45309;font-weight:bold">${(100 - p.cumplimiento).toFixed(1)}%</td>
        <td style="text-align:center;font-weight:bold">${p.empleadosAfectados}</td>
        <td style="text-align:center">${p.totalViolaciones}</td>
        <td style="text-align:center">${totalEmpleados}</td>
      </tr>`;
    }).join("");

    const htmlResumen = `<!DOCTYPE html><html><head><meta charset="UTF-8">${estilosBase}</head><body>
      <div class="titulo">REPORTE DE POLITICAS LABORALES</div>
      <div class="subtitulo">Supertiendas Cañaveral · Analisis de Cumplimiento · ${politicasFiltradas.length} de ${politicas.length} politicas incluidas</div>
      <div class="meta-box"><table><tr>
        <td><span class="meta-label">Sede:</span> ${sedeSel}</td>
        <td><span class="meta-label">Mes:</span> ${mesSel}</td>
        <td><span class="meta-label">Empleados evaluados:</span> ${totalEmpleados}</td>
        <td><span class="meta-label">Cumplimiento promedio:</span> ${badgeHtml(resumen.promedio)}</td>
        <td><span class="meta-label">Fecha:</span> ${fecha}</td>
      </tr></table></div>
      <div class="section-header">RESUMEN DE POLITICAS SELECCIONADAS</div>
      <table><thead><tr>
        <th style="width:40px">#</th>
        <th>Politica</th>
        <th style="width:110px;text-align:center">Cumplimiento</th>
        <th style="width:110px;text-align:center">Incumplimiento</th>
        <th style="width:120px;text-align:center">Emp. Afectados</th>
        <th style="width:100px;text-align:center">Violaciones</th>
        <th style="width:100px;text-align:center">Total Emp.</th>
      </tr></thead><tbody>${filasPol}</tbody></table>
      ${politicasFiltradas.map((p) => {
        const filasV = p.violadores.length === 0
          ? `<tr><td colspan="8" class="no-violations">Sin violaciones registradas para esta politica</td></tr>`
          : p.violadores.map((v, i) => {
              const bg = i % 2 === 0 ? "" : "background:#f4faf5";
              return `<tr style="${bg}">
                <td style="font-family:monospace">${v.id}</td>
                <td style="font-weight:500">${v.nombre}</td>
                <td>${v.cargo || "-"}</td>
                <td>${v.sede || "-"}</td>
                <td>${v.seccion || "-"}</td>
                <td>${v.fecha || "-"}</td>
                <td style="color:#555">${v.detalle || "-"}</td>
                <td style="text-align:center;font-weight:bold">${v.valor != null ? v.valor : "-"}</td>
              </tr>`;
            }).join("");
        return `<div class="section-header">${p.num}. ${p.nombre.toUpperCase()} — ${badgeHtml(p.cumplimiento)}</div>
          <div class="section-desc">${p.desc}</div>
          <table><thead><tr>
            <th style="width:110px">ID</th><th>Empleado</th><th>Cargo</th>
            <th>Sede</th><th>Seccion</th><th style="width:120px">Fecha/Periodo</th>
            <th>Detalle del Incumplimiento</th><th style="width:60px">Valor</th>
          </tr></thead><tbody>${filasV}</tbody></table>`;
      }).join("")}
    </body></html>`;

    const blob = new Blob([htmlResumen], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Politicas_" + (sedeSel !== "Todas" ? sedeSel + "_" : "") + (mesSel !== "Todos" ? mesSel + "_" : "") + fecha + ".xls";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {mostrarInforme && <InformeView politicas={politicas} totalEmpleados={totalEmpleados} sede={sedeSel} mes={mesSel} parametros={parametros} marcaciones={marcacionesFiltradas} onCerrar={() => setMostrarInforme(false)} />}
      {/* HEADER */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div>
          <h2 style={{color:C.w,fontSize:18,fontWeight:700,margin:0}}>Politicas Laborales</h2>
          <p style={{color:C.td,fontSize:11,margin:"3px 0 0",display:"flex",alignItems:"center",gap:6}}>
            {calculando
              ? <><span style={{width:10,height:10,borderRadius:"50%",border:"2px solid "+C.p,borderTopColor:"transparent",display:"inline-block",animation:"spin 0.7s linear infinite"}} /><span style={{color:C.p}}>Calculando politicas... {progresoPol}%</span><span style={{width:80,height:4,background:C.bd,borderRadius:2,overflow:"hidden",display:"inline-block",marginLeft:6}}><span style={{width:progresoPol+"%",height:"100%",background:C.p,display:"block",borderRadius:2,transition:"width 0.2s"}} /></span></>
              : <span>{totalEmpleados} empleados evaluados {sedeSel !== "Todas" ? `en ${sedeSel}` : "en todas las sedes"}{mesSel !== "Todos" ? ` · ${mesSel}` : ""} | 9 politicas activas</span>
            }
          </p>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          {sedes.length > 1 && <Pill label="Sede" value={sedeSel} options={sedes} onChange={(v) => { setSedeSel(v); setPolSeleccionada(null); setPaginaPol(0); }} />}
          {meses.length > 1 && <Pill label="Mes" value={mesSel} options={meses} onChange={(v) => { setMesSel(v); setPolSeleccionada(null); setPaginaPol(0); }} />}
          <button onClick={() => setMostrarConfig(!mostrarConfig)} style={{padding:"6px 12px",borderRadius:7,fontSize:11,fontWeight:500,background:mostrarConfig?C.pg:"transparent",border:"1px solid "+(mostrarConfig?C.p:C.bd),color:mostrarConfig?C.p:C.tm,cursor:"pointer"}}>
            {mostrarConfig ? "Ocultar Parametros" : "Configurar Parametros"}
          </button>
          <button onClick={() => setMostrarInforme(true)} disabled={calculando} style={{padding:"6px 12px",borderRadius:7,fontSize:11,fontWeight:600,background:calculando?"#ccc":"linear-gradient(135deg,#1C5A2A,#7dd105)",border:"none",color:"#fff",cursor:calculando?"not-allowed":"pointer",opacity:calculando?0.6:1}}>
            {calculando ? "Calculando..." : "Generar Informe"}
          </button>
          <button onClick={() => { setPolsParaExcel(new Set(politicas.map(p => p.id))); setMostrarModalExcel(true); }} disabled={calculando || politicas.length === 0} style={{padding:"6px 12px",borderRadius:7,fontSize:11,fontWeight:600,background:C.sf,border:"1px solid "+(calculando?"#ccc":C.p),color:calculando?"#aaa":C.p,cursor:calculando?"not-allowed":"pointer",opacity:calculando?0.6:1}}>
            {calculando ? "Espera..." : "Exportar Excel"}
          </button>
        </div>
      </div>

      {/* MODAL SELECCIÓN POLÍTICAS PARA EXCEL */}
      {mostrarModalExcel && polsParaExcel && (
        <div style={{position:"fixed",inset:0,zIndex:9990,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={() => setMostrarModalExcel(false)}>
          <div style={{background:C.sf,borderRadius:16,width:480,maxWidth:"95vw",boxShadow:"0 24px 60px rgba(0,0,0,0.3)",border:"1px solid "+C.bd,overflow:"hidden"}} onClick={e => e.stopPropagation()}>
            <div style={{background:"linear-gradient(135deg,#0f1f13,#1f6b2e)",padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{color:"#e8f5eb",fontSize:14,fontWeight:700}}>Exportar Excel</div>
                <div style={{color:"#7aab85",fontSize:11,marginTop:2}}>Selecciona las políticas a incluir en el archivo</div>
              </div>
              <button onClick={() => setMostrarModalExcel(false)} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#e8f5eb",width:28,height:28,borderRadius:7,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>
            <div style={{padding:"10px 20px",borderBottom:"1px solid "+C.bd,display:"flex",gap:8,alignItems:"center"}}>
              <span style={{color:C.td,fontSize:11,flex:1}}>{polsParaExcel.size} de {politicas.length} políticas seleccionadas</span>
              <button onClick={() => setPolsParaExcel(new Set(politicas.map(p => p.id)))} style={{padding:"4px 10px",borderRadius:6,fontSize:10,fontWeight:600,border:"1px solid "+C.bd,background:C.sa,color:C.tm,cursor:"pointer"}}>Todas</button>
              <button onClick={() => setPolsParaExcel(new Set())} style={{padding:"4px 10px",borderRadius:6,fontSize:10,fontWeight:600,border:"1px solid "+C.bd,background:C.sa,color:C.tm,cursor:"pointer"}}>Ninguna</button>
              <button onClick={() => setPolsParaExcel(new Set(politicas.filter(p => p.empleadosAfectados > 0).map(p => p.id)))} style={{padding:"4px 10px",borderRadius:6,fontSize:10,fontWeight:600,border:"1px solid "+C.dg,background:"rgba(220,38,38,0.06)",color:C.dg,cursor:"pointer"}}>Solo con infracciones</button>
            </div>
            <div style={{padding:"8px 12px",maxHeight:320,overflowY:"auto"}}>
              {politicas.map((p) => {
                const sel = polsParaExcel.has(p.id);
                const colorCump = p.cumplimiento >= 90 ? C.p : p.cumplimiento >= 70 ? C.ac : C.dg;
                const bgBadge = p.cumplimiento >= 90 ? "rgba(31,107,46,0.1)" : p.cumplimiento >= 70 ? "rgba(180,83,9,0.1)" : "rgba(220,38,38,0.1)";
                return (
                  <div key={p.id} onClick={() => setPolsParaExcel(prev => { const n = new Set(prev); sel ? n.delete(p.id) : n.add(p.id); return n; })}
                    style={{display:"flex",alignItems:"center",gap:12,padding:"10px",borderRadius:9,marginBottom:3,cursor:"pointer",background:sel?C.pg:"transparent",border:"1px solid "+(sel?C.bd:"transparent"),transition:"all 0.1s"}}>
                    <div style={{width:18,height:18,borderRadius:5,border:"2px solid "+(sel?C.p:C.bd),background:sel?C.p:"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s"}}>
                      {sel && <span style={{color:"#fff",fontSize:11,fontWeight:700,lineHeight:1}}>✓</span>}
                    </div>
                    <span style={{width:22,height:22,borderRadius:6,background:sel?C.p:C.sa,color:sel?"#fff":C.tm,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{p.num}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:sel?C.t:C.tm,fontSize:12,fontWeight:sel?600:400,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.nombre}</div>
                      <div style={{color:C.td,fontSize:10,marginTop:1}}>{p.empleadosAfectados} afectados · {p.totalViolaciones} infracciones</div>
                    </div>
                    <span style={{padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,color:colorCump,background:bgBadge,flexShrink:0}}>{p.cumplimiento}%</span>
                  </div>
                );
              })}
            </div>
            <div style={{padding:"14px 20px",borderTop:"1px solid "+C.bd,display:"flex",gap:8,justifyContent:"flex-end",alignItems:"center"}}>
              <span style={{color:C.dg,fontSize:11,flex:1}}>{polsParaExcel.size === 0 ? "⚠ Selecciona al menos una política" : ""}</span>
              <button onClick={() => setMostrarModalExcel(false)} style={{padding:"8px 16px",borderRadius:8,fontSize:11,border:"1px solid "+C.bd,background:"transparent",color:C.tm,cursor:"pointer"}}>Cancelar</button>
              <button disabled={polsParaExcel.size === 0} onClick={() => { exportarPolExcel(polsParaExcel); setMostrarModalExcel(false); }}
                style={{padding:"8px 18px",borderRadius:8,fontSize:11,fontWeight:700,background:polsParaExcel.size===0?"#ccc":"linear-gradient(135deg,#1f6b2e,#3a9a50)",border:"none",color:"#fff",cursor:polsParaExcel.size===0?"not-allowed":"pointer",boxShadow:polsParaExcel.size>0?"0 2px 8px rgba(31,107,46,0.3)":"none"}}>
                ⬇ Descargar {polsParaExcel.size > 0 ? `(${polsParaExcel.size} política${polsParaExcel.size > 1 ? "s" : ""})` : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PANEL DE CONFIGURACION */}
      {mostrarConfig && (
        <div style={{padding:16,borderRadius:14,background:"linear-gradient(145deg,"+C.sf+","+C.sa+")",border:"1px solid "+C.bd,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <h3 style={{color:C.w,fontSize:13,fontWeight:600,margin:0}}>Parametros de Evaluacion</h3>
            <button onClick={resetParams} style={{padding:"4px 10px",borderRadius:5,fontSize:10,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",color:"#fca5a5",cursor:"pointer"}}>Restaurar Defaults</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))",gap:12}}>
            {/* Jornada */}
            <div style={{padding:12,borderRadius:10,background:C.bg,border:"1px solid "+C.bd}}>
              <div style={{color:C.p,fontSize:10,fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>Jornada (Pol 1, 3)</div>
              <ParamInput label="Jornada normal (hrs)" value={parametros.jornadaNormal} onChange={(v) => setParam("jornadaNormal", v)} ayuda="Duracion estandar del turno" />
              <ParamInput label="Max horas/dia" value={parametros.jornadaMaxDia} onChange={(v) => setParam("jornadaMaxDia", v)} ayuda="Si supera esto = Jornada Excesiva" />
              <ParamInput label="Jornada extendida (hrs)" value={parametros.jornadaExtendidaHoras} onChange={(v) => setParam("jornadaExtendidaHoras", v)} ayuda="Umbral para Pol 1 (sin descanso)" />
            </div>
            {/* Breaks */}
            <div style={{padding:12,borderRadius:10,background:C.bg,border:"1px solid "+C.bd}}>
              <div style={{color:C.s,fontSize:10,fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>Breaks (Pol 2, 5)</div>
              <ParamInput label="Break minimo (min)" value={parametros.breakMinimoMin} onChange={(v) => setParam("breakMinimoMin", v)} ayuda="Pol 2: Menos de esto = sin descanso real" />
              <ParamInput label="Break normal (min)" value={parametros.breakNormalMax} onChange={(v) => setParam("breakNormalMax", v)} ayuda="Duracion estandar del break corto" />
              <ParamInput label="Tolerancia (min)" value={parametros.breakTolerancia} onChange={(v) => setParam("breakTolerancia", v)} ayuda="Margen extra sobre el break normal" />
              <ParamInput label="Umbral turno partido (min)" value={parametros.breakMaxPermitido} onChange={(v) => setParam("breakMaxPermitido", v)} ayuda=">=esto se considera turno partido, no break" />
            </div>
            {/* Turnos Partidos */}
            <div style={{padding:12,borderRadius:10,background:C.bg,border:"1px solid "+C.bd}}>
              <div style={{color:"#8b5cf6",fontSize:10,fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>Turnos Partidos (Pol 4)</div>
              <ParamInput label="TP legal minimo (min)" value={parametros.turnoPartidoLegalMin} onChange={(v) => setParam("turnoPartidoLegalMin", v)} ayuda="2h50m=170min. Menos de esto = TP ilegal" />
              <ParamInput label="Max TP por semana" value={parametros.turnoPartidoMaxSemana} onChange={(v) => setParam("turnoPartidoMaxSemana", v)} />
              <ParamInput label="Aplica a cargos" value={parametros.turnoPartidoAplicaCargos} onChange={(v) => setParam("turnoPartidoAplicaCargos", v)} tipo="text" ayuda="Separados por coma. Vacio = todos" />
            </div>
            {/* Pol 6: Domingos Supervisores */}
            <div style={{padding:12,borderRadius:10,background:C.bg,border:"1px solid "+C.bd}}>
              <div style={{color:"#ec4899",fontSize:10,fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>Pol 6: Domingos Supervisores</div>
              <ParamInput label="Max domingos/mes" value={parametros.domingoMaxSupervisores} onChange={(v) => setParam("domingoMaxSupervisores", v)} ayuda="Son OCASIONALES, no pueden superar este limite" />
              <ParamInput label="Cargos ocasionales" value={parametros.cargosSupervisor} onChange={(v) => setParam("cargosSupervisor", v)} tipo="text" ayuda="Estos cargos aplican Pol 6 (separados por coma)" />
              <div style={{marginTop:6,padding:6,borderRadius:4,background:"rgba(236,72,153,0.08)",border:"1px solid rgba(236,72,153,0.15)"}}>
                <span style={{color:"#f472b6",fontSize:8,lineHeight:"1.4",display:"block"}}>Estos cargos son ocasionales: max {parametros.domingoMaxSupervisores} domingos/mes. Si trabajan mas, incumplen.</span>
              </div>
            </div>
            {/* Pol 7: Domingos Personal Base */}
            <div style={{padding:12,borderRadius:10,background:C.bg,border:"1px solid "+C.bd}}>
              <div style={{color:"#a78bfa",fontSize:10,fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>Pol 7: Domingos Personal Base</div>
              <ParamInput label="Min domingos libres/mes" value={parametros.domingoMinDescansoBase} onChange={(v) => setParam("domingoMinDescansoBase", v)} ayuda="Deben descansar al menos N domingo(s) al mes" />
              <div style={{marginTop:6,padding:6,borderRadius:4,background:"rgba(167,139,250,0.08)",border:"1px solid rgba(167,139,250,0.15)"}}>
                <span style={{color:"#c4b5fd",fontSize:8,lineHeight:"1.4",display:"block"}}>Aplica a TODOS los cargos que NO estan en Pol 6. Pueden ser habituales pero deben descansar al menos {parametros.domingoMinDescansoBase} domingo(s).</span>
              </div>
            </div>
            {/* Horas Extra */}
            <div style={{padding:12,borderRadius:10,background:C.bg,border:"1px solid "+C.bd}}>
              <div style={{color:C.ac,fontSize:10,fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>Horas Extra (Pol 8, 9)</div>
              <ParamInput label="Max HE por semana" value={parametros.horasExtraMaxSemana} onChange={(v) => setParam("horasExtraMaxSemana", v)} ayuda="Pol 8: Acumulado semanal" />
              <ParamInput label="Max HE por dia" value={parametros.horasExtraMaxDia} onChange={(v) => setParam("horasExtraMaxDia", v)} ayuda={`Pol 9: Sobre jornada normal de ${parametros.jornadaNormal}h`} />
            </div>
          </div>
        </div>
      )}

      {/* RESUMEN RAPIDO */}
      <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:16}}>
        {[
          { l: "Cumplimiento Promedio", v: resumen.promedio + "%", c: colorCumpl(resumen.promedio) },
          { l: "Mejor Politica", v: `${resumen.mejor.nombre || resumen.mejor.id} (${resumen.mejor.cumplimiento}%)`, c: C.p },
          { l: "Peor Politica", v: `${resumen.peor.nombre || resumen.peor.id} (${resumen.peor.cumplimiento}%)`, c: C.dg },
          { l: "Empleados Evaluados", v: totalEmpleados, c: C.s },
        ].map((s, i) => (
          <div key={i} style={{padding:14,borderRadius:12,background:"linear-gradient(145deg,"+C.sf+","+C.sa+")",border:"1px solid "+C.bd,flex:"1 1 180px"}}>
            <div style={{color:C.tm,fontSize:10,marginBottom:5}}>{s.l}</div>
            <div style={{fontSize:18,fontWeight:700,color:s.c,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* TARJETAS DE 9 POLITICAS */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10,marginBottom:16}}>
        {politicas.map((p) => {
          const sc = colorCumpl(p.cumplimiento);
          const activa = polSeleccionada === p.id;
          return (
            <div key={p.id} onClick={() => { setPolSeleccionada(activa ? null : p.id); setBusquedaPol(""); setPaginaPol(0); }}
              style={{padding:14,borderRadius:12,background:C.sf,border:"2px solid "+(activa?C.p:C.bd),cursor:"pointer",transition:"all 0.15s",boxShadow:activa?"0 4px 16px rgba(31,107,46,0.15)":"0 1px 3px rgba(31,107,46,0.05)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flex:1}}>
                  <span style={{fontSize:15}}>{p.icono}</span>
                  <div>
                    <div style={{color:C.td,fontSize:8,fontWeight:700}}>POL {p.num}</div>
                    <span style={{color:C.t,fontSize:11,fontWeight:600}}>{p.nombre}</span>
                  </div>
                </div>
                <span style={{padding:"2px 8px",borderRadius:12,fontSize:11,fontWeight:700,background:sc+"20",color:sc,flexShrink:0}}>{p.cumplimiento}%</span>
              </div>
              <p style={{color:C.td,fontSize:9,margin:"0 0 6px"}}>{p.desc}</p>
              <div style={{height:5,borderRadius:3,background:"#e8f2ea",overflow:"hidden",marginBottom:6}}>
                <div style={{height:"100%",borderRadius:3,width:p.cumplimiento+"%",background:sc,transition:"width 0.5s"}} />
              </div>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{color:C.td,fontSize:9}}>Incumplen: <b style={{color:sc}}>{p.empleadosAfectados}</b></span>
                <span style={{color:C.td,fontSize:9}}>Violaciones: {p.totalViolaciones}</span>
                <span style={{color:C.td,fontSize:9}}>De {totalEmpleados}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* DETALLE DE VIOLADORES */}
      {polActiva && (
        <div style={{padding:20,borderRadius:16,background:C.sf,border:"1px solid "+C.bd,marginBottom:16,boxShadow:"0 2px 8px rgba(31,107,46,0.08)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:18}}>{polActiva.icono}</span>
              <div>
                <h3 style={{color:C.w,fontSize:14,fontWeight:600,margin:0}}>Pol {polActiva.num}: {polActiva.nombre}</h3>
                <p style={{color:C.td,fontSize:10,margin:"2px 0 0"}}>{polActiva.desc} | {polActiva.empleadosAfectados} empleados, {polActiva.totalViolaciones} violaciones</p>
              </div>
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <input value={busquedaPol} onChange={(e) => { setBusquedaPol(e.target.value); setPaginaPol(0); }}
                placeholder="Buscar empleado, cargo..."
                style={{padding:"6px 10px",borderRadius:7,fontSize:11,background:C.sa,border:"1px solid "+C.bd,color:C.t,outline:"none",width:200,boxSizing:"border-box"}} />
              <button onClick={() => { setPolSeleccionada(null); setBusquedaPol(""); }}
                style={{padding:"6px 10px",borderRadius:7,fontSize:10,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",color:"#fca5a5",cursor:"pointer"}}>Cerrar</button>
            </div>
          </div>

          {violadoresFiltrados.length === 0 ? (
            <p style={{color:C.tm,textAlign:"center",padding:20,fontSize:12}}>Sin violaciones para esta politica</p>
          ) : (
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                <thead><tr>
                  {["Empleado", "Cargo", "Sede", "Seccion", "Fecha/Periodo", "Detalle del Incumplimiento"].map((h) => (
                    <th key={h} style={{padding:"7px 6px",textAlign:"left",color:C.tm,fontWeight:600,borderBottom:"1px solid "+C.bd,whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {violadoresPagina.map((v, i) => {
                    const fondoFila = i % 2 === 0 ? "transparent" : C.zebra;
                    return (
                      <tr key={paginaPol * VIOL_POR_PAGINA + i} style={{background:fondoFila}}>
                        <td style={{padding:"5px 6px",color:C.t,whiteSpace:"nowrap",maxWidth:150,overflow:"hidden",textOverflow:"ellipsis"}} title={v.nombre}>{v.nombre}</td>
                        <td style={{padding:"5px 6px",color:C.tm,whiteSpace:"nowrap",fontSize:9}}>{v.cargo}</td>
                        <td style={{padding:"5px 6px",color:C.tm,whiteSpace:"nowrap"}}>{v.sede}</td>
                        <td style={{padding:"5px 6px",color:C.tm,whiteSpace:"nowrap"}}>{v.seccion}</td>
                        <td style={{padding:"5px 6px",color:C.ac,fontWeight:500,fontSize:9}}>{v.fecha}</td>
                        <td style={{padding:"5px 6px",color:C.dg,fontWeight:500}}>{v.detalle}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {totalPaginasViol > 1 && (
                <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:6,marginTop:10}}>
                  <button onClick={() => setPaginaPol(Math.max(0, paginaPol - 1))} disabled={paginaPol === 0}
                    style={{padding:"4px 9px",borderRadius:5,fontSize:10,background:paginaPol===0?C.bg:C.sa,border:"1px solid "+C.bd,color:paginaPol===0?C.td:C.t,cursor:paginaPol===0?"default":"pointer"}}>Ant</button>
                  <span style={{color:C.tm,fontSize:10}}>Pag {paginaPol + 1} de {totalPaginasViol}</span>
                  <button onClick={() => setPaginaPol(Math.min(totalPaginasViol - 1, paginaPol + 1))} disabled={paginaPol >= totalPaginasViol - 1}
                    style={{padding:"4px 9px",borderRadius:5,fontSize:10,background:paginaPol>=totalPaginasViol-1?C.bg:C.sa,border:"1px solid "+C.bd,color:paginaPol>=totalPaginasViol-1?C.td:C.t,cursor:paginaPol>=totalPaginasViol-1?"default":"pointer"}}>Sig</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* GRAFICOS */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{padding:20,borderRadius:16,background:C.sf,border:"1px solid "+C.bd,boxShadow:"0 1px 4px rgba(31,107,46,0.07)"}}>
          <h3 style={{color:C.w,fontSize:12,fontWeight:700,margin:"0 0 10px"}}>Cumplimiento por Politica</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ReBarChart data={barData} layout="vertical" margin={{left:35}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.bd} />
              <XAxis type="number" tick={{fill:C.tm,fontSize:9}} />
              <YAxis dataKey="name" type="category" tick={{fill:C.tm,fontSize:9}} width={35} />
              <Tooltip content={<Tip />} />
              <Bar dataKey="cumple" name="Cumple" stackId="a" fill={C.p} />
              <Bar dataKey="noCumple" name="No Cumple" stackId="a" fill={C.dg} />
            </ReBarChart>
          </ResponsiveContainer>
        </div>
        <div style={{padding:20,borderRadius:16,background:C.sf,border:"1px solid "+C.bd,boxShadow:"0 1px 4px rgba(31,107,46,0.07)"}}>
          <h3 style={{color:C.w,fontSize:12,fontWeight:700,margin:"0 0 10px"}}>Radar de Cumplimiento</h3>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData}>
              <PolarGrid stroke={C.bd} />
              <PolarAngleAxis dataKey="ind" tick={{fill:C.tm,fontSize:8}} />
              <PolarRadiusAxis angle={90} domain={[0,100]} tick={{fill:C.td,fontSize:8}} />
              <Radar dataKey="val" stroke={C.p} fill={C.p} fillOpacity={0.2} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}


/* === RULES VIEW === */
function RulesView() {
  const rules = [
    {t:"Clasificacion de Breaks",d:"Break Corto (<45min): descanso normal, politica permite 15min + 3min tolerancia. Turno Partido Ilegal (45-170min): no es break corto ni TP legal. Turno Partido Legal (>=170min / 2h50m): cumple el minimo legal para turno partido."},
    {t:"Grilla Horaria (1/0)",d:"Cada celda horaria indica presencia del empleado. Si la hora esta entre ENTRADA y SALIDA (excluyendo bloques de turno partido), se marca 1. De lo contrario, 0."},
    {t:"Tipo de Jornada",d:"Jorn Con = Jornada Continua (sin turno partido). Tur Par Legal = tiene turno partido >=2h50m. Tur Par Ilegal = turno partido <2h50m (no cumple). Sin Marcacion = no registro entrada/salida."},
    {t:"POL 1: Jornadas Extendidas sin Descanso",d:"Trabaja mas del umbral de jornada extendida (default 10h) y su break corto total fue menor al minimo (default 8min). No tuvo descanso real."},
    {t:"POL 2: Break Menor al Minimo",d:"Tuvo break corto pero fue inferior al minimo establecido (default 8min). Indica que el descanso fue insuficiente."},
    {t:"POL 3: Jornadas Excesivas",d:"Horas efectivas superan el maximo diario permitido (default 9h). La jornada normal es 7h, el tope absoluto es 9h."},
    {t:"POL 4: Turnos Partidos Excesivos",d:"Mas turnos partidos en la semana de los permitidos. Distingue entre legales (>=2h50m) e ilegales (<2h50m). Configurable por cargo."},
    {t:"POL 5: Extension de Breaks",d:"Break corto que excede lo permitido (15min + 3min tolerancia = 18min) O turno partido ilegal (45-170min, zona gris que no es ni break ni TP legal)."},
    {t:"POL 6: Domingos Supervisores",d:"Supervisores son ocasionales: maximo N domingos por mes (default 2). Si trabajan mas, se considera habitual y viola la politica."},
    {t:"POL 7: Domingos Personal de Base",d:"Personal base puede ser habitual, pero debe haber equilibrio: al menos N domingo(s) libre(s) al mes (default 1). No todos los domingos trabajados."},
    {t:"POL 8: HE Semanal",d:"Horas extra acumuladas en la semana no deben superar el limite (default 12h). Se calcula como: horas trabajadas - jornada normal, sumado por semana."},
    {t:"POL 9: HE Diaria",d:"Horas extra en un dia no deben superar el limite (default 2h). Si la jornada normal es 7h, trabajar mas de 9h (7+2) genera violacion."},
    {t:"Curva de Venta vs Personal",d:"Suma de 1s de la grilla horaria por hora (promedio por dia) comparado con transacciones de facturacion. Permite ver si el personal esta alineado con la demanda."},
    {t:"Quincena Retail",d:"Dias de alto flujo de ventas: 1, 2, 3, 15, 16, 17, 30, 31 del mes (y 28 de febrero). Filtro para analizar dotacion en dias criticos."}
  ];

  return (
    <div>
      <h2 style={{color:C.w,fontSize:18,fontWeight:700,margin:"0 0 6px"}}>Manual de Reglas y Metodologia</h2>
      <p style={{color:C.td,fontSize:12,margin:"0 0 16px"}}>Como se toman las decisiones y se calculan los indicadores</p>
      {rules.map(function(r, i) {
        return (
          <div key={"rule-"+i} style={{padding:14,borderRadius:12,background:C.sf,border:"1px solid "+C.bd,marginBottom:8,boxShadow:"0 1px 3px rgba(31,107,46,0.06)"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              <div style={{width:24,height:24,borderRadius:6,background:C.pg,display:"flex",alignItems:"center",justifyContent:"center",color:C.p,fontSize:11,fontWeight:700,flexShrink:0}}>{String(i+1)}</div>
              <span style={{color:C.w,fontSize:13,fontWeight:600}}>{r.t}</span>
            </div>
            <p style={{color:C.tm,fontSize:12,lineHeight:"1.5",margin:"0",paddingLeft:"32px"}}>{r.d}</p>
          </div>
        );
      })}
    </div>
  );
}


/* ============================================================
   AUDITORIA VIEW — paso a paso de cálculos por empleado
   ============================================================ */
/* ============================================================
   1. EFICIENCIA VIEW — Personal vs Ventas por hora/sede
   ============================================================ */
function EficienciaView({ marc, fact }) {
  const sedes = useMemo(() => {
    const s = {}; marc.forEach(m => { if (m.DEPENDENCIA) s[m.DEPENDENCIA] = 1; });
    return ["Todas", ...Object.keys(s).sort()];
  }, [marc]);
  const meses = useMemo(() => {
    const ORD = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    const s = {};
    marc.forEach(m => { if (m.MES) s[m.MES] = 1; });
    fact.forEach(f => { if (f.mes) s[f.mes] = 1; });
    return ["Todos", ...Object.keys(s).sort((a,b) => ORD.indexOf(a)-ORD.indexOf(b))];
  }, [marc, fact]);

  const [sede, setSede] = useState("Todas");
  const [mes,  setMes]  = useState("Todos");

  const datos = useMemo(() => {
    const fm = marc.filter(m => (sede==="Todas"||m.DEPENDENCIA===sede) && (mes==="Todos"||m.MES===mes));
    const ff = fact.filter(f => (sede==="Todas"||f.sede===sede) && (mes==="Todos"||f.mes===mes));
    const fechas = {}; fm.forEach(m => { fechas[m.FECHA]=1; });
    const nd = Math.max(Object.keys(fechas).length, 1);
    return HC.map((hc, i) => {
      const hNum = HC_NUM[i];
      const personal = fm.reduce((s,m) => s+(m[hc]||0), 0) / nd;
      const factH = ff.filter(f => f.hora === hNum);
      const diasF = {}; factH.forEach(f => { diasF[f.dia+"_"+f.mes]=1; });
      const ndf = Math.max(Object.keys(diasF).length, 1);
      const ventas = factH.reduce((s,f) => s+(f.nfact||0), 0) / ndf;
      const eficiencia = personal > 0 ? Math.round((ventas/personal)*10)/10 : 0;
      return { hora: HL[i], hNum, personal: Math.round(personal*10)/10, ventas: Math.round(ventas*10)/10, eficiencia };
    });
  }, [marc, fact, sede, mes]);

  const rankingSedes = useMemo(() => {
    const ORD = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    return sedes.filter(s=>s!=="Todas").map(s => {
      const fm = marc.filter(m => m.DEPENDENCIA===s && (mes==="Todos"||m.MES===mes));
      const ff = fact.filter(f => f.sede===s && (mes==="Todos"||f.mes===mes));
      const fechas={}; fm.forEach(m=>{fechas[m.FECHA]=1;});
      const nd = Math.max(Object.keys(fechas).length,1);
      const totalPersonal = fm.reduce((sum,m) => { let p=0; HC.forEach(hc=>{p+=(m[hc]||0);}); return sum+p; },0)/nd;
      const diasF={}; ff.forEach(f=>{diasF[f.dia+"_"+f.mes]=1;});
      const ndf = Math.max(Object.keys(diasF).length,1);
      const ventas = ff.reduce((s,f)=>s+(f.nfact||0),0)/ndf;
      const ef = totalPersonal>0 ? Math.round((ventas/totalPersonal)*10)/10 : 0;
      return { sede:s, personal:Math.round(totalPersonal), ventas:Math.round(ventas), eficiencia:ef };
    }).sort((a,b) => b.eficiencia-a.eficiencia);
  }, [marc, fact, mes, sedes]);

  const hasFact = fact.length > 0;

  return (
    <div>
      <div style={{marginBottom:20}}>
        <h2 style={{color:C.w,fontSize:18,fontWeight:800,margin:"0 0 4px"}}>Eficiencia: Personal ↔ Ventas</h2>
        <p style={{color:C.td,fontSize:12,margin:0}}>¿En qué horas tienes más personal del necesario? ¿Cuándo falta cobertura?</p>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        <Pill label="Sede" value={sede} options={sedes} onChange={setSede} />
        <Pill label="Mes"  value={mes}  options={meses}  onChange={setMes} />
      </div>

      {!hasFact && (
        <div style={{padding:"14px 18px",borderRadius:12,background:"rgba(180,83,9,0.08)",border:"1px solid rgba(180,83,9,0.25)",marginBottom:20,display:"flex",gap:12,alignItems:"center"}}>
          <span style={{fontSize:18}}>⚠️</span>
          <div>
            <div style={{fontWeight:700,color:C.ac,fontSize:13}}>Sin datos de ventas</div>
            <div style={{color:C.td,fontSize:11,marginTop:2}}>Carga el archivo FACTURAS.xlsx para ver la correlación ventas/personal. Por ahora se muestra solo la cobertura de personal por hora.</div>
          </div>
        </div>
      )}

      <div style={{padding:"20px",borderRadius:14,background:C.sf,border:"1px solid "+C.bd,boxShadow:"0 1px 4px rgba(31,107,46,0.07)",marginBottom:20}}>
        <div style={{marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div>
            <div style={{fontWeight:700,fontSize:14,color:C.t}}>Personal vs Transacciones por Hora</div>
            <div style={{fontSize:11,color:C.td,marginTop:2}}>Promedio diario · {sede!=="Todas"?sede:"todas las sedes"} · {mes!=="Todos"?mes:"todos los meses"}</div>
          </div>
          <div style={{display:"flex",gap:16,fontSize:11,color:C.td,flexWrap:"wrap"}}>
            <span><span style={{display:"inline-block",width:10,height:10,borderRadius:2,background:"#1f6b2e",marginRight:4}}/>Personas presentes</span>
            {hasFact && <span><span style={{display:"inline-block",width:10,height:10,borderRadius:2,background:"#f59e0b",marginRight:4}}/>Transacciones de venta</span>}
            {hasFact && <span><span style={{display:"inline-block",width:10,height:10,borderRadius:"50%",background:"#3b82f6",marginRight:4}}/>Eficiencia (ventas por persona)</span>}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={datos} margin={{top:8,right:30,bottom:0,left:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.bd} />
            <XAxis dataKey="hora" tick={{fontSize:10,fill:C.td}} />
            <YAxis yAxisId="izq" tick={{fontSize:10,fill:C.td}} label={{value:"Personas",angle:-90,position:"insideLeft",fill:C.td,fontSize:10}} />
            {hasFact && <YAxis yAxisId="der" orientation="right" tick={{fontSize:10,fill:C.td}} label={{value:"Transacciones",angle:90,position:"insideRight",fill:C.td,fontSize:10}} />}
            <Tooltip contentStyle={{background:C.sf,border:"1px solid "+C.bd,borderRadius:8,fontSize:11}}
              formatter={(val,name) => [val, name]} />
            <Bar yAxisId="izq" dataKey="personal" fill="#1f6b2e" opacity={0.85} radius={[3,3,0,0]} name="Personas presentes" />
            {hasFact && <Bar yAxisId="izq" dataKey="ventas" fill="#f59e0b" opacity={0.65} radius={[3,3,0,0]} name="Transacciones de venta" />}
            {hasFact && <Line yAxisId="der" type="monotone" dataKey="eficiencia" stroke="#3b82f6" strokeWidth={2.5} dot={{r:3}} name="Eficiencia (ventas/persona)" />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>
        {[
          { titulo:"🔴 Posible sobrecobertura", sub:"Muchas personas, pocas transacciones",
            items: hasFact
              ? datos.filter(d=>d.personal>0&&d.ventas>=0).sort((a,b)=>(b.personal/Math.max(b.ventas,0.1))-(a.personal/Math.max(a.ventas,0.1))).slice(0,5)
              : datos.filter(d=>d.personal>0).sort((a,b)=>b.personal-a.personal).slice(0,5),
            color:C.dg, bg:"rgba(220,38,38,0.06)", border:"rgba(220,38,38,0.2)" },
          { titulo:"🟢 Horas más productivas", sub:"Mejor ratio transacciones por persona",
            items: hasFact
              ? datos.filter(d=>d.eficiencia>0).sort((a,b)=>b.eficiencia-a.eficiencia).slice(0,5)
              : datos.filter(d=>d.personal>0).sort((a,b)=>b.personal-a.personal).slice(0,5),
            color:C.p, bg:"rgba(31,107,46,0.06)", border:"rgba(31,107,46,0.2)" },
        ].map((card,ci) => (
          <div key={ci} style={{borderRadius:12,border:"1px solid "+card.border,overflow:"hidden",boxShadow:"0 1px 4px rgba(31,107,46,0.07)"}}>
            <div style={{padding:"13px 18px",background:card.bg,borderBottom:"1px solid "+card.border}}>
              <div style={{fontWeight:700,fontSize:13,color:C.t}}>{card.titulo}</div>
              <div style={{fontSize:11,color:C.td,marginTop:2}}>{card.sub}</div>
            </div>
            <div style={{background:C.sf}}>
              {card.items.map((d,i) => (
                <div key={d.hora} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 18px",borderBottom:"1px solid "+C.bd}}>
                  <span style={{width:26,height:26,borderRadius:6,background:card.bg,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:11,color:card.color,flexShrink:0}}>{i+1}</span>
                  <span style={{fontWeight:700,fontSize:15,color:C.t,fontFamily:"monospace",width:45}}>{d.hora}</span>
                  <span style={{fontSize:12,color:C.td,flex:1}}>{d.personal} personas presentes</span>
                  {hasFact && <span style={{fontSize:12,fontWeight:700,color:card.color}}>{d.eficiencia} ventas/persona</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {rankingSedes.length > 1 && (
        <div style={{borderRadius:12,border:"1px solid "+C.bd,overflow:"hidden",boxShadow:"0 1px 4px rgba(31,107,46,0.07)"}}>
          <div style={{padding:"13px 18px",background:"linear-gradient(135deg,#0f1f13,#1f6b2e)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{color:"#e8f5eb",fontWeight:700,fontSize:13}}>Ranking de Sedes por Eficiencia</div>
            <div style={{color:"#7aab85",fontSize:11}}>{mes!=="Todos"?mes:"todos los meses"}</div>
          </div>
          <div style={{background:C.sf}}>
            <div style={{display:"grid",gridTemplateColumns:"36px 1fr 120px 140px 160px",gap:0,padding:"10px 18px",borderBottom:"1px solid "+C.bd,background:C.sa}}>
              {["#","Sede","Personas/día","Ventas/día","Eficiencia"].map((h,i) => (
                <span key={i} style={{fontSize:10,fontWeight:700,color:C.td,textTransform:"uppercase",letterSpacing:"0.4px"}}>{h}</span>
              ))}
            </div>
            {rankingSedes.map((s,i) => {
              const pct = Math.round((s.eficiencia / (rankingSedes[0].eficiencia||1))*100);
              return (
                <div key={s.sede} style={{display:"grid",gridTemplateColumns:"36px 1fr 120px 140px 160px",gap:0,padding:"13px 18px",borderBottom:"1px solid "+C.bd,alignItems:"center"}}>
                  <span style={{width:26,height:26,borderRadius:6,background:i===0?"rgba(31,107,46,0.15)":C.sa,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:11,color:i===0?C.p:C.td}}>{i+1}</span>
                  <span style={{fontWeight:600,fontSize:13,color:C.t,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:12}}>{s.sede}</span>
                  <span style={{fontSize:12,color:C.tm}}>{s.personal} personas</span>
                  <span style={{fontSize:12,color:C.tm}}>{s.ventas} ventas</span>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{flex:1,height:6,borderRadius:3,background:C.sa,overflow:"hidden"}}>
                      <div style={{width:pct+"%",height:"100%",borderRadius:3,background:i===0?C.p:"#6bcf7f"}} />
                    </div>
                    <span style={{fontSize:12,fontWeight:700,color:i===0?C.p:C.tm,minWidth:35}}>{s.eficiencia}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   RIESGO VIEW — Top empleados con más infracciones
   ============================================================ */
function RiesgoView({ marc }) {
  const params = PARAMS_DEFAULT;
  const [sedeSel, setSedeSel] = useState("Todas");
  const [mesSel,  setMesSel]  = useState("Todos");
  const [polFiltro, setPolFiltro] = useState("Todas");
  const [detEmp, setDetEmp]   = useState(null);

  const sedes = useMemo(() => { const s={}; marc.forEach(m=>{if(m.DEPENDENCIA)s[m.DEPENDENCIA]=1;}); return ["Todas",...Object.keys(s).sort()]; }, [marc]);
  const meses = useMemo(() => {
    const ORD=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    const s={}; marc.forEach(m=>{if(m.MES)s[m.MES]=1;});
    return ["Todos",...Object.keys(s).sort((a,b)=>ORD.indexOf(a)-ORD.indexOf(b))];
  }, [marc]);

  const [riesgoResult, setRiesgoResult] = useState({ politicas: [], ranking: [] });
  const [riesgoCalc, setRiesgoCalc] = useState(false);

  useEffect(() => {
    const filtradas = marc.filter(m =>
      (sedeSel==="Todas"||m.DEPENDENCIA===sedeSel) && (mesSel==="Todos"||m.MES===mesSel)
    );
    if (filtradas.length === 0) { setRiesgoResult({ politicas:[], ranking:[] }); return; }
    setRiesgoCalc(true);
    const t = setTimeout(() => {
      const { politicas } = evaluarPoliticas(filtradas, params, "Todas");
      const empMap = {};
      politicas.forEach(pol => {
        pol.violadores.forEach(v => {
          if (!empMap[v.id]) empMap[v.id] = { id:v.id, nombre:v.nombre, cargo:v.cargo, sede:v.sede, total:0, pols:{}, infracciones:[] };
          empMap[v.id].total++;
          empMap[v.id].pols[pol.id] = (empMap[v.id].pols[pol.id]||0)+1;
          empMap[v.id].infracciones.push({ polId:pol.id, polNombre:pol.nombre, polNum:pol.num, fecha:v.fecha, detalle:v.detalle });
        });
      });
      setRiesgoResult({ politicas, ranking: Object.values(empMap).sort((a,b)=>b.total-a.total) });
      setRiesgoCalc(false);
    }, 50);
    return () => clearTimeout(t);
  }, [marc, sedeSel, mesSel]);

  const { politicas, ranking } = riesgoResult;

  const polsOpts = ["Todas", ...POLITICAS_DEF.map(p => p.id)];
  const polLabels = Object.fromEntries(POLITICAS_DEF.map(p => [p.id, "POL "+p.num+" — "+p.nombre]));
  const rankFiltrado = polFiltro==="Todas" ? ranking : ranking.filter(e=>e.pols[polFiltro]>0);
  const maxTotal = rankFiltrado[0]?.total || 1;
  const COLORES_POL = { JEX:"#dc2626",BRK:"#f59e0b",JXC:"#ef4444",TPE:"#8b5cf6",EBR:"#f97316",DSU:"#06b6d4",DBA:"#0ea5e9",HES:"#6366f1",HED:"#d946ef" };
  const NOMBRES_POL = Object.fromEntries(POLITICAS_DEF.map(p => [p.id, "Política "+p.num+": "+p.nombre]));

  return (
    <div>
      <div style={{marginBottom:20}}>
        <h2 style={{color:C.w,fontSize:18,fontWeight:800,margin:"0 0 4px"}}>Empleados en Riesgo</h2>
        <p style={{color:C.td,fontSize:12,margin:0}}>Ranking de empleados con más infracciones acumuladas en todas las políticas</p>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
        <Pill label="Sede"    value={sedeSel}   options={sedes}    onChange={setSedeSel} />
        <Pill label="Mes"     value={mesSel}    options={meses}    onChange={setMesSel} />
        <Pill label="Política" value={polFiltro} options={polsOpts} onChange={setPolFiltro} />
        {riesgoCalc
          ? <span style={{fontSize:11,color:C.p,display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,borderRadius:"50%",border:"2px solid "+C.p,borderTopColor:"transparent",display:"inline-block",animation:"spin 0.7s linear infinite"}} />Calculando...</span>
          : <span style={{fontSize:11,color:C.td,marginLeft:4}}>{rankFiltrado.length} empleados con infracciones</span>
        }
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12,marginBottom:20}}>
        {[
          { label:"Empleados con infracciones", val:ranking.length, color:"#dc2626", icon:"⚠️" },
          { label:"Total de infracciones", val:ranking.reduce((s,e)=>s+e.total,0), color:C.dg, icon:"📋" },
          { label:"Máximo por empleado", val:ranking[0]?.total||0, color:C.ac, icon:"🔺" },
          { label:"Política más incumplida", val:politicas.sort((a,b)=>b.totalViolaciones-a.totalViolaciones)[0]?.id||"-", color:C.p, icon:"📌" },
        ].map((k,i) => (
          <div key={i} style={{padding:"16px",borderRadius:12,background:C.sf,border:"1px solid "+C.bd,boxShadow:"0 1px 4px rgba(31,107,46,0.07)"}}>
            <div style={{fontSize:11,color:C.td,marginBottom:6,display:"flex",gap:6,alignItems:"center"}}><span>{k.icon}</span>{k.label}</div>
            <div style={{fontSize:22,fontWeight:800,color:k.color}}>{k.val}</div>
          </div>
        ))}
      </div>

      <div style={{borderRadius:12,border:"1px solid "+C.bd,overflow:"hidden",boxShadow:"0 1px 4px rgba(31,107,46,0.07)"}}>
        <div style={{padding:"13px 18px",background:"linear-gradient(135deg,#5a0a0a,#991b1b)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{color:"#fecaca",fontWeight:700,fontSize:13}}>Top {Math.min(rankFiltrado.length,50)} empleados — mayor cantidad de infracciones</div>
          <div style={{color:"#fca5a5",fontSize:11}}>Haz clic en una fila para ver el detalle completo</div>
        </div>
        <div style={{background:C.sf}}>
          <div style={{display:"grid",gridTemplateColumns:"40px 1fr 130px 90px 1fr",gap:0,padding:"10px 18px",borderBottom:"1px solid "+C.bd,background:C.sa}}>
            {["#","Empleado","Cargo","Total","Políticas incumplidas"].map((h,i)=>(
              <span key={i} style={{fontSize:10,fontWeight:700,color:C.td,textTransform:"uppercase",letterSpacing:"0.4px"}}>{h}</span>
            ))}
          </div>
          {rankFiltrado.slice(0,50).map((e,i) => (
            <div key={e.id} onClick={()=>setDetEmp(e)}
              style={{display:"grid",gridTemplateColumns:"40px 1fr 130px 90px 1fr",gap:0,padding:"13px 18px",
                borderBottom:"1px solid "+C.bd,alignItems:"center",cursor:"pointer",transition:"background 0.1s"}}
              onMouseEnter={ev=>ev.currentTarget.style.background=C.pg}
              onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>
              <span style={{width:28,height:28,borderRadius:7,background:i<3?"rgba(220,38,38,0.12)":C.sa,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:11,color:i<3?C.dg:C.td}}>{i+1}</span>
              <div style={{minWidth:0,paddingRight:10}}>
                <div style={{fontWeight:700,fontSize:13,color:C.t,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.nombre}</div>
                <div style={{fontSize:10,color:C.td,marginTop:1,fontFamily:"monospace"}}>{e.id} · {e.sede}</div>
              </div>
              <span style={{fontSize:11,color:C.tm,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.cargo}</span>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{flex:1,height:6,borderRadius:3,background:C.sa,overflow:"hidden"}}>
                  <div style={{width:Math.round(e.total/maxTotal*100)+"%",height:"100%",borderRadius:3,background:C.dg}}/>
                </div>
                <span style={{fontSize:14,fontWeight:800,color:C.dg,minWidth:24}}>{e.total}</span>
              </div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {Object.entries(e.pols).sort((a,b)=>b[1]-a[1]).map(([pid,cnt])=>(
                  <span key={pid} style={{padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:700,
                    background:(COLORES_POL[pid]||"#888")+"22",color:COLORES_POL[pid]||C.td,
                    border:"1px solid "+(COLORES_POL[pid]||"#888")+"44",whiteSpace:"nowrap"}}>
                    {pid} ×{cnt}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {rankFiltrado.length === 0 && (
            <div style={{padding:40,textAlign:"center",color:C.td,fontSize:13}}>
              ✅ Sin infracciones registradas con los filtros actuales
            </div>
          )}
        </div>
      </div>

      {detEmp && (
        <div style={{position:"fixed",inset:0,zIndex:9000,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setDetEmp(null)}>
          <div style={{background:C.bg,borderRadius:20,width:"min(800px,94vw)",maxHeight:"85vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 24px 80px rgba(0,0,0,0.4)"}} onClick={e=>e.stopPropagation()}>
            <div style={{background:"linear-gradient(135deg,#5a0a0a,#991b1b)",padding:"18px 24px",display:"flex",gap:14,alignItems:"center",flexShrink:0}}>
              <div style={{width:48,height:48,borderRadius:12,background:"rgba(252,165,165,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:800,color:"#fca5a5",flexShrink:0}}>{(detEmp.nombre||"?").charAt(0)}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:"#fef2f2",fontSize:15,fontWeight:800,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{detEmp.nombre}</div>
                <div style={{color:"#fca5a5",fontSize:12,marginTop:2}}>{detEmp.cargo} · {detEmp.sede} · Identificación: {detEmp.id}</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0,marginRight:10}}>
                <div style={{color:"#fca5a5",fontSize:26,fontWeight:800}}>{detEmp.total}</div>
                <div style={{color:"#fecaca",fontSize:10}}>infracciones totales</div>
              </div>
              <button onClick={()=>setDetEmp(null)} style={{width:34,height:34,borderRadius:8,background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",color:"#fef2f2",fontSize:20,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
            <div style={{overflowY:"auto",padding:"20px 24px",display:"flex",flexDirection:"column",gap:10}}>
              <p style={{color:C.td,fontSize:12,margin:"0 0 4px"}}>Historial completo de infracciones registradas</p>
              {detEmp.infracciones.map((d,i)=>(
                <div key={i} style={{padding:"13px 16px",borderRadius:10,background:C.sf,border:"1px solid "+C.bd,display:"flex",gap:12,alignItems:"flex-start"}}>
                  <span style={{padding:"3px 10px",borderRadius:10,fontSize:10,fontWeight:700,
                    background:(COLORES_POL[d.polId]||"#888")+"22",color:COLORES_POL[d.polId]||C.td,
                    border:"1px solid "+(COLORES_POL[d.polId]||"#888")+"44",flexShrink:0,marginTop:1,whiteSpace:"nowrap"}}>
                    POL {d.polNum}
                  </span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:13,color:C.t,marginBottom:3}}>{d.polNombre}</div>
                    <div style={{fontSize:12,color:C.td,marginBottom:3}}>{d.detalle}</div>
                    <div style={{fontSize:11,color:C.td,fontFamily:"monospace"}}>Fecha: {d.fecha}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   TENDENCIA VIEW — Evolución mes a mes
   ============================================================ */
function TendenciaView({ marc }) {
  const params = PARAMS_DEFAULT;
  const [sedeSel, setSedeSel] = useState("Todas");
  const [polSel,  setPolSel]  = useState("Todas");

  const sedes = useMemo(() => { const s={}; marc.forEach(m=>{if(m.DEPENDENCIA)s[m.DEPENDENCIA]=1;}); return ["Todas",...Object.keys(s).sort()]; }, [marc]);
  const ORD_MES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

  const [tendencia, setTendencia] = useState({ series:[], hayPocosDatos:true });
  const [tendCalc, setTendCalc] = useState(false);

  useEffect(() => {
    const mesesSet={}; marc.forEach(m=>{if(m.MES)mesesSet[m.MES]=1;});
    const mesesLista = Object.keys(mesesSet).sort((a,b)=>ORD_MES.indexOf(a)-ORD_MES.indexOf(b));
    if (mesesLista.length < 2) { setTendencia({ series:[], hayPocosDatos:true }); return; }
    setTendCalc(true);
    let cancelled = false;
    /* Procesar un mes a la vez de forma async */
    const cache = {}; /* mes -> politicas */
    let mi = 0;
    function nextMes() {
      if (cancelled) return;
      if (mi < mesesLista.length) {
        const mes = mesesLista[mi];
        const filtradas = marc.filter(m => (sedeSel==="Todas"||m.DEPENDENCIA===sedeSel) && m.MES===mes);
        cache[mes] = filtradas.length > 0 ? evaluarPoliticas(filtradas, params, "Todas").politicas : null;
        mi++;
        setTimeout(nextMes, 0);
      } else {
        const series = POLITICAS_DEF.map(pd => ({
          id:pd.id, num:pd.num, nombre:pd.nombre,
          datos: mesesLista.map(mes => {
            if (!cache[mes]) return { mesLabel:mes.charAt(0).toUpperCase()+mes.slice(1,3), cumplimiento:null };
            const pol = cache[mes].find(p=>p.id===pd.id);
            return { mesLabel:mes.charAt(0).toUpperCase()+mes.slice(1,3), cumplimiento:pol?.cumplimiento??100 };
          })
        }));
        if (!cancelled) { setTendencia({ series, hayPocosDatos:false }); setTendCalc(false); }
      }
    }
    setTimeout(nextMes, 50);
    return () => { cancelled = true; };
  }, [marc, sedeSel]);

  const polsOpts = ["Todas", ...POLITICAS_DEF.map(p=>p.id)];
  const seriesFiltradas = useMemo(() =>
    polSel==="Todas" ? tendencia.series : tendencia.series.filter(s=>s.id===polSel)
  , [tendencia.series, polSel]);

  const chartData = useMemo(() => {
    if (!tendencia.series.length) return [];
    const puntosBase = tendencia.series[0].datos;
    return puntosBase.map((d, idx) => {
      const punto = { mes: d.mesLabel };
      seriesFiltradas.forEach(s => { punto[s.id] = s.datos[idx]?.cumplimiento ?? null; });
      if (polSel==="Todas") {
        const vals = seriesFiltradas.map(s=>s.datos[idx]?.cumplimiento).filter(v=>v!==null);
        punto["PROMEDIO"] = vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : null;
      }
      return punto;
    });
  }, [tendencia.series, seriesFiltradas, polSel]);

  const COLORES = ["#1f6b2e","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#10b981","#d946ef"];

  return (
    <div>
      <div style={{marginBottom:20}}>
        <h2 style={{color:C.w,fontSize:18,fontWeight:800,margin:"0 0 4px"}}>Tendencia de Cumplimiento</h2>
        <p style={{color:C.td,fontSize:12,margin:0}}>¿Las políticas están mejorando o empeorando mes a mes?</p>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
        <Pill label="Sede"     value={sedeSel} options={sedes}    onChange={setSedeSel} />
        <Pill label="Política" value={polSel}  options={polsOpts} onChange={setPolSel} />
        {tendCalc && <span style={{fontSize:11,color:C.p,display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,borderRadius:"50%",border:"2px solid "+C.p,borderTopColor:"transparent",display:"inline-block",animation:"spin 0.7s linear infinite"}} />Procesando meses...</span>}
      </div>

      {tendencia.hayPocosDatos ? (
        <div style={{padding:"60px 40px",textAlign:"center",borderRadius:14,border:"2px dashed "+C.bd,background:C.sa}}>
          <div style={{fontSize:40,marginBottom:14}}>📅</div>
          <div style={{fontWeight:700,fontSize:15,color:C.tm,marginBottom:8}}>Se necesitan datos de al menos 2 meses</div>
          <div style={{fontSize:13,color:C.td}}>Carga archivos de marcaciones de más de un mes para ver la evolución del cumplimiento</div>
        </div>
      ) : (
        <>
          <div style={{padding:"20px",borderRadius:14,background:C.sf,border:"1px solid "+C.bd,boxShadow:"0 1px 4px rgba(31,107,46,0.07)",marginBottom:20}}>
            <div style={{marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:C.t}}>Porcentaje de cumplimiento por mes</div>
                <div style={{fontSize:11,color:C.td,marginTop:2}}>{polSel==="Todas"?"Todas las políticas":POLITICAS_DEF.find(p=>p.id===polSel)?.nombre||polSel} · {sedeSel}</div>
              </div>
              {polSel==="Todas" && <span style={{padding:"4px 12px",borderRadius:20,fontSize:11,fontWeight:600,background:"rgba(0,0,0,0.05)",color:C.td,border:"1px solid "+C.bd}}>Línea negra punteada = promedio de todas las políticas</span>}
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{top:8,right:20,bottom:0,left:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.bd} />
                <XAxis dataKey="mes" tick={{fontSize:11,fill:C.td}} />
                <YAxis domain={[0,100]} tick={{fontSize:10,fill:C.td}} tickFormatter={v=>v+"%"} />
                <Tooltip contentStyle={{background:C.sf,border:"1px solid "+C.bd,borderRadius:8,fontSize:11}}
                  formatter={(v,n) => [v!==null?v+"%":"Sin datos", n]} />
                {seriesFiltradas.map((s,i) => (
                  <Line key={s.id} type="monotone" dataKey={s.id}
                    stroke={COLORES[i%COLORES.length]}
                    strokeWidth={polSel==="Todas"?1.5:3}
                    dot={{r:polSel==="Todas"?2:5}}
                    name={"Política "+s.num+": "+s.nombre}
                    connectNulls />
                ))}
                {polSel==="Todas" && (
                  <Line type="monotone" dataKey="PROMEDIO" stroke="#222" strokeWidth={2.5}
                    strokeDasharray="6 3" dot={{r:4}} name="Promedio general" connectNulls />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{borderRadius:12,border:"1px solid "+C.bd,overflow:"hidden",boxShadow:"0 1px 4px rgba(31,107,46,0.07)"}}>
            <div style={{padding:"13px 18px",background:"linear-gradient(135deg,#0f1f13,#1f6b2e)"}}>
              <div style={{color:"#e8f5eb",fontWeight:700,fontSize:13}}>Cumplimiento por política y mes</div>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",background:C.sf,fontSize:12}}>
                <thead>
                  <tr style={{background:C.sa}}>
                    <th style={{padding:"10px 16px",textAlign:"left",fontWeight:700,color:C.td,fontSize:10,textTransform:"uppercase",borderBottom:"1px solid "+C.bd,whiteSpace:"nowrap",minWidth:200}}>Política</th>
                    {(tendencia.series[0]?.datos||[]).map((d,i)=>(
                      <th key={i} style={{padding:"10px 14px",textAlign:"center",fontWeight:700,color:C.td,fontSize:10,textTransform:"uppercase",borderBottom:"1px solid "+C.bd,whiteSpace:"nowrap"}}>{d.mesLabel}</th>
                    ))}
                    <th style={{padding:"10px 14px",textAlign:"center",fontWeight:700,color:C.td,fontSize:10,textTransform:"uppercase",borderBottom:"1px solid "+C.bd,whiteSpace:"nowrap"}}>Tendencia</th>
                  </tr>
                </thead>
                <tbody>
                  {(polSel==="Todas"?tendencia.series:tendencia.series.filter(s=>s.id===polSel)).map((s,ri)=>{
                    const vals = s.datos.map(d=>d.cumplimiento).filter(v=>v!==null);
                    const primero=vals[0]??0, ultimo=vals[vals.length-1]??0;
                    const diff=ultimo-primero;
                    const prom=vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):0;
                    return (
                      <tr key={s.id} style={{borderBottom:"1px solid "+C.bd,background:ri%2===0?"transparent":C.sa}}>
                        <td style={{padding:"12px 16px",whiteSpace:"nowrap"}}>
                          <span style={{fontSize:10,color:C.td,marginRight:6,fontWeight:600}}>Pol. {s.num}</span>
                          <span style={{fontWeight:600,color:C.t}}>{s.nombre}</span>
                        </td>
                        {s.datos.map((d,di)=>{
                          const v=d.cumplimiento;
                          const bg=v===null?"transparent":v>=90?"rgba(31,107,46,0.1)":v>=70?"rgba(245,158,11,0.1)":"rgba(220,38,38,0.1)";
                          const col=v===null?C.td:v>=90?C.p:v>=70?C.ac:C.dg;
                          return (
                            <td key={di} style={{padding:"12px 14px",textAlign:"center",background:bg}}>
                              <span style={{fontWeight:700,color:col}}>{v!==null?v+"%":"—"}</span>
                            </td>
                          );
                        })}
                        <td style={{padding:"12px 14px",textAlign:"center"}}>
                          <span style={{fontWeight:700,color:diff>0?C.p:diff<0?C.dg:C.td,fontSize:14}}>
                            {diff>0?"↑ +":diff<0?"↓ ":"→ "}{diff!==0?Math.abs(diff)+"%":"Sin cambio"}
                          </span>
                          <div style={{fontSize:10,color:C.td,marginTop:2}}>Promedio: {prom}%</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AuditoriaView({ marc: marcaciones = [] }) {
  const [busq, setBusq] = useState("");
  const [empSel, setEmpSel] = useState(null);  // abre el modal
  const [diaSel, setDiaSel] = useState(null);

  const empleados = useMemo(() => {
    const map = {};
    marcaciones.forEach((m) => {
      const id = m.IDENTIFICACION;
      if (!map[id]) map[id] = { id, nombre: m.EMPLEADO, cargo: m.CARGO, sede: m.DEPENDENCIA, seccion: m.CENTROCOSTO, dias: [] };
      map[id].dias.push(m);
    });
    return Object.values(map).sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
  }, [marcaciones]);

  const empFiltrados = useMemo(() => {
    const q = busq.trim().toLowerCase();
    if (!q) return empleados;
    return empleados.filter((e) =>
      (e.nombre && e.nombre.toLowerCase().includes(q)) ||
      String(e.id).includes(q) ||
      (e.cargo && e.cargo.toLowerCase().includes(q))
    );
  }, [empleados, busq]);

  const diasEmp = useMemo(() => {
    if (!empSel) return [];
    return [...empSel.dias].sort((a, b) => (a.FECHA || "").localeCompare(b.FECHA || ""));
  }, [empSel]);

  const reg = diaSel;

  const jornColor = (tipo) =>
    tipo === "Sin Marcacion" ? C.ac :
    (tipo === "Jorn Con" || tipo === "Tur Par Legal") ? C.p : C.dg;

  const polColor = (cumple) => cumple
    ? { bg:"rgba(31,107,46,0.09)", border:"rgba(31,107,46,0.25)", text:C.p, icon:"✓" }
    : { bg:"rgba(220,38,38,0.07)", border:"rgba(220,38,38,0.25)", text:C.dg, icon:"✗" };

  const abrirModal = (emp) => { setEmpSel(emp); setDiaSel(emp.dias.length > 0 ? [...emp.dias].sort((a,b)=>(a.FECHA||"").localeCompare(b.FECHA||""))[0] : null); };
  const cerrarModal = () => { setEmpSel(null); setDiaSel(null); };

  // ── Estadísticas rápidas del empleado ──
  const statsEmp = (emp) => {
    const total = emp.dias.length;
    const sinMrc = emp.dias.filter(d => d.TIPO_JORNADA === "Sin Marcacion").length;
    const tpIleg = emp.dias.filter(d => d.TIPO_JORNADA === "Tur Par Ilegal").length;
    return { total, sinMrc, tpIleg };
  };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 120px)"}}>

      {/* ── CABECERA ── */}
      <div style={{marginBottom:20}}>
        <h2 style={{color:C.w,fontSize:18,fontWeight:800,margin:"0 0 4px",letterSpacing:"-0.3px"}}>Auditoría de Cálculos</h2>
        <p style={{color:C.td,fontSize:12,margin:0}}>{empleados.length} empleados · Selecciona uno para ver el detalle de su jornada paso a paso</p>
      </div>

      {/* ── BUSCADOR ── */}
      <div style={{position:"relative",marginBottom:16}}>
        <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:14,color:C.td,pointerEvents:"none"}}>🔍</span>
        <input
          value={busq}
          onChange={(e) => setBusq(e.target.value)}
          placeholder="Buscar por nombre, ID o cargo..."
          style={{width:"100%",boxSizing:"border-box",padding:"12px 14px 12px 40px",borderRadius:12,fontSize:13,
            background:C.sf,border:"1px solid "+C.bd,color:C.t,outline:"none",
            boxShadow:"0 1px 4px rgba(31,107,46,0.07)"}}
        />
        {busq && <button onClick={()=>setBusq("")} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",
          background:"none",border:"none",cursor:"pointer",color:C.td,fontSize:16,lineHeight:1}}>×</button>}
      </div>
      <p style={{color:C.td,fontSize:11,margin:"-10px 0 12px"}}>{empFiltrados.length} resultado{empFiltrados.length!==1?"s":""}</p>

      {/* ── GRID DE EMPLEADOS ── */}
      <div style={{flex:1,overflowY:"auto"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>
          {empFiltrados.map((e) => {
            const st = statsEmp(e);
            const tieneProblemas = st.tpIleg > 0 || st.sinMrc > 2;
            return (
              <div key={e.id} onClick={() => abrirModal(e)}
                style={{padding:"16px 18px",borderRadius:14,background:C.sf,border:"1px solid "+C.bd,
                  cursor:"pointer",transition:"all 0.15s",
                  boxShadow:"0 1px 4px rgba(31,107,46,0.06)"}}
                onMouseEnter={e2=>{e2.currentTarget.style.boxShadow="0 4px 16px rgba(31,107,46,0.14)";e2.currentTarget.style.borderColor=C.p;e2.currentTarget.style.transform="translateY(-1px)";}}
                onMouseLeave={e2=>{e2.currentTarget.style.boxShadow="0 1px 4px rgba(31,107,46,0.06)";e2.currentTarget.style.borderColor=C.bd;e2.currentTarget.style.transform="translateY(0)";}}>
                {/* Avatar + nombre */}
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                  <div style={{width:42,height:42,borderRadius:12,flexShrink:0,
                    background:tieneProblemas?"rgba(220,38,38,0.1)":"rgba(31,107,46,0.1)",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:17,fontWeight:800,color:tieneProblemas?C.dg:C.p}}>
                    {(e.nombre||"?").charAt(0)}
                  </div>
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:13,color:C.t,
                      whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.nombre}</div>
                    <div style={{fontSize:10,color:C.td,marginTop:2,
                      whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.cargo||"-"}</div>
                  </div>
                </div>
                {/* Sede */}
                <div style={{fontSize:11,color:C.tm,marginBottom:10,
                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.sede}</div>
                {/* Stats */}
                <div style={{display:"flex",gap:6}}>
                  <span style={{flex:1,textAlign:"center",padding:"5px 4px",borderRadius:8,
                    background:C.sa,border:"1px solid "+C.bd}}>
                    <div style={{fontSize:13,fontWeight:800,color:C.t}}>{st.total}</div>
                    <div style={{fontSize:9,color:C.td,textTransform:"uppercase",letterSpacing:"0.3px"}}>días</div>
                  </span>
                  <span style={{flex:1,textAlign:"center",padding:"5px 4px",borderRadius:8,
                    background:st.sinMrc>0?"rgba(180,83,9,0.07)":C.sa,
                    border:"1px solid "+(st.sinMrc>0?"rgba(180,83,9,0.2)":C.bd)}}>
                    <div style={{fontSize:13,fontWeight:800,color:st.sinMrc>0?C.ac:C.td}}>{st.sinMrc}</div>
                    <div style={{fontSize:9,color:C.td,textTransform:"uppercase",letterSpacing:"0.3px"}}>sin marc</div>
                  </span>
                  <span style={{flex:1,textAlign:"center",padding:"5px 4px",borderRadius:8,
                    background:st.tpIleg>0?"rgba(220,38,38,0.07)":C.sa,
                    border:"1px solid "+(st.tpIleg>0?"rgba(220,38,38,0.2)":C.bd)}}>
                    <div style={{fontSize:13,fontWeight:800,color:st.tpIleg>0?C.dg:C.td}}>{st.tpIleg}</div>
                    <div style={{fontSize:9,color:C.td,textTransform:"uppercase",letterSpacing:"0.3px"}}>tp ileg</div>
                  </span>
                </div>
                {/* ID */}
                <div style={{marginTop:10,fontSize:10,color:C.td,fontFamily:"monospace"}}>ID {e.id}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          MODAL FLOTANTE — detalle del empleado
          ══════════════════════════════════════════ */}
      {empSel && (
        <div style={{position:"fixed",inset:0,zIndex:9000,display:"flex",alignItems:"center",justifyContent:"center"}}
          onClick={cerrarModal}>
          {/* Overlay oscuro */}
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.45)",backdropFilter:"blur(2px)"}} />

          {/* Panel lateral deslizante */}
          <div style={{position:"relative",width:"min(1000px,95vw)",height:"min(90vh,860px)",
            background:C.bg,display:"flex",flexDirection:"column",
            borderRadius:20,boxShadow:"0 24px 80px rgba(0,0,0,0.4)",zIndex:1,overflow:"hidden"}}
            onClick={e=>e.stopPropagation()}>

            {/* ── Header del modal ── */}
            <div style={{background:"linear-gradient(135deg,#0a1f0d,#1f6b2e)",padding:"20px 24px",
              display:"flex",alignItems:"center",gap:16,flexShrink:0}}>
              <div style={{width:52,height:52,borderRadius:14,background:"rgba(74,222,128,0.18)",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:22,fontWeight:800,color:"#4ade80",flexShrink:0}}>
                {(empSel.nombre||"?").charAt(0)}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:"#e8f5eb",fontSize:16,fontWeight:800,
                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{empSel.nombre}</div>
                <div style={{color:"#7aab85",fontSize:12,marginTop:3}}>
                  {empSel.cargo} · {empSel.sede}
                </div>
                <div style={{color:"#4ade80",fontSize:11,marginTop:2,fontFamily:"monospace"}}>ID {empSel.id}</div>
              </div>
              <button onClick={cerrarModal} style={{width:36,height:36,borderRadius:10,
                background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.15)",
                color:"#e8f5eb",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",
                justifyContent:"center",flexShrink:0,lineHeight:1}}>×</button>
            </div>

            {/* ── Cuerpo: lista días + detalle ── */}
            <div style={{flex:1,display:"flex",overflow:"hidden",minHeight:0}}>

              {/* Lista de días */}
              <div style={{width:200,flexShrink:0,overflowY:"auto",borderRight:"1px solid "+C.bd,background:C.sf}}>
                <div style={{padding:"12px 14px",borderBottom:"1px solid "+C.bd,
                  fontSize:10,fontWeight:700,color:C.td,textTransform:"uppercase",letterSpacing:"0.5px"}}>
                  {diasEmp.length} días registrados
                </div>
                {diasEmp.map((d) => {
                  const sel = diaSel === d;
                  const jc = jornColor(d.TIPO_JORNADA);
                  return (
                    <div key={d.FECHA+d.DIA_SEMANA} onClick={() => setDiaSel(d)}
                      style={{padding:"14px 16px",cursor:"pointer",borderBottom:"1px solid "+C.bd,
                        background:sel?C.pg:"transparent",
                        borderLeft:"3px solid "+(sel?C.p:"transparent"),transition:"all 0.1s"}}>
                      <div style={{fontWeight:700,fontSize:13,color:sel?C.p:C.t,marginBottom:2}}>{d.FECHA}</div>
                      <div style={{fontSize:11,color:C.td,marginBottom:5}}>{d.DIA_SEMANA} · {d.MES}</div>
                      <div style={{fontSize:11,fontWeight:700,color:jc,marginBottom:3}}>{d.TIPO_JORNADA}</div>
                      <div style={{fontSize:11,color:C.td,fontFamily:"monospace"}}>
                        {d.ENTRADA_H} – {d.SALIDA_H} · <b>{d.TOTAL_HORAS}h</b>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Detalle del día */}
              <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>
                {!reg ? (
                  <div style={{height:"100%",display:"flex",flexDirection:"column",
                    alignItems:"center",justifyContent:"center",color:C.td,gap:10}}>
                    <div style={{fontSize:36}}>📅</div>
                    <div style={{fontSize:14,fontWeight:600,color:C.tm}}>Selecciona un día</div>
                    <div style={{fontSize:12}}>para ver la auditoría completa</div>
                  </div>
                ) : (
                  <div style={{display:"flex",flexDirection:"column",gap:16}}>

                    {/* Badge fecha */}
                    <div style={{padding:"16px 20px",borderRadius:14,background:C.sf,
                      border:"1px solid "+C.bd,display:"flex",alignItems:"center",gap:14,
                      boxShadow:"0 1px 4px rgba(31,107,46,0.07)"}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:18,fontWeight:800,color:C.t}}>{reg.FECHA}</div>
                        <div style={{fontSize:12,color:C.td,marginTop:3}}>{reg.DIA_SEMANA} · {reg.MES} · Semana {reg.SEMANA}</div>
                      </div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
                        <span style={{padding:"5px 14px",borderRadius:20,fontSize:12,fontWeight:700,
                          background:"rgba(31,107,46,0.1)",color:C.p,border:"1px solid rgba(31,107,46,0.2)"}}>
                          {reg.TOTAL_HORAS}h
                        </span>
                        <span style={{padding:"5px 14px",borderRadius:20,fontSize:12,fontWeight:700,
                          color:jornColor(reg.TIPO_JORNADA),background:"rgba(0,0,0,0.04)",
                          border:"1px solid rgba(0,0,0,0.08)"}}>
                          {reg.TIPO_JORNADA}
                        </span>
                        {reg.QUINCENA==="Si" && <span style={{padding:"5px 14px",borderRadius:20,fontSize:12,fontWeight:700,
                          background:"rgba(180,83,9,0.08)",color:C.ac,border:"1px solid rgba(180,83,9,0.2)"}}>
                          Quincena
                        </span>}
                      </div>
                    </div>

                    {/* Grid Marcaciones + Breaks */}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                      {/* Marcaciones */}
                      <div style={{borderRadius:12,border:"1px solid "+C.bd,overflow:"hidden",boxShadow:"0 1px 4px rgba(31,107,46,0.07)"}}>
                        <div style={{background:"#1f6b2e",color:"#fff",padding:"13px 18px",fontSize:12,fontWeight:700,letterSpacing:"0.4px"}}>① MARCACIONES</div>
                        <div style={{padding:"16px 18px",background:C.sf,display:"flex",flexDirection:"column",gap:12}}>
                          {[{label:"Entrada",val:reg.ENTRADA_H,color:C.p},{label:"Salida",val:reg.SALIDA_H,color:C.dg}].map((item,i)=>(
                            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                              padding:"12px 14px",borderRadius:9,background:C.sa,border:"1px solid "+C.bd}}>
                              <span style={{fontSize:12,color:C.td}}>{item.label}</span>
                              <span style={{fontSize:20,fontWeight:800,color:item.color,fontFamily:"monospace"}}>{item.val}</span>
                            </div>
                          ))}
                          <div style={{padding:"12px 14px",borderRadius:9,
                            background:(reg.TIPO_JORNADA==="Jorn Con"||reg.TIPO_JORNADA==="Tur Par Legal")?"rgba(31,107,46,0.08)":"rgba(220,38,38,0.07)",
                            border:"1px solid "+((reg.TIPO_JORNADA==="Jorn Con"||reg.TIPO_JORNADA==="Tur Par Legal")?"rgba(31,107,46,0.2)":"rgba(220,38,38,0.2)")}}>
                            <div style={{fontSize:10,color:C.td,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.3px"}}>Tipo de jornada</div>
                            <div style={{fontSize:14,fontWeight:700,color:jornColor(reg.TIPO_JORNADA)}}>{reg.TIPO_JORNADA}</div>
                            <div style={{fontSize:11,color:C.td,marginTop:4}}>
                              {reg.TIPO_JORNADA==="Jorn Con"?"Sin turno partido detectado":
                               reg.TIPO_JORNADA==="Tur Par Legal"?"TP ≥170min (≥2h50m) → legal":
                               reg.TIPO_JORNADA==="Tur Par Ilegal"?"TP 45–170min → no cumple mínimo legal":
                               "Sin marcación de entrada/salida"}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Breaks */}
                      <div style={{borderRadius:12,border:"1px solid "+C.bd,overflow:"hidden",boxShadow:"0 1px 4px rgba(31,107,46,0.07)"}}>
                        <div style={{background:"#166534",color:"#fff",padding:"13px 18px",fontSize:12,fontWeight:700,letterSpacing:"0.4px"}}>② BREAKS</div>
                        <div style={{padding:"16px 18px",background:C.sf,display:"flex",flexDirection:"column",gap:10}}>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                            {[
                              {label:"Breaks cortos",val:reg.BREAKS_CORTOS,sub:"< 45min"},
                              {label:"Mayor break",val:reg.BREAK_CORTO_MAX_MIN+"min",sub:"individual"},
                              {label:"Total acumulado",val:reg.BREAK_CORTO_TOTAL_MIN+"min",sub:"breaks cortos"},
                              {label:"TP ilegales",val:reg.TP_ILEGALES,sub:"45–170min",warn:reg.TP_ILEGALES>0},
                            ].map((item,i)=>(
                              <div key={i} style={{padding:"12px",borderRadius:9,
                                background:item.warn?"rgba(220,38,38,0.07)":C.sa,
                                border:"1px solid "+(item.warn?"rgba(220,38,38,0.2)":C.bd)}}>
                                <div style={{fontSize:10,color:C.td,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.3px"}}>{item.label}</div>
                                <div style={{fontSize:18,fontWeight:800,color:item.warn?C.dg:C.t}}>{item.val}</div>
                                <div style={{fontSize:10,color:C.td}}>{item.sub}</div>
                              </div>
                            ))}
                          </div>
                          {reg.BREAK_DETALLE && (
                            <div style={{padding:"10px 12px",borderRadius:9,background:C.sa,border:"1px solid "+C.bd,
                              fontSize:11,color:C.tm,lineHeight:1.6}}>
                              <span style={{fontWeight:700,color:C.td,fontSize:10,textTransform:"uppercase",letterSpacing:"0.3px"}}>Detalle: </span>
                              {reg.BREAK_DETALLE}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Fórmula horas */}
                    <div style={{borderRadius:12,border:"1px solid "+C.bd,overflow:"hidden",boxShadow:"0 1px 4px rgba(31,107,46,0.07)"}}>
                      <div style={{background:"#15803d",color:"#fff",padding:"13px 18px",fontSize:12,fontWeight:700,letterSpacing:"0.4px"}}>③ CÁLCULO DE HORAS</div>
                      <div style={{padding:"20px",background:C.sf}}>
                        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",
                          padding:"14px 18px",borderRadius:10,background:C.sa,border:"1px solid "+C.bd,marginBottom:14}}>
                          <span style={{fontSize:14,fontFamily:"monospace",color:C.td}}>Horas =</span>
                          <span style={{fontSize:14,fontFamily:"monospace",color:C.t,fontWeight:700}}>( {reg.SALIDA_H} − {reg.ENTRADA_H} )</span>
                          <span style={{fontSize:14,fontFamily:"monospace",color:C.td}}>−</span>
                          <span style={{fontSize:14,fontFamily:"monospace",color:C.ac,fontWeight:700}}>{reg.TOTAL_BREAK}h breaks</span>
                          <span style={{fontSize:14,fontFamily:"monospace",color:C.td}}>=</span>
                          <span style={{fontSize:22,fontFamily:"monospace",color:C.p,fontWeight:800}}>{reg.TOTAL_HORAS}h</span>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
                          {[
                            {label:"Horas netas",val:reg.TOTAL_HORAS+"h",color:C.p},
                            {label:"Break total",val:reg.TOTAL_BREAK+"h ("+Math.round(reg.TOTAL_BREAK*60)+"min)",color:C.ac},
                            {label:"Quincena",val:reg.QUINCENA==="Si"?"Sí ✓":"No",color:reg.QUINCENA==="Si"?C.ac:C.td},
                          ].map((item,i)=>(
                            <div key={i} style={{padding:"14px",borderRadius:9,background:C.sa,border:"1px solid "+C.bd,textAlign:"center"}}>
                              <div style={{fontSize:10,color:C.td,textTransform:"uppercase",letterSpacing:"0.3px",marginBottom:6}}>{item.label}</div>
                              <div style={{fontSize:16,fontWeight:800,color:item.color}}>{item.val}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Grilla horaria */}
                    <div style={{borderRadius:12,border:"1px solid "+C.bd,overflow:"hidden",boxShadow:"0 1px 4px rgba(31,107,46,0.07)"}}>
                      <div style={{background:"#1a5228",color:"#fff",padding:"13px 18px",fontSize:12,fontWeight:700,letterSpacing:"0.4px"}}>④ GRILLA HORARIA</div>
                      <div style={{padding:"18px 20px",background:C.sf}}>
                        <p style={{fontSize:11,color:C.td,margin:"0 0 14px"}}><b>1</b> = presente · <b>0</b> = ausente o en bloque de turno partido</p>
                        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                          {HC.map((hc) => {
                            const v = reg[hc] || 0;
                            return (
                              <div key={hc} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                                <div style={{fontSize:10,color:C.td,fontFamily:"monospace"}}>{hc}</div>
                                <div style={{width:46,height:40,borderRadius:8,
                                  display:"flex",alignItems:"center",justifyContent:"center",
                                  background:v===1?"rgba(31,107,46,0.15)":"rgba(0,0,0,0.03)",
                                  border:"1px solid "+(v===1?"rgba(31,107,46,0.35)":C.bd),
                                  fontWeight:800,fontSize:15,color:v===1?C.p:"#c0c0c0"}}>
                                  {v}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Políticas */}
                    <div style={{borderRadius:12,border:"1px solid "+C.bd,overflow:"hidden",boxShadow:"0 1px 4px rgba(31,107,46,0.07)",marginBottom:8}}>
                      <div style={{background:"#991b1b",color:"#fff",padding:"13px 18px",fontSize:12,fontWeight:700,letterSpacing:"0.4px"}}>⑤ EVALUACIÓN DE POLÍTICAS</div>
                      <div style={{padding:"16px 18px",background:C.sf,display:"flex",flexDirection:"column",gap:10}}>
                        {(() => {
                          const h = reg.TOTAL_HORAS || 0;
                          const bcMax = reg.BREAK_CORTO_MAX_MIN || 0;
                          const bcTot = reg.BREAK_CORTO_TOTAL_MIN || 0;
                          const heD = Math.max(0, h - 8);
                          return [
                            { id:"POL 1", nombre:"Jornada extendida sin descanso", cumple:!(h>10&&bcTot<8),
                              detalle: h>10 ? (bcTot<8?`${h}h trabajadas · solo ${bcTot}min break corto (mín. 8min)`:`${h}h con ${bcTot}min break — descanso suficiente`) : `Jornada de ${h}h no supera el umbral de 10h` },
                            { id:"POL 2", nombre:"Break menor al mínimo", cumple:!(reg.BREAKS_CORTOS>0&&bcMax<8),
                              detalle: reg.BREAKS_CORTOS===0?"Sin breaks cortos registrados":(bcMax<8?`Break mayor: ${bcMax}min (mín. 8min requeridos)`:`Break mayor: ${bcMax}min — cumple el mínimo`) },
                            { id:"POL 3", nombre:"Jornada excesiva (límite 12h)", cumple:h<=12,
                              detalle: h>12?`${h}h supera el máximo de 12h (excede ${(h-12).toFixed(1)}h)`:`${h}h dentro del límite de 12h` },
                            { id:"POL 5", nombre:"Extensión de break (límite 18min)", cumple:bcMax<=18,
                              detalle: bcMax>18?`Break de ${bcMax}min supera 15+3min tolerancia=18min (excede ${bcMax-18}min)`:`Break máximo ${bcMax}min — dentro del límite` },
                            { id:"POL 9", nombre:"Horas extra diarias (límite 2h)", cumple:heD<=2,
                              detalle: heD>0?(heD>2?`${heD.toFixed(1)}h extra supera límite (8h+2h=10h). Total: ${h}h`:`${heD.toFixed(1)}h extra — dentro del límite de 2h/día`):`Sin horas extra (jornada ≤8h)` },
                          ].map((pol) => {
                            const co = polColor(pol.cumple);
                            return (
                              <div key={pol.id} style={{display:"flex",gap:14,padding:"14px 16px",
                                borderRadius:12,background:co.bg,border:"1px solid "+co.border}}>
                                <div style={{width:28,height:28,borderRadius:8,flexShrink:0,
                                  background:pol.cumple?"rgba(31,107,46,0.15)":"rgba(220,38,38,0.15)",
                                  display:"flex",alignItems:"center",justifyContent:"center",
                                  fontSize:14,fontWeight:800,color:co.text,marginTop:1}}>
                                  {co.icon}
                                </div>
                                <div style={{flex:1}}>
                                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                                    <span style={{fontSize:10,fontWeight:700,color:co.text,
                                      background:co.bg,padding:"2px 8px",borderRadius:10,border:"1px solid "+co.border}}>
                                      {pol.id}
                                    </span>
                                    <span style={{fontSize:13,fontWeight:700,color:C.t}}>{pol.nombre}</span>
                                  </div>
                                  <div style={{fontSize:12,color:C.td,lineHeight:1.6}}>{pol.detalle}</div>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* === MAIN APP === */
function App() {
  var _u = useState(null), user = _u[0], setUser = _u[1];
  var _v = useState("upload"), view = _v[0], setView = _v[1];
  var _d = useState({marc:[],fact:[]}), data = _d[0], setData = _d[1];
  var _sb = useState(true), sidebar = _sb[0], setSB = _sb[1];
  var _em = useState(false), expM = _em[0], setExpM = _em[1];
  var _lu = useState(""), lu = _lu[0], setLU = _lu[1];
  var _lp = useState(""), lp = _lp[0], setLP = _lp[1];
  var _le = useState(""), le = _le[0], setLE = _le[1];
  var _sp = useState(false), showP = _sp[0], setSP = _sp[1];
  var _fs = useState(""), fSt = _fs[0], setFS = _fs[1];
  var _pr = useState(false), proc = _pr[0], setProc = _pr[1];
  var fRef = useRef(null);

  /* Actualizar tema global en cada render */

  /* Limpiar BREAK_PAIRS para serializar */
  var limpiarMarc = function(marc) {
    return marc.map(function(m) {
      var c = {};
      for (var k in m) { if (k !== "BREAK_PAIRS") c[k] = m[k]; }
      return c;
    });
  };

  var login = function() {
    var u = USERS[lu.toLowerCase()];
    if (u && u.pw === lp) { setUser({role:u.role,name:u.name}); setLE(""); }
    else setLE("Credenciales incorrectas");
  };

  var doUpload = function(e) {
    var files = Array.from(e.target.files);
    if (!files.length) return;
    setProc(true);
    setFS("Procesando...");
    var result = {marc:[],fact:[]};

    var processFiles = async function() {
      try {
        for (var fi = 0; fi < files.length; fi++) {
          var file = files[fi];
          var nm = file.name.toUpperCase();
          setFS("Leyendo " + file.name + "...");

          /* === CSV / TSV nativo — mucho mas rapido que SheetJS === */
          if (nm.endsWith(".CSV") || nm.endsWith(".TSV") || nm.endsWith(".TXT")) {
            setFS("Leyendo CSV: " + file.name + " (" + (file.size / 1048576).toFixed(1) + " MB)...");
            var csvText = await file.text();
            var firstLine = csvText.slice(0, csvText.indexOf("\n"));
            var sep = firstLine.split(";").length > firstLine.split(",").length ? ";" : (firstLine.indexOf("\t") >= 0 ? "\t" : ",");
            var csvLines = csvText.split(/\r?\n/);
            csvText = null;
            var csvRows = [];
            for (var cli = 0; cli < csvLines.length; cli++) {
              if (csvLines[cli].trim() === "") continue;
              csvRows.push(csvLines[cli].split(sep).map(function(c) { return c.trim(); }));
            }
            csvLines = null;
            setFS(csvRows.length - 1 + " filas leidas de " + file.name + ". Procesando...");
            var csvH = (csvRows[0] || []).map(function(h) { return String(h).toUpperCase(); });
            var esMarc = csvH.some(function(h) { return h.indexOf("IDENTIFICACION") >= 0 || h === "CODEMPLEADO"; }) && csvH.some(function(h) { return h === "HORA" || h === "FUNCION"; });
            var esFact = csvH.some(function(h) { return h.indexOf("FACT") >= 0; }) && csvH.some(function(h) { return h.indexOf("VENTA") >= 0 || h.indexOf("CLASE") >= 0; });
            if (esMarc) {
              result.marc = procBase(csvRows);
              setFS(result.marc.length + " marcaciones procesadas de " + file.name);
            } else if (esFact) {
              result.fact = procFact(csvRows);
              setFS(result.fact.length + " facturas procesadas de " + file.name);
            } else {
              result.marc = procBase(csvRows);
              if (result.marc.length > 0) {
                setFS(result.marc.length + " marcaciones procesadas de " + file.name);
              } else {
                setFS("No se pudo identificar el tipo de CSV: " + file.name);
              }
            }
            continue;
          }

          if (file.name.endsWith(".json")) {
            var text = await file.text();
            var json = JSON.parse(text);
            if (json._type === "seguimiento_memory" || json._type === "staffpulse_memory") {
              // Normalizar sedes al cargar desde memoria
              var marcNorm = (json.marcaciones||[]).map(function(m){ var c=Object.assign({},m); if(c.DEPENDENCIA) c.DEPENDENCIA=normSede(c.DEPENDENCIA); return c; });
              var factNorm = (json.facturas||[]).map(function(f){ var c=Object.assign({},f); if(c.sede) c.sede=normSede(c.sede); return c; });
              setData({marc:marcNorm,fact:factNorm});
              setFS("Memoria cargada: " + (json.marcaciones?json.marcaciones.length:0) + " registros");
              setProc(false);
              return;
            }
            continue;
          }

          var buf = await file.arrayBuffer();
          setFS("Parseando Excel: " + file.name + " (" + (file.size / 1048576).toFixed(1) + " MB)...");
          // NO usar cellDates - las horas vienen como fracciones (0 a 1) que son mas faciles de parsear
          var wb = XLSX.read(buf, {type:"array"});

          if (nm.indexOf("BASE_DE_DATOS") >= 0 || nm.indexOf("BASE DE DATOS") >= 0) {
            var sheet = wb.Sheets[wb.SheetNames[0]];
            var rows = XLSX.utils.sheet_to_json(sheet, {header:1, defval:null, raw:true});
            result.marc = procBase(rows);
            setFS(result.marc.length + " marcaciones procesadas de " + file.name);
          }
          else if (nm.indexOf("MARCACION") >= 0 && nm.indexOf("POLITICA") < 0) {
            var sn = wb.SheetNames[0];
            for (var si = 0; si < wb.SheetNames.length; si++) {
              if (wb.SheetNames[si].toUpperCase().indexOf("MARCACION") >= 0) { sn = wb.SheetNames[si]; break; }
            }
            var rows2 = XLSX.utils.sheet_to_json(wb.Sheets[sn], {header:1, defval:null, raw:true});
            if (rows2.length > 1) {
              var headers2 = [];
              for (var hi2 = 0; hi2 < (rows2[0]||[]).length; hi2++) headers2.push(String(rows2[0][hi2]||"").trim());
              var hasGrid = headers2.some(function(h){return h.indexOf(":00") >= 0;});
              if (hasGrid) {
                var processed = [];
                for (var ri = 1; ri < rows2.length; ri++) {
                  var rw = {};
                  for (var ci2 = 0; ci2 < headers2.length; ci2++) rw[headers2[ci2]] = rows2[ri] ? rows2[ri][ci2] : null;
                  var mp = {
                    IDENTIFICACION:rw["IDENTIFICACION"], EMPLEADO:rw["EMPLEADO"], DEPENDENCIA:normSede(rw["DEPENDENCIA"]),
                    CARGO:rw["CARGO"], CENTROCOSTO:rw["CENTROCOSTO"], FECHA:rw["FECHA"],
                    TIPO_JORNADA:rw["TIPO DE JORNADA"],
                    TOTAL_HORAS:typeof rw["total horas"]==="number"?rw["total horas"]:0,
                    TOTAL_BREAK:0, TURNO_PARTIDO:0, ENTRADA_H:"-", SALIDA_H:"-",
                    MES:rw["Mes"]||rw["MES"], DIA:rw["Dia"]||rw["Día"]||rw["DIA"],
                    DIA_SEMANA:rw["Dia semana"]||rw["Día semana"]||rw["DIA_SEMANA"],
                    SEMANA:rw["Semana"]||rw["SEMANA"]
                  };
                  var mpDia = Number(mp.DIA);
                  var mpMes = String(mp.MES||"").toLowerCase();
                  mp.QUINCENA = (mpDia===1||mpDia===2||mpDia===3||mpDia===15||mpDia===16||mpDia===17||mpDia===30||mpDia===31||(mpMes==="febrero"&&mpDia===28)) ? "Si" : "No";
                  for (var hci = 0; hci < HC.length; hci++) mp[HC[hci]] = typeof rw[HC[hci]] === "number" ? rw[HC[hci]] : 0;
                  processed.push(mp);
                }
                result.marc = processed;
                setFS(processed.length + " marcaciones de " + file.name);
              }
            }
          }
          else if (nm.indexOf("GRAFICA") >= 0 || nm.indexOf("FACTURA") >= 0) {
            var sn3 = wb.SheetNames[0];
            for (var sj = 0; sj < wb.SheetNames.length; sj++) {
              var snUp = wb.SheetNames[sj].toUpperCase();
              if (snUp === "EXPO" || snUp === "FACTURAS" || snUp.indexOf("FACTURA") >= 0) { sn3 = wb.SheetNames[sj]; break; }
            }
            var rows3 = XLSX.utils.sheet_to_json(wb.Sheets[sn3], {header:1, defval:null});
            result.fact = procFact(rows3);
            setFS(result.fact.length + " facturas de " + file.name);
          }
          else {
            /* Auto-detectar por nombre de hoja o por headers */
            var autoSn = null;
            var autoTipo = null;
            
            /* Primero buscar por nombre de hoja */
            for (var sAuto = 0; sAuto < wb.SheetNames.length; sAuto++) {
              var snA = wb.SheetNames[sAuto].toUpperCase();
              if (snA === "FACTURAS" || snA === "EXPO" || snA.indexOf("FACTURA") >= 0) { autoSn = wb.SheetNames[sAuto]; autoTipo = "fact"; break; }
              if (snA.indexOf("MARCACION") >= 0 || snA.indexOf("BASE") >= 0) { autoSn = wb.SheetNames[sAuto]; autoTipo = "marc"; break; }
            }
            
            var targetSheet = autoSn ? wb.Sheets[autoSn] : wb.Sheets[wb.SheetNames[0]];
            var autoRows = XLSX.utils.sheet_to_json(targetSheet, {header:1, defval:null, raw:true});
            
            if (autoRows.length > 1) {
              /* Si no se detecto por nombre de hoja, detectar por headers */
              if (!autoTipo) {
                var h0 = (autoRows[0] || []).map(function(h) { return String(h || "").toUpperCase(); });
                if (h0.some(function(h) { return h.indexOf("FACT") >= 0; }) && h0.some(function(h) { return h.indexOf("VENTA") >= 0 || h.indexOf("CLASE") >= 0; })) {
                  autoTipo = "fact";
                } else if (h0.some(function(h) { return h.indexOf("IDENTIFICACION") >= 0 || h.indexOf("EMPLEADO") >= 0; }) && h0.some(function(h) { return h.indexOf("HORA") >= 0 || h.indexOf("FUNCION") >= 0; })) {
                  autoTipo = "marc";
                }
              }
              
              if (autoTipo === "fact") {
                result.fact = procFact(autoRows);
                setFS(result.fact.length + " facturas detectadas de " + file.name);
              } else if (autoTipo === "marc") {
                result.marc = procBase(autoRows);
                setFS(result.marc.length + " marcaciones detectadas de " + file.name);
              } else {
                setFS("No se pudo identificar el tipo de archivo: " + file.name);
              }
            }
          }
        }
        setData(function(prev) {
          return {
            marc: result.marc.length > 0 ? result.marc : prev.marc,
            fact: result.fact.length > 0 ? result.fact : prev.fact
          };
        });
      } catch (err) {
        setFS("Error al procesar: " + err.message);
        console.error("Upload error:", err);
      }
      setProc(false);
    };
    processFiles();
  };

  var descargarArchivo = function(contenido, nombreArchivo, tipo) {
    var blob = new Blob([contenido], {type: tipo});
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  var expMem = function() {
    var marcClean = limpiarMarc(data.marc);
    var jsonStr = JSON.stringify({_type:"seguimiento_memory",_v:2,marcaciones:marcClean,facturas:data.fact}, null, 2);
    var fecha = new Date().toISOString().slice(0,10);
    descargarArchivo(jsonStr, "seguimiento_memoria_" + fecha + ".json", "application/json");
  };

  var expXls = function() {
    var marcClean = limpiarMarc(data.marc);
    var keys = Object.keys(marcClean[0] || {});
    var lines = [keys.join("	")];
    marcClean.forEach(function(r) { lines.push(keys.map(function(k) { return r[k] != null ? String(r[k]) : ""; }).join("	")); });
    var fecha = new Date().toISOString().slice(0,10);
    descargarArchivo(lines.join("\n"), "seguimiento_datos_" + fecha + ".txt", "text/plain");
  };

  /* === LOGIN === */
  if (!user) {
    return (
      <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#04140a,#081c0e)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif",
        backgroundImage:"radial-gradient(ellipse at 30% 40%, rgba(31,107,46,0.2) 0%, transparent 55%), radial-gradient(ellipse at 75% 70%, rgba(74,222,128,0.07) 0%, transparent 50%)"}}>
        <div style={{width:400,padding:44,borderRadius:28,background:"rgba(8,22,12,0.98)",border:"1px solid rgba(74,222,128,0.13)",boxShadow:"0 40px 100px rgba(0,0,0,0.7),0 0 0 1px rgba(74,222,128,0.05)",backdropFilter:"blur(24px)"}}>
          <div style={{textAlign:"center",marginBottom:36}}>
            <div style={{width:68,height:68,borderRadius:20,margin:"0 auto 18px",background:"linear-gradient(135deg,#1a5228,#2d8a41)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,color:"#4ade80",fontWeight:900,boxShadow:"0 8px 28px rgba(74,222,128,0.28),0 0 0 1px rgba(74,222,128,0.18)",letterSpacing:"-1px"}}>SC</div>
            <h1 style={{color:"#ecfdf0",fontSize:26,fontWeight:800,margin:"0 0 6px",letterSpacing:"-0.5px"}}>Seguimiento App</h1>
            <p style={{color:"rgba(122,171,133,0.7)",fontSize:11,margin:0,fontWeight:500,letterSpacing:"1.5px",textTransform:"uppercase"}}>Supertiendas Cañaveral</p>
          </div>
          <div style={{marginBottom:14}}>
            <label style={{color:"rgba(122,171,133,0.8)",fontSize:10,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",display:"block",marginBottom:6}}>Usuario</label>
            <input value={lu} onChange={function(e){setLU(e.target.value);setLE("");}} onKeyDown={function(e){if(e.key==="Enter")login();}}
              style={{width:"100%",padding:"13px 16px",borderRadius:12,fontSize:13,fontWeight:500,
                background:"rgba(255,255,255,0.04)",border:"1px solid rgba(74,222,128,0.14)",
                color:"#ecfdf0",outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}} />
          </div>
          <div style={{marginBottom:8}}>
            <label style={{color:"rgba(122,171,133,0.8)",fontSize:10,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",display:"block",marginBottom:6}}>Contraseña</label>
            <input type={showP?"text":"password"} value={lp} onChange={function(e){setLP(e.target.value);setLE("");}} onKeyDown={function(e){if(e.key==="Enter")login();}}
              style={{width:"100%",padding:"13px 16px",borderRadius:12,fontSize:13,fontWeight:500,
                background:"rgba(255,255,255,0.04)",border:"1px solid rgba(74,222,128,0.14)",
                color:"#ecfdf0",outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}} />
            <button onClick={function(){setSP(!showP);}} style={{background:"none",border:"none",color:"rgba(122,171,133,0.6)",fontSize:10,fontWeight:500,cursor:"pointer",marginTop:4,padding:0}}>{showP?"Ocultar clave":"Mostrar clave"}</button>
          </div>
          {le && <div style={{padding:"10px 14px",borderRadius:10,marginBottom:14,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",color:"#fca5a5",fontSize:12,fontWeight:500}}>{le}</div>}
          <button onClick={login} style={{width:"100%",padding:"14px",borderRadius:14,fontSize:14,fontWeight:700,
            background:"linear-gradient(135deg,#1f6b2e,#2d8a41)",border:"1px solid rgba(74,222,128,0.2)",
            color:"#ecfdf0",cursor:"pointer",boxShadow:"0 4px 20px rgba(31,107,46,0.4)",letterSpacing:"0.2px",marginBottom:20}}>Ingresar →</button>
          <div style={{padding:"10px 14px",borderRadius:12,background:"rgba(255,255,255,0.02)",border:"1px solid rgba(74,222,128,0.07)"}}>
            <p style={{color:"rgba(107,127,112,0.8)",fontSize:10,margin:0,textAlign:"center",lineHeight:"1.8",fontWeight:500}}>
              <span style={{color:"rgba(74,222,128,0.6)",fontWeight:700}}>Demo:</span> admin / admin2026 · supervisor / super2026 · gerencia / gerencia2026
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* === MAIN LAYOUT === */
  var has = data.marc.length > 0 || data.fact.length > 0;
  var hasMarc = data.marc.length > 0;
  var hasFact = data.fact.length > 0;
  var nav = [
    {id:"upload",label:"Cargar Datos",r:["admin","supervisor","gerencia"]},
    {id:"dashboard",label:"Dashboard",r:["admin","supervisor","gerencia"]},
    {id:"eficiencia",label:"Eficiencia",r:["admin","gerencia"]},
    {id:"riesgo",label:"Riesgo",r:["admin","gerencia"]},
    {id:"tendencia",label:"Tendencia",r:["admin","gerencia"]},
    {id:"policies",label:"Politicas",r:["admin","gerencia"]},
    {id:"auditoria",label:"Auditoria",r:["admin","gerencia"]},
    {id:"rules",label:"Manual",r:["admin","supervisor","gerencia"]}
  ].filter(function(n){return n.r.indexOf(user.role)>=0;});

  var content = null;
  try {
    if (view === "upload") {
      content = (
        <div>
          <h2 style={{color:C.w,fontSize:16,fontWeight:700,margin:"0 0 12px"}}>Cargar Archivos</h2>
          <div onClick={function(){if(fRef.current)fRef.current.click();}} style={{padding:48,borderRadius:16,cursor:"pointer",textAlign:"center",border:"2px dashed "+C.bd,background:"linear-gradient(145deg,"+C.sa+",#fff)",transition:"border-color 0.2s, background 0.2s"}}
            onMouseEnter={function(e){e.currentTarget.style.borderColor=C.p;e.currentTarget.style.background="linear-gradient(145deg,rgba(31,107,46,0.06),#fff)";}}
            onMouseLeave={function(e){e.currentTarget.style.borderColor=C.bd;e.currentTarget.style.background="linear-gradient(145deg,"+C.sa+",#fff)";}}>
            <input ref={fRef} type="file" multiple accept=".xlsx,.xlsm,.xls,.json,.csv,.tsv,.txt" style={{display:"none"}} onChange={doUpload} />
            {proc
              ? <p style={{color:C.p,margin:0,fontSize:13,fontWeight:600}}>{fSt}</p>
              : <div>
                  <div style={{width:48,height:48,borderRadius:12,background:C.pg,border:"1px solid "+C.bd,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",fontSize:22}}>📂</div>
                  <p style={{color:C.t,fontSize:15,fontWeight:700,margin:"0 0 6px"}}>Clic para subir archivos</p>
                  <p style={{color:C.td,fontSize:11,margin:"0 0 3px"}}>BASE_DE_DATOS_MARCACIONES.xlsm · FACTURAS.xlsx · GRAFICA_FINAL.xlsx · Memoria .json</p>
                  <p style={{color:C.td,fontSize:10,margin:0}}>Detecta automaticamente el tipo de archivo por contenido</p>
                </div>}
          </div>
          {fSt && !proc && <div style={{marginTop:10,padding:10,borderRadius:8,background:C.pg,border:"1px solid "+C.bd}}>
            <p style={{color:C.p,fontSize:11,margin:0}}>{fSt}</p>
            <p style={{color:C.tm,fontSize:10,margin:"4px 0 0"}}>
              {data.marc.length > 0 ? data.marc.length + " marcaciones" : "Sin marcaciones"}
              {" | "}
              {data.fact.length > 0 ? data.fact.length + " facturas" : "Sin facturas"}
              {has ? " - Ve al Dashboard para ver los graficos" : ""}
            </p>
          </div>}
          {/* Diagnóstico de sedes — solo admin */}
          {user && user.role === "admin" && data.marc.length > 0 && (() => {
            // Recoger valores originales únicos de DEPENDENCIA antes de la normalización
            // (ya están normalizados en data.marc, así que mostramos los normalizados agrupados)
            const sedesNorm = {};
            data.marc.forEach(function(m) {
              var n = m.DEPENDENCIA || "(vacío)";
              sedesNorm[n] = (sedesNorm[n] || 0) + 1;
            });
            const lista = Object.entries(sedesNorm).sort((a,b) => b[1]-a[1]);
            return (
              <div style={{marginTop:14,borderRadius:12,border:"1px solid "+C.bd,overflow:"hidden"}}>
                <div style={{padding:"12px 16px",background:"linear-gradient(135deg,#0f1f13,#1f6b2e)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{color:"#e8f5eb",fontSize:12,fontWeight:700}}>🏪 Sedes detectadas tras normalización ({lista.length})</span>
                  <span style={{color:"#7aab85",fontSize:10}}>Los nombres ya están unificados (SC ZARZAL = ZARZAL)</span>
                </div>
                <div style={{padding:"12px 16px",background:C.sf,display:"flex",flexWrap:"wrap",gap:8}}>
                  {lista.map(function([sede, cnt]) {
                    return (
                      <div key={sede} style={{padding:"6px 12px",borderRadius:8,background:C.sa,border:"1px solid "+C.bd,display:"flex",gap:8,alignItems:"center"}}>
                        <span style={{fontSize:12,fontWeight:700,color:C.t}}>{sede}</span>
                        <span style={{fontSize:10,color:C.td,background:C.pg,padding:"1px 6px",borderRadius:10}}>{cnt}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      );
    } else if (view === "dashboard") {
      content = has
        ? <DashView marc={data.marc} fact={data.fact} />
        : <div style={{textAlign:"center",padding:40}}><p style={{color:C.w,fontSize:14}}>Sin datos cargados</p><button onClick={function(){setView("upload");}} style={{padding:"8px 16px",borderRadius:7,background:C.p,border:"none",color:"#fff",cursor:"pointer",marginTop:8,fontSize:12}}>Cargar Archivos</button></div>;
    } else if (view === "policies") {
      content = hasMarc
        ? <PolView marc={data.marc} />
        : <div style={{textAlign:"center",padding:40}}><p style={{color:C.w}}>Politicas necesita datos de marcaciones</p><button onClick={function(){setView("upload");}} style={{padding:"8px 16px",borderRadius:7,background:C.p,border:"none",color:"#fff",cursor:"pointer",fontSize:12}}>Cargar</button></div>;
    } else if (view === "auditoria") {
      content = hasMarc
        ? <AuditoriaView marc={data.marc} />
        : <div style={{textAlign:"center",padding:40}}><p style={{color:C.w}}>Auditoria necesita datos de marcaciones</p><button onClick={function(){setView("upload");}} style={{padding:"8px 16px",borderRadius:7,background:C.p,border:"none",color:"#fff",cursor:"pointer",fontSize:12}}>Cargar</button></div>;
    } else if (view === "eficiencia") {
      content = (has)
        ? <EficienciaView marc={data.marc} fact={data.fact} />
        : <div style={{textAlign:"center",padding:40}}><p style={{color:C.w}}>Necesitas cargar marcaciones y facturas</p><button onClick={function(){setView("upload");}} style={{padding:"8px 16px",borderRadius:7,background:C.p,border:"none",color:"#fff",cursor:"pointer",fontSize:12}}>Cargar</button></div>;
    } else if (view === "riesgo") {
      content = hasMarc
        ? <RiesgoView marc={data.marc} />
        : <div style={{textAlign:"center",padding:40}}><p style={{color:C.w}}>Necesitas cargar marcaciones</p><button onClick={function(){setView("upload");}} style={{padding:"8px 16px",borderRadius:7,background:C.p,border:"none",color:"#fff",cursor:"pointer",fontSize:12}}>Cargar</button></div>;
    } else if (view === "tendencia") {
      content = hasMarc
        ? <TendenciaView marc={data.marc} />
        : <div style={{textAlign:"center",padding:40}}><p style={{color:C.w}}>Necesitas cargar marcaciones</p><button onClick={function(){setView("upload");}} style={{padding:"8px 16px",borderRadius:7,background:C.p,border:"none",color:"#fff",cursor:"pointer",fontSize:12}}>Cargar</button></div>;
    } else if (view === "rules") {
      content = <RulesView />;
    }
  } catch (renderErr) {
    content = <div style={{padding:20,color:C.dg}}>Error renderizando: {String(renderErr.message)}</div>;
  }

  /* Iconos para el nav */
  var NAV_ICONS = {upload:"⬆",dashboard:"◼",eficiencia:"⚡",riesgo:"⚠",tendencia:"↗",policies:"📋",auditoria:"🔍",rules:"📖"};

  return (
    <div style={{display:"flex",height:"100vh",overflow:"hidden",background:C.bg,fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif",
      backgroundImage:"radial-gradient(ellipse at 20% 50%, rgba(31,107,46,0.05) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(31,107,46,0.04) 0%, transparent 50%)"}}>

      {/* ══ SIDEBAR MODERNO ══ */}
      <div style={{width:sidebar?220:64,transition:"width 0.25s cubic-bezier(0.4,0,0.2,1)",
        background:C.nav,borderRight:"1px solid "+C.navBd,
        display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden",height:"100vh",
        boxShadow:"4px 0 24px rgba(0,0,0,0.3)"}}>

        {/* Logo */}
        <div style={{padding:sidebar?"18px 16px":"14px 0",borderBottom:"1px solid "+C.navBd,
          display:"flex",alignItems:"center",gap:12,flexShrink:0,justifyContent:sidebar?"flex-start":"center",
          cursor:"pointer"}} onClick={function(){setSB(!sidebar);}}>
          <div style={{width:36,height:36,borderRadius:10,flexShrink:0,
            background:"linear-gradient(135deg,#1a5228,#2d8a41)",
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:12,fontWeight:800,color:"#4ade80",letterSpacing:"-0.5px",
            boxShadow:"0 2px 12px rgba(74,222,128,0.25),inset 0 1px 0 rgba(255,255,255,0.1)"}}>SC</div>
          {sidebar && (
            <div style={{minWidth:0}}>
              <div style={{color:C.navT,fontSize:14,fontWeight:800,letterSpacing:"-0.3px",lineHeight:1.1}}>Seguimiento</div>
              <div style={{color:C.navTm,fontSize:10,fontWeight:500,letterSpacing:"1px",textTransform:"uppercase",marginTop:1}}>Cañaveral</div>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav style={{flex:1,padding:"10px 8px",overflowY:"auto",overflowX:"hidden"}}>
          {nav.map(function(n){
            var act = view === n.id;
            return (
              <button key={n.id} onClick={function(){setView(n.id);}}
                style={{display:"flex",width:"100%",alignItems:"center",gap:10,
                  padding:sidebar?"10px 12px":"10px 0",marginBottom:2,
                  borderRadius:10,border:"none",cursor:"pointer",
                  justifyContent:sidebar?"flex-start":"center",
                  background:act?"linear-gradient(135deg,rgba(74,222,128,0.15),rgba(74,222,128,0.08))":"transparent",
                  color:act?"#4ade80":C.navTm,
                  boxShadow:act?"inset 0 0 0 1px rgba(74,222,128,0.2)":"none",
                  transition:"all 0.15s ease"}}>
                <span style={{fontSize:14,flexShrink:0,opacity:act?1:0.7,
                  filter:act?"none":"grayscale(0.3)"}}>{NAV_ICONS[n.id]||"·"}</span>
                {sidebar && <span style={{fontSize:12,fontWeight:act?700:500,letterSpacing:"0.1px",
                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{n.label}</span>}
                {act && sidebar && <span style={{marginLeft:"auto",width:6,height:6,borderRadius:"50%",background:"#4ade80",flexShrink:0}} />}
              </button>
            );
          })}
        </nav>

        {/* Footer usuario */}
        <div style={{padding:"10px 8px",borderTop:"1px solid "+C.navBd,flexShrink:0}}>
          {sidebar ? (
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",
              borderRadius:10,background:"rgba(255,255,255,0.04)",marginBottom:6}}>
              <div style={{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#1a5228,#2d8a41)",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#4ade80",flexShrink:0}}>
                {user.name.charAt(0)}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:C.navT,fontSize:11,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{user.name}</div>
                <div style={{color:C.navTm,fontSize:9,textTransform:"uppercase",letterSpacing:"0.5px",marginTop:1}}>{user.role}</div>
              </div>
            </div>
          ) : (
            <div style={{display:"flex",justifyContent:"center",marginBottom:6}}>
              <div style={{width:32,height:32,borderRadius:9,background:"linear-gradient(135deg,#1a5228,#2d8a41)",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:"#4ade80"}}>
                {user.name.charAt(0)}
              </div>
            </div>
          )}
          <button onClick={function(){setUser(null);setData({marc:[],fact:[]});setView("upload");}}
            style={{width:"100%",padding:sidebar?"7px 10px":"7px 0",borderRadius:8,border:"none",cursor:"pointer",
              background:"rgba(239,68,68,0.1)",color:"#fca5a5",
              fontSize:11,fontWeight:500,transition:"background 0.15s",
              display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <span style={{fontSize:12}}>⏻</span>
            {sidebar && "Cerrar sesión"}
          </button>
        </div>
      </div>

      {/* ══ ÁREA DERECHA ══ */}
      <div style={{flex:1,overflowY:"auto",overflowX:"hidden",display:"flex",flexDirection:"column"}}>

        {/* Topbar */}
        <div style={{padding:"0 24px",height:56,background:"rgba(255,255,255,0.85)",
          backdropFilter:"blur(12px)",borderBottom:"1px solid "+C.bd2,
          display:"flex",justifyContent:"space-between",alignItems:"center",
          position:"sticky",top:0,zIndex:10,flexShrink:0,
          boxShadow:"0 1px 0 rgba(31,107,46,0.06)"}}>
          {/* Breadcrumb */}
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:16,opacity:0.7}}>{NAV_ICONS[view]||"·"}</span>
            <span style={{color:C.td,fontSize:12,fontWeight:500}}>Cañaveral</span>
            <span style={{color:C.bd2,fontSize:12}}>›</span>
            <span style={{color:C.t,fontSize:13,fontWeight:700,letterSpacing:"-0.2px"}}>{(nav.find(function(n){return n.id===view;})||{label:""}).label}</span>
          </div>
          {/* Acciones */}
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {has && <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:20,
              background:"rgba(31,107,46,0.07)",border:"1px solid "+C.bd}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:"#4ade80",flexShrink:0,
                boxShadow:"0 0 6px rgba(74,222,128,0.6)"}} />
              <span style={{fontSize:11,color:C.tm,fontWeight:500}}>{data.marc.length.toLocaleString()} registros</span>
            </div>}
            {has && <div style={{position:"relative"}}>
              <button onClick={function(){setExpM(!expM);}}
                style={{padding:"7px 14px",borderRadius:8,fontSize:12,fontWeight:600,
                  background:"linear-gradient(135deg,#1f6b2e,#2d8a41)",border:"none",
                  color:"#fff",cursor:"pointer",boxShadow:"0 2px 8px rgba(31,107,46,0.3)",
                  display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:11}}>⬇</span> Exportar
              </button>
              {expM && <div>
                <div onClick={function(){setExpM(false);}} style={{position:"fixed",inset:0,zIndex:49}} />
                <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,zIndex:50,
                  background:C.sf,border:"1px solid "+C.bd2,borderRadius:12,padding:6,
                  minWidth:190,boxShadow:"0 8px 32px rgba(0,0,0,0.12),0 2px 8px rgba(0,0,0,0.08)"}}>
                  <button onClick={function(){expMem();setExpM(false);}}
                    style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 12px",
                      borderRadius:8,border:"none",cursor:"pointer",background:"transparent",
                      color:C.t,fontSize:12,textAlign:"left",fontWeight:600,transition:"background 0.1s"}}
                    onMouseEnter={function(e){e.currentTarget.style.background=C.sa;}}
                    onMouseLeave={function(e){e.currentTarget.style.background="transparent";}}>
                    <span>💾</span> Memoria Portable (.json)
                  </button>
                  <button onClick={function(){expXls();setExpM(false);}}
                    style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 12px",
                      borderRadius:8,border:"none",cursor:"pointer",background:"transparent",
                      color:C.t,fontSize:12,textAlign:"left",transition:"background 0.1s"}}
                    onMouseEnter={function(e){e.currentTarget.style.background=C.sa;}}
                    onMouseLeave={function(e){e.currentTarget.style.background="transparent";}}>
                    <span>📊</span> Datos para Excel
                  </button>
                </div>
              </div>}
            </div>}
            {has && <button
              onClick={function(){if(confirm("¿Reiniciar? Se borrarán los datos cargados.")){setData({marc:[],fact:[]});setFS("");setView("upload");}}}
              style={{padding:"7px 12px",borderRadius:8,fontSize:12,fontWeight:500,
                background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",
                color:"#ef4444",cursor:"pointer",transition:"all 0.15s"}}>
              Reiniciar
            </button>}
          </div>
        </div>

        {/* Contenido */}
        <div style={{flex:1,padding:"24px"}}>
          <div style={{background:C.sf,borderRadius:20,padding:28,
            minHeight:"calc(100vh - 128px)",
            boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 24px rgba(31,107,46,0.06)",
            border:"1px solid "+C.bd}}>
            {content}
          </div>
        </div>
      </div>
    </div>
  );
}


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
