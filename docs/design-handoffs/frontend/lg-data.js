// LeaseGuard — Mock Report Data
window.MOCK_REPORT = {
  lease: {
    id: "f3a9e2b1-1234-5678-abcd-ef0123456789",
    address: "1204 – 123 King St W",
    city: "Toronto, ON  M5X 1C4",
    landlord: "Mapleleaf Properties Inc.",
    term: "Sept 1, 2026 – Aug 31, 2027",
    monthly_rent: "$2,850",
    uploaded_at: "2026-05-16T14:32:00Z",
    page_count: 28,
    extraction_method: "text",
    jurisdiction: "Ontario",
    filename: "KingSt_Lease_2026.pdf",
  },
  overall: {
    risk_score: 7.2,
    risk_level: "high",
    executive_summary:
      "This lease contains four clauses that deviate significantly from Ontario's Residential Tenancies Act protections. Two clauses — the damage deposit and the early termination fee — are potentially unenforceable as written. The landlord entry clause omits the legally-required written-notice requirement. Three standard tenant protections are absent from the agreement. Prioritise removing the damage deposit and early termination penalty before signing.",
    clause_count: 7,
    red_flag_count: 4,
    contradiction_count: 2,
    missing_count: 3,
    negotiation_count: 4,
    corpus_version: "RTA-2024-Q4",
    corpus_date: "December 2024",
    analysis_time_s: 67,
  },
  clauses: [
    {
      id: "c1",
      number: "3",
      heading: "Damage Deposit",
      primary_type: "security_deposit",
      raw_text:
        "The Tenant shall pay a damage deposit of $2,850 (one month's rent) upon execution of this agreement. The deposit shall be held by the Landlord and returned, less any deductions for damages beyond normal wear and tear, within 30 days of the tenancy end date.",
      risk_score: 8.2,
      risk_level: "critical",
      is_potentially_unenforceable: true,
      is_unusual: true,
      is_standard: false,
      plain_english_explanation:
        "The landlord is asking for a $2,850 damage deposit on top of your last month's rent. Under Ontario law, this type of deposit is prohibited. A landlord can only collect a rent deposit (last month's rent) and a key deposit. Any additional deposit is not legally collectible.",
      risk_reasoning:
        "Section 105 of the Residential Tenancies Act explicitly prohibits security deposits in Ontario. Only a rent deposit (last month's rent) is permitted. Collecting a separate damage deposit is not permitted and any amount paid is recoverable by the tenant.",
      statutory_violations: [
        { statute_section: "RTA s.105", violation_description: "Prohibits collection of any deposit other than a rent deposit" },
        { statute_section: "RTA s.106(1)", violation_description: "Rent deposit must not exceed one month's rent" },
      ],
      has_negotiation_point: true,
    },
    {
      id: "c2",
      number: "5",
      heading: "Early Termination Penalty",
      primary_type: "early_termination",
      raw_text:
        "If the Tenant terminates this Agreement before the end of the fixed term for any reason other than a reason explicitly permitted under applicable law, the Tenant shall pay the Landlord a sum equal to three (3) months' rent as liquidated damages.",
      risk_score: 8.8,
      risk_level: "critical",
      is_potentially_unenforceable: true,
      is_unusual: true,
      is_standard: false,
      plain_english_explanation:
        "This clause claims you owe three months' rent ($8,550) if you leave early for any reason. Ontario law limits what a landlord can actually recover — they can only claim their real, documented financial losses, not a predetermined fixed penalty. This clause is likely unenforceable as written.",
      risk_reasoning:
        "Section 88 of the RTA limits a landlord's remedy for early termination to actual losses, not a fixed penalty. Fixed liquidated-damages clauses in residential tenancies are generally considered unenforceable by the Landlord and Tenant Board. However, tenants may not know this and pay anyway.",
      statutory_violations: [
        { statute_section: "RTA s.88", violation_description: "Landlord remedy for early termination limited to actual losses, not fixed penalties" },
        { statute_section: "RTA s.4", violation_description: "Provision that purports to waive tenant's rights under the Act is void" },
      ],
      has_negotiation_point: true,
    },
    {
      id: "c3",
      number: "6",
      heading: "Rent Payment Terms",
      primary_type: "rent_payment",
      raw_text:
        "The Tenant shall pay rent of $2,850.00 per month, due on the first day of each calendar month. Payment shall be made by electronic funds transfer to the account designated by the Landlord. The first and last month's rent is due upon signing of this agreement.",
      risk_score: 1.4,
      risk_level: "low",
      is_potentially_unenforceable: false,
      is_unusual: false,
      is_standard: true,
      plain_english_explanation:
        "Standard rent terms. Rent of $2,850/month due on the 1st. First and last month's rent collected at signing. This is consistent with Ontario's standard practice.",
      risk_reasoning:
        "Collecting first and last month's rent is permitted under s.106 of the RTA. The payment terms are clear and standard.",
      statutory_violations: [],
      has_negotiation_point: false,
    },
    {
      id: "c4",
      number: "8",
      heading: "Landlord Entry Rights",
      primary_type: "entry_rights",
      raw_text:
        "The Landlord may enter the rental unit with reasonable notice to the Tenant to inspect the condition of the unit, make repairs, or show the unit to prospective tenants. The Landlord agrees to limit entries to normal business hours except in the case of emergency.",
      risk_score: 6.4,
      risk_level: "high",
      is_potentially_unenforceable: false,
      is_unusual: true,
      is_standard: false,
      plain_english_explanation:
        "This clause says 'reasonable notice' instead of the legally-required minimum of 24 hours written notice. The law is specific: any entry must be preceded by 24 hours written notice. 'Reasonable' is vague and gives the landlord more flexibility than the law permits.",
      risk_reasoning:
        "Section 27(1) of the RTA requires a minimum of 24 hours written notice before a landlord may enter. 'Reasonable notice' is a weaker standard that does not satisfy this requirement. This clause should specify written notice of at least 24 hours.",
      statutory_violations: [
        { statute_section: "RTA s.27(1)", violation_description: "Landlord must provide at least 24 hours written notice before entry" },
      ],
      has_negotiation_point: true,
    },
    {
      id: "c5",
      number: "12",
      heading: "Rent Increase Provision",
      primary_type: "rent_increase",
      raw_text:
        "After the initial fixed term, the Landlord reserves the right to increase the monthly rent by any amount, provided the Tenant receives not less than ninety (90) days written notice prior to the effective date of any such increase.",
      risk_score: 7.1,
      risk_level: "high",
      is_potentially_unenforceable: true,
      is_unusual: true,
      is_standard: false,
      plain_english_explanation:
        "This clause claims the landlord can raise rent by any amount after the lease term, with 90 days notice. Ontario law sets an annual guideline cap on rent increases. A clause purporting to allow unlimited increases above that guideline is void.",
      risk_reasoning:
        "The RTA s.120 caps rent increases to the provincial guideline (2.5% for 2026). Section 116 requires 90 days written notice, which this clause correctly includes, but the 'any amount' provision conflicts with s.120 and is void to the extent it exceeds the guideline.",
      statutory_violations: [
        { statute_section: "RTA s.120", violation_description: "Rent increases capped at provincial guideline; any clause purporting to exceed this is void" },
        { statute_section: "RTA s.116", violation_description: "Notice requirement correctly stated but scope of increase is unlawful" },
      ],
      has_negotiation_point: true,
    },
    {
      id: "c6",
      number: "17",
      heading: "Pet Restriction",
      primary_type: "pets",
      raw_text:
        "No pets or animals of any kind shall be kept or permitted upon the premises at any time. Violation of this clause shall be deemed a material breach of this Agreement.",
      risk_score: 3.8,
      risk_level: "medium",
      is_potentially_unenforceable: false,
      is_unusual: false,
      is_standard: false,
      plain_english_explanation:
        "No-pets clauses are common but have limited enforceability in Ontario. Landlords cannot refuse to rent because you have pets, but they can include a no-pets clause. Whether it can be enforced depends on whether the pet causes damage or disturbance.",
      risk_reasoning:
        "The enforceability of no-pets clauses in Ontario is nuanced. The RTA does not prohibit them outright but limits the landlord's ability to evict solely on pet-keeping grounds. The 'material breach' designation is aggressive but may not survive LTB scrutiny on its own.",
      statutory_violations: [],
      has_negotiation_point: false,
    },
    {
      id: "c7",
      number: "21",
      heading: "Liability and Indemnification",
      primary_type: "liability_indemnification",
      raw_text:
        "The Tenant shall indemnify and hold harmless the Landlord from and against any and all claims, damages, losses, costs, and expenses arising from the Tenant's use or occupancy of the premises. The Landlord shall not be liable for any loss, injury, damage or inconvenience to the Tenant or the Tenant's property howsoever caused.",
      risk_score: 7.6,
      risk_level: "high",
      is_potentially_unenforceable: true,
      is_unusual: true,
      is_standard: false,
      plain_english_explanation:
        "This clause tries to make you responsible for everything and relieve the landlord of all liability. Ontario law prevents landlords from contracting out of their statutory obligations, including the duty to maintain the unit in good repair. The 'howsoever caused' language is extremely broad.",
      risk_reasoning:
        "Section 4 of the RTA provides that any provision in a tenancy agreement that is inconsistent with the Act or that waives rights under the Act is void. A blanket landlord liability waiver conflicts with the landlord's non-waivable maintenance obligations under s.20. The indemnification clause may also conflict with s.4.",
      statutory_violations: [
        { statute_section: "RTA s.4", violation_description: "Provisions waiving tenant rights or landlord obligations under the Act are void" },
        { statute_section: "RTA s.20", violation_description: "Landlord maintenance obligation cannot be contracted away" },
      ],
      has_negotiation_point: false,
    },
  ],
  contradictions: [
    {
      id: "x1",
      clause_a_id: "c2",
      clause_b_id: "c3",
      clause_a_label: "Clause 5 — Early Termination Penalty",
      clause_b_label: "Clause 6 — Rent Payment Terms",
      contradiction_type: "direct_conflict",
      severity: "high",
      explanation:
        "Clause 5 imposes a three-month penalty for early termination. Clause 6 requires collection of last month's rent at signing. Together, the lease collects four months of rent security (last month + three-month penalty), which is disproportionate and conflicts with the spirit of s.106's limit on deposits. The interaction between these clauses creates ambiguity about what 'losses' the landlord can actually claim.",
      which_governs:
        "If disputed, the RTA's actual-loss standard under s.88 governs. The fixed three-month penalty is likely void; the last month's rent deposit is the only permissible security.",
      legal_basis: "RTA s.88, s.106",
    },
    {
      id: "x2",
      clause_a_id: "c4",
      clause_b_id: "c7",
      clause_a_label: "Clause 8 — Landlord Entry Rights",
      clause_b_label: "Clause 21 — Liability Waiver",
      contradiction_type: "ambiguity",
      severity: "medium",
      explanation:
        "Clause 8 permits landlord entry for inspections and repairs. Clause 21 waives all landlord liability 'howsoever caused.' This creates an ambiguity: if the landlord or their contractors cause damage during an authorised entry, the liability waiver appears to relieve them of responsibility — which conflicts with the implied warranty of quiet enjoyment and s.20 maintenance obligations.",
      which_governs:
        "Section 20 and s.4 of the RTA would govern. The liability waiver is void to the extent it conflicts with the landlord's statutory obligations.",
      legal_basis: "RTA s.4, s.20, s.22",
    },
  ],
  missing_protections: [
    {
      id: "m1",
      protection_name: "24-Hour Written Entry Notice",
      rta_section: "s.27(1)",
      severity: "critical",
      explanation:
        "Ontario law requires a landlord to give at least 24 hours written notice before entering your unit (except in emergency). Your lease uses vague 'reasonable notice' language instead. You have this right regardless of what the lease says, but having it in writing makes enforcement easier.",
      risk_if_missing:
        "Without explicit written notice language, you may not know to insist on it, and disputes about improper entry become harder to document and argue.",
      suggested_addition:
        "Add to Clause 8: 'Notice shall be provided in writing, by email or text message, not less than 24 hours before the time of entry, in accordance with s.27(1) of the Residential Tenancies Act, 2006.'",
    },
    {
      id: "m2",
      protection_name: "Landlord Maintenance Standard",
      rta_section: "s.20",
      severity: "important",
      explanation:
        "The lease contains no clause stating the landlord's obligation to maintain the unit in a good state of repair, fit for habitation, and in compliance with health and safety standards. This obligation exists by law, but its absence from the lease means you may not know to assert it.",
      risk_if_missing:
        "Tenants unfamiliar with Ontario law may not know they can file a T6 application at the LTB for failure to maintain — especially if the lease implies all maintenance is the tenant's responsibility.",
      suggested_addition:
        "Add: 'The Landlord shall maintain the rental unit and residential complex in a good state of repair and fit for habitation and shall comply with all applicable health and safety standards, in accordance with s.20 of the Residential Tenancies Act, 2006.'",
    },
    {
      id: "m3",
      protection_name: "Rent Receipt Entitlement",
      rta_section: "s.109",
      severity: "minor",
      explanation:
        "You are entitled to a rent receipt for every payment you make, upon request. This is guaranteed by s.109 of the RTA and costs the landlord nothing. Your lease does not mention it.",
      risk_if_missing:
        "Without receipts, you may have difficulty proving rent was paid — especially relevant if a dispute arises about arrears or the return of the rent deposit.",
      suggested_addition:
        "Add: 'The Landlord shall provide a rent receipt, within 21 days of a written request, for any rent payment made during the tenancy, in accordance with s.109 of the Residential Tenancies Act, 2006.'",
    },
  ],
  negotiation_points: [
    {
      id: "n1",
      clause_id: "c1",
      clause_label: "Clause 3 — Damage Deposit",
      priority: "high",
      negotiable: true,
      walk_away_threshold: true,
      ask: "Remove the $2,850 damage deposit entirely. The only permissible deposit under Ontario law is last month's rent.",
      counter_language:
        "Please remove Clause 3 in its entirety. A damage deposit is not permitted under s.105 of the Residential Tenancies Act, 2006. Only a rent deposit (last month's rent) may be collected, which you have already included in Clause 6.",
      legal_argument:
        "Section 105 of the RTA prohibits any deposit other than a rent deposit. A landlord who collects an illegal deposit is required to return it, and may be ordered to pay compensation by the LTB.",
      landlord_likely_response:
        "We collect this to cover potential damages. We've always done it this way.",
      your_rebuttal:
        "I understand the intent, but Ontario law specifically prohibits damage deposits regardless of custom or practice. I'd be happy to proceed with the agreement without this clause — it protects both of us from a future LTB dispute.",
    },
    {
      id: "n2",
      clause_id: "c2",
      clause_label: "Clause 5 — Early Termination Penalty",
      priority: "high",
      negotiable: true,
      walk_away_threshold: true,
      ask: "Replace the fixed three-month penalty with an actual-losses standard, consistent with the RTA.",
      counter_language:
        "Please replace Clause 5 with: 'If the Tenant vacates the unit before the end of the fixed term, the Tenant shall be responsible for the Landlord's actual, documented losses resulting from the early termination, including reasonable re-letting costs, up to but not exceeding the rent owing for the remainder of the term, consistent with s.88 of the Residential Tenancies Act, 2006.'",
      legal_argument:
        "Section 88 of the RTA limits a landlord's remedy to actual losses. The LTB consistently declines to enforce fixed penalty clauses because they are inconsistent with the Act.",
      landlord_likely_response:
        "We need financial protection if you leave early and we can't find a new tenant quickly.",
      your_rebuttal:
        "The proposed replacement language still protects you for actual losses, including re-letting fees and rent lost while the unit is vacant. It simply removes the unenforceable fixed-penalty component, which the LTB would set aside anyway.",
    },
    {
      id: "n3",
      clause_id: "c4",
      clause_label: "Clause 8 — Landlord Entry Rights",
      priority: "high",
      negotiable: true,
      walk_away_threshold: false,
      ask: "Change 'reasonable notice' to 'at least 24 hours written notice' to reflect the statutory minimum.",
      counter_language:
        "Please amend Clause 8 to read: '…with at least 24 hours written notice (by email or text message) to the Tenant, specifying the reason for entry and the date and time window of the proposed entry, except in the case of emergency, in accordance with s.27(1) of the Residential Tenancies Act, 2006.'",
      legal_argument:
        "Section 27(1) requires a minimum of 24 hours written notice. The law is clear and the landlord has no reason to resist this change — it simply writes the law into the contract.",
      landlord_likely_response:
        "That's just standard language. We always give reasonable notice.",
      your_rebuttal:
        "I don't doubt your intentions, but 'reasonable notice' is vague and creates uncertainty. The law already requires 24 hours written notice specifically. I'd like the lease to reflect what the law already requires so there's no ambiguity.",
    },
    {
      id: "n4",
      clause_id: "c5",
      clause_label: "Clause 12 — Rent Increase Provision",
      priority: "medium",
      negotiable: true,
      walk_away_threshold: false,
      ask: "Limit rent increases to the provincial guideline, consistent with the RTA.",
      counter_language:
        "Please amend Clause 12 to read: '…the Landlord may increase the monthly rent by an amount not exceeding the annual rent increase guideline set by the Ontario government under s.120 of the Residential Tenancies Act, 2006, provided the Tenant receives not less than 90 days written notice prior to the effective date of any increase.'",
      legal_argument:
        "Section 120 of the RTA caps rent increases at the provincial guideline (2.5% for 2026). Any clause purporting to allow increases above the guideline is void under s.4 of the Act.",
      landlord_likely_response:
        "We need flexibility to adjust rent with market conditions.",
      your_rebuttal:
        "Ontario law already sets the cap regardless of what the lease says. The proposed change simply reflects the existing law. Agreeing to it costs you nothing — you can still raise rent annually to the guideline — and gives me certainty about what to expect.",
    },
  ],
  sources: [
    {
      id: "s1",
      act_name: "Residential Tenancies Act, 2006",
      section_number: "s.27",
      section_title: "Entry with Notice",
      full_text:
        "A landlord may enter a rental unit in accordance with written notice given to the tenant at least 24 hours before the time of entry under the following circumstances: to carry out a repair or replacement or do work in the rental unit; to allow a potential mortgagee or insurer of the residential complex to view the rental unit; to allow a person who holds a certificate of authorization within the meaning of the Professional Engineers Act or a certificate of practice within the meaning of the Architects Act, or another qualified person, to make a physical inspection of the rental unit.",
      url: "https://www.ontario.ca/laws/statute/06r17#BK51",
      relevance_score: 0.91,
      corpus_version: "RTA-2024-Q4",
      relevant_clauses: ["c4"],
    },
    {
      id: "s2",
      act_name: "Residential Tenancies Act, 2006",
      section_number: "s.88",
      section_title: "Tenant Vacates — Landlord's Remedies",
      full_text:
        "If a tenant abandons or vacates a rental unit without giving notice to the landlord in accordance with this Act and the tenancy has not been terminated under this Act, the landlord may apply to the Board for an order terminating the tenancy and evicting the tenant and an order that the tenant pay compensation to the landlord.",
      url: "https://www.ontario.ca/laws/statute/06r17#BK148",
      relevance_score: 0.94,
      corpus_version: "RTA-2024-Q4",
      relevant_clauses: ["c2"],
    },
    {
      id: "s3",
      act_name: "Residential Tenancies Act, 2006",
      section_number: "s.105",
      section_title: "No Security Deposits",
      full_text:
        "A landlord shall not collect or require or attempt to collect or require from a tenant or prospective tenant of a rental unit a security deposit.",
      url: "https://www.ontario.ca/laws/statute/06r17#BK173",
      relevance_score: 0.98,
      corpus_version: "RTA-2024-Q4",
      relevant_clauses: ["c1"],
    },
    {
      id: "s4",
      act_name: "Residential Tenancies Act, 2006",
      section_number: "s.116",
      section_title: "Notice of Rent Increase Required",
      full_text:
        "A landlord shall not increase the rent charged to a tenant for a rental unit without first giving the tenant at least 90 days written notice of the landlord's intention to increase the rent.",
      url: "https://www.ontario.ca/laws/statute/06r17#BK190",
      relevance_score: 0.87,
      corpus_version: "RTA-2024-Q4",
      relevant_clauses: ["c5"],
    },
    {
      id: "s5",
      act_name: "Residential Tenancies Act, 2006",
      section_number: "s.120",
      section_title: "Guideline — Maximum Rent Increase",
      full_text:
        "No landlord may increase the rent charged to a tenant, or to a subtenant, for a rental unit by more than the guideline, unless an order permitting a greater increase is made by the Board under section 126.",
      url: "https://www.ontario.ca/laws/statute/06r17#BK195",
      relevance_score: 0.89,
      corpus_version: "RTA-2024-Q4",
      relevant_clauses: ["c5"],
    },
    {
      id: "s6",
      act_name: "Residential Tenancies Act, 2006",
      section_number: "s.20",
      section_title: "Landlord's Responsibility to Repair",
      full_text:
        "A landlord is responsible for providing and maintaining a residential complex, including the rental units in it, in a good state of repair and fit for habitation and for complying with health, safety, housing and maintenance standards.",
      url: "https://www.ontario.ca/laws/statute/06r17#BK38",
      relevance_score: 0.86,
      corpus_version: "RTA-2024-Q4",
      relevant_clauses: ["c7", "x2"],
    },
  ],
  agent_trace: [
    {
      id: "t1",
      sequence: 1,
      tool_name: "parse_document",
      duration_ms: 2140,
      success: true,
      input_summary: { file_path: "leases/f3a9e2b1/KingSt_Lease_2026.pdf" },
      output_summary: { page_count: 28, char_count: 14203, extraction_method: "text", ocr_fallback: false },
    },
    {
      id: "t2",
      sequence: 2,
      tool_name: "detect_jurisdiction",
      duration_ms: 312,
      success: true,
      input_summary: { text_sample: "…Province of Ontario…Residential Tenancies Act…City of Toronto…" },
      output_summary: { jurisdiction: "Ontario", jurisdiction_code: "CA-ON", confidence: "high" },
    },
    {
      id: "t3",
      sequence: 3,
      tool_name: "segment_clauses",
      duration_ms: 841,
      success: true,
      input_summary: { char_count: 14203 },
      output_summary: { clause_count: 7, types_found: ["security_deposit","early_termination","rent_payment","entry_rights","rent_increase","pets","liability_indemnification"] },
    },
    {
      id: "t4",
      sequence: 4,
      tool_name: "classify_clause",
      duration_ms: 1380,
      success: true,
      input_summary: { clauses: 7, mode: "parallel_batch" },
      output_summary: { classified: 7, requires_legal_lookup: 5, high_priority_lookup: 4 },
    },
    {
      id: "t5",
      sequence: 5,
      tool_name: "lookup_statute",
      duration_ms: 920,
      success: true,
      input_summary: { clause_id: "c1", clause_type: "security_deposit", jurisdiction: "CA-ON" },
      output_summary: { statutes_retrieved: 3, top_section: "s.105", top_relevance: 0.98 },
    },
    {
      id: "t6",
      sequence: 6,
      tool_name: "lookup_statute",
      duration_ms: 1090,
      success: true,
      input_summary: { clause_id: "c2", clause_type: "early_termination", jurisdiction: "CA-ON" },
      output_summary: { statutes_retrieved: 2, top_section: "s.88", top_relevance: 0.94 },
    },
    {
      id: "t7",
      sequence: 7,
      tool_name: "lookup_statute",
      duration_ms: 710,
      success: true,
      input_summary: { clause_id: "c4", clause_type: "entry_rights", jurisdiction: "CA-ON" },
      output_summary: { statutes_retrieved: 2, top_section: "s.27", top_relevance: 0.91 },
    },
    {
      id: "t8",
      sequence: 8,
      tool_name: "lookup_statute",
      duration_ms: 1180,
      success: true,
      input_summary: { clause_id: "c5", clause_type: "rent_increase", jurisdiction: "CA-ON" },
      output_summary: { statutes_retrieved: 3, top_section: "s.120", top_relevance: 0.89 },
    },
    {
      id: "t9",
      sequence: 9,
      tool_name: "score_risk",
      duration_ms: 2830,
      success: true,
      input_summary: { clauses: 7, mode: "parallel_batch" },
      output_summary: { critical: 2, high: 3, medium: 1, low: 1, potentially_unenforceable: 3 },
    },
    {
      id: "t10",
      sequence: 10,
      tool_name: "detect_contradiction",
      duration_ms: 1390,
      success: true,
      input_summary: { clause_pairs_checked: 6 },
      output_summary: { contradictions_found: 2, severity_high: 1, severity_medium: 1 },
    },
    {
      id: "t11",
      sequence: 11,
      tool_name: "check_missing",
      duration_ms: 620,
      success: true,
      input_summary: { clause_types_present: ["security_deposit","early_termination","rent_payment","entry_rights","rent_increase","pets","liability_indemnification"] },
      output_summary: { missing_count: 3, severity_critical: 1, severity_important: 1, severity_minor: 1 },
    },
    {
      id: "t12",
      sequence: 12,
      tool_name: "generate_negotiation",
      duration_ms: 3140,
      success: true,
      input_summary: { clauses_above_threshold: 4, mode: "parallel_batch" },
      output_summary: { points_generated: 4, walk_away_clauses: 2 },
    },
    {
      id: "t13",
      sequence: 13,
      tool_name: "generate_report",
      duration_ms: 3220,
      success: true,
      input_summary: { clauses: 7, contradictions: 2, missing: 3, negotiation_points: 4, sources: 6 },
      output_summary: { overall_risk_score: 7.2, overall_risk_level: "high", report_id: "f3a9e2b1-report" },
    },
  ],
};
