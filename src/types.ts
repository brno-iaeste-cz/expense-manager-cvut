export type ExpenseForm = {
  name: string;
  storeName: string;
  approvedBy: string;
  expenseDate: string;
  amount: string;
  department: string;
  category: string;
  paymentMethod: string;
};

export type SubmissionState = 'idle' | 'submitting' | 'success' | 'error';
