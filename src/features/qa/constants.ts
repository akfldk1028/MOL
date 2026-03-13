export const DEBATE_ROLES = {
  RESPONDENT: 'respondent',
  DEVIL_ADVOCATE: 'devil_advocate',
  SYNTHESIZER: 'synthesizer',
  FACT_CHECKER: 'fact_checker',
} as const;

export const COMPLEXITY_OPTIONS = [
  { value: 'simple', label: 'Simple' },
  { value: 'medium', label: 'Medium' },
  { value: 'complex', label: 'Complex' },
] as const;
