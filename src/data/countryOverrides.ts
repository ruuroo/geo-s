import type { Country } from "../types/index.js";

/**
 * Faglige og språklige unntak som skal være enkle å kontrollere manuelt.
 * De samme verdiene er bakt inn i den genererte datasnapshoten, men dette
 * laget gjør at rettelser kan gjøres uten å spre spesialtilfeller i UI-koden.
 */
export const COUNTRY_OVERRIDES: Record<string, Partial<Country>> = {
  US: {
    norwegianName: "USA",
    aliases: ["USA", "De forente stater", "Amerikas forente stater", "United States", "United States of America"],
    capitalAliases: ["Washington, D.C.", "Washington D.C.", "Washington DC", "Washington"],
  },
  GB: {
    norwegianName: "Storbritannia",
    aliases: ["Storbritannia", "Det forente kongerike", "UK", "United Kingdom", "Great Britain"],
  },
  CZ: {
    norwegianName: "Tsjekkia",
    aliases: ["Tsjekkia", "Den tsjekkiske republikk", "Czechia", "Czech Republic"],
    capitals: ["Praha", "Prague"],
    capitalAliases: ["Praha", "Prague"],
  },
  CI: {
    norwegianName: "Elfenbenskysten",
    aliases: ["Elfenbenskysten", "Côte d’Ivoire", "Côte d'Ivoire", "Cote d Ivoire", "Ivory Coast"],
  },
  CV: {
    norwegianName: "Kapp Verde",
    aliases: ["Kapp Verde", "Cabo Verde", "Cape Verde"],
  },
  KR: {
    norwegianName: "Sør-Korea",
    aliases: ["Sør-Korea", "Sør Korea", "Republikken Korea", "South Korea", "Republic of Korea"],
  },
  BO: {
    capitals: ["Sucre", "La Paz"],
    capitalAliases: ["Sucre", "La Paz"],
  },
  ZA: {
    capitals: ["Pretoria", "Cape Town", "Bloemfontein"],
    capitalAliases: ["Pretoria", "Cape Town", "Kappstaden", "Bloemfontein"],
  },
  SZ: {
    norwegianName: "Eswatini",
    aliases: ["Eswatini", "Swaziland"],
    capitals: ["Mbabane", "Lobamba"],
    capitalAliases: ["Mbabane", "Lobamba"],
  },
  PS: {
    norwegianName: "Palestina",
    capitals: ["Ramallah", "Øst-Jerusalem"],
    capitalAliases: ["Ramallah", "Øst-Jerusalem", "Øst Jerusalem", "East Jerusalem"],
    capitalNote: "Ramallah er administrativt sentrum; Øst-Jerusalem er oppgitt som hovedstad av palestinske myndigheter.",
  },
};

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.normalize("NFKD").toLocaleLowerCase("nb-NO");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function applyCountryOverrides(countries: Country[]): Country[] {
  return countries.map((country) => {
    const override = COUNTRY_OVERRIDES[country.cca2];
    if (!override) return country;
    return {
      ...country,
      ...override,
      aliases: unique([...(override.aliases || []), ...country.aliases]),
      capitalAliases: unique([...(override.capitalAliases || []), ...country.capitalAliases]),
    };
  });
}
