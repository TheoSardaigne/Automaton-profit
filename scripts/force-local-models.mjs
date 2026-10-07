import Database from "better-sqlite3";

const db = new Database("C:/root/.automaton/state.db");

const result = db.prepare(`
  UPDATE model_registry
  SET enabled = CASE WHEN provider = 'ollama' THEN 1 ELSE 0 END,
      updated_at = datetime('now')
`).run();

console.log("Models updated:", result.changes);

console.table(
  db.prepare(`
    SELECT model_id, provider, enabled
    FROM model_registry
    ORDER BY provider, model_id
  `).all()
);

db.close();
