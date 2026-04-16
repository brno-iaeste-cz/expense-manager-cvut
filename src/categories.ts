export type Category = {
  value: string;
  label: string;
  subcategories: string[];
};

export type Department = {
  value: keyof typeof categoryTree;
  label: string;
};

export type CategorySearchResult = {
  department: string;
  departmentLabel: string;
  category: string;
  categoryLabel: string;
  subcategory: string;
};

export const categoryTree = {
  PR: [
    {
      value: 'Promo akce',
      label: 'Promo akce',
      subcategories: ['Záškolovák', 'Seznamovák', 'HzF', 'FASTfest', 'Majáles'],
    },
    {
      value: 'Mikroeventy',
      label: 'Mikroeventy',
      subcategories: ['Tea Day', 'Coffe Day'],
    },
    {
      value: 'Marketing',
      label: 'Marketing',
      subcategories: ['Tea Day', 'Coffe Day'],
    },
  ],
  HR: [
    {
      value: 'Lokální akce',
      label: 'Lokální akce',
      subcategories: ['Schůzky', 'Twinning'],
    },
  ],
  EX: [
    {
      value: 'SR',
      label: 'SR',
      subcategories: ['Stážista 1', 'Stážista 2'],
    },
    {
      value: 'MW',
      label: 'MW',
      subcategories: [],
    },
  ],
  Events: [
    {
      value: 'Medzinárodní akce',
      label: 'Medzinárodní akce',
      subcategories: ['CEC podzim', 'CEC jaro'],
    },
    {
      value: 'Národní akce',
      label: 'Národní akce',
      subcategories: ['Senát'],
    },
  ],
  Projects: [
    {
      value: 'Veletrh iKariéra v Brně',
      label: 'Veletrh iKariéra v Brně',
      subcategories: ['Prostory', 'PrV'],
    },
    {
      value: 'Mikroeventy',
      label: 'Mikroeventy',
      subcategories: ['Tea Day', 'Coffe Day'],
    },
  ],  
} satisfies Record<string, Category[]>;

export const departments: Department[] = [
  { value: 'PR', label: 'PR' },
  { value: 'HR', label: 'HR' },
  { value: 'EX', label: 'EX' },
  { value: 'Events', label: 'Akce' },
  { value: 'Projects', label: 'Projekty' },
];

export const categorySearchIndex: CategorySearchResult[] = Object.entries(categoryTree).flatMap(
  ([department, categories]) => {
    const departmentLabel = departments.find((item) => item.value === department)?.label ?? department;

    return categories.flatMap((category) =>
      category.subcategories.map((subcategory) => ({
        department,
        departmentLabel,
        category: category.value,
        categoryLabel: category.label,
        subcategory,
      })),
    );
  },
);
