export type ExpenseForm = {
  name: string;
  amount: string;
  department: string;
  category: string;
  subcategory: string;
  paymentMethod: string;
};

export type SubmissionState = 'idle' | 'submitting' | 'success' | 'error';
