export type CosmeticKind = 'felt' | 'back' | 'pet';

export interface Cosmetic {
  id: string;
  kind: CosmeticKind;
  name: string;
  price: number;
  colors?: [string, string];
  emoji?: string;
  blurb?: string;
}

export const COSMETICS: Cosmetic[] = [
  { id: 'felt-forest', kind: 'felt', name: 'Forest Felt', price: 0, colors: ['#4a9a74', '#2c6b50'] },
  { id: 'felt-teal', kind: 'felt', name: 'Lagoon', price: 120, colors: ['#3a9e98', '#1f6965'] },
  { id: 'felt-midnight', kind: 'felt', name: 'Midnight Blue', price: 120, colors: ['#3f63a3', '#223d70'] },
  { id: 'felt-burgundy', kind: 'felt', name: 'Burgundy Velvet', price: 150, colors: ['#a3485a', '#6e2533'] },
  { id: 'felt-autumn', kind: 'felt', name: 'Autumn Rust', price: 150, colors: ['#c27442', '#8a4524'] },
  { id: 'felt-lavender', kind: 'felt', name: 'Lavender Field', price: 180, colors: ['#927fc2', '#5f4d8f'] },
  { id: 'back-plaid', kind: 'back', name: 'Cabin Plaid', price: 0 },
  { id: 'back-leaves', kind: 'back', name: 'Falling Leaves', price: 80 },
  { id: 'back-stars', kind: 'back', name: 'Starry Night', price: 80 },
  { id: 'back-hearts', kind: 'back', name: 'Knitted Hearts', price: 100 },
  { id: 'pet-cat', kind: 'pet', name: 'Biscuit the Cat', emoji: '🐈', price: 0, blurb: 'Naps on the felt. Purrs at good folds.' },
  { id: 'pet-dog', kind: 'pet', name: 'Waffles the Pup', emoji: '🐕', price: 100, blurb: 'Wags at every value bet.' },
  { id: 'pet-hedgehog', kind: 'pet', name: 'Pip the Hedgehog', emoji: '🦔', price: 140, blurb: 'Prickly about bad bluffs.' },
  { id: 'pet-frog', kind: 'pet', name: 'Moss the Frog', emoji: '🐸', price: 140, blurb: 'Ribbits at thin value.' },
  { id: 'pet-penguin', kind: 'pet', name: 'Sir Waddles', emoji: '🐧', price: 180, blurb: 'Very formal about MDF.' },
  { id: 'pet-dragon', kind: 'pet', name: 'Ember the Dragon', emoji: '🐉', price: 400, blurb: 'Guards your chip stack. Loves all-ins.' },
];

export const cosmeticById = (id: string): Cosmetic | undefined => COSMETICS.find((c) => c.id === id);
