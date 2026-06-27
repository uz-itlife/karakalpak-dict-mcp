#!/usr/bin/env node
// karakalpak-dict-mcp — Karakalpak-Russian dictionary MCP server
// Инструменты: translate_kk_to_ru, translate_ru_to_kk, transliterate
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, "data");

// ── Загрузка данных ────────────────────────────────────────────────────────
const db       = new DatabaseSync(join(PUBLIC, "sozlik.db"));
const baseWords = loadWords("kk_base.json");
const baskWords = loadWords("kk_baskakov_clean.json");
const turaWords = loadWords("turabaev_full_ru_kk.json");
const dilmash   = JSON.parse(readFileSync(join(PUBLIC, "dilmash_examples.json"), "utf8"));

function loadWords(file) {
  const raw = JSON.parse(readFileSync(join(PUBLIC, file), "utf8"));
  return Array.isArray(raw) ? raw : (raw.words || []);
}

// ── Кириллица → латиница формата sozlik.db ────────────────────────────────
const CYR_MAP = [
  ["ш","sh"],["ч","ch"],["щ","shsh"],["ц","ts"],["ю","yu"],["я","ya"],["э","e"],["ə","á"],
  ["ғ","ǵ"],["ң","ń"],["ө","ó"],["ү","ú"],["қ","q"],["ұ","w"],["ў","w"],["ҳ","h"],
  ["а","a"],["б","b"],["в","v"],["г","g"],["д","d"],["е","e"],["ж","j"],["з","z"],
  ["и","i"],["й","y"],["к","k"],["л","l"],["м","m"],["н","n"],["о","o"],["п","p"],
  ["р","r"],["с","s"],["т","t"],["у","u"],["ф","f"],["х","x"],["ы","ı"],
];
const applyMap = (t, map) => { let r = t; for (const [a,b] of map) r = r.split(a).join(b); return r; };
const cyrToDbLat = (t) => applyMap(
  t.toLowerCase().normalize("NFC").replace(/[ӘәƏə]/g,"ə").replace(/[Ўў]/g,"ў"), CYR_MAP
);
const normDash = (s) => s.replace(/[–—­‐‑‒―﹘﹣－]/g, "-");

// ── Транслитерация КК кириллица ↔ латиница ────────────────────────────────
const CYR_TO_LAT = [
  ["Ч","Ch"],["ч","ch"],["Ш","Sh"],["ш","sh"],["Ц","Ts"],["ц","ts"],
  ["Ю","Yu"],["ю","yu"],["Я","Ya"],["я","ya"],["Э","E"],["э","e"],
  ["Ә","Á"],["ə","á"],["Ғ","Ǵ"],["ғ","ǵ"],["Ң","Ń"],["ң","ń"],
  ["Ө","Ó"],["ө","ó"],["Ү","Ú"],["ү","ú"],["Қ","Q"],["қ","q"],
  ["Ұ","W"],["ұ","w"],["Ҳ","H"],["ҳ","h"],
  ["А","A"],["а","a"],["Б","B"],["б","b"],["В","V"],["в","v"],
  ["Г","G"],["г","g"],["Д","D"],["д","d"],["Е","E"],["е","e"],
  ["Ж","J"],["ж","j"],["З","Z"],["з","z"],["И","I"],["и","i"],
  ["Й","Y"],["й","y"],["К","K"],["к","k"],["Л","L"],["л","l"],
  ["М","M"],["м","m"],["Н","N"],["н","n"],["О","O"],["о","o"],
  ["П","P"],["п","p"],["Р","R"],["р","r"],["С","S"],["с","s"],
  ["Т","T"],["т","t"],["У","U"],["у","u"],["Х","X"],["х","x"],
  ["Ы","ı"],["ы","ı"],["Ь",""],["Ъ",""],
];
const LAT_TO_CYR = [
  ["Ch","Ч"],["ch","ч"],["Sh","Ш"],["sh","ш"],["Ts","Ц"],["ts","ц"],
  ["Yu","Ю"],["yu","ю"],["Ya","Я"],["ya","я"],
  ["Á","Ə"],["á","ə"],["Ǵ","Ғ"],["ǵ","ғ"],["Ń","Ң"],["ń","ң"],
  ["Ó","Ө"],["ó","ө"],["Ú","Ү"],["ú","ү"],["Q","Қ"],["q","қ"],
  ["W","Ұ"],["w","ұ"],["H","Ҳ"],["h","ҳ"],
  ["A","А"],["a","а"],["B","Б"],["b","б"],["V","В"],["v","в"],
  ["G","Г"],["g","г"],["D","Д"],["d","д"],["E","Е"],["e","е"],
  ["I","И"],["i","и"],["J","Ж"],["j","ж"],["K","К"],["k","к"],
  ["L","Л"],["l","л"],["M","М"],["m","м"],["N","Н"],["n","н"],
  ["O","О"],["o","о"],["P","П"],["p","п"],["R","Р"],["r","р"],
  ["S","С"],["s","с"],["T","Т"],["t","т"],["U","У"],["u","у"],
  ["X","Х"],["x","х"],["Y","Й"],["y","й"],["Z","З"],["z","з"],
];

