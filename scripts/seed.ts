/**
 * Seed the database with realistic kirana store inventory.
 * Targets store_id=1 (Amrit's Store).
 *
 * Usage:
 *   bun run scripts/seed.ts
 */

import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is unset");

const sql = neon(url);

const STORE_ID = 1;

// ── Update existing Maggi item ──────────────────────────────────────────────

await sql`
  UPDATE items
  SET current_stock = 24, last_cost_price = '12', aliases = '["Maagi", "noodles", "noodal"]'::json
  WHERE id = 1 AND store_id = ${STORE_ID}
`;
console.log("✓ Updated Maggi stock to 24");

// ── Seed items ──────────────────────────────────────────────────────────────
// Realistic kirana store: name, aliases, unit, stock, minStock, costPrice
// Some items are deliberately LOW to demo auto-reorder

const seedItems: {
  name: string;
  aliases: string[];
  unit: string;
  stock: number;
  minStock: number;
  costPrice: string;
}[] = [
  { name: "Dairy Milk",           aliases: ["chocolate", "cadbury"],           unit: "pcs", stock: 15, minStock: 5,  costPrice: "40"  },
  { name: "Parle-G Biscuit",      aliases: ["parle", "biscuit", "glucose"],    unit: "pcs", stock: 30, minStock: 10, costPrice: "10"  },
  { name: "Amul Butter 500g",     aliases: ["butter", "makhan"],               unit: "pcs", stock: 8,  minStock: 3,  costPrice: "280" },
  { name: "Amul Milk 500ml",      aliases: ["doodh", "milk", "amul doodh"],    unit: "pcs", stock: 20, minStock: 8,  costPrice: "30"  },
  { name: "Tata Salt 1kg",        aliases: ["namak", "salt"],                  unit: "pcs", stock: 12, minStock: 5,  costPrice: "28"  },
  { name: "Aashirvaad Atta 5kg",  aliases: ["atta", "aata", "gehun"],          unit: "pcs", stock: 6,  minStock: 3,  costPrice: "280" },
  { name: "Fortune Oil 1L",       aliases: ["tel", "oil", "soybean oil"],      unit: "pcs", stock: 10, minStock: 4,  costPrice: "155" },
  { name: "Sugar 1kg",            aliases: ["cheeni", "shakkar"],              unit: "kg",  stock: 15, minStock: 5,  costPrice: "45"  },
  { name: "Toor Dal 1kg",         aliases: ["dal", "arhar dal", "daal"],       unit: "kg",  stock: 8,  minStock: 4,  costPrice: "160" },
  { name: "Basmati Rice 1kg",     aliases: ["chawal", "rice", "basmati"],      unit: "kg",  stock: 10, minStock: 5,  costPrice: "90"  },
  { name: "Surf Excel 1kg",       aliases: ["surf", "detergent", "washing"],   unit: "pcs", stock: 5,  minStock: 3,  costPrice: "220" },
  { name: "Vim Bar",              aliases: ["vim", "bartan sabun"],            unit: "pcs", stock: 25, minStock: 8,  costPrice: "10"  },
  { name: "Lifebuoy Soap",        aliases: ["sabun", "soap", "nahane ka"],     unit: "pcs", stock: 18, minStock: 5,  costPrice: "38"  },
  { name: "Colgate 100g",         aliases: ["toothpaste", "colgate", "paste"], unit: "pcs", stock: 12, minStock: 5,  costPrice: "55"  },
  { name: "Thums Up 750ml",       aliases: ["thums up", "cold drink", "cola"], unit: "pcs", stock: 10, minStock: 5,  costPrice: "40"  },
  { name: "Red Label Tea 250g",   aliases: ["chai patti", "tea", "chai"],      unit: "pcs", stock: 7,  minStock: 3,  costPrice: "125" },
  { name: "Dettol Handwash",      aliases: ["handwash", "dettol"],             unit: "pcs", stock: 6,  minStock: 3,  costPrice: "75"  },
  { name: "Clinic Plus Sachet",   aliases: ["shampoo", "clinic plus"],         unit: "pcs", stock: 50, minStock: 15, costPrice: "3"   },

  // ── LOW STOCK items (will trigger auto-reorder demo) ──────────────────
  { name: "Britannia Bread",      aliases: ["bread", "double roti"],           unit: "pcs", stock: 2,  minStock: 5,  costPrice: "45"  },
  { name: "Amul Paneer 200g",     aliases: ["paneer"],                         unit: "pcs", stock: 1,  minStock: 5,  costPrice: "90"  },
  { name: "Kurkure",              aliases: ["kurkure", "namkeen", "snack"],    unit: "pcs", stock: 2,  minStock: 5,  costPrice: "20"  },
  { name: "Lays Chips",           aliases: ["lays", "chips", "wafers"],        unit: "pcs", stock: 1,  minStock: 5,  costPrice: "20"  },
  { name: "Nescafe Classic 50g",  aliases: ["coffee", "nescafe"],              unit: "pcs", stock: 2,  minStock: 5,  costPrice: "165" },
];

let inserted = 0;
for (const item of seedItems) {
  await sql`
    INSERT INTO items (store_id, name, aliases, unit, current_stock, min_stock, last_cost_price)
    VALUES (
      ${STORE_ID},
      ${item.name},
      ${JSON.stringify(item.aliases)}::json,
      ${item.unit},
      ${item.stock},
      ${item.minStock},
      ${item.costPrice}
    )
  `;
  const status = item.stock <= item.minStock ? "⚠️  LOW" : "✓";
  console.log(`${status}  ${item.name.padEnd(24)} stock: ${String(item.stock).padStart(3)} / min: ${String(item.minStock).padStart(2)}  @ ₹${item.costPrice}`);
  inserted++;
}

// ── Seed some ledger parties for demo ───────────────────────────────────────

const parties = [
  { name: "Ramesh",  phone: "9876543210" },
  { name: "Suresh",  phone: "9876543211" },
  { name: "Mohan",   phone: "9876543212" },
];

for (const p of parties) {
  // Skip if already exists
  const existing = await sql`SELECT id FROM ledger_parties WHERE store_id = ${STORE_ID} AND name = ${p.name}`;
  if (existing.length) {
    console.log(`⊘  Party "${p.name}" already exists, skipping`);
    continue;
  }
  await sql`INSERT INTO ledger_parties (store_id, name, phone) VALUES (${STORE_ID}, ${p.name}, ${p.phone})`;
  console.log(`✓  Party: ${p.name} (${p.phone})`);
}

// ── Summary ─────────────────────────────────────────────────────────────────

const totalItems = await sql`SELECT COUNT(*) as count FROM items WHERE store_id = ${STORE_ID}`;
const lowItems = await sql`SELECT COUNT(*) as count FROM items WHERE store_id = ${STORE_ID} AND current_stock <= min_stock`;
const totalStock = await sql`SELECT SUM(current_stock) as total FROM items WHERE store_id = ${STORE_ID}`;

console.log("\n═══════════════════════════════════════");
console.log(`  Total items in catalog:  ${totalItems[0].count}`);
console.log(`  Total units in stock:    ${totalStock[0].total}`);
console.log(`  Low stock items:         ${lowItems[0].count}`);
console.log(`  New items seeded:        ${inserted}`);
console.log("═══════════════════════════════════════");
