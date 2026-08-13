// The 5 real pipeline steps, shared between the processing screen
// (app/page.tsx) and the dashboard's live-trace strip for an in-progress row.
export const PROCESSING_STEPS = [
  {
    id: "parse",
    label: "Reading your document",
    detail: "Extracting text from every page of your lease",
  },
  {
    id: "jurisdiction",
    label: "Confirming Ontario jurisdiction",
    detail: "Verifying this is an Ontario residential tenancy agreement",
  },
  {
    id: "segment",
    label: "Finding each clause",
    detail: "Breaking your lease into individual clauses for analysis",
  },
  {
    id: "research",
    label: "Looking up the law",
    detail: "Checking 2,372 RTA sections for relevant rules",
  },
  {
    id: "report",
    label: "Writing your report",
    detail: "Scoring risk, flagging issues, and building your negotiation guide",
  },
];