// ── Поиск КК → РУ ─────────────────────────────────────────────────────────
function searchKK(word) {
  const wn = normDash(word.trim().toUpperCase());

  let e = baseWords.find(w => w.kk && normDash(w.kk.toUpperCase()) === wn);
  if (!e && wn.includes("-")) e = baseWords.find(w => w.kk && normDash(w.kk.toUpperCase()) === wn.split("-")[0]);
  if (e) return { source: "kk_base", e };

  e = baskWords.find(w => w.kk && normDash(w.kk.toUpperCase()) === wn);
  if (!e && wn.includes("-")) e = baskWords.find(w => w.kk && normDash(w.kk.toUpperCase()) === wn.split("-")[0]);
  if (e) return { source: "Баскаков 1958", e };

  const lat = cyrToDbLat(normDash(word));
  let row = db.prepare("SELECT raw_word,translation FROM dictionary WHERE word=? AND type=1 LIMIT 1").get(lat);
  if (!row) row = db.prepare("SELECT raw_word,translation FROM dictionary WHERE word LIKE ? AND type=1 LIMIT 1").get(lat + "%");
  if (row) return { source: "sozlik.db", e: { kk: word.toUpperCase(), ru: row.translation } };

  return null;
}

// ── Поиск РУ → КК ─────────────────────────────────────────────────────────
function searchRU(word) {
  const wUp  = word.trim().toUpperCase();
  const wLow = word.trim().toLowerCase();

  let e = turaWords.find(w => w.ru && w.ru.toUpperCase() === wUp);
  if (e) return { source: "Тураев 2010", e };

  e = baskWords.find(w => w.ru && w.ru.toLowerCase().split(/[;,\s]+/).some(p => p.trim() === wLow));
  if (e) return { source: "Баскаков 1958", e };

  let row = db.prepare("SELECT raw_word,translation FROM dictionary WHERE word=? AND type=2 LIMIT 1").get(wLow);
  if (!row) row = db.prepare("SELECT raw_word,translation FROM dictionary WHERE word LIKE ? AND type=2 LIMIT 1").get(wLow + "%");
  if (row) return { source: "sozlik.db", e: { ru: word, kk: row.raw_word, translation: row.translation } };

  return null;
}

