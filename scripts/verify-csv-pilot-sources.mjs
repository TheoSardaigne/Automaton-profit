// Fixed read-only source verification. No wallet, account, model or paid API.
import fs from "node:fs/promises";
import path from "node:path";
import { createLocalWebTools } from "../dist/agent/local-web-tools.js";

const expectedHome = path.resolve("C:/root");
if (process.platform !== "win32" || path.resolve(process.env.HOME || "") !== expectedHome) {
  throw new Error("Run only with the configured Aurum HOME=C:/root");
}
const sources = [
  { id: "buyer-demand", url: "https://www.upwork.com/freelance-jobs/apply/Excel-Data-Cleaning-and-Automation_~022105597905396259311/", marker: /100,000\s+rows/i,
    fact: "Une annonce demande du nettoyage Excel de plus de 100 000 lignes ; volume hors périmètre du pilote. Aucune vente prouvée." },
  { id: "competitor-offer", url: "https://www.upwork.com/services/product/development-it-automated-data-entry-clean-raw-data-create-reports-1980416903749725322", marker: /Starter\s*\$25/i,
    fact: "Une offre concurrente affiche une formule de départ à 25 USD. Prix proposé, pas transaction observée." },
  { id: "upwork-fee", url: "https://support.upwork.com/hc/en-us/articles/211062538-Learn-about-the-Freelancer-Service-Fee", marker: /0%\s+to\s+15%/i,
    fact: "La commission freelance annoncée varie de 0 à 15 % par contrat ; le taux précis est affiché avant engagement." },
  { id: "upwork-connects", url: "https://support.upwork.com/hc/en-us/articles/211062898-Understanding-and-using-Connects", marker: /\$0\.15/i,
    fact: "Un Connect coûte 0,15 USD ; le nombre requis pour une candidature reste à vérifier sur l'annonce et le compte." },
  { id: "fiverr-earnings", url: "https://help.fiverr.com/hc/en-us/articles/9234443621137-Your-earnings-page", marker: /80%/i,
    fact: "Le freelance reçoit 80 % du montant de la commande selon l'aide officielle, avant fiscalité et frais éventuels de retrait." },
  { id: "fiverr-onboarding", url: "https://help.fiverr.com/hc/en-us/articles/360010451397-Creating-a-Gig", marker: /freelancer\s+(?:profile|onboarding)/i,
    fact: "Publier une offre nécessite de compléter le profil et l'onboarding du freelance ; état du compte utilisateur inconnu." },
  { id: "fiverr-ai", url: "https://help.fiverr.com/hc/en-us/articles/37554976380177-Using-AI-on-Fiverr-Guidelines-for-freelancers-and-clients", marker: /high-quality/i,
    fact: "L'utilisation responsable de l'IA est permise ; la qualité finale reste sous responsabilité du freelance." },
];
const root = path.join(expectedHome, ".automaton", "workspace");
const scope = `research/first-payment/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const output = path.join(root, scope);
let current = path.parse(output).root;
for (const part of output.slice(current.length).split(path.sep).filter(Boolean)) {
  current = path.join(current, part);
  try { const stat = await fs.lstat(current); if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Unsafe output directory"); }
  catch (error) { if (error.code !== "ENOENT") throw error; await fs.mkdir(current); }
}
const tools = createLocalWebTools({ maxRequests: 20 });
const fetchTool = tools.find((tool) => tool.name === "local_web_fetch");
const evidence = [];
for (const source of sources) {
  const result = await fetchTool.execute({ url: source.url }, {});
  const status = /HTTP status: (\d+)/.exec(result)?.[1];
  const verified = status === "200" && source.marker.test(result);
  evidence.push({ id: source.id, url: source.url, checkedAt: new Date().toISOString(),
    transport: "Aurum local_web_fetch", httpStatus: status ? Number(status) : null,
    factVerifiedByLocalFetch: verified, fact: verified ? source.fact : null,
    failure: verified ? null : result.startsWith("Blocked:") ? result : "Page inaccessible ou contenu attendu absent ; ne pas conclure à partir de ce fetch." });
  console.log(`${source.id}: ${verified ? "primary content verified" : `not verified (HTTP ${status || "blocked"})`}`);
}
await fs.writeFile(path.join(output, "primary-source-checks.json"), JSON.stringify({
  scope, checkedBy: "Codex via Aurum's read-only tools", maxWebAttempts: 20,
  externalSpendCents: 0, walletLoaded: false, paymentVerified: false, evidence,
}, null, 2));
console.log(`Evidence saved: ${path.join(output, "primary-source-checks.json")}`);
