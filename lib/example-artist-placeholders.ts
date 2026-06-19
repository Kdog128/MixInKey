export const EXAMPLE_ARTIST_POOL = [
  "Calvin Harris",
  "Zedd",
  "Skrillex",
  "Prospa",
  "Kettama",
  "RÜFÜS DU SOL",
  "Adam Port",
  "Dom Dolla",
  "John Summit",
  "David Guetta",
  "Sonny Fodera",
  "FISHER",
  "Anyma",
  "Tiësto",
  "Fred Again..",
  "DJ Snake",
  "Alesso",
  "Mau P",
  "Chris Stussy",
  "Silva Bumpa",
  "Chris Lake",
  "Peggy Gou",
] as const;

export const PLACEHOLDER_ROTATE_MS = 7500;

export const DEFAULT_EXAMPLE_ARTIST_PAIR: [string, string] = [
  EXAMPLE_ARTIST_POOL[0],
  EXAMPLE_ARTIST_POOL[1],
];

export const DEFAULT_EXAMPLE_ARTIST = EXAMPLE_ARTIST_POOL[0];

export function pickExampleArtistPair(
  exclude?: readonly [string, string]
): [string, string] {
  const artists = EXAMPLE_ARTIST_POOL;
  for (let attempt = 0; attempt < 24; attempt++) {
    const firstIndex = Math.floor(Math.random() * artists.length);
    let secondIndex = Math.floor(Math.random() * artists.length);
    if (secondIndex === firstIndex) {
      secondIndex = (secondIndex + 1) % artists.length;
    }
    const pair: [string, string] = [artists[firstIndex], artists[secondIndex]];
    if (exclude && pair[0] === exclude[0] && pair[1] === exclude[1]) continue;
    return pair;
  }
  return [artists[0], artists[1]];
}

export function pickExampleArtist(exclude?: string): string {
  const artists = EXAMPLE_ARTIST_POOL;
  for (let attempt = 0; attempt < 24; attempt++) {
    const index = Math.floor(Math.random() * artists.length);
    const name = artists[index];
    if (exclude && name === exclude) continue;
    return name;
  }
  return artists[0];
}