// ── Форматирование ─────────────────────────────────────────────────────────
function fmtKK(word, res) {
  if (!res) return `«${word}» — не найдено (kk_base, Баскаков, sozlik.db).`;
  const { source, e } = res;
  const lines = [
    `${e.kk || word.toUpperCase()}${e.lat ? " [" + e.lat + "]" : ""}${e.pos_ru ? " — " + e.pos_ru : ""}`,
    `📚 ${source}`,
  ];
  if (e.ru)            lines.push(`\nЗначение: ${e.ru.replace(/<[^>]*>/g, "")}`);
  if (e.definition_ru) lines.push(`Определение: ${e.definition_ru}`);
  if (e.synonyms || e.synonyms_kk) lines.push(`Синонимы: ${e.synonyms || e.synonyms_kk}`);
  if (e.antonyms)      lines.push(`Антонимы: ${e.antonyms}`);
  if (e.phraseology)   lines.push(`Фразеологизмы: ${e.phraseology}`);
  if (e.examples?.length) {
    lines.push("\nПримеры:");
    e.examples.slice(0, 3).forEach(ex =>
      lines.push("  — " + (typeof ex === "string" ? ex : `${ex.kk} — ${ex.ru}`))
    );
  }
  const ruKey = (e.ru || "").replace(/<[^>]*>/g,"").split(/[;,\s]/)[0].trim().toUpperCase();
  const exs = dilmash[ruKey];
  if (exs?.length) {
    lines.push("\nПримеры предложений (dilmash):");
    exs.slice(0, 2).forEach(ex => lines.push(`  КК: ${ex.kk}\n  РУ: ${ex.ru}`));
  }
  return lines.join("\n");
}

function fmtRU(word, res) {
  if (!res) return `«${word}» — не найдено (Тураев, Баскаков, sozlik.db).`;
  const { source, e } = res;
  const lines = [
    `${word.toLowerCase()} → ${e.kk || "—"}${e.lat ? " [" + e.lat + "]" : ""}`,
    `📚 ${source}`,
  ];
  const trans = (e.translation || e.definition_kk || "").replace(/<[^>]*>/g, "");
  if (trans)           lines.push(`\nКаракалпакча: ${trans}`);
  if (e.pos_ru || e.pos) lines.push(`Часть речи: ${e.pos_ru || e.pos}`);
  if (e.examples?.length) {
    lines.push("\nПримеры:");
    e.examples.slice(0, 2).forEach(ex =>
      lines.push("  — " + (typeof ex === "string" ? ex : `${ex.kk} — ${ex.ru}`))
    );
  }
  const exs = dilmash[word.toUpperCase()];
  if (exs?.length) {
    lines.push("\nПримеры предложений (dilmash):");
    exs.slice(0, 2).forEach(ex => lines.push(`  КК: ${ex.kk}\n  РУ: ${ex.ru}`));
  }
  return lines.join("\n");
}

// ── MCP сервер ─────────────────────────────────────────────────────────────
const server = new Server(
  { name: "karakalpak-dict", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "translate_kk_to_ru",
      description: "Переводит каракалпакское слово на русский. Ищет в kk_base + Баскаков 1958 + sozlik.db (60K слов). Принимает кириллицу или латиницу.",
      inputSchema: {
        type: "object",
        properties: { word: { type: "string", description: "Каракалпакское слово (напр. НАМЫС или namıs)" } },
        required: ["word"]
      }
    },
    {
      name: "translate_ru_to_kk",
      description: "Переводит русское слово на каракалпакский. Ищет в Тураев 2010 + Баскаков 1958 + sozlik.db (45K РУ→КК пар).",
      inputSchema: {
        type: "object",
        properties: { word: { type: "string", description: "Русское слово (напр. совесть)" } },
        required: ["word"]
      }
    },
    {
      name: "transliterate",
      description: "Конвертирует каракалпакский текст между кириллицей и латиницей.",
      inputSchema: {
        type: "object",
        properties: {
          text:      { type: "string", description: "Текст для конвертации" },
          direction: { type: "string", enum: ["cyr2lat","lat2cyr"], description: "cyr2lat или lat2cyr" }
        },
        required: ["text","direction"]
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    if (name === "translate_kk_to_ru")
      return { content: [{ type: "text", text: fmtKK(args.word, searchKK(args.word)) }] };
    if (name === "translate_ru_to_kk")
      return { content: [{ type: "text", text: fmtRU(args.word, searchRU(args.word)) }] };
    if (name === "transliterate") {
      const map = args.direction === "cyr2lat" ? CYR_TO_LAT : LAT_TO_CYR;
      return { content: [{ type: "text", text: applyMap(args.text, map) }] };
    }
    throw new Error(`Неизвестный инструмент: ${name}`);
  } catch (err) {
    return { content: [{ type: "text", text: `Ошибка: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
