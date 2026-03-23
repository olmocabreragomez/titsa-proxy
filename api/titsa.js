import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, '../titsa_data.json'), 'utf-8'));

// ── Índice inverso: para cada parada, qué líneas pasan (ya está en data.paradas[x].lineas)
// ── Índice de paradas por línea: para cada línea, qué paradas tiene (construido en memoria)
const paradasPorLinea = {};
for (const [num, linea] of Object.entries(data.lineas)) {
  const sentidos = linea.sentidos || [];
  const todasParadas = new Set();
  sentidos.forEach(s => (s.recorrido || []).forEach(p => todasParadas.add(p.id)));
  paradasPorLinea[num] = [...todasParadas];
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
    return res.status(200).json({ num, ...info });
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
