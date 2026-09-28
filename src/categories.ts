export type Category = {
  value: string;
  label: string;
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
};

export const categoryTree = {
  "Board": [
    {
      "value": "Odmeny",
      "label": "Odmeny"
    },
    {
      "value": "Podpora činnosti",
      "label": "Podpora činnosti"
    },
    {
      "value": "Poporadní pivo",
      "label": "Poporadní pivo"
    },
    {
      "value": "Porady",
      "label": "Porady"
    },
    {
      "value": "VGS",
      "label": "VGS"
    },
    {
      "value": "Volby",
      "label": "Volby"
    },
    {
      "value": "Ostatní",
      "label": "Ostatní"
    },
    {
      "value": "Rezerva",
      "label": "Rezerva"
    }
  ],
  "Akce": [
    {
      "value": "Výjezdy na konference",
      "label": "Výjezdy na konference"
    },
    {
      "value": "Výjezdy akce",
      "label": "Výjezdy akce"
    },
    {
      "value": "Twinning",
      "label": "Twinning"
    }
  ],
  "Office": [
    {
      "value": "IT",
      "label": "IT"
    },
    {
      "value": "kancelárske potreby",
      "label": "kancelárske potreby"
    },
    {
      "value": "pošta",
      "label": "pošta"
    },
    {
      "value": "telefóny",
      "label": "telefóny"
    }
  ],
  "Kancl": [
    {
      "value": "nájom",
      "label": "nájom"
    },
    {
      "value": "internety",
      "label": "internety"
    },
    {
      "value": "revitalizace",
      "label": "revitalizace"
    },
    {
      "value": "ostatní",
      "label": "ostatní"
    }
  ],
  "Ostatní": [
    {
      "value": "výpalné",
      "label": "výpalné"
    },
    {
      "value": "nové projekty",
      "label": "nové projekty"
    }
  ],
  "Veletrh": [
    {
      "value": "Aplikace",
      "label": "Aplikace"
    },
    {
      "value": "Brigádníci",
      "label": "Brigádníci"
    },
    {
      "value": "Catering",
      "label": "Catering"
    },
    {
      "value": "DP",
      "label": "DP"
    },
    {
      "value": "Drobné výdaje",
      "label": "Drobné výdaje"
    },
    {
      "value": "Firmy",
      "label": "Firmy"
    },
    {
      "value": "Ostatní",
      "label": "Ostatní"
    },
    {
      "value": "Parkování",
      "label": "Parkování"
    },
    {
      "value": "Párty",
      "label": "Párty"
    },
    {
      "value": "Porada",
      "label": "Porada"
    },
    {
      "value": "Propagace",
      "label": "Propagace"
    },
    {
      "value": "Prostory",
      "label": "Prostory"
    },
    {
      "value": "Průvodce",
      "label": "Průvodce"
    },
    {
      "value": "Stánky",
      "label": "Stánky"
    },
    {
      "value": "Vysílačky",
      "label": "Vysílačky"
    }
  ],
  "Finance": [
    {
      "value": "banka",
      "label": "banka"
    },
    {
      "value": "daň z příjmu",
      "label": "daň z příjmu"
    },
    {
      "value": "drobné výdaje",
      "label": "drobné výdaje"
    },
    {
      "value": "srážková daň",
      "label": "srážková daň"
    },
    {
      "value": "účetní",
      "label": "účetní"
    }
  ],
  "CR": [
    {
      "value": "Schůzky",
      "label": "Schůzky"
    },
    {
      "value": "porady",
      "label": "porady"
    },
    {
      "value": "Tmelení týmu",
      "label": "Tmelení týmu"
    },
    {
      "value": "networking",
      "label": "networking"
    }
  ],
  "PR": [
    {
      "value": "CR",
      "label": "CR"
    },
    {
      "value": "EX",
      "label": "EX"
    },
    {
      "value": "HR",
      "label": "HR"
    },
    {
      "value": "LC",
      "label": "LC"
    },
    {
      "value": "PR",
      "label": "PR"
    },
    {
      "value": "Sociální sítě",
      "label": "Sociální sítě"
    },
    {
      "value": "Tým",
      "label": "Tým"
    }
  ],
  "HR": [
    {
      "value": "Hr akce",
      "label": "Hr akce"
    },
    {
      "value": "Nábory",
      "label": "Nábory"
    },
    {
      "value": "Porady",
      "label": "Porady"
    },
    {
      "value": "Skupina",
      "label": "Skupina"
    },
    {
      "value": "Teambuilding",
      "label": "Teambuilding"
    },
    {
      "value": "Učlenění",
      "label": "Učlenění"
    }
  ],
  "Exchange": [
    {
      "value": "Akce pro Stážisty",
      "label": "Akce pro Stážisty"
    },
    {
      "value": "Koordinátori SR",
      "label": "Koordinátori SR"
    },
    {
      "value": "Porady, Schuzky",
      "label": "Porady, Schuzky"
    },
    {
      "value": "Stážisti",
      "label": "Stážisti"
    },
    {
      "value": "Team",
      "label": "Team"
    }
  ],
  "Malta": [
    {
      "value": "Program",
      "label": "Program"
    },
    {
      "value": "Ubytování",
      "label": "Ubytování"
    },
    {
      "value": "Studenti",
      "label": "Studenti"
    },
    {
      "value": "Firmy",
      "label": "Firmy"
    },
    {
      "value": "Párty",
      "label": "Párty"
    },
    {
      "value": "Logistika",
      "label": "Logistika"
    },
    {
      "value": "Porady",
      "label": "Porady"
    },
    {
      "value": "Propagace",
      "label": "Propagace"
    }
  ],
  "Pink_Palace": [
    {
      "value": "internet",
      "label": "internet"
    },
    {
      "value": "Nájem",
      "label": "Nájem"
    },
    {
      "value": "opravy",
      "label": "opravy"
    }
  ],
  "PCH": [
    {
      "value": "účastníci",
      "label": "účastníci"
    },
    {
      "value": "jídlo",
      "label": "jídlo"
    },
    {
      "value": "ubytování",
      "label": "ubytování"
    },
    {
      "value": "program",
      "label": "program"
    },
    {
      "value": "logistika",
      "label": "logistika"
    }
  ]
} satisfies Record<string, Category[]>;

export const departments: Department[] = [
  {
    "value": "Board",
    "label": "Board"
  },
  {
    "value": "Akce",
    "label": "Akce"
  },
  {
    "value": "Office",
    "label": "Office"
  },
  {
    "value": "Kancl",
    "label": "Kancl"
  },
  {
    "value": "Ostatní",
    "label": "Ostatní"
  },
  {
    "value": "Veletrh",
    "label": "Veletrh"
  },
  {
    "value": "Finance",
    "label": "Finance"
  },
  {
    "value": "CR",
    "label": "CR"
  },
  {
    "value": "PR",
    "label": "PR"
  },
  {
    "value": "HR",
    "label": "HR"
  },
  {
    "value": "Exchange",
    "label": "Exchange"
  },
  {
    "value": "Malta",
    "label": "Malta"
  },
  {
    "value": "Pink_Palace",
    "label": "Pink_Palace"
  },
  {
    "value": "PCH",
    "label": "PCH"
  }
];

export const categorySearchIndex: CategorySearchResult[] = Object.entries(categoryTree).flatMap(
  ([department, categories]) => {
    const departmentLabel = departments.find((item) => item.value === department)?.label ?? department;

    return categories.map((category) => ({
      departmentValue: department,
      departmentLabel,
      categoryValue: category.value,
      categoryLabel: category.label,
    }));
  },
);
