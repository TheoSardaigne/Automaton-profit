// Offline review UI. Source text is rendered with textContent, never executed.
import fs from "node:fs/promises";
import path from "node:path";
const base = path.resolve("research/capability-build-v2/benchmark");
const records = JSON.parse(await fs.readFile(path.join(base, "results.json"), "utf8"));
const checks = records.flatMap((r) => r.validated.flatMap((plan) => plan.fields.filter((f) => f.status === "VERIFIED_EVIDENCE").map((f) => ({
  entity: r.entity, plan_name: plan.plan_name, billing_option: plan.billing_option, field: f.field,
  value: f.normalized_value, quote: f.exact_evidence_quote, source_url: f.source_url,
}))));
const payload = JSON.stringify(checks).replace(/</g, "\\u003c");
const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Aurum — revue pricing chronométrée</title>
<style>body{font:16px system-ui;margin:32px auto;max-width:1120px;color:#14213a}button,select{font:inherit;padding:9px;margin:5px}table{border-collapse:collapse;width:100%}td,th{padding:12px;border:1px solid #d7dfe9;vertical-align:top}pre{white-space:pre-wrap;max-width:500px;font:14px monospace}header{position:sticky;top:0;background:#fff;padding:14px;border-bottom:2px solid #14213a}small{color:#536174}</style>
<header><h1>Revue humaine — preuves pricing v2</h1><p>Vérifier chaque valeur, sa citation, le plan et l'option. Une citation exacte ne suffit pas si son sens est incorrect. Aucun appel réseau automatique.</p>
<button id="start">Démarrer le chrono</button><button id="stop" disabled>Terminer et exporter le relevé</button><span id="clock">Non démarré</span><p id="state"></p></header>
<p>Ouvrir les sources manuellement si nécessaire. Les quotes montrent la capture du benchmark, pas une promesse de fraîcheur. Laisser « INCERTAIN » si la donnée dynamique n'est pas vérifiable. Aucun résultat humain n'est prérempli.</p>
<table><thead><tr><th>Entreprise / plan / option</th><th>Champ / valeur</th><th>Source / preuve exacte</th><th>Verdict humain</th></tr></thead><tbody id="rows"></tbody></table>
<script>
const checks=${payload};const decisions=[];let started=null,startIso=null;const selects=[];
const tbody=document.getElementById('rows');
checks.forEach((c,i)=>{const tr=document.createElement('tr');const name=document.createElement('td');name.textContent=c.entity+' / '+c.plan_name+' ['+c.billing_option+']';tr.append(name);
const val=document.createElement('td');val.textContent=c.field+' = '+JSON.stringify(c.value);tr.append(val);
const evidence=document.createElement('td');const a=document.createElement('a');a.href=c.source_url;a.textContent='Source publique';a.target='_blank';a.rel='noopener noreferrer';evidence.append(a);const pre=document.createElement('pre');pre.textContent=c.quote;evidence.append(pre);tr.append(evidence);
const answer=document.createElement('td');const select=document.createElement('select');[['','NON REVU'],['CORRECT','CORRECT'],['INCORRECT','INCORRECT'],['UNCERTAIN','INCERTAIN']].forEach(([value,label])=>{const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option)});select.disabled=true;selects.push(select);answer.append(select);tr.append(answer);tbody.append(tr);});
document.getElementById('start').onclick=()=>{if(started!==null)return;started=performance.now();startIso=new Date().toISOString();selects.forEach(s=>s.disabled=false);document.getElementById('start').disabled=true;document.getElementById('stop').disabled=false;};
setInterval(()=>{if(started!==null)document.getElementById('clock').textContent=Math.round((performance.now()-started)/1000)+' secondes écoulées';},1000);
document.getElementById('stop').onclick=()=>{const elapsed=(performance.now()-started)/1000;const endIso=new Date().toISOString();const rows=checks.map((c,i)=>({...c,verdict:selects[i].value||'NOT_REVIEWED'}));
const reviewed=rows.filter(r=>r.verdict!=='NOT_REVIEWED');const correct=rows.filter(r=>r.verdict==='CORRECT').length;const incorrect=rows.filter(r=>r.verdict==='INCORRECT').length;
const result={benchmark:'capability-build-v2',reviewer:'OWNER_DECLARED_HUMAN',start_iso:startIso,end_iso:endIso,elapsed_seconds:elapsed,accepted_fields:checks.length,reviewed_fields:reviewed.length,correct,incorrect,uncertain:rows.filter(r=>r.verdict==='UNCERTAIN').length,not_reviewed:rows.filter(r=>r.verdict==='NOT_REVIEWED').length,correct_fraction_all_accepted:checks.length?correct/checks.length:null,rows};
const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='pricing-v2-human-review.json';link.click();URL.revokeObjectURL(link.href);document.getElementById('state').textContent='Relevé exporté. Transmettre ce fichier au propriétaire du journal ; aucun envoi automatique.';selects.forEach(s=>s.disabled=true);document.getElementById('stop').disabled=true;document.getElementById('clock').textContent=elapsed.toFixed(1)+' secondes mesurées';started=null;};
</script></html>`;
await fs.writeFile(path.join(base, "human-review.html"), html, "utf8");
await fs.writeFile(path.join(base, "human-review-template.json"), JSON.stringify({ benchmark: "capability-build-v2", status: "PENDING_OWNER_TIMED_REVIEW", start_iso: "UNKNOWN", end_iso: "UNKNOWN", elapsed_seconds: "UNKNOWN", accepted_fields: checks.length, correct: "UNKNOWN", incorrect: "UNKNOWN", uncertain: "UNKNOWN", rows: checks.map((c) => ({ ...c, verdict: "NOT_REVIEWED" })) }, null, 2) + "\n", "utf8");
console.log(`Prepared ${checks.length} human review checks; no human result recorded.`);
