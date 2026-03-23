import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, '../titsa_data.json'), 'utf-8'));

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, linea, parada, origen, destino } = req.query;

  // ── 1. Info de una línea ──────────────────────────────────────────────────
  if (action === 'linea' || linea) {
    const num = (linea || '').toString().replace(/^0+/, '');
    const info = data.lineas[num];
    if (!info) return res.status(404).json({ error: `Línea ${linea} no encontrada` });
    return res.status(200).json(info);
  }

  // ── 2. Info de una parada ─────────────────────────────────────────────────
  if (action === 'parada' || parada) {
    const pid = (parada || '').toString();
    const info = data.paradas[pid];
    if (!info) return res.status(404).json({ error: `Parada ${parada} no encontrada` });

    const lineas_detalle = info.lineas.map(num => {
      const l = data.lineas[num];
      return l ? { num, nombre: l.nombre } : { num, nombre: '' };
    });

    return res.status(200).json({
      id: pid,
      nombre: info.nombre,
      lineas: lineas_detalle
    });
  }

  // ── 3. Buscar ruta origen → destino ──────────────────────────────────────
  if (action === 'ruta' || (origen && destino)) {
    const ori = (origen || '').toLowerCase().trim();
    const dst = (destino || '').toLowerCase().trim();

    if (!ori || !dst) return res.status(400).json({ error: 'Faltan origen y destino' });

    const paradas_ori = Object.entries(data.paradas).filter(([, p]) =>
      p.nombre.toLowerCase().includes(ori)
    );
    const paradas_dst = Object.entries(data.paradas).filter(([, p]) =>
      p.nombre.toLowerCase().includes(dst)
    );

    if (!paradas_ori.length) return res.status(404).json({ error: `No se encontraron paradas con "${ori}"` });
    if (!paradas_dst.length) return res.status(404).json({ error: `No se encontraron paradas con "${dst}"` });

    const lineas_ori = new Set(paradas_ori.flatMap(([, p]) => p.lineas));
    const lineas_dst = new Set(paradas_dst.flatMap(([, p]) => p.lineas));

    const directas = [...lineas_ori].filter(l => lineas_dst.has(l));

    const resultado = {
      origen: paradas_ori.slice(0, 3).map(([id, p]) => ({ id, nombre: p.nombre })),
      destino: paradas_dst.slice(0, 3).map(([id, p]) => ({ id, nombre: p.nombre })),
      directas: directas.map(num => {
        const l = data.lineas[num];
        return l ? { num, nombre: l.nombre, horarios_laborable: l.horarios.laborable } : null;
      }).filter(Boolean),
      transbordos: []
    };

    if (!directas.length) {
      const candidatos = [];
      for (const l1 of lineas_ori) {
        const linea1 = data.lineas[l1];
        if (!linea1) continue;
        const stops1 = new Set(linea1.recorrido.map(p => p.id));

        for (const l2 of lineas_dst) {
          if (l1 === l2) continue;
          const linea2 = data.lineas[l2];
          if (!linea2) continue;
          const stops2 = new Set(linea2.recorrido.map(p => p.id));

          const comunes = [...stops1].filter(s => stops2.has(s));
          if (comunes.length) {
            const parada_transbordo = data.paradas[comunes[0]];
            candidatos.push({
              linea1: { num: l1, nombre: linea1.nombre, horarios_laborable: linea1.horarios.laborable },
              linea2: { num: l2, nombre: linea2.nombre, horarios_laborable: linea2.horarios.laborable },
              transbordo: { id: comunes[0], nombre: parada_transbordo?.nombre || comunes[0] }
            });
            if (candidatos.length >= 3) break;
          }
        }
        if (candidatos.length >= 3) break;
      }
      resultado.transbordos = candidatos;
    }

    return res.status(200).json(resultado);
  }

  // ── 4. Buscar paradas por nombre ─────────────────────────────────────────
  if (action === 'buscar') {
    const q = (req.query.q || '').toLowerCase().trim();
    if (!q || q.length < 2) return res.status(400).json({ error: 'Búsqueda muy corta' });

    const resultados = Object.entries(data.paradas)
      .filter(([, p]) => p.nombre.toLowerCase().includes(q))
      .slice(0, 10)
      .map(([id, p]) => ({ id, nombre: p.nombre, lineas: p.lineas }));

    return res.status(200).json({ resultados });
  }

  return res.status(400).json({ error: 'Acción no válida. Usa: linea, parada, ruta, buscar' });
}
