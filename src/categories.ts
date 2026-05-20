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
  departmentValue: string;
  departmentLabel: string;
  categoryValue: string;
  categoryLabel: string;
  subcategoryValue: string;
  subcategoryLabel: string;
};

export const categoryTree = {
  PR: [
    {
      value: 'Promo akce',
      label: 'Promo akce',
      subcategories: [
        'Zaškolovák 1+2',
        'Seznamovák 1+2',
        'HzF',
        'FASTfest',
        'Majáles Studentsky',
        'Pop Messe',
        'Majales'
      ]
    },
    {
      value: 'Mikroeventy',
      label: 'Mikroeventy',
      subcategories: [
        'Tea Day',
        'Coffee Day',
        'Svařák Day',
        'Chocolate Day',
        'Waffle',
        'Stážový měsíc (ZkusTo, PubQuiz,?)',
        'Ice cream day'
      ]
    },
    {
      value: 'Marketing',
      label: 'Marketing',
      subcategories: [
        'Online',
        'Offline'
      ]
    }
  ],
  HR: [
    {
      value: 'Lokální akce',
      label: 'Lokální akce',
      subcategories: [
        'Schůzky',
        'Twinning',
        'Zahr. twin.',
        'TB Brno'
      ]
    },
    {
      value: 'Interní meetingy',
      label: 'Interní meetingy',
      subcategories: [
        'EX',
        'PR',
        'CR',
        'HR',
        'Board',
        'Volby'
      ]
    },
    {
      value: 'HR akce pro členy',
      label: 'HR akce pro členy',
      subcategories: [
        'Akce 1+2',
        'Akce 3+4',
        'Akce 5+6',
        'Akce 7+8',
        'Vánoční večírek',
        'Grilování',
        'Rezerva'
      ]
    }
  ],
  EX: [
    {
      value: 'SR - akce pro stážisty',
      label: 'SR - akce pro stážisty',
      subcategories: [
        'Společně',
        'Stážista 1',
        'Stážista 2',
        'Stážista 3',
        'Stážista 4',
        'Stážista 5',
        'Stážista 6',
        'Stážista 7',
        'Stážista 8',
        'Stážista 9'
      ]
    },
    {
      value: 'Moravian Weekend & Příspěvek na pobytové náklady',
      label: 'Moravian Weekend & Příspěvek na pobytové náklady',
      subcategories: [
        'MW',
        'Stáž ve firmě1',
        'Stáž ve firmě2',
        'Stáž ve firmě3',
        'Stáž ve firmě4'
      ]
    }
  ],
  Akce: [
    {
      value: 'Konference: 1 eur =',
      label: 'Mezinárodní akce',
      subcategories: [
        'CEC podzim',
        'CEC jaro',
        'JUMP',
        'LEAP',
        'CONNECT'
      ]
    },
    {
      value: 'Národní akce',
      label: 'Národní akce',
      subcategories: [
        'Senát 1 (a 3-22/23)',
        'Senát 2',
        'Senát 3',
        'CSID',
        'IA Day',
        'Akademie',
        'nTB'
      ]
    }
  ],
  Projekty: [
    {
      value: 'Kancl',
      label: 'Kancl',
      subcategories: [
        'Pošta',
        'Kanc. potřeby',
        'Upgrade kanclu',
        'K vyrovnání (pouze finančník, vždy pseudoúčtenka)',
        'Soukromé (DPH výdaj)'
      ]
    },
    {
      value: 'Projekty',
      label: 'Projekty',
      subcategories: [
        'Diář',
        'BigStep',
        'BBC'
      ]
    },
    {
      value: 'Veletrh iKariéra v Brně (1)',
      label: 'Veletrh iKariéra v Brně (1)',
      subcategories: [
        'Prostory',
        'PrV',
        'Grafika',
        'Promo - online',
        'Catering',
        'Stánky',
        'Hostess/Nosič'
      ]
    },
    {
      value: 'Veletrh iKariéra v Brně (2)',
      label: 'Veletrh iKariéra v Brně (2)',
      subcategories: [
        'Zázemí (i jídlo)',
        'Doprovodný program (venku i vevnitř - fotografové, líčení,..)',
        'Večeře',
        'Doprava/transport',
        'CFT',
        'CFT my ven (jízdné)',
        'Nestandardní'
      ]
    }
  ]
} satisfies Record<string, Category[]>;

export const departments: Department[] = [
  {
    value: 'PR',
    label: 'PR'
  },
  {
    value: 'HR',
    label: 'HR'
  },
  {
    value: 'EX',
    label: 'EX'
  },
  {
    value: 'Akce',
    label: 'Akce'
  },
  {
    value: 'Projekty',
    label: 'Projekty'
  }
];

export const categorySearchIndex: CategorySearchResult[] = Object.entries(categoryTree).flatMap(
  ([department, categories]) => {
    const departmentLabel = departments.find((item) => item.value === department)?.label ?? department;

    return categories.flatMap((category) =>
      category.subcategories.map((subcategory) => ({
        departmentValue: department,
        departmentLabel,
        categoryValue: category.value,
        categoryLabel: category.label,
        subcategoryValue: subcategory,
        subcategoryLabel: subcategory,
      })),
    );
  },
);
