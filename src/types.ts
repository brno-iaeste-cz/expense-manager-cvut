export type ExpenseForm = {
  transactionDate: string;
  merchant: string;
  amount: string;
  currency: string;
  category: string;
  paymentMethod: string;
  project: string;
  notes: string;
};

export type SubmissionState = 'idle' | 'submitting' | 'success' | 'error';
