/* Palabrón · Paseo de la Fama compartido
   GET  /api/fame            -> { records, games }
   POST /api/fame {gid, plays:[nick], feats:[{k,v,who,c,w?,d?,o?,n?}]}
        -> { records, games, broken:[{k, old, rec}] }
   One JSON blob holds everything; writes use the blob's etag so two phones finishing
   the same game at once never overwrite each other. */
import { getStore } from "@netlify/blobs";

const KEYS = { long: 20, best: 40, pts60: 1500, pts120: 2500, pts180: 3500, words: 600, long7: 300, avg: 16,
  uniq: 600, margin: 3000, daily: 2500, streak: 3650, evo: 7, games: 1e9 };
const WORD = /^[a-zñ]{3,20}$/;
const bonus = L => (L >= 9 ? 5 : L >= 8 ? 3 : L >= 7 ? 2 : L >= 6 ? 1 : 0);
const cleanNick = s => String(s || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 14);
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

function valid(f) {
  if (!f || typeof f !== "object" || !(f.k in KEYS) || f.k === "games") return null;
  const v = Number(f.v); if (!Number.isFinite(v) || v <= 0 || v > KEYS[f.k]) return null;
  const who = cleanNick(f.who); if (!who) return null;
  const c = Number.isInteger(f.c) && f.c >= 0 && f.c < 13 ? f.c : 0;
  const out = { k: f.k, v: f.k === "avg" ? Math.round(v * 100) / 100 : Math.round(v), who, c };
  if (f.k === "long" || f.k === "best") {
    if (!WORD.test(f.w || "")) return null;
    const w = f.w;
    if (f.k === "long" && w.length !== out.v) return null;
    if (f.k === "best" && w.length + bonus(w.length) !== out.v) return null;
    out.w = w;
  }
  if (f.d && [60, 120, 180].includes(f.d)) out.d = f.d;
  if (f.o) out.o = cleanNick(f.o);
  if (Number.isInteger(f.n) && f.n > 0 && f.n < 100000) out.n = f.n;
  return out;
}

export default async (req) => {
  const store = getStore("fame");
  if (req.method === "GET") {
    const doc = (await store.get("doc", { type: "json" })) || {};
    return json({ records: doc.records || {}, games: doc.games || {} });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let body; try { body = await req.json(); } catch { return json({ error: "json" }, 400); }
  const gid = String(body.gid || "").slice(0, 40);
  const feats = (Array.isArray(body.feats) ? body.feats : []).slice(0, 60).map(valid).filter(Boolean);
  const plays = (Array.isArray(body.plays) ? body.plays : []).slice(0, 8).map(p => ({ n: cleanNick(p && p.n), c: Number.isInteger(p && p.c) && p.c >= 0 && p.c < 13 ? p.c : 0 })).filter(p => p.n);
  for (let attempt = 0; attempt < 5; attempt++) {
    const got = await store.getWithMetadata("doc", { type: "json" });
    const doc = (got && got.data) || { records: {}, games: {}, seen: [] };
    doc.records ||= {}; doc.games ||= {}; doc.seen ||= []; doc.gc ||= {};
    const broken = [], now = Date.now();
    const firstTime = gid && !doc.seen.includes(gid);
    for (const f of feats) {
      const cur = doc.records[f.k];
      if (!cur || f.v > cur.v) {
        const rec = { ...f, t: now, gid, prev: cur ? { v: cur.v, who: cur.who, w: cur.w } : null };
        delete rec.k; doc.records[f.k] = rec; broken.push({ k: f.k, old: rec.prev, rec });
      } else if (cur.gid && cur.gid === gid && cur.who === f.who && cur.v === f.v) {
        /* another phone of the same game already saved it: it still counts as broken for this player */
        broken.push({ k: f.k, old: cur.prev || null, rec: cur });
      }
    }
    if (firstTime) {
      for (const p of plays) { doc.games[p.n] = (doc.games[p.n] || 0) + 1; doc.gc[p.n] = p.c; }
      doc.seen.push(gid); if (doc.seen.length > 3000) doc.seen = doc.seen.slice(-2000);
      const top = Object.entries(doc.games).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= 3) {
        const cur = doc.records.games;
        if (!cur || top[1] > cur.v) {
          const rec = { v: top[1], who: top[0], c: doc.gc[top[0]] || 0, t: now, gid, prev: cur ? { v: cur.v, who: cur.who } : null };
          doc.records.games = rec; if (!cur || cur.who !== top[0]) broken.push({ k: "games", old: rec.prev, rec });
        }
      }
    }
    if (!broken.length && !firstTime) return json({ records: doc.records, games: doc.games, broken: [] });
    const res = got ? await store.setJSON("doc", doc, { onlyIfMatch: got.etag }) : await store.setJSON("doc", doc, { onlyIfNew: true });
    if (res.modified) return json({ records: doc.records, games: doc.games, broken });
  }
  return json({ error: "busy" }, 503);
};

export const config = { path: "/api/fame" };
