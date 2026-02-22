// scripts/resetData.js
// ⚠️  ОГОҲӢ: Ин скрипт ҲАМАИ ҷадвалҳо ва баҳоҳоро пок мекунад!
// Иҷро кунед: node --experimental-vm-modules scripts/resetData.js
// ё: node scripts/resetData.js  (агар package.json "type":"module" дошта бошад)

import mongoose from "mongoose";
import readline from "readline";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// .env-ро пайдо мекунем (scripts/ папкааст, .env дар root)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const MONGO_URI = process.env.DB_URL || process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error("❌  MONGO_URI дар .env ёфт нашуд!");
  process.exit(1);
}

// ── Тасдиқ аз терминал ─────────────────────────────────────────────────────
function confirm(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ── Асосӣ ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║      ТОЗА КАРДАНИ МАЪЛУМОТҲОИ ҶАДВАЛ + БАҲОҲО       ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const answer = await confirm(
    "⚠️  Ин амал ҲАМАИ WeeklySchedule ва JournalEntry-ро пок мекунад.\n" +
    "   Оё боварӣ доред? (бале/yes): "
  );

  if (answer !== "бале" && answer !== "yes" && answer !== "b" && answer !== "y") {
    console.log("\n🚫 Амал бекор карда шуд.\n");
    process.exit(0);
  }

  console.log("\n🔌 Пайваст шудан ба MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log("✅ Пайваст шуд!\n");

  // ── 1. WeeklySchedule ────────────────────────────────────────────────────
  const wResult = await mongoose.connection.db
    .collection("weeklyschedules")
    .deleteMany({});
  console.log(`🗑️  WeeklySchedule: ${wResult.deletedCount} ҷадвал пок карда шуд`);

  // ── 2. JournalEntry (баҳо + ҳозирӣ) ─────────────────────────────────────
  const jResult = await mongoose.connection.db
    .collection("journalentries")
    .deleteMany({});
  console.log(`🗑️  JournalEntry:  ${jResult.deletedCount} ёддошт пок карда шуд`);

  console.log("\n✅ Тоза кардан тамом шуд!");
  console.log("   Акнун метавонед ҷадвалҳои нав созед.\n");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Хатогӣ:", err.message);
  process.exit(1);
});
