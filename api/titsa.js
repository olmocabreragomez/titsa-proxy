import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, '../titsa_data.json'), 'utf-8'));

// ── Índice de paradas por línea ───────────────────────────────────────────────
const paradasPorLinea = {};
for (const [num, linea] of Object.entries(data.lineas)) {
  const todasParadas = new Set();
  (linea.sentidos || []).forEach(s => (s.recorrido || []).forEach(p => todasParadas.add(p.id)));
  paradasPorLinea[num] = [...todasParadas];
}

// ── Alias de zonas: mapea lo que dice el usuario a IDs de paradas concretas ──
// Prioriza intercambiadores y paradas principales de cada zona
const ALIAS_ZONAS = {
  // Santa Cruz
  'santa cruz':      ['9449','9450','9451','9452'],  // INTERCAMBIADOR STA.CRUZ
  'santacruz':       ['9449','9450','9451','9452'],
  'intercambiador santa cruz': ['9449','9450','9451','9452'],
  // La Laguna
  'la laguna':       ['2625','2734','2830'],          // INTERCAMBIADOR LAGUNA
  'laguna':          ['2625','2734','2830'],
  'intercambiador laguna': ['2625','2734','2830'],
  'intercambiador de la laguna': ['2625','2734','2830'],
  // Puerto de la Cruz
  'puerto de la cruz': ['5090'],
  'puerto cruz':     ['5090'],
  // Aeropuerto
  'aeropuerto':      ['3916','3917','3918','3919'],   // AEROPUERTO TFN
  'tenerife norte':  ['3916','3917'],
  'tenerife sur':    ['6001','6002'],
  'los rodeos':      ['3916','3917'],
  'reina sofia':     ['6001','6002'],
  // Los Cristianos / Costa Adeje
  'los cristianos':  ['6100','6101','6102'],
  'costa adeje':     ['6200','6201'],
  'adeje':           ['6200','6201'],
  // Otras zonas comunes
  'icod':            ['1100','1101'],
  'garachico':       ['1200'],
  'los realejos':    ['4300','4301'],
  'tacoronte':       ['2100','2101'],
  'bajamar':         ['2200'],
  'tejina':          ['2300'],
  'tegueste':        ['2400'],
  'guamasa':         ['2500'],
  'las mercedes':    ['2600'],
};

