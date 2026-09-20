type TranslationTree = Record<string, unknown> | unknown[];

const EN_TECHNICAL_RESTORES: Array<[string, string]> = [
  ["Google Member ID (OAuth)", "Google Client ID (OAuth)"],
  ["Google Member ID", "Google Client ID"],
  ["Enter Member ID", "Enter Client ID"],
  ["Member Secret", "Client Secret"],
];

function replaceEnglishTerms(value: string): string {
  let result = value
    .replace(/\bPatients\b/g, "Members")
    .replace(/\bPatient\b/g, "Member")
    .replace(/\bpatients\b/g, "members")
    .replace(/\bpatient\b/g, "member")
    .replace(/\bClients\b/g, "Members")
    .replace(/\bClient\b/g, "Member")
    .replace(/\bclients\b/g, "members")
    .replace(/\bclient\b/g, "member");

  for (const [from, to] of EN_TECHNICAL_RESTORES) {
    result = result.replaceAll(from, to);
  }
  return result;
}

function replaceHungarianTerms(value: string): string {
  const replacements: Array<[string, string]> = [
    ["Pácienseink", "Tagjaink"], ["pácienseink", "tagjaink"],
    ["Páciensektől", "Tagoktól"], ["páciensektől", "tagoktól"],
    ["Pácienseknek", "Tagoknak"], ["pácienseknek", "tagoknak"],
    ["Páciensekkel", "Tagokkal"], ["páciensekkel", "tagokkal"],
    ["Páciensekről", "Tagokról"], ["páciensekről", "tagokról"],
    ["Páciensek", "Tagok"], ["páciensek", "tagok"],
    ["Pácienstől", "Tagtól"], ["pácienstől", "tagtól"],
    ["Páciensnek", "Tagnak"], ["páciensnek", "tagnak"],
    ["Pácienst", "Tagot"], ["pácienst", "tagot"],
    ["Pácienssel", "Taggal"], ["pácienssel", "taggal"],
    ["Páciense", "Tagja"], ["páciense", "tagja"],
    ["Páciens", "Tag"], ["páciens", "tag"],
    ["Betegeink", "Tagjaink"], ["betegeink", "tagjaink"],
    ["Betegektől", "Tagoktól"], ["betegektől", "tagoktól"],
    ["Betegeknek", "Tagoknak"], ["betegeknek", "tagoknak"],
    ["Betegekkel", "Tagokkal"], ["betegekkel", "tagokkal"],
    ["Betegek", "Tagok"], ["betegek", "tagok"],
    ["Betegtől", "Tagtól"], ["betegtől", "tagtól"],
    ["Betegnek", "Tagnak"], ["betegnek", "tagnak"],
    ["Beteget", "Tagot"], ["beteget", "tagot"],
    ["Beteggel", "Taggal"], ["beteggel", "taggal"],
    ["Beteg", "Tag"], ["beteg", "tag"],
    ["Ügyfeleink", "Tagjaink"], ["ügyfeleink", "tagjaink"],
    ["Ügyfelektől", "Tagoktól"], ["ügyfelektől", "tagoktól"],
    ["Ügyfeleknek", "Tagoknak"], ["ügyfeleknek", "tagoknak"],
    ["Ügyfelekkel", "Tagokkal"], ["ügyfelekkel", "tagokkal"],
    ["Ügyfelek", "Tagok"], ["ügyfelek", "tagok"],
    ["Ügyféltől", "Tagtól"], ["ügyféltől", "tagtól"],
    ["Ügyfélnek", "Tagnak"], ["ügyfélnek", "tagnak"],
    ["Ügyfelet", "Tagot"], ["ügyfelet", "tagot"],
    ["Ügyféllel", "Taggal"], ["ügyféllel", "taggal"],
  ];

  let result = value;
  for (const [from, to] of replacements) {
    result = result.replace(
      new RegExp(`(?<!\\w)${from}(?!\\w)`, "g"),
      to,
    );
  }
  result = result
    .replace(/(?<!\w)Ügyfél(?!\w)/g, "Tag")
    .replace(/(?<!\w)ügyfél(?!\w)/g, "tag");
  return result;
}

function replacePersianTerms(value: string): string {
  let result = value;
  for (const [from, to] of [
    ["مراجعین", "اعضا"],
    ["مراجعان", "اعضا"],
    ["بیماران", "اعضا"],
    ["مشتریان", "اعضا"],
    ["مراجع", "عضو"],
    ["بیمار", "عضو"],
    ["مشتری", "عضو"],
  ]) {
    result = result
      .replace(new RegExp(`(?<![\\u0600-\\u06ff])${from}(?![\\u0600-\\u06ff])`, "g"), to);
  }
  return result;
}

export function normalizeMemberTerminology(value: string, language = "en"): string {
  if (language.startsWith("hu")) return replaceHungarianTerms(value);
  if (language.startsWith("fa")) return replacePersianTerms(value);
  return replaceEnglishTerms(value);
}

export function normalizeTranslationTree<T extends TranslationTree>(
  tree: T,
  language: string,
): T {
  if (typeof tree === "string") {
    return normalizeMemberTerminology(tree, language) as unknown as T;
  }
  if (Array.isArray(tree)) {
    return tree.map((item) => normalizeTranslationTree(item as TranslationTree, language)) as T;
  }
  return Object.fromEntries(
    Object.entries(tree).map(([key, child]) => [
      key,
      typeof child === "string"
        ? normalizeMemberTerminology(child, language)
        : normalizeTranslationTree(child as TranslationTree, language),
    ]),
  ) as T;
}

export const memberTerminologyPostProcessor = {
  type: "postProcessor" as const,
  name: "memberTerminology",
  process(value: string, _key: string, options: { lng?: string }): string {
    return normalizeMemberTerminology(value, options?.lng ?? "en");
  },
};