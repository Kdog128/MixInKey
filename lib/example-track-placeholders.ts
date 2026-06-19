export interface ExampleTrackPlaceholder {
  title: string;
  artist: string;
}

export const EXAMPLE_TRACK_POOL: readonly ExampleTrackPlaceholder[] = [
  { title: "Summer", artist: "Calvin Harris" },
  { title: "One Kiss", artist: "Calvin Harris" },
  { title: "Clarity", artist: "Zedd" },
  { title: "Beautiful Now", artist: "Zedd" },
  { title: "Bangarang", artist: "Skrillex" },
  { title: "Rumble", artist: "Skrillex" },
  { title: "This Rhythm", artist: "Prospa" },
  { title: "Baby", artist: "Prospa" },
  { title: "Comes and Goes", artist: "Kettama" },
  { title: "Yosemite", artist: "Kettama" },
  { title: "You Were Right", artist: "RÜFÜS DU SOL" },
  { title: "Innerbloom", artist: "RÜFÜS DU SOL" },
  { title: "Move", artist: "Adam Port" },
  { title: "Positions", artist: "Adam Port" },
  { title: "Take It", artist: "Dom Dolla" },
  { title: "Rhyme Dust", artist: "Dom Dolla" },
  { title: "Where You Are", artist: "John Summit" },
  { title: "Don't Believe It", artist: "John Summit" },
  { title: "Titanium", artist: "David Guetta" },
  { title: "Memories", artist: "David Guetta" },
  { title: "Tell Me", artist: "Sonny Fodera" },
  { title: "Turn Back Time", artist: "Sonny Fodera" },
  { title: "Losing It", artist: "FISHER" },
  { title: "Rain", artist: "FISHER" },
  { title: "Favour", artist: "FISHER" },
  { title: "Hypnotized", artist: "Anyma" },
  { title: "Pictures of You", artist: "Anyma" },
  { title: "Voices In My Head", artist: "Anyma" },
  { title: "Red Lights", artist: "Tiësto" },
  { title: "Adagio for Strings", artist: "Tiësto" },
  { title: "The Business", artist: "Tiësto" },
  { title: "Places to Be", artist: "Fred Again.." },
  { title: "Victory Lap", artist: "Fred Again.." },
  { title: "Marea (We've Lost Dancing)", artist: "Fred Again.." },
  { title: "Jungle", artist: "Fred Again.." },
  { title: "Winny", artist: "Fred Again.." },
  { title: "Middle", artist: "DJ Snake" },
  { title: "Lean On", artist: "DJ Snake" },
  { title: "Let Me Love You", artist: "DJ Snake" },
  { title: "Heroes (We Could Be)", artist: "Alesso" },
  { title: "Calling (Lose My Mind)", artist: "Alesso" },
  { title: "The Less I Know The Better", artist: "Mau P" },
  { title: "Like I Like It", artist: "Mau P" },
  { title: "Desire", artist: "Chris Stussy" },
  { title: "All Night Long", artist: "Chris Stussy" },
  { title: "Doin' It", artist: "Silva Bumpa" },
  { title: "On 2Nite", artist: "Silva Bumpa" },
  { title: "Turn of the Lights", artist: "Chris Lake" },
  { title: "Ease My Mind", artist: "Chris Lake" },
  { title: "In the Yuma", artist: "Chris Lake" },
  { title: "(It Goes Like) Nanana", artist: "Peggy Gou" },
  { title: "Starry Night", artist: "Peggy Gou" },
];

function sameExampleTrack(
  a: ExampleTrackPlaceholder,
  b: ExampleTrackPlaceholder
): boolean {
  return a.title === b.title && a.artist === b.artist;
}

export function pickExampleTrack(
  exclude?: ExampleTrackPlaceholder
): ExampleTrackPlaceholder {
  const tracks = EXAMPLE_TRACK_POOL;
  for (let attempt = 0; attempt < 24; attempt++) {
    const index = Math.floor(Math.random() * tracks.length);
    const track = tracks[index];
    if (exclude && sameExampleTrack(track, exclude)) continue;
    return track;
  }
  return tracks[0];
}