// Dado un texto de zona, devuelve los IDs de parada a usar
function resolverZona(texto) {
  const t = texto.toLowerCase().trim();
  // Buscar en alias exactos primero
  for (const [alias, ids] of Object.entries(ALIAS_ZONAS)) {
    if (t.includes(alias) || alias.includes(t)) {
      // Filtrar solo los IDs que realmente existen en los datos
      return ids.filter(id => data.paradas[id]);
    }
  }
  // Si no hay alias, buscar por nombre de parada (priorizar intercambiadores)
  const todas = Object.entries(data.paradas).filter(([, p]) =>
    p.nombre.toLowerCase().includes(t)
  );
  // Ordenar: primero intercambiadores, luego el resto
  todas.sort(([, a], [, b]) => {
    const aEsIc = a.nombre.toLowerCase().includes('intercambiador');
    const bEsIc = b.nombre.toLowerCase().includes('intercambiador');
    if (aEsIc && !bEsIc) return -1;
    if (!aEsIc && bEsIc) return 1;
    return 0;
  });
  return todas.slice(0, 10).map(([id]) => id);
}

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { linea, parada, origen, destino } = req.query;

  // ── 1. Info de una línea ──────────────────────────────────────────────────
  if (linea) {
    const num = linea.toString().replace(/^0+/, '');
    const info = data.lineas[num];
    if (!info) return res.status(404).json({ error: `Línea ${linea} no encontrada` });

    // Solo los 2 sentidos principales (mayor número de paradas = más completo)
    let sentidos = [...(info.sentidos || [])];
    if (sentidos.length > 2) {
      sentidos = sentidos
        .sort((a, b) => (b.recorrido?.length || 0) - (a.recorrido?.length || 0))
        .slice(0, 2);
    }

    return res.status(200).json({ num, ...info, sentidos });
  }

  // ── 2. Info de una parada ─────────────────────────────────────────────────
  if (parada) {
    const pid = parada.toString();
    const info = data.paradas[pid];
    if (!info) return res.status(404).json({ error: `Parada ${parada} no encontrada` });

    const lineas_detalle = (info.lineas || []).map(num => {
      const l = data.lineas[num];
      return l ? { num, nombre: l.nombre } : { num, nombre: '' };
    }).filter(l => l.nombre);

    return res.status(200).json({ id: pid, nombre: info.nombre, lineas: lineas_detalle });
  }

  // ── 3. Buscar ruta origen → destino ──────────────────────────────────────
  if (origen && destino) {
    const ori = origen.toLowerCase().trim();
    const dst = destino.toLowerCase().trim();

    // Buscar paradas que coincidan con origen y destino
    const paradas_ori = Object.entries(data.paradas).filter(([, p]) =>
      p.nombre.toLowerCase().includes(ori)
    );
    const paradas_dst = Object.entries(data.paradas).filter(([, p]) =>
      p.nombre.toLowerCase().includes(dst)
    );

    if (!paradas_ori.length) return res.status(404).json({
      error: `No encontré paradas con "${ori}". Intenta con un nombre más genérico (ej: "laguna", "aeropuerto", "santa cruz").`
    });
    if (!paradas_dst.length) return res.status(404).json({
      error: `No encontré paradas con "${dst}". Intenta con un nombre más genérico (ej: "laguna", "aeropuerto", "santa cruz").`
    });

    // Líneas que pasan por al menos una parada de origen
    const lineas_ori = new Set(paradas_ori.flatMap(([, p]) => p.lineas || []));
    // Líneas que pasan por al menos una parada de destino
    const lineas_dst = new Set(paradas_dst.flatMap(([, p]) => p.lineas || []));

    // Líneas directas (en ambos conjuntos)
    const directas = [...lineas_ori].filter(l => lineas_dst.has(l));

    const resultado = {
      origen: paradas_ori.slice(0, 5).map(([id, p]) => ({ id, nombre: p.nombre })),
      destino: paradas_dst.slice(0, 5).map(([id, p]) => ({ id, nombre: p.nombre })),
      directas: directas.slice(0, 5).map(num => {
        const l = data.lineas[num];
        if (!l) return null;
        // Horarios del primer sentido laborable
        const primerSentido = (l.sentidos || [])[0];
        return {
          num,
          nombre: l.nombre,
          horarios_laborable: primerSentido ? (primerSentido.horarios?.laborable || []) : []
        };
      }).filter(Boolean),
      transbordos: []
    };

    // Si no hay directas, buscar transbordos (parada común entre línea de origen y línea de destino)
    if (!directas.length) {
      const candidatos = [];
      const lineas_ori_arr = [...lineas_ori];
      const lineas_dst_arr = [...lineas_dst];

      outer:
      for (const l1 of lineas_ori_arr) {
        const stops1 = new Set(paradasPorLinea[l1] || []);
        for (const l2 of lineas_dst_arr) {
          if (l1 === l2) continue;
          const stops2 = paradasPorLinea[l2] || [];
          const comunes = stops2.filter(s => stops1.has(s));
          if (comunes.length) {
            const linea1 = data.lineas[l1];
            const linea2 = data.lineas[l2];
            const paradaT = data.paradas[comunes[0]];
            if (!linea1 || !linea2) continue;
            // Verificar que el sentido es correcto (l1 lleva al punto de transbordo, l2 lleva al destino)
            const sentido1 = (linea1.sentidos || []).find(s =>
              s.recorrido && s.recorrido.some(p => p.id === comunes[0])
            );
            const sentido2 = (linea2.sentidos || []).find(s =>
              s.recorrido && paradas_dst.some(([pid]) =>
                s.recorrido.some(p => p.id === pid)
              )
            );
            candidatos.push({
              linea1: {
                num: l1,
                nombre: linea1.nombre,
                horarios_laborable: sentido1 ? (sentido1.horarios?.laborable || []) : []
              },
              linea2: {
                num: l2,
                nombre: linea2.nombre,
                horarios_laborable: sentido2 ? (sentido2.horarios?.laborable || []) : []
              },
              transbordo: { id: comunes[0], nombre: paradaT?.nombre || comunes[0] }
            });
            if (candidatos.length >= 3) break outer;
          }
        }
      }
      resultado.transbordos = candidatos;
    }

    return res.status(200).json(resultado);
  }

  return res.status(400).json({ error: 'Usa: ?linea=X, ?parada=X, o ?origen=X&destino=Y' });
}
