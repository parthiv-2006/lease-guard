/**
 * Seeds the clause_comparisons benchmark table with the Ontario Standard Form
 * of Lease clause types and realistic risk scores so the benchmarking feature
 * works from day one (requires sample_size >= 10 per clause type).
 *
 * Usage: npx tsx scripts/seed_benchmark.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Ontario Standard Form of Lease — representative clauses and typical risk scores
// These are seed data derived from the government-published standard form.
const SEED_CLAUSES: Array<{
  clause_type: string;
  anonymized_text: string;
  risk_score: number;
  jurisdiction_code: string;
}> = [
  // rent_payment — standard form examples (low risk)
  {
    clause_type: "rent_payment",
    anonymized_text: "The tenant shall pay rent of [AMOUNT] per month on the first day of each month.",
    risk_score: 1.5,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "rent_payment",
    anonymized_text: "Rent is due on the 1st of each month. Payment by e-transfer, cheque, or cash.",
    risk_score: 1.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "rent_payment",
    anonymized_text: "Monthly rent is [AMOUNT] payable in advance on the first day of each month by post-dated cheques.",
    risk_score: 2.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "rent_payment",
    anonymized_text: "Tenant agrees to pay rent of [AMOUNT] monthly. Late payment incurs a fee of $50 after the 5th.",
    risk_score: 4.5,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "rent_payment",
    anonymized_text: "Rent of [AMOUNT] due on the 1st. Landlord may charge NSF fee of $25 for returned payments.",
    risk_score: 2.5,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "rent_payment",
    anonymized_text: "Tenant shall pay [AMOUNT] per month. Failure to pay on time may result in eviction proceedings.",
    risk_score: 3.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "rent_payment",
    anonymized_text: "The monthly rent is [AMOUNT] and must be received by the landlord by the 1st.",
    risk_score: 1.5,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "rent_payment",
    anonymized_text: "Rent: [AMOUNT]/month. Any late payment shall bear interest at 2% per month.",
    risk_score: 6.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "rent_payment",
    anonymized_text: "Tenant to pay [AMOUNT] monthly via pre-authorized debit on the 1st of each month.",
    risk_score: 2.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "rent_payment",
    anonymized_text: "Monthly rent of [AMOUNT] is due and payable on the 1st. Tenant must provide 12 post-dated cheques at signing.",
    risk_score: 3.5,
    jurisdiction_code: "CA-ON",
  },
  // entry_rights — ranging from standard to aggressive
  {
    clause_type: "entry_rights",
    anonymized_text: "Landlord will provide 24 hours written notice before entering the unit except in emergencies.",
    risk_score: 1.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "entry_rights",
    anonymized_text: "Landlord may enter the unit upon reasonable notice for inspections and repairs.",
    risk_score: 4.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "entry_rights",
    anonymized_text: "Landlord may enter the unit at any time without notice for any reason.",
    risk_score: 9.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "entry_rights",
    anonymized_text: "The landlord shall give 24 hours written notice and may enter between 8am and 8pm.",
    risk_score: 1.5,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "entry_rights",
    anonymized_text: "Landlord may conduct quarterly inspections with 24 hours notice.",
    risk_score: 2.5,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "entry_rights",
    anonymized_text: "The landlord reserves the right to enter the premises at any time with 2 hours notice.",
    risk_score: 7.5,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "entry_rights",
    anonymized_text: "Landlord may enter with 24 hours written notice or with tenant consent.",
    risk_score: 1.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "entry_rights",
    anonymized_text: "The landlord may enter upon 12 hours verbal notice to show the unit to prospective tenants.",
    risk_score: 5.5,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "entry_rights",
    anonymized_text: "The landlord or agent may enter the unit for inspections monthly without prior notice.",
    risk_score: 8.5,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "entry_rights",
    anonymized_text: "Entry by landlord requires 24 hours written notice specifying the reason and time of entry.",
    risk_score: 1.0,
    jurisdiction_code: "CA-ON",
  },
  // early_termination
  {
    clause_type: "early_termination",
    anonymized_text: "Either party may terminate with 60 days written notice at end of term.",
    risk_score: 2.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "early_termination",
    anonymized_text: "Tenant owes three months rent as penalty for breaking the lease early for any reason.",
    risk_score: 9.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "early_termination",
    anonymized_text: "Tenant is responsible for rent until a replacement tenant is found or lease ends.",
    risk_score: 5.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "early_termination",
    anonymized_text: "Early termination requires two months written notice and forfeiture of last month deposit.",
    risk_score: 7.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "early_termination",
    anonymized_text: "Tenant may terminate by giving 60 days notice at any time during the tenancy.",
    risk_score: 1.5,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "early_termination",
    anonymized_text: "Tenant breaking the lease is responsible for all rent owing for the remainder of the term.",
    risk_score: 8.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "early_termination",
    anonymized_text: "If tenant vacates before lease end, landlord will attempt to re-rent and charge for vacancy.",
    risk_score: 4.5,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "early_termination",
    anonymized_text: "Tenant may assign the lease or sublet with landlord consent, which shall not be unreasonably withheld.",
    risk_score: 2.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "early_termination",
    anonymized_text: "Upon early termination tenant forfeits last month rent deposit and pays $500 administration fee.",
    risk_score: 8.5,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "early_termination",
    anonymized_text: "Standard 60-day notice required for termination at end of fixed term.",
    risk_score: 2.0,
    jurisdiction_code: "CA-ON",
  },
  // security_deposit
  {
    clause_type: "security_deposit",
    anonymized_text: "Tenant shall pay last month rent deposit of [AMOUNT] at signing, held per RTA requirements.",
    risk_score: 1.5,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "security_deposit",
    anonymized_text: "Tenant provides a damage deposit of [AMOUNT], refundable after inspection upon move-out.",
    risk_score: 8.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "security_deposit",
    anonymized_text: "Two months deposit required: first and last month rent at lease signing.",
    risk_score: 6.5,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "security_deposit",
    anonymized_text: "Last month rent deposit of [AMOUNT] required. Deposit earns interest per RTA guidelines.",
    risk_score: 1.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "security_deposit",
    anonymized_text: "Tenant pays [AMOUNT] security deposit, non-refundable for any damage or cleaning.",
    risk_score: 9.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "security_deposit",
    anonymized_text: "First and last month rent payable at signing. Last month deposit per Section 105 RTA.",
    risk_score: 1.5,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "security_deposit",
    anonymized_text: "Landlord holds [AMOUNT] last month rent. Interest applied annually per provincial guideline.",
    risk_score: 1.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "security_deposit",
    anonymized_text: "Deposit of [AMOUNT] held as security against damage. Landlord may deduct for any wear and tear.",
    risk_score: 7.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "security_deposit",
    anonymized_text: "Pet deposit of [AMOUNT] is non-refundable.",
    risk_score: 8.5,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "security_deposit",
    anonymized_text: "Last month deposit of [AMOUNT] collected at signing. Deposit applied to final month of tenancy.",
    risk_score: 1.0,
    jurisdiction_code: "CA-ON",
  },
  // dispute_resolution
  {
    clause_type: "dispute_resolution",
    anonymized_text: "Any disputes shall be resolved through the Landlord and Tenant Board.",
    risk_score: 1.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "dispute_resolution",
    anonymized_text: "Tenant waives the right to dispute any rent increase at the LTB.",
    risk_score: 10.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "dispute_resolution",
    anonymized_text: "Disputes must be resolved by binding private arbitration; tenant waives LTB jurisdiction.",
    risk_score: 9.5,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "dispute_resolution",
    anonymized_text: "All disputes shall be resolved per the Residential Tenancies Act, 2006.",
    risk_score: 1.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "dispute_resolution",
    anonymized_text: "Tenant agrees to mediation before filing any LTB application.",
    risk_score: 3.5,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "dispute_resolution",
    anonymized_text: "Any dispute arising from this lease shall be resolved by private arbitration at tenant's expense.",
    risk_score: 8.5,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "dispute_resolution",
    anonymized_text: "Parties agree to attempt informal resolution before LTB proceedings.",
    risk_score: 2.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "dispute_resolution",
    anonymized_text: "Tenant waives the right to any class action or group proceeding related to this tenancy.",
    risk_score: 9.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "dispute_resolution",
    anonymized_text: "All matters governed by Ontario Residential Tenancies Act and LTB rules.",
    risk_score: 1.0,
    jurisdiction_code: "CA-ON",
  },
  {
    clause_type: "dispute_resolution",
    anonymized_text: "Dispute resolution per RTA. Either party may file with LTB per standard procedure.",
    risk_score: 1.0,
    jurisdiction_code: "CA-ON",
  },
];

async function seed() {
  console.log(`Seeding ${SEED_CLAUSES.length} benchmark clauses...`);

  let inserted = 0;
  let skipped = 0;

  for (const clause of SEED_CLAUSES) {
    const { error } = await supabase.from("clause_comparisons").insert({
      ...clause,
      is_seed_data: true,
    });

    if (error) {
      console.error(`Failed to insert ${clause.clause_type}:`, error.message);
      skipped++;
    } else {
      inserted++;
    }
  }

  console.log(`Done. Inserted: ${inserted}, Skipped: ${skipped}`);

  // Verify counts per clause type
  const { data: counts } = await supabase
    .from("clause_comparisons")
    .select("clause_type")
    .eq("jurisdiction_code", "CA-ON");

  if (counts) {
    const byType: Record<string, number> = {};
    for (const row of counts) {
      byType[row.clause_type] = (byType[row.clause_type] ?? 0) + 1;
    }
    console.log("\nSample sizes per clause type:");
    for (const [type, count] of Object.entries(byType).sort()) {
      const sufficient = count >= 10 ? "✓" : "✗ (need more)";
      console.log(`  ${type}: ${count} ${sufficient}`);
    }
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
